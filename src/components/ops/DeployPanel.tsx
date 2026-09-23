import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SxProps } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import IconButton from '@mui/material/IconButton';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Divider from '@mui/material/Divider';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TablePagination from '@mui/material/TablePagination';
import Tooltip from '@mui/material/Tooltip';
import LinearProgress from '@mui/material/LinearProgress';
import TextField from '@mui/material/TextField';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import {
  RocketIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ArrowCounterClockwiseIcon,
  StopIcon,
  PlayIcon,
  InfoIcon,
  FolderOpenIcon,
  ArrowsClockwiseIcon,
  EyeIcon,
  HardDriveIcon,
  UploadIcon,
  WarningCircleIcon,
  ListChecksIcon,
  PencilIcon,
  CheckIcon,
  TrashIcon,
  DotsThreeVerticalIcon,
} from '@phosphor-icons/react';
import type { Deployment, DeploymentStep, ServiceStatus, DeploymentStats, DeployStep, DeployOutcome, DeployProgress } from '../../proto/cms';
import {
  listDeploymentsByConnection,
  getServiceStatus,
  restartService,
  stopService,
  startService,
  rollbackDeployment,
  getDeployment,
  listSites,
  deploySite,
  onDeployProgress,
  updateSite,
  deploymentStats,
  listSiteDomains,
  deleteDeployment,
  batchDeleteDeployments,
  cleanupDeployments,
  deleteDeploymentsByStatus,
} from '../../core/services/cms.service';
import { opsRunScript } from '../../core/services/ops.service';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { Site, SiteDomain } from '../../proto/cms';
import type { ConnectionConfig, SshConnectionInfo } from '../../proto';
import type { EnvCheckResult } from '../../proto/env-check';
import { openSftpWindow } from '../../core/services/window.service';

// 静态部署步骤（路线B：上传 dist/ 静态文件 → Nginx 提供服务 → HTTP 可达验证）；部署流程唯一模式。
const BINARY_DEPLOY_STEPS: { key: DeployStep; label: string }[] = [
  { key: 'validate', label: '校验配置' },
  { key: 'precheck', label: '环境检测' },
  { key: 'config', label: '生成配置' },
  { key: 'upload', label: '上传静态文件' },
  { key: 'switch', label: '蓝绿切换' },
  { key: 'nginx', label: '配置 Nginx' },
  { key: 'verify', label: 'HTTP 可达检查' },
  { key: 'cleanup', label: '清理旧版本' },
  { key: 'done', label: '部署完成' },
];

const STATUS_COLOR: Record<string, string> = {
  success: '#66BB6A',
  failed: '#EF5350',
  running: '#42A5F5',
  pending: '#FFA726',
};

const STATUS_LABEL: Record<string, string> = {
  success: '成功',
  failed: '失败',
  running: '进行中',
  pending: '等待中',
};

/** 部署完成系统通知（Tauri 原生通知，动态 import 避免 web 环境报错） */
async function fireDeployNotification(title: string, body: string, _type: 'success' | 'error'): Promise<void> {
  try {
    const mod = await import('@tauri-apps/plugin-notification');
    let granted = false;
    try {
      granted = await mod.isPermissionGranted();
    } catch {
      granted = false;
    }
    if (!granted) {
      try {
        const perm = await mod.requestPermission();
        granted = perm === 'granted';
      } catch {
        granted = false;
      }
    }
    if (granted) {
      mod.sendNotification({ title, body });
    }
  } catch {
    /* not in Tauri context, ignore */
  }
}

const MODE_LABEL: Record<string, string> = {
  simple: '精简版',
  full: '完整版',
};

const TRIGGER_LABEL: Record<string, string> = {
  manual: '手动部署',
  scheduled: '定时任务',
  rollback: '回滚操作',
};

interface DeployPanelProps {
  connectionId: string;
  /** 当前运维中心所有连接（用于「打开服务器终端」解析 SSH 信息） */
  connections?: ConnectionConfig[];
  /** 点击「去环境检测修复」时回调 */
  onGoToEnvCheck?: () => void;
  /** 是否自动打开第一个站点的部署弹窗（从环境检测页跳转过来时用） */
  autoDeployFirst?: boolean;
  /** 自动打开后回调，用于重置父组件状态 */
  onAutoOpened?: () => void;
}

// 部署「工作连续性」概览卡片：让运维一眼看到 成功率 / 自动化部署占比 / 最近一次自动部署
function ContinuityStat({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint: string }) {
  return (
    <Box
      sx={{
        flex: '1 1 0',
        minWidth: 180,
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        p: 1.25,
        borderRadius: 1.5,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          flexShrink: 0,
          borderRadius: '50%',
          bgcolor: 'action.hover',
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 11, fontWeight: 500 }}>
          {label}
        </Typography>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.1, color: 'text.primary' }}>
          {value}
        </Typography>
        <Tooltip title={hint}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', fontSize: 10.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'default' }}
          >
            {hint}
          </Typography>
        </Tooltip>
      </Box>
    </Box>
  );
}

function formatRelativeTime(ts: number | null): string {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

export function DeployPanel({ connectionId, connections = [], onGoToEnvCheck, autoDeployFirst, onAutoOpened }: DeployPanelProps) {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 部署历史按触发方式筛选（运维视图）—— 让「工作连续性」（定时/启动自动部署）在历史上可见
  const [triggerFilter, setTriggerFilter] = useState<'all' | 'manual' | 'scheduled' | 'rollback'>('all');

  // 批量选择的部署记录 ID
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 清理/删除菜单
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  // 删除确认弹窗
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState<'single' | 'batch' | 'cleanup' | 'failed'>('single');
  const [deleteTargetId, setDeleteTargetId] = useState('');
  const [deleteKeepCount, setDeleteKeepCount] = useState(10);
  const [deleting, setDeleting] = useState(false);

  // 站点列表（用于显示站点名称）
  const [sites, setSites] = useState<Site[]>([]);

  // 部署「工作连续性」聚合统计（按连接，覆盖全部历史，不限于当前分页）
  const [stats, setStats] = useState<DeploymentStats | null>(null);

  // 按触发方式统计 + 客户端筛选
  const triggerCounts = useMemo(() => {
    const c = { all: deployments.length, manual: 0, scheduled: 0, rollback: 0 };
    for (const d of deployments) {
      if (d.triggerType === 'manual') c.manual += 1;
      else if (d.triggerType === 'scheduled') c.scheduled += 1;
      else if (d.triggerType === 'rollback') c.rollback += 1;
    }
    return c;
  }, [deployments]);
  const filteredDeployments = useMemo(
    () => (triggerFilter === 'all' ? deployments : deployments.filter((d) => d.triggerType === triggerFilter)),
    [deployments, triggerFilter],
  );

  // 筛选变化时重置页码到第一页，避免当前页超出总页数
  useEffect(() => {
    setPage(0);
  }, [triggerFilter]);

  // 当前页数据（客户端分页）
  const pagedDeployments = useMemo(() => {
    const start = page * pageSize;
    return filteredDeployments.slice(start, start + pageSize);
  }, [filteredDeployments, page, pageSize]);

  // 部署「工作连续性」概览统计：基于 backend deploymentStats 的真实全量数据（覆盖所有历史，不限于当前分页）
  const continuityOverview = useMemo(() => {
    const total = stats?.total ?? 0;
    const successCount = stats?.successCount ?? 0;
    const failedCount = stats?.failedCount ?? 0;
    const scheduledCount = stats?.scheduledCount ?? 0;
    const lastScheduledAt = stats?.lastScheduledAt ?? null;
    const lastDeployedAt = stats?.lastDeployedAt ?? null;
    const consecutiveSuccess = stats?.consecutiveSuccess ?? 0;
    return {
      total,
      successCount,
      failedCount,
      scheduledCount,
      consecutiveSuccess,
      successRate: total > 0 ? Math.round((successCount / total) * 100) : 0,
      autoRatio: total > 0 ? Math.round((scheduledCount / total) * 100) : 0,
      lastScheduledAt,
      lastDeployedAt,
    };
  }, [stats]);

  // 服务状态（按站点ID缓存）
  const [serviceStatusMap, setServiceStatusMap] = useState<Record<string, ServiceStatus>>({});
  const [statusLoadingMap, setStatusLoadingMap] = useState<Record<string, boolean>>({});

  // 详情弹窗
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailDeployment, setDetailDeployment] = useState<Deployment | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 操作确认
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'restart' | 'stop' | 'start' | 'rollback'>('restart');
  const [confirmSiteId, setConfirmSiteId] = useState('');
  const [confirmDeploymentId, setConfirmDeploymentId] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  // 部署弹窗
  const [deployOpen, setDeployOpen] = useState(false);
  const [deploySiteId, setDeploySiteId] = useState('');
  const [deployPhase, setDeployPhase] = useState<'idle' | 'running' | 'success' | 'failed'>('idle');
  const [deployProgress, setDeployProgress] = useState<DeployProgress | null>(null);
  const [deployError, setDeployError] = useState('');
  const [deployResult, setDeployResult] = useState<DeployOutcome | null>(null);
  const [deployShowLog, setDeployShowLog] = useState(false);
  // 部署配置编辑
  const [configEditing, setConfigEditing] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [editRemotePath, setEditRemotePath] = useState('');
  const [editEnableNginx, setEditEnableNginx] = useState(true);
  const [editDomain, setEditDomain] = useState('');
  // 环境检测（部署弹窗内嵌）
  const [envCheckLoading, setEnvCheckLoading] = useState(false);
  const [envCheckResult, setEnvCheckResult] = useState<EnvCheckResult | null>(null);
  const [envCheckError, setEnvCheckError] = useState('');
  // 多域名
  const [deployDomains, setDeployDomains] = useState<SiteDomain[]>([]);

  const siteMap = useMemo(() => {
    const map: Record<string, Site> = {};
    sites.forEach((s) => {
      map[s.id] = s;
    });
    return map;
  }, [sites]);

  // 部署步骤列表（二进制部署唯一模式，供进度步骤条渲染）。
  const activeDeploySteps = BINARY_DEPLOY_STEPS;

  // 绑定了当前服务器的站点列表
  const connectionSites = useMemo(() => {
    return sites.filter((s) => s.connection_id === connectionId);
  }, [sites, connectionId]);

  // 加载站点列表
  useEffect(() => {
    void listSites().then(setSites).catch(() => {});
  }, []);

  // 从环境检测页跳转过来时，自动打开第一个站点的部署弹窗
  useEffect(() => {
    if (autoDeployFirst && connectionSites.length > 0 && !deployOpen) {
      const firstSite = connectionSites[0];
      setDeploySiteId(firstSite.id);
      setDeployPhase('idle');
      setDeployProgress(null);
      setDeployError('');
      setDeployShowLog(false);
      setEnvCheckResult(null);
      setEnvCheckError('');
      setDeployOpen(true);
      // 直接用 firstSite 的信息触发环境检测（不依赖 state 更新）
      const connId = firstSite.connection_id;
      if (connId) {
        const runCheck = async () => {
          setEnvCheckLoading(true);
          setEnvCheckError('');
          try {
            let remotePath = '/opt/webcraft';
            let domain = firstSite.domain || firstSite.name || '';
            try {
              const cfg = JSON.parse(firstSite.deploy_config_json || '{}');
              if (cfg.remote_path) remotePath = cfg.remote_path;
            } catch {}
            const params: Record<string, string> = {
              domain,
              deploy_path: remotePath,
      
            };
            const result = await opsRunScript('ops-web-env-check', params, connId);
            if (!result.success) {
              throw new Error(result.stderr || result.stdout || '检测失败');
            }
            const stdout = result.stdout.trim();
            const firstBrace = stdout.indexOf('{');
            const lastBrace = stdout.lastIndexOf('}');
            if (firstBrace === -1 || lastBrace === -1) {
              throw new Error('无法解析检测结果');
            }
            const jsonStr = stdout.slice(firstBrace, lastBrace + 1);
            const data = JSON.parse(jsonStr) as EnvCheckResult;
            setEnvCheckResult(data);
          } catch (e) {
            setEnvCheckError(String(e));
            setEnvCheckResult(null);
          } finally {
            setEnvCheckLoading(false);
          }
        };
        void runCheck();
      }
      // 通知父组件重置状态
      onAutoOpened?.();
    }
  }, [autoDeployFirst, connectionSites, deployOpen, onAutoOpened]);

  // 加载部署记录列表
  const loadDeployments = useCallback(async () => {
    if (!connectionId) return;
    setLoading(true);
    setError('');
    try {
      const result = await listDeploymentsByConnection(connectionId, page + 1, pageSize);
      setDeployments(result.items);
      setTotal(result.total);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [connectionId, page, pageSize]);

  // 加载部署「工作连续性」聚合统计（真实全量数据）
  const loadStats = useCallback(async () => {
    if (!connectionId) return;
    try {
      const s = await deploymentStats(connectionId);
      setStats(s);
    } catch {
      // 统计失败不影响主列表；概览回退到空态
    }
  }, [connectionId]);

  useEffect(() => {
    void loadDeployments();
    void loadStats();
  }, [loadDeployments, loadStats]);

  // 加载服务状态
  const loadServiceStatus = useCallback(async (siteId: string) => {
    if (!siteId || statusLoadingMap[siteId]) return;
    setStatusLoadingMap((prev) => ({ ...prev, [siteId]: true }));
    try {
      const status = await getServiceStatus(siteId);
      setServiceStatusMap((prev) => ({ ...prev, [siteId]: status }));
    } catch (e) {
      // 忽略单个站点的状态查询错误
    } finally {
      setStatusLoadingMap((prev) => ({ ...prev, [siteId]: false }));
    }
  }, [statusLoadingMap]);

  // 批量加载当前服务器所有绑定站点的服务状态
  useEffect(() => {
    connectionSites.forEach((site) => {
      if (!serviceStatusMap[site.id] && !statusLoadingMap[site.id]) {
        void loadServiceStatus(site.id);
      }
    });
  }, [connectionSites, serviceStatusMap, statusLoadingMap, loadServiceStatus]);

  // 查看部署详情
  const handleViewDetail = useCallback(async (deployment: Deployment) => {
    setDetailDeployment(deployment);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const detail = await getDeployment(deployment.id);
      if (detail) {
        setDetailDeployment(detail);
      }
    } catch (e) {
      // 使用列表数据即可
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // 确认操作
  const handleConfirmAction = useCallback(async () => {
    setActionLoading(true);
    setActionError('');
    try {
      if (confirmAction === 'restart') {
        await restartService(confirmSiteId);
      } else if (confirmAction === 'stop') {
        await stopService(confirmSiteId);
      } else if (confirmAction === 'start') {
        await startService(confirmSiteId);
      } else if (confirmAction === 'rollback') {
        await rollbackDeployment(confirmSiteId, confirmDeploymentId);
      }
      setConfirmOpen(false);
      // 刷新状态
      void loadServiceStatus(confirmSiteId);
      void loadDeployments();
      void loadStats();
    } catch (e) {
      setActionError(String(e));
    } finally {
      setActionLoading(false);
    }
  }, [confirmAction, confirmSiteId, confirmDeploymentId, loadServiceStatus, loadDeployments]);

  // ---------- 部署历史删除/清理操作 ----------

  // 切换单条选中状态
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // 全选/取消全选（当前页）
  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allOnPage = pagedDeployments.map((d) => d.id);
      const allSelected = allOnPage.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        allOnPage.forEach((id) => next.delete(id));
      } else {
        allOnPage.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [pagedDeployments]);

  // 打开单条删除确认
  const handleDeleteSingle = useCallback((id: string) => {
    setDeleteMode('single');
    setDeleteTargetId(id);
    setDeleteDialogOpen(true);
  }, []);

  // 打开批量删除确认
  const handleDeleteBatch = useCallback(() => {
    if (selectedIds.size === 0) return;
    setDeleteMode('batch');
    setDeleteDialogOpen(true);
    setMenuAnchor(null);
  }, [selectedIds]);

  // 打开清理旧记录确认
  const handleCleanup = useCallback(() => {
    setDeleteMode('cleanup');
    setDeleteKeepCount(10);
    setDeleteDialogOpen(true);
    setMenuAnchor(null);
  }, []);

  // 打开清理失败记录确认
  const handleDeleteFailed = useCallback(() => {
    setDeleteMode('failed');
    setDeleteDialogOpen(true);
    setMenuAnchor(null);
  }, []);

  // 执行删除操作
  const handleDeleteConfirm = useCallback(async () => {
    setDeleting(true);
    try {
      if (deleteMode === 'single') {
        await deleteDeployment(deleteTargetId);
      } else if (deleteMode === 'batch') {
        await batchDeleteDeployments(Array.from(selectedIds));
        setSelectedIds(new Set());
      } else if (deleteMode === 'cleanup') {
        // 清理所有站点的旧记录（按连接维度），保留最近 N 条
        // 这里我们对每个站点分别清理，简化起见只清理当前页的站点
        const siteIds = [...new Set(deployments.map((d) => d.siteId))];
        for (const sid of siteIds) {
          await cleanupDeployments(sid, deleteKeepCount);
        }
      } else if (deleteMode === 'failed') {
        const siteIds = [...new Set(deployments.map((d) => d.siteId))];
        for (const sid of siteIds) {
          await deleteDeploymentsByStatus(sid, 'failed');
        }
      }
      setDeleteDialogOpen(false);
      // 刷新列表和统计
      void loadDeployments();
      void loadStats();
    } catch (e) {
      console.error('删除部署记录失败:', e);
    } finally {
      setDeleting(false);
    }
  }, [deleteMode, deleteTargetId, selectedIds, deleteKeepCount, deployments, loadDeployments, loadStats]);

  // 当前页是否全选
  const allSelected = useMemo(() => {
    if (pagedDeployments.length === 0) return false;
    return pagedDeployments.every((d) => selectedIds.has(d.id));
  }, [pagedDeployments, selectedIds]);

  // 部分选中
  const someSelected = useMemo(() => {
    return pagedDeployments.some((d) => selectedIds.has(d.id)) && !allSelected;
  }, [pagedDeployments, selectedIds, allSelected]);

  // 当前部署站点的配置预览
  const deployConfigPreview = useMemo(() => {
    const site = siteMap[deploySiteId];
    if (!site) return null;
    try {
      const cfg = JSON.parse(site.deploy_config_json || '{}');
      return {
        remotePath: cfg.remote_path || '/opt/webcraft',
        domain: site.domain || '',
        enableNginx: cfg.enable_nginx !== false,
      };
    } catch {
      return null;
    }
    }, [deploySiteId, siteMap]);

  // 切换站点时初始化编辑配置
  useEffect(() => {
    if (!deployConfigPreview) return;
    setEditRemotePath(deployConfigPreview.remotePath);
    setEditEnableNginx(deployConfigPreview.enableNginx);
    setEditDomain(deployConfigPreview.domain);
    setConfigEditing(false);
  }, [deploySiteId, deployConfigPreview]);

  // 保存部署配置
  const handleSaveDeployConfig = useCallback(async () => {
    const site = siteMap[deploySiteId];
    if (!site) return;
    setConfigSaving(true);
    try {
      let deployConfig: Record<string, unknown> = {};
      try {
        deployConfig = JSON.parse(site.deploy_config_json || '{}');
      } catch {}
      deployConfig.remote_path = editRemotePath;
      deployConfig.enable_nginx = editEnableNginx;
      await updateSite({
        ...site,
        domain: editDomain,
        deploy_config_json: JSON.stringify(deployConfig),
      });
      setConfigEditing(false);
      // 刷新站点列表
      listSites().then(setSites).catch(() => {});
    } finally {
      setConfigSaving(false);
    }
  }, [deploySiteId, siteMap, editRemotePath, editEnableNginx, editDomain]);

  // 环境就绪状态（路线B：静态托管，检查 Nginx）
  const envReadiness = useMemo(() => {
    if (!envCheckResult) return null;
    const s = envCheckResult.summary;
    const nginx = envCheckResult.groups
      .flatMap((g) => g.items)
      .find((i) => i.name.toLowerCase().includes('nginx'));
    const nginxOk = nginx?.status === 'pass';
    const isReady = s.failed === 0 && nginxOk;
    return { score: s.score, passed: s.passed, warning: s.warning, failed: s.failed, nginxOk, isReady };
  }, [envCheckResult, deploySiteId]);

  // 运行环境检测
  const runEnvCheckInDialog = useCallback(async () => {
    const site = siteMap[deploySiteId];
    if (!site?.connection_id) return;
    setEnvCheckLoading(true);
    setEnvCheckError('');
    try {
      const cfg = deployConfigPreview;
      const params: Record<string, string> = {
        domain: site.domain || site.name || '',
        deploy_path: cfg?.remotePath || '',

      };
      const result = await opsRunScript('ops-web-env-check', params, site.connection_id);
      if (!result.success) {
        throw new Error(result.stderr || result.stdout || '检测失败');
      }
      const stdout = result.stdout.trim();
      const firstBrace = stdout.indexOf('{');
      const lastBrace = stdout.lastIndexOf('}');
      if (firstBrace === -1 || lastBrace === -1) {
        throw new Error('无法解析检测结果');
      }
      const jsonStr = stdout.slice(firstBrace, lastBrace + 1);
      const data = JSON.parse(jsonStr) as EnvCheckResult;
      setEnvCheckResult(data);
    } catch (e) {
      setEnvCheckError(String(e));
      setEnvCheckResult(null);
    } finally {
      setEnvCheckLoading(false);
    }
  }, [deploySiteId, siteMap, deployConfigPreview]);

  // 打开指定站点的部署弹窗
  const handleOpenDeployDialog = useCallback((site: Site) => {
    setDeploySiteId(site.id);
    setDeployPhase('idle');
    setDeployProgress(null);
    setDeployError('');
    setDeployShowLog(false);
    setEnvCheckResult(null);
    setEnvCheckError('');
    setDeployOpen(true);
    // 加载域名列表
    setDeployDomains([]);
    void (async () => {
      try {
        const list = await listSiteDomains(site.id);
        setDeployDomains(list);
      } catch (e) {
        console.error('加载域名列表失败:', e);
      }
    })();
    // 自动触发环境检测
    const connId = site.connection_id;
    if (connId) {
      const runCheck = async () => {
        setEnvCheckLoading(true);
        setEnvCheckError('');
        try {
          let remotePath = '/opt/webcraft';
          let domain = site.domain || site.name || '';
          try {
            const cfg = JSON.parse(site.deploy_config_json || '{}');
            if (cfg.remote_path) remotePath = cfg.remote_path;
          } catch {}
          const params: Record<string, string> = {
            domain,
            deploy_path: remotePath,
    
          };
          const result = await opsRunScript('ops-web-env-check', params, connId);
          if (!result.success) {
            throw new Error(result.stderr || result.stdout || '检测失败');
          }
          const stdout = result.stdout.trim();
          const firstBrace = stdout.indexOf('{');
          const lastBrace = stdout.lastIndexOf('}');
          if (firstBrace === -1 || lastBrace === -1) {
            throw new Error('无法解析检测结果');
          }
          const jsonStr = stdout.slice(firstBrace, lastBrace + 1);
          const data = JSON.parse(jsonStr) as EnvCheckResult;
          setEnvCheckResult(data);
        } catch (e) {
          setEnvCheckError(String(e));
          setEnvCheckResult(null);
        } finally {
          setEnvCheckLoading(false);
        }
      };
      void runCheck();
    }
  }, []);

  // 开始部署（路线B：上传 dist/ 静态文件 → Nginx 提供服务 → HTTP 可达验证）。
  // 不需要本地源码根或 webcraft-server 二进制。
  const handleStartDeploy = useCallback(async () => {
    if (!deploySiteId || deployPhase === 'running') return;
    setDeployPhase('running');
    setDeployProgress(null);
    setDeployError('');
    setDeployResult(null);
    setDeployShowLog(false);

    let unlisten: (() => void) | null = null;
    try {
      unlisten = await onDeployProgress(deploySiteId, (p) => {
        setDeployProgress(p);
      });
      const outcome = await deploySite(deploySiteId);
      setDeployResult(outcome);
      setDeployPhase('success');
      // 系统通知：部署成功
      void fireDeployNotification('部署成功', `站点 ${siteMap[deploySiteId]?.name || deploySiteId.slice(0, 8)} 部署完成`, 'success');
    } catch (e) {
      setDeployError(String(e));
      setDeployPhase('failed');
      // 系统通知：部署失败
      void fireDeployNotification('部署失败', `站点 ${siteMap[deploySiteId]?.name || deploySiteId.slice(0, 8)} 部署失败：${String(e).slice(0, 60)}`, 'error');
    } finally {
      if (unlisten) unlisten();
      // 刷新状态和部署历史
      void loadServiceStatus(deploySiteId);
      void loadDeployments();
      void loadStats();
    }
  }, [deploySiteId, deployPhase, deploySite, onDeployProgress, loadServiceStatus, loadDeployments]);

  // 打开站点绑定服务器的 SFTP 文件管理窗口
  const handleOpenSftp = useCallback(
    async (site: Site | null) => {
      const target = site ?? siteMap[deploySiteId];
      if (!target?.connection_id) return;
      const conn = connections.find((c) => c.id === target.connection_id);
      if (!conn) return;
      let ssh: SshConnectionInfo;
      try {
        ssh = JSON.parse(conn.config_json) as SshConnectionInfo;
      } catch {
        return;
      }
      try {
        await openSftpWindow(
          {
            host: ssh.host,
            port: ssh.port,
            username: ssh.username,
            authMethod: ssh.auth_method,
            privateKeyPath: ssh.private_key_path,
            password: ssh.password,
            connectionId: target.connection_id,
          },
          (msg) => setError(msg),
        );
      } catch (e) {
        setError(String(e));
      }
    },
    [connections, deploySiteId, siteMap],
  );

  const parseSteps = (stepsJson: string): DeploymentStep[] => {
    try {
      return JSON.parse(stepsJson) as DeploymentStep[];
    } catch {
      return [];
    }
  };

  const parseLogs = (logJson: string): string[] => {
    try {
      return JSON.parse(logJson) as string[];
    } catch {
      return [];
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleString();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minHeight: 0 }}>
      {/* 服务状态卡片区域 */}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
            <HardDriveIcon size={16} style={{ verticalAlign: -3, marginRight: 6 }} />
            服务运行状态
            <Chip
              size="small"
              label={connectionSites.length}
              sx={{ ml: 1, height: 18, fontSize: 10, fontWeight: 600, bgcolor: 'action.hover' }}
            />
          </Typography>
          <Button
            size="small"
            variant="text"
            startIcon={<ArrowsClockwiseIcon size={14} />}
            onClick={() => connectionSites.forEach((s) => void loadServiceStatus(s.id))}
          >
            全部刷新
          </Button>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 1.5 }}>
          {connectionSites.map((site) => {
            const status = serviceStatusMap[site.id];
            const loading = statusLoadingMap[site.id];
            const isRunning = status?.isRunning;
            const isHealthy = status?.healthOk;
            return (
              <Card
                key={site.id}
                variant="outlined"
                sx={{
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    borderColor: 'primary.main',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    transform: 'translateY(-1px)',
                  },
                }}
              >
                {/* 左侧状态条 */}
                <Box
                  sx={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 3,
                    bgcolor: loading
                      ? 'divider'
                      : isRunning
                        ? isHealthy
                          ? '#66BB6A'
                          : '#FFA726'
                        : status
                          ? '#94A3B8'
                          : 'divider',
                    transition: 'background-color 0.3s ease',
                  }}
                />
                <CardContent sx={{ p: 2, pb: 1.5, pl: 2.25 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.25 }}>
                    {/* 图标 + 状态脉冲 */}
                    <Box sx={{ position: 'relative' }}>
                      <Box
                        sx={{
                          width: 36,
                          height: 36,
                          borderRadius: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          bgcolor: loading
                            ? 'action.hover'
                            : isRunning
                              ? isHealthy
                                ? 'rgba(102, 187, 106, 0.12)'
                                : 'rgba(255, 167, 38, 0.12)'
                              : status
                                ? 'rgba(148, 163, 184, 0.12)'
                                : 'action.hover',
                          transition: 'all 0.3s ease',
                        }}
                      >
                        <RocketIcon
                          size={18}
                          color={isRunning ? (isHealthy ? '#66BB6A' : '#FFA726') : status ? '#94A3B8' : '#CBD5E1'}
                          weight={isRunning ? 'fill' : 'regular'}
                        />
                      </Box>
                      {/* 运行状态脉冲点 */}
                      {isRunning && !loading && (
                        <Box
                          sx={{
                            position: 'absolute',
                            top: -2,
                            right: -2,
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            bgcolor: isHealthy ? '#66BB6A' : '#FFA726',
                            animation: 'pulse-dot 2s ease-in-out infinite',
                            '@keyframes pulse-dot': {
                              '0%, 100%': {
                                boxShadow: `0 0 0 0 ${isHealthy ? 'rgba(102, 187, 106, 0.5)' : 'rgba(255, 167, 38, 0.5)'}`,
                              },
                              '50%': {
                                boxShadow: `0 0 0 6px ${isHealthy ? 'rgba(102, 187, 106, 0)' : 'rgba(255, 167, 38, 0)'}`,
                              },
                            },
                          }}
                        />
                      )}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3 }} noWrap>
                        {site.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: 11 }}>
                        {site.domain || '未绑定域名'}{site.domain ? '' : '（仅 IP 可达）'}
                      </Typography>
                    </Box>
                    {loading ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <CircularProgress size={14} thickness={3} />
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>检测中</Typography>
                      </Box>
                    ) : status ? (
                      <Chip
                        label={isRunning ? '运行中' : '已停止'}
                        size="small"
                        sx={{
                          height: 22,
                          fontSize: 11,
                          fontWeight: 600,
                          borderRadius: '11px',
                          bgcolor: isRunning
                            ? isHealthy
                              ? 'rgba(102, 187, 106, 0.12)'
                              : 'rgba(255, 167, 38, 0.12)'
                            : 'rgba(148, 163, 184, 0.12)',
                          color: isRunning
                            ? isHealthy
                              ? '#66BB6A'
                              : '#FFA726'
                            : '#94A3B8',
                          border: 'none',
                        }}
                      />
                    ) : (
                      <Chip
                        label="未部署"
                        size="small"
                        variant="outlined"
                        sx={{ height: 22, fontSize: 11, fontWeight: 500, borderRadius: '11px' }}
                      />
                    )}
                  </Box>

                  {status && (
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: 1,
                        pt: 1.25,
                        borderTop: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      <StatusMini label="端口" value="80" />
                      <StatusMini
                        label="HTTP 可达"
                        value={isHealthy ? '正常' : `异常(${status.healthzCode})`}
                        color={isHealthy ? '#66BB6A' : '#EF5350'}
                      />
                      <StatusMini label="版本" value={status.currentVersion || '未知'} mono />
                    </Box>
                  )}

                  {!status && !loading && (
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.75,
                        pt: 1.25,
                        borderTop: '1px dashed',
                        borderColor: 'divider',
                      }}
                    >
                      <InfoIcon size={12} color="#94A3B8" />
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                        服务尚未部署，点击右侧按钮开始部署
                      </Typography>
                    </Box>
                  )}

                  <Box sx={{ display: 'flex', gap: 0.25, mt: 1.25, justifyContent: 'flex-end' }}>
                    <Tooltip title="部署服务" placement="top">
                      <IconButton
                        size="small"
                        color="primary"
                        sx={{
                          transition: 'all 0.2s',
                          '&:hover': {
                            bgcolor: 'primary.main',
                            color: 'primary.contrastText',
                            transform: 'scale(1.05)',
                          },
                        }}
                        onClick={() => handleOpenDeployDialog(site)}
                      >
                        <UploadIcon size={16} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="SFTP 文件管理">
                      <IconButton
                        size="small"
                        onClick={() => void handleOpenSftp(site)}
                      >
                        <FolderOpenIcon size={16} />
                      </IconButton>
                    </Tooltip>
                    {status && !status.isRunning && (
                      <Tooltip title="启动服务">
                        <IconButton
                          size="small"
                          color="success"
                          onClick={() => {
                            setConfirmAction('start');
                            setConfirmSiteId(site.id);
                            setConfirmOpen(true);
                          }}
                        >
                          <PlayIcon size={16} />
                        </IconButton>
                      </Tooltip>
                    )}
                    {status?.isRunning && (
                      <Tooltip title="重启服务">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => {
                            setConfirmAction('restart');
                            setConfirmSiteId(site.id);
                            setConfirmOpen(true);
                          }}
                        >
                          <ArrowCounterClockwiseIcon size={16} />
                        </IconButton>
                      </Tooltip>
                    )}
                    {status?.isRunning && (
                      <Tooltip title="停止服务">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => {
                            setConfirmAction('stop');
                            setConfirmSiteId(site.id);
                            setConfirmOpen(true);
                          }}
                        >
                          <StopIcon size={16} />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="刷新状态">
                      <IconButton size="small" onClick={() => loadServiceStatus(site.id)}>
                        <ArrowsClockwiseIcon size={16} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </CardContent>
              </Card>
            );
          })}
          {connectionSites.length === 0 && (
            <Box
              sx={{
                gridColumn: '1 / -1',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                py: 6,
                color: 'text.secondary',
              }}
            >
              <Box
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  bgcolor: 'action.hover',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mb: 2,
                }}
              >
                <HardDriveIcon size={28} weight="light" />
              </Box>
              <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary' }}>
                当前服务器未绑定任何站点
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, textAlign: 'center', maxWidth: 360 }}>
                请先在站点设置中绑定服务器，然后即可在此进行部署和运维操作
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      <Divider />

      {/* 部署历史列表 */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
            <ClockIcon size={16} style={{ verticalAlign: -3, marginRight: 6 }} />
            部署历史
            {deployments.length > 0 && (
              <Chip
                size="small"
                label={total}
                sx={{ ml: 1, height: 18, fontSize: 10, fontWeight: 600, bgcolor: 'action.hover' }}
              />
            )}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {selectedIds.size > 0 && (
              <Chip
                size="small"
                label={`已选 ${selectedIds.size} 条`}
                color="primary"
                variant="outlined"
                sx={{ height: 24, fontSize: 11, fontWeight: 500 }}
              />
            )}
            <Button
              size="small"
              variant="text"
              startIcon={<TrashIcon size={14} />}
              onClick={handleDeleteBatch}
              disabled={selectedIds.size === 0}
              color="error"
            >
              删除选中
            </Button>
            <Button
              size="small"
              variant="text"
              endIcon={<DotsThreeVerticalIcon size={14} />}
              onClick={(e) => setMenuAnchor(e.currentTarget)}
            >
              更多操作
            </Button>
            <Menu
              anchorEl={menuAnchor}
              open={Boolean(menuAnchor)}
              onClose={() => setMenuAnchor(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              <MenuItem onClick={handleCleanup}>
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <TrashIcon size={15} />
                </ListItemIcon>
                <ListItemText primary="清理旧记录" secondary="保留最近 N 条" />
              </MenuItem>
              <MenuItem onClick={handleDeleteFailed}>
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <XCircleIcon size={15} />
                </ListItemIcon>
                <ListItemText primary="清理失败记录" secondary="删除所有失败的部署" />
              </MenuItem>
            </Menu>
            <Button
              size="small"
              variant="text"
              startIcon={loading ? <CircularProgress size={14} thickness={3} /> : <ArrowsClockwiseIcon size={14} />}
              onClick={loadDeployments}
              disabled={loading}
            >
              刷新
            </Button>
          </Box>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}

        {/* 部署「工作连续性」概览（基于 backend 真实全量统计，覆盖所有历史）：成功率 / 自动化占比 / 连续成功 / 最近一次部署(含手动) / 最近一次自动部署 */}
        {continuityOverview.total > 0 && (
          <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}>
            <ContinuityStat
              icon={
                <CheckCircleIcon
                  size={18}
                  weight="fill"
                  color={continuityOverview.successRate >= 80 ? '#66BB6A' : continuityOverview.successRate >= 50 ? '#FFA726' : '#EF5350'}
                />
              }
              label="部署成功率"
              value={`${continuityOverview.successRate}%`}
              hint={`${continuityOverview.successCount} 成功 · ${continuityOverview.failedCount} 失败 · 共 ${continuityOverview.total} 次`}
            />
            <ContinuityStat
              icon={<ArrowsClockwiseIcon size={18} weight="fill" color="#42A5F5" />}
              label="自动化部署占比"
              value={`${continuityOverview.autoRatio}%`}
              hint={`${continuityOverview.scheduledCount} 次定时/启动自动部署`}
            />
            <ContinuityStat
              icon={<CheckCircleIcon size={18} weight="fill" color={continuityOverview.consecutiveSuccess > 0 ? '#66BB6A' : '#EF5350'} />}
              label="连续成功"
              value={`${continuityOverview.consecutiveSuccess} 次`}
              hint={continuityOverview.consecutiveSuccess > 0 ? '最近部署连续成功，链路健康' : '最近一次部署未成功'}
            />
            <ContinuityStat
              icon={<ClockIcon size={18} weight="fill" color="#26A69A" />}
              label="最近一次部署"
              value={formatRelativeTime(continuityOverview.lastDeployedAt)}
              hint={
                continuityOverview.lastDeployedAt
                  ? new Date(continuityOverview.lastDeployedAt).toLocaleString()
                  : '尚无部署记录'
              }
            />
            <ContinuityStat
              icon={<ClockIcon size={18} weight="fill" color="#AB47BC" />}
              label="最近一次自动部署"
              value={formatRelativeTime(continuityOverview.lastScheduledAt)}
              hint={
                continuityOverview.lastScheduledAt
                  ? new Date(continuityOverview.lastScheduledAt).toLocaleString()
                  : '尚未触发自动化部署'
              }
            />
          </Box>
        )}

        {/* 部署历史运维筛选：按触发方式分组，突出自动化部署（工作连续性） */}
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
          {(['all', 'manual', 'scheduled', 'rollback'] as const).map((t) => {
            const label = t === 'all' ? '全部' : TRIGGER_LABEL[t];
            const count = t === 'all' ? triggerCounts.all : triggerCounts[t];
            const active = triggerFilter === t;
            return (
              <Chip
                key={t}
                label={`${label} ${count}`}
                size="small"
                clickable
                onClick={() => { setTriggerFilter(t); setPage(0); }}
                sx={{
                  height: 24,
                  fontSize: 11,
                  fontWeight: active ? 700 : 500,
                  borderRadius: '12px',
                  cursor: 'pointer',
                  bgcolor: active ? 'primary.main' : 'action.hover',
                  color: active ? 'primary.contrastText' : 'text.secondary',
                  border: 'none',
                  '&:hover': { bgcolor: active ? 'primary.main' : 'action.selected' },
                }}
              />
            );
          })}
        </Box>

        <Card variant="outlined" sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 1.5 }}>
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            <Table size="small" stickyHeader sx={{ '& .MuiTableCell-head': { bgcolor: 'action.hover', fontWeight: 600, fontSize: 11, py: 1.5 } }}>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" sx={{ borderBottom: '1px solid', borderColor: 'divider', width: 40 }}>
                    <Checkbox
                      size="small"
                      checked={allSelected}
                      indeterminate={someSelected}
                      onChange={toggleSelectAll}
                      disabled={pagedDeployments.length === 0}
                      sx={{ p: 0.5 }}
                    />
                  </TableCell>
                  <TableCell sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>站点</TableCell>
                  <TableCell sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>模式</TableCell>
                  <TableCell sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>触发方式</TableCell>
                  <TableCell sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>状态</TableCell>
                  <TableCell sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>版本</TableCell>
                  <TableCell sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>大小</TableCell>
                  <TableCell sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>耗时</TableCell>
                  <TableCell sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>开始时间</TableCell>
                  <TableCell align="center" sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 6 }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
                        <CircularProgress size={28} thickness={2.5} />
                        <Typography variant="body2" color="text.secondary">加载部署记录中...</Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : filteredDeployments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 6 }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                        <Box
                          sx={{
                            width: 48,
                            height: 48,
                            borderRadius: '50%',
                            bgcolor: 'action.hover',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <ClockIcon size={22} weight="light" color="#94A3B8" />
                        </Box>
                        <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary' }}>
                          暂无部署记录
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>
                          点击服务卡片上的「部署」按钮开始你的第一次部署
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : (
                  pagedDeployments.map((d) => {
                    const site = siteMap[d.siteId];
                    return (
                      <TableRow
                        key={d.id}
                        hover
                        selected={selectedIds.has(d.id)}
                        sx={{
                          transition: 'background-color 0.15s ease',
                          '&:last-child td': { borderBottom: 'none' },
                        }}
                      >
                        <TableCell padding="checkbox">
                          <Checkbox
                            size="small"
                            checked={selectedIds.has(d.id)}
                            onChange={() => toggleSelect(d.id)}
                            sx={{ p: 0.5 }}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 500, fontSize: 12 }} noWrap>
                            {site?.name || d.siteId.slice(0, 8)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={MODE_LABEL[d.mode] || d.mode}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: 10,
                              fontWeight: 500,
                              borderRadius: '10px',
                              bgcolor: 'action.hover',
                              border: 'none',
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: 12, color: 'text.secondary' }}>
                            {TRIGGER_LABEL[d.triggerType] || d.triggerType}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={STATUS_LABEL[d.status] || d.status}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: 10,
                              fontWeight: 600,
                              borderRadius: '10px',
                              bgcolor: `${STATUS_COLOR[d.status] || '#94A3B8'}18`,
                              color: STATUS_COLOR[d.status] || '#94A3B8',
                              border: 'none',
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{ fontSize: 11, fontFamily: 'monospace', color: 'text.secondary' }}
                            noWrap
                          >
                            {d.serverVersion || d.versionDir?.slice(0, 20) || '—'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: 12 }}>
                            {formatBytes(d.totalBytes)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: 12 }}>
                            {formatDuration(d.durationMs)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: 11, color: 'text.secondary' }} noWrap>
                            {formatTime(d.startedAt)}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Box sx={{ display: 'flex', gap: 0.25, justifyContent: 'center' }}>
                            <Tooltip title="查看详情" placement="top">
                              <IconButton
                                size="small"
                                onClick={() => handleViewDetail(d)}
                                sx={{ transition: 'all 0.15s', '&:hover': { transform: 'scale(1.1)' } }}
                              >
                                <EyeIcon size={14} />
                              </IconButton>
                            </Tooltip>
                            {d.status === 'success' && d.versionDir && (
                              <Tooltip title="回滚到此版本" placement="top">
                                <IconButton
                                  size="small"
                                  color="warning"
                                  onClick={() => {
                                    setConfirmAction('rollback');
                                    setConfirmSiteId(d.siteId);
                                    setConfirmDeploymentId(d.id);
                                    setConfirmOpen(true);
                                  }}
                                  sx={{ transition: 'all 0.15s', '&:hover': { transform: 'scale(1.1)' } }}
                                >
                                  <ArrowCounterClockwiseIcon size={14} />
                                </IconButton>
                              </Tooltip>
                            )}
                            <Tooltip title="删除记录" placement="top">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleDeleteSingle(d.id)}
                                sx={{ transition: 'all 0.15s', '&:hover': { transform: 'scale(1.1)' } }}
                              >
                                <TrashIcon size={14} />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Box>
          <TablePagination
            component="div"
            count={filteredDeployments.length}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={pageSize}
            onRowsPerPageChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(0);
            }}
            rowsPerPageOptions={[10, 20, 50]}
            sx={{ borderTop: '1px solid', borderColor: 'divider' }}
          />
        </Card>
      </Box>

      {/* 部署详情弹窗 */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <RocketIcon size={20} />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>部署详情</Typography>
            <Chip
              label={STATUS_LABEL[detailDeployment?.status || ''] || detailDeployment?.status}
              size="small"
              sx={{
                height: 22,
                fontSize: 11,
                fontWeight: 600,
                bgcolor: `${STATUS_COLOR[detailDeployment?.status || ''] || '#94A3B8'}22`,
                color: STATUS_COLOR[detailDeployment?.status || ''] || '#94A3B8',
              }}
            />
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {detailLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : detailDeployment ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* 基本信息 */}
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
                <InfoItem label="站点" value={siteMap[detailDeployment.siteId]?.name || detailDeployment.siteId} />
                <InfoItem label="部署模式" value={MODE_LABEL[detailDeployment.mode] || detailDeployment.mode} />
                <InfoItem label="触发方式" value={TRIGGER_LABEL[detailDeployment.triggerType] || detailDeployment.triggerType} />
                <InfoItem label="版本目录" value={detailDeployment.versionDir || '—'} mono />
                <InfoItem label="上传文件" value={`${detailDeployment.uploadedCount} 个`} />
                <InfoItem label="总大小" value={formatBytes(detailDeployment.totalBytes)} />
                <InfoItem label="开始时间" value={formatTime(detailDeployment.startedAt)} />
                <InfoItem label="结束时间" value={detailDeployment.finishedAt ? formatTime(detailDeployment.finishedAt) : '—'} />
                <InfoItem label="耗时" value={formatDuration(detailDeployment.durationMs)} />
              </Box>

              {detailDeployment.rollbackFrom && (
                <Alert severity="info">
                  回滚自版本：{detailDeployment.rollbackFrom}
                </Alert>
              )}

              {/* 部署步骤 */}
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>部署步骤</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  {parseSteps(detailDeployment.stepsJson).map((step, idx) => (
                    <StepRow key={step.key || idx} step={step} />
                  ))}
                  {parseSteps(detailDeployment.stepsJson).length === 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>
                      无步骤信息
                    </Typography>
                  )}
                </Box>
              </Box>

              {/* 部署日志 */}
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>部署日志</Typography>
                <Box
                  sx={{
                    maxHeight: 200,
                    overflow: 'auto',
                    p: 1.5,
                    borderRadius: 1,
                    bgcolor: '#0F172A',
                    color: '#E2E8F0',
                    fontSize: 12,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                    lineHeight: 1.5,
                  }}
                >
                  {parseLogs(detailDeployment.logJson).length > 0 ? (
                    parseLogs(detailDeployment.logJson).map((log, i) => (
                      <Box key={i} sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {log}
                      </Box>
                    ))
                  ) : (
                    <Typography variant="body2" sx={{ color: '#64748B', fontSize: 12 }}>
                      无日志记录
                    </Typography>
                  )}
                </Box>
              </Box>

              {/* 错误信息 */}
              {detailDeployment.errorSummary && (
                <Alert severity="error">
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>错误信息</Typography>
                  <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                    {detailDeployment.errorSummary}
                  </Typography>
                </Alert>
              )}
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          {detailDeployment?.status === 'success' && detailDeployment?.versionDir && (
            <Button
              variant="outlined"
              color="warning"
              startIcon={<ArrowCounterClockwiseIcon size={16} />}
              onClick={() => {
                setDetailOpen(false);
                setConfirmAction('rollback');
                setConfirmSiteId(detailDeployment.siteId);
                setConfirmDeploymentId(detailDeployment.id);
                setConfirmOpen(true);
              }}
            >
              回滚到此版本
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setDetailOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>

      {/* 操作确认弹窗 */}
      <Dialog open={confirmOpen} onClose={() => !actionLoading && setConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {confirmAction === 'restart' && '确认重启服务？'}
          {confirmAction === 'stop' && '确认停止服务？'}
          {confirmAction === 'start' && '确认启动服务？'}
          {confirmAction === 'rollback' && '确认回滚版本？'}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {confirmAction === 'restart' && '重启过程中服务将短暂不可用，确定要重启吗？'}
            {confirmAction === 'stop' && '停止后站点将无法访问，确定要停止吗？'}
            {confirmAction === 'start' && '启动后站点将恢复对外访问，确定要启动吗？'}
            {confirmAction === 'rollback' && '回滚将切换到历史版本并重启服务，当前版本的新数据可能丢失，确定要回滚吗？'}
          </Typography>
          {actionError && <Alert severity="error" sx={{ mt: 1.5 }}>{actionError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button disabled={actionLoading} onClick={() => setConfirmOpen(false)}>
            取消
          </Button>
          <Button
            variant="contained"
            color={confirmAction === 'stop' ? 'error' : confirmAction === 'rollback' ? 'warning' : 'primary'}
            disabled={actionLoading}
            startIcon={actionLoading ? <CircularProgress size={16} color="inherit" /> : undefined}
            onClick={handleConfirmAction}
          >
            {confirmAction === 'restart' && '重启'}
            {confirmAction === 'stop' && '停止'}
            {confirmAction === 'start' && '启动'}
            {confirmAction === 'rollback' && '回滚'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 删除/清理确认弹窗 */}
      <Dialog open={deleteDialogOpen} onClose={() => !deleting && setDeleteDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {deleteMode === 'single' && '确认删除部署记录？'}
          {deleteMode === 'batch' && `确认删除 ${selectedIds.size} 条部署记录？`}
          {deleteMode === 'cleanup' && '清理旧部署记录'}
          {deleteMode === 'failed' && '清理失败部署记录'}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {deleteMode === 'single' && '删除后无法恢复，确定要删除这条部署记录吗？'}
            {deleteMode === 'batch' && '删除后无法恢复，确定要删除选中的部署记录吗？'}
            {deleteMode === 'cleanup' && '将删除所有站点中除最近 N 条以外的部署记录，此操作不可恢复。'}
            {deleteMode === 'failed' && '将删除所有状态为"失败"的部署记录，此操作不可恢复。'}
          </Typography>
          {deleteMode === 'cleanup' && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" sx={{ mb: 1, fontWeight: 500 }}>
                保留最近的记录数：
              </Typography>
              <FormControl size="small" fullWidth>
                <Select
                  value={deleteKeepCount}
                  onChange={(e) => setDeleteKeepCount(Number(e.target.value))}
                >
                  <MenuItem value={5}>保留最近 5 条</MenuItem>
                  <MenuItem value={10}>保留最近 10 条</MenuItem>
                  <MenuItem value={20}>保留最近 20 条</MenuItem>
                  <MenuItem value={50}>保留最近 50 条</MenuItem>
                  <MenuItem value={100}>保留最近 100 条</MenuItem>
                </Select>
              </FormControl>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={deleting} onClick={() => setDeleteDialogOpen(false)}>
            取消
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : <TrashIcon size={16} />}
            onClick={handleDeleteConfirm}
          >
            {deleting ? '删除中...' : '确认删除'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 部署弹窗 */}
      <Dialog open={deployOpen} onClose={() => deployPhase !== 'running' && setDeployOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <RocketIcon size={20} />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>部署服务</Typography>
            {deployPhase === 'idle' && (
              <Chip
                size="small"
                color="primary"
                label="完整版"
                sx={{ ml: 1 }}
              />
            )}
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          {/* 确认页 */}
          {deployPhase === 'idle' && (
            <>
              {/* 站点信息摘要 */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  p: 1.5,
                  borderRadius: 1.5,
                  bgcolor: 'action.hover',
                }}
              >
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: 1,
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <RocketIcon size={20} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    {siteMap[deploySiteId]?.name || deploySiteId}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {deployDomains.length > 0
                      ? `${deployDomains.map(d => d.domain).join(', ')} · ${deployConfigPreview?.remotePath}`
                      : `${deployConfigPreview?.domain || '未绑定域名'} · ${deployConfigPreview?.remotePath}`}
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  color="primary"
                  label="完整版"
                />
              </Box>

              {/* 环境检测卡片 */}
              <Box
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1.5,
                  overflow: 'hidden',
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 1.5,
                    py: 1,
                    bgcolor: 'action.hover',
                    borderBottom: 1,
                    borderColor: 'divider',
                  }}
                >
                    <CheckCircleIcon size={14} color={envReadiness?.isReady ? '#66BB6A' : '#94A3B8'} />
                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 12, flex: 1 }}>
                      环境检测
                    </Typography>
                    {envCheckLoading ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <CircularProgress size={12} thickness={3} />
                        <Typography variant="caption" color="text.secondary">检测中...</Typography>
                      </Box>
                    ) : envReadiness ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip
                          size="small"
                          label={`${envReadiness.score} 分`}
                          sx={{
                            height: 18,
                            fontSize: 10,
                            fontWeight: 600,
                            bgcolor: envReadiness.isReady
                              ? 'rgba(102, 187, 106, 0.15)'
                              : envReadiness.failed > 0
                                ? 'rgba(239, 83, 80, 0.15)'
                                : 'rgba(255, 167, 38, 0.15)',
                            color: envReadiness.isReady
                              ? '#66BB6A'
                              : envReadiness.failed > 0
                                ? '#EF5350'
                                : '#FFA726',
                          }}
                        />
                        <IconButton size="small" onClick={runEnvCheckInDialog} title="重新检测">
                          <ArrowsClockwiseIcon size={12} />
                        </IconButton>
                      </Box>
                    ) : (
                      <Button size="small" onClick={runEnvCheckInDialog}>
                        开始检测
                      </Button>
                    )}
                  </Box>

                  {envCheckError && (
                    <Box sx={{ px: 1.5, py: 1 }}>
                      <Alert severity="error" sx={{ py: 0 }}>
                        <Typography variant="caption">{envCheckError}</Typography>
                      </Alert>
                    </Box>
                  )}

                  {envReadiness && (
                    <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <MiniStat label="通过" value={envReadiness.passed} color="#66BB6A" />
                        <MiniStat label="警告" value={envReadiness.warning} color="#FFA726" />
                        <MiniStat label="失败" value={envReadiness.failed} color="#EF5350" />
                      </Box>
                      <Box sx={{ display: 'flex', gap: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {envReadiness.nginxOk ? (
                            <CheckCircleIcon size={12} color="#66BB6A" weight="fill" />
                          ) : (
                            <XCircleIcon size={12} color="#EF5350" weight="fill" />
                          )}
                          <Typography variant="caption" sx={{ fontSize: 11 }}>Nginx</Typography>
                        </Box>
                      </Box>
                      {!envReadiness.isReady && (
                        <Alert severity="warning" sx={{ py: 0.5 }} icon={<WarningCircleIcon size={14} />}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                            <Typography variant="caption">
                              环境未满足部署要求
                            </Typography>
                            {onGoToEnvCheck && (
                              <Button
                                size="small"
                                variant="outlined"
                                color="warning"
                                onClick={() => {
                                  setDeployOpen(false);
                                  onGoToEnvCheck();
                                }}
                                sx={{ py: 0, fontSize: 11, minWidth: 'auto' }}
                              >
                                去修复
                              </Button>
                            )}
                          </Box>
                        </Alert>
                      )}
                    </Box>
                  )}
              </Box>

              {/* 部署配置（可编辑） */}
              {deployConfigPreview && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, fontSize: 12 }}>
                      部署配置
                    </Typography>
                    {!configEditing ? (
                      <Button
                        size="small"
                        startIcon={<PencilIcon size={12} weight="bold" />}
                        onClick={() => setConfigEditing(true)}
                        sx={{ textTransform: 'none', fontSize: 11, py: 0, minWidth: 'auto' }}
                      >
                        编辑
                      </Button>
                    ) : (
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Button
                          size="small"
                          color="inherit"
                          onClick={() => setConfigEditing(false)}
                          disabled={configSaving}
                          sx={{ textTransform: 'none', fontSize: 11, py: 0, minWidth: 'auto' }}
                        >
                          取消
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          onClick={handleSaveDeployConfig}
                          disabled={configSaving}
                          startIcon={configSaving ? <CircularProgress size={12} color="inherit" /> : <CheckIcon size={12} weight="bold" />}
                          sx={{ textTransform: 'none', fontSize: 11, py: 0, minWidth: 'auto' }}
                        >
                          保存
                        </Button>
                      </Box>
                    )}
                  </Box>
                  {!configEditing ? (
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1.25,
                        p: 1.5,
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: 1.5,
                        bgcolor: 'background.paper',
                      }}
                    >
                      {/* 基础配置 */}
                      <ConfigGroup title="基础配置" icon={
                        <svg width="14" height="14" viewBox="0 0 256 256" fill="none"><path d="M128,88a40,40,0,1,0,40,40A40,40,0,0,0,128,88Zm0,64a24,24,0,1,1,24-24A24,24,0,0,1,128,152Zm93.13-59.42a8,8,0,0,0-7-5.66l-28.19-4.1-12.6-25.53a8,8,0,0,0-10.33-3.77l-25.23,10.6a88.36,88.36,0,0,0-29.52,0L82.99,53.62a8,8,0,0,0-10.33,3.77L60.06,82.82,31.87,86.92a8,8,0,0,0-6.39,13.65L45,120.7,25.48,140.87a8,8,0,0,0,5.31,13.7l28.27,4.11,12.6,25.53a8,8,0,0,0,11.3,4.18l24.12-10.13a88.46,88.46,0,0,0,29.52,0l24.12,10.13a8,8,0,0,0,11.3-4.18l12.6-25.53,28.27-4.11a8,8,0,0,0,5.31-13.7L211,120.7l19.51-20.13A8,8,0,0,0,221.13,92.58ZM195.3,147.78a8,8,0,0,0-2.49,1.81l-.18.18-23.13,20.75a8,8,0,0,0-1.87,6.9l3.83,27.85a8,8,0,0,0-12.34,7l-4-27.74a8,8,0,0,0-3.08-5.67l-23.58-17.27a8,8,0,0,0-7.72-.69l-27.34,9.79a8,8,0,0,0-5.69,5.13l-7.6,26.48a8,8,0,0,0-15.11-4.34l7.55-26.31a8,8,0,0,0-3.81-5.35L68.58,147a8,8,0,0,0-9-.13L38.32,158.16,56.56,140a8,8,0,0,0,2.49-1.81l.18-.18,23.13-20.75a8,8,0,0,0,1.87-6.9l-3.83-27.85a8,8,0,0,0,12.34-7l4,27.74a8,8,0,0,0,3.08,5.67l23.58,17.27a8,8,0,0,0,7.72.69l27.34-9.79a8,8,0,0,0,5.69-5.13l7.6-26.48a8,8,0,0,0,15.11,4.34l-7.55,26.31a8,8,0,0,0,3.81,5.35l22.57,16.54a8,8,0,0,0,9,.13l21.26-11.29L199.44,140A8,8,0,0,0,195.3,147.78Z" fill="currentColor"/></svg>
                      }>
                        <Box>
                          <ConfigRow label="远程路径" value={deployConfigPreview.remotePath} mono />
                        </Box>
                      </ConfigGroup>

                      {/* Nginx & 域名 */}
                      <ConfigGroup title="Nginx & 域名" icon={
                        <svg width="14" height="14" viewBox="0 0 256 256" fill="none"><circle cx="128" cy="128" r="96" style={{fill:'none',stroke:'currentColor',strokeWidth:'16'}}/><path d="M92,148l36-72,36,72" style={{fill:'none',stroke:'currentColor',strokeWidth:'16',strokeLinecap:'round',strokeLinejoin:'round'}}/><line x1="100" y1="128" x2="156" y2="128" style={{fill:'none',stroke:'currentColor',strokeWidth:'16',strokeLinecap:'round'}}/></svg>
                      }>
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 2, alignItems: 'center' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                              Nginx
                            </Typography>
                            <Chip
                              size="small"
                              variant="filled"
                              color={deployConfigPreview.enableNginx ? 'success' : 'default'}
                              label={deployConfigPreview.enableNginx ? '已启用' : '已禁用'}
                              sx={{ height: 20, fontSize: 10, '& .MuiChip-label': { px: 1, py: 0 } }}
                            />
                          </Box>
                          <ConfigRow label="域名" value={
                            deployDomains.length > 0
                              ? deployDomains.map(d => d.domain + (d.is_primary ? ' (主)' : '')).join(', ')
                              : (deployConfigPreview.domain || '未设置')
                          } mono={!!deployConfigPreview.domain} />
                          {deployDomains.length > 1 && (
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, pl: 1 }}>
                              共 {deployDomains.length} 个域名，Nginx server_name 将包含全部域名
                            </Typography>
                          )}
                        </Box>
                      </ConfigGroup>

                      {/* 提示 */}
                      <Alert severity="info" sx={{ py: 0.5, '& .MuiAlert-message': { py: 0 } }}>
                        <Typography variant="caption" sx={{ lineHeight: 1.4 }}>
                          以上配置将在<strong>下次部署</strong>时生效，修改后点击「开始部署」即可应用
                        </Typography>
                      </Alert>
                    </Box>
                  ) : (
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1.5,
                        p: 1.5,
                        border: 1,
                        borderColor: 'primary.light',
                        borderRadius: 1,
                        bgcolor: 'background.paper',
                      }}
                    >
                      {/* 基础配置 */}
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <TextField
                          label="远程路径"
                          value={editRemotePath}
                          onChange={(e) => setEditRemotePath(e.target.value)}
                          size="small"
                          sx={{ flex: 1 }}
                          placeholder="/var/www/example.com/html"
                        />
                      </Box>
                      {/* Nginx + 域名 */}
                      <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 1.5, alignItems: 'center' }}>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={editEnableNginx}
                              onChange={(e) => setEditEnableNginx(e.target.checked)}
                              size="small"
                            />
                          }
                          label={<Typography variant="body2">启用 Nginx</Typography>}
                        />
                        <TextField
                          label="域名"
                          value={editDomain}
                          onChange={(e) => setEditDomain(e.target.value)}
                          size="small"
                          placeholder="example.com"
                        />
                      </Box>
                    </Box>
                  )}
                </Box>
              )}
            </>
          )}

          {/* 运行中 */}
          {deployPhase === 'running' && deployProgress && (
            <>
              {/* 头部进度概览 */}
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 1.5,
                  py: 1,
                }}
              >
                <Box sx={{ position: 'relative', width: 72, height: 72 }}>
                  <CircularProgress
                    variant="determinate"
                    value={deployProgress.percent}
                    size={72}
                    thickness={4}
                    sx={{ color: 'primary.main' }}
                  />
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 18, lineHeight: 1 }}>
                      {deployProgress.percent}%
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                  <Chip
                    size="small"
                    color="primary"
                    label={deployProgress.step}
                    sx={{ fontWeight: 600, mb: 0.5 }}
                  />
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>
                    {deployProgress.message}
                  </Typography>
                </Box>
              </Box>

              {/* 进度条 */}
              <Box sx={{ px: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={deployProgress.percent}
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    bgcolor: 'action.hover',
                    '& .MuiLinearProgress-bar': {
                      borderRadius: 3,
                      transition: 'transform 0.3s ease',
                    },
                  }}
                />
              </Box>

              {/* 步骤列表 */}
              <Box
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1.5,
                  overflow: 'hidden',
                  bgcolor: 'action.hover',
                }}
              >
                  <Box
                    sx={{
                      px: 1.5,
                      py: 1,
                      borderBottom: 1,
                      borderColor: 'divider',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.75,
                    }}
                  >
                    <ListChecksIcon size={14} color="#64748B" />
                    <Typography variant="caption" sx={{ fontWeight: 600, fontSize: 11, color: 'text.secondary' }}>
                      部署步骤
                    </Typography>
                    <Typography variant="caption" sx={{ fontSize: 10, color: 'text.disabled', ml: 'auto' }}>
                      {activeDeploySteps.findIndex((x) => x.key === deployProgress.step) + 1} / {activeDeploySteps.length}
                    </Typography>
                  </Box>
                  <Box sx={{ maxHeight: 200, overflow: 'auto', p: 0.5 }}>
                    {activeDeploySteps.map((s, i) => {
                      const currentIdx = activeDeploySteps.findIndex((x) => x.key === deployProgress.step);
                      let status: 'done' | 'active' | 'pending' = 'pending';
                      if (i < currentIdx) status = 'done';
                      else if (i === currentIdx) status = 'active';

                      return (
                        <Box
                          key={s.key}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            py: 0.75,
                            px: 1,
                            borderRadius: 0.75,
                            transition: 'all 0.2s ease',
                            bgcolor: status === 'active' ? 'background.paper' : 'transparent',
                            ...(status === 'active' && {
                              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                            }),
                          }}
                        >
                          <Box sx={{ position: 'relative', width: 18, height: 18, flexShrink: 0 }}>
                            {status === 'done' ? (
                              <Box
                                sx={{
                                  width: 18,
                                  height: 18,
                                  borderRadius: '50%',
                                  bgcolor: '#66BB6A',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <CheckCircleIcon size={12} weight="fill" color="white" />
                              </Box>
                            ) : status === 'active' ? (
                              <Box
                                sx={{
                                  width: 18,
                                  height: 18,
                                  borderRadius: '50%',
                                  border: '2px solid',
                                  borderColor: 'primary.main',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <Box
                                  sx={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: '50%',
                                    bgcolor: 'primary.main',
                                    animation: 'pulse-step 1.2s ease-in-out infinite',
                                    '@keyframes pulse-step': {
                                      '0%, 100%': { transform: 'scale(1)', opacity: 1 },
                                      '50%': { transform: 'scale(1.3)', opacity: 0.7 },
                                    },
                                  }}
                                />
                              </Box>
                            ) : (
                              <Box
                                sx={{
                                  width: 18,
                                  height: 18,
                                  borderRadius: '50%',
                                  border: '2px solid',
                                  borderColor: 'divider',
                                }}
                              />
                            )}
                          </Box>
                          <Typography
                            variant="body2"
                            sx={{
                              fontSize: 12,
                              fontWeight: status === 'active' ? 600 : status === 'done' ? 500 : 400,
                              color: status === 'done'
                                ? 'text.secondary'
                                : status === 'active'
                                  ? 'text.primary'
                                  : 'text.disabled',
                              transition: 'all 0.2s ease',
                            }}
                          >
                            {s.label}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Box>
              </Box>
            </>
          )}

          {/* 成功页 - 二进制部署 */}
          {deployPhase === 'success' && deployResult && (
            <>
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 1,
                  py: 1,
                }}
              >
                <Box
                  sx={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    bgcolor: 'rgba(102, 187, 106, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CheckCircleIcon size={32} weight="fill" color="#66BB6A" />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>部署成功</Typography>
                <Typography variant="caption" color="text.secondary">
                  二进制已上传并拉起 · 总耗时 {(deployResult.durationMs / 1000).toFixed(0)} 秒
                </Typography>
              </Box>

              {/* 访问地址 */}
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 1.5,
                  bgcolor: 'action.hover',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary">访问地址</Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      fontFamily: 'monospace',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {deployResult.baseUrl}
                  </Typography>
                </Box>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<RocketIcon size={14} />}
                  onClick={() => openUrl(deployResult.baseUrl).catch(() => {})}
                >
                  打开
                </Button>
              </Box>

              {/* 统计 */}
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 1,
                }}
              >
                <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: 'action.hover' }}>
                  <Typography variant="caption" color="text.secondary">已上传文件</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.25 }}>
                    {deployResult.uploadedCount} 个
                  </Typography>
                </Box>
                <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: 'action.hover' }}>
                  <Typography variant="caption" color="text.secondary">传输体积</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.25 }}>
                    {(deployResult.totalBytes / 1024 / 1024).toFixed(1)} MB
                  </Typography>
                </Box>
              </Box>

              {/* 快捷操作 */}
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ClockIcon size={14} />}
                  onClick={() => setDeployShowLog((v) => !v)}
                  sx={{ flex: 1 }}
                >
                  {deployShowLog ? '收起日志' : '部署日志'}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<HardDriveIcon size={14} />}
                  onClick={() => {
                    setDeployOpen(false);
                    void loadServiceStatus(deploySiteId);
                  }}
                  sx={{ flex: 1 }}
                >
                  查看服务
                </Button>
              </Box>

              {deployShowLog && deployResult.log.length > 0 && (
                <Box
                  sx={{
                    maxHeight: 160,
                    overflow: 'auto',
                    bgcolor: '#0F172A',
                    borderRadius: 1,
                    p: 1.5,
                    color: '#E2E8F0',
                    fontSize: 10.5,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                    lineHeight: 1.5,
                  }}
                >
                  {deployResult.log.map((line, i) => (
                    <Box key={i} sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {line}
                    </Box>
                  ))}
                </Box>
              )}
            </>
          )}


          {/* 失败页 */}
          {deployPhase === 'failed' && (
            <>
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 1,
                  py: 1,
                }}
              >
                <Box
                  sx={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    bgcolor: 'rgba(239, 83, 80, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <XCircleIcon size={32} weight="fill" color="#EF5350" />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>部署失败</Typography>
              </Box>

              <Box
                sx={{
                  maxHeight: 200,
                  overflow: 'auto',
                  p: 1.5,
                  borderRadius: 1.5,
                  bgcolor: 'rgba(239, 83, 80, 0.08)',
                  border: 1,
                  borderColor: 'error.main',
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    whiteSpace: 'pre-wrap',
                    fontSize: 12,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                    color: 'error.main',
                    lineHeight: 1.5,
                  }}
                >
                  {deployError}
                </Typography>
              </Box>

              {deployError.includes('环境未满足') && (
                <Alert severity="info" sx={{ py: 0.5 }} icon={<InfoIcon size={14} />}>
                  <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 12 }}>
                    前往「环境检测」页签，使用 AI 智能修复自动安装依赖
                  </Typography>
                </Alert>
              )}

              {deployError.includes('未找到') && deployError.includes('二进制') && (
                <Alert severity="info" sx={{ py: 0.5 }} icon={<InfoIcon size={14} />}>
                  <Typography variant="body2" sx={{ fontSize: 12 }}>
                    请将 webcraft-server 二进制文件放入项目 bin/ 目录
                  </Typography>
                </Alert>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          {deployPhase === 'idle' && (
            <>
              <Button onClick={() => setDeployOpen(false)}>取消</Button>
              {/* 静态部署（路线B：上传 dist/ → Nginx 提供服务） */}
              <Button
                variant="contained"
                startIcon={<RocketIcon size={16} weight="bold" />}
                onClick={() => void handleStartDeploy()}
                disabled={
                  envReadiness != null && !envReadiness.isReady
                }
              >
                开始部署
              </Button>
            </>
          )}
          {deployPhase === 'running' && (
            <Button disabled startIcon={<CircularProgress size={16} color="inherit" />}>
              部署中...
            </Button>
          )}
          {deployPhase === 'success' && (
            <Button variant="contained" onClick={() => setDeployOpen(false)}>
              完成
            </Button>
          )}
          {deployPhase === 'failed' && (
            <>
              <Button onClick={() => setDeployOpen(false)}>关闭</Button>
              <Button variant="contained" startIcon={<ArrowCounterClockwiseIcon size={16} />} onClick={() => void handleStartDeploy()}>
                重试
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function InfoItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography
        variant="body2"
        sx={{
          fontWeight: 500,
          fontSize: 12,
          fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' : undefined,
        }}
        noWrap
      >
        {value}
      </Typography>
    </Box>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Box
      sx={{
        flex: 1,
        textAlign: 'center',
        py: 0.75,
        px: 1,
        borderRadius: 0.75,
        bgcolor: `${color}15`,
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 700, fontSize: 14, color }}>
        {value}
      </Typography>
      <Typography variant="caption" sx={{ fontSize: 10, color: 'text.secondary' }}>
        {label}
      </Typography>
    </Box>
  );
}

function ConfigGroup({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
        p: 1.25,
        borderRadius: 1.25,
        bgcolor: 'action.hover',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'primary.main' }}>
        {icon}
        <Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11, color: 'text.primary' }}>
          {title}
        </Typography>
      </Box>
      {children}
    </Box>
  );
}

function ConfigRow({
  label,
  value,
  mono,
  sx,
}: {
  label: string;
  value: string;
  mono?: boolean;
  sx?: SxProps;
}) {
  return (
    <Box sx={{ minWidth: 0, ...sx }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, display: 'block', mb: 0.25 }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          fontWeight: 500,
          fontSize: 12,
          fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' : undefined,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          color: value === '未设置' ? 'text.disabled' : 'text.primary',
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function StatusMini({ label, value, color, mono }: { label: string; value: string; color?: string; mono?: boolean }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, display: 'block', mb: 0.25 }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          fontWeight: 600,
          fontSize: 12,
          color: color || 'text.primary',
          fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' : undefined,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={value}
      >
        {value}
      </Typography>
    </Box>
  );
}

function StepRow({ step }: { step: DeploymentStep }) {
  const statusColor = STATUS_COLOR[step.status] || '#94A3B8';
  const StatusIcon = step.status === 'success' ? CheckCircleIcon
    : step.status === 'failed' ? XCircleIcon
    : step.status === 'running' ? PlayIcon
    : ClockIcon;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        p: 1,
        borderRadius: 1,
        bgcolor: 'action.hover',
      }}
    >
      <StatusIcon size={16} color={statusColor} weight="fill" />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 500, fontSize: 12 }}>
            {step.name || step.key}
          </Typography>
          <Chip
            label={STATUS_LABEL[step.status] || step.status}
            size="small"
            sx={{
              height: 16,
              fontSize: 10,
              fontWeight: 600,
              bgcolor: `${statusColor}22`,
              color: statusColor,
            }}
          />
        </Box>
        {step.message && (
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }} noWrap>
            {step.message}
          </Typography>
        )}
        {step.status === 'running' && (
          <LinearProgress
            variant="determinate"
            value={step.percent}
            sx={{ mt: 0.5, height: 3, borderRadius: 1.5 }}
          />
        )}
      </Box>
      {step.percent > 0 && step.status !== 'running' && (
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
          {step.percent}%
        </Typography>
      )}
    </Box>
  );
}
