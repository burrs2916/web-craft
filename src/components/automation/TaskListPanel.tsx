import { Suspense, lazy, memo, useCallback, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import { useTranslation } from 'react-i18next';
import {
  PlusIcon,
  PlayIcon,
  PencilSimpleIcon,
  TrashIcon,
  TrayIcon,
  RepeatIcon,
  ListMagnifyingGlassIcon,
  ActivityIcon,
  CheckCircleIcon,
  XCircleIcon,
  HourglassIcon,
} from '@phosphor-icons/react';
import {
  automationListTasks,
  automationGetStats,
  automationSaveTask,
  automationDeleteTask,
  automationToggleTask,
  automationRunTask,
} from '../../core/services/automation.service';
import type { AutomationTask, TaskRunStats } from '../../proto/automation';
import type { ConnectionConfig } from '../../proto/connection';
import type { SiteSummary } from '../../proto/cms';
import type { OpsScript } from '../../proto/ops';
import { TaskRunDialog } from './TaskRunDialog';

// 懒加载 TaskEditor（1027 行的大组件，只在打开编辑器时才加载）
const TaskEditor = lazy(() => import('./TaskEditor').then((m) => ({ default: m.TaskEditor })));

interface TaskListPanelProps {
  connections: ConnectionConfig[];
  sites: SiteSummary[];
  scripts: OpsScript[];
  onViewHistory: (taskId: string) => void;
}

export function TaskListPanel({ connections, sites, scripts, onViewHistory }: TaskListPanelProps) {
  const { t } = useTranslation('automation');
  const [tasks, setTasks] = useState<AutomationTask[]>([]);
  const [stats, setStats] = useState<TaskRunStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [opErr, setOpErr] = useState('');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<AutomationTask | null>(null);
  const [deletingTask, setDeletingTask] = useState<AutomationTask | null>(null);

  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [runTask, setRunTask] = useState<AutomationTask | null>(null);
  const [runId, setRunId] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setTasks(await automationListTasks());
      try {
        setStats(await automationGetStats());
      } catch {
        // 统计加载失败不影响主流程
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleNew = useCallback(() => {
    setEditingTask(null);
    setEditorOpen(true);
  }, []);

  const handleEdit = useCallback((task: AutomationTask) => {
    setEditingTask(task);
    setEditorOpen(true);
  }, []);

  const handleSaved = useCallback(async (task: AutomationTask) => {
    setOpErr('');
    try {
      await automationSaveTask(task);
      setEditorOpen(false);
      setEditingTask(null);
      void refresh();
    } catch (e) {
      setOpErr(String(e));
    }
  }, [refresh]);

  const handleToggle = useCallback(async (id: string, enabled: boolean) => {
    try {
      await automationToggleTask(id, enabled);
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, enabled } : t)));
    } catch (e) {
      setOpErr(String(e));
    }
  }, []);

  const handleDelete = useCallback(async () => {
    if (!deletingTask) return;
    setOpErr('');
    try {
      await automationDeleteTask(deletingTask.id);
      setDeletingTask(null);
      void refresh();
    } catch (e) {
      setOpErr(String(e));
    }
  }, [deletingTask, refresh]);

  const handleRun = useCallback(async (task: AutomationTask) => {
    setOpErr('');
    setRunTask(task);
    setRunId('');
    setRunDialogOpen(true);
    try {
      const newRunId = await automationRunTask(task.id);
      setRunId(newRunId);
    } catch (e) {
      setOpErr(String(e));
      setRunDialogOpen(false);
      setRunTask(null);
    }
  }, []);

  const handleRunFinished = useCallback(() => {
    void refresh();
  }, [refresh]);

  const handleCloseEditor = useCallback(() => {
    setEditorOpen(false);
    setEditingTask(null);
  }, []);

  const handleViewHistory = useCallback((taskId: string) => {
    onViewHistory(taskId);
  }, [onViewHistory]);

  const successRate = stats && stats.totalRuns > 0
    ? Math.round((stats.successRuns / stats.totalRuns) * 100)
    : 0;
  const avgSecs = stats ? (stats.avgDurationMs / 1000).toFixed(1) : '0.0';

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {error && <Alert severity="error">{error}</Alert>}
      {opErr && <Alert severity="error" onClose={() => setOpErr('')}>{opErr}</Alert>}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
          {t('tab.tasks')}
        </Typography>
        <Button
          size="small"
          variant="contained"
          startIcon={<PlusIcon size={15} />}
          onClick={handleNew}
        >
          {t('tab.newTask')}
        </Button>
      </Box>

      {stats && stats.totalRuns > 0 && (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1 }}>
            <StatCard label={t('stat.totalRuns')} value={String(stats.totalRuns)} icon={<ActivityIcon size={18} />} color="#42A5F5" />
            <StatCard label={t('stat.successRate')} value={`${successRate}%`} icon={<CheckCircleIcon size={18} />} color="#66BB6A" />
            <StatCard label={t('stat.failedRuns')} value={String(stats.failedRuns)} icon={<XCircleIcon size={18} />} color="#EF5350" />
            <StatCard label={t('stat.avgDuration')} value={`${avgSecs}s`} icon={<HourglassIcon size={18} />} color="#FFA726" />
          </Box>
          <TrendChart data={stats.last7Days ?? []} title={t('stat.trendTitle')} />
        </>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={28} />
        </Box>
      ) : tasks.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <TrayIcon size={40} weight="light" />
          <Typography variant="body2" sx={{ mt: 1 }}>{t('taskEmpty')}</Typography>
          <Button size="small" variant="contained" startIcon={<PlusIcon size={15} />} sx={{ mt: 1.5 }} onClick={handleNew}>
            {t('tab.newTask')}
          </Button>
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 1.5, overflowY: 'auto' }}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onEdit={handleEdit}
              onToggle={handleToggle}
              onDelete={setDeletingTask}
              onRun={handleRun}
              onHistory={handleViewHistory}
            />
          ))}
        </Box>
      )}

      {/* 懒加载任务编辑器，仅在打开时加载模块 */}
      {editorOpen && (
        <Suspense fallback={
          <Dialog open={true} fullWidth maxWidth="md">
            <DialogTitle>加载中...</DialogTitle>
            <DialogContent sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </DialogContent>
          </Dialog>
        }>
          <TaskEditor
            open={editorOpen}
            task={editingTask}
            connections={connections}
            sites={sites}
            scripts={scripts}
            onClose={handleCloseEditor}
            onSaved={handleSaved}
          />
        </Suspense>
      )}

      <Dialog open={Boolean(deletingTask)} onClose={() => setDeletingTask(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('taskDeleteTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {t('taskDeleteMessage', { name: deletingTask?.name ?? '' })}
          </Typography>
          {opErr && <Alert severity="error" sx={{ mt: 1.5 }}>{opErr}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeletingTask(null)}>{t('cancel', { ns: 'common' })}</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>
            {t('delete', { ns: 'common' })}
          </Button>
        </DialogActions>
      </Dialog>

      <TaskRunDialog
        open={runDialogOpen}
        task={runTask}
        runId={runId}
        onClose={() => setRunDialogOpen(false)}
        onFinished={handleRunFinished}
      />
    </Box>
  );
}

// ============ 纯展示子组件（定义在外部 + memo，避免父组件重渲导致子树重建） ============

function scheduleKindKey(kind: string | undefined): string {
  switch (kind) {
    case 'interval': return 'scheduleInterval';
    case 'daily': return 'scheduleDaily';
    case 'hourly': return 'scheduleHourly';
    default: return 'scheduleOff';
  }
}

interface TaskCardProps {
  task: AutomationTask;
  onEdit: (task: AutomationTask) => void;
  onToggle: (id: string, v: boolean) => void;
  onDelete: (task: AutomationTask) => void;
  onRun: (task: AutomationTask) => void;
  onHistory: (taskId: string) => void;
}

const TaskCard = memo(function TaskCard({ task, onEdit, onToggle, onDelete, onRun, onHistory }: TaskCardProps) {
  const { t } = useTranslation('automation');
  const lastRun = task.last_run_at ? new Date(task.last_run_at).toLocaleString() : '';
  const statusColor = task.last_run_status === 'success' ? '#66BB6A'
    : task.last_run_status === 'failed' ? '#EF5350'
    : task.last_run_status === 'cancelled' ? '#FFA726'
    : task.last_run_status === 'running' ? '#42A5F5'
    : null;

  const handleToggle = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onToggle(task.id, e.target.checked);
  }, [task.id, onToggle]);

  const handleEdit = useCallback(() => onEdit(task), [task, onEdit]);
  const handleDelete = useCallback(() => onDelete(task), [task, onDelete]);
  const handleRun = useCallback(() => onRun(task), [task, onRun]);
  const handleHistory = useCallback(() => onHistory(task.id), [task.id, onHistory]);

  return (
    <Card variant="outlined" sx={{ display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ p: 1.75, pb: 1.25, flex: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <TrayIcon size={22} color="text.secondary" />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Typography variant="body1" noWrap sx={{ fontSize: 14, fontWeight: 600 }}>
                {task.name}
              </Typography>
              {statusColor && (
                <Box
                  component="span"
                  title={`上次运行: ${task.last_run_status}`}
                  sx={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    bgcolor: statusColor,
                    flexShrink: 0,
                  }}
                />
              )}
              {!task.enabled && (
                <Chip label={t('taskDisabled')} size="small" sx={{ height: 18, fontSize: 10, fontWeight: 700, color: 'text.secondary' }} />
              )}
            </Box>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
              {task.description || '—'}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75, mt: 1.25, alignItems: 'center', flexWrap: 'wrap' }}>
          <Chip label={t('stepCount', { count: task.steps.length })} size="small" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
          <Chip label={t('connectionCount', { count: task.connection_ids?.length ?? 0 })} size="small" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
          {task.schedule_kind && task.schedule_kind !== 'off' && (
            <Chip
              icon={<RepeatIcon size={11} />}
              label={t('scheduleChip', { kind: t(`editor.${scheduleKindKey(task.schedule_kind)}`) })}
              size="small"
              color="info"
              variant="outlined"
              sx={{ height: 18, fontSize: 10 }}
            />
          )}
          <Box sx={{ flex: 1 }} />
          {lastRun && (
            <Typography variant="caption" color="text.secondary">{t('lastRunAt')} {lastRun}</Typography>
          )}
          {task.next_run_at ? (
            <Typography variant="caption" color="text.secondary">{t('nextRunAt')} {new Date(task.next_run_at).toLocaleString()}</Typography>
          ) : null}
        </Box>
      </CardContent>
      <Divider sx={{ my: 0 }} />
      <Box sx={{ p: 1, pl: 1.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <FormControlLabel
          control={<Switch size="small" checked={task.enabled} onChange={handleToggle} />}
          label={t(task.enabled ? 'enabledLabel' : 'enable')}
          sx={{ mr: 0, '& .MuiFormControlLabel-label': { fontSize: 12, color: 'text.secondary' } }}
        />
        <Box sx={{ flex: 1 }} />
        <Button size="small" variant="text" startIcon={<ListMagnifyingGlassIcon size={15} />} onClick={handleHistory}>
          {t('historyBtn')}
        </Button>
        <IconButton size="small" title={t('edit')} onClick={handleEdit}>
          <PencilSimpleIcon size={18} />
        </IconButton>
        <IconButton size="small" color="error" title={t('taskDeleteTitle')} onClick={handleDelete}>
          <TrashIcon size={18} />
        </IconButton>
        <Button size="small" variant="contained" startIcon={<PlayIcon size={14} />} disabled={!task.enabled} onClick={handleRun}>
          {t('run')}
        </Button>
      </Box>
    </Card>
  );
});

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}

const StatCard = memo(function StatCard({ label, value, icon, color }: StatCardProps) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.25 }}>
      <Box sx={{
        width: 32,
        height: 32,
        borderRadius: 1.5,
        bgcolor: `${color}15`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color,
        flexShrink: 0,
      }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, fontSize: 18, lineHeight: 1.1, color: 'text.primary' }}>
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
          {label}
        </Typography>
      </Box>
    </Paper>
  );
});

interface TrendChartProps {
  data: TaskRunStats['last7Days'];
  title: string;
}

/** 最近 7 天运行趋势：每日一根堆叠柱（绿色=成功，红色=失败），无数据的天数显示空槽。 */
const TrendChart = memo(function TrendChart({ data, title }: TrendChartProps) {
  if (!data.length) return null;
  const max = Math.max(...data.map((d) => d.total), 1);
  return (
    <Paper variant="outlined" sx={{ px: 2, py: 1.25, display: 'flex', alignItems: 'center', gap: 2 }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, flexShrink: 0 }}>
        {title}
      </Typography>
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 1.25, height: 44 }}>
        {data.map((d) => {
          const h = Math.round((d.total / max) * 36);
          const failH = d.total > 0 ? Math.max(Math.round((d.failed / d.total) * h), d.failed > 0 ? 2 : 0) : 0;
          const okH = h - failH;
          return (
            <Box
              key={d.date}
              title={`${d.date} · ${d.total} (${d.success}/${d.failed})`}
              sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'stretch', height: '100%' }}
            >
              <Box sx={{ height: Math.max(failH, d.failed > 0 ? 2 : 0), bgcolor: '#EF5350', borderRadius: '2px 2px 0 0', minHeight: d.failed > 0 ? 2 : 0 }} />
              <Box sx={{ height: okH, bgcolor: '#66BB6A', borderRadius: d.failed > 0 ? '0 0 2px 2px' : '2px' }} />
              <Typography variant="caption" sx={{ fontSize: 9, color: 'text.disabled', textAlign: 'center', mt: 0.25, lineHeight: 1 }}>
                {d.date.slice(5)}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
});


