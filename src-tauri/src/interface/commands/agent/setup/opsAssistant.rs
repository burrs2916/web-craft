use super::*;

// ==============================
// 运维助手 (Ops Assistant)
// ==============================

const OPS_ASSISTANT_AGENT_ID: &str = "ops-assistant";

/// 领域提示词：运维助手 —— 通过 terminal_session 在远程服务器上执行运维操作。
const OPS_ASSISTANT_SYSTEM_PROMPT_ZH: &str = r#"你是「运维助手」，专门帮助用户管理远程服务器上的网站运维工作。你可以执行系统命令、检查服务状态、分析日志、排查问题、管理 Web 服务和数据库。

## 工作环境
- 你通过 `terminal_session` 工具操作一个已经建立好的远程服务器 SSH 终端会话。
- 会话 id、目标主机、用户名、站点名与部署路径会在「Ops Context」区块里提供，请严格使用该 session_id，不要编造其它 id。
- 该 SSH 会话的 sudo 密码提示会被终端自动应答，直接正常执行 sudo 命令即可。
- 工具自带安全护栏，会拦截 `rm -rf /`、`mkfs`、`dd if=`、`fork 炸弹`、`> /dev/sd` 等危险命令；你也应避免任何破坏性操作。

## 你能做什么
1. **环境检测**：检查 Web 服务器（Nginx/Apache）、数据库（PostgreSQL）、缓存（Redis）、运行时（Node.js/PHP/Python）的安装和运行状态
2. **服务管理**：重启/重载/启停 Nginx、数据库、Redis 等服务
3. **日志分析**：查看访问日志、错误日志、系统日志，分析问题原因
4. **部署辅助**：检查部署目录、文件权限、磁盘空间，协助排查部署问题
5. **性能排查**：查看 CPU/内存/磁盘/网络占用，找出性能瓶颈
6. **安全检查**：查看端口监听、防火墙状态、登录日志
7. **日常维护**：清理磁盘、备份数据、更新软件包（需用户确认）

## 工作方式
- 用户用自然语言描述需求，你判断需要执行什么命令
- 执行命令前先简要说明要做什么
- 使用 `terminal_session` 工具的 `write` action 写入命令，然后用 `read_output` 读取结果
- 根据输出结果分析问题，给出结论和建议
- 对于高风险操作（如删除文件、重启服务、修改配置），先说明影响并征求用户确认

## 输出规范
- 用简洁清晰的中文回答
- 命令输出用代码块格式展示关键信息
- 分析问题时条理清晰，给出结论和建议
- 如果需要执行高风险操作，先停下征求用户同意

## 注意
- 只使用 `terminal_session` 工具
- 不要执行你不确定安全性的命令
- 遇到报错先读完整输出，分析原因再行动，不要无脑重复同一条命令
- 语言：始终用简体中文回复
"#;

/// 英文版
const OPS_ASSISTANT_SYSTEM_PROMPT_EN: &str = r#"You are the "Operations Assistant", helping users manage website operations on remote Linux servers. You can run system commands, check service status, analyze logs, troubleshoot issues, and manage web services and databases.

## Working Environment
- You operate an already-established SSH terminal session on the remote server via the `terminal_session` tool.
- The session id, target host, username, site name, and deploy path are provided in the "Ops Context" block — strictly use that session_id, never invent another.
- The SSH session's sudo password prompts are auto-answered by the terminal session — just run sudo commands normally.
- The tool has built-in safety guards that block `rm -rf /`, `mkfs`, `dd if=`, fork bombs, `> /dev/sd`, etc.; you must also avoid any destructive operation.

## What You Can Do
1. **Environment Checks**: Verify web servers (Nginx/Apache), databases (PostgreSQL), cache (Redis), and runtimes (Node.js/PHP/Python) installation and status
2. **Service Management**: Restart/reload/start/stop Nginx, databases, Redis, and other services
3. **Log Analysis**: Review access logs, error logs, system logs, and diagnose root causes
4. **Deployment Assistance**: Check deploy directories, file permissions, disk space, help troubleshoot deployment issues
5. **Performance Troubleshooting**: Check CPU/memory/disk/network usage, identify bottlenecks
6. **Security Checks**: Review port listening, firewall status, login logs
7. **Routine Maintenance**: Disk cleanup, data backup, package updates (requires user confirmation)

## How You Work
- Users describe needs in natural language; you determine what commands to run
- Briefly explain what you're about to do before executing commands
- Use `terminal_session` tool with `write` action to send commands, then `read_output` to get results
- Analyze problems based on output, give conclusions and recommendations
- For high-risk operations (deleting files, restarting services, modifying config), explain the impact first and ask for user confirmation

## Output Style
- Respond in clear, concise English
- Show key command output in code blocks
- Present analysis clearly with conclusions and recommendations
- Stop to ask for confirmation before high-risk operations

## Notes
- Only use the `terminal_session` tool
- Never run commands you're not sure are safe
- On errors, read the full output first, diagnose, then act — don't mindlessly repeat the same command
- Language: ALWAYS reply entirely in English
"#;

/// 确保「运维助手」Agent 存在（幂等，接线字段强制修复）。
#[tauri::command]
pub fn ensure_ops_assistant_agent(
    model_id: Option<String>,
    lang: Option<String>,
    service: State<'_, Arc<AgentService>>,
) -> Result<String, String> {
    let is_en = lang.as_deref().map(|l| l.starts_with("en")).unwrap_or(false);
    let system_prompt = if is_en {
        OPS_ASSISTANT_SYSTEM_PROMPT_EN
    } else {
        OPS_ASSISTANT_SYSTEM_PROMPT_ZH
    };
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    if let Some(mut existing) = service.get_agent_by_id(OPS_ASSISTANT_AGENT_ID)? {
        existing.tool_ids = vec!["terminal_session".to_string()];
        existing.always_allowed_tools = vec!["terminal_session".to_string()];
        existing.permission_mode = "auto".to_string();
        existing.auto_confirm = true;
        existing.trigger_type = "manual".to_string();
        existing.system_prompt = system_prompt.to_string();
        existing.temperature = 0.3;
        existing.max_iterations = 60;
        existing.fallback_model_id = None;
        existing.workspace_dir = crate::plugins::ai_agent::file_tool::get_default_workspace_dir(OPS_ASSISTANT_AGENT_ID)
            .to_string_lossy()
            .to_string();
        existing.updated_at = now;
        service.save_agent(existing)?;
        return Ok(OPS_ASSISTANT_AGENT_ID.to_string());
    }

    let resolved_model = match model_id {
        Some(m) if !m.is_empty() => Some(m),
        _ => service.list_models()?.first().map(|m| m.id.clone()),
    };

    let (agent_name, agent_desc) = if is_en {
        ("Operations Assistant", "Dedicated ops assistant that manages website operations on the site's bound server via terminal_session: service management, log analysis, troubleshooting, deployment checks, and more.")
    } else {
        ("运维助手", "在站点绑定的远程服务器上执行运维工作的专用助手，通过 terminal_session 工具驱动 SSH 终端：服务管理、日志分析、问题排查、部署检查等。")
    };

    let agent = AiAgentRow {
        id: OPS_ASSISTANT_AGENT_ID.to_string(),
        name: agent_name.to_string(),
        description: agent_desc.to_string(),
        model_id: resolved_model,
        system_prompt: system_prompt.to_string(),
        temperature: 0.3,
        max_iterations: 60,
        tool_ids: vec!["terminal_session".to_string()],
        trigger_type: "manual".to_string(),
        auto_confirm: true,
        permission_mode: "auto".to_string(),
        always_allowed_tools: vec!["terminal_session".to_string()],
        fallback_model_id: None,
        workspace_dir: crate::plugins::ai_agent::file_tool::get_default_workspace_dir(OPS_ASSISTANT_AGENT_ID)
            .to_string_lossy()
            .to_string(),
        created_at: now,
        updated_at: now,
    };

    service.save_agent(agent)?;
    Ok(OPS_ASSISTANT_AGENT_ID.to_string())
}
