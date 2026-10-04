// ChatComponents 拆分：Agent 执行状态条（独立组件）
import { Box, Typography, Chip, Tooltip } from '@mui/material';
import {
  BrainIcon, Wrench, Sparkle, ArrowsDownUpIcon, WarningCircleIcon, CheckCircleIcon,
} from '@phosphor-icons/react';
import type { AgentStatusInfo } from './chatTypes';
import { getContextUsageColor, formatStreamRate } from './chatTypes';

/**
 * Agent 执行状态条 - 展示当前 AI 正在做什么（思考/调用工具/压缩上下文等）
 * 提供迭代进度和详细状态信息
 */
export function AgentStatusBar({ status }: { status: AgentStatusInfo }) {
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
