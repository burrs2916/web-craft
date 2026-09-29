import { useCallback, useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import {
  SparkleIcon,
  PlusIcon,
  MonitorIcon,
  RocketIcon,
  ListChecksIcon,
  TrayIcon,
  ListMagnifyingGlassIcon,
  TerminalWindowIcon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { OpsScript, RemoteExecResult } from '../../../proto/ops';
import { opsListScripts, opsRunScript, opsDeleteScript, opsToggleScript } from '../../../core/services/ops.service';
import { automationListTasks } from '../../../core/services/automation.service';
import { listSites } from '../../../core/services/cms.service';
import type { SshConnectionInfo } from '../../../proto/connection';
import type { SiteSummary } from '../../../proto/cms';
import type { PtyConfig } from '../../../proto/terminal';
import type { AutomationTask } from '../../../proto/automation';
import type { EnvCheckResult } from '../../../proto/env-check';
import { spawnTerminal } from '../../../core/services/terminal.service';
import { ensureOpsAssistantAgent, ensureEnvFixAgent, appendEnvOpsLog } from '../../../core/services/agent.service';
import { openAiCopilotWindow } from '../../../core/services/window.service';
import { listen } from '@tauri-apps/api/event';
import { ScriptEditorDialog } from '../ScriptEditorDialog';
import { TaskListPanel } from '../../automation/TaskListPanel';
import { RunHistory } from '../../automation/RunHistory';
import { ScriptRunHistory } from '../ScriptRunHistory';
import EnvCheckPanel from '../EnvCheckPanel';
import { DeployPanel } from '../DeployPanel';
import FileOpsPanel from '../FileOpsPanel';
import { FlowSteps } from './FlowSteps';
import { ScriptsTab } from './ScriptsTab';
import { ScriptRunDialog } from './ScriptRunDialog';
import { DeleteScriptDialog } from './DeleteScriptDialog';
import type { CategoryKey, OpsTab } from './constants';
import type { SiteOpsPanelProps } from './types';

export type { SiteOpsPanelProps } from './types';

export function SiteOpsPanel({ connectionId, connections, siteName, domain, remotePath, initialTab }: SiteOpsPanelProps) {
  const { t, i18n } = useTranslation('ops');

  const [tab, setTab] = useState<OpsTab>(initialTab || 'env');
  const [autoOpenDeploy, setAutoOpenDeploy] = useState(false);
  const [category, setCategory] = useState<CategoryKey>('all');
  const [scripts, setScripts] = useState<OpsScript[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [aiAssistantLoading, setAiAssistantLoading] = useState(false);
  // 文件运维面板中的子视图：false=文件运维, true=脚本库
  const [showScriptLibrary, setShowScriptLibrary] = useState(false);

  // 环境检测状态
  const [envResult, setEnvResult] = useState<EnvCheckResult | null>(null);
  const [envLoading, setEnvLoading] = useState(false);
  const [envError, setEnvError] = useState('');
  const [envCheckedAt, setEnvCheckedAt] = useState<number | null>(null);
  // 修复前的检测结果（用于对比展示）
  const [preFixEnvResult, setPreFixEnvResult] = useState<EnvCheckResult | null>(null);

  const [active, setActive] = useState<OpsScript | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RemoteExecResult | null>(null);

  const [editing, setEditing] = useState<{ open: boolean; script: OpsScript | null }>({ open: false, script: null });
  const [deleting, setDeleting] = useState<OpsScript | null>(null);
  const [opErr, setOpErr] = useState('');

  // 历史记录状态
  const [historyTaskId, setHistoryTaskId] = useState<string>('');
  const [historyKind, setHistoryKind] = useState<'tasks' | 'scripts'>('tasks');
  const [historyTasks, setHistoryTasks] = useState<AutomationTask[]>([]);

  // 站点列表（供自动化「部署站点」步骤选择目标站点）
  const [sites, setSites] = useState<SiteSummary[]>([]);
  useEffect(() => {
    let alive = true;
    void listSites()
      .then((list) => { if (alive) setSites(list); })
      .catch(() => { /* 站点列表不可用不影响其余功能 */ });
    return () => { alive = false; };
  }, []);

  const activeConn = useMemo(
    () => connections.find((c) => c.id === connectionId),
    [connections, connectionId],
  );

  // 从连接配置解析 SSH 信息，用于 AI 运维助手创建终端会话。
  const sshInfo = useMemo<SshConnectionInfo | null>(() => {
    if (!activeConn) return null;
    try {
      return JSON.parse(activeConn.config_json);
    } catch {
      return null;
    }
  }, [activeConn]);

  // 打开 AI 运维助手：建 SSH 终端会话 → 播种运维助手 Agent → 打开独立 AI 窗口。
  const handleOpenAiAssistant = useCallback(async () => {
    if (!sshInfo || aiAssistantLoading) return;
    const runId = `ops-assistant-${Date.now()}`;
    void appendEnvOpsLog('INFO', runId, 'ops_assistant', 'start',
      `host=${sshInfo.host} user=${sshInfo.username}`);
    setAiAssistantLoading(true);
    try {
      const sessionId = `ops-assistant-${Date.now()}`;
      const config: PtyConfig = { rows: 24, cols: 80, connection_type: 'ssh', ssh: sshInfo };
      await spawnTerminal(sessionId, config);
      void appendEnvOpsLog('INFO', runId, 'ops_assistant', 'terminal_spawned', `sessionId=${sessionId}`);
      const agentId = await ensureOpsAssistantAgent(undefined, i18n.language || 'zh-CN');
      void appendEnvOpsLog('INFO', runId, 'ops_assistant', 'agent_ready', `agentId=${agentId}`);
      await openAiCopilotWindow({
        scene: 'ops',
        agentId,
        sessionId,
        host: sshInfo.host,
        username: sshInfo.username,
        siteName: siteName,
        remotePath: remotePath || undefined,
      });
      void appendEnvOpsLog('INFO', runId, 'ops_assistant', 'window_opened', '');
    } catch (e) {
      void appendEnvOpsLog('ERROR', runId, 'ops_assistant', 'failed', String(e));
      setError(String(e));
    } finally {
      setAiAssistantLoading(false);
    }
  }, [sshInfo, aiAssistantLoading, siteName, remotePath, i18n.language]);

  // 打开 AI 环境修复助手：建 SSH 终端会话 → 播种修复 Agent → 打开独立 AI 窗口（带检测报告）。
  const handleAiEnvFix = useCallback(async () => {
    if (!sshInfo || !envResult) return;
    const runId = `env-fix-${Date.now()}`;
    void appendEnvOpsLog('INFO', runId, 'env_fix', 'start',
      `host=${sshInfo.host} user=${sshInfo.username} score=${envResult.summary.score} failed=${envResult.summary.failed} warning=${envResult.summary.warning}`);
    try {
      // 保存修复前的检测结果，用于后续对比
      setPreFixEnvResult(envResult);
      const sessionId = `env-fix-${Date.now()}`;
      const config: PtyConfig = { rows: 24, cols: 80, connection_type: 'ssh', ssh: sshInfo };
      await spawnTerminal(sessionId, config);
      void appendEnvOpsLog('INFO', runId, 'env_fix', 'terminal_spawned', `sessionId=${sessionId}`);
      const agentId = await ensureEnvFixAgent(undefined, i18n.language || 'zh-CN');
      void appendEnvOpsLog('INFO', runId, 'env_fix', 'agent_ready', `agentId=${agentId}`);
      const checkReportJson = JSON.stringify(envResult);
      void appendEnvOpsLog('INFO', runId, 'env_fix', 'report_size', `bytes=${checkReportJson.length}`);
      await openAiCopilotWindow({
        scene: 'envFix',
        agentId,
        sessionId,
        host: sshInfo.host,
        username: sshInfo.username,
        siteName: siteName,
        remotePath: remotePath || undefined,
        domain: domain || undefined,
        checkReport: checkReportJson,
      });
      void appendEnvOpsLog('INFO', runId, 'env_fix', 'window_opened', '');
    } catch (e) {
      void appendEnvOpsLog('ERROR', runId, 'env_fix', 'failed', String(e));
      setEnvError(String(e));
    }
    }, [sshInfo, envResult, siteName, remotePath, domain, i18n.language]);

  const refreshScripts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await opsListScripts(category === 'all' ? undefined : category);
      setScripts(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [category]);

  // 环境检测
  const runEnvCheck = useCallback(async () => {
    if (!connectionId) return;
    const runId = `env-check-${Date.now()}`;
    void appendEnvOpsLog('INFO', runId, 'env_check', 'start',
      `connectionId=${connectionId} domain=${domain || siteName || ''} deploy_path=${remotePath || ''}`);
    setEnvLoading(true);
    setEnvError('');
    try {
      const params: Record<string, string> = {
        domain: domain || siteName || '',
        deploy_path: remotePath || '',
      };
      const result = await opsRunScript('ops-web-env-check', params, connectionId);
      void appendEnvOpsLog('INFO', runId, 'env_check', 'script_done',
        `success=${result.success} exitCode=${result.exitCode} stdout_len=${result.stdout.length} stderr_len=${result.stderr.length}`);
      if (!result.success) {
        void appendEnvOpsLog('ERROR', runId, 'env_check', 'script_failed',
          `stderr=${result.stderr.slice(0, 300)}`);
        throw new Error(result.stderr || result.stdout || '检测失败');
      }
      // 从 stdout 解析 JSON
      const stdout = result.stdout.trim();
      // 找到第一个 { 和最后一个 } 之间的内容
      const firstBrace = stdout.indexOf('{');
      const lastBrace = stdout.lastIndexOf('}');
      if (firstBrace === -1 || lastBrace === -1) {
        void appendEnvOpsLog('ERROR', runId, 'env_check', 'parse_failed',
          `no JSON found in stdout, preview=${stdout.slice(0, 200)}`);
        throw new Error('无法解析检测结果');
      }
      const jsonStr = stdout.slice(firstBrace, lastBrace + 1);
      const data = JSON.parse(jsonStr) as EnvCheckResult;
      void appendEnvOpsLog('INFO', runId, 'env_check', 'parse_ok',
        `score=${data.summary.score} passed=${data.summary.passed} warning=${data.summary.warning} failed=${data.summary.failed} info=${data.summary.info} groups=${data.groups.length}`);
      setEnvResult(data);
      setEnvCheckedAt(Date.now());
    } catch (e) {
      void appendEnvOpsLog('ERROR', runId, 'env_check', 'error', String(e));
      setEnvError(String(e));
      setEnvResult(null);
    } finally {
      setEnvLoading(false);
    }
  }, [connectionId, domain, siteName, remotePath]);

  // 切换到环境检测 Tab 且有连接时，自动触发检测（仅首次）
  useEffect(() => {
    if (tab === 'env' && connectionId && !envResult && !envLoading && !envError) {
      void appendEnvOpsLog('INFO', `auto-${Date.now()}`, 'env_check', 'auto_trigger',
        `connectionId=${connectionId} reason=tab_switch`);
      void runEnvCheck();
    }
  }, [tab, connectionId, envResult, envLoading, envError, runEnvCheck]);

  useEffect(() => {
    if (tab === 'scripts') void refreshScripts();
    // 离开脚本 tab 时重置到文件运维视图
    if (tab !== 'scripts') setShowScriptLibrary(false);
  }, [refreshScripts, tab]);

  // 历史记录 tab 加载任务列表（用于筛选下拉框）
  useEffect(() => {
    if (tab === 'history' && historyKind === 'tasks') {
      void automationListTasks().then(setHistoryTasks).catch(() => {});
    }
  }, [tab, historyKind]);

  // 监听环境修复完成事件，自动刷新检测结果
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      unlisten = await listen('env-fix-completed', () => {
        void appendEnvOpsLog('INFO', `fix-done-${Date.now()}`, 'env_check', 'fix_completed_refresh',
          `connectionId=${connectionId} tab=${tab}`);
        if (connectionId && tab === 'env') {
          void runEnvCheck();
        }
      });
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [connectionId, tab, runEnvCheck]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleting) return;
    setOpErr('');
    try {
      await opsDeleteScript(deleting.id);
      setDeleting(null);
      void refreshScripts();
    } catch (e) {
      setOpErr(String(e));
    }
  }, [deleting, refreshScripts]);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 流程步骤指示器 */}
      <FlowSteps tab={tab} onSelect={setTab} />

      {/* 顶部：Tab + 操作按钮 */}
      <Box sx={{ px: 2.5, pt: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Tabs value={tab} onChange={(_, v: OpsTab) => setTab(v)} sx={{ minHeight: 44 }}>
            <Tab icon={<MonitorIcon size={16} />} iconPosition="start" label={t('tab.envCheck')} value="env" sx={{ minHeight: 44 }} />
            <Tab icon={<RocketIcon size={16} />} iconPosition="start" label="部署管理" value="deploy" sx={{ minHeight: 44 }} />
            <Tab icon={<ListChecksIcon size={16} />} iconPosition="start" label={t('tab.scripts')} value="scripts" sx={{ minHeight: 44 }} />
            <Tab icon={<TrayIcon size={16} />} iconPosition="start" label={t('tab.tasks')} value="tasks" sx={{ minHeight: 44 }} />
            <Tab icon={<ListMagnifyingGlassIcon size={16} />} iconPosition="start" label={t('tab.history')} value="history" sx={{ minHeight: 44 }} />
          </Tabs>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', pb: 1 }}>
          <Button
            variant="contained"
            size="small"
            startIcon={aiAssistantLoading ? <CircularProgress size={14} color="inherit" /> : <SparkleIcon size={16} />}
            onClick={handleOpenAiAssistant}
            disabled={!sshInfo || aiAssistantLoading}
            sx={{
              background: 'linear-gradient(135deg, #7C3AED 0%, #2563EB 100%)',
              '&:hover': {
                background: 'linear-gradient(135deg, #6D28D9 0%, #1D4ED8 100%)',
              },
              '&.Mui-disabled': {
                background: 'rgba(124, 58, 237, 0.3)',
              },
            }}
          >
            {t('aiAssistant')}
          </Button>
          {tab === 'scripts' && (
            <Button
              variant="contained"
              size="small"
              startIcon={<PlusIcon size={16} />}
              onClick={() => setEditing({ open: true, script: null })}
            >
              {t('newScript')}
            </Button>
          )}
          {tab === 'history' && historyKind === 'tasks' && (
            <TextField
              select
              size="small"
              label={t('historyFilterTask')}
              value={historyTaskId}
              onChange={(e) => setHistoryTaskId(e.target.value)}
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="">{t('historyFilterAll')}</MenuItem>
              {historyTasks.map((x) => (
                <MenuItem key={x.id} value={x.id}>{x.name}</MenuItem>
              ))}
            </TextField>
          )}
        </Box>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', p: 2.5, display: 'flex', flexDirection: 'column' }}>
        {tab === 'env' && (
          <EnvCheckPanel
            result={envResult}
            loading={envLoading}
            error={envError}
            connectionId={connectionId}
            onRefresh={runEnvCheck}
            siteName={siteName}
            checkedAt={envCheckedAt ?? undefined}
            onAiFix={handleAiEnvFix}
            preFixResult={preFixEnvResult}
            onDeploy={() => {
              setAutoOpenDeploy(true);
              setTab('deploy');
            }}
          />
        )}

        {tab === 'deploy' && (
          <DeployPanel
            connectionId={connectionId}
            connections={connections}
            onGoToEnvCheck={() => setTab('env')}
            autoDeployFirst={autoOpenDeploy}
            onAutoOpened={() => setAutoOpenDeploy(false)}
          />
        )}

        {tab === 'scripts' && (
          showScriptLibrary ? (
            <ScriptsTab
              connections={connections}
              connectionId={connectionId}
              category={category}
              setCategory={setCategory}
              scripts={scripts}
              loading={loading}
              error={error}
              onOpenScript={(s) => { setActive(s); setResult(null); }}
              onEdit={(s) => setEditing({ open: true, script: s })}
              onToggle={(s, v) => {
                setOpErr('');
                opsToggleScript(s.id, v).then(refreshScripts).catch((e) => setOpErr(String(e)));
              }}
              onDelete={(s) => setDeleting(s)}
              opErr={opErr}
              onBack={() => setShowScriptLibrary(false)}
            />
          ) : (
            <FileOpsPanel
              connectionId={connectionId}
              siteDomain={domain}
              deployPath={remotePath || '/opt/webcraft'}
              onOpenScripts={() => setShowScriptLibrary(true)}
            />
          )
        )}

        {tab === 'tasks' && (
          <TaskListPanel
            connections={connections}
            sites={sites}
            scripts={scripts}
            onViewHistory={(taskId) => {
              setHistoryTaskId(taskId);
              setTab('history');
            }}
          />
        )}

        {tab === 'history' && (
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <Tabs value={historyKind} onChange={(_, v: 'tasks' | 'scripts') => setHistoryKind(v)} sx={{ minHeight: 44 }}>
              <Tab icon={<ListChecksIcon size={15} />} iconPosition="start" label={t('history.tabTasks')} value="tasks" sx={{ minHeight: 44 }} />
              <Tab icon={<TerminalWindowIcon size={15} />} iconPosition="start" label={t('history.tabScripts')} value="scripts" sx={{ minHeight: 44 }} />
            </Tabs>
            <Box sx={{ flex: 1, minHeight: 0, mt: 1.5 }}>
              {historyKind === 'tasks' ? (
                <RunHistory
                  key={historyTaskId}
                  taskId={historyTaskId || undefined}
                  tasks={historyTasks}
                  connections={connections}
                  onGoToTask={(taskId) => {
                    setHistoryTaskId(taskId);
                    setTab('tasks');
                  }}
                />
              ) : (
                <ScriptRunHistory />
              )}
            </Box>
          </Box>
        )}
      </Box>

      {/* 脚本相关弹窗 */}
      <ScriptRunDialog
        open={Boolean(active)}
        script={active}
        loading={Boolean(active) && running}
        result={result}
        host={activeConn?.name ?? ''}
        onClose={() => { if (!running) setActive(null); }}
        onRun={async (paramValues) => {
          if (!active) return;
          setRunning(true);
          setResult(null);
          try {
            setResult(await opsRunScript(active.id, paramValues, connectionId));
          } catch (e) {
            setResult({
              success: false,
              exitCode: -1,
              stdout: '',
              stderr: String(e),
              merged: false,
              durationMs: 0,
              channel: 'error',
              truncated: false,
            });
          } finally {
            setRunning(false);
          }
        }}
      />
      <ScriptEditorDialog
        open={editing.open}
        script={editing.script}
        onClose={() => setEditing({ open: false, script: null })}
        onSaved={() => {
          setEditing({ open: false, script: null });
          void refreshScripts();
        }}
      />
      <DeleteScriptDialog
        script={deleting}
        error={opErr}
        onClose={() => setDeleting(null)}
        onConfirm={handleDeleteConfirm}
      />
    </Box>
  );
}