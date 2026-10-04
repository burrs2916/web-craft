import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@mui/material/styles';
import { listen } from '@tauri-apps/api/event';
import { useAgentStore } from '../../store/agentStore';
import type { MessageDto } from '../../../../proto/agent';
import { useNotify } from '../../../../core/notification';
import { runAgent, saveMessage, stopAgent, respondPermission, cleanupOldConversations } from '../../../../core/services/agent.service';
import { localizeBackendError } from '../../../../core/backendError';
import type { ToolCallDisplay } from '../../../../components/chat/ChatComponents';
import type { FileAttachment } from '../../../../components/chat/ChatComponents';
import type { RepairPlanData } from '../RepairProgressPanel';
import type {
  StreamChunk, StreamDone, StreamError, ToolCallPayload,
  StreamingToolCallDelta, StreamingToolCall,
  PermissionRequestPayload, AgentStatus, AgentStatusPayload,
} from './types';

export function useAgentChat() {
  const {
    messages, activeConversationId, activeAgentId,
    agents, conversations, models,
    loadMessages, addMessage, updateMessage, createConversation, deleteConversation,
    updateConversationTitle, loadConversations, loadAgents, loadModels, deleteMessagesAfter,
  } = useAgentStore();
  const notify = useNotify().notify;
  const { t } = useTranslation('agent');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const agentColor = isDark ? '#CE93D8' : '#7B1FA2';
  const userColor = isDark ? '#60A5FA' : '#1D4ED8';
  const mutedBorder = isDark ? 'rgba(48,54,61,0.6)' : 'rgba(0,0,0,0.08)';

  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingReasoning, setStreamingReasoning] = useState('');
  const [toolCalls, setToolCalls] = useState<ToolCallDisplay[]>([]);
  const [streamingToolCalls, setStreamingToolCalls] = useState<StreamingToolCall[]>([]);
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequestPayload | null>(null);
  const [deleteConvConfirm, setDeleteConvConfirm] = useState<string | null>(null);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [repairPlan, setRepairPlan] = useState<RepairPlanData | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingMsgIdRef = useRef<string | null>(null);
  const toolCallCounterRef = useRef(0);

  // 合并流式工具调用和正式工具调用，流式的在前（正在生成中），正式的在后（正在执行/已完成）
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
      status: 'streaming',
    }));
    return [...streaming, ...toolCalls];
  }, [streamingToolCalls, toolCalls]);

  useEffect(() => {
    loadAgents();
    loadModels();
  }, [loadAgents, loadModels]);

  useEffect(() => {
    if (activeAgentId) {
      loadConversations(activeAgentId);
    } else {
      useAgentStore.getState().setActiveConversation(null);
    }
  }, [activeAgentId, loadConversations]);

  useEffect(() => {
    if (activeAgentId && conversations.length === 0 && !activeConversationId) {
      createConversation(activeAgentId, t('chat.new_conversation_title'));
    } else if (activeAgentId && !activeConversationId && conversations.length > 0) {
      useAgentStore.getState().setActiveConversation(conversations[0].id);
    }
  }, [activeAgentId, conversations.length, activeConversationId, createConversation]);

  useEffect(() => {
    if (activeConversationId) {
      loadMessages(activeConversationId);
    }
    // 切换会话时清理所有运行时状态，确保会话间完全隔离
    setStreamingContent('');
    setStreamingReasoning('');
    setToolCalls([]);
    setStreamingToolCalls([]);
    setAgentStatus(null);
    setLoading(false);
    setRepairPlan(null);
    setPermissionRequest(null);
    streamingMsgIdRef.current = null;
    toolCallCounterRef.current = 0;
  }, [activeConversationId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, toolCalls]);

  useEffect(() => {
    const unlistenChunk = listen<StreamChunk>('agent-chunk', (event) => {
      if (event.payload.conversationId === activeConversationId) {
        const chunk = event.payload.chunk;
        // 工具调用流式增量（\x02 前缀 + JSON）
        if (chunk.startsWith('\x02')) {
          try {
            const deltas: StreamingToolCallDelta[] = JSON.parse(chunk.slice(1));
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
          // 流式工具调用生成完成，标记为非 streaming 状态
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
          setStreamingContent((prev) => prev + chunk);
        }
      }
    });

    const unlistenDone = listen<StreamDone>('agent-done', async (event) => {
      if (event.payload.conversationId === activeConversationId) {
        const msgId = streamingMsgIdRef.current;
        if (msgId) {
          updateMessage(msgId, event.payload.response);
        }
        if (activeConversationId) {
          try {
            await loadMessages(activeConversationId);
          } catch (err) { console.error('AgentChat: failed to load messages after agent-done', err); }
          const conv = useAgentStore.getState().conversations.find((c) => c.id === activeConversationId);
          if (conv) {
            const isDefaultTitle = conv.title === t('chat.new_conversation_title') || conv.title === 'New Conversation' || conv.title === 'AI Copilot';
            if (isDefaultTitle) {
              const msgs = useAgentStore.getState().messages;
              const firstUserMsg = msgs.find((m) => m.role === 'user');
              if (firstUserMsg) {
                const autoTitle = firstUserMsg.content.replace(/\[(?:附件|Attachment):.*?\]\s*/g, '').trim().slice(0, 40);
                if (autoTitle) {
                  updateConversationTitle(activeConversationId, autoTitle).catch((e) => notify(localizeBackendError(e)));
                }
              }
            }
          }
        }
        setStreamingContent('');
        setStreamingReasoning('');
        setStreamingToolCalls([]);
        setLoading(false);
        streamingMsgIdRef.current = null;
      }
    });

    const unlistenError = listen<StreamError>('agent-error', (event) => {
      if (event.payload.conversationId === activeConversationId) {
        const msgId = streamingMsgIdRef.current;
        if (msgId) {
          updateMessage(msgId, `❌ ${event.payload.error}`);
        }
        setStreamingContent('');
        setStreamingReasoning('');
        setStreamingToolCalls([]);
        setLoading(false);
        streamingMsgIdRef.current = null;
      }
    });

    const unlistenToolCall = listen<ToolCallPayload>('agent-tool-call', (event) => {
      if (event.payload.conversationId === activeConversationId) {
        const tc = event.payload.toolCall;
        if (tc.status === 'running') {
          toolCallCounterRef.current += 1;
          const id = `tc-${toolCallCounterRef.current}`;
          // 工具开始执行时，移除第一个流式工具调用（按顺序对应）
          setStreamingToolCalls((prev) => prev.slice(1));
          setToolCalls((prev) => [...prev, {
            id, toolName: tc.tool_name, arguments: tc.arguments,
            result: null, success: null, status: 'running',
            durationMs: null,
          }]);
        } else if (tc.status === 'denied') {
          setToolCalls((prev) => {
            const last = prev.length - 1;
            if (last >= 0 && prev[last].status === 'running') {
              const updated = [...prev];
              updated[last] = { ...updated[last], result: tc.result, success: false, status: 'denied', durationMs: tc.duration_ms ?? null };
              return updated;
            }
            return prev;
          });
        } else {
          setToolCalls((prev) => {
            const last = prev.length - 1;
            if (last >= 0 && prev[last].status === 'running') {
              const updated = [...prev];
              updated[last] = { ...updated[last], result: tc.result, success: tc.success, status: 'done', durationMs: tc.duration_ms ?? null };
              return updated;
            }
            return prev;
          });
        }
      }
    });

    const unlistenPermission = listen<PermissionRequestPayload>('agent-permission-request', (event) => {
      if (event.payload.conversationId === activeConversationId) {
        setPermissionRequest(event.payload);
      }
    });

    const unlistenRepairProgress = listen<RepairPlanData & { conversationId: string }>('agent-repair-progress', (event) => {
      if (event.payload.conversationId === activeConversationId) {
        setRepairPlan(event.payload);
      }
    });

    const unlistenStatus = listen<AgentStatusPayload>('agent-status', (event) => {
      if (event.payload.conversationId === activeConversationId) {
        setAgentStatus({
          status: event.payload.status,
          iteration: event.payload.iteration,
          maxIterations: event.payload.maxIterations,
          detail: event.payload.detail,
          streamStats: event.payload.streamStats || null,
          contextUsage: event.payload.contextUsage || null,
        });
        // 完成时清除状态
        if (event.payload.status === 'done') {
          setTimeout(() => setAgentStatus(null), 1500);
        }
      }
    });

    return () => {
      unlistenChunk.then((fn) => fn());
      unlistenDone.then((fn) => fn());
      unlistenError.then((fn) => fn());
      unlistenToolCall.then((fn) => fn());
      unlistenPermission.then((fn) => fn());
      unlistenRepairProgress.then((fn) => fn());
      unlistenStatus.then((fn) => fn());
    };
  }, [activeConversationId, updateMessage]);

  const handlePermissionResponse = useCallback(async (approved: boolean, alwaysAllow: boolean) => {
    if (permissionRequest) {
      try {
        await respondPermission(permissionRequest.conversationId, approved, alwaysAllow);
      } catch (err) { console.error('AgentChat: failed to respond to permission', err); }
      setPermissionRequest(null);
    }
  }, [permissionRequest]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !activeConversationId || !activeAgentId) return;

    let messageContent = input.trim();
    if (attachments.length > 0) {
      const attachmentText = attachments.map((f) => `[${t('agent.attachment')}: ${f.path}]`).join('\n');
      messageContent = `${attachmentText}\n\n${messageContent}`;
    }

    const userMsg: MessageDto = {
      id: crypto.randomUUID(),
      conversationId: activeConversationId,
      role: 'user',
      content: messageContent,
      toolCalls: '',
      isError: 0,
      createdAt: Date.now(),
    };

    addMessage(userMsg);
    setInput('');
    setAttachments([]);
    setLoading(true);
    setToolCalls([]);
    setStreamingToolCalls([]);
    setRepairPlan(null);
    toolCallCounterRef.current = 0;

    try { await saveMessage(userMsg); } catch (err) { console.error('AgentChat: failed to save message', err); notify(t('chat.message_save_failed')); }

    const assistantMsgId = crypto.randomUUID();
    streamingMsgIdRef.current = assistantMsgId;

    const assistantMsg: MessageDto = {
      id: assistantMsgId,
      conversationId: activeConversationId,
      role: 'assistant',
      content: '',
      toolCalls: '',
      isError: 0,
      createdAt: Date.now(),
    };
    addMessage(assistantMsg);
    setStreamingContent('');
    setStreamingReasoning('');

    try {
      await runAgent(activeAgentId, input.trim(), activeConversationId);
    } catch (e) {
      updateMessage(assistantMsgId, `❌ ${localizeBackendError(e)}`);
      setStreamingContent('');
      setStreamingReasoning('');
      setLoading(false);
      streamingMsgIdRef.current = null;
    }
  }, [input, activeConversationId, activeAgentId, addMessage, updateMessage]);

  const handleStop = async () => {
    if (activeConversationId) {
      try {
        await stopAgent(activeConversationId);
      } catch (err) { console.error('AgentChat: failed to stop agent', err); }
    }
    setLoading(false);
    setStreamingContent('');
    setStreamingReasoning('');
    streamingMsgIdRef.current = null;
  };

  const handleNewChat = async () => {
    if (activeAgentId) {
      await createConversation(activeAgentId, t('chat.new_conversation_title'));
    }
  };

  const handleDeleteConversation = useCallback(async (convId: string) => {
    await deleteConversation(convId);
    setDeleteConvConfirm(null);
  }, [deleteConversation]);

  const handleCleanupConversations = useCallback(async () => {
    if (!activeAgentId) return;
    if (!confirm(`确认清理旧会话？将保留最近 20 个未运行的会话。`)) return;
    setCleaningUp(true);
    try {
      const deleted = await cleanupOldConversations(activeAgentId, 20, 30);
      notify(`已清理 ${deleted} 个旧会话`);
      // 刷新列表
      if (activeAgentId) {
        loadConversations(activeAgentId);
      }
    } catch (err) {
      notify(`清理失败：${localizeBackendError(err)}`);
    } finally {
      setCleaningUp(false);
    }
  }, [activeAgentId, notify]);

  const handleEditMessage = useCallback((_messageId: string, content: string) => {
    const cleaned = content.replace(/\[(?:附件|Attachment):.*?\]\s*/g, '').trim();
    setInput(cleaned);
  }, []);

  const handleRegenerate = useCallback(async (assistantMsgId: string) => {
    if (!activeConversationId || !activeAgentId || loading) return;
    const msgIdx = messages.findIndex((m) => m.id === assistantMsgId);
    if (msgIdx < 0) return;
    const prevUserMsg = [...messages].slice(0, msgIdx).reverse().find((m) => m.role === 'user');
    if (!prevUserMsg) return;
    await deleteMessagesAfter(activeConversationId, prevUserMsg.id);
    await loadMessages(activeConversationId);
    setLoading(true);
    setToolCalls([]);
    toolCallCounterRef.current = 0;
    const newAssistantMsgId = crypto.randomUUID();
    streamingMsgIdRef.current = newAssistantMsgId;
    const assistantMsg: MessageDto = {
      id: newAssistantMsgId,
      conversationId: activeConversationId,
      role: 'assistant',
      content: '',
      toolCalls: '',
      isError: 0,
      createdAt: Date.now(),
    };
    addMessage(assistantMsg);
    setStreamingContent('');
    setStreamingReasoning('');
    try {
      await runAgent(activeAgentId, prevUserMsg.content.replace(/\[(?:附件|Attachment):.*?\]\s*/g, '').trim(), activeConversationId);
    } catch (e) {
      updateMessage(newAssistantMsgId, `❌ ${localizeBackendError(e)}`);
      setStreamingContent('');
      setStreamingReasoning('');
      setLoading(false);
      streamingMsgIdRef.current = null;
    }
  }, [activeConversationId, activeAgentId, loading, messages, deleteMessagesAfter, loadMessages, addMessage, updateMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const activeAgent = agents.find((a) => a.id === activeAgentId);
  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  return {
    // 主题与文案
    t, isDark, agentColor, userColor, mutedBorder,
    // 数据
    messages, activeConversationId, activeAgentId, agents, conversations, models,
    activeAgent, activeConversation,
    // 输入与加载
    input, setInput, attachments, setAttachments, loading,
    // 流式渲染状态
    streamingContent, streamingReasoning, combinedToolCalls, agentStatus, streamingMsgIdRef,
    repairPlan, messagesEndRef,
    // 权限
    permissionRequest, handlePermissionResponse,
    // 会话管理
    deleteConvConfirm, setDeleteConvConfirm, handleDeleteConversation,
    cleaningUp, handleCleanupConversations, handleNewChat,
    // 发送
    handleSend, handleStop, handleKeyDown,
    // 消息操作
    handleEditMessage, handleRegenerate,
  };
}