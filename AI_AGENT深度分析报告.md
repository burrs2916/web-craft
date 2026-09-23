# WebCraft AI Agent 系统深度分析报告

---

## 1. 工具系统架构分析

### 1.1 现状描述

#### AgentTool Trait 设计

工具系统的核心 trait 定义在 `engine.rs` 中（第192-223行）：

```rust
#[async_trait]
pub trait AgentTool: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn parameters(&self) -> Value;
    async fn execute(&self, params: Value) -> Result<ToolOutput, String>;
    fn category(&self) -> &str;          // 可选，默认 "other"
    fn risk_level(&self, _params: &Value) -> ToolRiskLevel;  // 默认 High
    fn permission_description(&self, params: &Value) -> String;  // 默认通用描述
}
```

当前内置工具共 8 个：
- `terminal` — 本地一次性命令执行
- `terminal_session` — 交互式终端会话（PTY）
- `file` — 本地文件读写/列表/分析
- `memory` — 长期记忆与每日笔记
- `command_history` — 命令历史查询
- `plugin_manager` — 插件创建/管理/测试
- `repair_kb` — 环境修复知识库
- 动态插件工具（通过 `PluginAgentTool` 包装）

#### Tool Registry（工具注册表）

`ToolRegistry` 结构体（engine.rs 第225-264行）是一个简单的 `HashMap<String, Arc<dyn AgentTool>>`：

```rust
pub struct ToolRegistry {
    tools: HashMap<String, Arc<dyn AgentTool>>,
}
```

支持 `register`、`unregister`、`get`、`list_definitions`、`list_names` 五个方法。

**注册机制**：工具注册发生在每次 `run_agent` 调用时（`commands/agent.rs` 第526-619行），根据 agent 配置的 `tool_ids` 动态构建 ToolRegistry。空 `tool_ids` 视为"全部工具"，会注册所有内置工具 + 所有已启用插件工具。

#### 工具参数验证

**没有 JSON Schema 验证**。工具参数以 `serde_json::Value` 形式传入，各工具在 `execute` 方法内手动提取参数并做基础校验，例如：

```rust
// terminal_session_tool.rs 第167-168行
let action = params["action"].as_str()
    .ok_or_else(|| "Missing 'action' parameter".to_string())?;
```

参数 schema 仅用于 LLM 函数调用描述（通过 `parameters()` 方法生成 JSON 给模型），不用于实际运行时验证。

#### 插件工具（PluginAgentTool）的安全边界

`plugin_tool.rs` 中的 `PluginAgentTool` 通过 `execute_script` 执行插件脚本：

```rust
let result = execute_script(
    &self.definition.script,
    &params,
    &ctx,
    &self.workspace_dir,
).await;
```

安全边界现状：
- 脚本在本地进程中执行（shell/python/HTTP 等方式）
- 有使用日志记录（`UsageLogEntry`）
- 工作目录隔离（每个 agent 有独立 workspace_dir）
- 风险等级 fallback 为 High（`permission.rs` 第367行：未知插件工具默认 High）

### 1.2 存在的问题

#### 严重问题

1. **无运行时参数验证（Critical）**
   - 工具参数 schema 仅用于告诉 LLM，实际执行前不做 JSON Schema 验证
   - LLM 可能生成格式错误的参数（缺字段、类型错误、额外字段），各工具手动校验不完整
   - 插件工具的参数更是完全依赖插件脚本自行处理，没有前置校验
   - 风险：参数注入、越权访问、脚本崩溃

2. **插件工具沙箱不足（Critical）**
   - 插件脚本直接在宿主进程中执行，无进程级隔离
   - 插件可访问本地文件系统、网络、环境变量
   - 虽有 workspace_dir 限制，但脚本可轻易突破（如 cd 到其他目录）
   - 无执行时间限制、无资源限制（CPU/内存）
   - 无代码审查机制，用户安装的第三方插件可执行任意代码

3. **ToolRegistry 每次调用重建（High）**
   - 每次 `run_agent` 都重新创建 ToolRegistry 并注册所有工具
   - 频繁创建 Arc<Mutex<...>>，有性能开销
   - 插件工具的动态增删无法在会话间持久反映

#### 中等问题

4. **AgentTool trait 缺少生命周期管理（Medium）**
   - 没有 `init`/`shutdown` 钩子
   - 工具持有资源（如数据库连接、终端会话）无法优雅释放
   - 缺少 `cancel` 方法，工具执行中无法响应取消

5. **错误降级逻辑在 engine 而非工具内（Medium）**
   - `engine.rs` 第844-884行有大量错误降级逻辑（timeout、permission、ModuleNotFoundError 等）
   - 这些逻辑应是工具自身的职责，放在 engine 中导致耦合
   - 新增工具类型时需要修改 engine 代码

6. **工具分类粒度粗（Medium）**
   - `category()` 只有 6 种固定值（info/file/exec/privileged/destructive/other）
   - 无法用于更细粒度的权限策略和 UI 分组

#### 低优先级问题

7. **工具描述重复维护（Low）**
   - `description()` 和 `parameters()` 由工具硬编码
   - 插件工具从 manifest 动态生成
   - 内置工具的描述更新需要改 Rust 代码重新编译

8. **无工具版本/依赖声明（Low）**
   - 工具没有版本号
   - 插件工具之间无法声明依赖关系
   - 不支持工具的废弃（deprecation）标记

### 1.3 优化建议

| 优先级 | 建议 | 预期收益 |
|--------|------|----------|
| Critical | 引入 `valico` 或 `jsonschema` crate，在 `AgentTool::execute` 前自动用 `parameters()` schema 验证参数 | 提升稳定性，减少 LLM 坏参数导致的错误 |
| Critical | 为插件工具增加进程级沙箱：使用独立子进程执行、设置资源限制（rlimit）、文件系统白名单 | 防止恶意插件破坏系统 |
| High | ToolRegistry 改为按 agent 缓存：agent 配置不变时复用注册表实例 | 降低每次调用的初始化开销 |
| High | 增加 `validate_params(&self, params: &Value) -> Result<(), String>` 默认方法，基于 parameters() schema 自动验证 | 统一验证逻辑，减少重复代码 |
| Medium | AgentTool 增加 `cancel()` 方法和 `shutdown()` 钩子 | 支持工具级取消和资源清理 |
| Medium | 将错误降级逻辑从 engine 移到各工具自身的 execute 实现中 | 降低 engine 复杂度，提升工具自主性 |
| Low | 增加工具元数据：version、author、tags、deprecation_message | 提升工具可管理性 |

---

## 2. 记忆系统深度分析

### 2.1 现状描述

#### 记忆存储结构

`MemoryTool`（`memory_tool.rs`）使用本地文件系统存储：

```
base_dir/
  MEMORY.md          # 长期记忆（长期事实、偏好、决策）
  memory/
    2026-08-21.md    # 每日笔记
    2026-08-20.md
    ...
```

#### 记忆分类

实际只有两级：
1. **长期记忆（Long-term）**：`MEMORY.md` — 跨会话持久的事实、偏好、决策
2. **每日笔记（Daily）**：按日期分文件的运行笔记

没有严格意义上的"工作记忆"（working memory）或"短期记忆"（short-term memory）。会话上下文本身承担了短期记忆的角色。

#### 记忆检索机制

检索有三种方式：

1. **全量注入**（`load_memory_for_prompt`，第29-61行）：
   - 每次对话开始时，将 MEMORY.md + 今日笔记 + 昨日笔记 全部拼接到 system prompt 中
   - 格式：`[Long-term Memory]...[Today's Notes]...[Yesterday's Notes]...`

2. **关键词搜索**（`search` action，第200-243行）：
   - 简单的字符串包含匹配（不区分大小写）
   - 遍历 MEMORY.md 和所有 memory/*.md 文件
   - 返回匹配的行，带文件名前缀

3. **指定日期读取**（`read` action）：读取特定日期的记忆文件

#### 记忆注入策略

记忆在 `run_agent` 中注入（`commands/agent.rs` 第742-748行）：

```rust
if agent_uses_tool("memory") {
    let memory_tool = MemoryTool::new(agent_memory_dir);
    let memory_context = memory_tool.load_memory_for_prompt();
    if !memory_context.is_empty() {
        system_prompt.push_str(&memory_context);
    }
}
```

注入位置：system prompt 末尾，作为上下文的一部分。

#### 记忆更新机制

- **写入方式**：追加式写入（append-only），每次 save 操作在文件末尾添加带时间戳的条目
- **无遗忘机制**：记忆文件只会增长，不会自动清理或总结
- **无更新/删除**：save 只有追加，没有修改或删除已有条目的能力
- **长期记忆文件**：同样是追加式，没有结构化组织

### 2.2 存在的问题

#### 严重问题

1. **全量注入导致 token 浪费（Critical）**
   - 长期记忆文件可能很大（数百条记录），全部注入 system prompt
   - 与当前对话无关的记忆也被注入，浪费 token 并可能稀释关键信息
   - 长期记忆增长后，可能触发上下文压缩（compaction），反而丢失重要信息

2. **检索方式过于原始（High）**
   - 只有简单字符串匹配，没有语义检索/向量检索
   - 无法处理同义词、模糊匹配、概念关联
   - 搜索结果是独立行，缺少上下文（只返回匹配行，不返回所属条目）
   - 无相关性排序，按文件遍历顺序返回

3. **无遗忘/压缩机制（High）**
   - 记忆文件无限增长，没有 TTL、重要性评分、定期摘要
   - 长期记忆可能被无关信息淹没
   - 无法区分"重要事实"和"临时笔记"的优先级

#### 中等问题

4. **记忆结构非结构化（Medium）**
   - 纯 Markdown 文本，没有结构化字段（如 key-value、标签、关联实体）
   - 无法按主题、重要性、时间范围高效过滤
   - LLM 写入时格式不一致，影响检索质量

5. **每日笔记的时间窗口不合理（Medium）**
   - 只注入今天和昨天的笔记，对于跨天的任务可能丢失上下文
   - 没有按任务/项目维度组织记忆的能力
   - 跨天的连续任务无法有效利用前几天的笔记

6. **无记忆一致性保证（Medium）**
   - LLM 可能写入重复或矛盾的记忆
   - 没有去重、冲突检测机制
   - 记忆写入完全由 LLM 自主决定，质量不可控

#### 低优先级问题

7. **工作记忆缺失（Low）**
   - 没有显式的"工作记忆"概念（当前任务的关键信息卡片）
   - 所有中间状态都靠对话历史承载，对话被压缩后可能丢失

8. **无记忆使用统计（Low）**
   - 不知道哪些记忆被检索过、哪些从未被使用
   - 无法基于使用频率优化记忆存储

### 2.3 优化建议

| 优先级 | 建议 | 预期收益 |
|--------|------|----------|
| Critical | 实现基于相关性的记忆注入：用嵌入向量做语义检索，只注入 Top-K 相关记忆 | 大幅节省 token，提升记忆相关性 |
| High | 增加记忆定期摘要机制：每周/每月对旧记忆进行 LLM 摘要，合并重复内容 | 控制记忆文件大小，提高信息密度 |
| High | 引入记忆重要性评分：写入时由 LLM 评分，检索时按重要性加权排序 | 重要信息优先展示，减少信息噪声 |
| Medium | 记忆结构化：每条记忆增加 metadata（tags、importance、related_entities、timestamp） | 支持更丰富的检索方式和过滤 |
| Medium | 增加记忆去重和冲突检测：写入前检查是否已有相似内容 | 避免记忆冗余和矛盾 |
| Medium | 引入"工作记忆"概念：当前会话的关键信息卡片，每次迭代都注入 | 减少长对话中的信息丢失 |
| Low | 增加记忆使用统计和反馈循环：记录哪些记忆被引用、哪些帮助解决了问题 | 实现记忆的自优化 |

---

## 3. 前端交互分析

### 3.1 现状描述

#### 核心组件结构

```
src/features/agent/
  components/
    AgentChat.tsx          # 主聊天界面（消息流+输入+权限弹窗）
    AgentManager.tsx       # Agent 管理（创建/编辑/删除/工具配置）
    AgentPanel.tsx         # Agent 面板容器
    AssistantTabTemplate.tsx
    ModelConfigPage.tsx    # 模型/端点/提供商配置
    RepairProgressPanel.tsx # 修复进度面板
    TerminalCopilotTab.tsx # 终端助手 tab
  store/
    agentStore.ts          # Zustand 状态管理
```

#### 流式输出渲染

流式输出通过 Tauri 事件系统实现：

1. **事件监听**（AgentChat.tsx 第104-107行）：
   ```typescript
   const unlistenChunk = listen<StreamChunk>('agent-chunk', (event) => {
     if (event.payload.conversationId === activeConversationId) {
       setStreamingContent((prev) => prev + event.payload.chunk);
     }
   });
   ```

2. **渲染方式**：
   - `streamingContent` 是 React state，每次追加 chunk 触发重渲染
   - 流式消息显示在对应的 assistant bubble 中（ChatComponents.tsx 第164-166行）
   - 使用 `react-markdown` + `remark-gfm` 渲染 Markdown
   - 流式过程中显示光标指示器 `▌`

3. **完成后处理**：
   - 收到 `agent-done` 事件后，更新持久化消息并刷新消息列表
   - 清空 `streamingContent`

#### 工具调用展示

工具调用通过 `agent-tool-call` 事件传递，状态包括 `running` / `done` / `denied`：

1. **运行中**：显示工具名、参数、加载状态
2. **完成**：显示结果（成功/失败），可折叠
3. **被拒绝**：显示拒绝原因

组件：`PersistentToolCallCard`（ChatComponents.tsx）展示工具调用卡片，包含工具名、参数、状态指示、结果内容。

#### 会话列表与消息列表性能

- **状态管理**：使用 Zustand（`agentStore.ts`），消息存储为 `MessageDto[]`
- **渲染方式**：全部消息一次性渲染（`groupedMessages.map(...)`），无虚拟滚动
- **分组优化**：使用 `useMemo` 对消息进行分组（user/assistant_turn）
- **Markdown 渲染**：使用 `react-markdown`，每条消息独立渲染
- **滚动定位**：通过 `messagesEndRef` + `scrollIntoView` 自动滚动到底部

#### 权限请求弹窗交互

权限请求流程：

1. 后端检测到需要确认的工具调用
2. 发送 `agent-permission-request` 事件
3. 前端收到事件后显示 Dialog（AgentChat.tsx 第506-555行）
4. 弹窗内容：风险等级（Alert）、工具描述、参数 JSON、工具名 Chip
5. 用户选择"允许"/"拒绝"，可选"始终允许"
6. 调用 `respondPermission` 命令将结果传回后端

权限模式支持 5 级：`auto` / `low_risk_auto` / `confirm` / `cautious` / `paranoid`。

### 3.2 存在的问题

#### 严重问题

1. **无虚拟滚动，长会话性能差（Critical）**
   - 消息列表全部渲染，没有 windowing / virtual list
   - 每条消息包含 Markdown 渲染（react-markdown 较重）
   - 100+ 条消息后明显卡顿，特别是包含代码块和表格时
   - 工具调用结果（尤其是终端输出）可能很长，进一步加剧性能问题

2. **流式渲染全量重渲染（High）**
   - 每个 chunk 到达都触发 `setStreamingContent`，导致整个消息区域重渲染
   - Markdown 组件每次都重新解析完整内容
   - 高流量流式输出（如代码生成）时掉帧明显
   - 没有增量渲染或 debounce 优化

#### 中等问题

3. **工具调用展示信息密度低（Medium）**
   - 工具调用卡片只显示名称和结果，缺少执行耗时等元信息
   - 大量工具调用时页面冗长，缺少分组/折叠功能
   - 终端输出结果没有语法高亮或格式化
   - 无法复制工具调用结果或参数

4. **权限弹窗信息过载（Medium）**
   - 直接展示原始 JSON 参数，用户体验差
   - 缺少风险说明的详细解释（为什么这个操作有风险）
   - "始终允许"选项没有清晰的后果说明
   - 高风险操作没有二次确认

5. **消息编辑/重生成体验不足（Medium）**
   - 编辑消息后会删除该消息之后的所有消息，用户可能意外丢失大量内容
   - 重生成没有对比选项（side-by-side）
   - 没有消息分支（fork）功能

#### 低优先级问题

6. **会话列表功能简单（Low）**
   - 没有搜索、排序、标签、固定等功能
   - 没有批量删除
   - 会话预览信息不足（只显示标题）

7. **缺少打字指示器/思考状态（Low）**
   - 虽然有 `isThinking` 状态，但只有在完全没有内容时显示
   - 推理模型的思考过程（reasoning tokens）没有单独展示

### 3.3 优化建议

| 优先级 | 建议 | 预期收益 |
|--------|------|----------|
| Critical | 引入虚拟滚动（如 `@tanstack/react-virtual`），只渲染可视区域内的消息 | 长会话性能提升 10x+ |
| High | 流式渲染优化：使用 `requestAnimationFrame` 或 debounce 合并 chunk，减少重渲染频率 | 提升流式输出流畅度 |
| High | 对长文本消息实现延迟渲染/折叠：超过一定长度的工具结果默认折叠，点击展开 | 减少首屏渲染量 |
| Medium | 工具调用卡片增加执行时间、token 消耗等元信息；增加批量折叠/展开 | 提升调试和信息获取效率 |
| Medium | 权限弹窗增加风险说明的自然语言描述，参数用可读格式展示而非原始 JSON | 提升用户决策质量 |
| Medium | 消息删除前增加确认提示，重生成保留旧版本（side-by-side 对比） | 减少误操作，提升迭代体验 |
| Low | 增加会话搜索、置顶、标签功能 | 提升会话管理效率 |

---

## 4. 会话隔离与多 Agent 分析

### 4.1 现状描述

#### Agent 隔离

每个 Agent 是独立配置实体（数据库中的 `ai_agents` 表），有独立的：
- system prompt
- 模型配置
- 工具列表
- 权限模式
- 工作目录（`workspace_dir`）
- 记忆目录（`data_dir/agents/{agent_id}/`）

**运行时隔离**：
- 每次 `run_agent` 调用创建独立的 `AgentEngine` 实例
- 每次调用创建独立的 `ToolRegistry`（第526行）
- LLM provider 每次调用新建（第497行）
- 取消令牌（CancellationToken）按 conversation_id 存储

#### 会话隔离

会话（Conversation）属于某个 Agent，有独立的：
- 消息历史（`ai_messages` 表，按 conversation_id 关联）
- 取消令牌（`CANCEL_TOKENS` HashMap，key 为 conversation_id）

**消息隔离**：消息通过 `conversation_id` 字段隔离，加载消息时按会话过滤。

#### 工具资源共享情况

**跨 Agent 共享的资源**：
1. **TerminalService**（全局单例）：所有 agent 共享同一个终端会话管理器
   - `TerminalService` 存储在 `AgentService` 中，是应用级单例
   - 终端会话以 `session_id` 为 key 存储在全局 HashMap 中
   - 任何 agent 只要知道 session_id，就可以操作任何终端会话

2. **PluginService**（全局单例）：所有 agent 共享插件服务
   - 插件数据目录共享
   - 插件工具注册到各自的 ToolRegistry，但底层服务共享

3. **Database**（全局单例）：所有 agent 共享数据库连接

**按 Agent 隔离的资源**：
1. **FileTool 工作目录**：`resolve_workspace_dir(agent.workspace_dir, agent.id)`
2. **MemoryTool 记忆目录**：`data_dir/agents/{agent_id}/`
3. **ToolRegistry**：每次 run_agent 独立创建

#### 并发会话限制

- **无显式并发限制**：代码中没有并发会话数量限制
- `CANCEL_TOKENS` 是全局 HashMap，可以存任意数量的取消令牌
- 每个 `run_agent` 是独立的 async 任务，由 tokio 调度
- 数据库访问通过 SQLite，有内置的并发控制

并发模型：
- 同一 conversation_id 同时只有一个 run（前端 loading 状态阻止重复提交）
- 不同 conversation_id 可并行运行
- 不同 agent 可并行运行

### 4.2 存在的问题

#### 严重问题

1. **终端会话全局共享，无 Agent 隔离（Critical）**
   - `TerminalService` 是全局单例，session_id 是字符串 key
   - Agent A 创建的终端会话，Agent B 只要知道 session_id 就能操作
   - `terminal_session` 工具的 `list_sessions` action 列出所有会话（第253-269行）
   - 多 agent 场景下，一个 agent 可以干扰另一个 agent 的终端会话
   - 安全风险：恶意 agent 可通过枚举 session_id 访问其他 agent 的会话

2. **无并发会话数量限制（High）**
   - 理论上可以同时启动无限多个 agent 运行
   - 每个 agent 运行占用：一个 LLM 连接、若干工具执行线程、内存
   - 大量并发会话可能导致 OOM 或 LLM API 限流
   - 终端会话也是无限制创建

3. **AgentEngine 每次调用重建（High）**
   - 每次用户发消息都重建 AgentEngine、ToolRegistry、provider
   - 虽然不是严重 bug，但有不必要的开销
   - 会话级状态（如 always_allowed_tools）无法在消息间持久化（每次都重置）

#### 中等问题

4. **记忆按 Agent 隔离，但跨会话共享（Medium）**
   - 同一 agent 的不同会话共享同一个 MEMORY.md 和每日笔记
   - 好处：跨会话积累知识
   - 风险：一个会话写入的错误记忆会影响另一个会话
   - 没有会话级记忆和 agent 级记忆的分层

5. **插件工具跨 Agent 共享（Medium）**
   - 启用的插件对所有 agent 可见（如果 tool_ids 为空）
   - 插件的数据目录是共享的
   - 无法按 agent 限制可用插件（只能通过 tool_ids 手动配置）

6. **消息持久化无并发控制（Medium）**
   - `message_persister` 是异步回调，多个 tool message 可能并发写入
   - SQLite 的 INSERT 是原子的，但消息顺序可能因竞争乱序
   - 消息 ID 生成（`tool-{conv_id}-{counter}`）在 persister 内用 counter，并发下可能重复

#### 低优先级问题

7. **无 Agent 级资源配额（Low）**
   - 没有每个 agent 每天的 token 上限
   - 没有工具调用频率限制
   - 没有存储配额（记忆文件、工作目录大小）

8. **取消机制有竞态条件（Low）**
   - `CANCEL_TOKENS` 用全局 Mutex<HashMap> 管理
   - 理论上存在并发创建/删除的竞态（虽然实际概率很低）
   - 已完成的会话的 cancel token 没有清理，可能内存泄漏

### 4.3 优化建议

| 优先级 | 建议 | 预期收益 |
|--------|------|----------|
| Critical | 终端会话增加 agent_id 命名空间：session_id 内部格式为 `{agent_id}:{user_session_id}`，list_sessions 只返回当前 agent 的会话 | 防止 agent 间的终端会话越权访问 |
| High | 增加并发会话限制：全局最大并发数 + 单 agent 最大并发数，超限则排队或拒绝 | 防止资源耗尽和 API 限流 |
| High | AgentEngine 按会话缓存：同一会话内复用 engine 实例，只更新消息历史 | 降低初始化开销，保留会话级状态 |
| Medium | 引入会话级记忆分层：会话记忆 → 每日笔记 → 长期记忆，重要性逐层提升 | 减少跨会话记忆干扰，提升记忆质量 |
| Medium | 消息持久化用队列（mpsc channel）串行化，保证写入顺序和 ID 唯一性 | 防止消息乱序和 ID 冲突 |
| Medium | 插件工具增加 agent 级启用/禁用控制，而非全局启用 | 提升多 agent 场景的安全性和可控性 |
| Low | 增加 agent 资源配额：token 上限、工具调用频率、存储配额 | 多租户场景下的资源公平性 |
| Low | 会话结束后清理 cancel token，或使用弱引用/TTL 自动过期 | 防止内存泄漏 |

---

## 总结

### 架构亮点

1. **AgentTool trait 设计简洁实用**：async_trait + JSON 参数 + 分类/风险等级，扩展性好
2. **5 级权限模式设计精细**：从 Auto 到 Paranoid，覆盖不同安全需求
3. **命令级风险分类**：终端工具按命令内容精确评估风险（`classify_command_risk`），而非一刀切
4. **上下文压缩机制完善**：LLM 摘要 + 渐进式截断 + fallback 模型，三重兜底
5. **自动续跑（auto_continue）**：环境修复类 agent 的智能续跑机制，减少用户干预

### 最需要优先解决的问题

1. **终端会话全局共享** — 安全漏洞，多 agent 场景下可越权
2. **无参数 JSON Schema 验证** — 稳定性问题，LLM 坏参数可能导致各种错误
3. **无虚拟滚动** — 体验问题，长对话严重卡顿
4. **记忆全量注入** — 效率问题，token 浪费且可能稀释关键信息
5. **插件沙箱不足** — 安全风险，第三方插件可执行任意代码

### 整体评价

WebCraft 的 AI Agent 系统在功能完整性上做得相当不错（多工具、权限系统、记忆、插件、流式输出、上下文压缩等都有），架构设计也比较清晰（AgentEngine + ToolRegistry + AgentTool trait）。主要短板在安全隔离（终端会话、插件沙箱）、性能优化（虚拟滚动、流式增量渲染）和记忆系统的智能化（语义检索、遗忘机制）三个方面。这些都是从"能用"到"好用、安全"需要补齐的部分。
