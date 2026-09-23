import { useState, useMemo } from 'react';
import {
  Box, Typography, LinearProgress, Chip,
  List, ListItem, ListItemText, ListItemIcon,
  Collapse, IconButton, Tooltip,
  Divider, Alert,
} from '@mui/material';
import {
  CheckCircle, XCircle, Clock, PlayCircle,
  CaretDown, CaretUp, Warning,
  Terminal, Info, ArrowsDownUp,
} from '@phosphor-icons/react';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';

export interface RepairAttempt {
  attemptNo: number;
  method: string;
  command: string;
  success: boolean;
  error?: string | null;
}

export interface RepairStep {
  index: number;
  service: string;
  description: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  priority: string;
  requiresSudo: boolean;
  failureReason?: string | null;
  attempts?: RepairAttempt[];
  outputSummary?: string | null;
}

export interface RepairPlanData {
  planId: string;
  target: string;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  progressPercent: number;
  steps: RepairStep[];
}

interface Props {
  plan: RepairPlanData | null;
  compact?: boolean;
}

function getStepIcon(status: string, isDark: boolean) {
  const iconSize = 18;
  switch (status) {
    case 'success':
      return <CheckCircle size={iconSize} weight="fill" color={isDark ? '#66BB6A' : '#2E7D32'} />;
    case 'failed':
      return <XCircle size={iconSize} weight="fill" color={isDark ? '#EF5350' : '#C62828'} />;
    case 'running':
      return <PlayCircle size={iconSize} weight="fill" color={isDark ? '#42A5F5' : '#1565C0'} />;
    case 'skipped':
      return <Info size={iconSize} weight="fill" color="text.secondary" />;
    case 'pending':
    default:
      return <Clock size={iconSize} weight="light" color="text.disabled" />;
  }
}

function getStatusLabel(status: string, t: (key: string) => string) {
  switch (status) {
    case 'success': return t('repair.status_success');
    case 'failed': return t('repair.status_failed');
    case 'running': return t('repair.status_running');
    case 'skipped': return t('repair.status_skipped');
    case 'pending': return t('repair.status_pending');
    default: return status;
  }
}

function getStatusColor(status: string, isDark: boolean) {
  switch (status) {
    case 'success': return isDark ? '#66BB6A' : '#2E7D32';
    case 'failed': return isDark ? '#EF5350' : '#C62828';
    case 'running': return isDark ? '#42A5F5' : '#1565C0';
    case 'skipped': return 'text.secondary';
    case 'pending':
    default: return 'text.disabled';
  }
}

export function RepairProgressPanel({ plan, compact = false }: Props) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { t } = useTranslation('agent');
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  const toggleStep = (index: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const expandAll = () => {
    if (!plan) return;
    const allExpandable = plan.steps
      .filter((s) => s.status === 'failed' || (s.attempts && s.attempts.length > 1) || s.outputSummary)
      .map((s) => s.index);
    setExpandedSteps(new Set(allExpandable));
  };

  const collapseAll = () => {
    setExpandedSteps(new Set());
  };

  // 统计信息
  const stats = useMemo(() => {
    if (!plan) return null;
    const totalAttempts = plan.steps.reduce((sum, s) => sum + (s.attempts?.length || 0), 0);
    const failedSteps = plan.steps.filter((s) => s.status === 'failed').length;
    const successSteps = plan.steps.filter((s) => s.status === 'success').length;
    const runningSteps = plan.steps.filter((s) => s.status === 'running').length;
    const skippedSteps = plan.steps.filter((s) => s.status === 'skipped').length;
    return { totalAttempts, failedSteps, successSteps, runningSteps, skippedSteps };
  }, [plan]);

  if (!plan || plan.steps.length === 0) {
    return null;
  }

  const isComplete = plan.completedSteps + plan.failedSteps >= plan.totalSteps;
  const allSuccess = plan.failedSteps === 0 && plan.completedSteps === plan.totalSteps && plan.totalSteps > 0;
  const hasFailures = plan.failedSteps > 0;
  const hasExpandable = plan.steps.some((s) =>
    s.status === 'failed' || (s.attempts && s.attempts.length > 1) || s.outputSummary
  );
  const allExpanded = hasExpandable && plan.steps.every((s) =>
    !(s.status === 'failed' || (s.attempts && s.attempts.length > 1) || s.outputSummary)
    || expandedSteps.has(s.index)
  );

  const progressColor = hasFailures
    ? (isDark ? '#EF5350' : '#C62828')
    : (isDark ? '#66BB6A' : '#2E7D32');

  return (
    <Box
      sx={{
        borderRadius: 2,
        border: 1,
        borderColor: isDark ? 'rgba(102, 187, 106, 0.2)' : 'rgba(46, 125, 50, 0.1)',
        bgcolor: isDark ? 'rgba(102, 187, 106, 0.04)' : 'rgba(46, 125, 50, 0.03)',
        overflow: 'hidden',
      }}
    >
      {/* Header with progress bar */}
      <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: 13 }}>
              {t('repair.title')}
            </Typography>
            {isComplete && (
              <Chip
                label={allSuccess ? t('repair.all_success') : t('repair.completed_with_failures')}
                size="small"
                color={allSuccess ? 'success' : 'warning'}
                sx={{ height: 20, fontSize: 10, fontWeight: 600 }}
              />
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 11 }}>
              {plan.completedSteps + plan.failedSteps}/{plan.totalSteps} {t('repair.steps')}
            </Typography>
            {!compact && hasExpandable && (
              <Tooltip title={allExpanded ? '收起全部' : '展开全部'}>
                <IconButton
                  size="small"
                  onClick={allExpanded ? collapseAll : expandAll}
                  sx={{
                    p: 0.25,
                    color: 'text.secondary',
                    '&:hover': { color: 'text.primary' },
                  }}
                >
                  <ArrowsDownUp size={14} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>

        <LinearProgress
          variant="determinate"
          value={plan.progressPercent}
          sx={{
            height: 6,
            borderRadius: 3,
            bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            '& .MuiLinearProgress-bar': {
              bgcolor: progressColor,
              borderRadius: 3,
              transition: 'width 0.4s ease',
            },
          }}
        />

        {/* 统计信息行 */}
        {!compact && stats && (
          <Box sx={{ display: 'flex', gap: 2, mt: 1, flexWrap: 'wrap' }}>
            <Chip
              icon={<CheckCircle size={12} weight="fill" />}
              label={`成功 ${stats.successSteps}`}
              size="small"
              color="success"
              variant="outlined"
              sx={{ height: 20, fontSize: 10, '& .MuiChip-icon': { fontSize: 12 } }}
            />
            {stats.runningSteps > 0 && (
              <Chip
                icon={<PlayCircle size={12} weight="fill" />}
                label={`进行中 ${stats.runningSteps}`}
                size="small"
                color="primary"
                variant="outlined"
                sx={{ height: 20, fontSize: 10, '& .MuiChip-icon': { fontSize: 12 } }}
              />
            )}
            {stats.failedSteps > 0 && (
              <Chip
                icon={<XCircle size={12} weight="fill" />}
                label={`失败 ${stats.failedSteps}`}
                size="small"
                color="error"
                variant="outlined"
                sx={{ height: 20, fontSize: 10, '& .MuiChip-icon': { fontSize: 12 } }}
              />
            )}
            {stats.skippedSteps > 0 && (
              <Chip
                icon={<Info size={12} weight="fill" />}
                label={`跳过 ${stats.skippedSteps}`}
                size="small"
                color="default"
                variant="outlined"
                sx={{ height: 20, fontSize: 10, '& .MuiChip-icon': { fontSize: 12 } }}
              />
            )}
            {stats.totalAttempts > 0 && (
              <Chip
                label={`共 ${stats.totalAttempts} 次尝试`}
                size="small"
                variant="outlined"
                sx={{ height: 20, fontSize: 10 }}
              />
            )}
          </Box>
        )}

        {!compact && hasFailures && isComplete && (
          <Alert
            severity="warning"
            icon={<Warning size={16} weight="fill" />}
            sx={{ mt: 1.5, fontSize: 12, py: 0.5 }}
          >
            {t('repair.some_failed_note')}
          </Alert>
        )}
      </Box>

      {!compact && (
        <>
          <Divider sx={{ opacity: 0.5 }} />

          {/* Step list */}
          <List sx={{ py: 0.5 }}>
            {plan.steps.map((step, idx) => {
              const isExpanded = expandedSteps.has(step.index);
              const hasAttempts = step.attempts && step.attempts.length > 0;
              const hasOutputSummary = !!step.outputSummary;
              const hasDetails = step.status === 'failed' || (hasAttempts && step.attempts!.length > 1) || hasOutputSummary;

              return (
                <Box key={step.index}>
                  {idx > 0 && <Divider sx={{ opacity: 0.3, mx: 2 }} />}
                  <ListItem
                    sx={{
                      py: 1,
                      px: 2,
                      cursor: hasDetails ? 'pointer' : 'default',
                      '&:hover': hasDetails ? {
                        bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                      } : {},
                    }}
                    onClick={() => hasDetails && toggleStep(step.index)}
                  >
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      {getStepIcon(step.status, isDark)}
                    </ListItemIcon>
                    <ListItemText
                      sx={{ my: 0 }}
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500, fontSize: 13 }}>
                            {step.service}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{
                              fontSize: 10,
                              px: 0.75,
                              py: 0.2,
                              borderRadius: 1,
                              bgcolor: `${getStatusColor(step.status, isDark)}15`,
                              color: getStatusColor(step.status, isDark),
                              fontWeight: 600,
                            }}
                          >
                            {getStatusLabel(step.status, t)}
                          </Typography>
                          {step.requiresSudo && (
                            <Tooltip title={t('repair.requires_sudo')}>
                              <Chip
                                label="sudo"
                                size="small"
                                variant="outlined"
                                sx={{ height: 16, fontSize: 9, fontWeight: 500, borderColor: 'divider' }}
                              />
                            </Tooltip>
                          )}
                        </Box>
                      }
                      secondary={
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 11 }}>
                          {step.description || t('repair.no_description')}
                        </Typography>
                      }
                    />
                    {hasDetails && (
                      <IconButton size="small" sx={{ ml: 0.5 }}>
                        {isExpanded
                          ? <CaretUp size={16} weight="bold" />
                          : <CaretDown size={16} weight="bold" />}
                      </IconButton>
                    )}
                  </ListItem>

                  {/* Expanded: failure details / attempt history / output summary */}
                  {hasDetails && (
                    <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                      <Box sx={{ px: 2, pb: 1.5, pl: 7 }}>
                        {step.failureReason && step.status === 'failed' && (
                          <Alert
                            severity="error"
                            icon={<XCircle size={14} weight="fill" />}
                            sx={{ mb: 1, fontSize: 11, py: 0.5 }}
                          >
                            {step.failureReason}
                          </Alert>
                        )}

                        {hasOutputSummary && (
                          <Box sx={{ mb: hasAttempts ? 1 : 0 }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10, fontWeight: 600, mb: 0.5, display: 'block' }}>
                              输出摘要
                            </Typography>
                            <Box
                              sx={{
                                p: 1,
                                borderRadius: 1.5,
                                bgcolor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.04)',
                                border: '1px solid',
                                borderColor: 'divider',
                                fontSize: 11,
                                lineHeight: 1.5,
                                color: 'text.secondary',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                              }}
                            >
                              {step.outputSummary}
                            </Box>
                          </Box>
                        )}

                        {hasAttempts && (
                          <Box>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10, fontWeight: 600, mb: 0.5, display: 'block' }}>
                              {t('repair.attempt_history')} ({step.attempts!.length})
                            </Typography>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                              {step.attempts!.map((attempt) => (
                                <Box
                                  key={attempt.attemptNo}
                                  sx={{
                                    p: 1,
                                    borderRadius: 1.5,
                                    border: 1,
                                    borderColor: isDark
                                      ? (attempt.success ? 'rgba(102,187,106,0.2)' : 'rgba(239,83,80,0.2)')
                                      : (attempt.success ? 'rgba(46,125,50,0.15)' : 'rgba(198,40,40,0.15)'),
                                    bgcolor: isDark
                                      ? (attempt.success ? 'rgba(102,187,106,0.04)' : 'rgba(239,83,80,0.04)')
                                      : (attempt.success ? 'rgba(46,125,50,0.03)' : 'rgba(198,40,40,0.03)'),
                                  }}
                                >
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                                    {attempt.success
                                      ? <CheckCircle size={12} weight="fill" color={isDark ? '#66BB6A' : '#2E7D32'} />
                                      : <XCircle size={12} weight="fill" color={isDark ? '#EF5350' : '#C62828'} />}
                                    <Typography variant="caption" sx={{ fontSize: 11, fontWeight: 600 }}>
                                      {t('repair.attempt')} {attempt.attemptNo}: {attempt.method}
                                    </Typography>
                                  </Box>
                                  <Box
                                    sx={{
                                      display: 'flex',
                                      alignItems: 'flex-start',
                                      gap: 0.5,
                                      fontFamily: 'monospace',
                                      fontSize: 10.5,
                                      color: 'text.secondary',
                                      bgcolor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.04)',
                                      borderRadius: 1,
                                      p: 0.75,
                                      overflowX: 'auto',
                                    }}
                                  >
                                    <Terminal size={11} style={{ flexShrink: 0, marginTop: 1 }} />
                                    <span style={{ wordBreak: 'break-all' }}>{attempt.command}</span>
                                  </Box>
                                  {attempt.error && (
                                    <Typography
                                      variant="caption"
                                      sx={{
                                        display: 'block',
                                        mt: 0.5,
                                        fontSize: 10.5,
                                        color: isDark ? '#EF9A9A' : '#C62828',
                                        fontFamily: 'monospace',
                                        wordBreak: 'break-word',
                                      }}
                                    >
                                      {attempt.error}
                                    </Typography>
                                  )}
                                </Box>
                              ))}
                            </Box>
                          </Box>
                        )}
                      </Box>
                    </Collapse>
                  )}
                </Box>
              );
            })}
          </List>
        </>
      )}
    </Box>
  );
}
