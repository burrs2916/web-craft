import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Deployment, DeploymentStats, DeployOutcome, DeployProgress, ServiceStatus, Site, SiteDomain } from '../../../proto/cms';
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
} from '../../../core/services/cms.service';
import { opsRunScript } from '../../../core/services/ops.service';
import { openSftpWindow } from '../../../core/services/window.service';
import type { SshConnectionInfo } from '../../../proto';
import type { EnvCheckResult } from '../../../proto/env-check';
import type { ServiceAction } from './ActionConfirmDialog';
import type { DeleteMode } from './DeleteConfirmDialog';
import {
  BINARY_DEPLOY_STEPS,
  fireDeployNotification,
  type DeployPhase,
  type TriggerFilter,
} from './shared';
import type { DeployPanelProps } from './types';

export function useDeployPanel({ connectionId, connections = [], onGoToEnvCheck, autoDeployFirst, onAutoOpened }: DeployPanelProps) {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 部署历史按触发方式筛选（运维视图）—— 让「工作连续性」（定时/启动自动部署）在历史上可见
  const [triggerFilter, setTriggerFilter] = useState<TriggerFilter>('all');

  // 批量选择的部署记录 ID
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 清理/删除菜单
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  // 删除确认弹窗
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState<DeleteMode>('single');
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
  const [confirmAction, setConfirmAction] = useState<ServiceAction>('restart');
  const [confirmSiteId, setConfirmSiteId] = useState('');
  const [confirmDeploymentId, setConfirmDeploymentId] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  // 部署弹窗
  const [deployOpen, setDeployOpen] = useState(false);
  const [deploySiteId, setDeploySiteId] = useState('');
  const [deployPhase, setDeployPhase] = useState<DeployPhase>('idle');
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

  // 打开服务操作确认弹窗
  const handleServiceAction = useCallback((action: ServiceAction, siteId: string) => {
    setConfirmAction(action);
    setConfirmSiteId(siteId);
    setConfirmOpen(true);
  }, []);

  // 打开回滚确认弹窗（列表行）
  const handleRollbackDeployment = useCallback((deploymentId: string, siteId: string) => {
    setConfirmAction('rollback');
    setConfirmSiteId(siteId);
    setConfirmDeploymentId(deploymentId);
    setConfirmOpen(true);
  }, []);

  // 部署弹窗内「查看服务」：关闭弹窗并刷新状态
  const handleViewService = useCallback(() => {
    setDeployOpen(false);
    void loadServiceStatus(deploySiteId);
  }, [deploySiteId, loadServiceStatus]);

  return {
    // 站点
    sites, siteMap, connectionSites,
    // 服务状态
    serviceStatusMap, statusLoadingMap, loadServiceStatus,
    // 部署历史
    deployments, total, loading, error,
    selectedIds, menuAnchor, setMenuAnchor,
    continuityOverview, triggerCounts, triggerFilter, setTriggerFilter,
    filteredDeployments, pagedDeployments, page, setPage, pageSize, setPageSize,
    allSelected, someSelected,
    toggleSelect, toggleSelectAll, handleDeleteBatch, handleCleanup, handleDeleteFailed,
    loadDeployments,
    // 详情
    detailOpen, setDetailOpen, detailLoading, detailDeployment, handleViewDetail,
    // 服务操作确认
    confirmOpen, setConfirmOpen, confirmAction, actionLoading, actionError,
    handleConfirmAction, handleServiceAction, handleRollbackDeployment,
    // 删除/清理
    deleteDialogOpen, setDeleteDialogOpen, deleteMode, deleteKeepCount, setDeleteKeepCount,
    deleting, handleDeleteSingle, handleDeleteConfirm,
    // 部署弹窗
    deployOpen, setDeployOpen, deploySiteId, deployPhase, deployProgress, deployError,
    deployResult, deployShowLog, setDeployShowLog, activeDeploySteps, deployDomains,
    deployConfigPreview, configEditing, setConfigEditing, configSaving,
    editRemotePath, setEditRemotePath, editEnableNginx, setEditEnableNginx,
    editDomain, setEditDomain, handleSaveDeployConfig,
    envCheckLoading, envReadiness, envCheckError, runEnvCheckInDialog,
    onGoToEnvCheck, handleStartDeploy, handleViewService, handleOpenDeployDialog,
    // SFTP
    handleOpenSftp,
  };
}