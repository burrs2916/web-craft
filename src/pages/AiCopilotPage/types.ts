/**
 * AI Copilot 页面共享类型与本地存储辅助。
 * 从 AiCopilotPage.tsx 迁出，仅做代码搬迁。
 */

export interface StreamChunk { conversationId: string; chunk: string }
export interface StreamDone { conversationId: string; response: string }
export interface StreamError { conversationId: string; error: string }
export interface ToolCallEvent {
  tool_name: string;
  arguments: Record<string, unknown>;
  result: string | null;
  success: boolean | null;
  status: 'running' | 'done';
}
export interface ToolCallPayload { conversationId: string; toolCall: ToolCallEvent }

// 环境修复步骤追踪
export interface EnvFixStep {
  index: number;        // 序号，从 1 开始
  total: number;        // 总步骤数
  service: string;      // 服务名
  description: string;  // 简短描述
  status: 'pending' | 'running' | 'success' | 'failed';
  errorReason?: string; // 失败原因
}

// Ollama 本地模型状态检测
export interface OllamaStatusState {
  checking: boolean;
  available: boolean;
  modelLoaded: boolean;
  version: string;
  error: string | null;
}

// 长耗时命令倒计时
export interface LongRunningTask {
  description: string;
  totalSeconds: number;
  remainingSeconds: number;
  active: boolean;
}

const STORAGE_KEY = 'webcraft_terminal_copilot_agent_id';

export function getTerminalCopilotAgentId(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setTerminalCopilotAgentId(id: string | null) {
  if (id) {
    localStorage.setItem(STORAGE_KEY, id);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}