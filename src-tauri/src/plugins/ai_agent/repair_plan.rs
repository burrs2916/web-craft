use serde::{Deserialize, Serialize};

/// 修复步骤状态
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StepStatus {
    /// 待执行
    Pending,
    /// 执行中
    Running,
    /// 成功
    Success,
    /// 失败
    Failed,
    /// 跳过
    Skipped,
}

impl StepStatus {
    pub fn as_str(&self) -> &str {
        match self {
            StepStatus::Pending => "pending",
            StepStatus::Running => "running",
            StepStatus::Success => "success",
            StepStatus::Failed => "failed",
            StepStatus::Skipped => "skipped",
        }
    }
}

/// 修复步骤优先级
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StepPriority {
    Critical = 0,
    High = 1,
    Medium = 2,
    Low = 3,
}

/// 单个修复步骤
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepairStep {
    /// 步骤序号（从 1 开始）
    pub index: u32,
    /// 服务/组件名称
    pub service: String,
    /// 简短描述
    pub description: String,
    /// 优先级
    pub priority: StepPriority,
    /// 当前状态
    pub status: StepStatus,
    /// 预估的修复命令（可选，用于权限预检查）
    pub estimated_commands: Vec<String>,
    /// 是否需要 sudo
    pub requires_sudo: bool,
    /// 失败原因（失败时填充）
    pub failure_reason: Option<String>,
    /// 尝试过的方法记录（用于复盘）
    pub attempts: Vec<RepairAttempt>,
    /// 执行输出（摘要）
    pub output_summary: Option<String>,
}

/// 一次修复尝试记录
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepairAttempt {
    /// 尝试序号
    pub attempt_no: u32,
    /// 使用的方法描述
    pub method: String,
    /// 执行的关键命令
    pub command: String,
    /// 是否成功
    pub success: bool,
    /// 错误信息（失败时）
    pub error: Option<String>,
}

/// 整体修复计划
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepairPlan {
    /// 计划 ID（通常用 agent_id）
    pub plan_id: String,
    /// 目标主机描述
    pub target: String,
    /// 发行版
    pub distro: Option<String>,
    /// 包管理器
    pub package_manager: Option<String>,
    /// 所有步骤
    pub steps: Vec<RepairStep>,
    /// 创建时间戳
    pub created_at: i64,
    /// 总步骤数
    pub total_steps: u32,
    /// 已完成步骤数
    pub completed_steps: u32,
    /// 失败步骤数
    pub failed_steps: u32,
}

impl RepairPlan {
    pub fn new(plan_id: String, target: String) -> Self {
        Self {
            plan_id,
            target,
            distro: None,
            package_manager: None,
            steps: Vec::new(),
            created_at: chrono::Utc::now().timestamp(),
            total_steps: 0,
            completed_steps: 0,
            failed_steps: 0,
        }
    }

    /// 添加步骤并更新计数
    pub fn add_step(&mut self, step: RepairStep) {
        self.steps.push(step);
        self.recalculate_counts();
    }

    /// 更新步骤状态
    pub fn update_step_status(&mut self, index: u32, status: StepStatus) {
        if let Some(step) = self.steps.iter_mut().find(|s| s.index == index) {
            step.status = status;
            self.recalculate_counts();
        }
    }

    /// 标记步骤失败并记录原因
    pub fn mark_step_failed(&mut self, index: u32, reason: String) {
        if let Some(step) = self.steps.iter_mut().find(|s| s.index == index) {
            step.status = StepStatus::Failed;
            step.failure_reason = Some(reason);
            self.recalculate_counts();
        }
    }

    /// 记录一次尝试
    pub fn add_attempt(&mut self, step_index: u32, attempt: RepairAttempt) {
        if let Some(step) = self.steps.iter_mut().find(|s| s.index == step_index) {
            step.attempts.push(attempt);
        }
    }

    fn recalculate_counts(&mut self) {
        self.total_steps = self.steps.len() as u32;
        self.completed_steps = self.steps.iter()
            .filter(|s| matches!(s.status, StepStatus::Success | StepStatus::Skipped))
            .count() as u32;
        self.failed_steps = self.steps.iter()
            .filter(|s| matches!(s.status, StepStatus::Failed))
            .count() as u32;
    }

    /// 获取进度百分比（0-100）
    pub fn progress_percent(&self) -> u32 {
        if self.total_steps == 0 {
            return 0;
        }
        let done = self.completed_steps + self.failed_steps;
        (done * 100) / self.total_steps
    }

    /// 是否全部完成（成功或失败都算完成）
    pub fn is_complete(&self) -> bool {
        self.completed_steps + self.failed_steps >= self.total_steps
    }

    /// 是否全部成功
    pub fn is_all_success(&self) -> bool {
        !self.steps.is_empty()
            && self.failed_steps == 0
            && self.completed_steps == self.total_steps
    }

    /// 生成失败复盘摘要
    pub fn failure_summary(&self) -> String {
        let failures: Vec<&RepairStep> = self.steps.iter()
            .filter(|s| matches!(s.status, StepStatus::Failed))
            .collect();

        if failures.is_empty() {
            return String::new();
        }

        let mut summary = format!("## 失败复盘（{} 项失败）\n\n", failures.len());
        for step in &failures {
            summary.push_str(&format!("### {}. {} - {}\n\n", step.index, step.service, step.description));
            summary.push_str(&format!("- **失败原因**: {}\n",
                step.failure_reason.as_deref().unwrap_or("未知")));

            if !step.attempts.is_empty() {
                summary.push_str("\n**尝试记录**:\n");
                for attempt in &step.attempts {
                    summary.push_str(&format!("  尝试 {}: {} - {}\n",
                        attempt.attempt_no,
                        attempt.method,
                        if attempt.success { "成功" } else { "失败" }));
                    if let Some(err) = &attempt.error {
                        summary.push_str(&format!("    错误: {}\n", super::engine::truncate_bytes(err, 200)));
                    }
                }
            }
            summary.push('\n');
        }
        summary
    }
}

/// 从 AI 输出文本中解析修复计划（从 JSON 代码块中提取）
///
/// 支持的格式：
/// - ```json
///   { "steps": [...] }
///   ```
/// - 文本中包含 `ENV_FIX_PLAN: {...}` 标记
pub fn parse_repair_plan_from_text(text: &str, plan_id: String, target: String) -> Option<RepairPlan> {
    // 方法1: 查找 ```json ... ``` 代码块
    let json_str = extract_json_block(text).or_else(|| extract_plan_marker(text))?;

    let parsed: serde_json::Value = serde_json::from_str(&json_str).ok()?;

    let mut plan = RepairPlan::new(plan_id, target);

    // 提取发行版信息
    plan.distro = parsed["distro"].as_str().map(|s| s.to_string());
    plan.package_manager = parsed["package_manager"].as_str().map(|s| s.to_string());

    // 提取步骤
    if let Some(steps_arr) = parsed["steps"].as_array() {
        for (i, step_val) in steps_arr.iter().enumerate() {
            let index = step_val["index"].as_u64().unwrap_or(i as u64 + 1) as u32;
            let service = step_val["service"].as_str()
                .or_else(|| step_val["name"].as_str())
                .unwrap_or("unknown")
                .to_string();
            let description = step_val["description"].as_str()
                .or_else(|| step_val["desc"].as_str())
                .unwrap_or("")
                .to_string();
            let priority = match step_val["priority"].as_str().unwrap_or("medium") {
                "critical" => StepPriority::Critical,
                "high" => StepPriority::High,
                "low" => StepPriority::Low,
                _ => StepPriority::Medium,
            };
            let requires_sudo = step_val["requires_sudo"].as_bool().unwrap_or(true);

            let estimated_commands = step_val["commands"].as_array()
                .or_else(|| step_val["estimated_commands"].as_array())
                .map(|arr| arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect())
                .unwrap_or_default();

            plan.add_step(RepairStep {
                index,
                service,
                description,
                priority,
                status: StepStatus::Pending,
                estimated_commands,
                requires_sudo,
                failure_reason: None,
                attempts: Vec::new(),
                output_summary: None,
            });
        }
    }

    if plan.steps.is_empty() {
        None
    } else {
        Some(plan)
    }
}

fn extract_json_block(text: &str) -> Option<String> {
    let patterns = ["```json", "```JSON", "```"];
    for pattern in &patterns {
        if let Some(start) = text.find(pattern) {
            let start_idx = start + pattern.len();
            // 跳过可能的换行
            let after = &text[start_idx..];
            let content_start = after.find('\n').map(|i| start_idx + i + 1).unwrap_or(start_idx);

            // 找结束的 ```
            if let Some(end) = text[content_start..].find("```") {
                let json_str = text[content_start..content_start + end].trim().to_string();
                // 验证是否是有效的 JSON（对象或数组）
                if json_str.starts_with('{') || json_str.starts_with('[') {
                    return Some(json_str);
                }
            }
        }
    }
    None
}

fn extract_plan_marker(text: &str) -> Option<String> {
    // 查找 ENV_FIX_PLAN: { ... } 格式
    if let Some(start) = text.find("ENV_FIX_PLAN:") {
        let after = &text[start + "ENV_FIX_PLAN:".len()..];
        // 找到第一个 {
        if let Some(brace_start) = after.find('{') {
            let json_start = start + "ENV_FIX_PLAN:".len() + brace_start;
            // 找匹配的 }
            let mut depth = 0;
            let mut end = json_start;
            for (i, c) in text[json_start..].char_indices() {
                match c {
                    '{' => depth += 1,
                    '}' => {
                        depth -= 1;
                        if depth == 0 {
                            end = json_start + i + 1;
                            break;
                        }
                    }
                    _ => {}
                }
            }
            if end > json_start {
                return Some(text[json_start..end].to_string());
            }
        }
    }
    None
}

/// 从 AI 输出中解析步骤进度标记（ENV_FIX_STEP）
pub fn parse_step_progress(text: &str) -> Vec<StepProgressEvent> {
    let mut events = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if !line.starts_with("ENV_FIX_STEP:") {
            continue;
        }

        let content = line["ENV_FIX_STEP:".len()..].trim();
        let parts: Vec<&str> = content.splitn(4, ' ').collect();
        if parts.len() < 3 {
            continue;
        }

        let action = parts[0]; // start / done
        let progress_str = parts[1]; // 1/3
        let service = parts[2].to_string();
        let extra = parts.get(3).map(|s| s.to_string());

        // 解析序号和总数
        let (index, total) = if let Some(slash_idx) = progress_str.find('/') {
            let idx = progress_str[..slash_idx].parse::<u32>().ok().unwrap_or(0);
            let tot = progress_str[slash_idx + 1..].parse::<u32>().ok().unwrap_or(0);
            (idx, tot)
        } else {
            (0, 0)
        };

        match action {
            "start" => {
                events.push(StepProgressEvent {
                    index,
                    total,
                    service,
                    status: StepStatus::Running,
                    description: extra.unwrap_or_default(),
                });
            }
            "done" => {
                let status_str = extra.as_deref().unwrap_or("success");
                let (status, reason) = if status_str.starts_with("success") {
                    (StepStatus::Success, None)
                } else if status_str.starts_with("failed") {
                    let reason = status_str.strip_prefix("failed ")
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| "失败".to_string());
                    (StepStatus::Failed, Some(reason))
                } else {
                    (StepStatus::Success, None)
                };

                events.push(StepProgressEvent {
                    index,
                    total,
                    service,
                    status,
                    description: reason.unwrap_or_default(),
                });
            }
            _ => {}
        }
    }
    events
}

/// 步骤进度事件
#[derive(Debug, Clone)]
pub struct StepProgressEvent {
    pub index: u32,
    pub total: u32,
    pub service: String,
    pub status: StepStatus,
    pub description: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_step_progress_start() {
        let text = "开始修复\nENV_FIX_STEP: start 1/3 Nginx 安装并启动 Nginx\n继续...";
        let events = parse_step_progress(text);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].index, 1);
        assert_eq!(events[0].total, 3);
        assert_eq!(events[0].service, "Nginx");
        assert!(matches!(events[0].status, StepStatus::Running));
    }

    #[test]
    fn test_parse_step_progress_done_success() {
        let text = "ENV_FIX_STEP: done 1/3 Nginx success";
        let events = parse_step_progress(text);
        assert_eq!(events.len(), 1);
        assert!(matches!(events[0].status, StepStatus::Success));
    }

    #[test]
    fn test_parse_step_progress_done_failed() {
        let text = "ENV_FIX_STEP: done 2/3 MySQL failed 包安装失败";
        let events = parse_step_progress(text);
        assert_eq!(events.len(), 1);
        assert!(matches!(events[0].status, StepStatus::Failed));
        assert_eq!(events[0].description, "包安装失败");
    }

    #[test]
    fn test_parse_repair_plan_json() {
        let text = r#"这是修复计划：

```json
{
  "distro": "Ubuntu 22.04",
  "package_manager": "apt-get",
  "steps": [
    {
      "index": 1,
      "service": "Nginx",
      "description": "安装并启动 Nginx",
      "priority": "critical",
      "requires_sudo": true,
      "commands": ["apt-get install nginx"]
    },
    {
      "index": 2,
      "service": "MySQL",
      "description": "安装 MariaDB",
      "priority": "high",
      "requires_sudo": true
    }
  ]
}
```

请确认。"#;

        let plan = parse_repair_plan_from_text(text, "test-1".to_string(), "test-host".to_string());
        assert!(plan.is_some());
        let plan = plan.unwrap();
        assert_eq!(plan.steps.len(), 2);
        assert_eq!(plan.distro.as_deref(), Some("Ubuntu 22.04"));
        assert_eq!(plan.steps[0].service, "Nginx");
        assert!(matches!(plan.steps[0].priority, StepPriority::Critical));
        assert_eq!(plan.total_steps, 2);
    }

    #[test]
    fn test_repair_plan_progress() {
        let mut plan = RepairPlan::new("test".to_string(), "host".to_string());
        plan.add_step(RepairStep {
            index: 1, service: "A".into(), description: "".into(),
            priority: StepPriority::High, status: StepStatus::Success,
            estimated_commands: vec![], requires_sudo: false,
            failure_reason: None, attempts: vec![], output_summary: None,
        });
        plan.add_step(RepairStep {
            index: 2, service: "B".into(), description: "".into(),
            priority: StepPriority::High, status: StepStatus::Failed,
            estimated_commands: vec![], requires_sudo: false,
            failure_reason: Some("err".into()), attempts: vec![], output_summary: None,
        });
        plan.add_step(RepairStep {
            index: 3, service: "C".into(), description: "".into(),
            priority: StepPriority::High, status: StepStatus::Pending,
            estimated_commands: vec![], requires_sudo: false,
            failure_reason: None, attempts: vec![], output_summary: None,
        });

        assert_eq!(plan.total_steps, 3);
        assert_eq!(plan.completed_steps, 1);
        assert_eq!(plan.failed_steps, 1);
        assert_eq!(plan.progress_percent(), 66);
        assert!(!plan.is_complete());
        assert!(!plan.is_all_success());
    }
}
