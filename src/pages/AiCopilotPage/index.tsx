import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Box, Divider } from '@mui/material';
import { RobotIcon } from '@phosphor-icons/react';
import { listen } from '@tauri-apps/api/event';
import { useTheme } from '@mui/material/styles';
import { useAgentStore } from '../../features/agent/store/agentStore';
import { ChatMessagesArea, ChatInputArea, type FileAttachment } from '../../components/chat/ChatComponents';
import { useFeatureGate, LockedScreen } from '../../features/licensing';
import { getTerminalCopilotAgentId, setTerminalCopilotAgentId } from './types';
import { ConversationSidebar } from './ConversationSidebar';
import { OllamaStatusAlerts } from './OllamaStatusAlerts';
import { SessionNotices } from './SessionNotices';
import { ContextInstallCards } from './ContextInstallCards';
import { EnvFixCards } from './EnvFixCards';
import { CopilotHeader } from './CopilotHeader';
import { NoAgentBoundView } from './NoAgentBoundView';
import { useCopilotContext } from './hooks/useCopilotContext';
import { useCopilotConversations } from './hooks/useCopilotConversations';
import { useLongRunningCountdown } from './hooks/useLongRunningCountdown';
import { useOllamaStatus } from './hooks/useOllamaStatus';
import { useAgentStream } from './hooks/useAgentStream';
import { useInstallConsent } from './hooks/useInstallConsent';
import { useEnvFixFlow } from './hooks/useEnvFixFlow';

export { getTerminalCopilotAgentId, setTerminalCopilotAgentId };

/**
 * AI Copilot 页面外壳：组合场景上下文、会话管理、流式对话、倒计时、
 * Ollama 状态、安装同意与环境修复等 hook，并渲染各展示子组件。
 *
 * 拆分说明：共享类型见 `types.ts`；展示组件见 `ConversationSidebar` / `OllamaStatusAlerts` /
 * `SessionNotices` / `ContextInstallCards` / `EnvFixCards` / `CopilotHeader` / `NoAgentBoundView`；
 * 逻辑见 `hooks/` 下各 hook。
 */
export function AiCopilotPage() {
  // Pro 功能：未付费时显示锁定页
  const featureGate = useFeatureGate('ai_copilot');

  const {
    t,
    urlAgentId,
    isSrvEnvScene,
    isOpsScene,
    isEnvFixScene,
    hasRdContext,
    hasOpsContext,
    sessionAlive,
    sessionDead,
    sessionDeadReason,
    createConversationWithContext,
  } = useCopilotContext();

  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const agentColor = isDark ? '#38BDF8' : '#0284C7';
  const userColor = isDark ? '#60A5FA' : '#1D4ED8';
  const mutedBorder = isDark ? 'rgba(48,54,61,0.6)' : 'rgba(0,0,0,0.08)';

  const { agents, models, endpoints, loadAgents, loadModels, loadEndpoints, checkOllamaStatus } = useAgentStore();

  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');

  // 安装/修复场景共用同意标记（两场景互斥，由窗口 URL 决定）。
  const userConsentedRef = useRef(false);

  const storedAgentId = getTerminalCopilotAgentId();
  const boundAgentId = urlAgentId ?? storedAgentId;
  const boundAgent = agents.find((a) => a.id === boundAgentId);
  const boundModel = boundAgent ? models.find((m) => m.id === boundAgent.modelId) : null;
  // 绑定 id 残留但对应智能体已不存在（被删/改）时，给出明确提示，而非运行期崩溃
  const boundAgentMissing = boundAgentId != null && agents.length > 0 && !boundAgent;

  const {
    conversationId,
    messages,
    setMessages,
    setConvList,
    convList,
    selectConversation,
    handleNewChat,
    handleDeleteConv,
  } = useCopilotConversations({
    boundAgentId,
    sessionAlive,
    isEnvFixScene,
    isOpsScene,
    isSrvEnvScene,
    createConversationWithContext,
  });

  // 长耗时命令倒计时；sendMessage 经 ref 注入以避免与流式 hook 循环依赖。
  const sendMessageRef = useRef<((msg: string) => Promise<void>) | null>(null);
  const {
    longRunningTask,
    detectLongRunning,
    handleSkipWait,
    formatTimeLeft,
    longRunningDetectedRef,
  } = useLongRunningCountdown({ conversationId, sendMessageRef });

  const { isOllamaModel, currentEndpoint, ollamaStatus, setOllamaStatus } = useOllamaStatus({
    boundModel,
    endpoints,
    checkOllamaStatus,
  });

  const {
    loading,
    streamingContent,
    streamingReasoning,
    agentStatus,
    combinedToolCalls,
    streamingMsgIdRef,
    sendMessage,
    handleStop,
  } = useAgentStream({
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
  });

  const {
    rdStatus,
    srvEnvStatus,
    handleAgreeInstall,
    handleDeclineInstall,
    handleAgreeEnvInstall,
    handleDeclineEnvInstall,
  } = useInstallConsent({ loading, hasRdContext, isSrvEnvScene, messages, sendMessage, userConsentedRef });

  const {
    envFixStatus,
    envFixSteps,
    currentFixStep,
    handleAgreeEnvFix,
    handleDeclineEnvFix,
    handleRetryEnvFix,
  } = useEnvFixFlow({
    isEnvFixScene,
    loading,
    messages,
    streamingContent,
    conversationId,
    boundAgentId,
    sendMessage,
    userConsentedRef,
  });

  // 若回退发生了，持久化新选择，保证后续加载稳定。
  // 注：来自设置指南的临时绑定（URL 带 agentId）不覆盖用户常驻的 copilot 绑定。
  useEffect(() => {
    if (urlAgentId) return;
    if (boundAgentId && boundAgentId !== storedAgentId) {
      setTerminalCopilotAgentId(boundAgentId);
    }
  }, [boundAgentId, storedAgentId, urlAgentId]);

  useEffect(() => {
    loadAgents();
    loadModels();
    loadEndpoints();
  }, [loadAgents, loadModels, loadEndpoints]);

  // 同步到 ref，供倒计时等场景使用（避免循环依赖）
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  // 过滤后的会话列表（按标题搜索）
  const filteredConvList = useMemo(() => {
    if (!searchKeyword.trim()) return convList;
    const keyword = searchKeyword.toLowerCase().trim();
    return convList.filter((c) =>
      c.title?.toLowerCase().includes(keyword)
    );
  }, [convList, searchKeyword]);

  useEffect(() => {
    if (!boundAgentId || !conversationId) return;

    const triggerType = boundAgent?.triggerType || 'manual';
    if (triggerType === 'manual') return;

    const supportsFailure = triggerType === 'auto_failure' || triggerType === 'auto_both';
    const supportsSave = triggerType === 'auto_save' || triggerType === 'auto_both';

    const unlisteners: (() => void)[] = [];

    if (supportsFailure) {
      listen<{ triggerType: string; command: string; exitCode: number; sessionId: string }>('auto-trigger-agent', (event) => {
        if (event.payload.triggerType !== 'auto_failure') return;
        if (loading) return;
        const autoMessage = t('copilot.auto_failure_prompt', { command: event.payload.command, exitCode: event.payload.exitCode });
        sendMessage(autoMessage);
      }).then((fn) => { unlisteners.push(fn); });
    }

    if (supportsSave) {
      listen<{ triggerType: string; noteId: string; noteTitle: string; action: string }>('auto-trigger-agent', (event) => {
        if (event.payload.triggerType !== 'auto_save') return;
        if (loading) return;
        const actionText = event.payload.action === 'create' ? t('copilot.auto_save_create') : t('copilot.auto_save_update');
        const autoMessage = t('copilot.auto_save_prompt', { action: actionText, title: event.payload.noteTitle });
        sendMessage(autoMessage);
      }).then((fn) => { unlisteners.push(fn); });
    }

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, [boundAgentId, conversationId, boundAgent?.triggerType, loading, sendMessage]);

  const handleSend = useCallback(async () => {
    if (!input.trim()) return;
    let messageContent = input.trim();
    if (attachments.length > 0) {
      const attachmentText = attachments.map((f) => t('copilot.attachment_prefix', { path: f.path })).join('\n');
      messageContent = `${attachmentText}\n\n${messageContent}`;
    }
    setInput('');
    setAttachments([]);
    await sendMessage(messageContent);
  }, [input, attachments, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!boundAgentId || boundAgentMissing) {
    return <NoAgentBoundView t={t} missing={boundAgentMissing} />;
  }

  // 未付费用户显示锁定页
  if (!featureGate.canUse) {
    return <LockedScreen feature="ai_copilot" />;
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'row', bgcolor: 'background.default' }}>
      <ConversationSidebar
        open={sidebarOpen}
        mutedBorder={mutedBorder}
        isDark={isDark}
        agentColor={agentColor}
        t={t}
        searchKeyword={searchKeyword}
        onSearchChange={setSearchKeyword}
        conversations={filteredConvList}
        activeId={conversationId}
        onSelect={selectConversation}
        onDelete={handleDeleteConv}
        onNewChat={handleNewChat}
      />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <CopilotHeader
          t={t}
          agentColor={agentColor}
          isDark={isDark}
          agentName={boundAgent?.name}
          modelName={boundModel?.name}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
          onNewChat={handleNewChat}
        />
        <Divider sx={{ borderColor: mutedBorder }} />
        <OllamaStatusAlerts
          isOllamaModel={isOllamaModel}
          ollamaStatus={ollamaStatus}
          setOllamaStatus={setOllamaStatus}
          currentEndpoint={currentEndpoint}
          boundModel={boundModel}
          checkOllamaStatus={checkOllamaStatus}
        />
        <SessionNotices
          t={t}
          isDark={isDark}
          agentColor={agentColor}
          sessionDead={sessionDead}
          sessionDeadReason={sessionDeadReason}
          longRunningTask={longRunningTask}
          formatTimeLeft={formatTimeLeft}
          onSkipWait={handleSkipWait}
        />

        <ChatMessagesArea
          messages={messages}
          streamingContent={streamingContent}
          streamingReasoning={streamingReasoning}
          streamingMsgId={streamingMsgIdRef.current}
          loading={loading}
          toolCalls={combinedToolCalls}
          agentColor={agentColor}
          userColor={userColor}
          isDark={isDark}
          conversationId={conversationId ?? undefined}
          emptyIcon={<RobotIcon size={40} weight="duotone" color={agentColor} />}
          emptyText={isEnvFixScene ? t('copilot.env_fix_empty_hint') : hasOpsContext ? t('copilot.ops_empty_hint') : hasRdContext ? (isSrvEnvScene ? t('copilot.srv_empty_hint') : t('copilot.rd_empty_hint')) : t('copilot.empty_hint')}
          thinkingText={t('copilot.thinking')}
          agentStatus={agentStatus}
        />
        <ChatInputArea
          input={input}
          setInput={setInput}
          handleSend={handleSend}
          handleKeyDown={handleKeyDown}
          loading={loading}
          conversationId={conversationId}
          agentName={boundAgent?.name}
          agentColor={agentColor}
          userColor={userColor}
          isDark={isDark}
          placeholder={isEnvFixScene ? t('copilot.env_fix_input_placeholder') : hasOpsContext ? t('copilot.ops_input_placeholder') : hasRdContext ? (isSrvEnvScene ? t('copilot.srv_input_placeholder') : t('copilot.rd_input_placeholder')) : t('copilot.input_placeholder')}
          onStop={handleStop}
          attachments={attachments}
          onAttachmentsChange={setAttachments}
          disabled={sessionDead || longRunningTask?.active}
          disabledReason={sessionDead ? sessionDeadReason : longRunningTask?.active ? '⏳ 长耗时命令执行中，请等待倒计时结束或跳过等待' : undefined}
        />
        <ContextInstallCards
          t={t}
          agentColor={agentColor}
          mutedBorder={mutedBorder}
          isDark={isDark}
          loading={loading}
          sessionDead={sessionDead}
          hasRdContext={hasRdContext}
          isSrvEnvScene={isSrvEnvScene}
          rdStatus={rdStatus}
          srvEnvStatus={srvEnvStatus}
          onAgreeInstall={handleAgreeInstall}
          onDeclineInstall={handleDeclineInstall}
          onAgreeEnvInstall={handleAgreeEnvInstall}
          onDeclineEnvInstall={handleDeclineEnvInstall}
        />
        <EnvFixCards
          t={t}
          agentColor={agentColor}
          mutedBorder={mutedBorder}
          isDark={isDark}
          loading={loading}
          sessionDead={sessionDead}
          isEnvFixScene={isEnvFixScene}
          envFixStatus={envFixStatus}
          envFixSteps={envFixSteps}
          currentFixStep={currentFixStep}
          onAgree={handleAgreeEnvFix}
          onDecline={handleDeclineEnvFix}
          onRetry={handleRetryEnvFix}
        />
      </Box>
    </Box>
  );
}