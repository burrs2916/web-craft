use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// 单条命令审计记录
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandAuditRecord {
    /// 记录 ID（时间戳 + 随机数）
    pub id: String,
    /// 会话 ID
    pub session_id: String,
    /// Agent ID（如果有）
    pub agent_id: Option<String>,
    /// 执行的命令
    pub command: String,
    /// 命令类型：exec / write / file_read / file_write
    pub command_type: String,
    /// 是否需要 sudo
    pub requires_sudo: bool,
    /// 是否成功
    pub success: bool,
    /// 退出码（如果有）
    pub exit_code: Option<i32>,
    /// 输出摘要（前 500 字符）
    pub output_summary: Option<String>,
    /// 错误信息（失败时）
    pub error: Option<String>,
    /// 执行耗时（毫秒）
    pub duration_ms: u64,
    /// 时间戳
    pub timestamp: i64,
    /// 风险等级
    pub risk_level: Option<String>,
}

/// 命令审计日志
pub struct CommandAuditLog {
    base_dir: PathBuf,
    /// 内存中的近期记录（最近 100 条）
    recent_records: Mutex<Vec<CommandAuditRecord>>,
    max_recent: usize,
}

impl CommandAuditLog {
    pub fn new(base_dir: PathBuf) -> Self {
        let audit_dir = base_dir.join("audit");
        let _ = fs::create_dir_all(&audit_dir);
        CommandAuditLog {
            base_dir,
            recent_records: Mutex::new(Vec::with_capacity(100)),
            max_recent: 100,
        }
    }

    fn audit_dir(&self) -> PathBuf {
        self.base_dir.join("audit")
    }

    /// 按日期生成日志文件路径
    fn log_file_path(&self) -> PathBuf {
        let now = chrono::Local::now();
        let filename = format!("commands_{}.jsonl", now.format("%Y%m%d"));
        self.audit_dir().join(filename)
    }

    /// 记录一条命令审计
    pub fn record(&self, record: CommandAuditRecord) {
        // 写入内存缓存
        {
            let mut recent = match self.recent_records.lock() {
                Ok(g) => g,
                Err(_) => return,
            };
            recent.push(record.clone());
            if recent.len() > self.max_recent {
                recent.remove(0);
            }
        }

        // 追加写入文件（JSONL 格式）
        let log_file = self.log_file_path();
        if let Ok(json_line) = serde_json::to_string(&record) {
            if let Ok(mut file) = OpenOptions::new()
                .create(true)
                .append(true)
                .open(&log_file)
            {
                let _ = writeln!(file, "{}", json_line);
            }
        }
    }

    /// 获取近期记录
    pub fn recent(&self, limit: usize) -> Vec<CommandAuditRecord> {
        let recent = match self.recent_records.lock() {
            Ok(g) => g.clone(),
            Err(_) => return Vec::new(),
        };
        let limit = limit.min(recent.len());
        recent[recent.len() - limit..].to_vec()
    }

    /// 统计信息
    pub fn stats(&self) -> AuditStats {
        let recent = match self.recent_records.lock() {
            Ok(g) => g.clone(),
            Err(_) => {
                return AuditStats {
                    total_commands: 0,
                    success_count: 0,
                    failed_count: 0,
                    sudo_count: 0,
                    avg_duration_ms: 0,
                };
            }
        };

        let total = recent.len();
        let success = recent.iter().filter(|r| r.success).count();
        let failed = total - success;
        let sudo_count = recent.iter().filter(|r| r.requires_sudo).count();
        let avg_duration = if total > 0 {
            recent.iter().map(|r| r.duration_ms).sum::<u64>() / total as u64
        } else {
            0
        };

        AuditStats {
            total_commands: total,
            success_count: success,
            failed_count: failed,
            sudo_count,
            avg_duration_ms: avg_duration,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditStats {
    pub total_commands: usize,
    pub success_count: usize,
    pub failed_count: usize,
    pub sudo_count: usize,
    pub avg_duration_ms: u64,
}

/// 检测命令是否包含 sudo
pub fn contains_sudo(command: &str) -> bool {
    let trimmed = command.trim();
    trimmed.starts_with("sudo ")
        || trimmed.starts_with("sudo\t")
        || trimmed.contains("&& sudo ")
        || trimmed.contains("; sudo ")
        || trimmed.contains("| sudo ")
}

/// 生成记录 ID
pub fn generate_record_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("cmd_{}", nanos)
}
