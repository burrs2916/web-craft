/**
 * 会话断开警告横幅与长耗时命令倒计时等待。
 * 从 AiCopilotPage.tsx 迁出，仅做代码搬迁。
 */
import { Box, Typography, Alert, Button, LinearProgress } from '@mui/material';
import { WarningCircleIcon, ClockIcon } from '@phosphor-icons/react';
import type { TFunction } from 'i18next';
import type { LongRunningTask } from './types';

export function SessionNotices({
  t,
  isDark,
  agentColor,
  sessionDead,
  sessionDeadReason,
  longRunningTask,
  formatTimeLeft,
  onSkipWait,
}: {
  t: TFunction;
  isDark: boolean;
  agentColor: string;
  sessionDead: boolean;
  sessionDeadReason: string;
  longRunningTask: LongRunningTask | null;
  formatTimeLeft: (seconds: number) => string;
  onSkipWait: () => void;
}) {
  return (
    <>
      {/* 会话已断开警告横幅 */}
      {sessionDead && (
        <Alert
          severity="error"
          icon={<WarningCircleIcon size={20} weight="fill" />}
          sx={{ mx: 2, mt: 1.5, mb: 1, borderRadius: 2 }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t('copilot.session_lost_title', '终端会话已丢失')}
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
            {sessionDeadReason}
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', mt: 0.5, opacity: 0.8 }}>
            {t('copilot.session_lost_hint', '请从运维中心重新打开环境修复/部署工具，系统会自动建立新的 SSH 连接。')}
          </Typography>
        </Alert>
      )}

      {/* 长耗时命令倒计时等待 */}
      {longRunningTask && (
        <Box sx={{ mx: 2, mt: 1.5, mb: 1, p: 2, borderRadius: 2,
          bgcolor: isDark ? 'rgba(99, 102, 241, 0.12)' : 'rgba(99, 102, 241, 0.08)',
          border: `1px solid ${agentColor}30`,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
            <ClockIcon size={20} weight="fill" color={agentColor} />
            <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
              {longRunningTask.description}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace', color: agentColor }}>
              {formatTimeLeft(longRunningTask.remainingSeconds)}
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={((longRunningTask.totalSeconds - longRunningTask.remainingSeconds) / longRunningTask.totalSeconds) * 100}
            sx={{ height: 6, borderRadius: 3, bgcolor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
            <Typography variant="caption" sx={{ opacity: 0.7 }}>
              正在等待命令执行完成，请勿关闭窗口
            </Typography>
            <Button size="small" variant="text" onClick={onSkipWait} sx={{ minWidth: 'auto', py: 0, fontSize: 12 }}>
              跳过等待
            </Button>
          </Box>
        </Box>
      )}
    </>
  );
}