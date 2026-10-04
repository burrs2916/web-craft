export interface StreamChunk { conversationId: string; chunk: string }
export interface StreamDone { conversationId: string; response: string }
export interface StreamError { conversationId: string; error: string }

export interface ToolCallEvent {
  tool_name: string;
  arguments: Record<string, unknown>;
  result: string | null;
  success: boolean | null;
  status: 'running' | 'done' | 'denied';
  duration_ms?: number | null;
}

export interface ToolCallPayload { conversationId: string; toolCall: ToolCallEvent }

/**
 * 流式工具调用增量（来自 LLM 流式输出）
 * 用于在工具真正执行前，向用户展示 AI 正在准备调用什么工具
 */
export interface StreamingToolCallDelta {
  index: number;
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

/**
 * 流式工具调用的累积状态
 */
export interface StreamingToolCall {
  index: number;
  id?: string;
  name: string;
  arguments: string;
  isStreaming: boolean;
}

export interface PermissionRequestPayload {
  conversationId: string;
  agentId?: string;
  toolName: string;
  arguments: Record<string, unknown>;
  riskLevel: 'low' | 'high';
  description: string;
}

export interface StreamStats {
  charsTotal: number;
  tokensEstimated: number;
  charsPerSec: number;
  tokensPerSec: number;
  elapsedMs: number;
}

export interface ContextUsage {
  tokensUsed: number;
  contextWindow: number;
  usageRatio: number;
}

export interface AgentStatus {
  status: string;
  iteration: number;
  maxIterations: number;
  detail?: string;
  streamStats?: StreamStats | null;
  contextUsage?: ContextUsage | null;
}

export interface AgentStatusPayload {
  conversationId: string;
  status: string;
  iteration: number;
  maxIterations: number;
  detail?: string;
  streamStats?: StreamStats | null;
  contextUsage?: ContextUsage | null;
}