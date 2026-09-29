use crate::app::terminal_service::TerminalService;
use crate::infra::logging::debug_log;

/// 早期会话存活校验：envFix / ops / srvEnvSetup / rdSetup 等场景的 session_id
/// 来自前端 URL 参数，窗口复用时可能已过期。不存活时直接拒绝启动 Agent，
/// 避免模型反复调用 terminal_session 导致一连串 "session not found" 错误。
pub fn check_external_session_alive(
    meta: &serde_json::Value,
    terminal_service: &TerminalService,
    run_id: &str,
) -> Result<(), String> {
    let ext_session: Option<(&str, &str)> =
        meta.get("envFix").and_then(|m| m.get("sessionId").and_then(|v| v.as_str()).map(|s| ("envFix", s)))
        .or_else(|| meta.get("ops").and_then(|m| m.get("sessionId").and_then(|v| v.as_str()).map(|s| ("ops", s))))
        .or_else(|| meta.get("srvEnvSetup").and_then(|m| m.get("sessionId").and_then(|v| v.as_str()).map(|s| ("srvEnvSetup", s))))
        .or_else(|| meta.get("rdSetup").and_then(|m| m.get("sessionId").and_then(|v| v.as_str()).map(|s| ("rdSetup", s))));
    if let Some((scene, sid)) = ext_session {
        if !sid.is_empty() && !terminal_service.session_alive(sid) {
            tracing::warn!("[run_agent] {} session '{}' is not alive, rejecting agent start", scene, sid);
            debug_log::env_ops("ERROR", &run_id, "agent_run", "session_dead_rejected",
                &format!("scene={} session_id={} reason=session_not_alive agent_rejected=true", scene, sid));
            let ui_is_en = meta.get("lang").and_then(|v| v.as_str()).map(|l| l.starts_with("en")).unwrap_or(false);
            let err_msg = if ui_is_en {
                format!("SSH terminal session has been lost (disconnected or expired).\n\nSession ID: {}\nScene: {}\n\nPlease reopen the environment fix / deployment tool from the operations center to establish a fresh SSH connection, then try again.", sid, scene)
            } else {
                format!("SSH 终端会话已丢失（已断开或过期）。\n\n会话 ID：{}\n场景：{}\n\n请从运维中心重新打开环境修复/部署工具以建立新的 SSH 连接，然后再试。", sid, scene)
            };
            return Err(err_msg);
        }
        debug_log::env_ops("INFO", &run_id, "agent_run", "session_alive_ok",
            &format!("scene={} session_id={}", scene, sid));
    }
    Ok(())
}

/// 场景化 system prompt 注入：rdSetup / srvEnvSetup / ops / envFix。
/// 返回是否需要开启引擎自动续跑（auto_continue）。
pub fn inject_scene_context(
    system_prompt: &mut String,
    meta: &serde_json::Value,
    terminal_service: &TerminalService,
) -> bool {
    let mut auto_continue = false;
    if let Some(rd) = meta.get("rdSetup") {
        let session_id = rd.get("sessionId").and_then(|v| v.as_str()).unwrap_or("");
        let host = rd.get("host").and_then(|v| v.as_str()).unwrap_or("");
        let username = rd.get("username").and_then(|v| v.as_str()).unwrap_or("");
        let install_mode = rd.get("installMode").and_then(|v| v.as_str()).unwrap_or("basic");
        let install_mode_guide = match install_mode {
            "headless" => "`headless` (无桌面版): packages = VNC Server + xterm only, NO desktop environment.",
            "full" => "`full` (全量安装): packages = TigerVNC + XFCE desktop + common apps (Debian: xfce4 xfce4-terminal thunar xfce4-goodies; RHEL/Arch: xfce4 xfce4-terminal thunar).",
            _ => "`basic` (基础桌面版): packages = TigerVNC + minimal XFCE (Debian/Ubuntu: `--no-install-recommends xfce4 xfce4-terminal`).",
        };
        // 提示词国际化：会话 metadata 携带用户界面语言，en → 英文注入，其余 → 中文注入。
        let is_en = rd.get("lang").and_then(|v| v.as_str()).map(|l| l.starts_with("en")).unwrap_or(false);
        if !session_id.is_empty() {
            if is_en {
                system_prompt.push_str(&format!(
                    "\n\n## Remote Desktop Setup Context\n\
You are helping set up a VNC remote desktop on a remote server.\n\
- Active terminal session id to drive: `{}`\n\
- Target host: `{}` (user: `{}`)\n\
- Install mode (user-selected): `{}` — install exactly this variant, nothing more, nothing less.\n\
ALWAYS use the `terminal_session` tool with action `write`, `session_id` set to the id above, and the command to run. After writing, use action `read_output` to read the result. Do NOT use any other session id.\n\
The remote server's sudo password prompts are auto-answered by the terminal session — just run sudo commands normally.\n\
\n\
Besides installing/configuring VNC, the user may also ask you to do other remote-server maintenance or answer questions (change passwords, check port usage, explain commands, clean disk, chat). Treat those as normal requests and assist via `terminal_session`.\n\
\n\
WORKFLOW (strict three-phase, do NOT skip or merge):\n\
\n\
PHASE 0 — RECON (read-only, NO system changes, mandatory first): Gather the environment profile with a few non-destructive commands, e.g. \
`cat /etc/os-release; uname -a; for pm in apt apt-get dnf yum zypper pacman apk; do command -v $pm && break; done; command -v vncserver Xvnc tigervncserver; command -v xfce4-session gnome-session startkde; ss -ltn 2>/dev/null | grep -q ':5901' && echo PORT_OPEN || echo PORT_CLOSED; id -u; sudo -n true 2>/dev/null && echo SUDO_OK || echo SUDO_NEED_PW`. \
Capture: distro + version, architecture, available package manager, whether a desktop environment already exists, current VNC status, sudo availability, and any obvious dependency conflicts. Do NOT install or modify anything in this phase.\n\
\n\
PHASE 1 — REPORT + CONSENT: Summarize the environment profile in a few lines, then end with EXACTLY one line: `RD_STATUS: installed` (VNC already configured & listening) or `RD_STATUS: not_installed`. \
If not_installed, briefly state the install plan for the chosen mode: which packages, the exact non-interactive install command for THIS distro's package manager, how you will set the VNC password and write xstartup, and how you will start/verify. **Ask the user which VNC password they want to use for connecting (so they can actually log in afterwards).** STOP here and wait for the user. Do NOT begin installing.\n\
\n\
PHASE 2 — INSTALL ONLY AFTER EXPLICIT CONSENT: Only after the user clearly agrees (同意 / 开始安装 / yes) do you execute the planned commands. \
You ALREADY know the distro and package manager from PHASE 0 — do NOT re-detect them; run the correct commands directly. Install exactly per the selected mode: {}\n\
Use the VNC password the user provided in PHASE 1 when running `vncpasswd`; if they did not provide one, generate a simple password and **state it clearly in your final summary** so they can connect. \
Follow the non-interactive HARD RULES from your system prompt (any command that stops to ask is a bug): Debian/Ubuntu must use the full guardrail chain (DEBIAN_FRONTEND=noninteractive + DEBIAN_PRIORITY=critical + --force-confdef --force-confold + -o DPkg::Lock::Timeout=600 + dpkg --configure -a self-heal + debconf pre-seed for keyboard-configuration only if not installed; NEVER pre-seed tzdata; NEVER add `< /dev/null`; NEVER use `apt`, use `apt-get`). SUSE must use `zypper --non-interactive --gpg-auto-import-keys install --auto-agree-with-licenses`. Gentoo must use `emerge --ask=n`, never `--ask`. Set the VNC password (answer `Password:` then `Verify:`; if asked about a view-only password, answer `n`), write ~/.vnc/xstartup, start vncserver, verify it listens on 5901. \
Drive the terminal autonomously: keep issuing `terminal_session` calls until verified, and do NOT end your turn with a plain-text status update or speculative progress claims (e.g. do NOT say 'download finished, will auto-continue'). When fully verified, output a single final summary containing the word 完成 (or \"done\").\n\
If the user does not consent, stop and do nothing.\n\
LANGUAGE RULE: The user's UI language is English — ALWAYS reply entirely in English. Only the `RD_STATUS:` marker line is machine-parsed and must stay exactly as specified.\n",
                    session_id, host, username, install_mode, install_mode_guide
                ));
            } else {
                system_prompt.push_str(&format!(
                    "\n\n## Remote Desktop Setup Context\n\
你在帮助用户在远程服务器上安装配置 VNC 远程桌面。\n\
- 需要驱动的活动终端会话 id：`{}`\n\
- 目标主机：`{}`（用户：`{}`）\n\
- 安装模式（用户选择）：`{}` —— 严格按该模式安装，不多不少。\n\
务必使用 `terminal_session` 工具，action 为 `write`，session_id 用上面的 id，并带上要执行的命令；写完后用 `read_output` 读取结果。不要使用其它 session_id。\n\
远程服务器的 sudo 密码提示会被终端自动应答 —— 正常执行 sudo 命令即可。\n\
\n\
除安装/配置 VNC 外，用户也可能让你做其它远程维护或问答（改密码、查端口、解释命令、清理磁盘、聊天等），都通过 `terminal_session` 正常协助。\n\
\n\
工作流（严格三阶段，不要跳过或合并）：\n\
\n\
PHASE 0 — 侦察（只读，不改动系统，必须先做）：用几条非破坏性命令收集环境画像，例如 \
`cat /etc/os-release; uname -a; for pm in apt apt-get dnf yum zypper pacman apk; do command -v $pm && break; done; command -v vncserver Xvnc tigervncserver; command -v xfce4-session gnome-session startkde; ss -ltn 2>/dev/null | grep -q ':5901' && echo PORT_OPEN || echo PORT_CLOSED; id -u; sudo -n true 2>/dev/null && echo SUDO_OK || echo SUDO_NEED_PW`。\
记录：发行版+版本、架构、可用的包管理器、是否已有桌面环境、当前 VNC 状态、sudo 可用性、明显的依赖冲突。本阶段不要安装或修改任何东西。\n\
\n\
PHASE 1 — 汇报 + 征求同意：用几行总结环境画像，然后以**恰好一行**结束：`RD_STATUS: installed`（VNC 已配置且在监听）或 `RD_STATUS: not_installed`。\
若为 not_installed，简要说明所选模式的安装计划：装哪些包、针对本发行版包管理器的确切非交互安装命令、如何设置 VNC 密码和写 xstartup、如何启动并验证。**询问用户希望用哪个 VNC 密码连接（这样之后才能登录）**。停在这里等待用户，不要开始安装。\n\
\n\
PHASE 2 — 仅在用户明确同意后安装（同意 / 开始安装 / yes）：用户明确同意后才执行计划命令。\
你已经从 PHASE 0 知道发行版和包管理器 —— 不要重新探测，直接执行正确命令。严格按所选模式安装：{}\n\
设置 VNC 密码时使用用户在 PHASE 1 提供的密码；未提供则生成简单密码并在**最终总结中明确告知**。\
遵守系统提示词中的「无人值守铁律」（任何会停下来问的命令都是 bug）：Debian/Ubuntu 必须用全套护栏（DEBIAN_FRONTEND=noninteractive + DEBIAN_PRIORITY=critical + --force-confdef --force-confold + -o DPkg::Lock::Timeout=600 + dpkg --configure -a 自愈 + 仅在未安装时 debconf 预置 keyboard-configuration；绝不预置 tzdata；绝不加 `< /dev/null`；用 apt-get 不用 apt）。SUSE 必须用 `zypper --non-interactive --gpg-auto-import-keys install --auto-agree-with-licenses`。Gentoo 必须用 `emerge --ask=n`，绝不用 `--ask`。写 ~/.vnc/xstartup，启动 vncserver，验证 5901 在监听。\
自主驱动终端：持续调用 `terminal_session` 直到验证完成，不要用纯文本状态更新或猜测性进度来结束回合（例如不要说「下载完成，将自动继续」）。全部验证通过后，输出一条包含「完成」（或 \"done\"）的最终总结。\n\
如果用户不同意，停止且什么都不做。\n\
语言规则：用户界面为中文 —— 请始终用简体中文回复；`RD_STATUS:` 标记行按原样输出，语言无关。\n",
                    session_id, host, username, install_mode, install_mode_guide
                ));
            }
            // 安装是长任务，开启引擎自动续跑：模型中途返回纯文本也不停下，
            // 由引擎注入提醒继续驱动终端，避免每步都等用户点"继续"。
            // 但检查结论 / 征询用户意见时引擎不会自动续跑（见 engine.rs awaiting_user 判定）。
            auto_continue = true;
        }
    }
    // 站点部署环境安装助手（server-integration-design.md M-x1）：与 rdSetup 同构，
    // 把站点绑定的终端会话与部署路径注入剧本上下文，驱动「探测→汇报→同意后安装」。
    if let Some(se) = meta.get("srvEnvSetup") {
        let session_id = se.get("sessionId").and_then(|v| v.as_str()).unwrap_or("");
        let host = se.get("host").and_then(|v| v.as_str()).unwrap_or("");
        let username = se.get("username").and_then(|v| v.as_str()).unwrap_or("");
        let site_name = se.get("siteName").and_then(|v| v.as_str()).unwrap_or("");
        let remote_path = se.get("remotePath").and_then(|v| v.as_str()).unwrap_or("");
        let is_en = se.get("lang").and_then(|v| v.as_str()).map(|l| l.starts_with("en")).unwrap_or(false);
        if !session_id.is_empty() {
            if is_en {
                system_prompt.push_str(&format!(
                    "\n\n## Server Environment Setup Context\n\
You are preparing the deploy environment for the site `{}` on a remote server.\n\
- Active terminal session id to drive: `{}`\n\
- Target host: `{}` (user: `{}`)\n\
- Deploy remote path: `{}`\n\
ALWAYS use the `terminal_session` tool with action `write`, `session_id` set to the id above, and the command to run. After writing, use action `read_output` to read the result. Do NOT use any other session id.\n\
The remote server's sudo password prompts are auto-answered by the terminal session — just run sudo commands normally.\n\
\n\
WORKFLOW (strict three-phase, do NOT skip or merge):\n\
\n\
PHASE 0 — PROBE (read-only, NO system changes): run the probe commands from your system prompt (os-release, package manager, nginx presence & service status, port 80/443 listening, firewall tool, sudo, disk space) and `read_output` each result. Do NOT install or modify anything in this phase.\n\
\n\
PHASE 1 — REPORT + CONSENT: Summarize the environment profile, then end with EXACTLY one line: `SRV_ENV_STATUS: ready` or `SRV_ENV_STATUS: partial` or `SRV_ENV_STATUS: missing`. If not ready, state the install plan (packages, exact non-interactive command for THIS distro, enable --now, firewall rules, deploy directory, verification). STOP here and wait for the user. Do NOT begin installing.\n\
\n\
PHASE 2 — INSTALL ONLY AFTER EXPLICIT CONSENT: Only after the user clearly agrees do you execute the planned commands. Do NOT re-detect the distro; run the correct commands directly, following the non-interactive HARD RULES from your system prompt. If a deploy path is given above, create it and hand ownership to the current user. Verify `systemctl is-active nginx` is active AND `curl -s -o /dev/null -w '%{{http_code}}' http://localhost` returns 200, then output a final summary containing the word \"done\". If the user does not consent, stop and do nothing.\n\
If port 80/443 is occupied by another web server, report it and ask how to proceed — never kill processes on your own.\n\
LANGUAGE RULE: The user's UI language is English — ALWAYS reply entirely in English. Only the `SRV_ENV_STATUS:` marker line is machine-parsed and must stay exactly as specified.\n",
                    site_name, session_id, host, username, if remote_path.is_empty() { "(not set — skip directory setup)" } else { remote_path }
                ));
            } else {
                system_prompt.push_str(&format!(
                    "\n\n## 服务器环境安装上下文\n\
你在为站点「{}」准备远程服务器上的部署环境。\n\
- 需要驱动的活动终端会话 id：`{}`\n\
- 目标主机：`{}`（用户：`{}`）\n\
- 部署远程路径：`{}`\n\
务必使用 `terminal_session` 工具，action 为 `write`，session_id 用上面的 id，并带上要执行的命令；写完后用 `read_output` 读取结果。不要使用其它 session_id。\n\
远程服务器的 sudo 密码提示会被终端自动应答 —— 正常执行 sudo 命令即可。\n\
\n\
工作流（严格三阶段，不要跳过或合并）：\n\
\n\
PHASE 0 — 探测（只读，不改动系统）：执行系统提示词中的探测命令（os-release、包管理器、nginx 是否安装与服务状态、80/443 端口监听、防火墙工具、sudo、磁盘空间），每条都用 `read_output` 读取结果。本阶段不要安装或修改任何东西。\n\
\n\
PHASE 1 — 汇报 + 征求同意：用几行总结环境画像，然后以**恰好一行**结束：`SRV_ENV_STATUS: ready`（nginx 已装且 active、80 或 443 在监听）或 `SRV_ENV_STATUS: partial`（已装但未运行/端口未监听/被占用）或 `SRV_ENV_STATUS: missing`（未安装）。若非 ready，说明安装计划（装哪些包、针对本发行版的确切非交互安装命令、enable --now、防火墙放行、部署目录、验证方式）。停在这里等待用户，不要开始安装。\n\
\n\
PHASE 2 — 仅在用户明确同意后安装：用户明确同意后才执行计划命令。不要重新探测发行版，直接执行正确命令，遵守系统提示词中的「无人值守铁律」。上面给了部署路径时，创建目录并把属主交给当前用户。验证 `systemctl is-active nginx` 为 active 且 `curl -s -o /dev/null -w '%{{http_code}}' http://localhost` 返回 200，然后输出包含「完成」（或 \"done\"）的最终总结。如果用户不同意，停止且什么都不做。\n\
若 80/443 被其它 Web 服务占用，汇报并征求用户处理意见，不要擅自杀进程。\n\
语言规则：用户界面为中文 —— 请始终用简体中文回复；`SRV_ENV_STATUS:` 标记行按原样输出，语言无关。\n",
                    site_name, session_id, host, username, if remote_path.is_empty() { "（未设置 —— 跳过目录准备）" } else { remote_path }
                ));
            }
            auto_continue = true;
        }
    }

    // 运维助手上下文：与 srvEnvSetup 同构，注入站点名、部署路径和会话信息。
    if let Some(ops) = meta.get("ops") {
        let session_id = ops.get("sessionId").and_then(|v| v.as_str()).unwrap_or("");
        let host = ops.get("host").and_then(|v| v.as_str()).unwrap_or("");
        let username = ops.get("username").and_then(|v| v.as_str()).unwrap_or("");
        let site_name = ops.get("siteName").and_then(|v| v.as_str()).unwrap_or("");
        let remote_path = ops.get("remotePath").and_then(|v| v.as_str()).unwrap_or("");
        let is_en = ops.get("lang").and_then(|v| v.as_str()).map(|l| l.starts_with("en")).unwrap_or(false);
        if !session_id.is_empty() {
            if is_en {
                system_prompt.push_str(&format!(
                    "\n\n## Ops Context\n\
You are managing operations for the site `{}` on a remote server.\n\
- Active terminal session id to use: `{}`\n\
- Target host: `{}` (user: `{}`)\n\
- Deploy remote path: `{}`\n\
ALWAYS use the `terminal_session` tool with action `write`, `session_id` set to the id above, and the command to run. After writing, use action `read_output` to read the result. Do NOT use any other session id.\n\
The remote server's sudo password prompts are auto-answered by the terminal session — just run sudo commands normally.\n",
                    site_name, session_id, host, username, if remote_path.is_empty() { "(not set)" } else { remote_path }
                ));
            } else {
                system_prompt.push_str(&format!(
                    "\n\n## 运维上下文\n\
你正在为站点「{}」管理远程服务器上的运维工作。\n\
- 要使用的活动终端会话 id：`{}`\n\
- 目标主机：`{}`（用户：`{}`）\n\
- 部署远程路径：`{}`\n\
务必使用 `terminal_session` 工具，action 为 `write`，session_id 用上面的 id，并带上要执行的命令；写完后用 `read_output` 读取结果。不要使用其它 session_id。\n\
远程服务器的 sudo 密码提示会被终端自动应答 —— 正常执行 sudo 命令即可。\n",
                    site_name, session_id, host, username, if remote_path.is_empty() { "（未设置）" } else { remote_path }
                ));
            }
        }
    }

    // 环境修复助手上下文：注入环境检测报告 JSON + 站点信息
    if let Some(env_fix) = meta.get("envFix") {
        let session_id = env_fix.get("sessionId").and_then(|v| v.as_str()).unwrap_or("");
        let host = env_fix.get("host").and_then(|v| v.as_str()).unwrap_or("");
        let username = env_fix.get("username").and_then(|v| v.as_str()).unwrap_or("");
        let site_name = env_fix.get("siteName").and_then(|v| v.as_str()).unwrap_or("");
        let remote_path = env_fix.get("remotePath").and_then(|v| v.as_str()).unwrap_or("");
        let domain = env_fix.get("domain").and_then(|v| v.as_str()).unwrap_or("");
        let check_report = env_fix.get("checkReport").and_then(|v| v.as_str()).unwrap_or("");
        let is_en = env_fix.get("lang").and_then(|v| v.as_str()).map(|l| l.starts_with("en")).unwrap_or(false);
        // 校验终端会话是否存活 —— 窗口复用可能导致 session_id 过期
        let session_alive = !session_id.is_empty() && terminal_service.session_alive(session_id);
        if !session_id.is_empty() && !session_alive {
            tracing::warn!("[run_agent] env-fix session '{}' is not alive, warning agent", session_id);
        }
        if !session_id.is_empty() {
            if is_en {
                system_prompt.push_str(&format!(
                    "\n\n## Environment Fix Context\n\
You are fixing the Web runtime environment for the site `{}` on a remote server.\n\
- Active terminal session id to drive: `{}`\n\
- Target host: `{}` (user: `{}`)\n\
- Deploy remote path: `{}`\n\
- Domain: `{}`\n\
ALWAYS use the `terminal_session` tool with action `write`, `session_id` set to the id above, and the command to run. After writing, use action `read_output` to read the result. Do NOT use any other session id.\n\
The remote server's sudo password prompts are auto-answered by the terminal session — just run sudo commands normally.\n\
\n\
### Environment Check Report (JSON)\n\
```json\n\
{}\n\
```\n\
\n\
WORKFLOW (strict three-phase, do NOT skip or merge):\n\
\n\
PHASE 0 — DIAGNOSE (read-only, NO system changes): Read the check report JSON above. Identify all failing/warning items. Determine the distro from the `system` group. Sort issues by priority (Web > SSL > Site Service). Do NOT install or modify anything in this phase.\n\
\n\
PHASE 1 — REPORT + CONSENT: Summarize the issues and your fix plan (packages, exact non-interactive commands for this distro, enable services, verification). Include risk notes (sudo needs, service restarts, impact). Then end with EXACTLY one line: `ENV_FIX_STATUS: need_fix` or `ENV_FIX_STATUS: all_good`. STOP here and wait for the user. Do NOT begin fixing.\n\
\n\
PHASE 2 — EXECUTE FIXES ONLY AFTER EXPLICIT CONSENT: Only after the user clearly agrees do you execute the planned fixes. Fix one by one in priority order. Verify each fix before moving on. On errors, read the full output first, diagnose, then retry — don't blindly repeat. Skip failed items and continue. After all fixes, verify all services are running, then output a final summary containing \"done\": what was fixed, what failed, and recommendations.\n\
Follow the Non-interactive HARD RULES from your system prompt for all install commands.\n\
LANGUAGE RULE: The user's UI language is English — ALWAYS reply entirely in English. Only the `ENV_FIX_STATUS:` marker line is machine-parsed and must stay exactly as specified.\n",
                    site_name, session_id, host, username,
                    if remote_path.is_empty() { "(not set)" } else { remote_path },
                    if domain.is_empty() { "(not set)" } else { domain },
                    if check_report.is_empty() { "{}" } else { check_report },
                ));
            } else {
                system_prompt.push_str(&format!(
                    "\n\n## 环境修复上下文\n\
你正在为站点「{}」修复远程服务器上的 Web 运行环境。\n\
- 需要驱动的活动终端会话 id：`{}`\n\
- 目标主机：`{}`（用户：`{}`）\n\
- 部署远程路径：`{}`\n\
- 域名：`{}`\n\
务必使用 `terminal_session` 工具，action 为 `write`，session_id 用上面的 id，并带上要执行的命令；写完后用 `read_output` 读取结果。不要使用其它 session_id。\n\
远程服务器的 sudo 密码提示会被终端自动应答 —— 正常执行 sudo 命令即可。\n\
\n\
### 环境检测报告（JSON）\n\
```json\n\
{}\n\
```\n\
\n\
工作流（严格三阶段，不要跳过或合并）：\n\
\n\
PHASE 0 — 诊断（只读，不改动系统）：阅读上面的检测报告 JSON，找出所有失败/警告项。从 `system` 分组确定发行版。按优先级排序问题（Web > SSL > 站点服务）。本阶段不要安装或修改任何东西。\n\
\n\
PHASE 1 — 汇报 + 征求同意：总结问题和修复方案（包名、针对本发行版的确切非交互命令、启用服务、验证方式）。说明风险（sudo 需求、服务重启、影响范围）。然后以**恰好一行**结束：`ENV_FIX_STATUS: need_fix` 或 `ENV_FIX_STATUS: all_good`。停在这里等待用户，不要开始修复。\n\
\n\
PHASE 2 — 仅在用户明确同意后执行修复：用户明确同意后才执行计划中的修复。按优先级逐个修复，每修复一项验证后再继续。遇到报错先读完整输出再诊断重试，不要无脑重复。失败的项跳过继续下一个。全部完成后验证所有服务运行状态，然后输出包含「修复完成」的最终总结：哪些修好了、哪些失败了、后续建议。\n\
所有安装命令遵守系统提示词中的「无人值守铁律」。\n\
语言规则：用户界面为中文 —— 请始终用简体中文回复；`ENV_FIX_STATUS:` 标记行按原样输出，语言无关。\n",
                    site_name, session_id, host, username,
                    if remote_path.is_empty() { "（未设置）" } else { remote_path },
                    if domain.is_empty() { "（未设置）" } else { domain },
                    if check_report.is_empty() { "{}" } else { check_report },
                ));
            }
            // 终端会话不存活时，在 system prompt 中明确警告 Agent
            if !session_alive {
                if is_en {
                    system_prompt.push_str(
                        "\n\n⚠️ CRITICAL WARNING: The terminal session is NOT available (disconnected or expired). Do NOT call terminal_session tool — it will fail with 'session not found'. Tell the user the SSH session has been lost and ask them to reopen the environment fix tool from the operations center to start a fresh session. Do NOT attempt any fixes."
                    );
                } else {
                    system_prompt.push_str(
                        "\n\n⚠️ 重要警告：终端会话不可用（已断开或过期）。**不要调用 terminal_session 工具**——会报 'session not found' 错误。请告知用户 SSH 会话已丢失，让他们从运维中心重新打开环境修复工具以建立新会话。不要尝试执行任何修复操作。"
                    );
                }
            }
            auto_continue = true;
        }
    }
    auto_continue
}
