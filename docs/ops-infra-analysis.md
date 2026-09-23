# WebCraft 运维自动化基础设施分析报告

> 分析范围：`web-craft` 项目运维自动化相关全部代码
> 分析日期：2026-08-19

---

## 一、运维脚本系统（ops_service.rs）

### 1.1 整体定位

L2 层运维命令库（参考 `docs/automation-ops-plan.md` 五层架构），提供**参数化、可复用**的远程运维脚本。执行流：模板渲染 → 连接解析 → L1 远程执行 → 历史记录持久化。

### 1.2 预置脚本清单（共 12 个，5 大分类）

| 分类 | 脚本 ID | 名称 | 危险等级 | 参数 | 核心能力 |
|------|---------|------|---------|------|---------|
| **web** | `ops-web-nginx-reload` | 重启/重载 Nginx | Careful | service_name(select) | systemctl reload |
| **web** | `ops-web-nginx-access` | 查看 Nginx 访问日志 | Safe | lines(text) | tail access.log |
| **web** | `ops-web-nginx-error` | 查看 Nginx 错误日志 | Safe | lines(text) | tail error.log |
| **web** | `ops-web-nginx-test` | 测试 Nginx 配置 | Careful | — | nginx -t |
| **web** | `ops-web-env-check` | Web 环境检测 | Safe | domain, deploy_path | **结构化 JSON 报告**（见下文详述） |
| **cert** | `ops-cert-renew` | certbot 续期证书 | Careful | domain(text) | certbot renew |
| **cert** | `ops-cert-expiry` | 查询证书到期时间 | Safe | domain(text) | openssl s_client |
| **system** | `ops-system-disk` | 磁盘空间 | Safe | mount_point(select) | df -h |
| **system** | `ops-system-mem` | 内存/CPU 概览 | Safe | — | free + nproc + uptime |
| **system** | `ops-system-port` | 查看端口占用 | Safe | port(text) | ss/netstat |
| **db** | `ops-db-mysql-backup` | MySQL 数据库备份 | **Dangerous** | db_name, output_path | mysqldump + gzip |
| **backup** | `ops-backup-tar` | 打包目录为 tar.gz | Careful | source_dir, output_file | tar czf |
| **deploy** | `ops-deploy-health` | 部署后健康检查 | Safe | url, expected_code(select) | curl 状态码断言 |

### 1.3 脚本定义模型

**核心结构**（`src-tauri/src/core/types.rs`）：

```rust
pub struct OpsScript {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,          // web / cert / system / db / backup / deploy
    pub icon: Option<String>,
    pub script: String,            // 支持 {{param}} 占位符
    pub parameters: Vec<ScriptParam>,
    pub danger_level: Danger,      // Safe | Careful | Dangerous
    pub timeout_secs: u64,
    pub confirm_required: bool,
    pub is_builtin: bool,          // 预置脚本只读
    pub enabled: bool,
}
```

**参数类型** `ParamKind`：`Text` / `Select` / `MultiSelect`

### 1.4 存储机制

- **表**：`ops_scripts`（脚本定义）+ `ops_script_runs`（执行历史）
- **预置脚本**：应用启动时通过 `ensure_builtins()` 幂等播种，`is_builtin=true` 标记只读，不可删除/修改，仅可停用
- **用户脚本**：可增删改，`is_builtin=false`
- **执行历史**：每脚本最多保留 100 条（`MAX_SCRIPT_HISTORY`），自动修剪最旧记录

### 1.5 执行流程

```
用户选脚本 → 表单填参数 → shell-safe 模板渲染 → 安全黑名单校验
    → danger 等级确认弹窗 → L1 RemoteExecService 执行
    → 结果返回 + 历史记录落库（审计追踪）
```

**关键安全特性**：
- 模板渲染使用 `render_template_shell_safe()`，对参数做 shell 安全转义
- 未填的占位符会阻断执行（检测 `{{` 残留）
- 危险命令黑名单（`safety.rs`）：`rm -rf /`、`mkfs`、`dd if=`、fork bomb、`shutdown`、`reboot` 等
- 三级危险等级：Safe（无确认）/ Careful（需确认）/ Dangerous（需确认，红色标记）

---

## 二、自动化任务系统（automation）

### 2.1 整体定位

L3 层任务编排引擎，支持多步骤工作流的顺序执行、条件分支、重试、断言验证。

### 2.2 任务定义模型

```rust
pub struct AutomationTask {
    pub id: String,
    pub name: String,
    pub description: String,
    pub connection_ids: Vec<String>,    // 支持多连接（L5 批量基础）
    pub steps: Vec<TaskStep>,
    pub retry: Option<RetryConfig>,     // 全局重试配置
    pub notify: bool,                   // 完成通知
    pub run_on_startup: bool,           // 启动补跑
    pub enabled: bool,
}
```

### 2.3 步骤类型（5 种）

| 步骤类型 | 说明 | 状态 |
|---------|------|------|
| `remote_exec` | 远程 SSH 命令执行 | ✅ 已实现 |
| `local_shell` | 本地 shell 命令 | ✅ 已实现 |
| `sftp_transfer` | SFTP 文件上传/下载 | ✅ 已实现 |
| `delay` | 等待秒数 | ✅ 已实现 |
| `local_build` | SSG 构建 | ❌ 占位，返回"尚不支持" |

### 2.4 任务编排能力

**已实现的编排原语**：

1. **顺序执行**：步骤按索引顺序执行，每步产出 `TaskRunStep` 记录
2. **条件分支**：`StepCondition` 三选一
   - `on_success`（默认，仅前序成功时执行）
   - `on_fail`（仅前序失败时执行，用于回滚）
   - `always`（无论成功失败都执行）
3. **步骤级重试**：`RetryConfig { max_attempts, backoff_secs }`，指数退避
4. **断言验证**：对 shell 步骤可设置
   - `expect_stdout`：stdout 需包含指定字符串
   - `expect_stderr`：stderr 需包含指定字符串
   - `expect_exit_code`：退出码需等于指定值
5. **失败继续**：`continue_on_fail` 标记，步骤失败不中断整个任务
6. **超时控制**：每步骤独立 `timeout_secs`
7. **运行取消**：`CancellationToken` 支持中途取消
8. **单实例锁**：同一任务同时只允许一个运行实例

**未实现（设计文档规划中）**：
- L4 定时调度（cron）
- L4 系统通知
- L5 批量执行（多服务器并行）
- 步骤并行/分支（设计为顺序执行）

### 2.5 执行引擎核心

- **异步运行**：`run_task()` 立即返回 `run_id`，实际执行在 tokio 任务中
- **实时事件**：通过 Tauri 事件向前端推送进度
  - `task-step-started`：步骤开始
  - `task-step-finished`：步骤完成
  - `task-run-finished`：整个任务完成
- **输出截断**：stdout/stderr 各保留头 256KB + 尾 256KB（设计文档是 16KB+16KB，实际实现更大）
- **运行历史**：`task_runs` + `task_run_steps` 两张表，完整记录每次运行

---

## 三、AI 运维助手

### 3.1 Agent 架构

AI Agent 系统采用**工具调用（Tool Calling）**架构，核心由 `run_agent` 命令驱动。

**Agent 配置模型**：
```typescript
interface AgentDto {
  id: string;
  name: string;
  modelId: string | null;
  systemPrompt: string;
  temperature: number;
  maxIterations: number;     // 最大迭代轮数
  toolIds: string[];         // 可用工具列表
  triggerType: string;
  autoConfirm: boolean;      // 自动确认
  permissionMode: string;    // 权限模式：auto / confirm
  alwaysAllowedTools: string[]; // 始终允许的工具（无需确认）
}
```

### 3.2 运维助手 Agent（Ops Assistant）

**专用 Agent ID**：`OPS_ASSISTANT_AGENT_ID`（固定，幂等播种）

**核心配置**：
- **工具**：仅 `terminal_session`（终端会话工具）
- **权限模式**：`permission_mode = "auto"` + `auto_confirm = true`
- **始终允许工具**：`["terminal_session"]`
- **温度**：0.3（偏低，保持准确性）
- **最大迭代**：60 轮
- **工作目录**：独立 workspace

### 3.3 terminal_session 工具能力

`TerminalSessionTool` 是运维助手的核心执行通道：
- 操作**已建立的 SSH 终端会话**（前端传入 session_id）
- 支持 `write` 动作（写入命令）和 `read_output` 动作（读取输出）
- sudo 密码由终端会话自动应答，Agent 可直接使用 sudo
- 内置安全黑名单拦截危险命令

### 3.4 运维助手系统提示词能力范围

从 `OPS_ASSISTANT_SYSTEM_PROMPT_ZH/EN` 可知，运维助手被授权执行：

1. **环境检测**：Web 服务器、数据库、缓存、运行时的安装与状态检查
2. **服务管理**：Nginx、数据库、Redis 等的重启/重载/启停
3. **日志分析**：访问日志、错误日志、系统日志的排查
4. **部署协助**：部署目录、文件权限、磁盘空间检查
5. **性能排查**：CPU/内存/磁盘/网络瓶颈分析
6. **安全检查**：端口监听、防火墙、登录日志
7. **日常维护**：磁盘清理、数据备份、包更新（需用户确认）

### 3.5 能否执行安装命令？

**可以，但有条件**：
- ✅ **技术能力上**：运维助手通过 `terminal_session` 工具拥有完整的 SSH 终端访问权，可以执行任意 shell 命令（包括 `apt install`、`yum install` 等安装命令）
- ✅ **权限配置上**：`permission_mode = "auto"` + `auto_confirm = true` + `always_allowed_tools` 包含 `terminal_session`，意味着工具调用无需用户确认
- ⚠️ **提示词约束上**：系统提示要求"高风险操作先解释影响并请求用户确认"，但这是软约束（依赖模型遵守）
- ✅ **安全防护上**：危险命令黑名单（`rm -rf /`、`mkfs` 等）在执行层硬拦截

**另外两个专用 Agent 对比**：
- **远程桌面安装助手**：专门安装 VNC 远程桌面，有明确的"PHASE 2 — 仅在用户明确同意后才安装"两阶段机制
- **服务器环境安装助手**：专门探测和安装部署环境（nginx、systemd、防火墙）

---

## 四、前端交互

### 4.1 SiteOpsPanel 整体结构

**文件**：`src/components/ops/SiteOpsPanel.tsx`

**入口方式**：通过 `SiteOpsDialog` 弹窗打开，最大宽度 `xl`，高度 `calc(100vh - 64px)`

**四个 Tab 页**：

| Tab | 图标 | 功能 |
|-----|------|------|
| **env**（环境检测） | Monitor | 调用 `ops-web-env-check` 脚本，展示结构化报告 |
| **scripts**（命令库） | ListChecks | 分类侧栏 + 脚本卡片网格，点击运行脚本 |
| **tasks**（任务编排） | Tray | 任务卡片列表，新建/编辑/运行任务 |
| **history**（运行历史） | ListMagnifyingGlass | 任务历史 + 脚本历史，双 tab 切换 |

**顶部操作区**：
- 渐变色 **"AI 运维助手"按钮**（紫色→蓝色渐变）：点击后创建 SSH 终端会话 → 播种运维 Agent → 打开独立 AI 窗口（`AiCopilotPage`）
- 右侧按钮随 Tab 切换：新建脚本 / 新建任务 / 历史筛选

**脚本运行弹窗**（`ScriptRunDialog`）：
- 顶部显示危险等级 chip + 脚本名 + 目标主机
- 参数表单（Text/Select/MultiSelect 三种控件）
- 危险操作二次确认（Careful/Dangerous 级）
- 执行结果面板（可折叠，stdout/stderr 等宽字体深色背景）

### 4.2 EnvCheckPanel 结果展示方式

**文件**：`src/components/ops/EnvCheckPanel.tsx`

**数据结构**（`src/proto/env-check.ts`）：
```typescript
interface EnvCheckResult {
  summary: {
    score: number;      // 0-100 综合评分
    total: number;
    passed: number;
    warning: number;
    failed: number;
    info: number;
  };
  groups: EnvCheckGroup[];  // 分组列表
}
```

**展示层级**：

```
┌─────────────────────────────────────────────────┐
│  🔵 评分圆环（64px）  环境检测标题              │
│      92分           站点名称 · 检测时间         │
│  ┌───────┬─────────┬─────────┬───────┐         │
│  │ ✓ 12  │ ⚠ 3    │ ✗ 1    │ ℹ 5  │  刷新按钮 │
│  │ 通过  │ 警告    │ 失败    │ 信息 │         │
│  └───────┴─────────┴─────────┴───────┘         │
├─────────────────────────────────────────────────┤
│  🖥 系统基础  ────────────────────  8 项        │
│  ┌─────────────────────────────────────────┐   │
│  │  ✓ 操作系统   Ubuntu 22.04 LTS          │   │
│  │         Kernel 5.15.0 · x86_64          │   │
│  │  ✓ 内存       2048M / 4096M (50%)       │   │
│  │  ⚠ 磁盘       15G / 20G (75%)           │   │
│  │         剩余 5G                          │   │
│  └─────────────────────────────────────────┘   │
│  🌐 Web 服务  ────────────────────  5 项       │
│  ...                                            │
└─────────────────────────────────────────────────┘
```

**状态色**：pass=#4CAF50 (绿), warning=#FF9800 (橙), fail=#EF5350 (红), info=#2196F3 (蓝)

**评分规则**（Python 脚本内计算）：
- pass 得 100 分，warning 得 60 分，fail 得 0 分，info 不计入
- score = (pass×100 + warning×60) / (pass + warning + fail)

**检测分组**（7 组，来自 Python 脚本）：
1. **system**（系统基础）：OS、运行时间、CPU、内存、磁盘、Inode
2. **web**（Web 服务）：Nginx 状态 + 版本 + 配置检测
3. **database**（数据库）：MySQL/MariaDB + PostgreSQL（连接数、数据目录）
4. **cache**（缓存）：Redis（内存、持久化、连接数）
5. **ports**（端口监听）：80, 443, 3306, 5432, 6379, 3001
6. **ssl**（SSL 证书）：仅 domain 非空时检测（有效期、颁发者、证书域名）
7. **site**（站点服务）：webcraft-server 进程、部署路径、项目文件、Nginx 站点配置

**空状态**：
- 无连接 → 提示"未选择服务器"
- 有连接未检测 → 大图标 + 说明文字 + "开始检测"按钮
- 检测中 → 居中加载动画 + "检测中..."
- 检测失败 → Alert 错误提示 + 重试按钮

**自动触发逻辑**：切换到 env Tab 且有连接时，首次自动触发检测。

### 4.3 TaskEditor 任务编辑器

**文件**：`src/components/automation/TaskEditor.tsx`

**结构**：大弹窗（maxWidth="lg"）
- 顶部：任务名称 + 描述
- 连接选择：多选 Autocomplete
- 开关选项：启用 / 启动补跑 / 通知
- 步骤列表：上下移动排序 + 编辑/删除
- 步骤编辑器（子弹窗）：
  - 步骤类型 / 名称 / 执行条件
  - Shell 命令（多行输入）
  - SFTP：方向 + 本地路径 + 远程路径
  - Delay：秒数
  - 高级选项：超时、失败继续、重试配置（最大次数+退避）
  - 断言：期望 stdout / stderr / 退出码

---

## 五、"环境检测 + 一键修复"功能实现思路建议

### 5.1 现状评估

**已有基础**：
1. ✅ 环境检测脚本 `ops-web-env-check` 已完整实现，输出结构化 JSON
2. ✅ 前端 EnvCheckPanel 已能漂亮地展示检测结果
3. ✅ 运维脚本系统（参数化、安全校验、历史记录）完整可用
4. ✅ AI 运维助手具备通过终端执行修复命令的能力
5. ✅ 自动化任务系统可编排多步骤修复流程

**当前缺口**：
1. ❌ 检测结果与修复动作之间**没有关联**——用户看完检测报告后，需要自己去脚本库找对应脚本执行
2. ❌ 没有"一键修复"入口
3. ❌ 没有修复方案的推荐/编排
4. ❌ 修复后的自动复检机制缺失

### 5.2 实现方案

#### 方案 A：脚本映射 + 一键修复（推荐，最快落地）

**核心思路**：为每个检测项（item）关联对应的修复脚本，在 EnvCheckPanel 中直接展示"一键修复"按钮。

**后端改动**：

1. **扩展检测脚本输出**：在 `ops-web-env-check` 的 Python 脚本中，为每个 item 增加 `fix_script_id` 和 `fix_params` 字段（可选，仅可修复的项有）

```python
# 示例：Nginx 未运行时
web_items.append({
    "name": "Nginx",
    "status": "fail",
    "value": "未运行",
    "detail": "nginx 已安装但进程未启动",
    "fix_script_id": "ops-web-nginx-reload",  # 新增
    "fix_params": {"service_name": "nginx"},    # 新增
    "fix_hint": "启动 Nginx 服务"               # 新增
})
```

2. **扩展前端类型**（`src/proto/env-check.ts`）：
```typescript
export interface EnvCheckItem {
  name: string;
  status: EnvCheckStatus;
  value: string;
  detail?: string;
  fixScriptId?: string;   // 新增
  fixParams?: Record<string, string>;  // 新增
  fixHint?: string;       // 新增
}
```

3. **EnvCheckPanel 增加修复按钮**：
   - 对 `status === "fail" || status === "warning"` 且有 `fixScriptId` 的项，在右侧显示"一键修复"按钮
   - 点击后调用 `opsRunScript(fixScriptId, fixParams, connectionId)`
   - 执行中按钮 loading，执行完成后自动刷新检测结果

4. **批量修复**：
   - 在 summary 区域增加"一键修复全部"按钮
   - 收集所有可修复的 fail/warning 项，依次执行
   - 执行过程用进度条/步骤列表展示
   - 全部完成后自动复检

**优点**：改动小，复用现有脚本系统，确定性高，无 AI 不确定性
**缺点**：修复方案固定，无法处理复杂场景

#### 方案 B：AI 智能修复（体验更好，依赖 AI）

**核心思路**：利用现有的运维助手 Agent，把检测结果作为上下文喂给 AI，由 AI 生成修复方案并执行。

**实现方式**：

1. **在 EnvCheckPanel 增加"AI 智能修复"按钮**
2. **点击后流程**：
   - 将检测结果（JSON）序列化为文本
   - 构造 prompt：`"以下是服务器环境检测结果，请分析问题并给出修复方案：\n${envCheckJson}"`
   - 调用现有 `ensureOpsAssistantAgent` + `runAgent` 流程
   - 在现有 AI Copilot 窗口中展示修复方案和执行过程

3. **或者更集成的方式**：直接在 EnvCheckPanel 内嵌一个修复建议面板
   - 每个 fail/warning 项下面显示 AI 生成的修复建议
   - 用户点击"应用修复"后执行对应命令

**优点**：智能化，能处理复杂和非预期场景，给出分析解释
**缺点**：依赖 AI 模型质量，有不确定性，执行速度慢

#### 方案 C：修复任务模板（介于两者之间，推荐中期方向）

**核心思路**：预置一套"环境修复"自动化任务模板，检测出问题后自动组装任务步骤并执行。

**实现方式**：

1. **定义修复规则映射表**（后端 Rust 代码中）：
```rust
// 问题类型 → 修复步骤映射
struct FixRule {
    condition: String,      // 匹配条件（如 "nginx_not_running"）
    task_steps: Vec<TaskStep>,  // 修复步骤
}
```

2. **新增命令 `env_check_and_fix`**：
   - 运行环境检测
   - 解析结果，匹配修复规则
   - 动态组装一个自动化任务
   - 执行任务并返回进度
   - 完成后自动复检

3. **前端展示**：
   - 在 EnvCheckPanel 显示"检测并修复"按钮
   - 修复过程用任务运行进度 UI 展示（复用 RunHistory 组件）

**优点**：结构化、可审计、可复用任务编排能力
**缺点**：规则维护成本高，初期覆盖场景有限

### 5.3 推荐实施路径

**Phase 1（快速落地）**：采用方案 A
- 在检测脚本中为常见问题增加 `fix_script_id` 映射
- EnvCheckPanel 增加单项目一键修复按钮
- 修复后自动刷新该项/全量复检

**Phase 2（体验升级）**：叠加方案 B
- 增加"AI 诊断修复"入口
- 将检测结果传给运维助手 Agent
- 利用现有 AI Copilot 窗口展示修复过程

**Phase 3（体系化）**：演进到方案 C
- 建立修复规则库
- 用自动化任务编排复杂修复流程
- 支持修复方案的保存和复用

### 5.4 关键设计要点

1. **安全优先**：
   - 修复操作默认需要用户确认（特别是 Careful/Dangerous 级）
   - 高危修复（如重启服务、修改配置）必须二次确认
   - 修复操作全部记入执行历史，可审计回溯

2. **修复后复检**：
   - 单项修复后刷新该分组或全量重检
   - 批量修复后自动全量复检，对比修复前后分数变化
   - 展示"修复前 → 修复后"的对比视图

3. **不可自动修复的项**：
   - 标记为"需手动处理"
   - 给出详细的修复建议文字
   - 可提供"在终端中打开"快捷入口

4. **数据结构扩展建议**：
   - `EnvCheckItem` 增加 `fixable: boolean`、`fixScriptId`、`fixParams`、`fixHint`
   - `EnvCheckGroup` 增加 `fixableCount`（可修复项数量）
   - `EnvCheckSummary` 增加 `fixableFailed`、`fixableWarning`

5. **与 AI 助手的协同**：
   - 简单、确定性问题 → 脚本一键修复（快、可靠）
   - 复杂、需要诊断的问题 → AI 助手介入（智能、灵活）
   - 检测结果作为 AI 助手的上下文输入，减少"先排查再修复"的轮次
