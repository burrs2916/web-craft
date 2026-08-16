# WebCraft 远程自动化运维方案（Automation & Ops Plan）

> 版本：v0.2
> 状态：设计定稿（D1–D6 决策已拍板，2026-08-16），Phase A 可开工
> 前置文档：[PRD.md](./PRD.md)（本方案对应 PRD 4.6 终端增强 / 4.5 部署与运维 的技术底座）

---

## 1. 背景与目标

### 1.1 为什么先做运维自动化

现有系统的终端（PTY/xterm.js）、SSH 连接管理、SFTP 传输已经构成远程运维的良好基础。**先在这个基础上补全自动化运维能力，再让 CMS 的"一键部署"作为它的第一个应用场景**——部署流水线本质上就是一条预置的任务编排（构建 → SFTP 上传 → 重载服务 → 验证）。

### 1.2 目标

- 让用户可以**不打开交互终端**就完成远程命令执行，并得到结构化结果
- 让常用运维动作（查日志、重启服务、磁盘检查、备份）**参数化、可保存、一键复用**
- 让多步骤操作（上传 + 执行 + 验证）变成**可编排、可重放、可回溯**的任务
- 最终：定时、批量、通知，形成完整的无人值守运维闭环

### 1.3 非目标（本方案不做）

- 不引入 Rust SSH 库（russh/ssh2），坚持现有"零依赖、系统 OpenSSH 工具链"设计
- 不做远程进程监控 agent（不往服务器装任何东西）
- 不做 CMS 内容构建（见 PRD 4.4，由后续 SSG 方案承接）

---

## 2. 现有基础盘点（代码事实）

| 能力 | 实现位置 | 现状 | 对本方案的价值 |
|------|---------|------|---------------|
| SSH 交互会话 | `domain/terminal/pty.rs` `build_ssh_command()` | 系统 `ssh` + PTY，密码自动填充、主机密钥变更自动恢复 | 认证喂入逻辑可复用 |
| SSH 一次性命令 | `Pty::spawn_ssh_command_session()` | 已存在，但输出是 PTY 混合流，仅 `test_connection` 在用 | L1 的起点之一 |
| ControlMaster 连接池 | `app/sftp_service.rs` | Unix 下 `ssh -M -N` 主连接池，按 (连接,lane) 复用，空闲 240s，保活 20s | **L1 的最优通道：免费复用已认证连接** |
| SFTP batch 执行 | `sftp_service.rs` `exec()` | 系统 `sftp -b` 批处理文件，Windows 走交互式回退 | L3 文件传输步骤直接调用 |
| 参数化模板 | `plugins/engine/template.rs` | `{{param}}` 替换 + shell 安全引号 + 未解析占位符阻断 | L2 命令库直接复用 |
| 危险命令防护 | `plugins/engine/safety.rs` | 黑名单（rm -rf /、mkfs、dd、fork 炸弹、shutdown…）+ 内网 IP 拦截 | L2/L3 安全层直接复用 |
| 结构化执行结果 | `plugins/engine/executor.rs` `ExecutionResult` | success/output/duration_ms/metadata，本地命令 | L1 结果结构对齐此模式 |
| 执行日志先例 | `plugins/repo/usage_log_repo.rs` `plugin_usage_logs` 表 | 懒建表 + 4 索引 | L3 运行日志表参照此模式 |
| 权限确认流 | `plugins/ai_agent/permission.rs` | Auto/Confirm 模式 + 事件确认 + 60s 超时拒绝 | L4 无人值守前的安全门 |
| 事件推送 | `interface/events/` | kebab-case 事件名，`app_handle.emit()` | 新事件沿用此规范 |

**关键缺口：不存在任何"远程执行命令并捕获独立 stdout/stderr/exit_code"的通道。这是 L1 要补的第一块拼图。**

---

## 3. 总体架构：五层递进

```
┌─────────────────────────────────────────────────────┐
│ L5 批量执行   同一任务 → N 台服务器，结果聚合对比        │
├─────────────────────────────────────────────────────┤
│ L4 定时调度   本地调度器 + 系统通知 + 应用启动触发        │
├─────────────────────────────────────────────────────┤
│ L3 任务编排   多步骤工作流：远程执行/SFTP/条件/重试       │
│              + 运行历史 + 逐步骤日志                    │
├─────────────────────────────────────────────────────┤
│ L2 运维命令库  参数化脚本（模板+安全校验）+ 预置脚本包     │
├─────────────────────────────────────────────────────┤
│ L1 远程执行原语 ssh exec 通道 → 结构化 stdout/stderr/    │
│              exit_code/duration（复用 ControlMaster）  │
└─────────────────────────────────────────────────────┘
```

依赖关系：上层依赖下层，L1 是一切的地基。CMS 部署流水线 = L3 之上的一个预置模板。

---

## 4. L1 远程执行原语（Remote Exec）

### 4.1 执行通道设计

**首选通道（Unix）：复用 SFTP ControlMaster 池**

```
ssh -o ControlPath=<池socket> -o BatchMode=yes <user@host> <command>
```

- 非 PTY、非交互 spawn（`tokio::process::Command`），天然分离 stdout/stderr
- 复用池内已认证主连接，**零额外认证开销**，不产生新密码提示
- exit code 直接由 `ssh` 返回（远程命令退出码透传）

**回退通道 A：密钥认证直连（全平台）**
- 无可用主连接且为密钥认证时：`ssh -i <key> -o BatchMode=yes ...` 直接执行

**回退通道 B：PTY 喂密码（Windows 密码认证）**
- Windows 无 ControlMaster；沿用 `spawn_ssh_command_session()` 的 PTY 喂密码模式
- 输出为混合流，stderr 用 `command 2>&1` 包装时打标记分离，或接受混合输出（标记 `merged: true`）

**通道选择逻辑**

```
1. Unix 且目标连接的主连接池可用     → ControlMaster 通道
2. auth_method == key               → 直连通道
3. Windows + 密码认证               → PTY 喂密码通道（输出合并）
```

### 4.2 数据结构

```rust
pub struct RemoteExecRequest {
    pub connection_id: String,      // 关联 connections 表
    pub command: String,            // 渲染后的完整命令
    pub cwd: Option<String>,        // 远程工作目录（可选）
    pub timeout_secs: u64,          // 默认 60s，上限 600s
}

pub struct RemoteExecResult {
    pub success: bool,              // exit_code == 0
    pub exit_code: i32,
    pub stdout: String,             // 截断上限 256KB，保留头部+尾部
    pub stderr: String,
    pub merged: bool,               // PTY 回退通道时为 true
    pub duration_ms: u64,
    pub channel: String,            // "control_master" | "direct" | "pty"
    pub truncated: bool,
}
```

### 4.3 超时与取消

- 每次执行持有取消令牌（`tokio_util::sync::CancellationToken`）
- 超时/取消时 kill 进程树；ControlMaster 通道下远程命令通过 `ssh -O` 不受影响，可接受（命令自然结束）
- 取消事件立刻向前端回推 `task-progress { status: "cancelled" }`

### 4.4 落地位置

- 新文件 `src-tauri/src/app/remote_exec_service.rs`
- 复用 `sftp_service.rs` 的池获取逻辑（抽取 `acquire_master()` 为 pub 或提取共享模块 `infra/ssh/pool.rs`）
- 安全：进入执行前统一过 `safety.rs` 黑名单校验

---

## 5. L2 运维命令库（Ops Scripts）

### 5.1 概念：从 snippets 到参数化运维脚本

现有 `snippets` 是纯文本片段。新增 **ops_scripts** 表（不动 snippets，避免破坏现有 UX），或直接演进 snippets（见 §10 决策点 D2）。

### 5.2 脚本模型

```rust
pub struct OpsScript {
    pub id: String,
    pub name: String,               // "重启 Nginx"
    pub description: String,
    pub category: String,           // web / db / cert / backup / system
    pub icon: Option<String>,       // 复用现有图标系统
    pub script: String,             // 支持 {{param}} 占位符
    pub parameters: Vec<ScriptParam>,
    pub danger_level: Danger,       // Safe | Careful | Dangerous（建库时静态标注）
    pub timeout_secs: u64,
    pub confirm_required: bool,     // Dangerous 默认 true
}

pub struct ScriptParam {
    pub name: String,               // "service_name"
    pub label: String,              // "服务名"
    pub kind: ParamKind,            // Text | Select | MultiSelect
    pub default_value: Option<String>,
    pub options: Vec<String>,       // Select 用
    pub required: bool,
}
```

### 5.3 执行流程

```
用户选择脚本 → 表单渲染参数(Select/Text) → 渲染模板(shell 安全转义)
→ 安全黑名单校验 → danger 确认弹窗(可配置) → L1 执行 → 结果面板(stdout/stderr/耗时/退出码)
```

### 5.4 预置脚本包（首发 12 个，跟随应用分发）

| 分类 | 脚本 | 参数 |
|------|------|------|
| web | 重启/重载 Nginx | 服务名 |
| web | 查看 Nginx 访问日志尾 N 行 | 行数 |
| web | 查看 Nginx 错误日志尾 N 行 | 行数 |
| web | 测试 Nginx 配置 | - |
| cert | certbot 续期证书 | 域名 |
| cert | 查询证书到期时间 | 域名 |
| system | 磁盘空间 TOP | 挂载点 |
| system | 内存/CPU 概览 | - |
| system | 查看端口占用 | 端口号 |
| db | MySQL 数据库备份到指定路径 | 库名、输出路径 |
| backup | 打包目录为 tar.gz | 源目录、输出文件 |
| deploy | 部署后健康检查（curl 状态码） | URL、期望码 |

预置脚本只读（不可删除，可停用），用户可新建自己的脚本。

---

## 6. L3 任务编排（Task Orchestration）

### 6.1 任务定义（YAML/JSON 存储）

```yaml
id: task-nginx-deploy
name: 发布静态站点
connection_id: conn-vps-01        # 主目标（批量见 L5）
steps:
  - id: build
    type: local_build             # V2 接 SSG；M1 可先为 local_shell
    config: { command: "echo build" }

  - id: upload
    type: sftp_transfer
    config:
      direction: upload           # upload | download
      local_path: "{{site.dist_dir}}"
      remote_path: "/var/www/mysite"
      mode: mirror                # mirror(差异同步) | overwrite
      delete_orphaned: false

  - id: reload
    type: remote_exec
    config:
      script: "sudo nginx -s reload"
      timeout_secs: 30

  - id: verify
    type: remote_exec
    config:
      script: "curl -s -o /dev/null -w '%{http_code}' https://mysite.com"
      expect_stdout: "200"

  - id: rollback_on_fail
    type: remote_exec
    condition: "on_fail"          # 仅前序失败时执行
    config:
      script: "sudo cp -r /var/www/mysite.bak /var/www/mysite && sudo nginx -s reload"

retry:
  max_attempts: 1                 # 步骤级重试
  backoff_secs: 5
notify: true                      # 完成后系统通知（L4 提供）
```

### 6.2 步骤类型清单

| type | 说明 | 阶段 |
|------|------|------|
| `remote_exec` | L1 远程执行 | M1 |
| `sftp_transfer` | 上传/下载/镜像同步（调用现有 SFTP 服务） | M1 |
| `local_shell` | 本地命令（复用插件 shell 执行器） | M1 |
| `delay` | 等待秒数 | M1 |
| `remote_exec` + `expect_stdout/stderr/exit_code` | 断言型验证步骤 | M1 |
| `condition: on_fail/on_success/always` | 步骤条件 | M1 |
| `local_build` | SSG 构建（接 PRD 4.4） | M2+ |
| `local_exec` 前置表单 | 运行时问用户要参数 | M2 |

### 6.3 执行引擎

- 顺序执行（M1 不做并行分支）；每步骤产出 `StepResult`
- 断言失败 = 步骤失败；触发 `retry` 后仍失败 → 任务失败（除非该步骤标记 `continue_on_fail: true`）
- 每步骤实时推事件（见 §8），全量日志落库
- 同一任务同一时刻只允许一个运行实例（防重复触发）

### 6.4 运行历史与回溯

- `task_runs` 记录每次运行：触发方式（手动/定时/批量）、起止时间、总状态、耗时
- `task_run_steps` 记录逐步骤：命令原文、渲染后命令、stdout/stderr（截断存储）、exit_code、断言结果、重试次数
- 运行详情页可查看完整输出；失败步骤直接"复制诊断信息"

---

## 7. L4 定时调度与通知

### 7.1 调度器

- 应用内调度：`tokio` 任务 + 简易 cron 表达式解析（5 字段，新增 `cron` crate 或手写最小解析器，见决策点 D4）
- 触发时机：定时到点 / 应用启动时补跑（可选 `run_on_startup`、`catch_up` 策略）
- 调度仅本地生效；应用未运行则不触发（诚实告知用户，不做云端假象）

### 7.2 通知

- 任务结束（成功/失败）→ 系统通知（tauri notification 插件，需新增依赖 `tauri-plugin-notification`）
- 失败通知点击 → 直达运行详情页
- 应用内通知中心（复用现有 MUI Snackbar 体系 + 常驻铃铛入口）

### 7.3 无人值守安全门（复用 AI 权限模式）

- 任务级 `permission_mode: Manual | Scheduled`
- `Scheduled` 模式要求：所有步骤脚本过黑名单 + 无 `dangerous` 级脚本 + 用户在任务编辑页显式开启"允许无人值守"
- 开启时弹一次性确认（复用 agent 权限确认 UI 风格）

---

## 8. L5 批量执行（Fleet）

- 任务可绑定**多个 connection_id**（服务器组）
- 执行时逐台（M2）或并行（M3）运行同一编排
- 结果聚合视图：每台服务器一行（主机名/状态/耗时/关键输出），可展开详情
- 差异对比：同一命令在多台的输出 diff 高亮（典型场景：对比各机配置）
- 服务器组独立管理（分组 = 现有"连接分组"需求的落地点，见 PRD FR-E1）

---

## 9. 数据库表设计（新增 4 张表）

```sql
-- 参数化运维脚本
CREATE TABLE ops_scripts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT DEFAULT 'general',
  icon TEXT,
  script TEXT NOT NULL,               -- 含 {{param}}
  parameters_json TEXT DEFAULT '[]',  -- Vec<ScriptParam>
  danger_level TEXT DEFAULT 'Safe',   -- Safe|Careful|Dangerous
  timeout_secs INTEGER DEFAULT 60,
  confirm_required INTEGER DEFAULT 0,
  is_builtin INTEGER DEFAULT 0,       -- 预置脚本不可删
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 任务编排定义
CREATE TABLE automation_tasks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  connection_ids_json TEXT DEFAULT '[]', -- L5 多目标
  steps_json TEXT NOT NULL,              -- 步骤数组
  retry_json TEXT,
  notify INTEGER DEFAULT 0,
  schedule_cron TEXT,                    -- NULL = 仅手动
  run_on_startup INTEGER DEFAULT 0,
  permission_mode TEXT DEFAULT 'Manual',
  last_run_at INTEGER,
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 任务运行记录
CREATE TABLE task_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL,        -- manual|scheduled|fleet|deploy
  connection_id TEXT,                -- fleet 时为单机运行记录的所属连接
  status TEXT NOT NULL,              -- running|success|failed|cancelled
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  duration_ms INTEGER,
  error_summary TEXT DEFAULT '',
  FOREIGN KEY(task_id) REFERENCES automation_tasks(id) ON DELETE CASCADE
);
CREATE INDEX idx_task_runs_task ON task_runs(task_id, started_at DESC);

-- 步骤级运行日志
CREATE TABLE task_run_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  step_id TEXT NOT NULL,
  step_type TEXT NOT NULL,
  command_rendered TEXT DEFAULT '',
  status TEXT NOT NULL,              -- running|success|failed|skipped
  exit_code INTEGER,
  stdout TEXT DEFAULT '',
  stderr TEXT DEFAULT '',
  assertion_passed INTEGER,
  attempt INTEGER DEFAULT 1,
  duration_ms INTEGER,
  FOREIGN KEY(run_id) REFERENCES task_runs(id) ON DELETE CASCADE
);
CREATE INDEX idx_run_steps_run ON task_run_steps(run_id, step_index);
```

迁移方式沿用 `database.rs::migrate()` 的 check-column-then-ALTER 模式；stdout/stderr 存储截断（头部 16KB + 尾部 16KB）。

---

## 10. IPC 命令清单（Tauri Commands）

```
# L1 远程执行
remote_exec(connection_id, command, cwd?, timeout_secs?) -> RemoteExecResult

# L2 运维脚本
ops_list_scripts(category?) -> Vec<OpsScript>
ops_save_script(script) -> OpsScript
ops_delete_script(id)
ops_toggle_script(id, enabled)
ops_run_script(id, params, connection_id) -> RemoteExecResult

# L3 任务
automation_list_tasks() -> Vec<AutomationTask>
automation_get_task(id) -> AutomationTask
automation_save_task(task) -> AutomationTask
automation_delete_task(id)
automation_run_task(id, params_override?) -> run_id
automation_cancel_run(run_id)
automation_list_runs(task_id?, limit?) -> Vec<TaskRun>
automation_get_run(run_id) -> TaskRunDetail(含步骤)

# L4 调度
automation_set_schedule(task_id, cron | null, run_on_startup)
automation_list_schedules() -> Vec<ScheduleInfo>

# L5 批量
automation_run_fleet(task_id, connection_ids) -> Vec<run_id>
```

## 11. 事件定义（沿用 kebab-case）

```
remote-exec-output      { run_id, step_id?, chunk }     # 流式输出（大输出场景）
task-progress           { run_id, task_id, step_index, status, summary }
task-step-started       { run_id, step_id, step_type, command_rendered }
task-step-finished      { run_id, step_id, status, exit_code, duration_ms }
task-run-finished       { run_id, task_id, status, duration_ms }
ops-scripts-changed     { }                              # 增删改后广播
```

---

## 12. 前端界面规划

| 页面/入口 | 内容 |
|----------|------|
| 运维中心（新主导航项） | 三标签：命令库 / 任务 / 运行历史 |
| 命令库页 | 分类侧栏 + 脚本卡片（图标/名称/danger 标记），点击弹参数表单 |
| 任务编辑器 | 步骤拖拽排序 + 每步骤类型配置面板 + YAML 源码双视图 |
| 运行详情页 | 步骤时间线（状态色点/耗时）+ 展开式 stdout/stderr（等宽字体/复制按钮） |
| 终端页内快捷入口 | 选中连接右键 → "运行运维脚本…"（把当前连接带入参数表单） |
| 通知中心 | 铃铛 + 任务完成/失败列表 |

复用现有：MUI 主题、图标系统（icon_service）、通知 Snackbar、ErrorBoundary、i18n（新增 `ops.json` 命名空间，中/英）。

---

## 13. 阶段划分与验收标准

### Phase A — L1+L2（运维命令可用）★ 建议立即启动
- [ ] `remote_exec_service` 三通道实现 + 单元测试（mock ssh）
- [ ] `ops_scripts` 表 + 预置 12 脚本 + 命令库 UI + 参数表单
- [ ] `remote_exec` IPC + 结果面板
- **验收**：对一台真实 VPS，从命令库一键"查看磁盘空间"并在结果面板看到结构化输出，全程不开终端窗口

### Phase B — L3（任务编排）
- [ ] 任务 DSL + 执行引擎 + 断言/重试/条件
- [ ] 三张运行表 + 运行历史 UI + 实时进度事件
- [ ] CMS 部署 MVP 前置：`sftp_transfer(mirror)` 差异同步步骤打通
- **验收**：创建 3 步任务（上传→重载→curl 验证 200），失败注入后看到断言失败 + 重试 + 失败通知

### Phase C — L4（定时与通知）
- [ ] 调度器 + cron 解析 + 启动补跑
- [ ] 系统通知（新增 tauri-plugin-notification）+ 通知中心
- [ ] 无人值守安全门
- **验收**：配置每日备份任务，杀掉应用后重新启动，可看到补跑记录

### Phase D — L5（批量）
- [ ] 连接分组 + 服务器组 + fleet 执行 + 聚合视图 + 多机 diff
- **验收**：3 台服务器同时执行"查看磁盘"，聚合视图一目了然

---

## 14. 决策记录（D1–D6，2026-08-16 拍板）

| # | 决策点 | 备选 | 决策 | 说明 |
|---|--------|------|------|------|
| D1 | ControlMaster 池抽取 | 抽 `infra/ssh/pool.rs` 共享 vs sftp_service 内 pub 方法 | ✅ 抽共享模块 `infra/ssh/pool.rs` | L3/L5 与 CMS 部署都要用；同时是拆分 3983 行 sftp_service.rs 的第一步 |
| D2 | 运维脚本载体 | 新 `ops_scripts` 表 vs 演进 `snippets` | ✅ 新表 | 不破坏现有 snippets UX；预置脚本用 `is_builtin` 标记 |
| D3 | Windows 密码认证远程执行 | PTY 混合输出（标记 merged）vs 强制要求密钥 | ✅ PTY 混合 + UI 提示推荐密钥 | Windows 是商城首发平台，不能把密码认证用户挡在门外；输出标记 `merged: true` 由前端区分展示 |
| D4 | cron 解析 | 引入 `cron` crate vs 手写 5 字段解析器 | ✅ 引入 `cron` crate | 成熟、体积小；手写解析器边界情况多 |
| D5 | sudo 命令 | sudo 白名单子命令放行 vs 全放行 | ✅ 白名单子命令（nginx/certbot/systemctl/journalctl） | 白名单内容随预置脚本包维护，用户自定义脚本中的 sudo 默认拦截 |
| D6 | 大输出流式 | 落库截断 + 事件流式 | ✅ 双轨：UI 实时流 + 落库截断（头 16KB + 尾 16KB） | 大输出（如日志查看）靠事件流实时看，历史回溯靠落库 |

> 与 CMS 数据库的迁移机制统一：本方案 4 张表与 [cms-database-design.md](./cms-database-design.md) 的 7 张表共用同一套 `PRAGMA user_version` 版本化迁移（见该文档 §3），不再沿用 check-column-then-ALTER 手工链。

**主要技术风险**

1. Windows 无 ControlMaster → 密码认证下远程 exec 体验降级（D3），需在文档/UI 明示推荐密钥认证
2. `sudo` 交互密码无法无人值守 → 依赖用户配置 NOPASSWD（预置脚本说明文档中给出指引）
3. 长任务与池 TTL（240s 空闲回收）冲突 → 执行期间持有租约，任务结束释放

---

## 15. 与 PRD 的映射

| PRD 条目 | 本方案承接 |
|----------|-----------|
| FR-D1 一键部署 | L3 任务编排的预置模板 |
| FR-D2 部署差异预览 | `sftp_transfer(mirror)` 步骤的 dry-run 输出 |
| FR-D4 远程服务器管理 | L2 预置脚本包（web/cert/system） |
| FR-D6 部署历史回滚 | task_runs 历史 + rollback 步骤 |
| FR-D8 部署通知 | L4 通知 |
| FR-E1 连接分组 | L5 服务器组 |
| FR-E2 命令建议 | L2 命令库（数据基础） |
| FR-E5 一键运维 | L2 全部 |
