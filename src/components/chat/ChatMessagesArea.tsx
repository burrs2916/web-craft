// ChatComponents 拆分：消息展示区（含用户气泡 / 助手回合 / 思考指示 / 工具调用卡片 / 工具结果卡片）
// 主文件 ChatComponents.tsx 再导出 ChatMessagesArea 以保持 import 路径不变。
import { useRef, useEffect, useState, useMemo } from 'react';
import {
  Box, Typography, Paper, IconButton, CircularProgress, Collapse, Chip, Tooltip,
} from '@mui/material';
import {
  Robot, User,
  Terminal, Wrench,
  BrainIcon, CheckCircleIcon, WarningCircleIcon, ArrowsDownUpIcon,
  Sparkle,
} from '@phosphor-icons/react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { MessageDto } from '../../proto/agent';
import {
  ToolCallDisplay,
  ParsedToolCall,
  parseToolCalls,
  parseArguments,
  extractToolCallIdFromMsgId,
  AgentStatusInfo,
  ChatMessagesAreaProps,
  markdownStyles,
  formatDuration,
  formatDurationShort,
} from './chatTypes';
import { AgentStatusBar } from './AgentStatusBar';

export function ChatMessagesArea({
  messages, streamingContent, streamingReasoning, streamingMsgId, loading, toolCalls,
  agentColor, userColor, isDark, conversationId, emptyIcon, emptyText, thinkingText,
  agentStatus, onEditMessage, onRegenerate,
}: ChatMessagesAreaProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, streamingReasoning, toolCalls, agentStatus]);

  const groupedMessages = useMemo(() => {
    const groups: Array<{
      id: string;
      type: 'user' | 'assistant_turn';
      userMsg?: MessageDto;
      assistantMsg?: MessageDto;
      toolMessages: MessageDto[];
      parsedToolCalls: ParsedToolCall[];
    }> = [];

    let i = 0;
    while (i < messages.length) {
      const msg = messages[i];
      if (msg.role === 'user') {
        groups.push({ id: msg.id, type: 'user', userMsg: msg, toolMessages: [], parsedToolCalls: [] });
        i++;
      } else if (msg.role === 'assistant') {
        const parsedTc = parseToolCalls(msg.toolCalls);
        const toolMsgs: MessageDto[] = [];
        const assistantId = msg.id;
        i++;
        while (i < messages.length && messages[i].role === 'tool') {
          toolMsgs.push(messages[i]);
          i++;
        }
        groups.push({ id: assistantId, type: 'assistant_turn', assistantMsg: msg, toolMessages: toolMsgs, parsedToolCalls: parsedTc });
      } else if (msg.role === 'tool') {
        groups.push({ id: msg.id, type: 'assistant_turn', toolMessages: [msg], parsedToolCalls: [] });
        i++;
      } else {
        i++;
      }
    }
    return groups;
  }, [messages]);

  return (
    <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 1.5 }}>
      {messages.length === 0 && !loading && emptyText && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 1 }}>
          {emptyIcon}
          <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', maxWidth: 300, lineHeight: 1.6 }}>
            {emptyText}
          </Typography>
        </Box>
      )}
      {groupedMessages.map((group, idx) => {
        if (group.type === 'user' && group.userMsg) {
          const isLastUserMsg = idx === groupedMessages.length - 1 || (idx < groupedMessages.length - 1 && groupedMessages[idx + 1].type === 'assistant_turn');
          return <UserMessageBubble key={group.id} msg={group.userMsg} userColor={userColor} isDark={isDark} onEdit={onEditMessage} showActions={isLastUserMsg} />;
        }
        if (group.type === 'assistant_turn') {
          const isStreaming = group.assistantMsg?.id === streamingMsgId && loading;
          const displayContent = isStreaming ? streamingContent : (group.assistantMsg?.content || '');
          const hasToolCalls = group.parsedToolCalls.length > 0 || toolCalls.length > 0;
          const hasContent = displayContent.trim().length > 0;
          const isThinking = isStreaming && !hasContent && !hasToolCalls;
          const isLastGroup = idx === groupedMessages.length - 1;

          return (
            <AssistantTurnGroup
              key={group.id}
              isStreaming={isStreaming}
              thinkingText={thinkingText}
              isThinking={isThinking}
              parsedToolCalls={group.parsedToolCalls}
              streamingToolCalls={isStreaming ? toolCalls : []}
              toolMessages={group.toolMessages}
              displayContent={displayContent}
              streamingReasoning={isStreaming ? streamingReasoning : undefined}
              hasContent={hasContent}
              agentColor={agentColor}
              isDark={isDark}
              conversationId={conversationId}
              onRegenerate={isLastGroup && !isStreaming ? onRegenerate : undefined}
              assistantMsgId={group.assistantMsg?.id}
              agentStatus={isLastGroup && isStreaming ? agentStatus : undefined}
            />
          );
        }
        return null;
      })}
      {loading && groupedMessages.length === 0 && agentStatus && (
        <AgentStatusBar status={agentStatus} />
      )}
      <div ref={messagesEndRef} />
    </Box>
  );
}

function UserMessageBubble({ msg, userColor, isDark, onEdit, showActions }: { msg: MessageDto; userColor: string; isDark: boolean; onEdit?: (messageId: string, content: string) => void; showActions?: boolean }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexDirection: 'row-reverse', alignItems: 'flex-start' }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <Box sx={{
        width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `linear-gradient(135deg, ${userColor} 0%, ${isDark ? '#93C5FD' : '#3B82F6'} 100%)`,
        color: '#fff', flexShrink: 0, mt: 0.25,
      }}>
        <User size={14} weight="bold" />
      </Box>
      <Box sx={{ maxWidth: '82%', minWidth: 0 }}>
        <Box sx={{
          px: 1.5, py: 1,
          bgcolor: `${userColor}15`,
          border: '1px solid', borderColor: `${userColor}20`,
          fontSize: 13, lineHeight: 1.6,
          borderRadius: '16px 16px 4px 16px',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {msg.content}
        </Box>
        {showActions && onEdit && hovered && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.25 }}>
            <Tooltip title="Edit">
              <IconButton size="small" onClick={() => onEdit(msg.id, msg.content)}
                sx={{ opacity: 0.6, '&:hover': { opacity: 1 }, p: 0.25 }}>
                <ArrowsDownUpIcon size={12} />
              </IconButton>
            </Tooltip>
          </Box>
        )}
      </Box>
    </Box>
  );
}

interface AssistantTurnGroupProps {
  isStreaming: boolean;
  thinkingText?: string;
  isThinking: boolean;
  parsedToolCalls: ParsedToolCall[];
  streamingToolCalls: ToolCallDisplay[];
  toolMessages: MessageDto[];
  displayContent: string;
  streamingReasoning?: string;
  hasContent: boolean;
  agentColor: string;
  isDark: boolean;
  conversationId?: string;
  onRegenerate?: (messageId: string) => void;
  assistantMsgId?: string;
  agentStatus?: AgentStatusInfo | null;
}

function AssistantTurnGroup({
  isStreaming, thinkingText, isThinking,
  parsedToolCalls, streamingToolCalls, toolMessages,
  displayContent, streamingReasoning, hasContent, agentColor, isDark, conversationId,
  onRegenerate, assistantMsgId, agentStatus,
}: AssistantTurnGroupProps) {
  const [reasoningExpanded, setReasoningExpanded] = useState(false);
  const showThinking = isThinking;
  const showReasoning = !!streamingReasoning && streamingReasoning.length > 0;
  const showToolCalls = parsedToolCalls.length > 0 || streamingToolCalls.length > 0;
  const showToolResults = toolMessages.length > 0;
  const showContent = hasContent;
  const showStatusBar = isStreaming && agentStatus && !showThinking;

  return (
    <Box sx={{ display: 'flex', gap: 1, mb: 1.5, alignItems: 'flex-start' }}>
      <Box sx={{
        width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `linear-gradient(135deg, ${agentColor} 0%, ${isDark ? '#0EA5E9' : '#0277BD'} 100%)`,
        color: '#fff', flexShrink: 0, mt: 0.25,
      }}>
        <Robot size={14} weight="bold" />
      </Box>
      <Box sx={{ maxWidth: '85%', minWidth: 0, flex: 1 }}>
        {showThinking && (
          <ThinkingIndicator thinkingText={thinkingText} agentColor={agentColor} />
        )}
        {showStatusBar && agentStatus && (
          <AgentStatusBar status={agentStatus} />
        )}
        {showReasoning && (
          <Box sx={{ mb: 0.75 }}>
            <Box
              onClick={() => setReasoningExpanded(!reasoningExpanded)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.5,
                px: 1, py: 0.6,
                bgcolor: 'rgba(156, 39, 176, 0.06)',
                border: '1px solid rgba(156, 39, 176, 0.2)',
                borderRadius: 2,
                cursor: 'pointer',
                fontSize: 11,
                color: 'text.secondary',
                '&:hover': { bgcolor: 'rgba(156, 39, 176, 0.1)' },
              }}
            >
              <BrainIcon size={12} weight="bold" style={{ color: '#9C27B0' }} />
              <span>思考过程</span>
              <span style={{ opacity: 0.6, fontSize: 10 }}>
                ({streamingReasoning.length} 字符)
              </span>
              <Box sx={{ flex: 1 }} />
              <span style={{ opacity: 0.5 }}>{reasoningExpanded ? '收起 ▲' : '展开 ▼'}</span>
            </Box>
            {reasoningExpanded && (
              <Box sx={{
                mt: 0.5, px: 1.25, py: 1,
                bgcolor: 'rgba(156, 39, 176, 0.04)',
                border: '1px solid rgba(156, 39, 176, 0.1)',
                borderRadius: 2,
                fontSize: 11.5, lineHeight: 1.6,
                color: 'text.secondary',
                whiteSpace: 'pre-wrap',
                fontFamily: 'monospace',
                maxHeight: 400, overflow: 'auto',
              }}>
                {streamingReasoning}
                {isStreaming && <Box component="span" sx={{ color: '#9C27B0', ml: 0.25 }}>▌</Box>}
              </Box>
            )}
          </Box>
        )}
        {showToolCalls && (
          <Box sx={{ mb: 0.75 }}>
            {parsedToolCalls.map((tc, idx) => {
              const streamingMatch = streamingToolCalls.find((stc) => stc.toolName === tc.name);
              const toolResult = toolMessages.find((tm) => {
                const tcId = extractToolCallIdFromMsgId(tm.id, conversationId || '');
                return tcId && tc.id && tcId === tc.id;
              }) || toolMessages[idx];
              const isSuccess = toolResult ? toolResult.isError !== 1 : null;
              return (
                <PersistentToolCallCard
                  key={tc.id || idx}
                  toolCall={tc}
                  result={toolResult?.content || streamingMatch?.result || null}
                  success={isSuccess ?? streamingMatch?.success ?? null}
                  status={streamingMatch?.status || (toolResult ? 'done' : 'done')}
                  isDark={isDark}
                />
              );
            })}
            {streamingToolCalls
              .filter((stc) => !parsedToolCalls.some((ptc) => ptc.name === stc.toolName))
              .map((stc) => (
                <PersistentToolCallCard
                  key={stc.id}
                  toolCall={{ id: stc.id, name: stc.toolName, arguments: JSON.stringify(stc.arguments) }}
                  result={stc.result}
                  success={stc.success}
                  status={stc.status}
                  isDark={isDark}
                />
              ))}
          </Box>
        )}
        {showToolResults && !showToolCalls && (
          <Box sx={{ mb: 0.75 }}>
            {toolMessages.map((tm, idx) => (
              <ToolResultCard key={tm.id || idx} msg={tm} isDark={isDark} />
            ))}
          </Box>
        )}
        {showContent && (
          <Box sx={{
            px: 1.5, py: 1,
            bgcolor: `${agentColor}08`,
            border: '1px solid', borderColor: `${agentColor}15`,
            fontSize: 13, lineHeight: 1.6,
            borderRadius: '16px 16px 16px 4px',
            ...markdownStyles(agentColor, isDark),
          }}>
            <Markdown remarkPlugins={[remarkGfm]}>{displayContent}</Markdown>
            {isStreaming && <Box component="span" sx={{ color: agentColor, ml: 0.25 }}>▌</Box>}
          </Box>
        )}
        {onRegenerate && assistantMsgId && !isStreaming && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-start', mt: 0.25 }}>
            <Tooltip title="Regenerate">
              <IconButton size="small" onClick={() => onRegenerate(assistantMsgId)}
                sx={{ opacity: 0.5, '&:hover': { opacity: 1 }, p: 0.25 }}>
                <ArrowsDownUpIcon size={12} />
              </IconButton>
            </Tooltip>
          </Box>
        )}
      </Box>
    </Box>
  );
}

function ThinkingIndicator({ thinkingText, agentColor }: { thinkingText?: string; agentColor: string }) {
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1,
      px: 1.5, py: 0.75, mb: 0.5,
      bgcolor: `${agentColor}06`,
      border: '1px solid', borderColor: `${agentColor}12`,
      borderRadius: '12px 12px 12px 4px',
      fontSize: 12,
    }}>
      <CircularProgress size={12} sx={{ color: agentColor }} />
      <BrainIcon size={14} weight="duotone" style={{ color: agentColor, opacity: 0.7 }} />
      <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
        {thinkingText || 'Thinking...'}
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.25 }}>
        {[0, 1, 2].map((i) => (
          <Box key={i} sx={{
            width: 3, height: 3, borderRadius: '50%', bgcolor: agentColor, opacity: 0.3 + i * 0.25,
            animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.3}s`,
            '@keyframes pulse': { '0%, 100%': { opacity: 0.2 }, '50%': { opacity: 1 } },
          }} />
        ))}
      </Box>
    </Box>
  );
}

interface PersistentToolCallCardProps {
  toolCall: ParsedToolCall;
  result: string | null;
  success: boolean | null;
  status: 'running' | 'done' | 'denied' | 'streaming';
  isDark: boolean;
  durationMs?: number | null;
}

function PersistentToolCallCard({ toolCall, result, success, status, isDark, durationMs }: PersistentToolCallCardProps) {
  const isRunning = status === 'running';
  const isStreaming = status === 'streaming';
  const [expanded, setExpanded] = useState(!isRunning && !isStreaming && !!result);
  const isDenied = status === 'denied';
  const isSuccess = success === true;
  const args = parseArguments(toolCall.arguments);

  const borderColor = isStreaming ? 'rgba(103,184,255,0.4)' : isRunning ? 'rgba(255,183,77,0.4)' : isDenied ? 'rgba(255,152,0,0.4)' : isSuccess ? 'rgba(129,199,132,0.4)' : 'rgba(255,123,114,0.4)';
  const bgColor = isStreaming ? 'rgba(103,184,255,0.06)' : isRunning ? 'rgba(255,183,77,0.06)' : isDenied ? 'rgba(255,152,0,0.06)' : isSuccess ? 'rgba(129,199,132,0.06)' : 'rgba(255,123,114,0.06)';
  const statusLabel = isStreaming ? 'Generating...' : isRunning ? 'Running' : isDenied ? 'Denied' : isSuccess ? 'Done' : 'Failed';
  const statusColor = isStreaming ? '#67B8FF' : isRunning ? '#FFB74D' : isDenied ? '#FF9800' : isSuccess ? '#81C784' : '#FF7B72';

  const isPluginManager = toolCall.name === 'plugin_manager';
  const actionLabel = isPluginManager && args?.action ? String(args.action) : '';
  const summaryText = isPluginManager && actionLabel
    ? `plugin_manager → ${actionLabel}`
    : toolCall.name === 'terminal' && args?.command
      ? String(args.command)
      : toolCall.name;

  return (
    <Paper variant="outlined" sx={{ mb: 0.5, borderRadius: 1.5, overflow: 'hidden', borderColor, bgcolor: bgColor }}>
      <Box
        sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.5, cursor: 'pointer', fontSize: 12 }}
        onClick={() => setExpanded(!expanded)}
      >
        {isStreaming ? (
          <Sparkle size={12} weight="fill" style={{ color: '#67B8FF' }} />
        ) : isRunning ? (
          <CircularProgress size={12} sx={{ color: '#FFB74D' }} />
        ) : isDenied ? (
          <WarningCircleIcon size={14} weight="fill" color="#FF9800" />
        ) : isSuccess ? (
          <CheckCircleIcon size={14} weight="fill" color="#81C784" />
        ) : (
          <WarningCircleIcon size={14} weight="fill" color="#FF7B72" />
        )}
        <Box sx={{ color: 'text.secondary', display: 'flex' }}>
          {toolCall.name === 'terminal' ? <Terminal size={14} weight="bold" /> : <Wrench size={14} weight="bold" />}
        </Box>
        <Typography variant="caption" sx={{ fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {summaryText}
        </Typography>
        <Chip
          label={statusLabel}
          size="small"
          sx={{
            height: 16, fontSize: 9, fontWeight: 600, minWidth: 40,
            bgcolor: `${statusColor}18`, color: statusColor, border: `1px solid ${statusColor}30`,
            '& .MuiChip-label': { px: 0.5 },
          }}
        />
        {durationMs != null && durationMs > 0 && (
          <Tooltip title={`执行耗时: ${formatDuration(durationMs)}`}>
            <Typography variant="caption" sx={{
              color: 'text.disabled', fontSize: 10, fontFamily: 'monospace',
              ml: 0.5, cursor: 'help',
            }}>
              {formatDurationShort(durationMs)}
            </Typography>
          </Tooltip>
        )}
        <Box sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
          <ArrowsDownUpIcon size={10} />
        </Box>
      </Box>
      <Collapse in={expanded}>
        <Box sx={{ px: 1, pb: 0.75, borderTop: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ mt: 0.5 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10 }}>
              {toolCall.name === 'terminal' ? 'Command' : 'Arguments'}
            </Typography>
            <Box sx={{
              fontFamily: 'monospace', fontSize: 11, bgcolor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.06)',
              p: 0.75, borderRadius: 1, mt: 0.25, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 150, overflow: 'auto',
            }}>
              {toolCall.name === 'terminal' && args.command
                ? String(args.command)
                : JSON.stringify(args, null, 2)}
            </Box>
          </Box>
          {result && (
            <Box sx={{ mt: 0.5 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10 }}>Output</Typography>
              <Box sx={{
                fontFamily: 'monospace', fontSize: 11, bgcolor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.06)',
                p: 0.75, borderRadius: 1, mt: 0.25, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 250, overflow: 'auto',
                color: isSuccess ? '#81C784' : isDenied ? '#FF9800' : '#FF7B72',
              }}>
                {result.length > 800 ? result.slice(0, 800) + '...' : result}
              </Box>
            </Box>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}

function ToolResultCard({ msg, isDark }: { msg: MessageDto; isDark: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isFailed = msg.isError === 1;

  return (
    <Paper variant="outlined" sx={{
      mb: 0.5, borderRadius: 1.5, overflow: 'hidden',
      borderColor: isFailed ? 'rgba(255,123,114,0.4)' : 'rgba(129,199,132,0.4)',
      bgcolor: isFailed ? 'rgba(255,123,114,0.06)' : 'rgba(129,199,132,0.06)',
    }}>
      <Box
        sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.5, cursor: 'pointer', fontSize: 12 }}
        onClick={() => setExpanded(!expanded)}
      >
        {isFailed ? (
          <WarningCircleIcon size={14} weight="fill" color="#FF7B72" />
        ) : (
          <CheckCircleIcon size={14} weight="fill" color="#81C784" />
        )}
        <Typography variant="caption" sx={{ fontWeight: 600, flex: 1 }}>
          {isFailed ? 'Execution Failed' : 'Tool Result'}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10, display: 'flex', alignItems: 'center' }}>
          <ArrowsDownUpIcon size={10} />
        </Typography>
      </Box>
      <Collapse in={expanded}>
        <Box sx={{ px: 1, pb: 0.75, borderTop: '1px solid', borderColor: 'divider' }}>
          <Box sx={{
            fontFamily: 'monospace', fontSize: 11, bgcolor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.06)',
            p: 0.75, borderRadius: 1, mt: 0.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 250, overflow: 'auto',
            color: isFailed ? '#FF7B72' : '#81C784',
          }}>
            {msg.content.length > 800 ? msg.content.slice(0, 800) + '...' : msg.content}
          </Box>
        </Box>
      </Collapse>
    </Paper>
  );
}
