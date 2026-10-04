// ChatComponents 拆分：主文件改为 barrel，仅再导出子模块，
// 以保证调用方 `from './ChatComponents'` 的 import 路径全部不变。
//
// 子模块划分：
//  - chatTypes.ts        : 类型定义 + 纯工具函数（无 React 组件）
//  - AgentStatusBar.tsx  : AgentStatusBar（执行状态条）
//  - ChatInputArea.tsx   : ChatInputArea（输入区 + 附件）
//  - ChatMessagesArea.tsx: ChatMessagesArea（消息展示区 + 内部子组件）
//  - ToolCallCard.tsx    : ToolCallCard（流式工具调用卡片）

export * from './chatTypes';
export * from './AgentStatusBar';
export * from './ChatInputArea';
export * from './ChatMessagesArea';
export * from './ToolCallCard';
