import { useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Menu from '@mui/material/Menu';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Alert from '@mui/material/Alert';
import IconButton from '@mui/material/IconButton';
import Autocomplete from '@mui/material/Autocomplete';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import { useTranslation } from 'react-i18next';
import {
  PlusIcon,
  TrashIcon,
  PencilSimpleIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  TerminalWindowIcon,
  ArrowsLeftRightIcon,
  HourglassIcon,
  CpuIcon,
  PlayIcon,
  RocketLaunchIcon,
  CopyIcon,
  CaretDownIcon,
  GlobeIcon,
} from '@phosphor-icons/react';
import type {
  AutomationTask,
  StepConditionValue,
  StepTypeValue,
  TaskStep,
  RetryConfig,
} from '../../proto/automation';
import type { ConnectionConfig } from '../../proto/connection';
import type { SiteSummary } from '../../proto/cms';
import type { OpsScript } from '../../proto/ops';

const STEP_TYPES: StepTypeValue[] = ['remote_exec', 'local_shell', 'sftp_transfer', 'delay', 'deploy', 'http'];
const CONDITIONS: (StepConditionValue | '')[] = ['', 'on_success', 'on_fail', 'always'];

const STEP_TYPE_ICON: Record<string, React.ElementType> = {
  remote_exec: TerminalWindowIcon,
  local_shell: TerminalWindowIcon,
  sftp_transfer: ArrowsLeftRightIcon,
  delay: HourglassIcon,
  local_build: CpuIcon,
  deploy: RocketLaunchIcon,
  http: GlobeIcon,
};

interface TaskEditorProps {
  open: boolean;
  task: AutomationTask | null;
  connections: ConnectionConfig[];
  sites: SiteSummary[];
  scripts: OpsScript[];
  onClose: () => void;
  onSaved: (task: AutomationTask) => void;
}

interface StepLike {
  name: string;
  type: StepTypeValue;
  condition?: StepConditionValue | '' | null;
  command?: string | null;
  localPath?: string | null;
  remotePath?: string | null;
  direction?: string | null;
  seconds?: number | null;
  siteId?: string | null;
  httpUrl?: string | null;
  httpMethod?: string | null;
  httpBody?: string | null;
  httpHeaders?: string | null;
  expectStatusCode?: number | null;
}

function newStepId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `step_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function newStep(type: StepTypeValue): TaskStep {
  return {
    id: newStepId(),
    name: typeToDefaultName(type),
    type,
    continueOnFail: false,
  };
}

function typeToDefaultName(type: StepTypeValue): string {
  switch (type) {
    case 'remote_exec':
      return '远程命令';
    case 'local_shell':
      return '本地命令';
    case 'sftp_transfer':
      return '上传文件';
    case 'delay':
      return '等待';
    case 'deploy':
      return '部署站点';
    default:
      return '步骤';
  }
}

function fmtStepSummary(step: TaskStep): string {
  switch (step.type) {
    case 'remote_exec':
    case 'local_shell':
      return step.command ?? '';
    case 'sftp_transfer':
      return `${step.direction ?? 'upload'} ${step.localPath ?? '?'} → ${step.remotePath ?? '?'}`;
    case 'delay':
      return `sleep ${step.seconds ?? 0}s`;
    case 'deploy':
      return `部署站点 ${step.siteId ?? ''}`;
    default:
      return '';
  }
}

export function TaskEditor({ open, task, connections, sites, scripts, onClose, onSaved }: TaskEditorProps) {
  const { t } = useTranslation('automation');
  const isNew = !task || task.id == null || task.id === '';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [connectionIds, setConnectionIds] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [notify, setNotify] = useState(false);
  const [runOnStartup, setRunOnStartup] = useState(false);
  const [steps, setSteps] = useState<TaskStep[]>([]);
  const [editingStep, setEditingStep] = useState<TaskStep | null>(null);
  const [scriptPickerOpen, setScriptPickerOpen] = useState(false);
  const [scriptSearch, setScriptSearch] = useState('');
  const [error, setError] = useState('');
  // 周期调度（保证工作连续性）
  const [scheduleKind, setScheduleKind] = useState<string>('off');
  const [scheduleIntervalSecs, setScheduleIntervalSecs] = useState<number>(3600);
  const [scheduleAtMinute, setScheduleAtMinute] = useState<number>(0);

  useEffect(() => {
    if (!open) return;
    if (task) {
      setName(task.name);
      setDescription(task.description);
      setConnectionIds(task.connection_ids ?? []);
      setEnabled(task.enabled ?? true);
      setNotify(task.notify ?? false);
      setRunOnStartup(task.run_on_startup ?? false);
      setSteps(task.steps ?? []);
      setScheduleKind(task.schedule_kind ?? 'off');
      setScheduleIntervalSecs(task.schedule_interval_secs ?? 3600);
      setScheduleAtMinute(task.schedule_at_minute ?? 0);
    } else {
      setName('');
      setDescription('');
      setConnectionIds([]);
      setEnabled(true);
      setNotify(false);
      setRunOnStartup(false);
      setSteps([]);
      setScheduleKind('off');
      setScheduleIntervalSecs(3600);
      setScheduleAtMinute(0);
    }
    setEditingStep(null);
    setError('');
  }, [open, task]);

  const stepOrder = useMemo(
    () => steps.map((_, i) => i),
    [steps],
  );

  const selectedConnections = useMemo(
    () => connections.filter((c) => connectionIds.includes(c.id)),
    [connections, connectionIds],
  );

  const submit = () => {
    if (!name.trim()) return setError(t('requireName'));
    if (connectionIds.length === 0) return setError(t('requireConnection'));
    if (steps.length === 0) return setError(t('requireStep'));
    const now = Date.now();
    const payload: AutomationTask = {
      id: task?.id ?? '',
      name: name.trim(),
      description: description.trim(),
      connection_ids: connectionIds,
      steps,
      notify,
      run_on_startup: runOnStartup,
      enabled,
      last_run_at: task?.last_run_at ?? null,
      created_at: task?.created_at ?? now,
      updated_at: now,
      schedule_kind: scheduleKind,
      schedule_interval_secs: scheduleIntervalSecs,
      schedule_at_minute: scheduleAtMinute,
    };
    onSaved(payload);
  };

  const move = (from: number, dir: -1 | 1) => {
    const to = from + dir;
    if (to < 0 || to >= steps.length) return;
    setSteps((s) => {
      const next = [...s];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  };

  // 从模板快速添加步骤
  const [addMenuAnchor, setAddMenuAnchor] = useState<null | HTMLElement>(null);
  const openAddMenu = (e: React.MouseEvent<HTMLElement>) => setAddMenuAnchor(e.currentTarget);
  const closeAddMenu = () => setAddMenuAnchor(null);

  const addStepFromTemplate = (type: StepTypeValue, template?: Partial<TaskStep>) => {
    const step = newStep(type);
    if (template) {
      Object.assign(step, template, { id: step.id });
    }
    setEditingStep(step);
    closeAddMenu();
  };

  const duplicateStep = (index: number) => {
    setSteps((s) => {
      const original = s[index];
      const copy: TaskStep = { ...original, id: newStepId(), name: `${original.name} 副本` };
      const next = [...s];
      next.splice(index + 1, 0, copy);
      return next;
    });
  };

  // 从脚本库选择脚本，生成 remote_exec 步骤
  const addStepFromScript = (script: OpsScript) => {
    const step = newStep('remote_exec');
    step.name = script.name;
    step.command = script.script || '';
    step.timeoutSecs = script.timeoutSecs || 300;
    setEditingStep(step);
    setScriptPickerOpen(false);
    setScriptSearch('');
  };

  const persistStep = (step: TaskStep) => {
    setSteps((s) => {
      const idx = s.findIndex((x) => x.id === step.id);
      if (idx < 0) return [...s, step];
      const next = [...s];
      next[idx] = step;
      return next;
    });
    setEditingStep(null);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {isNew ? t('editor.newTitle') : t('editor.editTitle')}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField
              size="small"
              label={t('editor.name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <TextField
              size="small"
              label={t('editor.description')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Box>

          <Autocomplete
            multiple
            size="small"
            options={connections}
            value={selectedConnections}
            getOptionLabel={(o) => o.name}
            onChange={(_, val) => setConnectionIds(val.map((c) => c.id))}
            renderInput={(params) => (
              <TextField {...params} label={t('editor.connections')} placeholder={t('editor.connectionsHint')} />
            )}
            renderValue={(val) => (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {val.map((opt) => (
                  <Chip
                    key={opt.id}
                    size="small"
                    label={opt.name}
                    onDelete={() => setConnectionIds((ids) => ids.filter((id) => id !== opt.id))}
                    onMouseDown={(e) => e.stopPropagation()}
                  />
                ))}
              </Box>
            )}
          />

          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            <FormControlLabel
              control={<Switch size="small" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />}
              label={t('editor.enabled')}
            />
            <FormControlLabel
              control={<Switch size="small" checked={runOnStartup} onChange={(e) => setRunOnStartup(e.target.checked)} />}
              label={t('editor.runOnStartup')}
            />
            <FormControlLabel
              control={<Switch size="small" checked={notify} onChange={(e) => setNotify(e.target.checked)} />}
              label={t('editor.notify')}
            />
          </Box>

          <Divider />

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {t('editor.schedule')}
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                size="small"
                select
                label={t('editor.scheduleKind')}
                value={scheduleKind}
                onChange={(e) => setScheduleKind(e.target.value)}
              >
                <MenuItem value="off">{t('editor.scheduleOff')}</MenuItem>
                <MenuItem value="interval">{t('editor.scheduleInterval')}</MenuItem>
                <MenuItem value="daily">{t('editor.scheduleDaily')}</MenuItem>
                <MenuItem value="hourly">{t('editor.scheduleHourly')}</MenuItem>
              </TextField>
              {scheduleKind === 'interval' && (
                <TextField
                  size="small"
                  type="number"
                  label={t('editor.scheduleIntervalSecs')}
                  value={scheduleIntervalSecs}
                  onChange={(e) => setScheduleIntervalSecs(Math.max(1, Number(e.target.value) || 1))}
                  helperText={t('editor.scheduleIntervalHint')}
                />
              )}
              {scheduleKind === 'daily' && (
                <TextField
                  size="small"
                  type="number"
                  label={t('editor.scheduleDailyMinute')}
                  value={scheduleAtMinute}
                  onChange={(e) => setScheduleAtMinute(Math.max(0, Math.min(1439, Number(e.target.value) || 0)))}
                  helperText={t('editor.scheduleDailyHint')}
                />
              )}
              {scheduleKind === 'hourly' && (
                <TextField
                  size="small"
                  type="number"
                  label={t('editor.scheduleHourlyMinute')}
                  value={scheduleAtMinute}
                  onChange={(e) => setScheduleAtMinute(Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
                  helperText={t('editor.scheduleHourlyHint')}
                />
              )}
            </Box>
            {scheduleKind !== 'off' && (
              <Alert severity="info" sx={{ fontSize: 12 }}>{t('editor.scheduleHint')}</Alert>
            )}
          </Box>

          <Divider />

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {t('editor.steps')} ({steps.length})
            </Typography>
            <Button size="small" variant="contained" startIcon={<PlusIcon size={15} />} endIcon={<CaretDownIcon size={12} />} onClick={openAddMenu}>
              {t('editor.addStep')}
            </Button>
            <Menu anchorEl={addMenuAnchor} open={Boolean(addMenuAnchor)} onClose={closeAddMenu}>
              <MenuItem onClick={() => addStepFromTemplate('remote_exec')}>
                <TerminalWindowIcon size={16} style={{ marginRight: 8 }} /> 远程命令
              </MenuItem>
              <MenuItem onClick={() => addStepFromTemplate('local_shell')}>
                <TerminalWindowIcon size={16} style={{ marginRight: 8 }} /> 本地命令
              </MenuItem>
              <MenuItem onClick={() => addStepFromTemplate('sftp_transfer', { direction: 'upload', name: 'SFTP 上传文件' })}>
                <ArrowsLeftRightIcon size={16} style={{ marginRight: 8 }} /> SFTP 上传
              </MenuItem>
              <MenuItem onClick={() => addStepFromTemplate('sftp_transfer', { direction: 'download', name: 'SFTP 下载文件' })}>
                <ArrowsLeftRightIcon size={16} style={{ marginRight: 8 }} /> SFTP 下载
              </MenuItem>
              <MenuItem onClick={() => addStepFromTemplate('delay', { seconds: 5, name: '等待 5 秒' })}>
                <HourglassIcon size={16} style={{ marginRight: 8 }} /> 延时等待
              </MenuItem>
              {sites.length > 0 && (
                <MenuItem onClick={() => addStepFromTemplate('deploy', { siteId: sites[0]?.id, name: '部署站点' })}>
                  <RocketLaunchIcon size={16} style={{ marginRight: 8 }} /> 部署站点
                </MenuItem>
              )}
              <MenuItem onClick={() => addStepFromTemplate('http', { httpMethod: 'GET', name: 'HTTP 请求' })}>
                <GlobeIcon size={16} style={{ marginRight: 8 }} /> HTTP 请求
              </MenuItem>
              <Divider sx={{ my: 0.5 }} />
              <MenuItem onClick={() => { closeAddMenu(); setScriptPickerOpen(true); }}>
                <PlayIcon size={16} style={{ marginRight: 8 }} /> 从脚本库选择...
              </MenuItem>
            </Menu>
          </Box>

          {steps.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
              {t('editor.noSteps')}
            </Paper>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {steps.map((s, i) => {
                const Icon = STEP_TYPE_ICON[s.type] ?? TerminalWindowIcon;
                return (
                  <Paper key={s.id} variant="outlined" sx={{ p: 1.25, pl: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box
                      sx={{ order: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25, mr: -1 }}
                    >
                      <IconButton size="small" disabled={i === 0} onClick={() => move(i, -1)}>
                        <ArrowUpIcon size={14} />
                      </IconButton>
                      <IconButton size="small" disabled={i === stepOrder.length - 1} onClick={() => move(i, 1)}>
                        <ArrowDownIcon size={14} />
                      </IconButton>
                    </Box>
                    <Box sx={{ order: 2 }} color="text.secondary">
                      <Icon size={20} />
                    </Box>
                    <Box sx={{ order: 3, flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                          {s.name}
                        </Typography>
                        <Chip label={t(`stepType.${s.type}`)} size="small" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
                        {s.condition && (
                          <Chip label={t(`condition.${s.condition}`)} size="small" sx={{ height: 18, fontSize: 10 }} />
                        )}
                      </Box>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {fmtStepSummary(s)}
                      </Typography>
                    </Box>
                    <Box sx={{ order: 4, display: 'flex', gap: 0.5 }}>
                      <IconButton size="small" title="复制步骤" onClick={() => duplicateStep(i)}>
                        <CopyIcon size={16} />
                      </IconButton>
                      <IconButton size="small" title={t('editor.editStep')} onClick={() => setEditingStep({ ...s })}>
                        <PencilSimpleIcon size={17} />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        title={t('editor.deleteStep')}
                        onClick={() => setSteps((st) => st.filter((x) => x.id !== s.id))}
                      >
                        <TrashIcon size={17} />
                      </IconButton>
                    </Box>
                  </Paper>
                );
              })}
            </Box>
          )}

          {isNew && connections.length === 0 && (
            <Alert severity="info">{t('editor.noConnectionsHint')}</Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>{t('cancel', { ns: 'common' })}</Button>
        <Button variant="contained" startIcon={<PlayIcon size={15} />} onClick={submit}>
          {t('editor.save')}
        </Button>
      </DialogActions>

      <StepEditor
        open={Boolean(editingStep)}
        step={editingStep}
        sites={sites}
        onClose={() => setEditingStep(null)}
        onSave={persistStep}
      />

      {/* 脚本库选择对话框 */}
      <Dialog
        open={scriptPickerOpen}
        onClose={() => { setScriptPickerOpen(false); setScriptSearch(''); }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ pb: 1 }}>从脚本库选择</DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <Box sx={{ p: 1.5, pb: 1, position: 'sticky', top: 0, bgcolor: 'background.paper', zIndex: 1 }}>
            <TextField
              size="small"
              fullWidth
              placeholder="搜索脚本..."
              value={scriptSearch}
              onChange={(e) => setScriptSearch(e.target.value)}
            />
          </Box>
          <Box sx={{ maxHeight: 360, overflowY: 'auto', p: 0.5 }}>
            {scripts
              .filter((s) => !scriptSearch || s.name.includes(scriptSearch) || (s.description || '').includes(scriptSearch))
              .map((s) => (
                <Box
                  key={s.id}
                  onClick={() => addStepFromScript(s)}
                  sx={{
                    p: 1.25,
                    pl: 1.5,
                    borderRadius: 1,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <PlayIcon size={15} color="text.secondary" />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 13 }} noWrap>
                      {s.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: 11 }}>
                      {s.description || s.category}
                    </Typography>
                  </Box>
                  <Chip
                    label={s.category}
                    size="small"
                    variant="outlined"
                    sx={{ height: 16, fontSize: 9, color: 'text.secondary' }}
                  />
                </Box>
              ))}
            {scripts.filter((s) => !scriptSearch || s.name.includes(scriptSearch) || (s.description || '').includes(scriptSearch)).length === 0 && (
              <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary', fontSize: 12 }}>
                没有找到匹配的脚本
              </Box>
            )}
          </Box>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

function StepEditor({
  open,
  step,
  sites,
  onClose,
  onSave,
}: {
  open: boolean;
  step: TaskStep | null;
  sites: SiteSummary[];
  onClose: () => void;
  onSave: (step: TaskStep) => void;
}) {
  const { t } = useTranslation('automation');
  const [draft, setDraft] = useState<StepLike>({ name: '', type: 'remote_exec' });
  const [continueOnFail, setContinueOnFail] = useState(false);
  const [timeoutSecs, setTimeoutSecs] = useState('');
  const [expectStdout, setExpectStdout] = useState('');
  const [expectStderr, setExpectStderr] = useState('');
  const [expectExitCode, setExpectExitCode] = useState('');
  const [hasRetry, setHasRetry] = useState(false);
  const [maxAttempts, setMaxAttempts] = useState('3');
  const [backoffSecs, setBackoffSecs] = useState('2');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    if (step) {
      setDraft({
        name: step.name,
        type: step.type,
        condition: step.condition ?? '',
        command: step.command ?? '',
        localPath: step.localPath ?? '',
        remotePath: step.remotePath ?? '',
        direction: step.direction ?? 'upload',
        seconds: step.seconds ?? 0,
        siteId: step.siteId ?? '',
      });
      setContinueOnFail(step.continueOnFail ?? false);
      setTimeoutSecs(step.timeoutSecs != null ? String(step.timeoutSecs) : '');
      setExpectStdout(step.expectStdout ?? '');
      setExpectStderr(step.expectStderr ?? '');
      setExpectExitCode(step.expectExitCode != null ? String(step.expectExitCode) : '');
      setHasRetry(Boolean(step.retry));
      setMaxAttempts(String(step.retry?.maxAttempts ?? 3));
      setBackoffSecs(String(step.retry?.backoffSecs ?? 0));
    }
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  const set = <K extends keyof StepLike>(k: K, v: StepLike[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const retryConfig: RetryConfig | undefined = hasRetry
    ? { maxAttempts: Math.max(1, Number(maxAttempts) || 1), backoffSecs: Number(backoffSecs) || 0 }
    : undefined;

  const payload: TaskStep = {
    ...(step ?? ({} as TaskStep)),
    id: step?.id ?? newStepId(),
    name: draft.name.trim(),
    type: draft.type,
    condition: draft.condition || null,
    continueOnFail,
    retry: retryConfig ?? null,
    timeoutSecs: draft.type === 'delay' ? null : parsePositive(timeoutSecs),
    command: draft.type === 'remote_exec' || draft.type === 'local_shell' ? draft.command ?? '' : null,
    localPath: draft.type === 'sftp_transfer' ? draft.localPath ?? '' : null,
    remotePath: draft.type === 'sftp_transfer' ? draft.remotePath ?? '' : null,
    direction: draft.type === 'sftp_transfer' ? draft.direction ?? 'upload' : null,
    seconds: draft.type === 'delay' ? Math.max(1, Number(draft.seconds) || 1) : null,
    siteId: draft.type === 'deploy' ? draft.siteId ?? '' : null,
    httpUrl: draft.type === 'http' ? draft.httpUrl ?? '' : null,
    httpMethod: draft.type === 'http' ? draft.httpMethod || 'GET' : null,
    httpBody: draft.type === 'http' ? (draft.httpBody ?? '') : null,
    httpHeaders: draft.type === 'http' ? (draft.httpHeaders ?? '') : null,
    expectStatusCode: draft.type === 'http' && (draft.expectStatusCode ?? 0) > 0 ? draft.expectStatusCode : null,
    expectStdout: expectStdout || null,
    expectStderr: expectStderr || null,
    expectExitCode: expectExitCode !== '' && !Number.isNaN(Number(expectExitCode)) ? Number(expectExitCode) : null,
  };

  const submit = () => {
    if (!payload.name) return setError(t('editor.requireStepName'));
    if ((payload.type === 'remote_exec' || payload.type === 'local_shell') && !payload.command) {
      return setError(t('editor.requireCommand'));
    }
    if (payload.type === 'sftp_transfer') {
      if (!payload.localPath || !payload.remotePath) return setError(t('editor.requirePaths'));
    }
    if (payload.type === 'delay' && (!payload.seconds || payload.seconds <= 0)) {
      return setError(t('editor.requireDelay'));
    }
    if (payload.type === 'deploy' && !payload.siteId) {
      return setError(t('editor.requireSite'));
    }
    if (payload.type === 'http' && !payload.httpUrl) {
      return setError('请填写请求 URL');
    }
    onSave(payload);
  };

  const isShell = draft.type === 'remote_exec' || draft.type === 'local_shell';

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>{t('editor.stepTitle')}</Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
            <TextField
              size="small"
              label={t('editor.stepType')}
              select
              value={draft.type}
              onChange={(e) => {
                const t0 = e.target.value as StepTypeValue;
                set('type', t0);
                if (!draft.name) set('name', typeToDefaultName(t0));
              }}
            >
              {STEP_TYPES.map((tp) => (
                <MenuItem key={tp} value={tp}>{t(`stepType.${tp}`)}</MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              label={t('editor.stepName')}
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
            />
            <TextField
              size="small"
              label={t('editor.condition')}
              select
              value={draft.condition ?? ''}
              onChange={(e) => set('condition', (e.target.value || null) as StepConditionValue | null)}
            >
              {CONDITIONS.map((c) => (
                <MenuItem key={c || 'none'} value={c}>{t(c ? `condition.${c}` : 'condition.none')}</MenuItem>
              ))}
            </TextField>
          </Box>

          {isShell && (
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontSize: 11 }}>
                {t('editor.command')}
              </Typography>
              <Box
                sx={{
                  display: 'flex',
                  borderRadius: 1,
                  border: 1,
                  borderColor: 'divider',
                  bgcolor: '#1e1e1e',
                  overflow: 'hidden',
                  '&:focus-within': { borderColor: 'primary.main', boxShadow: 1 },
                }}
              >
                {/* 行号 */}
                <Box
                  sx={{
                    width: 36,
                    flexShrink: 0,
                    py: 1,
                    pr: 0.5,
                    textAlign: 'right',
                    fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
                    fontSize: 12,
                    lineHeight: 1.6,
                    color: '#6a6a6a',
                    bgcolor: '#252526',
                    userSelect: 'none',
                    overflow: 'hidden',
                    borderRight: '1px solid #2d2d2d',
                  }}
                >
                  {Array.from({ length: Math.max((draft.command ?? '').split('\n').length, 2) }, (_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </Box>
                <textarea
                  value={draft.command ?? ''}
                  onChange={(e) => set('command', e.target.value)}
                  placeholder={t('editor.commandHint')}
                  spellCheck={false}
                  rows={Math.min(Math.max((draft.command ?? '').split('\n').length, 2), 12)}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    color: '#d4d4d4',
                    border: 'none',
                    outline: 'none',
                    padding: '6px 10px',
                    fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
                    fontSize: 12,
                    lineHeight: 1.6,
                    resize: 'vertical',
                    whiteSpace: 'pre',
                    overflow: 'auto',
                    minHeight: 48,
                  }}
                />
              </Box>
            </Box>
          )}

          {draft.type === 'sftp_transfer' && (
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
              <TextField
                size="small"
                label={t('editor.direction')}
                select
                value={draft.direction ?? 'upload'}
                onChange={(e) => set('direction', e.target.value)}
              >
                <MenuItem value="upload">{t('stepType.directionUpload')}</MenuItem>
                <MenuItem value="download">{t('stepType.directionDownload')}</MenuItem>
              </TextField>
              <TextField
                size="small"
                label={t('editor.localPath')}
                value={draft.localPath ?? ''}
                onChange={(e) => set('localPath', e.target.value)}
              />
              <TextField
                size="small"
                label={t('editor.remotePath')}
                value={draft.remotePath ?? ''}
                onChange={(e) => set('remotePath', e.target.value)}
              />
            </Box>
          )}

          {draft.type === 'delay' && (
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 2 }}>
              <TextField
                size="small"
                type="number"
                label={t('editor.delaySeconds')}
                value={draft.seconds ?? ''}
                onChange={(e) => set('seconds', Number(e.target.value))}
              />
            </Box>
          )}

          {draft.type === 'deploy' && (
            <>
              <Autocomplete
                size="small"
                options={sites}
                value={sites.find((s) => s.id === (draft.siteId ?? '')) ?? null}
                getOptionLabel={(o) => o.name}
                onChange={(_, val) => set('siteId', val ? val.id : '')}
                renderInput={(params) => (
                  <TextField {...params} label={t('editor.site')} placeholder={t('editor.siteHint')} />
                )}
                renderOption={(props, opt) => (
                  <li {...props} key={opt.id}>
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                      <Typography variant="body2">{opt.name}</Typography>
                      {opt.domain ? (
                        <Typography variant="caption" color="text.secondary">{opt.domain}</Typography>
                      ) : null}
                    </Box>
                  </li>
                )}
              />
              <Alert severity="info" sx={{ fontSize: 12 }}>
                {t('editor.deployHint')}
              </Alert>
            </>
          )}

          {draft.type === 'http' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 1.5 }}>
                <TextField
                  size="small"
                  select
                  label="请求方法"
                  value={draft.httpMethod || 'GET'}
                  onChange={(e) => set('httpMethod', e.target.value)}
                >
                  {['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'].map((m) => (
                    <MenuItem key={m} value={m}>{m}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  size="small"
                  label="URL"
                  value={draft.httpUrl ?? ''}
                  onChange={(e) => set('httpUrl', e.target.value)}
                  placeholder="https://example.com/api"
                />
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontSize: 11 }}>
                  请求头 (JSON 格式，可选)
                </Typography>
                <textarea
                  value={draft.httpHeaders ?? ''}
                  onChange={(e) => set('httpHeaders', e.target.value)}
                  placeholder='{"Content-Type": "application/json", "Authorization": "Bearer xxx"}'
                  spellCheck={false}
                  rows={2}
                  style={{
                    width: '100%',
                    background: '#1e1e1e',
                    color: '#d4d4d4',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 4,
                    padding: 8,
                    fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
                    fontSize: 12,
                    lineHeight: 1.5,
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontSize: 11 }}>
                  请求体 (可选)
                </Typography>
                <textarea
                  value={draft.httpBody ?? ''}
                  onChange={(e) => set('httpBody', e.target.value)}
                  placeholder='{"key": "value"}'
                  spellCheck={false}
                  rows={3}
                  style={{
                    width: '100%',
                    background: '#1e1e1e',
                    color: '#d4d4d4',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 4,
                    padding: 8,
                    fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
                    fontSize: 12,
                    lineHeight: 1.5,
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
              </Box>
              <TextField
                size="small"
                type="number"
                label="期望状态码 (0=2xx/3xx 均视为成功)"
                value={draft.expectStatusCode ?? 0}
                onChange={(e) => set('expectStatusCode', parseInt(e.target.value) || 0)}
              />
            </Box>
          )}

          <Divider />

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {isShell && (
              <TextField
                size="small"
                type="number"
                label={t('editor.timeoutSecs')}
                value={timeoutSecs}
                onChange={(e) => setTimeoutSecs(e.target.value)}
              />
            )}
            <FormControlLabel
              control={<Switch size="small" checked={continueOnFail} onChange={(e) => setContinueOnFail(e.target.checked)} />}
              label={t('editor.continueOnFail')}
            />
            <FormControlLabel
              control={<Switch size="small" checked={hasRetry} onChange={(e) => setHasRetry(e.target.checked)} />}
              label={t('editor.retry')}
            />
          </Box>

          {hasRetry && (
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                size="small"
                type="number"
                label={t('editor.maxAttempts')}
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(e.target.value)}
              />
              <TextField
                size="small"
                type="number"
                label={t('editor.backoffSecs')}
                value={backoffSecs}
                onChange={(e) => setBackoffSecs(e.target.value)}
              />
            </Box>
          )}

          {isShell && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Typography variant="overline" color="text.secondary" sx={{ mb: -0.5 }}>
                {t('editor.assertions')}
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
                <TextField
                  size="small"
                  label={t('editor.expectStdout')}
                  value={expectStdout}
                  onChange={(e) => setExpectStdout(e.target.value)}
                />
                <TextField
                  size="small"
                  label={t('editor.expectStderr')}
                  value={expectStderr}
                  onChange={(e) => setExpectStderr(e.target.value)}
                />
                <TextField
                  size="small"
                  type="number"
                  label={t('editor.expectExitCode')}
                  value={expectExitCode}
                  onChange={(e) => setExpectExitCode(e.target.value)}
                />
              </Box>
            </Box>
          )}

          <Alert severity="info" sx={{ fontSize: 12 }}>
            {t('editor.conditionHint')}
          </Alert>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>{t('cancel', { ns: 'common' })}</Button>
        <Button variant="contained" onClick={submit}>{t('editor.confirm')}</Button>
      </DialogActions>
    </Dialog>
  );
}

function parsePositive(v: string): number | null {
  if (v === '' || Number.isNaN(Number(v))) return null;
  const n = Number(v);
  return n > 0 ? n : null;
}