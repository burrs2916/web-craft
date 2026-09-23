use serde::{Deserialize, Serialize};

// ─── 权限模式 ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionMode {
    /// 全自动：所有工具调用都自动执行，不询问用户
    Auto,
    /// 低风险自动：Informational / Low / Moderate 自动执行，High 及以上需要确认
    LowRiskAuto,
    /// 标准确认：只确认 High 及以上风险，Informational / Low / Moderate 自动执行
    Confirm,
    /// 审慎模式：Moderate 及以上都需要确认
    Cautious,
    /// 偏执模式：所有工具调用都需要确认
    Paranoid,
}

impl Default for PermissionMode {
    fn default() -> Self {
        PermissionMode::Confirm
    }
}

impl std::fmt::Display for PermissionMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PermissionMode::Auto => write!(f, "auto"),
            PermissionMode::LowRiskAuto => write!(f, "low_risk_auto"),
            PermissionMode::Confirm => write!(f, "confirm"),
            PermissionMode::Cautious => write!(f, "cautious"),
            PermissionMode::Paranoid => write!(f, "paranoid"),
        }
    }
}

impl PermissionMode {
    /// 该模式下需要确认的最低风险等级
    pub fn confirm_threshold(&self) -> ToolRiskLevel {
        match self {
            PermissionMode::Auto => ToolRiskLevel::Critical, // 实际上不会触发（全部自动）
            PermissionMode::LowRiskAuto => ToolRiskLevel::High,
            PermissionMode::Confirm => ToolRiskLevel::High,
            PermissionMode::Cautious => ToolRiskLevel::Moderate,
            PermissionMode::Paranoid => ToolRiskLevel::Informational, // 所有都确认
        }
    }
}

// ─── 风险等级 ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolRiskLevel {
    /// 纯只读信息获取，不改变任何状态（如查看状态、读取文件、搜索历史）
    Informational = 0,
    /// 低风险：安全的写入操作，可轻易撤销（如写记忆、创建临时文件）
    Low = 1,
    /// 中等风险：非特权命令执行、普通文件修改（有备份）
    Moderate = 2,
    /// 高风险：特权操作（sudo）、安装软件、修改系统配置
    High = 3,
    /// 严重风险：破坏性操作（删除数据、格式化、卸载关键软件）
    Critical = 4,
}

impl ToolRiskLevel {
    pub fn as_str(&self) -> &'static str {
        match self {
            ToolRiskLevel::Informational => "informational",
            ToolRiskLevel::Low => "low",
            ToolRiskLevel::Moderate => "moderate",
            ToolRiskLevel::High => "high",
            ToolRiskLevel::Critical => "critical",
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            ToolRiskLevel::Informational => "只读",
            ToolRiskLevel::Low => "低风险",
            ToolRiskLevel::Moderate => "中风险",
            ToolRiskLevel::High => "高风险",
            ToolRiskLevel::Critical => "严重风险",
        }
    }
}

// ─── 权限请求/响应 ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionRequest {
    pub conversation_id: String,
    pub agent_id: String,
    pub tool_name: String,
    pub arguments: serde_json::Value,
    pub risk_level: ToolRiskLevel,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
#[serde(rename_all = "camelCase")]
pub struct PermissionResponse {
    pub conversation_id: String,
    pub approved: bool,
    pub always_allow: bool,
}

// ─── 命令级风险分类（用于 terminal / terminal_session 工具） ───────────────

/// 安全只读命令白名单（执行这些命令不需要高权限确认）
fn safe_readonly_commands() -> &'static [&'static str] {
    &[
        // 文件查看
        "ls", "cat", "head", "tail", "more", "less", "nl", "wc", "file", "stat",
        "find", "locate", "tree", "du -h", "du", "pwd",
        // 进程查看
        "ps", "top", "htop", "pstree", "pgrep", "pidof", "w", "who",
        // 网络查看
        "netstat", "ss", "ip addr", "ip a", "ifconfig", "curl --head",
        "ping -c", "ping", "nslookup", "dig", "host", "traceroute",
        // 服务状态查看
        "systemctl status", "service", "journalctl -u",
        // 包管理查询
        "dpkg -l", "dpkg -s", "apt list", "apt-cache", "rpm -qa", "rpm -qi",
        "dnf list", "yum list", "pacman -Q", "apk info", "zypper se",
        // 系统信息
        "uname", "uptime", "free", "df -h", "df", "date", "hostname",
        "lsb_release", "cat /etc/os-release", "cat /etc/issue",
        // 版本检查
        "nginx -v", "nginx -t", "psql --version",
        "redis-cli --version", "php -v", "python3 --version", "node -v",
        "git --version", "git status", "git log", "git diff",
        // 其他
        "echo", "grep", "awk", "sed -n", "sort", "uniq", "cut", "tr",
        "which", "whereis", "id", "groups", "umask",
    ]
}

/// 严重破坏性命令黑名单（直接升级到 Critical）
fn destructive_command_patterns() -> &'static [&'static str] {
    &[
        "rm -rf /",
        "rm -rf /*",
        "rm -rf ~",
        "mkfs",
        "dd if=",
        ":(){ :|:& };:;", // fork bomb
        "> /dev/sd",       // 覆盖磁盘
        "chmod -R 777 /",
        "chown -R root /",
        "shutdown -h",
        "reboot",
        "init 0",
        "systemctl poweroff",
        "systemctl reboot",
        "fdisk",
        "parted",
        "wipefs",
    ]
}

/// sudo 前缀命令（升级到 High 或 Critical）
fn has_sudo_prefix(cmd: &str) -> bool {
    let trimmed = cmd.trim_start();
    trimmed.starts_with("sudo ") || trimmed.starts_with("sudo\t")
}

/// 安装类命令（升级到 High）
fn is_install_command(cmd: &str) -> bool {
    let cmd_lower = cmd.to_lowercase();
    cmd_lower.contains("apt-get install")
        || cmd_lower.contains("apt install")
        || cmd_lower.contains("dnf install")
        || cmd_lower.contains("yum install")
        || cmd_lower.contains("pacman -S")
        || cmd_lower.contains("apk add")
        || cmd_lower.contains("zypper install")
        || cmd_lower.contains("pip install")
        || cmd_lower.contains("npm install -g")
        || cmd_lower.contains("cargo install")
}

/// 服务修改类命令（升级到 High）
fn is_service_modify_command(cmd: &str) -> bool {
    let cmd_lower = cmd.to_lowercase();
    cmd_lower.contains("systemctl start")
        || cmd_lower.contains("systemctl stop")
        || cmd_lower.contains("systemctl restart")
        || cmd_lower.contains("systemctl reload")
        || cmd_lower.contains("systemctl enable")
        || cmd_lower.contains("systemctl disable")
        || cmd_lower.contains("service ") && (cmd_lower.contains(" start")
            || cmd_lower.contains(" stop")
            || cmd_lower.contains(" restart")
            || cmd_lower.contains(" reload"))
}

/// 配置修改类命令（Moderate）
fn is_config_modify_command(cmd: &str) -> bool {
    let cmd_lower = cmd.to_lowercase();
    cmd_lower.contains("sed -i")
        || cmd_lower.contains("vim ")
        || cmd_lower.contains("nano ")
        || cmd_lower.contains("tee ")
        || cmd_lower.contains("echo ") && cmd_lower.contains(">")
        || cmd_lower.contains("cp ")
        || cmd_lower.contains("mv ")
        || cmd_lower.contains("mkdir")
        || cmd_lower.contains("touch")
        || cmd_lower.contains("chmod")
        || cmd_lower.contains("chown")
}

/// 根据命令内容评估风险等级
///
/// 从高到低匹配：
/// 1. 破坏性命令 → Critical
/// 2. sudo + 破坏性 → Critical
/// 3. sudo + 安装/服务修改 → High
/// 4. sudo + 其他 → High
/// 5. 安装命令 → Moderate
/// 6. 服务修改 → Moderate
/// 7. 配置修改 → Moderate
/// 8. 只读白名单 → Informational
/// 9. 其他 → Moderate
pub fn classify_command_risk(command: &str) -> ToolRiskLevel {
    let cmd = command.trim();
    let cmd_lower = cmd.to_lowercase();

    // 1. 检查破坏性命令
    for pattern in destructive_command_patterns() {
        if cmd_lower.contains(pattern) {
            return ToolRiskLevel::Critical;
        }
    }

    let has_sudo = has_sudo_prefix(cmd);

    // 2. sudo + 破坏性命令检查（去掉 sudo 前缀后再检查）
    if has_sudo {
        let without_sudo = cmd.trim_start_matches(|c: char| c == 's' || c == 'u' || c == 'd' || c == 'o' || c.is_whitespace());
        for pattern in destructive_command_patterns() {
            if without_sudo.to_lowercase().contains(pattern) {
                return ToolRiskLevel::Critical;
            }
        }
    }

    // 3. sudo + 安装/服务修改 → High
    if has_sudo && (is_install_command(cmd) || is_service_modify_command(cmd)) {
        return ToolRiskLevel::High;
    }

    // 4. sudo + 其他 → High（特权操作）
    if has_sudo {
        return ToolRiskLevel::High;
    }

    // 5. 安装命令（非 sudo）→ Moderate
    if is_install_command(cmd) {
        return ToolRiskLevel::Moderate;
    }

    // 6. 服务修改（非 sudo）→ Moderate
    if is_service_modify_command(cmd) {
        return ToolRiskLevel::Moderate;
    }

    // 7. 配置修改 → Moderate
    if is_config_modify_command(cmd) {
        return ToolRiskLevel::Moderate;
    }

    // 8. 只读白名单 → Informational
    for safe_cmd in safe_readonly_commands() {
        // 精确前缀匹配（命令名 + 空格 或 命令名 + 换行 或 命令名结束）
        if cmd_lower.starts_with(&format!("{} ", safe_cmd))
            || cmd_lower == *safe_cmd
            || cmd_lower.starts_with(&format!("{}\n", safe_cmd))
        {
            return ToolRiskLevel::Informational;
        }
    }

    // 9. 其他默认 → Moderate（保守估计，宁高勿低）
    ToolRiskLevel::Moderate
}

// ─── 兼容旧 API ────────────────────────────────────────────────────────────

/// 判断是否需要确认（基于风险等级和权限模式）
pub fn should_confirm(
    mode: PermissionMode,
    risk_level: ToolRiskLevel,
    always_allowed: &[String],
    tool_name: &str,
) -> bool {
    // Auto 模式下不确认
    if mode == PermissionMode::Auto {
        return false;
    }

    // 始终允许的工具不确认
    if always_allowed.contains(&tool_name.to_string()) {
        return false;
    }

    // Paranoid 模式下所有都确认
    if mode == PermissionMode::Paranoid {
        return true;
    }

    // 风险等级 >= 阈值时需要确认
    risk_level >= mode.confirm_threshold()
}

// ─── 旧版工具风险分类（保留用于动态插件工具等未知工具的 fallback） ────────

fn high_risk_tools() -> &'static [&'static str] {
    &["terminal", "terminal_session"]
}

fn high_risk_file_actions() -> &'static [&'static str] {
    &["write", "delete", "create"]
}

fn builtin_tools() -> &'static [&'static str] {
    &["terminal", "terminal_session", "file", "memory", "command_history", "plugin_manager"]
}

/// 旧版分类函数（仅用于没有实现 risk_level 的动态插件工具 fallback）
/// 内置工具已经通过 trait 方法自行声明，不经过这里
pub fn classify_tool_risk(tool_name: &str, arguments: &serde_json::Value) -> ToolRiskLevel {
    if tool_name == "memory" || tool_name == "command_history" {
        return ToolRiskLevel::Low;
    }

    if high_risk_tools().contains(&tool_name) {
        // 终端类工具默认 High，但实际会由命令级分类更精确判断
        // 这里只是 fallback
        return ToolRiskLevel::High;
    }

    if tool_name == "file" {
        if let Some(action) = arguments["action"].as_str() {
            if high_risk_file_actions().contains(&action) {
                return ToolRiskLevel::High;
            }
            return ToolRiskLevel::Low;
        }
    }

    if tool_name == "plugin_manager" {
        if let Some(action) = arguments["action"].as_str() {
            if matches!(action, "create" | "update" | "delete" | "toggle") {
                return ToolRiskLevel::High;
            }
            return ToolRiskLevel::Low;
        }
    }

    if !builtin_tools().contains(&tool_name) {
        // 未知插件工具默认 High（安全默认）
        return ToolRiskLevel::High;
    }

    ToolRiskLevel::Low
}

/// 旧版描述函数（仅用于 fallback）
pub fn build_permission_description(tool_name: &str, arguments: &serde_json::Value) -> String {
    match tool_name {
        "terminal" | "terminal_session" => {
            let cmd = arguments["command"].as_str().unwrap_or("<command>");
            format!("Execute command: {}", cmd)
        }
        "file" => {
            let action = arguments["action"].as_str().unwrap_or("unknown");
            let path = arguments["path"].as_str().unwrap_or("<path>");
            format!("File {} : {}", action, path)
        }
        "plugin_manager" => {
            let action = arguments["action"].as_str().unwrap_or("unknown");
            match action {
                "create" => {
                    let name = arguments["name"].as_str().unwrap_or("unknown");
                    format!("Create plugin '{}'", name)
                }
                "update" => {
                    let plugin_id = arguments["plugin_id"].as_str().unwrap_or("unknown");
                    format!("Update plugin '{}'", plugin_id)
                }
                "delete" => {
                    let plugin_id = arguments["plugin_id"].as_str().unwrap_or("unknown");
                    format!("Delete plugin '{}'", plugin_id)
                }
                "toggle" => {
                    let plugin_id = arguments["plugin_id"].as_str().unwrap_or("unknown");
                    let enabled = arguments["enabled"].as_bool().unwrap_or(false);
                    format!("{} plugin '{}'", if enabled { "Enable" } else { "Disable" }, plugin_id)
                }
                _ => format!("Plugin manager: {}", action)
            }
        }
        _ => {
            let args_str = if let Some(obj) = arguments.as_object().filter(|o| !o.is_empty()) {
                obj.iter()
                    .map(|(k, v)| format!("  {}: {}", k, v))
                    .collect::<Vec<_>>()
                    .join("\n")
            } else {
                "(no parameters)".to_string()
            };
            format!("Plugin tool: {}\nParameters:\n{}", tool_name, args_str)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_risk_level_ordering() {
        assert!(ToolRiskLevel::Informational < ToolRiskLevel::Low);
        assert!(ToolRiskLevel::Low < ToolRiskLevel::Moderate);
        assert!(ToolRiskLevel::Moderate < ToolRiskLevel::High);
        assert!(ToolRiskLevel::High < ToolRiskLevel::Critical);
    }

    #[test]
    fn test_safe_readonly_commands() {
        assert_eq!(classify_command_risk("ls -la"), ToolRiskLevel::Informational);
        assert_eq!(classify_command_risk("cat /etc/nginx/nginx.conf"), ToolRiskLevel::Informational);
        assert_eq!(classify_command_risk("ps aux"), ToolRiskLevel::Informational);
        assert_eq!(classify_command_risk("systemctl status nginx"), ToolRiskLevel::Informational);
        assert_eq!(classify_command_risk("df -h"), ToolRiskLevel::Informational);
    }

    #[test]
    fn test_destructive_commands() {
        assert_eq!(classify_command_risk("rm -rf /"), ToolRiskLevel::Critical);
        assert_eq!(classify_command_risk("sudo rm -rf /"), ToolRiskLevel::Critical);
        assert_eq!(classify_command_risk("mkfs.ext4 /dev/sda1"), ToolRiskLevel::Critical);
    }

    #[test]
    fn test_sudo_commands() {
        assert_eq!(classify_command_risk("sudo apt install nginx"), ToolRiskLevel::High);
        assert_eq!(classify_command_risk("sudo systemctl restart nginx"), ToolRiskLevel::High);
        assert_eq!(classify_command_risk("sudo cat /etc/shadow"), ToolRiskLevel::High);
    }

    #[test]
    fn test_install_commands() {
        assert_eq!(classify_command_risk("apt install nginx"), ToolRiskLevel::Moderate);
        assert_eq!(classify_command_risk("pip install requests"), ToolRiskLevel::Moderate);
    }

    #[test]
    fn test_config_modify_commands() {
        assert_eq!(classify_command_risk("sed -i 's/a/b/g' file.txt"), ToolRiskLevel::Moderate);
        assert_eq!(classify_command_risk("cp file1 file2"), ToolRiskLevel::Moderate);
        assert_eq!(classify_command_risk("mkdir /tmp/test"), ToolRiskLevel::Moderate);
    }

    #[test]
    fn test_permission_mode_thresholds() {
        assert_eq!(PermissionMode::Auto.confirm_threshold(), ToolRiskLevel::Critical);
        assert_eq!(PermissionMode::Confirm.confirm_threshold(), ToolRiskLevel::High);
        assert_eq!(PermissionMode::Cautious.confirm_threshold(), ToolRiskLevel::Moderate);
        assert_eq!(PermissionMode::Paranoid.confirm_threshold(), ToolRiskLevel::Informational);
    }

    #[test]
    fn test_should_confirm() {
        let allowed: Vec<String> = vec![];

        // Auto 模式：全部不确认
        assert!(!should_confirm(PermissionMode::Auto, ToolRiskLevel::Critical, &allowed, "test"));

        // Confirm 模式：High 及以上确认
        assert!(!should_confirm(PermissionMode::Confirm, ToolRiskLevel::Moderate, &allowed, "test"));
        assert!(should_confirm(PermissionMode::Confirm, ToolRiskLevel::High, &allowed, "test"));
        assert!(should_confirm(PermissionMode::Confirm, ToolRiskLevel::Critical, &allowed, "test"));

        // Cautious 模式：Moderate 及以上确认
        assert!(!should_confirm(PermissionMode::Cautious, ToolRiskLevel::Low, &allowed, "test"));
        assert!(should_confirm(PermissionMode::Cautious, ToolRiskLevel::Moderate, &allowed, "test"));

        // Paranoid 模式：全部确认
        assert!(should_confirm(PermissionMode::Paranoid, ToolRiskLevel::Informational, &allowed, "test"));

        // 始终允许的工具不确认
        let allowed = vec!["terminal".to_string()];
        assert!(!should_confirm(PermissionMode::Confirm, ToolRiskLevel::High, &allowed, "terminal"));
    }
}
