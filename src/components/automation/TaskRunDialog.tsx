import { useCallback, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import { useTranslation } from 'react-i18next';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { CheckCircleIcon, XCircleIcon, ClockIcon } from '@phosphor-icons/react';
import { automationCancelRun } from '../../core/services/automation.service';
import type { AutomationTask } from '../../proto/automation';

interface TaskRunDialogProps {
  open: boolean;
  task: AutomationTask | null;
  runId: string;
  onClose: () => void;
  onFinished?: () => void;
}

type StepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

const STATUS_COLOR: Record<string, string> = {
  running: '#42A5F5',
  success: '#66BB6A',
  failed: '#EF5350',
  cancelled: '#FFA726',
  skipped: '#90A4AE',
  pending: '#BDBDBD',
};

export function TaskRunDialog({ open, task, runId, onClose, onFinished }: TaskRunDialogProps) {
  const { t } = useTranslation('automation');
  const [runStatus, setRunStatus] = useState<'running' | 'success' | 'failed' | 'cancelled'>('running');
  const [stepStatuses, setStepStatuses] = useState<Record<string, StepStatus>>({});

  // 初始化步骤状态
  useEffect(() => {
    if (!open || !task) return;
    const initial: Record<string, StepStatus> = {};
    task.steps.forEach((s, i) => {
      initial[s.id] = i === 0 ? 'running' : 'pending';
    });
    setStepStatuses(initial);
    setRunStatus('running');
  }, [open, task]);

  // 监听进度事件
  useEffect(() => {
    if (!open || !runId || !task) return;

    let unsubStart: UnlistenFn | undefined;
    let unsubStep: UnlistenFn | undefined;
    let unsubFinish: UnlistenFn | undefined;

    const setup = async () => {
      // 后端真实发出的“步骤开始”事件：多服务器场景下步骤会跨服务器重跑，
      // 依赖它而非前端推断，才能正确回退显示“运行中”。
      unsubStart = await listen('task-step-started', (event) => {
        const payload = event.payload as { run_id: string; step_id: string };
        if (payload.run_id !== runId) return;
        setStepStatuses((prev) => ({ ...prev, [payload.step_id]: 'running' }));
      });

      unsubStep = await listen('task-step-finished', (event) => {
        const payload = event.payload as { run_id: string; step_id: string; status: string };
        if (payload.run_id !== runId) return;
        setStepStatuses((prev) => {
          const next = { ...prev };
          next[payload.step_id] = payload.status as StepStatus;
          // 找到当前完成步骤的下一个，设为 running
          const idx = task.steps.findIndex((s) => s.id === payload.step_id);
          if (payload.status === 'success' && idx >= 0 && idx < task.steps.length - 1) {
            const nextStep = task.steps[idx + 1];
            if (nextStep.condition !== 'on_fail') {
              next[nextStep.id] = 'running';
            }
          }
          return next;
        });
      });

      unsubFinish = await listen('task-run-finished', (event) => {
        const payload = event.payload as { run_id: string; status: string };
        if (payload.run_id !== runId) return;
        const finalStatus = payload.status as 'success' | 'failed' | 'cancelled';
        setRunStatus(finalStatus);
        // 所有未完成的步骤标记
        setStepStatuses((prev) => {
          const next = { ...prev };
          task.steps.forEach((s) => {
            if (!next[s.id] || next[s.id] === 'pending' || next[s.id] === 'running') {
              if (finalStatus !== 'success' && next[s.id] !== 'running') {
                next[s.id] = 'skipped';
              }
            }
          });
          return next;
        });
        onFinished?.();
      });
    };

    void setup();

    return () => {
      unsubStart?.();
      unsubStep?.();
      unsubFinish?.();
    };
  }, [open, runId, task, onFinished]);

  const handleCancel = useCallback(async () => {
    if (!runId) return;
    try {
      await automationCancelRun(runId);
    } catch {
      // 忽略取消失败
    }
  }, [runId]);

  const handleClose = () => {
    if (runStatus === 'running') return;
    onClose();
  };

  const completedCount = task
    ? task.steps.filter((s) => stepStatuses[s.id] === 'success' || stepStatuses[s.id] === 'failed').length
    : 0;
  const progress = task ? (completedCount / task.steps.length) * 100 : 0;

  const statusLabel = t(`runStatus.${runStatus}`, { defaultValue: runStatus });
  const serverCount = task?.connection_ids.length ?? 0;

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            label={statusLabel}
            size="small"
            sx={{
              height: 20,
              fontSize: 10,
              fontWeight: 700,
              bgcolor: `${STATUS_COLOR[runStatus]}22`,
              color: STATUS_COLOR[runStatus],
            }}
          />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {task?.name}
          </Typography>
          {serverCount > 1 && (
            <Chip
              label={t('connectionCount', { count: serverCount })}
              size="small"
              variant="outlined"
              sx={{ height: 20, fontSize: 10, fontWeight: 700 }}
            />
          )}
        </Box>
        <Typography variant="caption" color="text.secondary">
          {task?.description}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ flex: 1 }}>
              <LinearProgress
                variant="determinate"
                value={progress}
                sx={{ height: 6, borderRadius: 3, bgcolor: '#E0E0E0' }}
              />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 48, textAlign: 'right' }}>
              {completedCount}/{task?.steps.length ?? 0}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {task?.steps.map((step, idx) => {
              const status = stepStatuses[step.id] ?? 'pending';
              const color = STATUS_COLOR[status];
              return (
                <Box
                  key={step.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.25,
                    py: 0.75,
                    px: 1,
                    borderRadius: 1,
                    bgcolor: status === 'running' ? 'action.hover' : 'transparent',
                  }}
                >
                  <Box
                    sx={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      bgcolor: `${color}20`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {status === 'success' ? (
                      <CheckCircleIcon size={14} color={color} weight="fill" />
                    ) : status === 'failed' ? (
                      <XCircleIcon size={14} color={color} weight="fill" />
                    ) : status === 'running' ? (
                      <ClockIcon size={14} color={color} weight="fill" />
                    ) : (
                      <Typography variant="caption" sx={{ color, fontWeight: 700, fontSize: 10 }}>
                        {idx + 1}
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 600,
                        fontSize: 13,
                        color: status === 'pending' ? 'text.secondary' : 'text.primary',
                      }}
                      noWrap
                    >
                      {step.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }} noWrap>
                      {t(`stepType.${step.type}`, { defaultValue: step.type })}
                    </Typography>
                  </Box>
                  <Chip
                    label={t(`stepStatus.${status}`, { defaultValue: status })}
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: 10,
                      fontWeight: 700,
                      color,
                      bgcolor: `${color}15`,
                    }}
                  />
                </Box>
              );
            })}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        {runStatus === 'running' ? (
          <Button color="warning" onClick={handleCancel}>
            {t('history.cancel')}
          </Button>
        ) : (
          <Button variant="contained" onClick={handleClose}>
            {t('close', { ns: 'common' })}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
