use async_trait::async_trait;
use serde_json::{Value, json};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex as TokioMutex;

use crate::app::terminal_service::TerminalService;
use crate::infra::logging::debug_log;
use super::engine::{AgentTool, ToolOutput};
use super::command_audit::{CommandAuditLog, CommandAuditRecord, contains_sudo, generate_record_id};

/// read_output 轮询状态跟踪，用于检测死循环并自动退避
#[derive(Clone)]
struct ReadPollState {
    /// 上次输出的指纹（简单 hash）
    last_fingerprint: u64,
    /// 连续相同输出的次数
    consecutive_same: u32,
    /// 最后一次 read 的时间
    last_read_at: Instant,
}

impl ReadPollState {
    fn new() -> Self {
        ReadPollState {
            last_fingerprint: 0,
            consecutive_same: 0,
            last_read_at: Instant::now(),
        }
    }
}

pub struct TerminalSessionTool {
    terminal: Arc<TerminalService>,
    /// 每个 session 的操作锁，确保同一 session 的写操作（write/exec/file操作）串行化
    /// 防止并发写入同一个 PTY 导致输出交叉和结束标记匹配失败
    session_locks: TokioMutex<HashMap<String, Arc<TokioMutex<()>>>>,
    /// Agent ID，用于会话隔离。为 None 时表示全局访问（向后兼容）
    agent_id: Option<String>,
    /// 命令审计日志
    audit_log: Option<Arc<CommandAuditLog>>,
    /// read_output 轮询状态，用于检测死循环并自动退避
    read_poll_states: TokioMutex<HashMap<String, ReadPollState>>,
}

impl TerminalSessionTool {
    pub fn new(terminal: Arc<TerminalService>) -> Self {
        TerminalSessionTool {
            terminal,
            session_locks: TokioMutex::new(HashMap::new()),
            agent_id: None,
            audit_log: None,
            read_poll_states: TokioMutex::new(HashMap::new()),
        }
    }

    /// 设置 Agent ID，启用会话隔离
    pub fn with_agent_id(mut self, agent_id: String) -> Self {
        self.agent_id = Some(agent_id);
        self
    }

    /// 设置命令审计日志
    pub fn with_audit_log(mut self, audit_log: Arc<CommandAuditLog>) -> Self {
        self.audit_log = Some(audit_log);
        self
    }

    /// Agent 私有会话前缀
    fn agent_prefix(&self) -> Option<String> {
        self.agent_id.as_ref().map(|id| format!("agt_{}_", id))
    }

    /// 解析实际的 session_id
    /// - 以 "private:" 开头 → agent 私有会话，加上 agent 前缀
    /// - 以 "global:" 开头 → 去掉前缀，访问全局会话
    /// - 其他情况 → 保持原样（共享/全局会话，向后兼容）
    fn resolve_session_id(&self, session_id: &str) -> String {
        if let Some(stripped) = session_id.strip_prefix("global:") {
            return stripped.to_string();
        }
        if let Some(stripped) = session_id.strip_prefix("private:") {
            if let Some(prefix) = self.agent_prefix() {
                return format!("{}{}", prefix, stripped);
            }
            // 没有 agent_id 时，private: 退化为全局
            return stripped.to_string();
        }
        // 默认：保持原样（向后兼容）
        session_id.to_string()
    }

    /// 判断会话是否属于当前 agent（即带有 agent 前缀）
    fn is_owned_session(&self, real_session_id: &str) -> bool {
        match self.agent_prefix() {
            Some(prefix) => real_session_id.starts_with(&prefix),
            None => false, // 全局模式下没有"私有"会话
        }
    }

    /// 获取指定 session 的互斥锁（不存在则创建）
    async fn get_session_lock(&self, session_id: &str) -> Arc<TokioMutex<()>> {
        let mut locks = self.session_locks.lock().await;
        if let Some(lock) = locks.get(session_id) {
            lock.clone()
        } else {
            let lock = Arc::new(TokioMutex::new(()));
            locks.insert(session_id.to_string(), lock.clone());
            lock
        }
    }

    /// 记录命令审计日志
    fn record_audit(
        &self,
        session_id: &str,
        command: &str,
        command_type: &str,
        success: bool,
        exit_code: Option<i32>,
        output_summary: Option<String>,
        error: Option<String>,
        duration_ms: u64,
        risk_level: Option<String>,
    ) {
        if let Some(ref audit) = self.audit_log {
            let record = CommandAuditRecord {
                id: generate_record_id(),
                session_id: session_id.to_string(),
                agent_id: self.agent_id.clone(),
                command: command.to_string(),
                command_type: command_type.to_string(),
                requires_sudo: contains_sudo(command),
                success,
                exit_code,
                output_summary: output_summary.map(|s| {
                    if s.len() > 500 {
                        s.chars().take(500).collect()
                    } else {
                        s
                    }
                }),
                error,
                duration_ms,
                timestamp: chrono::Utc::now().timestamp(),
                risk_level,
            };
            audit.record(record);
        }
    }

    /// 简单的 FNV-1a hash，用于快速比较输出内容是否变化
    fn fnv1a_hash(input: &str) -> u64 {
        let mut hash: u64 = 0xcbf29ce484222325;
        for byte in input.as_bytes() {
            hash ^= *byte as u64;
            hash = hash.wrapping_mul(0x100000001b3);
        }
        hash
    }

    /// 移除 ANSI 转义序列（颜色、光标控制等），让 AI agent 更容易解析输出。
    fn strip_ansi_escapes(input: &str) -> String {
        let mut result = String::with_capacity(input.len());
        let bytes = input.as_bytes();
        let mut i = 0;
        while i < bytes.len() {
            if bytes[i] == 0x1b && i + 1 < bytes.len() && bytes[i + 1] == b'[' {
                // CSI 序列: ESC [ ... byte
                i += 2;
                while i < bytes.len() {
                    let b = bytes[i];
                    i += 1;
                    // CSI 序列以 0x40-0x7E 范围内的字节结束
                    if (0x40..=0x7E).contains(&b) {
                        break;
                    }
                }
            } else if bytes[i] == 0x1b && i + 1 < bytes.len() {
                // 其他 ESC 序列: ESC 后跟一个字节
                i += 2;
            } else if bytes[i] == 0x0d {
                // 回车符：如果后面跟换行就跳过回车
                if i + 1 < bytes.len() && bytes[i + 1] == 0x0a {
                    i += 1;
                    result.push('\n');
                } else {
                    result.push('\n');
                    i += 1;
                }
            } else if bytes[i] == 0x07 {
                // BEL 响铃：跳过
                i += 1;
            } else if bytes[i] == 0x08 {
                // BS 退格：移除前一个字符
                result.pop();
                i += 1;
            } else {
                result.push(bytes[i] as char);
                i += 1;
            }
        }
        result
    }
}

#[async_trait]
impl AgentTool for TerminalSessionTool {
    fn name(&self) -> &str {
        "terminal_session"
    }

    fn description(&self) -> &str {
        "Interact with active terminal sessions: run commands, read output, manage files. Use 'exec' for reliable single-command execution with exit code. Use 'write' + 'read_output' for interactive sessions. Use 'file_read'/'file_write' for safe file operations."
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["write", "read_output", "list_sessions", "exec", "file_read", "file_write"],
                    "description": "Action: 'write' send text to terminal, 'read_output' get recent output, 'list_sessions' list active sessions, 'exec' run a command and wait for completion (returns exit code), 'file_read' read a remote file, 'file_write' write to a remote file (with backup)"
                },
                "session_id": {
                    "type": "string",
                    "description": "Terminal session ID (required for most actions)"
                },
                "command": {
                    "type": "string",
                    "description": "Command to execute (for 'write' and 'exec' actions)"
                },
                "lines": {
                    "type": "number",
                    "description": "Number of recent output lines to read (default: 50, max: 200, for 'read_output')"
                },
                "timeout": {
                    "type": "number",
                    "description": "Timeout in seconds for 'exec' action (default: 60, max: 300)"
                },
                "path": {
                    "type": "string",
                    "description": "Remote file path (for 'file_read' and 'file_write' actions)"
                },
                "content": {
                    "type": "string",
                    "description": "Content to write (for 'file_write' action)"
                },
                "backup": {
                    "type": "boolean",
                    "description": "Whether to backup the file before writing (default: true, for 'file_write')"
                }
            },
            "required": ["action"]
        })
    }

    fn category(&self) -> &str {
        "exec"
    }

    fn risk_level(&self, params: &Value) -> super::permission::ToolRiskLevel {
        use super::permission::{classify_command_risk, ToolRiskLevel};
        let action = params["action"].as_str().unwrap_or("");
        match action {
            "write" | "exec" => {
                let command = params["command"].as_str().unwrap_or("");
                classify_command_risk(command)
            }
            "read_output" | "list_sessions" | "file_read" => ToolRiskLevel::Informational,
            "file_write" => {
                // 写文件：Moderate（有备份）
                let backup = params["backup"].as_bool().unwrap_or(true);
                if backup {
                    ToolRiskLevel::Moderate
                } else {
                    ToolRiskLevel::High
                }
            }
            _ => ToolRiskLevel::High,
        }
    }

    fn permission_description(&self, params: &Value) -> String {
        let action = params["action"].as_str().unwrap_or("unknown");
        match action {
            "write" => {
                let command = params["command"].as_str().unwrap_or("<command>");
                format!("Write to terminal: {}", command)
            }
            "exec" => {
                let command = params["command"].as_str().unwrap_or("<command>");
                format!("Execute command: {}", command)
            }
            "read_output" => "Read terminal output".to_string(),
            "list_sessions" => "List terminal sessions".to_string(),
            "file_read" => {
                let path = params["path"].as_str().unwrap_or("<path>");
                format!("Read remote file: {}", path)
            }
            "file_write" => {
                let path = params["path"].as_str().unwrap_or("<path>");
                let backup = params["backup"].as_bool().unwrap_or(true);
                format!("Write remote file: {} (backup: {})", path, if backup { "yes" } else { "no" })
            }
            _ => format!("Terminal session: {}", action),
        }
    }

    async fn execute(&self, mut params: Value) -> Result<ToolOutput, String> {
        let action = params["action"].as_str()
            .ok_or_else(|| "Missing 'action' parameter".to_string())?
            .to_string();

        let call_id = format!("ts-{}", chrono::Local::now().format("%H%M%S%3f"));
        let session_preview = params.get("session_id").and_then(|v| v.as_str()).unwrap_or("-");
        debug_log::env_ops("DEBUG", &call_id, "terminal_tool", "call_start",
            &format!("action={} session_id={}", action, session_preview));

        // 解析 session_id（如果有），应用 agent 命名空间隔离
        let needs_session = matches!(action.as_str(), "write" | "read_output" | "exec" | "file_read" | "file_write");
        if needs_session {
            if let Some(sid) = params["session_id"].as_str() {
                let resolved = self.resolve_session_id(sid);
                params["session_id"] = Value::String(resolved.clone());

                // 会话存活校验：不存活时直接返回明确错误，阻止模型反复重试
                // （比 PTY 层返回 "session not found" 更友好，且带有明确的「不要重试」指引）
                if !self.terminal.session_alive(&resolved) {
                    debug_log::env_ops("ERROR", &call_id, "terminal_tool", "session_dead",
                        &format!("action={} session_id={} rejected=true", action, resolved));
                    return Ok(ToolOutput {
                        success: false,
                        result: format!(
                            "ERROR: Terminal session '{}' is not available (disconnected or expired).\n\nDo NOT retry with the same session_id. The SSH connection has been lost. Tell the user to reopen the environment fix / deployment tool from the operations center to establish a fresh SSH session.",
                            resolved
                        ),
                        metadata: json!({ "error": "session_not_alive", "session_id": resolved }),
                    });
                }
                debug_log::env_ops("DEBUG", &call_id, "terminal_tool", "session_alive",
                    &format!("session_id={}", resolved));
            }
        }

        // 写操作（write/exec/file_read/file_write）需要获取 session 级锁，确保同一 session 的操作串行化
        // 只读操作（read_output/list_sessions）不需要加锁
        let needs_lock = matches!(action.as_str(), "write" | "exec" | "file_read" | "file_write");

        if needs_lock {
            let session_id = params["session_id"].as_str()
                .ok_or_else(|| "Missing 'session_id' parameter".to_string())?
                .to_string();
            let lock = self.get_session_lock(&session_id).await;
            let _guard = lock.lock().await;
            self.do_action(&action, params).await
        } else {
            self.do_action(&action, params).await
        }.map(|output| {
            debug_log::env_ops(if output.success { "DEBUG" } else { "WARN" }, &call_id, "terminal_tool", "call_done",
                &format!("action={} success={} result_len={}", action, output.success, output.result.len()));
            output
        }).map_err(|e| {
            debug_log::env_ops("ERROR", &call_id, "terminal_tool", "call_error",
                &format!("action={} error={}", action, debug_log::clamp(&e, 200)));
            e
        })
    }
}

impl TerminalSessionTool {
    async fn do_action(&self, action: &str, params: Value) -> Result<ToolOutput, String> {
        match action {
            "write" => self.action_write(&params).await,
            "read_output" => self.action_read_output(&params).await,
            "list_sessions" => self.action_list_sessions().await,
            "exec" => self.action_exec(&params).await,
            "file_read" => self.action_file_read(&params).await,
            "file_write" => self.action_file_write(&params).await,
            _ => Ok(ToolOutput {
                success: false,
                result: format!("Unknown action '{}'. Available: write, read_output, list_sessions, exec, file_read, file_write", action),
                metadata: Value::Null,
            }),
        }
    }
    /// 检测命令是否包含危险模式
    /// 返回 Some(description) 表示危险，None 表示安全
    fn check_dangerous_command(command: &str) -> Option<&'static str> {
        let cmd_lower = command.to_lowercase();

        let dangerous_patterns: &[(&str, &str)] = &[
            // ===== 毁灭性文件操作 =====
            ("rm -rf /", "递归删除根目录所有文件（系统级毁灭）"),
            ("rm -rf /*", "递归删除根目录所有文件（系统级毁灭）"),
            ("rm -rf ~ /", "同时删除家目录和根目录"),
            ("rm -rf /\t", "递归删除根目录（带制表符）"),
            // 注意：rm -rf 不带路径或带相对路径不拦截，由用户/AI 自行判断

            // ===== 磁盘操作 =====
            ("mkfs", "格式化磁盘（mkfs 系列命令）"),
            ("dd if=", "磁盘写入（dd 命令）"),
            ("> /dev/sd", "直接写入磁盘设备"),
            (">/dev/sd", "直接写入磁盘设备（无空格）"),
            ("cat /dev/zero >", "用零填充覆盖设备/文件"),
            (" /dev/null > ", "重定向到设备"),

            // ===== 逻辑炸弹/DoS =====
            (":(){ :|:&", "Fork 炸弹（耗尽系统进程）"),
            ("while true; do :", "无限循环 CPU 占用"),
            ("yes > /dev/null", "无限输出占用 CPU"),

            // ===== 系统破坏 =====
            ("chmod -R 777 /", "递归修改根目录权限为全局可写"),
            ("chown -R nobody /", "递归修改根目录所有者为 nobody"),
            ("mv / /dev/null", "将根目录移入 /dev/null"),
            ("rm /etc/passwd", "删除用户密码文件"),
            ("rm /etc/shadow", "删除影子密码文件"),
            ("rm /etc/sudoers", "删除 sudo 配置"),
            ("> /etc/passwd", "清空密码文件"),
            ("> /etc/shadow", "清空影子密码文件"),

            // ===== 网络攻击 =====
            ("hping3", "网络洪水攻击工具"),
            ("slowhttptest", "慢连接 DoS 攻击工具"),
            ("timeout 3600 yes", "长时间 yes 命令"),
        ];

        for (pattern, description) in dangerous_patterns {
            if cmd_lower.contains(pattern) {
                return Some(description);
            }
        }

        None
    }

    async fn action_write(&self, params: &Value) -> Result<ToolOutput, String> {
        let session_id = params["session_id"].as_str()
            .ok_or_else(|| "Missing 'session_id' parameter".to_string())?;
        let command = params["command"].as_str()
            .ok_or_else(|| "Missing 'command' parameter".to_string())?;

        // 危险命令检测
        if let Some(description) = Self::check_dangerous_command(command) {
            return Ok(ToolOutput {
                success: false,
                result: format!("Command blocked for safety: {}\nCommand: {}", description, command),
                metadata: json!({
                    "blocked": true,
                    "reason": description,
                }),
            });
        }

        let data = format!("{}\n", command);
        self.terminal.write(session_id, data.as_bytes())
            .map_err(|e| format!("Failed to write to session: {}", e))?;

        // 写入新命令后重置轮询状态（输出即将变化）
        {
            let mut states = self.read_poll_states.lock().await;
            states.remove(session_id);
        }

        Ok(ToolOutput {
            success: true,
            result: format!("Sent command to session '{}': {}", session_id, command),
            metadata: json!({
                "sessionId": session_id,
                "command": command,
            }),
        })
    }

    async fn action_read_output(&self, params: &Value) -> Result<ToolOutput, String> {
        let session_id = params["session_id"].as_str()
            .ok_or_else(|| "Missing 'session_id' parameter".to_string())?;

        let lines = params["lines"].as_i64()
            .unwrap_or(50)
            .min(200)
            .max(1) as usize;

        // ===== 轮询退避逻辑：检测连续相同输出，自动 sleep =====
        // 防止 Agent 在长耗时命令（如编译、下载）中疯狂轮询消耗 token
        let wait_ms = params["wait_ms"].as_i64().unwrap_or(0).max(0) as u64;
        let (consecutive_same, should_warn) = {
            let mut states = self.read_poll_states.lock().await;
            let state = states.entry(session_id.to_string())
                .or_insert_with(ReadPollState::new);
            let same = state.consecutive_same;
            // 连续 3 次以上相同输出时，在结果中加警告
            let warn = same >= 3;
            (same, warn)
        };

        // 连续相同输出时自动退避等待（指数退避，最多 5 秒）
        let auto_backoff_ms = if consecutive_same >= 2 {
            let base = 500u64; // 第 2 次 500ms
            let multiplier = 2u64.saturating_pow(consecutive_same.min(6) - 2); // 指数增长
            (base * multiplier).min(5000) // 上限 5 秒
        } else {
            0
        };
        let total_wait_ms = wait_ms.max(auto_backoff_ms);

        if total_wait_ms > 0 {
            tokio::time::sleep(Duration::from_millis(total_wait_ms)).await;
        }

        let output = self.terminal.get_output_buffer(session_id, lines)
            .map_err(|e| format!("Failed to read output: {}", e))?;

        // 清理 ANSI 转义序列，便于 AI 解析
        let clean_output = Self::strip_ansi_escapes(&output);

        // 计算输出指纹（简单 FNV hash），用于检测输出是否变化
        let fingerprint = Self::fnv1a_hash(&clean_output);

        // 更新轮询状态
        let (new_consecutive_same, output_changed) = {
            let mut states = self.read_poll_states.lock().await;
            let state = states.entry(session_id.to_string())
                .or_insert_with(ReadPollState::new);
            let changed = state.last_fingerprint != fingerprint && state.last_fingerprint != 0;
            if state.last_fingerprint == fingerprint && !clean_output.is_empty() {
                state.consecutive_same += 1;
            } else {
                state.consecutive_same = 0;
            }
            state.last_fingerprint = fingerprint;
            state.last_read_at = Instant::now();
            (state.consecutive_same, changed)
        };

        // 构造结果
        let mut result_text = if clean_output.is_empty() {
            format!("No output available for session '{}'", session_id)
        } else {
            let truncated = Self::truncate_output(&clean_output, 8000);
            format!("Output from session '{}' (last {} lines):\n{}", session_id, lines, truncated)
        };

        // 连续相同输出时，在结果末尾追加明确警告，引导 Agent 停止无效轮询
        if should_warn {
            result_text.push_str(&format!(
                "\n\n[SYSTEM NOTICE] Output has NOT changed after {} consecutive reads. \
                The command is still running (e.g. downloading, compiling, installing). \
                Do NOT keep calling read_output immediately — wait a few seconds or do other work. \
                Use read_output with `wait_ms` parameter to block-wait for new output.",
                new_consecutive_same
            ));
        }

        debug_log::env_ops(if should_warn { "WARN" } else { "DEBUG" },
            &format!("ts-{}", chrono::Local::now().format("%H%M%S%3f")),
            "terminal_tool", "read_poll",
            &format!("session_id={} output_len={} same_count={} changed={} wait_ms={} warned={}",
                session_id, clean_output.len(), new_consecutive_same, output_changed, total_wait_ms, should_warn));

        Ok(ToolOutput {
            success: true,
            result: result_text,
            metadata: json!({
                "sessionId": session_id,
                "lines": lines,
                "outputChanged": output_changed,
                "consecutiveSame": new_consecutive_same,
                "autoBackoffMs": auto_backoff_ms,
            }),
        })
    }

    async fn action_list_sessions(&self) -> Result<ToolOutput, String> {
        let sessions = self.terminal.list_sessions().map_err(|e| e.to_string())?;
        let prefix = self.agent_prefix();

        let mut owned: Vec<Value> = Vec::new();
        let mut shared: Vec<Value> = Vec::new();

        for s in &sessions {
            let is_owned = self.is_owned_session(s);
            let display_id = if let Some(ref pfx) = prefix {
                s.strip_prefix(pfx).unwrap_or(s).to_string()
            } else {
                s.clone()
            };

            let entry = json!({
                "id": display_id,
                "real_id": s,
                "is_owned": is_owned,
            });

            if is_owned {
                owned.push(entry);
            } else {
                shared.push(entry);
            }
        }

        let results: Vec<Value> = owned.into_iter().chain(shared.into_iter()).collect();

        Ok(ToolOutput {
            success: true,
            result: if results.is_empty() {
                "No active terminal sessions".to_string()
            } else {
                let lines: Vec<String> = results.iter().map(|r| {
                    let id = r["id"].as_str().unwrap_or("?");
                    let is_owned = r["is_owned"].as_bool().unwrap_or(false);
                    let tag = if is_owned { "[mine]" } else { "[shared]" };
                    format!("  {} {}", tag, id)
                }).collect();
                format!("Active sessions ({}):\n{}", results.len(), lines.join("\n"))
            },
            metadata: json!({ "results": results }),
        })
    }

    /// 智能截断输出：保留头部+尾部+关键行，删除中间冗余内容
    /// 比简单截断更能保留对 AI 判断有用的信息
    fn truncate_output(output: &str, max_chars: usize) -> String {
        let total_chars = output.chars().count();
        if total_chars <= max_chars {
            return output.to_string();
        }

        // 策略：35% 头部 + 35% 尾部 + 30% 关键行（从中间提取）
        let head_budget = max_chars * 35 / 100;
        let tail_budget = max_chars * 35 / 100;
        let key_budget = max_chars * 30 / 100;

        // 提取头部
        let head: String = output.chars().take(head_budget).collect();

        // 提取尾部
        let tail_start = total_chars.saturating_sub(tail_budget);
        let tail: String = output.chars().skip(tail_start).collect();

        // 从中间区域提取关键行（错误、警告、成功、失败等关键字）
        let middle_start = head_budget;
        let middle_end = tail_start;
        let middle: String = output.chars().skip(middle_start).take(middle_end - middle_start).collect();

        let key_lines = Self::extract_key_lines(&middle, key_budget);

        let mut result = String::with_capacity(max_chars + 200);
        result.push_str(&head);
        result.push_str("\n... [output truncated in middle] ...\n");
        if !key_lines.is_empty() {
            result.push_str("--- Key lines from middle ---\n");
            result.push_str(&key_lines);
            result.push_str("--- End key lines ---\n");
        }
        result.push_str(&tail);
        result.push_str(&format!("\n[truncated, {} characters total]", total_chars));

        result
    }

    /// 从文本中提取关键行（错误、警告、成功/失败标记等）
    /// 用于在截断时保留最重要的信息
    fn extract_key_lines(text: &str, max_chars: usize) -> String {
        let key_patterns = [
            // 错误类
            "error", "Error", "ERROR", "failed", "Failed", "FAILED",
            "fatal", "Fatal", "FATAL", "exception", "Exception", "EXCEPTION",
            "permission denied", "Permission denied", "not found", "Not Found",
            "EACCES", "ENOENT", "EPERM", "ECONNREFUSED", "ETIMEDOUT",
            // 警告类
            "warning", "Warning", "WARNING", "warn", "Warn", "WARN",
            "deprecated", "Deprecated", "DEPRECATED", "notice", "Notice",
            // 成功类
            "success", "Success", "SUCCESS", "done", "Done", "DONE",
            "installed", "Installed", "enabled", "Enabled",
            "started", "Started", "running", "Running", "active", "Active",
            // 状态类
            "Status:", "status:", "Exit code", "exit code", "return code",
            "OK", "FAIL", "PASS", "SKIP",
            // 包管理
            "Installing", "installing", "Upgrading", "upgrading",
            "Removing", "removing", "Setting up", "setting up",
            // 配置类
            "config", "Config", "CONFIG", "configuration", "Configuration",
            // 版本信息
            "version", "Version", "VERSION",
        ];

        let mut result = String::new();
        let mut remaining = max_chars;

        for line in text.lines() {
            let line_trimmed = line.trim();
            if line_trimmed.is_empty() {
                continue;
            }

            let is_key = key_patterns.iter().any(|p| line_trimmed.contains(p));
            if is_key {
                let line_len = line.chars().count() + 1; // +1 for newline
                if line_len > remaining {
                    // 这行放不下了，截断到能放的部分
                    let partial: String = line.chars().take(remaining.saturating_sub(3)).collect();
                    result.push_str(&partial);
                    result.push_str("...\n");
                    break;
                }
                result.push_str(line);
                result.push('\n');
                remaining -= line_len;
            }
        }

        result
    }

    /// 可靠执行单条命令：发送命令 → 等待完成 → 返回退出码+输出
    async fn action_exec(&self, params: &Value) -> Result<ToolOutput, String> {
        let session_id = params["session_id"].as_str()
            .ok_or_else(|| "Missing 'session_id' parameter".to_string())?;
        let command = params["command"].as_str()
            .ok_or_else(|| "Missing 'command' parameter".to_string())?;
        let timeout_secs = params["timeout"].as_i64()
            .unwrap_or(60)
            .min(300)
            .max(5) as u64;
        // 快速反馈窗口期：如果设置了，命令在窗口期内没完成就提前返回 still_running 状态
        // 用于避免短命令也触发长等待倒计时
        let quick_check_secs = params["quick_check_secs"].as_i64()
            .filter(|&v| v > 0 && v < timeout_secs as i64)
            .map(|v| v as u64);

        // 危险命令检测
        if let Some(description) = Self::check_dangerous_command(command) {
            return Ok(ToolOutput {
                success: false,
                result: format!("Command blocked for safety: {}\nCommand: {}", description, command),
                metadata: json!({
                    "blocked": true,
                    "reason": description,
                }),
            });
        }

        // 生成唯一的结束标记（避免与命令输出混淆）
        let marker = format!("__CMD_DONE_{}__", std::process::id());

        // 发送命令 + 退出码标记
        // 使用 printf 而不是 echo 避免换行问题
        let full_command = format!("{}; printf '{}%s' $?\n", command, marker);
        self.terminal.write(session_id, full_command.as_bytes())
            .map_err(|e| format!("Failed to write to session: {}", e))?;

        // 轮询等待命令完成
        let start = std::time::Instant::now();
        let poll_interval = std::time::Duration::from_millis(300);
        let mut collected_output = String::new();

        while start.elapsed().as_secs() < timeout_secs {
            tokio::time::sleep(poll_interval).await;

            let output = self.terminal.get_output_buffer(session_id, 500)
                .map_err(|e| format!("Failed to read output: {}", e))?;
            let clean = Self::strip_ansi_escapes(&output);

            // 检查是否出现结束标记
            if let Some(idx) = clean.find(&marker) {
                // 提取标记之前的输出（即命令的实际输出）
                let before_marker = &clean[..idx];
                // 标记后面紧跟的是退出码
                let after_marker = &clean[idx + marker.len()..];
                let exit_code_str = after_marker.lines().next().unwrap_or("").trim();
                let exit_code: i32 = exit_code_str.parse().unwrap_or(-1);

                // 清理：移除命令回显行（第一行通常是命令本身）
                let output_lines: Vec<&str> = before_marker.lines().collect();
                let actual_output = if !output_lines.is_empty() {
                    // 跳过第一行（命令回显），如果后面有内容的话
                    if output_lines.len() > 1 {
                        output_lines[1..].join("\n")
                    } else {
                        String::new()
                    }
                } else {
                    String::new()
                };

                let trimmed_output = Self::truncate_output(&actual_output, 8000);
                let duration = start.elapsed().as_millis() as u64;

                // 记录审计日志
                self.record_audit(
                    session_id,
                    command,
                    "exec",
                    exit_code == 0,
                    Some(exit_code),
                    Some(actual_output.clone()),
                    None,
                    duration,
                    None,
                );

                return Ok(ToolOutput {
                    success: exit_code == 0,
                    result: format!(
                        "Command exited with code {} ({}):\n{}",
                        exit_code,
                        if exit_code == 0 { "success" } else { "failed" },
                        if trimmed_output.is_empty() { "(no output)" } else { &trimmed_output }
                    ),
                    metadata: json!({
                        "sessionId": session_id,
                        "command": command,
                        "exitCode": exit_code,
                        "success": exit_code == 0,
                        "outputLength": actual_output.len(),
                        "durationMs": duration,
                    }),
                });
            }

            collected_output = clean;

            // 快速反馈窗口期检查：如果设置了 quick_check_secs 且已过窗口期但命令还在跑，
            // 提前返回 still_running 状态，让 AI 决定是否启动倒计时等待
            if let Some(qc_secs) = quick_check_secs {
                if start.elapsed().as_secs() >= qc_secs {
                    let partial = Self::truncate_output(&collected_output, 4000);
                    let duration = start.elapsed().as_millis() as u64;

                    tracing::debug!(
                        "[exec] quick_check reached, command still running, session={}, duration_ms={}",
                        session_id, duration
                    );

                    return Ok(ToolOutput {
                        success: false,
                        result: format!(
                            "Command still running after {}s (quick check). Partial output:\n{}\n\nNote: Use read_output to check final result later, or wait for the frontend countdown to finish.",
                            qc_secs, partial
                        ),
                        metadata: json!({
                            "sessionId": session_id,
                            "command": command,
                            "stillRunning": true,
                            "quickCheckSecs": qc_secs,
                            "durationMs": duration,
                            "outputLength": collected_output.len(),
                        }),
                    });
                }
            }
        }

        // 超时
        let partial = Self::truncate_output(&collected_output, 4000);
        let duration = start.elapsed().as_millis() as u64;

        // 记录审计日志（超时）
        self.record_audit(
            session_id,
            command,
            "exec",
            false,
            None,
            Some(collected_output),
            Some(format!("Command timed out after {}s", timeout_secs)),
            duration,
            None,
        );

        Ok(ToolOutput {
            success: false,
            result: format!("Command timed out after {}s. Partial output:\n{}", timeout_secs, partial),
            metadata: json!({
                "sessionId": session_id,
                "command": command,
                "timedOut": true,
                "timeout": timeout_secs,
                "durationMs": duration,
            }),
        })
    }

    /// 读取远程文件内容
    async fn action_file_read(&self, params: &Value) -> Result<ToolOutput, String> {
        let session_id = params["session_id"].as_str()
            .ok_or_else(|| "Missing 'session_id' parameter".to_string())?;
        let path = params["path"].as_str()
            .ok_or_else(|| "Missing 'path' parameter".to_string())?;

        // 用 cat 读取文件，通过 exec 获取可靠结果
        let exec_params = json!({
            "session_id": session_id,
            "command": format!("cat {}", shell_escape(path)),
            "timeout": 30,
        });
        let result = self.action_exec(&exec_params).await?;

        // 从 metadata 中提取信息
        let exit_code = result.metadata["exitCode"].as_i64().unwrap_or(-1);
        let success = result.metadata["success"].as_bool().unwrap_or(false);

        Ok(ToolOutput {
            success,
            result: if success {
                // 提取实际内容（去掉 exec 的前缀描述）
                // result.result 格式是 "Command exited with code 0 (success):\n<content>"
                let content = result.result
                    .splitn(3, '\n')
                    .nth(2)
                    .unwrap_or("")
                    .to_string();
                if content.is_empty() {
                    format!("File '{}' is empty or contains only whitespace.", path)
                } else {
                    content
                }
            } else {
                format!("Failed to read file '{}' (exit code {}).\n{}",
                    path, exit_code,
                    result.result.lines().nth(2).unwrap_or("Unknown error"))
            },
            metadata: json!({
                "sessionId": session_id,
                "path": path,
                "exitCode": exit_code,
            }),
        })
    }

    /// 写入远程文件（带自动备份）
    async fn action_file_write(&self, params: &Value) -> Result<ToolOutput, String> {
        let session_id = params["session_id"].as_str()
            .ok_or_else(|| "Missing 'session_id' parameter".to_string())?;
        let path = params["path"].as_str()
            .ok_or_else(|| "Missing 'path' parameter".to_string())?;
        let content = params["content"].as_str()
            .ok_or_else(|| "Missing 'content' parameter".to_string())?;
        let backup = params["backup"].as_bool().unwrap_or(true);

        let mut results: Vec<String> = Vec::new();

        // 1. 备份（如果需要）
        if backup {
            let backup_path = format!("{}.bak", path);
            let backup_cmd = format!(
                "if [ -f {} ]; then cp -p {} {} && echo 'BACKUP_CREATED'; else echo 'NO_BACKUP_NEEDED'; fi",
                shell_escape(path), shell_escape(path), shell_escape(&backup_path)
            );
            let backup_params = json!({
                "session_id": session_id,
                "command": backup_cmd,
                "timeout": 15,
            });
            let backup_result = self.action_exec(&backup_params).await?;
            if backup_result.metadata["success"].as_bool().unwrap_or(false) {
                if backup_result.result.contains("BACKUP_CREATED") {
                    results.push(format!("Backup created: {}", backup_path));
                } else {
                    results.push("No backup needed (file does not exist yet)".to_string());
                }
            } else {
                return Ok(ToolOutput {
                    success: false,
                    result: format!("Failed to create backup for '{}': {}", path, backup_result.result),
                    metadata: json!({ "sessionId": session_id, "path": path }),
                });
            }
        }

        // 2. 确保目录存在
        if let Some(parent) = parent_path(path) {
            let mkdir_cmd = format!("mkdir -p {}", shell_escape(parent));
            let mkdir_params = json!({
                "session_id": session_id,
                "command": mkdir_cmd,
                "timeout": 10,
            });
            let _ = self.action_exec(&mkdir_params).await;
        }

        // 3. 写入文件（使用 heredoc 避免转义问题）
        // 用唯一的 EOF 标记
        let heredoc_marker = "EOF_WRITE_7X9Z2K";
        let write_cmd = format!("cat > {} << '{}'\n{}\n{}",
            shell_escape(path), heredoc_marker, content, heredoc_marker);

        let write_params = json!({
            "session_id": session_id,
            "command": write_cmd,
            "timeout": 30,
        });
        let write_result = self.action_exec(&write_params).await?;
        let write_success = write_result.metadata["success"].as_bool().unwrap_or(false);

        if write_success {
            results.push(format!("File written successfully: {} ({} bytes)", path, content.len()));
        } else {
            results.push(format!("Failed to write file: {}",
                write_result.result.lines().nth(2).unwrap_or("unknown error")));
        }

        Ok(ToolOutput {
            success: write_success,
            result: results.join("\n"),
            metadata: json!({
                "sessionId": session_id,
                "path": path,
                "bytesWritten": content.len(),
                "backup": backup,
            }),
        })
    }
}

/// 简单的 shell 转义（单引号包裹，内部单引号转义）
fn shell_escape(s: &str) -> String {
    if s.is_empty() {
        return "''".to_string();
    }
    // 单引号转义：' → '\''
    let escaped = s.replace('\'', "'\\''");
    format!("'{}'", escaped)
}

/// 获取父目录路径
fn parent_path(path: &str) -> Option<&str> {
    let trimmed = path.trim_end_matches('/');
    if trimmed.is_empty() || trimmed == "/" {
        return None;
    }
    match trimmed.rfind('/') {
        Some(0) => Some("/"),
        Some(idx) => Some(&trimmed[..idx]),
        None => None,
    }
}
