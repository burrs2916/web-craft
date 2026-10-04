import { Box, Divider, Button, Typography } from '@mui/material';
import { Sparkle, WarningCircle as WarningCircleIcon } from '@phosphor-icons/react';
import { ChatMessagesArea, ChatInputArea } from '../../../../components/chat/ChatComponents';
import { RepairProgressPanel } from '../RepairProgressPanel';
import { useAgentChat } from './useAgentChat';
import { AgentChatHeader } from './AgentChatHeader';
import { PermissionDialog } from './PermissionDialog';
import { DeleteConversationDialog } from './DeleteConversationDialog';
import { AgentChatEmptyState } from './AgentChatEmptyState';

export function AgentChat() {
  const chat = useAgentChat();
  const {
    t, isDark, agentColor, userColor, mutedBorder,
    messages, activeConversationId, activeAgentId, agents, models, conversations,
    activeAgent, activeConversation,
    input, setInput, attachments, setAttachments, loading,
    streamingContent, streamingReasoning, combinedToolCalls, agentStatus, streamingMsgIdRef,
    repairPlan,
    permissionRequest, handlePermissionResponse,
    deleteConvConfirm, setDeleteConvConfirm, handleDeleteConversation,
    cleaningUp, handleCleanupConversations, handleNewChat,
    handleSend, handleStop, handleKeyDown,
    handleEditMessage, handleRegenerate,
  } = chat;

  return (
    <Box sx={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
      <AgentChatHeader
        agents={agents}
        models={models}
        conversations={conversations}
        activeAgentId={activeAgentId}
        activeConversationId={activeConversationId}
        agentColor={agentColor}
        isDark={isDark}
        cleaningUp={cleaningUp}
        onNewChat={handleNewChat}
        onCleanupConversations={handleCleanupConversations}
        onRequestDeleteConversation={setDeleteConvConfirm}
        t={t}
      />

      <Divider sx={{ borderColor: mutedBorder }} />

      {!activeAgentId ? (
        <AgentChatEmptyState type="no_agent" t={t} agentColor={agentColor} />
      ) : (
        <>
          {/* 会话异常中断恢复提示 */}
          {activeConversation && activeConversation.status === 'interrupted' && !loading && (
            <Box sx={{
              px: 2, py: 1,
              bgcolor: 'rgba(255,152,0,0.08)',
              borderBottom: '1px solid',
              borderColor: 'rgba(255,152,0,0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}>
              <WarningCircleIcon size={16} weight="fill" color="#FF9800" />
              <Typography variant="caption" sx={{ color: 'text.secondary', flex: 1 }}>
                上次会话异常中断，消息已保留。您可以继续对话或开启新会话。
              </Typography>
              <Button
                size="small"
                variant="outlined"
                color="warning"
                sx={{ minWidth: 'auto', py: 0.25, fontSize: 11 }}
                onClick={handleNewChat}
              >
                新会话
              </Button>
            </Box>
          )}
          {repairPlan && (
            <Box sx={{ px: 2, pt: 1, pb: 0.5 }}>
              <RepairProgressPanel plan={repairPlan} />
            </Box>
          )}
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
            conversationId={activeConversationId ?? undefined}
            emptyIcon={<Sparkle size={40} weight="duotone" color={userColor} />}
            emptyText={activeAgent?.name ? `Start chatting with ${activeAgent.name}` : t('chat.start_conversation')}
            thinkingText={t('chat.thinking')}
            agentStatus={agentStatus}
            onEditMessage={handleEditMessage}
            onRegenerate={handleRegenerate}
          />
          <ChatInputArea
            input={input}
            setInput={setInput}
            handleSend={handleSend}
            handleKeyDown={handleKeyDown}
            loading={loading}
            conversationId={activeConversationId}
            agentName={activeAgent?.name}
            agentColor={agentColor}
            userColor={userColor}
            isDark={isDark}
            placeholder={!activeConversationId ? t('chat.start_conversation') : t('chat.input_placeholder')}
            onStop={handleStop}
            attachments={attachments}
            onAttachmentsChange={setAttachments}
            hasFileTool={activeAgent?.toolIds?.includes('file') ?? false}
          />
        </>
      )}

      <PermissionDialog request={permissionRequest} onRespond={handlePermissionResponse} />

      <DeleteConversationDialog
        deleteConvConfirm={deleteConvConfirm}
        conversationTitle={conversations.find((c) => c.id === deleteConvConfirm)?.title || ''}
        onCancel={() => setDeleteConvConfirm(null)}
        onConfirm={handleDeleteConversation}
        t={t}
      />
    </Box>
  );
}