use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// 单条修复经验
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepairExperience {
    /// 经验 ID
    pub id: String,
    /// 服务名称（如 "Nginx", "PostgreSQL", "Redis"）
    pub service: String,
    /// 问题类型（如 "install_failed", "service_not_starting", "config_error", "port_conflict"）
    pub problem_type: String,
    /// 问题描述
    pub problem_description: String,
    /// 发行版（如 "ubuntu", "centos", "arch"）
    pub distro: String,
    /// 包管理器
    pub package_manager: String,
    /// 修复结果
    pub outcome: RepairOutcome,
    /// 成功的修复方法（成功时必填）
    pub solution: Option<String>,
    /// 尝试过的方法（按顺序）
    pub attempts: Vec<AttemptRecord>,
    /// 关键错误信息
    pub key_errors: Vec<String>,
    /// 经验教训 / 注意事项
    pub lessons_learned: Option<String>,
    /// 创建时间戳
    pub created_at: i64,
    /// 标签（用于搜索）
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RepairOutcome {
    Success,
    Failed,
    Partial,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttemptRecord {
    pub method: String,
    pub command: String,
    pub success: bool,
    pub error: Option<String>,
}

/// 修复经验知识库
pub struct RepairKnowledgeBase {
    base_dir: PathBuf,
}

impl RepairKnowledgeBase {
    pub fn new(base_dir: PathBuf) -> Self {
        let kb_dir = base_dir.join("repair_kb");
        let _ = fs::create_dir_all(&kb_dir);
        RepairKnowledgeBase { base_dir }
    }

    fn kb_dir(&self) -> PathBuf {
        self.base_dir.join("repair_kb")
    }

    fn index_file(&self) -> PathBuf {
        self.kb_dir().join("index.json")
    }

    /// 保存一条修复经验
    pub fn save_experience(&self, experience: &RepairExperience) -> Result<(), String> {
        let kb_dir = self.kb_dir();

        // 按服务分类存储
        let service_dir = kb_dir.join(sanitize_filename(&experience.service));
        fs::create_dir_all(&service_dir)
            .map_err(|e| format!("Failed to create service dir: {}", e))?;

        let filename = format!("{}_{}.json",
            experience.id,
            sanitize_filename(&experience.problem_type));
        let file_path = service_dir.join(&filename);

        let json = serde_json::to_string_pretty(experience)
            .map_err(|e| format!("Failed to serialize experience: {}", e))?;
        fs::write(&file_path, json)
            .map_err(|e| format!("Failed to write experience: {}", e))?;

        // 更新索引
        self.update_index(experience)?;

        Ok(())
    }

    /// 搜索相关经验
    pub fn search(&self, service: &str, problem_keywords: &[&str], limit: usize) -> Vec<RepairExperience> {
        let mut results: Vec<(RepairExperience, usize)> = Vec::new();

        // 先在对应服务目录下找
        let service_dir = self.kb_dir().join(sanitize_filename(service));
        if service_dir.exists() {
            if let Ok(experiences) = load_experiences_from_dir(&service_dir) {
                for exp in experiences {
                    let score = calculate_relevance(&exp, service, problem_keywords);
                    if score > 0 {
                        results.push((exp, score));
                    }
                }
            }
        }

        // 如果不够，再从所有服务中找
        if results.len() < limit {
            if let Ok(entries) = fs::read_dir(self.kb_dir()) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() && path.file_name().and_then(|f| f.to_str()) != Some(sanitize_filename(service).as_str()) {
                        if let Ok(experiences) = load_experiences_from_dir(&path) {
                            for exp in experiences {
                                let score = calculate_relevance(&exp, service, problem_keywords);
                                if score > 0 {
                                    results.push((exp, score));
                                }
                            }
                        }
                    }
                }
            }
        }

        // 按相关度排序
        results.sort_by(|a, b| b.1.cmp(&a.1));

        results.into_iter()
            .take(limit)
            .map(|(exp, _)| exp)
            .collect()
    }

    /// 获取某服务的所有经验
    pub fn get_by_service(&self, service: &str) -> Vec<RepairExperience> {
        let service_dir = self.kb_dir().join(sanitize_filename(service));
        load_experiences_from_dir(&service_dir).unwrap_or_default()
    }

    /// 获取所有经验统计
    pub fn stats(&self) -> KnowledgeBaseStats {
        let mut total = 0;
        let mut success_count = 0;
        let mut services = std::collections::HashSet::new();

        if let Ok(entries) = fs::read_dir(self.kb_dir()) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    if let Some(service_name) = path.file_name().and_then(|f| f.to_str()) {
                        services.insert(service_name.to_string());
                    }
                    if let Ok(exps) = load_experiences_from_dir(&path) {
                        total += exps.len();
                        success_count += exps.iter()
                            .filter(|e| matches!(e.outcome, RepairOutcome::Success))
                            .count();
                    }
                }
            }
        }

        KnowledgeBaseStats {
            total_experiences: total,
            success_count,
            failed_count: total - success_count,
            services_count: services.len(),
        }
    }

    /// 生成经验 ID
    pub fn generate_id(&self) -> String {
        format!("exp_{}", chrono::Utc::now().format("%Y%m%d_%H%M%S"))
    }

    fn update_index(&self, experience: &RepairExperience) -> Result<(), String> {
        let mut index = self.load_index();

        // 检查是否已存在（更新模式）
        if let Some(pos) = index.iter().position(|i| i.id == experience.id) {
            index.remove(pos);
        }

        index.push(ExperienceIndexEntry {
            id: experience.id.clone(),
            service: experience.service.clone(),
            problem_type: experience.problem_type.clone(),
            outcome: experience.outcome,
            created_at: experience.created_at,
            tags: experience.tags.clone(),
        });

        // 按时间倒序
        index.sort_by(|a, b| b.created_at.cmp(&a.created_at));

        let json = serde_json::to_string_pretty(&index)
            .map_err(|e| format!("Failed to serialize index: {}", e))?;
        fs::write(self.index_file(), json)
            .map_err(|e| format!("Failed to write index: {}", e))?;

        Ok(())
    }

    fn load_index(&self) -> Vec<ExperienceIndexEntry> {
        if self.index_file().exists() {
            if let Ok(content) = fs::read_to_string(self.index_file()) {
                if let Ok(index) = serde_json::from_str::<Vec<ExperienceIndexEntry>>(&content) {
                    return index;
                }
            }
        }
        Vec::new()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ExperienceIndexEntry {
    id: String,
    service: String,
    problem_type: String,
    outcome: RepairOutcome,
    created_at: i64,
    tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct KnowledgeBaseStats {
    pub total_experiences: usize,
    pub success_count: usize,
    pub failed_count: usize,
    pub services_count: usize,
}

fn load_experiences_from_dir(dir: &Path) -> Result<Vec<RepairExperience>, String> {
    let mut results = Vec::new();
    if !dir.exists() || !dir.is_dir() {
        return Ok(results);
    }

    let entries = fs::read_dir(dir)
        .map_err(|e| format!("Failed to read dir: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(exp) = serde_json::from_str::<RepairExperience>(&content) {
                    results.push(exp);
                }
            }
        }
    }

    Ok(results)
}

fn calculate_relevance(exp: &RepairExperience, service: &str, keywords: &[&str]) -> usize {
    let mut score = 0;

    // 服务匹配：+10
    if exp.service.to_lowercase() == service.to_lowercase() {
        score += 10;
    }

    // 关键词匹配
    let text = format!("{} {} {} {} {}",
        exp.problem_description,
        exp.problem_type,
        exp.key_errors.join(" "),
        exp.tags.join(" "),
        exp.solution.clone().unwrap_or_default(),
    ).to_lowercase();

    for kw in keywords {
        if text.contains(&kw.to_lowercase()) {
            score += 3;
        }
    }

    // 成功经验权重略高
    if matches!(exp.outcome, RepairOutcome::Success) {
        score += 1;
    }

    score
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect()
}

/// 将修复经验格式化为提示词中可直接使用的文本
pub fn format_experiences_for_prompt(experiences: &[RepairExperience]) -> String {
    if experiences.is_empty() {
        return String::new();
    }

    let mut result = String::from("## 历史修复经验参考\n\n");
    result.push_str(&format!("找到 {} 条相关修复经验：\n\n", experiences.len()));

    for (i, exp) in experiences.iter().enumerate() {
        let outcome_str = match exp.outcome {
            RepairOutcome::Success => "✅ 成功",
            RepairOutcome::Failed => "❌ 失败",
            RepairOutcome::Partial => "⚠️ 部分成功",
        };

        result.push_str(&format!("### 经验 {}: {} - {} ({})\n\n",
            i + 1, exp.service, exp.problem_type, outcome_str));

        result.push_str(&format!("**问题**: {}\n\n", exp.problem_description));

        if !exp.key_errors.is_empty() {
            result.push_str(&format!("**关键错误**: {}\n\n", exp.key_errors.join("; ")));
        }

        if let Some(ref solution) = exp.solution {
            result.push_str(&format!("**解决方案**: {}\n\n", solution));
        }

        if !exp.attempts.is_empty() {
            result.push_str("**尝试记录**:\n");
            for attempt in &exp.attempts {
                let status = if attempt.success { "✅" } else { "❌" };
                result.push_str(&format!("- {} {}: {}\n", status, attempt.method, attempt.command));
                if let Some(ref err) = attempt.error {
                    result.push_str(&format!("  错误: {}\n", super::engine::truncate_bytes(err, 150)));
                }
            }
            result.push('\n');
        }

        if let Some(ref lessons) = exp.lessons_learned {
            result.push_str(&format!("**经验教训**: {}\n\n", lessons));
        }

        result.push_str("---\n\n");
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_filename() {
        assert_eq!(sanitize_filename("Nginx Web Server"), "Nginx_Web_Server");
        assert_eq!(sanitize_filename("mysql/mariadb"), "mysql_mariadb");
    }

    #[test]
    fn test_calculate_relevance() {
        let exp = RepairExperience {
            id: "test".into(),
            service: "Nginx".into(),
            problem_type: "install_failed".into(),
            problem_description: "apt install nginx failed with 404 error".into(),
            distro: "ubuntu".into(),
            package_manager: "apt".into(),
            outcome: RepairOutcome::Success,
            solution: Some("Run apt update first".into()),
            attempts: vec![],
            key_errors: vec!["404 Not Found".into()],
            lessons_learned: None,
            created_at: 0,
            tags: vec!["apt".into(), "404".into()],
        };

        assert_eq!(calculate_relevance(&exp, "Nginx", &["apt", "404"]), 17); // 10 + 3*2 + 1
        assert_eq!(calculate_relevance(&exp, "MySQL", &["apt"]), 4); // 3*1 + 1(成功权重)
        assert_eq!(calculate_relevance(&exp, "Nginx", &[]), 11); // 10 + 1
    }

    #[test]
    fn test_format_experiences_for_prompt() {
        let exp = RepairExperience {
            id: "test-1".into(),
            service: "Nginx".into(),
            problem_type: "install_failed".into(),
            problem_description: "Failed to install".into(),
            distro: "ubuntu".into(),
            package_manager: "apt".into(),
            outcome: RepairOutcome::Success,
            solution: Some("apt update then install".into()),
            attempts: vec![],
            key_errors: vec![],
            lessons_learned: None,
            created_at: 0,
            tags: vec![],
        };

        let formatted = format_experiences_for_prompt(&[exp]);
        assert!(formatted.contains("历史修复经验参考"));
        assert!(formatted.contains("Nginx"));
        assert!(formatted.contains("✅"));
    }
}
