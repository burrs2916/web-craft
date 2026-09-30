/**
 * AI Copilot 流式对话核心：承载消息发送（sendMessage）、停止（handleStop），
 * 以及后端 agent-chunk / agent-done / agent-error / app-panic / agent-tool-call / agent-status
 * 六类事件的监听与状态归并。
 *
 * 从 AiCopilotPage/index.tsx 迁出，仅做代码搬迁。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { listen, emit } from '@tauri-apps/api/event';
import { runAgent, saveMessage, listMessages, stopAgent, updateConversationTitle } from '../../../core/services/agent.service';
import { localizeBackendError } from '../../../core/backendError';
import { useNotify } from '../../../core/notification';
import type { ToolCallDisplay } from '../../../components/chat/ChatComponents';
import type { ConversationDto, MessageDto } from '../../../proto/agent';
import type {
  AgentStatus,
  AgentStatusPayload,
  StreamChunk,
  StreamDone,
  StreamError,
  StreamingToolCall,
  ToolCallPayload,
} from '../types';

export function useAgentStream({
  conversationId,
  boundAgentId,
  isOllamaModel,
  setMessages,
  setConvList,
  detectLongRunning,
  longRunningDetectedRef,
  hasRdContext,
  isOpsScene,
  isSrvEnvScene,
  isEnvFixScene,
  userConsentedRef,
}: {
  conversationId: string | null;
  boundAgentId: string | null | undefined;
  isOllamaModel: boolean;
  setMessages: Dispatch<SetStateAction<MessageDto[]>>;
  setConvList: Dispatch<SetStateAction<ConversationDto[]>>;
  detectLongRunning: (content: string, source?: 'stream' | 'final') => void;
  longRunningDetectedRef: MutableRefObject<boolean>;
  hasRdContext: boolean;
  isOpsScene: boolean;
  isSrvEnvScene: boolean;
  isEnvFixScene: boolean;
  userConsentedRef: MutableRefObject<boolean>;
}) {
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingReasoning, setStreamingReasoning] = useState('');
  const [toolCalls, setToolCalls] = useState<ToolCallDisplay[]>([]);
  const [streamingToolCalls, setStreamingToolCalls] = useState<StreamingToolCall[]>([]);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const streamingMsgIdRef = useRef<string | null>(null);
  const toolCallCounterRef = useRef(0);
  const notify = useNotify().notify;

  // 合并流式工具调用和执行中工具调用
  const combinedToolCalls = useMemo<ToolCallDisplay[]>(() => {
    const streaming: ToolCallDisplay[] = streamingToolCalls.map((stc, idx) => ({
      id: `streaming-${stc.index}-${idx}`,
      toolName: stc.name || '...',
      arguments: (() => {
        try {
          return stc.arguments ? JSON.parse(stc.arguments) : {};
        } catch {
          return { _raw: stc.arguments };
        }
      })(),
      result: null,
      success: null,
      status: stc.isStreaming ? 'streaming' : 'done',
    }));
    return [...streaming, ...toolCalls];
  }, [streamingToolCalls, toolCalls]);

  useEffect(() => {
    if (!conversationId) return;

    const unlistenChunk = listen<StreamChunk>('agent-chunk', (event) => {
      if (event.payload.conversationId === conversationId) {
        const chunk = event.payload.chunk;
        // 工具调用流式增量（\x02 前缀 + JSON）
        if (chunk.startsWith('\x02')) {
          try {
            const deltas: Array<{
              index: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }> = JSON.parse(chunk.slice(1));
            setStreamingToolCalls((prev) => {
              const next = [...prev];
              for (const delta of deltas) {
                const idx = next.findIndex((tc) => tc.index === delta.index);
                if (idx === -1) {
                  next.push({
                    index: delta.index,
                    id: delta.id,
                    name: delta.function?.name ?? '',
                    arguments: delta.function?.arguments ?? '',
                    isStreaming: true,
                  });
                } else {
                  const tc = next[idx];
                  next[idx] = {
                    ...tc,
                    id: delta.id ?? tc.id,
                    name: (tc.name + (delta.function?.name ?? '')).trim(),
                    arguments: tc.arguments + (delta.function?.arguments ?? ''),
                    isStreaming: true,
                  };
                }
              }
              return next;
            });
          } catch (e) {
            // 静默忽略解析错误
          }
        }
        // 完成原因（\x03 前缀）
        else if (chunk.startsWith('\x03')) {
          const reason = chunk.slice(1);
          if (reason === 'tool_calls' || reason === 'tool_use') {
            setStreamingToolCalls((prev) => prev.map((tc) => ({ ...tc, isStreaming: false })));
          }
        }
        // 思考过程（\x04 前缀）
        else if (chunk.startsWith('\x04')) {
          const reasoningText = chunk.slice(1);
          if (reasoningText) {
            setStreamingReasoning((prev) => prev + reasoningText);
          }
        }
        // 普通文本内容
        else {
          setStreamingContent((prev) => {
            const next = prev + chunk;
            // 流式中检测 LONG_RUNNING 标记，提前启动倒计时
            if (!longRunningDetectedRef.current) {
              detectLongRunning(next, 'stream');
            }
            return next;
          });
        }
      }
    });

    const unlistenDone = listen<StreamDone>('agent-done', async (event) => {
      if (event.payload.conversationId === conversationId) {
        const msgId = streamingMsgIdRef.current;
        const responseText = event.payload.response || '';
        if (msgId) {
          setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, content: responseText } : m));
        }
        try {
          const allMsgs = await listMessages(conversationId);
          setMessages(allMsgs);
          const firstUserMsg = allMsgs.find((m) => m.role === 'user');
          if (firstUserMsg) {
            const autoTitle = firstUserMsg.content.replace(/\[(?:附件|Attachment):.*?\]\s*/g, '').trim().slice(0, 40);
            if (autoTitle) {
              updateConversationTitle(conversationId, autoTitle).catch((e) => notify(localizeBackendError(e)));
              setConvList((prev) => prev.map((c) => c.id === conversationId ? { ...c, title: autoTitle } : c));
            }
          }
        } catch (err) { console.error('AiCopilotPage: operation failed', err); }

        // 检测 LONG_RUNNING 标记：Agent 执行了长耗时命令，前端倒计时等待
        detectLongRunning(responseText, 'final');

        // 安装助手：同意过安装的会话结束时，通知发起窗口刷新状态，
        // 省去用户手动点「重新检查」。事件名按场景区分。
        if (hasRdContext && userConsentedRef.current && !isOpsScene) {
          emit(isSrvEnvScene ? 'srv-env-setup-completed' : 'rd-setup-completed', { conversationId }).catch(() => {});
        }
        // 环境修复场景：用户同意修复并完成后，通知刷新环境检测
        if (isEnvFixScene && userConsentedRef.current) {
          emit('env-fix-completed', { conversationId }).catch(() => {});
        }
        setStreamingContent('');
        setStreamingReasoning('');
        setStreamingToolCalls([]);
        setLoading(false);
        setAgentStatus(null);
        streamingMsgIdRef.current = null;
      }
    });

    const unlistenError = listen<StreamError>('agent-error', (event) => {
      if (event.payload.conversationId === conversationId) {
        const msgId = streamingMsgIdRef.current;
        if (msgId) {
          setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, content: `❌ ${event.payload.error}` } : m));
        }
        setStreamingContent('');
        setStreamingReasoning('');
        setStreamingToolCalls([]);
        setLoading(false);
        // 设置错误状态（保持显示，不清除状态栏）
        setAgentStatus({
          status: 'error',
          iteration: 0,
          maxIterations: 0,
          detail: event.payload.error,
          streamStats: null,
          contextUsage: null,
          isOllama: isOllamaModel,
        });
        streamingMsgIdRef.current = null;
      }
    });

    const unlistenPanic = listen<{ message: string; location: string }>('app-panic', (event) => {
      // 后端命令 panic 时 invoke Promise 永远不会 resolve/reject，
      // 必须靠此事件解除 loading，否则界面永远"思考中"。
      const msgId = streamingMsgIdRef.current;
      const panicText = `❌ 后端内部错误（已恢复）：${event.payload.location || '未知位置'}`;
      if (msgId) {
        setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, content: panicText } : m));
      }
      if (streamingMsgIdRef.current !== null) {
        setStreamingContent('');
        setStreamingReasoning('');
        setStreamingToolCalls([]);
        setLoading(false);
        streamingMsgIdRef.current = null;
        console.error('[AiCopilotPage] backend panic:', event.payload.message);
      }
    });

    const unlistenToolCall = listen<ToolCallPayload>('agent-tool-call', (event) => {
      if (event.payload.conversationId === conversationId) {
        const tc = event.payload.toolCall;
        if (tc.status === 'running') {
          toolCallCounterRef.current += 1;
          const id = `tc-${toolCallCounterRef.current}`;
          setToolCalls((prev) => [...prev, {
            id, toolName: tc.tool_name, arguments: tc.arguments,
            result: null, success: null, status: 'running',
          }]);
        } else {
          setToolCalls((prev) => {
            const last = prev.length - 1;
            if (last >= 0 && prev[last].status === 'running') {
              const updated = [...prev];
              updated[last] = { ...updated[last], result: tc.result, success: tc.success, status: 'done' };
              return updated;
            }
            return prev;
          });
        }
      }
    });

    const unlistenStatus = listen<AgentStatusPayload>('agent-status', (event) => {
      if (event.payload.conversationId === conversationId) {
        setAgentStatus({
          status: event.payload.status,
          iteration: event.payload.iteration,
          maxIterations: event.payload.maxIterations,
          detail: event.payload.detail,
          streamStats: event.payload.streamStats || null,
          contextUsage: event.payload.contextUsage || null,
          isOllama: isOllamaModel,
        });
        if (event.payload.status === 'done') {
          setTimeout(() => setAgentStatus(null), 1500);
        } else if (event.payload.status === 'error') {
          // 错误状态：停止 loading，保持错误状态显示
          setLoading(false);
        }
      }
    });

    return () => {
      unlistenChunk.then((fn) => fn());
      unlistenDone.then((fn) => fn());
      unlistenError.then((fn) => fn());
      unlistenPanic.then((fn) => fn());
      unlistenToolCall.then((fn) => fn());
      unlistenStatus.then((fn) => fn());
    };
  }, [conversationId]);

  const sendMessage = useCallback(async (messageText: string) => {
    if (!messageText.trim() || !conversationId || !boundAgentId) return;

    const userMsg: MessageDto = {
      id: crypto.randomUUID(), conversationId, role: 'user',
      content: messageText.trim(), toolCalls: '', isError: 0, createdAt: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    setToolCalls([]);
    setStreamingToolCalls([]);
    toolCallCounterRef.current = 0;

    try { await saveMessage(userMsg); } catch (err) { console.error('AiCopilotPage: operation failed', err); }

    const assistantMsgId = crypto.randomUUID();
    streamingMsgIdRef.current = assistantMsgId;

    const assistantMsg: MessageDto = {
      id: assistantMsgId, conversationId, role: 'assistant',
      content: '', toolCalls: '', isError: 0, createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, assistantMsg]);
    setStreamingContent('');
    setStreamingReasoning('');
    setStreamingToolCalls([]);
    longRunningDetectedRef.current = false; // 新对话重置检测标记

    try {
      await runAgent(boundAgentId, messageText.trim(), conversationId);
    } catch (e) {
      setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, content: `❌ ${localizeBackendError(e)}` } : m));
      setStreamingContent('');
      setStreamingReasoning('');
      setStreamingToolCalls([]);
      setLoading(false);
      streamingMsgIdRef.current = null;
    }
  }, [conversationId, boundAgentId]);

  const handleStop = async () => {
    if (conversationId) {
      try {
        await stopAgent(conversationId);
      } catch (err) { console.error('AiCopilotPage: operation failed', err); }
    }
    setLoading(false);
    setStreamingContent('');
    setStreamingReasoning('');
    setStreamingToolCalls([]);
    streamingMsgIdRef.current = null;
  };

  return {
    loading,
    streamingContent,
    streamingReasoning,
    agentStatus,
    combinedToolCalls,
    streamingMsgIdRef,
    sendMessage,
    handleStop,
  };
}