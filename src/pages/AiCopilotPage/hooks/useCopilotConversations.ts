/**
 * AI Copilot 会话与消息管理：会话列表加载、当前会话选择、新建/删除会话，
 * 以及首次进入时的会话初始化（无会话则按上下文新建）。
 *
 * 从 AiCopilotPage/index.tsx 迁出，仅做代码搬迁。
 */
import { useCallback, useEffect, useState } from 'react';
import { listMessages, listConversations, deleteConversation } from '../../../core/services/agent.service';
import type { ConversationDto, MessageDto } from '../../../proto/agent';

export function useCopilotConversations({
  boundAgentId,
  sessionAlive,
  isEnvFixScene,
  isOpsScene,
  isSrvEnvScene,
  createConversationWithContext,
}: {
  boundAgentId: string | null | undefined;
  sessionAlive: boolean | null;
  isEnvFixScene: boolean;
  isOpsScene: boolean;
  isSrvEnvScene: boolean;
  createConversationWithContext: (agentId: string, title: string) => Promise<ConversationDto>;
}) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [convList, setConvList] = useState<ConversationDto[]>([]);

  const loadConversations = useCallback(async (): Promise<ConversationDto[]> => {
    if (!boundAgentId) return [];
    try {
      const convs = await listConversations(boundAgentId);
      const sorted = [...convs].sort((a, b) => b.updatedAt - a.updatedAt);
      setConvList(sorted);
      return sorted;
    } catch (err) { console.error('AiCopilotPage: operation failed', err); return []; }
  }, [boundAgentId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // envFix/ops/srvEnv 场景下，等 session 检查完成再加载对话
      if ((isEnvFixScene || isOpsScene || isSrvEnvScene) && sessionAlive === null) return;
      const sorted = await loadConversations();
      if (cancelled) return;
      if (sorted.length > 0) {
        const conv = sorted[0];
        setConversationId(conv.id);
        try {
          const msgs = await listMessages(conv.id);
          if (!cancelled) setMessages(msgs);
        } catch (e) { console.error('AiCopilotPage: operation failed', e); }
      } else {
        try {
          const conv = await createConversationWithContext(boundAgentId!, 'AI Copilot');
          if (!cancelled) {
            setConversationId(conv.id);
            setMessages([]);
            setConvList([conv]);
          }
        } catch (e) { console.error('AiCopilotPage: operation failed', e); }
      }
    })();
    return () => { cancelled = true; };
  }, [boundAgentId, loadConversations, isEnvFixScene, isOpsScene, isSrvEnvScene, sessionAlive]);

  const selectConversation = useCallback(async (id: string) => {
    setConversationId(id);
    setMessages([]);
    try {
      const msgs = await listMessages(id);
      setMessages(msgs);
    } catch (e) { console.error('AiCopilotPage: operation failed', e); }
  }, []);

  const handleNewChat = async () => {
    if (!boundAgentId) return;
    try {
      const conv = await createConversationWithContext(boundAgentId, 'AI Copilot');
      setConvList((prev) => [conv, ...prev].sort((a, b) => b.updatedAt - a.updatedAt));
      setConversationId(conv.id);
      setMessages([]);
    } catch (err) { console.error('AiCopilotPage: operation failed', err); }
  };

  const handleDeleteConv = async (id: string) => {
    try {
      await deleteConversation(id);
      setConvList((prev) => {
        const next = prev.filter((c) => c.id !== id);
        if (conversationId === id) {
          if (next.length > 0) {
            const recent = next[0];
            setConversationId(recent.id);
            listMessages(recent.id).then((msgs) => setMessages(msgs)).catch(() => {});
          } else {
            setConversationId(null);
            setMessages([]);
          }
        }
        return next;
      });
    } catch (err) { console.error('AiCopilotPage: operation failed', err); }
  };

  return {
    conversationId,
    setConversationId,
    messages,
    setMessages,
    convList,
    setConvList,
    loadConversations,
    selectConversation,
    handleNewChat,
    handleDeleteConv,
  };
}