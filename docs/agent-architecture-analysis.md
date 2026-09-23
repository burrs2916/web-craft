# WebCraft Agent 系统架构深度分析

## 目录

1. [Agent 定义和播种](#1-agent-定义和播种)
2. [Agent 运行机制](#2-agent-运行机制)
3. [AI Copilot 窗口](#3-ai-copilot-窗口)
4. [Agent Service 代码结构](#4-agent-service-代码结构)
5. [创建新 Agent 需要修改的文件](#5-创建新-agent-需要修改的文件)

---

## 1. Agent 定义和播种

### 1.1 数据库表结构

Agent 系统使用 SQLite 数据库，共 **6 张表**，定义在 `src-tauri/src/infra/storage/database.rs` 的 `v1_initialize` 中，并经过多次 ALTER TABLE 迁移。

#### 层级关系

```
ai_providers (AI 服务商)
    └── ai_endpoints (API 端点)
            └── ai_models (模型)
                    └── ai_agents (智能体)
                            └── ai_conversations (会话)
                                    └── ai_messages (消息)
```

#### ai_providers — AI 服务商

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 服务商 ID |
| name | TEXT NOT NULL | 名称 |
| api_key | TEXT NOT NULL DEFAULT '' | API Key |
| logo | TEXT NOT NULL DEFAULT '' | Logo（后加字段） |
| enabled | INTEGER NOT NULL DEFAULT 1 | 是否启用 |
| created_at / updated_at | INTEGER NOT NULL | 时间戳 |

#### ai_endpoints — API 端点

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 端点 ID |
| provider_id | TEXT NOT NULL, FK → ai_providers(id) ON DELETE CASCADE | 所属服务商 |
| name | TEXT NOT NULL | 名称 |
| api_type | TEXT NOT NULL DEFAULT 'openai-completions' | API 类型：`openai-completions` / `anthropic-messages` / `openai-responses` |
| base_url | TEXT NOT NULL DEFAULT '' | API 基础 URL |
| auth_type | TEXT NOT NULL DEFAULT 'bearer' | 鉴权方式：`bearer` / `x-api-key` / `custom` |
| custom_auth_header | TEXT NOT NULL DEFAULT '' | 自定义鉴权头名 |
| enabled | INTEGER NOT NULL DEFAULT 1 | 是否启用 |
| created_at / updated_at | INTEGER NOT NULL | 时间戳 |

#### ai_models — 模型

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 模型 ID |
| name | TEXT NOT NULL | 显示名称 |
| ref_key | TEXT NOT NULL | 模型引用 key（传给 API 的 model 参数） |
| endpoint_id | TEXT NOT NULL, FK → ai_endpoints | 所属端点 |
| reasoning | INTEGER NOT NULL DEFAULT 0 | 是否推理模型 |
| input_types | TEXT NOT NULL DEFAULT '["text"]' | 支持的输入类型（JSON 数组） |
| context_window | INTEGER NOT NULL DEFAULT 128000 | 上下文窗口大小 |
| max_tokens | INTEGER NOT NULL DEFAULT 4096 | 最大输出 tokens |
| enabled | INTEGER NOT NULL DEFAULT 1 | 是否启用 |
| created_at / updated_at | INTEGER NOT NULL | 时间戳 |

#### ai_agents — 智能体（核心表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | Agent ID |
| name | TEXT NOT NULL | 名称 |
| description | TEXT NOT NULL DEFAULT '' | 描述 |
| model_id | TEXT, FK → ai_models(id) ON DELETE SET NULL | 主模型 |
| system_prompt | TEXT NOT NULL DEFAULT '' | 系统提示词全文 |
| temperature | REAL NOT NULL DEFAULT 0.7 | 温度 |
| max_iterations | INTEGER NOT NULL DEFAULT 10 | 最大迭代次数（工具调用轮次） |
| tool_ids | TEXT NOT NULL DEFAULT '[]' | 可用工具 ID 列表（JSON 数组） |
| trigger_type | TEXT NOT NULL DEFAULT 'manual' | 触发类型：`manual` / `auto_failure` / `auto_save` / `auto_both` |
| auto_confirm | INTEGER NOT NULL DEFAULT 0 | 是否自动确认 |
| permission_mode | TEXT NOT NULL DEFAULT 'confirm' | 权限模式：`confirm` / `auto` |
| always_allowed_tools | TEXT NOT NULL DEFAULT '[]' | 始终允许的工具（JSON 数组） |
| fallback_model_id | TEXT, FK → ai_models(id) ON DELETE SET NULL | 回退模型 |
| workspace_dir | TEXT NOT NULL DEFAULT '' | 工作目录 |
| created_at / updated_at | INTEGER NOT NULL | 时间戳 |

> **注意**：`tool_ids` 为空数组 `[]` 时语义为「全部工具」——注册所有内置工具 + 所有已启用插件工具。前端 `agentStore.ts` 加载时会将空数组规范化为全部 7 个内置工具名。

#### ai_conversations — 会话

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 会话 ID |
| agent_id | TEXT NOT NULL, FK → ai_agents(id) ON DELETE CASCADE | 所属 Agent |
| title | TEXT NOT NULL DEFAULT '' | 会话标题 |
| metadata | TEXT NOT NULL DEFAULT '{}' | 元数据（JSON），用于传递场景上下文 |
| compaction_summary | TEXT NOT NULL DEFAULT '' | 对话压缩摘要 |
| created_at / updated_at | INTEGER NOT NULL | 时间戳 |

#### ai_messages — 消息

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 消息 ID |
| conversation_id | TEXT NOT NULL, FK → ai_conversations(id) ON DELETE CASCADE | 所属会话 |
| role | TEXT NOT NULL | 角色：`user` / `assistant` / `tool` |
| content | TEXT NOT NULL | 消息内容 |
| tool_calls | TEXT NOT NULL DEFAULT '[]' | 工具调用（JSON 数组） |
| is_error | INTEGER NOT NULL DEFAULT 0 | 是否为错误消息 |
| created_at | INTEGER NOT NULL | 时间戳 |

---

### 1.2 `ensureOpsAssistantAgent` 实现

**位置**：`src-tauri/src/interface/commands/agent.rs` 第 1787 行

#### 核心逻辑

```rust
#[tauri::command]
pub fn ensure_ops_assistant_agent(
    model_id: Option<String>,
    lang: Option<String>,
    service: State<'_, Arc<AgentService>>,
) -> Result<String, String>
```

**幂等播种策略**：

1. **语言判断**：`lang` 以 `en` 开头用英文提示词，否则用中文
2. **已存在则更新**：如果 `ops-assistant` ID 已存在，强制覆盖以下字段（保证升级后字段正确）：
   - `tool_ids` = `["terminal_session"]`
   - `always_allowed_tools` = `["terminal_session"]`
   - `permission_mode` = `"auto"`（自动放行，不弹确认框）
   - `auto_confirm` = `true`
   - `trigger_type` = `"manual"`
   - `system_prompt` = 对应语言的系统提示词
   - `temperature` = 0.3
   - `max_iterations` = 60
   - `fallback_model_id` = `None`
   - `workspace_dir` = 默认工作目录
3. **不存在则创建**：
   - `model_id` 优先使用传入值，否则取第一个可用模型
   - 名称/描述按语言设置
   - 其余字段同上

#### 前端调用

```typescript
// src/core/services/agent.service.ts
export async function ensureOpsAssistantAgent(modelId?: string, lang?: string): Promise<string> {
  return invoke('ensure_ops_assistant_agent', { modelId: modelId ?? null, lang: lang ?? null });
}
```

---

### 1.3 系统提示词存储位置与加载机制

#### 存储位置

系统提示词存储在 **3 个地方**：

| 层级 | 位置 | 说明 |
|------|------|------|
| 种子常量 | `src-tauri/src/interface/commands/agent.rs` | 3 个内置 Agent 的中英文提示词硬编码为 `const` |
| 数据库 | `ai_agents.system_prompt` 字段 | Agent 播种后，提示词持久化到数据库 |
| 运行时注入 | `run_agent` 函数中 | 动态追加：对话连续性、插件能力、文件工作区、内存、场景上下文、语言规则 |

#### 加载流程

```
run_agent 被调用
  │
  ├─ 从数据库 ai_agents 读取 system_prompt（基础提示词）
  │
  ├─ 追加「Conversation Continuity」段（对话连续性规则）
  │
  ├─ 若启用插件：追加「Available Plugin Capabilities」段
  │    （列出可用插件、工具、使用场景、触发关键词）
  │
  ├─ 若使用 plugin_manager 工具：追加「Plugin Refinement Workflow」段
  │
  ├─ 若使用 file 工具：追加「File & Document Analysis」+ 工作区路径
  │    否则（有其它工具）：仅追加「Agent Workspace」路径
  │
  ├─ 若使用 memory 工具：从内存文件加载历史记忆并注入
  │
  ├─ 追加「Project Context」（CWD、主机名、Git 分支/状态）
  │
  ├─ 读取会话 metadata：
  │    ├─ rdSetup → 注入「Remote Desktop Setup Context」+ 三阶段工作流
  │    ├─ srvEnvSetup → 注入「Server Environment Setup Context」+ 三阶段工作流
  │    └─ ops → 注入「Ops Context」（站点名、主机、部署路径、session_id）
  │
  └─ 最后追加语言规则（中文或英文）
```

---

### 1.4 现有 Agent 类型

项目中共有 **3 个内置播种 Agent** + 用户可自定义的普通 Agent：

| Agent ID | 名称 | 用途 | 工具 | 权限模式 | 最大迭代 |
|----------|------|------|------|----------|----------|
| `ops-assistant` | 运维助手 | 在远程服务器上执行运维操作（服务管理、日志分析、问题排查、部署检查） | `terminal_session` | auto | 60 |
| `rd-setup-assistant` | 远程桌面安装助手 | 在远程 Linux 服务器上安装配置 TigerVNC 远程桌面 | `terminal_session` | auto | 60 |
| `srv-env-setup-assistant` | 服务器环境安装助手 | 在远程服务器上准备 nginx + systemd + 防火墙的部署环境 | `terminal_session` | auto | 60 |
| *(用户自定义)* | AI Copilot | 通用对话 Agent，可使用全部工具 | 全部 7 个内置 + 插件工具 | confirm | 10 |

#### 内置工具列表（7 个）

| 工具 ID | 说明 | 风险等级 |
|---------|------|----------|
| `terminal` | 本地 shell 命令执行 | High |
| `terminal_session` | 操作已有的终端会话（SSH 等） | High |
| `file` | 文件读写、文档分析（PDF/DOCX/XLSX/CSV） | write/delete/create 为 High |
| `notebook` | 笔记操作 | Low |
| `command_history` | 命令历史查询 | Low |
| `plugin_manager` | 插件创建/更新/删除/测试 | create/update/delete/toggle 为 High |
| `memory` | Agent 长期记忆 | Low |

---

## 2. Agent 运行机制

### 2.1 引擎框架

**自研引擎**：项目使用完全自研的 Agent 引擎，没有依赖 LangChain / CrewAI 等框架。

**核心文件**：
- `src-tauri/src/plugins/ai_agent/engine.rs` — 引擎核心（`AgentEngine`、`ToolRegistry`、`AgentTool` trait）
- `src-tauri/src/plugins/ai_agent/provider.rs` — LLM Provider trait 定义
- `src-tauri/src/plugins/ai_agent/openai_provider.rs` — OpenAI 兼容 Provider 实现
- `src-tauri/src/plugins/ai_agent/permission.rs` — 权限控制

#### AgentEngine 结构

```rust
pub struct AgentEngine {
    agent_id: String,
    provider: Arc<dyn LlmProvider>,          // 主 LLM Provider
    fallback_provider: Option<Arc<dyn LlmProvider>>,  // 回退 Provider
    fallback_model: Option<String>,
    tools: Arc<Mutex<ToolRegistry>>,         // 工具注册表
    model: String,
    system_prompt: String,
    temperature: f64,
    max_iterations: i32,
    max_tokens: i64,
    cancel_token: Option<CancellationToken>, // 取消令牌
    permission_mode: PermissionMode,         // 权限模式
    always_allowed_tools: Arc<Mutex<Vec<String>>>,  // 始终允许的工具
    permission_requester: Option<PermissionRequesterFn>,  // 权限请求回调
    message_persister: Option<Arc<dyn Fn(PersistMessage) + Send + Sync>>,  // 消息持久化
    auto_continue: bool,                     // 自主续跑模式
}
```

#### LlmProvider trait

```rust
#[async_trait]
pub trait LlmProvider: Send + Sync {
    async fn chat(&self, messages: &[ChatMessage], options: &ChatOptions) -> Result<ChatResponse, String>;
    async fn chat_stream(&self, messages: &[ChatMessage], options: &ChatOptions) -> Result<Vec<ChatChunk>, String>;
    async fn chat_stream_realtime(&self, messages: &[ChatMessage], options: &ChatOptions, on_chunk: Arc<dyn Fn(ChatChunk) + Send + Sync>) -> Result<ChatResponse, String>;
    fn validate_config(&self, config: &ProviderConfig) -> Result<(), String>;
}
```

**支持的 API 类型**：
- `openai-completions` — OpenAI 风格 `/chat/completions`（默认）
- `anthropic-messages` — Anthropic 风格 `/v1/messages`
- `openai-responses` — OpenAI Responses API

---

### 2.2 工具调用核心流程

#### AgentTool trait

```rust
#[async_trait]
pub trait AgentTool: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn parameters(&self) -> Value;          // JSON Schema
    async fn execute(&self, params: Value) -> Result<ToolOutput, String>;
}
```

#### ToolRegistry — 工具注册表

```rust
pub struct ToolRegistry {
    tools: HashMap<String, Arc<dyn AgentTool>>,
}
```

方法：`register` / `unregister` / `get` / `list_definitions` / `list_names`

#### 执行引擎主循环（`engine.run()`）

```
┌─────────────────────────────────────────────────────────────┐
│                     AgentEngine::run()                       │
├─────────────────────────────────────────────────────────────┤
│  1. 构建 messages 数组                                        │
│     - 开头插入 system_prompt                                  │
│     - 追加历史消息（跳过 system 角色）                         │
│     - 追加当前用户消息                                        │
│                                                              │
│  2. 对话压缩检查（超过 80k tokens 触发）                       │
│     - 保留最近 6 条消息，之前的调用 LLM 生成摘要               │
│     - 摘要拼接到 system prompt 中                             │
│                                                              │
│  3. 循环（最多 max_iterations 次）：                          │
│     ┌──────────────────────────────────────────┐             │
│     │  3a. 调用 LLM（流式，带重试）              │             │
│     │      - 最多重试 2 次（429/500/503/超时）   │             │
│     │      - 指数退避（1s → 2s）                │             │
│     │      - context_length_exceeded → 截断重试  │             │
│     │      - 主 provider 失败 → 尝试 fallback    │             │
│     └──────────────────────────────────────────┘             │
│                                                              │
│     ┌──────────────────────────────────────────┐             │
│     │  3b. 处理 LLM 响应                        │             │
│     │      - 保存 assistant 消息到 messages     │             │
│     │      - 持久化到数据库                     │             │
│     └──────────────────────────────────────────┘             │
│                                                              │
│     ┌──────────────────────────────────────────┐             │
│     │  3c. 有工具调用？                         │             │
│     │  ┌─ 是 ── 权限检查 ──┐                   │             │
│     │  │                   │                   │             │
│     │  │            需要确认？                  │             │
│     │  │           ┌─ 是 ── 弹权限请求          │             │
│     │  │           │        用户批准/拒绝       │             │
│     │  │           └─ 否 ── 直接执行            │             │
│     │  │                   │                   │             │
│     │  │              并发执行所有工具          │             │
│     │  │              （join_all 并行）         │             │
│     │  │                   │                   │             │
│     │  │              收集结果 → tool 消息      │             │
│     │  └───────────────────┘                   │             │
│     │                                          │             │
│     │  ┌─ 否 ── 检查是否强制工具调用            │             │
│     │  │    （首轮 + prompt 含 MUST call）      │             │
│     │  │    是 → 注入提醒，继续循环             │             │
│     │  │                                          │             │
│     │  │    否 → 检查 auto_continue 模式         │             │
│     │  │         未完成 + 未征询用户 → 自动续跑   │             │
│     │  │         完成 / 征询用户 → 退出循环       │             │
│     │  └──────────────────────────────────────┘             │
│     └──────────────────────────────────────────┘             │
│                                                              │
│  4. 返回最终结果 RunResult                                     │
│     { final_content, messages }                               │
└─────────────────────────────────────────────────────────────┘
```

#### 工具调用中的错误降级

工具执行失败时，引擎会将错误信息包装为"降级提示"返回给 LLM，帮助模型理解并采取替代方案：

| 错误类型 | 降级提示策略 |
|----------|-------------|
| not found / No such file | 建议验证路径或名称 |
| permission / Permission denied | 建议换方法或检查权限 |
| timeout / timed out | 建议简化请求或更具体 |
| ModuleNotFoundError / ImportError | 建议 pip install |
| SyntaxError | 建议修复语法并 refine 插件 |
| command not found | 建议安装程序或换脚本类型 |
| 其他 | 建议尝试替代方案 |

---

### 2.3 terminal_session 工具实现细节

**文件**：`src-tauri/src/plugins/ai_agent/terminal_session_tool.rs`

#### 作用

与已有的活动终端会话交互（如 SSH 终端），写入命令、读取输出、列出会话。

#### 参数定义

```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": ["write", "read_output", "list_sessions"],
      "description": "操作类型"
    },
    "session_id": { "type": "string", "description": "终端会话 ID" },
    "command": { "type": "string", "description": "要写入的命令" },
    "lines": { "type": "number", "description": "读取行数（默认 50，最大 200）" }
  },
  "required": ["action"]
}
```

#### 三个 Action

1. **`write`** — 向会话写入命令
   - 自动追加换行符 `\n`
   - **安全拦截**：检查危险模式（`rm -rf /`、`mkfs`、`dd if=`、fork 炸弹 `:(){ :|:&`、`> /dev/sd`）
   - 通过 `TerminalService::write()` 写入 PTY

2. **`read_output`** — 读取最近输出
   - 默认 50 行，最大 200 行
   - 输出超过 8000 字符时截断
   - 通过 `TerminalService::get_output_buffer()` 读取

3. **`list_sessions`** — 列出活动会话
   - 返回所有活动终端会话的 ID 列表

#### 与 TerminalTool 的区别

| 特性 | terminal 工具 | terminal_session 工具 |
|------|--------------|----------------------|
| 执行方式 | 本地子进程（tokio::process::Command） | 操作已有的 PTY 会话 |
| 交互性 | 单次执行，无交互 | 可交互，支持状态保持 |
| 超时 | 默认 30s，最大 120s | 无超时（读取缓冲区） |
| 适用场景 | 本地快速命令 | 远程 SSH 会话、安装流程 |

---

### 2.4 权限控制和安全拦截

**文件**：`src-tauri/src/plugins/ai_agent/permission.rs`

#### PermissionMode 权限模式

```rust
pub enum PermissionMode {
    Auto,     // 自动放行，不弹确认
    Confirm,  // 每次高危操作需用户确认（默认）
}
```

#### ToolRiskLevel 风险等级

```rust
pub enum ToolRiskLevel {
    Low,
    High,
}
```

#### 风险分类规则（`classify_tool_risk`）

| 工具 / 操作 | 风险等级 |
|------------|----------|
| `terminal` | High |
| `terminal_session` | High |
| `file` + action ∈ {write, delete, create} | High |
| `file` + action ∈ {read, analyze, list} | Low |
| `plugin_manager` + action ∈ {create, update, delete, toggle} | High |
| `plugin_manager` + action ∈ {get, list, test} | Low |
| `notebook` / `memory` / `command_history` | Low |
| 非内置工具（插件工具） | High |

#### 确认判定逻辑（`should_confirm`）

```
需要确认 = permission_mode == Confirm
          && tool_name 不在 always_allowed_tools 中
          && 风险等级为 High
```

#### 权限请求流程

```
引擎检测到需要确认的工具调用
  │
  ├─ 构建 PermissionRequest（工具名、参数、风险等级、描述）
  │
  ├─ 调用 permission_requester 回调
  │    │
  │    ├─ 将请求存入 PENDING_PERMISSIONS HashMap
  │    ├─ 向前端 emit "agent-permission-request" 事件
  │    └─ 等待用户响应（超时 60s，默认拒绝）
  │
  ├─ 用户响应（通过 respond_permission 命令）
  │    ├─ approved = true → 执行工具
  │    │   └─ always_allow = true → 加入 always_allowed_tools
  │    └─ approved = false → 拒绝，返回 "Permission denied"
  │
  └─ 超时 → 默认拒绝
```

#### 安全拦截层

权限控制之外，还有多层安全防护：

1. **工具内部安全**：如 `terminal_session` 的 `write` action 拦截危险命令模式
2. **权限模式控制**：`permission_mode = auto` 时全部放行（仅用于可信场景如运维助手）
3. **always_allowed_tools**：用户标记"始终允许"的工具跳过确认
4. **工作目录沙箱**：`file` 工具限制在 workspace_dir 内

---

## 3. AI Copilot 窗口

### 3.1 `openAiCopilotWindow` 实现

**文件**：`src/core/services/window.service.ts` 第 349 行

#### 函数签名

```typescript
export interface OpenAiCopilotOptions {
  agentId?: string;          // 绑定的 Agent ID
  scene?: 'rd' | 'srvEnv' | 'ops';  // 场景类型
  sessionId?: string;        // 终端会话 ID
  host?: string;             // 目标主机
  username?: string;         // 用户名
  installMode?: string;      // 安装模式（仅 RD 场景）
  siteName?: string;         // 站点名（srvEnv / ops 场景）
  remotePath?: string;       // 远程部署路径
}

export async function openAiCopilotWindow(
  opts?: OpenAiCopilotOptions
): Promise<WebviewWindow | null>
```

#### 窗口 Label 策略（防止上下文串扰）

```typescript
const hasContext = !!(opts?.agentId || opts?.sessionId || opts?.host || opts?.username);
const key = opts?.scene === 'srvEnv'
  ? 'ai-copilot-srv-env'       // 服务器环境安装：独立窗口
  : opts?.scene === 'ops'
    ? 'ai-copilot-ops'          // 运维助手：独立窗口
    : hasContext
      ? 'ai-copilot-rd-setup'   // 远程桌面安装：独立窗口
      : 'ai-copilot';           // 通用 Copilot：共用窗口
```

> **设计意图**：带上下文的助手必须使用独立窗口 label，避免与通用 AI 对话共用窗口导致上下文串扰。

#### 窗口参数

| 参数 | 值 |
|------|-----|
| 宽度 | 880px |
| 高度 | 760px |
| 最小宽度 | 480px |
| 最小高度 | 560px |
| 居中 | true |
| 可调整大小 | true |
| 系统装饰 | true |
| 自动聚焦 | true |

---

### 3.2 场景参数传递机制

#### 参数传递路径

```
调用 openAiCopilotWindow({ scene, agentId, sessionId, host, ... })
  │
  ├─ 参数编码为 URL SearchParams
  └─ URL: `/#/ai-copilot?scene=ops&agentId=ops-assistant&sessionId=xxx&host=...`
      │
      └─ AiCopilotPage 通过 useSearchParams() 读取
          │
          ├─ agentId → 绑定到指定 Agent
          ├─ scene → 判断场景类型（ops/rd/srvEnv）
          ├─ sessionId / host / username → 构建上下文 metadata
          ├─ installMode → RD 安装模式
          └─ siteName / remotePath → 站点部署信息
```

#### 场景 metadata 注入

在 `AiCopilotPage.tsx` 的 `buildContextMetadata()` 中构建：

```typescript
// ops 场景
{ ops: { sessionId, host, username, siteName, remotePath, lang } }

// rd 场景
{ rdSetup: { sessionId, host, username, installMode, lang } }

// srvEnv 场景
{ srvEnvSetup: { sessionId, host, username, siteName, remotePath, lang } }
```

metadata 在创建会话时写入数据库（`createConversation`），后端 `run_agent` 读取后动态注入 system prompt。

---

### 3.3 窗口内 UI 结构

**文件**：`src/pages/AiCopilotPage.tsx`

```
AiCopilotPage
├── 左侧边栏（可折叠）
│   ├── 标题：会话列表 + 新建按钮
│   └── 会话列表（按更新时间倒序）
│       ├── 会话标题
│       ├── 更新时间
│       └── 删除按钮
│
├── 主内容区
│   ├── 顶部栏
│   │   ├── 折叠侧边栏按钮
│   │   ├── Agent 头像 + 名称
│   │   ├── 模型名称 Chip
│   │   └── 新建对话按钮
│   │
│   ├── 消息区域（ChatMessagesArea）
│   │   ├── 用户消息（右侧，用户色）
│   │   ├── 助手消息（左侧，Agent 色）
│   │   ├── 流式输出显示
│   │   ├── 工具调用展示（ToolCallDisplay）
│   │   │   ├── running 状态（加载动画）
│   │   │   └── done 状态（成功/失败 + 结果）
│   │   └── 空状态提示（按场景不同）
│   │
│   ├── 输入区域（ChatInputArea）
│   │   ├── 附件按钮
│   │   ├── 文本输入框（多行，Enter 发送）
│   │   ├── 发送/停止按钮
│   │   └── 附件列表
│   │
│   └── 场景特定卡片（底部）
│       ├── RD 安装确认卡（检测到未安装时显示）
│       │   ├── 标题 + 描述
│       │   └── 「暂不安装」/「同意，开始安装」按钮
│       ├── RD 已安装提示卡
│       ├── SrvEnv 安装确认卡（missing/partial 状态）
│       └── SrvEnv 就绪提示卡
```

#### 事件监听

前端通过 Tauri 事件监听后端推送：

| 事件名 | 作用 |
|--------|------|
| `agent-chunk` | 流式输出分片 → 更新 streamingContent |
| `agent-done` | 流式完成 → 保存最终消息、自动更新会话标题 |
| `agent-error` | 执行出错 → 显示错误消息 |
| `agent-tool-call` | 工具调用状态 → 更新工具调用展示（running/done） |
| `agent-permission-request` | 权限请求 → 弹出权限确认对话框 |
| `agent-compaction` | 对话压缩通知 |
| `auto-trigger-agent` | 自动触发（命令失败 / 笔记保存） |

#### 自动触发机制

Agent 的 `trigger_type` 支持自动触发：

- `manual` — 仅手动触发（默认）
- `auto_failure` — 终端命令失败时自动触发
- `auto_save` — 笔记保存/创建时自动触发
- `auto_both` — 两者都触发

---

## 4. Agent Service 代码结构

### 4.1 Rust 后端 — `agent_service.rs`

**文件**：`src-tauri/src/app/agent_service.rs`

```rust
pub struct AgentService {
    db: Arc<Database>,
    notebook: Arc<NotebookService>,
    terminal: Arc<TerminalService>,
}
```

#### 职责分层

| 层级 | 文件 | 职责 |
|------|------|------|
| 接口层 | `interface/commands/agent.rs` | Tauri command 定义、DTO 转换、run_agent 编排 |
| 服务层 | `app/agent_service.rs` | 业务逻辑封装（CRUD + 测试连接） |
| 仓储层 | `infra/storage/agent_repo.rs` | 数据库 CRUD（SQL 直接操作） |
| 引擎层 | `plugins/ai_agent/engine.rs` | Agent 执行引擎（循环、工具调用、权限） |
| Provider 层 | `plugins/ai_agent/provider.rs` + `openai_provider.rs` | LLM API 抽象与实现 |
| 工具层 | `plugins/ai_agent/*_tool.rs` | 各工具具体实现 |

#### AgentService 方法一览

| 方法 | 说明 |
|------|------|
| **Provider 管理** | |
| `list_providers()` | 列出所有服务商 |
| `get_provider_by_id(id)` | 按 ID 获取服务商 |
| `save_provider(provider)` | 保存服务商 |
| `delete_provider(id)` | 删除服务商（级联删除端点和模型） |
| **Endpoint 管理** | |
| `list_endpoints()` | 列出所有端点 |
| `get_endpoint_by_id(id)` | 按 ID 获取端点 |
| `list_endpoints_by_provider(provider_id)` | 按服务商列出端点 |
| `save_endpoint(endpoint)` | 保存端点 |
| `delete_endpoint(id)` | 删除端点（级联删除模型） |
| **Model 管理** | |
| `list_models()` | 列出所有模型 |
| `get_model_by_id(id)` | 按 ID 获取模型 |
| `list_models_by_endpoint(endpoint_id)` | 按端点列出模型 |
| `save_model(model)` | 保存模型 |
| `delete_model(id)` | 删除模型 |
| `test_endpoint_connection(endpoint_id)` | 测试端点连接 |
| `test_model_chat(model_id)` | 测试模型对话 |
| **Agent 管理** | |
| `list_agents()` | 列出所有 Agent |
| `get_agent_by_id(id)` | 按 ID 获取 Agent |
| `save_agent(agent)` | 保存 Agent |
| `delete_agent(id)` | 删除 Agent（级联删除会话和消息） |
| **会话管理** | |
| `list_conversations(agent_id)` | 列出 Agent 的所有会话 |
| `create_conversation(agent_id, title)` | 创建会话 |
| `create_conversation_with_metadata(agent_id, title, metadata)` | 带 metadata 创建 |
| `delete_conversation(id)` | 删除会话 |
| `find_conversation(id)` | 查找会话 |
| `update_conversation_title(id, title)` | 更新会话标题 |
| `touch_conversation(id)` | 更新会话时间戳 |
| `update_compaction_summary(id, summary)` | 更新压缩摘要 |
| **消息管理** | |
| `list_messages(conversation_id)` | 列出会话消息 |
| `save_message(msg)` | 保存消息 |
| `delete_messages_after(conversation_id, after_message_id)` | 删除指定消息之后的所有消息 |

---

### 4.2 TypeScript 前端 — `agent.service.ts`

**文件**：`src/core/services/agent.service.ts`

纯 invoke 封装层，对应后端 Tauri commands：

```typescript
// Provider CRUD
listProviders() / saveProvider() / deleteProvider()

// Endpoint CRUD
listEndpoints() / listEndpointsByProvider() / saveEndpoint() / deleteEndpoint()
testEndpointConnection(endpointId)

// Model CRUD
listModels() / listModelsByEndpoint() / saveModel() / deleteModel()
testModelChat(modelId)

// Agent CRUD
listAgents() / saveAgent() / deleteAgent()

// 会话管理
listConversations(agentId) / createConversation(agentId, title, metadata?)
deleteConversation(id) / updateConversationTitle(id, title)

// 消息管理
listMessages(conversationId) / saveMessage(msg) / deleteMessagesAfter()

// 执行控制
runAgent(agentId, message, conversationId?, disableTools?)
stopAgent(conversationId)
respondPermission(conversationId, approved, alwaysAllow)
updateAgentAllowedTools(agentId, alwaysAllowedTools)

// 内置 Agent 播种（幂等）
ensureRemoteDesktopSetupAgent(modelId?, lang?)
ensureServerEnvSetupAgent(modelId?, lang?)
ensureOpsAssistantAgent(modelId?, lang?)

// 日志
writeFrontendLog(level, tag, message)
```

#### 前端状态管理

**文件**：`src/features/agent/store/agentStore.ts`（Zustand store）

```typescript
interface AgentState {
  providers: ProviderDto[];
  endpoints: EndpointDto[];
  models: ModelDto[];
  agents: AgentDto[];        // 加载时 tool_ids 为空会规范化为全部内置工具
  conversations: ConversationDto[];
  messages: MessageDto[];
  activeConversationId: string | null;
  activeAgentId: string | null;
  loading: boolean;
  error: string | null;
  // ... CRUD 方法
}
```

---

## 5. 创建新 Agent 需要修改的文件

### 5.1 新增内置播种 Agent（如 ops-assistant 模式）

如果要新增一个类似运维助手的内置 Agent，需要修改以下文件：

| # | 文件 | 修改内容 |
|---|------|----------|
| 1 | `src-tauri/src/interface/commands/agent.rs` | ① 新增 `const XXX_AGENT_ID` 常量<br>② 新增中英文系统提示词 `const` |
| 2 | `src-tauri/src/interface/commands/agent.rs` | 新增 `ensure_xxx_agent()` 函数（#[tauri::command]），参考 `ensure_ops_assistant_agent` |
| 3 | `src-tauri/src/lib.rs` | 在 `tauri::generate_handler!` 宏中注册新 command |
| 4 | `src/core/services/agent.service.ts` | 新增 `ensureXxxAgent()` 函数（invoke 封装） |
| 5 | `src/proto/agent.ts` | （如果有新 DTO 字段才需要）通常不需要 |

### 5.2 新增场景（前端窗口支持）

如果新 Agent 需要独立场景窗口支持：

| # | 文件 | 修改内容 |
|---|------|----------|
| 1 | `src/core/services/window.service.ts` | `OpenAiCopilotOptions` 新增 scene 类型，`openAiCopilotWindow` 新增 label 分支 |
| 2 | `src/pages/AiCopilotPage.tsx` | 新增场景判断、metadata 构建、UI 状态卡片、空状态文案等 |
| 3 | `src-tauri/src/interface/commands/agent.rs` `run_agent` | metadata 解析部分新增场景分支，注入对应上下文到 system prompt |

### 5.3 新增工具（Agent 能力扩展）

如果要新增一个内置工具：

| # | 文件 | 修改内容 |
|---|------|----------|
| 1 | `src-tauri/src/plugins/ai_agent/xxx_tool.rs` | 新建工具文件，实现 `AgentTool` trait |
| 2 | `src-tauri/src/plugins/ai_agent/mod.rs` | 新增 `pub mod xxx_tool;` |
| 3 | `src-tauri/src/interface/commands/agent.rs` `run_agent` | 工具注册循环中新增工具 ID 的 match 分支 |
| 4 | `src-tauri/src/plugins/ai_agent/permission.rs` | `high_risk_tools()` / `builtin_tools()` 中注册工具名，`classify_tool_risk()` 添加风险分类，`build_permission_description()` 添加描述 |
| 5 | `src/features/agent/store/agentStore.ts` | `ALL_AGENT_TOOLS` 数组中添加工具 ID |
| 6 | `src-tauri/src/interface/commands/agent.rs` | `builtin_tool_ids` 数组中添加工具 ID |

### 5.4 快速创建自定义 Agent（用户级，不改代码）

用户可以直接在应用的 Agent 管理界面中：

1. 新建 Agent → 填写名称、描述、系统提示词
2. 选择模型、设置温度、最大迭代次数
3. 选择可用工具
4. 设置权限模式（confirm/auto）和自动确认
5. 保存即可使用

---

## 附录：核心文件路径索引

| 文件 | 行数 | 核心内容 |
|------|------|----------|
| `src-tauri/src/app/agent_service.rs` | 284 | Agent 服务层 CRUD |
| `src-tauri/src/infra/storage/agent_repo.rs` | 761 | Agent 仓储层（SQL + 数据结构） |
| `src-tauri/src/interface/commands/agent.rs` | ~1900 | Tauri 命令层 + run_agent 编排 + 播种逻辑 |
| `src-tauri/src/plugins/ai_agent/engine.rs` | 966 | Agent 执行引擎核心 |
| `src-tauri/src/plugins/ai_agent/permission.rs` | 185 | 权限控制与风险分类 |
| `src-tauri/src/plugins/ai_agent/provider.rs` | 174 | LLM Provider trait 定义 |
| `src-tauri/src/plugins/ai_agent/openai_provider.rs` | ~300 | OpenAI/Anthropic 兼容 Provider |
| `src-tauri/src/plugins/ai_agent/terminal_session_tool.rs` | 153 | terminal_session 工具实现 |
| `src-tauri/src/plugins/ai_agent/terminal_tool.rs` | 117 | terminal 工具实现 |
| `src-tauri/src/plugins/ai_agent/file_tool.rs` | ~300 | file 工具实现 |
| `src-tauri/src/plugins/ai_agent/notebook_tool.rs` | - | notebook 工具实现 |
| `src-tauri/src/plugins/ai_agent/memory_tool.rs` | - | memory 工具实现 |
| `src-tauri/src/plugins/ai_agent/plugin_manager_tool.rs` | - | 插件管理工具实现 |
| `src-tauri/src/plugins/ai_agent/plugin_tool.rs` | - | 插件工具适配器 |
| `src-tauri/src/plugins/ai_agent/command_history_tool.rs` | - | 命令历史工具实现 |
| `src/core/services/agent.service.ts` | 134 | 前端 invoke 封装 |
| `src/features/agent/store/agentStore.ts` | 305 | 前端 Zustand 状态管理 |
| `src/pages/AiCopilotPage.tsx` | 644 | AI Copilot 窗口页面 |
| `src/core/services/window.service.ts` | 404 | 窗口管理（含 openAiCopilotWindow） |
| `src/proto/agent.ts` | 74 | 前端类型定义 |
| `src-tauri/src/infra/storage/database.rs` | ~850 | 数据库初始化 + AI 表 DDL |
