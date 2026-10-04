// ChatComponents 拆分：类型定义 + 纯工具函数（无 React 组件）
// 供各子组件与调用方共用；主文件 ChatComponents.tsx 再导出以保持 import 路径不变。

export interface ToolCallDisplay {
  id: string;
  toolName: string;
  arguments: Record<string, unknown>;
  result: string | null;
  success: boolean | null;
  status: 'streaming' | 'running' | 'done' | 'denied';
  /** 执行耗时（毫秒） */
  durationMs?: number | null;
}

export interface ParsedToolCall {
  id: string;
  name: string;
  arguments: string;
}

export function parseToolCalls(toolCallsStr: string): ParsedToolCall[] {
  if (!toolCallsStr || toolCallsStr === '[]' || toolCallsStr === '') return [];
  try {
    const parsed = JSON.parse(toolCallsStr);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((tc: any) => ({
      id: tc.id || '',
      name: tc.function?.name || tc.name || '',
      arguments: tc.function?.arguments || tc.arguments || '{}',
    }));
  } catch {
    return [];
  }
}

export function parseArguments(argsStr: string): Record<string, unknown> {
  if (!argsStr) return {};
  try {
    const parsed = JSON.parse(argsStr);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    return {};
  } catch {
    return {};
  }
}

export function extractToolCallIdFromMsgId(msgId: string, convId: string): string | null {
  const prefix = `tool-${convId}-`;
  if (msgId.startsWith(prefix)) {
    return msgId.slice(prefix.length) || null;
  }
  if (msgId.startsWith('tool-')) {
    return msgId.slice(5) || null;
  }
  return null;
}

export interface AgentStatusInfo {
  status: string;
  iteration: number;
  maxIterations: number;
  detail?: string;
  streamStats?: {
    charsTotal: number;
    tokensEstimated: number;
    charsPerSec: number;
    tokensPerSec: number;
    elapsedMs: number;
  } | null;
  contextUsage?: {
    tokensUsed: number;
    contextWindow: number;
    usageRatio: number;
  } | null;
  /** 是否为 Ollama 本地模型（用于显示本地模型标识和专属样式） */
  isOllama?: boolean;
}

export interface ChatMessagesAreaProps {
  messages: import('../../proto/agent').MessageDto[];
  streamingContent: string;
  streamingReasoning?: string;
  streamingMsgId: string | null;
  loading: boolean;
  toolCalls: ToolCallDisplay[];
  agentColor: string;
  userColor: string;
  isDark: boolean;
  conversationId?: string;
  emptyIcon?: React.ReactNode;
  emptyText?: string;
  thinkingText?: string;
  agentStatus?: AgentStatusInfo | null;
  onEditMessage?: (messageId: string, content: string) => void;
  onRegenerate?: (messageId: string) => void;
}

export function markdownStyles(agentColor: string, isDark: boolean) {
  return {
    '& p': { m: 0, mb: 0.5 },
    '& p:last-child': { mb: 0 },
    '& pre': { bgcolor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.06)', p: 1, borderRadius: 1, overflow: 'auto', fontSize: 12 },
    '& code': { fontFamily: 'monospace', fontSize: 12, bgcolor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)', px: 0.5, borderRadius: 0.5 },
    '& pre code': { bgcolor: 'transparent', px: 0 },
    '& ul, & ol': { pl: 2, m: 0 },
    '& li': { mb: 0.25 },
    '& h1, & h2, & h3, & h4': { m: 0, mb: 0.5, fontSize: 'inherit', fontWeight: 700 },
    '& blockquote': { borderLeft: `3px solid ${agentColor}40`, pl: 1.5, m: 0, color: 'text.secondary' },
    '& a': { color: agentColor, textDecoration: 'none' },
    '& table': { borderCollapse: 'collapse', fontSize: 12, width: '100%' },
    '& th, & td': { border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, px: 1, py: 0.5 },
    '& th': { bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', fontWeight: 600 },
  };
}

export interface FileAttachment {
  path: string;
  name: string;
}

export interface ChatInputAreaProps {
  input: string;
  setInput: (v: string) => void;
  handleSend: () => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  loading: boolean;
  conversationId: string | null;
  agentName?: string;
  agentColor: string;
  userColor: string;
  isDark: boolean;
  placeholder?: string;
  onStop?: () => void;
  attachments?: FileAttachment[];
  onAttachmentsChange?: (files: FileAttachment[]) => void;
  hasFileTool?: boolean;
  /** 外部禁用原因（如会话已断开），提供时整个输入区被禁用并显示提示 */
  disabled?: boolean;
  disabledReason?: string;
}

/**
 * 根据上下文使用率获取对应颜色
 */
export function getContextUsageColor(ratio: number): string {
  if (ratio > 0.9) return '#FF5252';   // 红色 - 危险
  if (ratio > 0.75) return '#FF9800';  // 橙色 - 警告
  if (ratio > 0.5) return '#FFEB3B';   // 黄色 - 注意
  return 'text.disabled';              // 默认灰色
}

/**
 * 格式化流式速率为友好显示
 */
export function formatStreamRate(tokensPerSec: number, charsPerSec: number): string {
  if (tokensPerSec > 0) {
    if (tokensPerSec >= 100) {
      return `${tokensPerSec.toFixed(0)} tok/s`;
    }
    return `${tokensPerSec.toFixed(1)} tok/s`;
  }
  if (charsPerSec > 0) {
    return `${charsPerSec.toFixed(0)} char/s`;
  }
  return '';
}

/**
 * 格式化耗时为简短格式（如 1.2s, 300ms, 2m 30s）
 */
export function formatDurationShort(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

/**
 * 格式化耗时为详细格式（用于 tooltip）
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} 毫秒`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)} 秒`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins} 分 ${secs} 秒 (${ms.toLocaleString()} ms)`;
}
