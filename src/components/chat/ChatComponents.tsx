import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, IconButton, TextField, CircularProgress, Collapse, Chip, Tooltip,
} from '@mui/material';
import {
  PaperPlaneTilt as SendIcon, Stop, Robot, User,
  Terminal, Wrench, PaperclipIcon, XIcon, Package,
  BrainIcon, CheckCircleIcon, WarningCircleIcon, ArrowsDownUpIcon,
  Sparkle,
} from '@phosphor-icons/react';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { MessageDto } from '../../proto/agent';

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

interface ParsedToolCall {
  id: string;
  name: string;
  arguments: string;
}

function parseToolCalls(toolCallsStr: string): ParsedToolCall[] {
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

function parseArguments(argsStr: string): Record<string, unknown> {
  if (!argsStr) return {};
  try {
    const parsed = JSON.parse(argsStr);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    return {};
  } catch {
    return {};
  }
}

function extractToolCallIdFromMsgId(msgId: string, convId: string): string | null {
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
  messages: MessageDto[];
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

const markdownStyles = (agentColor: string, isDark: boolean) => ({
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
});

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

/**
 * 根据上下文使用率获取对应颜色
 */
function getContextUsageColor(ratio: number): string {
  if (ratio > 0.9) return '#FF5252';   // 红色 - 危险
  if (ratio > 0.75) return '#FF9800';  // 橙色 - 警告
  if (ratio > 0.5) return '#FFEB3B';   // 黄色 - 注意
  return 'text.disabled';              // 默认灰色
}

/**
 * 格式化流式速率为友好显示
 */
function formatStreamRate(tokensPerSec: number, charsPerSec: number): string {
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
 * Agent 执行状态条 - 展示当前 AI 正在做什么（思考/调用工具/压缩上下文等）
 * 提供迭代进度和详细状态信息
 */
function AgentStatusBar({ status }: { status: AgentStatusInfo }) {
  const statusConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    thinking: {
      label: '思考中',
      icon: <BrainIcon size={13} weight="duotone" />,
      color: '#67B8FF',
    },
    tool_calling: {
      label: '调用工具',
      icon: <Wrench size={13} weight="bold" />,
      color: '#FFB74D',
    },
    summarizing: {
      label: '生成总结',
      icon: <Sparkle size={13} weight="fill" />,
      color: '#CE93D8',
    },
    compact: {
      label: '压缩上下文',
      icon: <ArrowsDownUpIcon size={13} />,
      color: '#4DD0E1',
    },
    fallback: {
      label: '模型降级',
      icon: <WarningCircleIcon size={13} weight="fill" />,
      color: '#FF9800',
    },
    done: {
      label: '完成',
      icon: <CheckCircleIcon size={13} weight="fill" />,
      color: '#81C784',
    },
    error: {
      label: '错误',
      icon: <WarningCircleIcon size={13} weight="fill" />,
      color: '#EF5350',
    },
  };

  const config = statusConfig[status.status] || statusConfig.thinking;
  const progress = status.maxIterations > 0
    ? Math.min((status.iteration / status.maxIterations) * 100, 100)
    : 0;

  // 判断是否为模型加载状态（Ollama 本地模型首次加载）
  const isModelLoading = status.status === 'thinking' && status.detail?.includes('模型加载中');
  const isOllama = status.isOllama ?? false;

  // 模型加载时使用特殊的渐变色
  const loadingGradient = isModelLoading
    ? 'linear-gradient(90deg, #67B8FF, #A78BFA, #67B8FF)'
    : undefined;

  return (
    <Box sx={{
      px: 1.25, py: 0.6, mb: 0.5,
      bgcolor: isOllama ? `${config.color}06` : `${config.color}08`,
      border: '1px solid',
      borderColor: isOllama ? `${config.color}20` : `${config.color}25`,
      borderRadius: '10px 10px 10px 3px',
      fontSize: 11,
      ...(isModelLoading ? {
        position: 'relative',
        overflow: 'hidden',
      } : {}),
    }}>
      {/* 模型加载时的流动光效 */}
      {isModelLoading && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '2px',
            background: 'linear-gradient(90deg, transparent, #67B8FF, #A78BFA, #67B8FF, transparent)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 2s linear infinite',
            '@keyframes shimmer': {
              '0%': { backgroundPosition: '200% 0' },
              '100%': { backgroundPosition: '-200% 0' },
            },
          }}
        />
      )}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
        <Box sx={{
          color: config.color,
          display: 'flex',
          animation: status.status !== 'done' ? 'pulse 2s ease-in-out infinite' : 'none',
          ...(isModelLoading ? {
            animation: 'bounce 1s ease-in-out infinite',
            '@keyframes bounce': {
              '0%, 100%': { transform: 'translateY(0)' },
              '50%': { transform: 'translateY(-2px)' },
            },
          } : {}),
        }}>
          {config.icon}
        </Box>
        <Typography variant="caption" sx={{ fontWeight: 600, color: config.color }}>
          {config.label}
        </Typography>
        {status.detail && (
          <Typography variant="caption" sx={{ color: 'text.secondary', ml: 0.5 }}>
            {status.detail}
          </Typography>
        )}
        {/* Ollama 本地模型标识 */}
        {isOllama && (
          <Chip
            label="本地"
            size="small"
            sx={{
              height: 14,
              fontSize: 9,
              fontWeight: 600,
              bgcolor: 'rgba(103, 184, 255, 0.12)',
              color: '#67B8FF',
              border: '1px solid rgba(103, 184, 255, 0.3)',
              '& .MuiChip-label': { px: 0.5, py: 0 },
              ml: 0.25,
            }}
          />
        )}
        {status.streamStats && status.streamStats.tokensPerSec > 0 && (
          <Tooltip
            title={
              status.streamStats
                ? `生成速度: ${formatStreamRate(status.streamStats.tokensPerSec, status.streamStats.charsPerSec)}\n已生成: ~${status.streamStats.tokensEstimated} tokens / ${status.streamStats.charsTotal} 字符\n耗时: ${(status.streamStats.elapsedMs / 1000).toFixed(1)}s`
                : ''
            }
          >
            <Typography variant="caption" sx={{
              color: 'text.disabled', ml: 1, fontSize: 10, fontFamily: 'monospace',
              cursor: 'help',
            }}>
              {formatStreamRate(status.streamStats.tokensPerSec, status.streamStats.charsPerSec)}
              {status.streamStats.tokensEstimated > 0 && ` · ~${status.streamStats.tokensEstimated} tok`}
            </Typography>
          </Tooltip>
        )}
        {status.contextUsage && (
          <Tooltip title={`上下文使用: ${status.contextUsage.tokensUsed.toLocaleString()} / ${status.contextUsage.contextWindow.toLocaleString()} tokens`}>
            <Typography
              variant="caption"
              sx={{
                ml: 1,
                fontSize: 10,
                fontFamily: 'monospace',
                color: getContextUsageColor(status.contextUsage.usageRatio),
                cursor: 'help',
              }}
            >
              {Math.round(status.contextUsage.usageRatio * 100)}% ctx
            </Typography>
          </Tooltip>
        )}
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10 }}>
          第 {status.iteration}/{status.maxIterations} 轮
        </Typography>
      </Box>
      <Box sx={{
        width: '100%', height: 3, borderRadius: 1.5,
        bgcolor: `${config.color}15`,
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* 模型加载时显示流动进度条 */}
        {isModelLoading ? (
          <Box sx={{
            height: '100%',
            width: '40%',
            borderRadius: 1.5,
            background: loadingGradient,
            backgroundSize: '200% 100%',
            animation: 'loadingSlide 1.5s ease-in-out infinite',
            '@keyframes loadingSlide': {
              '0%': { transform: 'translateX(-100%)' },
              '100%': { transform: 'translateX(250%)' },
            },
          }} />
        ) : (
          <Box sx={{
            height: '100%',
            width: `${progress}%`,
            bgcolor: config.color,
            borderRadius: 1.5,
            transition: 'width 0.3s ease',
          }} />
        )}
      </Box>
    </Box>
  );
}

/**
 * 格式化耗时为简短格式（如 1.2s, 300ms, 2m 30s）
 */
function formatDurationShort(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

/**
 * 格式化耗时为详细格式（用于 tooltip）
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} 毫秒`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)} 秒`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins} 分 ${secs} 秒 (${ms.toLocaleString()} ms)`;
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

export function ChatInputArea({
  input, setInput, handleSend, handleKeyDown, loading, conversationId,
  agentName, agentColor, userColor, isDark, placeholder, onStop,
  attachments = [], onAttachmentsChange, hasFileTool = true,
  disabled = false, disabledReason,
}: ChatInputAreaProps) {
  const { t } = useTranslation('agent');
  const mutedBorder = isDark ? 'rgba(48,54,61,0.6)' : 'rgba(0,0,0,0.08)';
  const mutedBg = isDark ? 'rgba(48,54,61,0.1)' : 'rgba(0,0,0,0.03)';

  const handleAttachFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: true,
        title: t('plugin_page.attach_file'),
      });
      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        const newFiles: FileAttachment[] = paths.map((p) => {
          const parts = p.split(/[/\\]/);
          return { path: p, name: parts[parts.length - 1] || p };
        });
        const existingPaths = new Set(attachments.map((a) => a.path));
        const unique = newFiles.filter((f) => !existingPaths.has(f.path));
        if (unique.length > 0) {
          onAttachmentsChange?.([...attachments, ...unique]);
        }
      }
    } catch (err) { console.error('ChatComponents: operation failed', err); }
  }, [attachments, onAttachmentsChange, t]);

  const handleRemoveAttachment = useCallback((path: string) => {
    onAttachmentsChange?.(attachments.filter((a) => a.path !== path));
  }, [attachments, onAttachmentsChange]);

  return (
    <Box sx={{ px: 2, pb: 1.5, pt: 0.5 }}>
      <Box sx={{
        display: 'flex', flexDirection: 'column', borderRadius: 1.5,
        border: '1px solid', borderColor: conversationId ? `${userColor}25` : mutedBorder,
        bgcolor: conversationId ? `${userColor}05` : mutedBg,
        overflow: 'hidden', transition: 'border-color 0.2s, background-color 0.2s',
        '&:focus-within': { borderColor: `${userColor}50`, bgcolor: `${userColor}08` },
      }}>
        {agentName && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, pt: 1, pb: 0 }}>
            <Box sx={{
              width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `linear-gradient(135deg, ${agentColor} 0%, ${isDark ? '#0EA5E9' : '#0277BD'} 100%)`,
              color: '#fff', flexShrink: 0,
            }}>
              <Robot size={8} weight="bold" />
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10, fontWeight: 500 }}>
              {agentName}
            </Typography>
          </Box>
        )}
        {attachments.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, px: 1.5, pt: 0.5 }}>
            {attachments.map((file) => (
              <Chip
                key={file.path}
                icon={<PaperclipIcon size={10} weight="bold" />}
                label={file.name}
                size="small"
                onDelete={() => handleRemoveAttachment(file.path)}
                deleteIcon={<XIcon size={10} />}
                sx={{ height: 22, fontSize: 10, maxWidth: 200, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
              />
            ))}
          </Box>
        )}
        <Box sx={{ display: 'flex', alignItems: 'flex-end', px: 0.5, py: 0.5 }}>
          <Tooltip title={t('plugin_page.attach_file')} arrow>
            <span>
              <IconButton
                size="small"
                onClick={handleAttachFile}
                disabled={disabled || loading || !conversationId || !hasFileTool}
                sx={{ borderRadius: 2, mb: 0.25, color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)', '&:hover': { color: userColor, bgcolor: `${userColor}10` } }}
              >
                <PaperclipIcon size={16} weight="bold" />
              </IconButton>
            </span>
          </Tooltip>
          <TextField
            fullWidth variant="standard" multiline minRows={1} maxRows={4}
            value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown} placeholder={disabled && disabledReason ? disabledReason : placeholder}
            disabled={disabled || loading || !conversationId}
            slotProps={{ input: { disableUnderline: true } }}
            sx={{
              '& .MuiInputBase-root': { fontSize: 13, px: 1, py: 0.5, minHeight: 28, alignItems: 'flex-start' },
              '& .MuiInputBase-input': { lineHeight: 1.5 },
              '& .MuiInputBase-input::placeholder': { color: 'text.secondary', opacity: 0.6 },
            }}
          />
          {loading ? (
            <IconButton size="small" onClick={onStop} sx={{ borderRadius: 2, mr: 0.5, mb: 0.25, color: '#FF7B72', '&:hover': { bgcolor: 'rgba(255,123,114,0.1)' } }}>
              <Stop size={16} weight="fill" />
            </IconButton>
          ) : (
            <IconButton
              size="small" onClick={handleSend}
              disabled={disabled || !input.trim() || !conversationId}
              sx={{
                borderRadius: 2, mr: 0.5, mb: 0.25,
                bgcolor: !disabled && input.trim() && conversationId
                  ? `${userColor}20`
                  : 'transparent',
                color: !disabled && input.trim() && conversationId
                  ? (isDark ? '#A5A0FF' : userColor)
                  : (isDark ? 'rgba(255,255,255,0.2)' : `${userColor}30`),
                '&:hover': {
                  bgcolor: !disabled && input.trim() && conversationId
                    ? `${userColor}30`
                    : 'transparent',
                },
                '&.Mui-disabled': { color: isDark ? 'rgba(255,255,255,0.15)' : `${userColor}20` },
                transition: 'all 0.2s',
              }}
            >
              <SendIcon size={16} weight="fill" />
            </IconButton>
          )}
        </Box>
      </Box>
    </Box>
  );
}

export function ToolCallCard({ toolCall }: { toolCall: ToolCallDisplay }) {
  const [expanded, setExpanded] = useState(false);
  const isStreaming = toolCall.status === 'streaming';
  const isRunning = toolCall.status === 'running';
  const isDenied = toolCall.status === 'denied';
  const isSuccess = toolCall.success === true;
  const isPluginManager = toolCall.toolName === 'plugin_manager';

  const toolIcon = toolCall.toolName === 'terminal' ? (
    <Terminal size={14} weight="bold" />
  ) : isPluginManager ? (
    <Package size={14} weight="bold" />
  ) : (
    <Wrench size={14} weight="bold" />
  );

  const statusLabel = isStreaming ? '✨ Generating...' : isRunning ? '⏳ Running' : isDenied ? '⊘ Denied' : isSuccess ? '✓ Done' : '✗ Failed';

  const getActionLabel = () => {
    if (!isPluginManager || !toolCall.arguments) return null;
    const action = toolCall.arguments.action as string;
    if (!action) return null;
    const labels: Record<string, string> = {
      get: 'Reading plugin',
      create: 'Creating plugin',
      refine: 'Refining plugin',
      test: 'Testing plugin',
      delete: 'Deleting plugin',
      list: 'Listing plugins',
      toggle: 'Toggling plugin',
    };
    return labels[action] || action;
  };

  const actionLabel = getActionLabel();

  return (
    <Paper variant="outlined" sx={{
      mb: 0.5, borderRadius: 1.5, overflow: 'hidden',
      borderColor: isStreaming ? 'rgba(103,184,255,0.4)' : isRunning ? 'rgba(255,183,77,0.4)' : isDenied ? 'rgba(255,152,0,0.4)' : isSuccess ? 'rgba(129,199,132,0.4)' : 'rgba(255,123,114,0.4)',
      bgcolor: isStreaming ? 'rgba(103,184,255,0.06)' : isRunning ? 'rgba(255,183,77,0.06)' : isDenied ? 'rgba(255,152,0,0.06)' : isSuccess ? 'rgba(129,199,132,0.06)' : 'rgba(255,123,114,0.06)',
    }}>
      <Box
        sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.5, cursor: 'pointer', fontSize: 12 }}
        onClick={() => setExpanded(!expanded)}
      >
        {isStreaming ? (
          <Sparkle size={12} weight="fill" style={{ color: '#67B8FF' }} />
        ) : isRunning ? (
          <CircularProgress size={12} sx={{ color: '#FFB74D' }} />
        ) : isDenied ? (
          <Box sx={{ color: '#FF9800', display: 'flex' }}>⊘</Box>
        ) : isSuccess ? (
          <Box sx={{ color: '#81C784', display: 'flex' }}>✓</Box>
        ) : (
          <Box sx={{ color: '#FF7B72', display: 'flex' }}>✗</Box>
        )}
        <Box sx={{ color: 'text.secondary', display: 'flex' }}>{toolIcon}</Box>
        <Typography variant="caption" sx={{ fontWeight: 600, flex: 1 }}>
          {actionLabel ? `${actionLabel}...` : toolCall.toolName}
        </Typography>
        {toolCall.arguments && toolCall.toolName === 'terminal' && typeof toolCall.arguments.command === 'string' && (
          <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
            {toolCall.arguments.command}
          </Typography>
        )}
        {isPluginManager && toolCall.arguments && 'name' in toolCall.arguments && toolCall.arguments.name != null && (
          <Typography variant="caption" sx={{ color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>
            {String(toolCall.arguments.name)}
          </Typography>
        )}
        <Typography variant="caption" sx={{ color: isStreaming ? '#67B8FF' : isRunning ? '#FFB74D' : 'text.secondary', fontSize: 10 }}>
          {(isStreaming || isRunning) ? statusLabel : '▼'}
        </Typography>
        {toolCall.durationMs != null && toolCall.durationMs > 0 && (
          <Tooltip title={`执行耗时: ${formatDuration(toolCall.durationMs)}`}>
            <Typography variant="caption" sx={{
              color: 'text.disabled', fontSize: 10, fontFamily: 'monospace',
              ml: 0.5, cursor: 'help',
            }}>
              {formatDurationShort(toolCall.durationMs)}
            </Typography>
          </Tooltip>
        )}
      </Box>
      <Collapse in={expanded}>
        <Box sx={{ px: 1, pb: 0.75, borderTop: '1px solid', borderColor: 'divider' }}>
          {toolCall.arguments && (
            <Box sx={{ mt: 0.5 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10 }}>
                {toolCall.toolName === 'terminal' ? 'Command' : 'Arguments'}
              </Typography>
              <Box sx={{
                fontFamily: 'monospace', fontSize: 11, bgcolor: 'rgba(0,0,0,0.2)',
                p: 0.5, borderRadius: 1, mt: 0.25, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 120, overflow: 'auto',
              }}>
                {toolCall.toolName === 'terminal' && toolCall.arguments.command
                  ? String(toolCall.arguments.command)
                  : JSON.stringify(toolCall.arguments, null, 2)}
              </Box>
            </Box>
          )}
          {toolCall.result && (
            <Box sx={{ mt: 0.5 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10 }}>Output</Typography>
              <Box sx={{
                fontFamily: 'monospace', fontSize: 11, bgcolor: 'rgba(0,0,0,0.2)',
                p: 0.5, borderRadius: 1, mt: 0.25, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflow: 'auto',
                color: isSuccess ? '#81C784' : '#FF7B72',
              }}>
                {toolCall.result.length > 500 ? toolCall.result.slice(0, 500) + '...' : toolCall.result}
              </Box>
            </Box>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}
