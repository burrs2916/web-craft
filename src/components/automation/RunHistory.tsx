import { useCallback, useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import Collapse from '@mui/material/Collapse';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import { useTranslation } from 'react-i18next';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { save } from '@tauri-apps/plugin-dialog';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import {
  CaretDownIcon,
  NotebookIcon,
  TerminalWindowIcon,
  DownloadSimpleIcon,
  PlayIcon,
  TrashIcon,
  ArrowFatRightIcon,
  CopyIcon,
  CaretCircleRightIcon,
  MagnifyingGlassIcon,
  HardDriveIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  WarningCircleIcon,
  ArrowsClockwiseIcon,
  DotsThreeVerticalIcon,
} from '@phosphor-icons/react';
import InputAdornment from '@mui/material/InputAdornment';
import {
  automationListRuns,
  automationGetRun,
  automationCancelRun,
  automationExportRun,
  automationDeleteRun,
  automationRerun,
} from '../../core/services/automation.service';
import { useNotify } from '../../core/notification';
import type { TaskRun, TaskRunDetail, TaskRunStep } from '../../proto/automation';

const PAGE_SIZE = 50;

const STATUS_COLOR: Record<string, string> = {
  running: '#42A5F5',
  success: '#66BB6A',
  failed: '#EF5350',
  cancelled: '#FFA726',
  skipped: '#90A4AE',
};

const STATUS_FILTERS = ['running', 'success', 'failed', 'cancelled'] as const;
const TRIGGER_FILTERS = ['manual', 'schedule', 'startup'] as const;

interface RunHistoryProps {
  taskId?: string;
  tasks?: Array<{ id: string; name: string }>;
  connections?: Array<{ id: string; name: string }>;
  onGoToTask?: (taskId: string) => void;
}

export function RunHistory({ taskId, tasks = [], connections = [], onGoToTask }: RunHistoryProps) {
  const { t } = useTranslation('automation');
  const { notify } = useNotify();
  const [runs, setRuns] = useState<TaskRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [triggerFilter, setTriggerFilter] = useState('');
  const [connFilter, setConnFilter] = useState('');
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | '7d'>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TaskRunDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [allExpanded, setAllExpanded] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await automationListRuns({
        taskId,
        status: statusFilter || undefined,
        trigger: triggerFilter || undefined,
        limit: PAGE_SIZE,
        offset: 0,
      });
      setRuns(list);
      setHasMore(list.length === PAGE_SIZE);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [taskId, statusFilter, triggerFilter]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const list = await automationListRuns({
        taskId,
        status: statusFilter || undefined,
        trigger: triggerFilter || undefined,
        limit: PAGE_SIZE,
        offset: runs.length,
      });
      setRuns((prev) => [...prev, ...list]);
      setHasMore(list.length === PAGE_SIZE);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingMore(false);
    }
  }, [taskId, statusFilter, triggerFilter, runs.length]);

  const refreshDetail = useCallback(async (runId: string) => {
    try {
      const d = await automationGetRun(runId);
      if (d) setDetail(d);
    } catch {
      // 保持旧数据
    }
  }, []);

  // 实时事件
  useEffect(() => {
    const unsubs: UnlistenFn[] = [];
    const handler = () => {
      setSelectedId((current) => {
        if (current) void refreshDetail(current);
        return current;
      });
      void refresh();
    };
    Promise.all([
      listen('task-step-finished', handler),
      listen('task-run-finished', handler),
    ])
      .then((cleanups) => unsubs.push(...cleanups))
      .catch(() => {});
    return () => unsubs.forEach((u) => u());
  }, [refresh, refreshDetail]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openDetail = async (runId: string) => {
    setSelectedId(runId);
    if (detail?.run.id === runId) return;
    setDetail(null);
    setDetailLoading(true);
    setAllExpanded(false);
    try {
      setDetail(await automationGetRun(runId));
    } catch (e) {
      setError(String(e));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async (runId: string) => {
    try {
      await automationDeleteRun(runId);
      notify(t('history.deleted'), 'success');
      if (selectedId === runId) {
        setSelectedId(null);
        setDetail(null);
      }
      void refresh();
    } catch (e) {
      notify(`${t('history.deleteFail')}: ${String(e)}`, 'error');
    }
  };

  const handleRerun = async (runId: string) => {
    try {
      const newId = await automationRerun(runId);
      notify(t('history.rerunStarted'), 'success');
      // 选中新的运行
      setSelectedId(newId);
      setDetail(null);
      setDetailLoading(true);
      // 刷新列表并打开新 run 详情
      await refresh();
      const d = await automationGetRun(newId);
      if (d) setDetail(d);
      setDetailLoading(false);
    } catch (e) {
      notify(`${t('history.rerunFail')}: ${String(e)}`, 'error');
    }
  };

  const handleExport = async (format: 'markdown' | 'json') => {
    if (!detail) return;
    const ext = format === 'json' ? 'json' : 'md';
    const path = await save({
      defaultPath: `run-report-${detail.run.id.slice(0, 8)}.${ext}`,
      filters: [{ name: format.toUpperCase(), extensions: [ext] }],
    });
    if (!path) return;
    try {
      await automationExportRun(detail.run.id, format, path);
      notify(t('history.exported'), 'success');
    } catch (e) {
      notify(`${t('history.exportFail')}: ${String(e)}`, 'error');
    }
  };

  // 客户端关键词 + 服务器 + 时间范围过滤
  const filteredRuns = useMemo(() => {
    const q = search.toLowerCase().trim();
    const now = Date.now();
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    return runs.filter((r) => {
      // 关键词过滤
      if (q) {
        const taskName = tasks.find((t) => t.id === r.task_id)?.name ?? '';
        const matchKeyword =
          taskName.toLowerCase().includes(q) ||
          r.error_summary.toLowerCase().includes(q) ||
          r.trigger_type.toLowerCase().includes(q) ||
          r.status.toLowerCase().includes(q);
        if (!matchKeyword) return false;
      }
      // 服务器过滤
      if (connFilter && r.connection_id !== connFilter) return false;
      // 时间范围过滤
      if (timeFilter === 'today' && r.started_at < todayStart) return false;
      if (timeFilter === '7d' && r.started_at < sevenDaysAgo) return false;
      return true;
    });
  }, [runs, search, tasks, connFilter, timeFilter]);

  const taskNameMap = useMemo(() => {
    const m = new Map<string, string>();
    tasks.forEach((t) => m.set(t.id, t.name));
    return m;
  }, [tasks]);

  const connNameMap = useMemo(() => {
    const m = new Map<string, string>();
    connections.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [connections]);

  return (
    <Box sx={{ display: 'flex', height: '100%', minHeight: 0, gap: 2 }}>
      {/* ===== 左栏：列表 ===== */}
      <Box sx={{ width: 420, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {error && <Alert severity="error" sx={{ fontSize: 12, mb: 1 }}>{error}</Alert>}

        {/* 筛选面板 */}
        <Paper variant="outlined" sx={{ p: 1.25, mb: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {/* 搜索框 */}
          <TextField
            size="small"
            placeholder={t('history.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <MagnifyingGlassIcon size={15} style={{ color: '#94A3B8' }} />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ '& .MuiInputBase-input': { fontSize: 13 } }}
          />

          {/* 状态筛选 */}
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            <Chip
              label={t('history.filterAll')}
              size="small"
              clickable
              color={statusFilter === '' ? 'primary' : 'default'}
              variant={statusFilter === '' ? 'filled' : 'outlined'}
              onClick={() => setStatusFilter('')}
              sx={{ height: 24, fontSize: 11 }}
            />
            {STATUS_FILTERS.map((s) => (
              <Chip
                key={s}
                label={t(`runStatus.${s}`)}
                size="small"
                clickable
                color={statusFilter === s ? 'primary' : 'default'}
                variant={statusFilter === s ? 'filled' : 'outlined'}
                onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
                sx={{ height: 24, fontSize: 11 }}
              />
            ))}
          </Box>

          {/* 下拉筛选：触发方式 + 服务器 */}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              select
              size="small"
              value={triggerFilter}
              onChange={(e) => setTriggerFilter(e.target.value)}
              label={t('history.trigger')}
              sx={{
                flex: 1,
                minWidth: 0,
                '& .MuiInputBase-input': { py: 0.5, fontSize: 12 },
                '& .MuiInputLabel-root': { fontSize: 12 },
              }}
            >
              <MenuItem value="">{t('history.filterAll')}</MenuItem>
              {TRIGGER_FILTERS.map((tg) => (
                <MenuItem key={tg} value={tg} sx={{ fontSize: 12 }}>
                  {t(`history.triggerType.${tg}`, { defaultValue: tg })}
                </MenuItem>
              ))}
            </TextField>
            {connections.length > 0 && (
              <TextField
                select
                size="small"
                value={connFilter}
                onChange={(e) => setConnFilter(e.target.value)}
                label={t('history.server')}
                sx={{
                  flex: 1,
                  minWidth: 0,
                  '& .MuiInputBase-input': { py: 0.5, fontSize: 12 },
                  '& .MuiInputLabel-root': { fontSize: 12 },
                }}
              >
                <MenuItem value="">{t('history.filterAll')}</MenuItem>
                {connections.map((c) => (
                  <MenuItem key={c.id} value={c.id} sx={{ fontSize: 12 }}>
                    {c.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Box>

          {/* 时间范围 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, flexShrink: 0 }}>
              {t('history.timeRangeLabel')}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {(['all', 'today', '7d'] as const).map((tf) => (
                <Chip
                  key={tf}
                  label={t(`history.timeRange.${tf}`)}
                  size="small"
                  clickable
                  color={timeFilter === tf ? 'primary' : 'default'}
                  variant={timeFilter === tf ? 'filled' : 'outlined'}
                  onClick={() => setTimeFilter(tf)}
                  sx={{ height: 22, fontSize: 10.5 }}
                />
              ))}
            </Box>
          </Box>
        </Paper>

        {/* 列表 */}
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0.75, pr: 0.5 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress size={26} />
            </Box>
          ) : filteredRuns.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
              <NotebookIcon size={38} weight="light" />
              <Typography variant="body2" sx={{ mt: 1 }}>{t('history.empty')}</Typography>
            </Box>
          ) : (
            <>
              {filteredRuns.map((r) => (
                <RunCard
                  key={r.id}
                  run={r}
                  taskName={taskNameMap.get(r.task_id)}
                  connName={r.connection_id ? connNameMap.get(r.connection_id) : undefined}
                  selected={selectedId === r.id}
                  onClick={() => openDetail(r.id)}
                />
              ))}
              {hasMore && (
                <Button size="small" onClick={loadMore} disabled={loadingMore} sx={{ alignSelf: 'center', mt: 0.5 }}>
                  {loadingMore ? <CircularProgress size={14} /> : t('history.loadMore')}
                </Button>
              )}
            </>
          )}
        </Box>
      </Box>

      <Divider orientation="vertical" flexItem />

      {/* ===== 右栏：详情 ===== */}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {!selectedId ? (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'text.secondary' }}>
            <ArrowFatRightIcon size={40} weight="light" />
            <Typography variant="body2" sx={{ mt: 2 }}>{t('history.selectPrompt')}</Typography>
          </Box>
        ) : detailLoading && !detail ? (
          <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <CircularProgress size={28} />
          </Box>
        ) : detail ? (
          <RunDetailView
            detail={detail}
            taskName={taskNameMap.get(detail.run.task_id)}
            connName={detail.run.connection_id ? connNameMap.get(detail.run.connection_id) : undefined}
            allExpanded={allExpanded}
            onToggleAllExpanded={() => setAllExpanded((v) => !v)}
            onRerun={() => void handleRerun(detail.run.id)}
            onDelete={() => void handleDelete(detail.run.id)}
            onCancel={async () => {
              await automationCancelRun(detail.run.id);
              void refreshDetail(detail.run.id);
              void refresh();
            }}
            onExportMd={() => void handleExport('markdown')}
            onExportJson={() => void handleExport('json')}
            onGoToTask={onGoToTask ? () => onGoToTask(detail.run.task_id) : undefined}
          />
        ) : null}
      </Box>
    </Box>
  );
}

// ============================================================
// RunCard
// ============================================================

function RunCard({
  run,
  taskName,
  connName,
  selected,
  onClick,
}: {
  run: TaskRun;
  taskName?: string;
  connName?: string;
  selected: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation('automation');
  const color = STATUS_COLOR[run.status] ?? '#9E9E9E';
  const failed = run.status === 'failed';
  const running = run.status === 'running';

  return (
    <Paper
      variant="outlined"
      onClick={onClick}
      sx={{
        px: 1.5,
        py: 1.25,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
        borderColor: selected ? 'primary.main' : undefined,
        bgcolor: selected ? 'action.selected' : undefined,
        '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
        transition: 'background-color 0.15s',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0, animation: running ? 'pulse 1.5s ease-in-out infinite' : undefined }} />
        <Typography variant="body2" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }} noWrap>
          {taskName || run.task_id}
        </Typography>
        <Chip
          label={t(`runStatus.${run.status}`)}
          size="small"
          sx={{ height: 20, fontSize: 10, fontWeight: 700, color, bgcolor: `${color}1e` }}
        />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        {connName && (
          <Chip
            icon={<HardDriveIcon size={11} style={{ marginLeft: 2 }} />}
            label={connName}
            size="small"
            variant="outlined"
            sx={{ height: 18, fontSize: 10, '& .MuiChip-icon': { ml: 0.5, mr: -0.25 } }}
          />
        )}
        <Typography variant="caption" color="text.secondary">
          {relativeTime(run.started_at)}
        </Typography>
        {run.duration_ms != null && run.status !== 'running' && (
          <Chip
            icon={<ClockIcon size={10} />}
            label={fmtDuration(run.duration_ms)}
            size="small"
            variant="outlined"
            sx={{ height: 18, fontSize: 10 }}
          />
        )}
      </Box>

      {running && (
        <Box>
          <LinearProgress variant="indeterminate" sx={{ height: 3, borderRadius: 1.5 }} />
        </Box>
      )}

      {failed && run.error_summary && (
        <Typography
          variant="caption"
          noWrap
          sx={{
            color: '#EF5350',
            fontSize: 11,
            p: '4px 8px',
            bgcolor: '#FEF2F2',
            borderRadius: 1,
          }}
        >
          {run.error_summary}
        </Typography>
      )}
    </Paper>
  );
}

// ============================================================
// RunDetailView
// ============================================================

function RunDetailView({
  detail,
  taskName,
  connName,
  allExpanded,
  onToggleAllExpanded,
  onRerun,
  onDelete,
  onCancel,
  onExportMd,
  onExportJson,
  onGoToTask,
}: {
  detail: TaskRunDetail;
  taskName?: string;
  connName?: string;
  allExpanded: boolean;
  onToggleAllExpanded: () => void;
  onRerun: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onExportMd: () => void;
  onExportJson: () => void;
  onGoToTask?: () => void;
}) {
  const { t } = useTranslation('automation');
  const run = detail.run;
  const color = STATUS_COLOR[run.status] ?? '#9E9E9E';
  const running = run.status === 'running';
  const failedSteps = detail.steps.filter((s) => s.status === 'failed');

  // 按服务器分组步骤（从 command_rendered 前缀 [服务器名] 解析）
  const { groups, isMultiServer } = useMemo(() => {
    const map = new Map<string, TaskRunStep[]>();
    let hasMulti = false;
    detail.steps.forEach((s) => {
      const match = s.command_rendered.match(/^\[(.+?)\]\s*(.*)$/);
      const server = match ? match[1] : '';
      if (server) hasMulti = true;
      if (!map.has(server)) map.set(server, []);
      map.get(server)!.push(s);
    });
    return {
      groups: Array.from(map.entries()),
      isMultiServer: hasMulti,
    };
  }, [detail.steps]);

  const scrollToFirstFailed = useCallback(() => {
    const el = document.querySelector('[data-failed-step="true"]');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const [moreAnchor, setMoreAnchor] = useState<null | HTMLElement>(null);
  const moreOpen = Boolean(moreAnchor);
  const handleMoreClose = () => setMoreAnchor(null);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 1.5 }}>
      {/* 头部卡片 */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          {/* 左侧：标题 + 状态 */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Chip
                label={t(`runStatus.${run.status}`)}
                size="small"
                sx={{ height: 24, fontSize: 11.5, fontWeight: 700, color, bgcolor: `${color}1e` }}
              />
              <Typography variant="h6" sx={{ fontWeight: 800, fontSize: 18 }} noWrap>
                {taskName || run.task_id}
              </Typography>
            </Box>

            {/* 元信息 */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', rowGap: 0.5, columnGap: 2, color: 'text.secondary' }}>
              {connName && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <HardDriveIcon size={13} />
                  <Typography variant="caption">{connName}</Typography>
                </Box>
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <ClockIcon size={13} />
                <Typography variant="caption">
                  {fmtTime(run.started_at)}
                  {run.finished_at != null && ` → ${fmtTime(run.finished_at)}`}
                </Typography>
              </Box>
              <Typography variant="caption">
                {t('history.duration')}: {fmtDuration(run.duration_ms ?? (run.finished_at ?? run.started_at) - run.started_at)}
              </Typography>
              <Typography variant="caption">
                {t('history.trigger')}: {t(`history.triggerType.${run.trigger_type}`, { defaultValue: run.trigger_type })}
              </Typography>
            </Box>
          </Box>

          {/* 右侧：操作按钮 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
            {running ? (
              <Button size="small" color="warning" variant="contained" onClick={onCancel} disableElevation>
                {t('history.cancel')}
              </Button>
            ) : (
              <Button size="small" variant="contained" startIcon={<PlayIcon size={14} />} onClick={onRerun} disableElevation>
                {t('history.rerun')}
              </Button>
            )}
            <Tooltip title={t('history.moreActions')}>
              <IconButton
                size="small"
                onClick={(e) => setMoreAnchor(e.currentTarget)}
                sx={{ border: '1px solid', borderColor: 'divider', width: 32, height: 32 }}
              >
                <DotsThreeVerticalIcon size={16} />
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={moreAnchor}
              open={moreOpen}
              onClose={handleMoreClose}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              {onGoToTask && (
                <MenuItem
                  onClick={() => { handleMoreClose(); onGoToTask(); }}
                  sx={{ fontSize: 13, gap: 1 }}
                  dense
                >
                  <ArrowFatRightIcon size={14} />
                  {t('history.goToTask')}
                </MenuItem>
              )}
              <MenuItem
                onClick={() => { handleMoreClose(); onExportMd(); }}
                sx={{ fontSize: 13, gap: 1 }}
                dense
              >
                <DownloadSimpleIcon size={14} />
                {t('history.exportMd')}
              </MenuItem>
              <MenuItem
                onClick={() => { handleMoreClose(); onExportJson(); }}
                sx={{ fontSize: 13, gap: 1 }}
                dense
              >
                <TerminalWindowIcon size={14} />
                {t('history.exportJson')}
              </MenuItem>
              <MenuItem
                onClick={() => { handleMoreClose(); onDelete(); }}
                sx={{ fontSize: 13, gap: 1, color: 'error.main' }}
                dense
              >
                <TrashIcon size={14} />
                {t('history.delete')}
              </MenuItem>
            </Menu>
          </Box>
        </Box>

        {run.error_summary && (
          <Alert severity="error" icon={<WarningCircleIcon size={18} />} sx={{ fontSize: 13, mt: 1.5 }}>
            {run.error_summary}
          </Alert>
        )}
      </Paper>

      {/* 步骤统计栏 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Chip
          icon={<CheckCircleIcon size={12} />}
          label={`${detail.steps.filter((s) => s.status === 'success').length} ${t('stepStatus.success')}`}
          size="small"
          sx={{ height: 22, fontSize: 11, bgcolor: '#66BB6A15', color: '#2E7D32', '& .MuiChip-icon': { color: '#2E7D32' } }}
        />
        {failedSteps.length > 0 && (
          <Chip
            icon={<XCircleIcon size={12} />}
            label={`${failedSteps.length} ${t('stepStatus.failed')}`}
            size="small"
            sx={{ height: 22, fontSize: 11, bgcolor: '#EF535015', color: '#C62828', '& .MuiChip-icon': { color: '#C62828' }, cursor: 'pointer' }}
            onClick={scrollToFirstFailed}
          />
        )}
        <Chip
          icon={<ArrowsClockwiseIcon size={12} />}
          label={`${detail.steps.filter((s) => s.status === 'running').length} ${t('stepStatus.running')}`}
          size="small"
          sx={{ height: 22, fontSize: 11, bgcolor: '#42A5F515', color: '#1565C0', '& .MuiChip-icon': { color: '#1565C0' } }}
        />
        <Box sx={{ flex: 1 }} />
        <Button size="small" variant="text" onClick={onToggleAllExpanded} sx={{ fontSize: 11 }}>
          {allExpanded ? t('history.collapseAll') : t('history.expandAll')}
        </Button>
      </Box>

      {/* 步骤列表 */}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pr: 0.5 }}>
        {isMultiServer ? (
          <Stack spacing={1.5}>
            {groups.map(([server, steps]) => (
              <ServerGroup
                key={server || '_'}
                serverName={server || t('history.localSteps')}
                steps={steps}
                allExpanded={allExpanded}
              />
            ))}
          </Stack>
        ) : (
          <Stack spacing={0.75}>
            {detail.steps.map((s) => (
              <StepItem key={s.id} step={s} forceOpen={allExpanded} />
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  );
}

// ============================================================
// ServerGroup
// ============================================================

function ServerGroup({
  serverName,
  steps,
  allExpanded,
}: {
  serverName: string;
  steps: TaskRunStep[];
  allExpanded: boolean;
}) {
  const [open, setOpen] = useState(true);
  const failedCount = steps.filter((s) => s.status === 'failed').length;
  const successCount = steps.filter((s) => s.status === 'success').length;
  const running = steps.some((s) => s.status === 'running');

  useEffect(() => {
    if (allExpanded && !open) setOpen(true);
  }, [allExpanded, open]);

  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      <Box
        onClick={() => setOpen((v) => !v)}
        sx={{
          px: 1.5,
          py: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          cursor: 'pointer',
          bgcolor: 'grey.50',
          '&:hover': { bgcolor: 'grey.100' },
        }}
      >
        <CaretCircleRightIcon
          size={14}
          style={{
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.2s',
            color: '#64748B',
          }}
        />
        <HardDriveIcon size={15} style={{ color: '#64748B' }} />
        <Typography variant="body2" sx={{ fontWeight: 700, flex: 1 }}>
          {serverName}
        </Typography>
        <Chip
          label={`${steps.length} 步`}
          size="small"
          variant="outlined"
          sx={{ height: 18, fontSize: 10 }}
        />
        {successCount > 0 && (
          <Chip
            label={`${successCount} ✓`}
            size="small"
            sx={{ height: 18, fontSize: 10, bgcolor: '#66BB6A15', color: '#2E7D32' }}
          />
        )}
        {failedCount > 0 && (
          <Chip
            label={`${failedCount} ✕`}
            size="small"
            sx={{ height: 18, fontSize: 10, bgcolor: '#EF535015', color: '#C62828' }}
          />
        )}
        {running && (
          <CircularProgress size={14} thickness={4} />
        )}
      </Box>
      <Collapse in={open}>
        <Box sx={{ p: 1.25, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {steps.map((s) => (
            <StepItem key={s.id} step={s} forceOpen={allExpanded} />
          ))}
        </Box>
      </Collapse>
    </Paper>
  );
}

// ============================================================
// StepItem
// ============================================================

function StepItem({ step, forceOpen }: { step: TaskRunStep; forceOpen?: boolean }) {
  const { t } = useTranslation('automation');
  const { notify } = useNotify();
  const [open, setOpen] = useState(
    forceOpen ?? (step.status === 'failed' && Boolean(step.stderr || step.stdout)),
  );

  // 外部全展开/全折叠
  useEffect(() => {
    if (forceOpen != null) setOpen(forceOpen);
  }, [forceOpen]);

  const color = STATUS_COLOR[step.status] ?? '#9E9E9E';
  const hasBody = Boolean(step.stdout || step.stderr);
  const failed = step.status === 'failed';
  const running = step.status === 'running';

  const copyOutput = async () => {
    const text = [step.stdout, step.stderr].filter(Boolean).join('\n');
    try {
      await writeText(text);
      notify(t('history.copied'), 'success');
    } catch {
      // 忽略
    }
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        overflow: 'hidden',
        borderLeft: failed ? `3px solid #EF5350` : undefined,
        animation: running ? 'pulse 1.5s ease-in-out infinite' : undefined,
      }}
      data-failed-step={failed || undefined}
    >
      <Box
        onClick={() => hasBody && setOpen((v) => !v)}
        sx={{
          px: 1.5,
          py: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          cursor: hasBody ? 'pointer' : 'default',
          '&:hover': hasBody ? { bgcolor: 'action.hover' } : undefined,
        }}
      >
        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
        <TerminalWindowIcon size={14} style={{ color: '#94A3B8' }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 13 }} noWrap>
              {step.step_index + 1}. {t(`stepType.${step.step_type}`, { defaultValue: step.step_type })}
              {step.attempt > 1 && (
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>
                  · {t('history.attempt', { count: step.attempt })}
                </Typography>
              )}
            </Typography>
            <Chip
              label={t(`stepStatus.${step.status}`, { defaultValue: step.status })}
              size="small"
              sx={{ height: 18, fontSize: 10, fontWeight: 700, color, bgcolor: `${color}15` }}
            />
            {step.duration_ms > 0 && step.status !== 'running' && (
              <Chip
                label={fmtDuration(step.duration_ms)}
                size="small"
                variant="outlined"
                sx={{ height: 18, fontSize: 10 }}
              />
            )}
            {step.assertion_passed != null && (
              <Chip
                label={step.assertion_passed ? t('history.assertionPassed') : t('history.assertionFailed')}
                size="small"
                sx={{
                  height: 18,
                  fontSize: 10,
                  fontWeight: 700,
                  color: step.assertion_passed ? '#66BB6A' : '#EF5350',
                }}
              />
            )}
          </Box>
          {step.command_rendered && (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', fontSize: 11, mt: 0.25 }}>
              {stripServerPrefix(step.command_rendered)}
            </Typography>
          )}
        </Box>
        {hasBody && (
          <Tooltip title={open ? t('history.collapse') : t('history.expand')}>
            <CaretDownIcon
              size={14}
              style={{
                color: '#94A3B8',
                transform: open ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s',
              }}
            />
          </Tooltip>
        )}
      </Box>
      <Collapse in={open}>
        <Box sx={{ px: 1.5, pb: 1.25, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button size="small" variant="text" startIcon={<CopyIcon size={12} />} onClick={copyOutput} sx={{ fontSize: 10, py: 0 }}>
              {t('history.copyOutput')}
            </Button>
          </Box>
          {step.stdout && <OutBlock label={t('history.stdout')} text={step.stdout} />}
          {step.stderr && <OutBlock label={t('history.stderr')} text={step.stderr} isError />}
          {step.exit_code != null && (
            <Typography variant="caption" color="text.secondary">
              {t('history.exitCode')}: {step.exit_code}
            </Typography>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}

// ============================================================
// OutBlock
// ============================================================

const TRUNCATE_THRESHOLD = 6000;

function OutBlock({ label, text, isError }: { label: string; text: string; isError?: boolean }) {
  const { t } = useTranslation('automation');
  const [expanded, setExpanded] = useState(false);
  const mono = `ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace`;
  const isLong = text.length > TRUNCATE_THRESHOLD;
  const displayText = isLong && !expanded ? text.slice(0, TRUNCATE_THRESHOLD) + '…' : text;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.25 }}>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        {isLong && (
          <Button size="small" variant="text" onClick={() => setExpanded((v) => !v)} sx={{ fontSize: 10, py: 0, minWidth: 0 }}>
            {expanded ? t('history.collapseOutput') : t('history.viewAllOutput')}
          </Button>
        )}
      </Box>
      <Box
        component="pre"
        sx={{
          maxHeight: expanded ? 600 : 320,
          overflow: 'auto',
          p: 1.25,
          borderRadius: 1,
          bgcolor: isError ? '#FEF2F2' : '#0F172A',
          color: isError ? '#991B1B' : '#E2E8F0',
          fontSize: 12,
          lineHeight: 1.5,
          fontFamily: mono,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          m: 0,
          transition: 'max-height 0.2s',
        }}
      >
        {displayText}
      </Box>
    </Box>
  );
}

// ============================================================
// 工具函数
// ============================================================

function fmtDuration(ms: number) {
  if (ms >= 3600_000) return `${Math.floor(ms / 3600_000)}h ${Math.floor((ms % 3600_000) / 60_000)}m`;
  if (ms >= 60_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function fmtTime(ms: number) {
  const d = new Date(ms);
  return d.toLocaleString();
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s 前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo} 个月前`;
  return `${Math.floor(mo / 12)} 年前`;
}

function stripServerPrefix(cmd: string): string {
  const m = cmd.match(/^\[.+?\]\s*(.*)$/);
  return m ? m[1] : cmd;
}

export { fmtDuration };
