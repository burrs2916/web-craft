import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Chip,
  Alert,
  Snackbar,
  Tooltip,
  IconButton,
  Divider,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
  GlobeHemisphereWestIcon,
  PlusIcon,
  FolderOpenIcon,
  ArchiveIcon,
  ArrowClockwiseIcon,
  FileTextIcon,
  CloudIcon,
  LightningIcon,
  ListChecksIcon,
  EyeIcon,
  EyeSlashIcon,
  LockIcon,
  CheckCircleIcon,
  XCircleIcon,
  WifiHighIcon,
  MagnifyingGlassIcon,
  ArrowSquareOutIcon,
  PencilIcon,
  TrashIcon,
  MonitorIcon,
  RocketIcon,
} from '@phosphor-icons/react';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useNavigate } from 'react-router-dom';
import { createSite, listSites, archiveSite, updateSite, checkSiteHealthz, initRemoteSite, deleteSite, listSiteDomains, addSiteDomain, removeSiteDomain, checkDomainDns } from '../core/services/cms.service';
import { opsRunScript } from '../core/services/ops.service';
import EnvCheckPanel from '../components/ops/EnvCheckPanel';
import type { EnvCheckResult } from '../proto/env-check';
import { listConnections, testConnection, saveConnection } from '../core/services/connection.service';
import type { SiteSummary, Site, SshConnectionInfo, SiteDomain, DomainDnsStatus } from '../proto';
import type { ConnectionConfig } from '../proto';
import { generateId } from '../core/utils';
import { openSiteOpsWindow, openAiCopilotWindow } from '../core/services/window.service';

/// 将域名规范化为可直接访问的 URL：带 http(s) 原样保留，否则补 https://
function normalizeSiteUrl(domain: string): string {
  const d = domain.trim();
  if (!d) return '';
  if (/^https?:\/\//i.test(d)) return d;
  return `https://${d}`;
}

/// 按运行环境打开外链：Tauri 环境用 openUrl（唤起系统默认浏览器）；
/// 浏览器/Web 预览环境直接用 window.open（此时浏览器即“默认浏览器”）。
async function openSiteDomain(domain: string): Promise<void> {
  const url = normalizeSiteUrl(domain);
  if (!url) return;
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    try {
      await openUrl(url);
      return;
    } catch (err) {
      console.error('openSiteDomain: openUrl failed, fallback to window.open', { url, err });
    }
  }
  window.open(url, '_blank', 'noopener');
}

/// CMS 站点管理（FR-S2）：站点列表 + 新建向导（FR-S1 单站点形态）。
/// 数据来自 site_list 聚合视图；变更经 sites-changed 事件语义由操作后本地刷新承接。
export function SitesPage() {
  const { t } = useTranslation('cms');
  const navigate = useNavigate();

  const [summaries, setSummaries] = useState<SiteSummary[] | null>(null);
  const [connections, setConnections] = useState<ConnectionConfig[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /// 删除确认对话框
  const [deleteTarget, setDeleteTarget] = useState<SiteSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  /// 编辑站点对话框
  const [editTarget, setEditTarget] = useState<SiteSummary | null>(null);
  const [editing, setEditing] = useState(false);
  /// 绑定服务器的连通状态：connectionId -> checking/ok/fail，页面层去重后探测
  const [connStatus, setConnStatus] = useState<Record<string, 'checking' | 'ok' | 'fail'>>({});
  /// 已部署站点的 /healthz 状态：siteId -> checking/ok/fail
  const [healthzStatus, setHealthzStatus] = useState<Record<string, 'checking' | 'ok' | 'fail'>>({});

  const refresh = useCallback(async () => {
    try {
      setSummaries(await listSites());
    } catch (e) {
      setError(String(e));
      setSummaries([]);
    }
  }, []);

  useEffect(() => {
    refresh();
    listConnections().then(setConnections).catch(() => setConnections([]));
  }, [refresh]);

  // 对绑定服务器的站点做一次连通探测（去重，8s 超时，结果缓存到 connStatus）
  useEffect(() => {
    if (!summaries) return;
    const ids = Array.from(
      new Set(summaries.map((s) => s.connection_id).filter((x): x is string => !!x)),
    );
    for (const id of ids) {
      if (connStatus[id] && connStatus[id] !== 'fail') continue;
      const conn = connections.find((c) => c.id === id);
      if (!conn) continue;
      let ssh: SshConnectionInfo;
      try {
        ssh = JSON.parse(conn.config_json);
      } catch {
        continue;
      }
      setConnStatus((prev) => ({ ...prev, [id]: 'checking' }));
      testConnection(ssh, 8000)
        .then(() => setConnStatus((prev) => ({ ...prev, [id]: 'ok' })))
        .catch(() => setConnStatus((prev) => ({ ...prev, [id]: 'fail' })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaries, connections]);

  // 已部署站点的 HTTP 可达性探测（路线B：Nginx 80 端口，3s 超时，去重）
  useEffect(() => {
    if (!summaries) return;
    for (const s of summaries) {
      if (!s.connection_id || !s.last_deployed_at) continue;
      if (healthzStatus[s.id] && healthzStatus[s.id] !== 'fail') continue;
      setHealthzStatus((prev) => ({ ...prev, [s.id]: 'checking' }));
      checkSiteHealthz(s.id)
        .then((r) => setHealthzStatus((prev) => ({ ...prev, [s.id]: (r.code && [200, 301, 302].includes(r.code)) ? 'ok' : 'fail' })))
        .catch(() => setHealthzStatus((prev) => ({ ...prev, [s.id]: 'fail' })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaries]);

  const handleArchive = useCallback(
    async (site: Site) => {
      try {
        await archiveSite(site.id);
        setToast(t('sites.toast_archived', { name: site.name }));
        await refresh();
      } catch (e) {
        setError(String(e));
      }
    },
    [refresh, t],
  );

  const handleRestore = useCallback(
    async (site: Site) => {
      try {
        await updateSite({ ...site, status: 'active' });
        setToast(t('sites.toast_restored', { name: site.name }));
        await refresh();
      } catch (e) {
        setError(String(e));
      }
    },
    [refresh, t],
  );

  const handleDelete = useCallback(
    async (site: SiteSummary) => {
      try {
        setDeleting(true);
        await deleteSite(site.id);
        setToast(t('sites.toast_deleted', { name: site.name }));
        setDeleteTarget(null);
        await refresh();
      } catch (e) {
        setError(String(e));
      } finally {
        setDeleting(false);
      }
    },
    [refresh, t],
  );

  const handleEditSave = useCallback(
    async (site: Site) => {
      try {
        setEditing(true);
        await updateSite(site);
        setToast(t('sites.toast_updated', { name: site.name }));
        setEditTarget(null);
        await refresh();
      } catch (e) {
        setError(String(e));
      } finally {
        setEditing(false);
      }
    },
    [refresh, t],
  );

  const handleCreated = useCallback(
    async (site: Site) => {
      setCreateOpen(false);
      setToast(t('sites.toast_created', { name: site.name }));
      await refresh();
      navigate(`/sites/${site.id}`);
    },
    [refresh, t, navigate],
  );

  const active = useMemo(
    () => (summaries ?? []).filter((s) => s.status === 'active'),
    [summaries],
  );
  const archived = useMemo(
    () => (summaries ?? []).filter((s) => s.status === 'archived'),
    [summaries],
  );

  return (
    <Box sx={{ p: 3, width: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ mb: 0.5, fontWeight: 700 }}>
            {t('sites.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('sites.subtitle')}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<PlusIcon size={18} weight="bold" />}
          onClick={() => setCreateOpen(true)}
          sx={{ flexShrink: 0 }}
        >
          {t('sites.action_create')}
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {summaries === null ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={32} />
        </Box>
      ) : active.length === 0 ? (
        <Paper
          variant="outlined"
          sx={{
            p: 6,
            textAlign: 'center',
            borderStyle: 'dashed',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <GlobeHemisphereWestIcon size={44} weight="thin" color="text.secondary" />
          <Typography sx={{ fontWeight: 600 }}>{t('sites.empty_title')}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
            {t('sites.empty_hint')}
          </Typography>
          <Button
            variant="contained"
            startIcon={<PlusIcon size={18} weight="bold" />}
            onClick={() => setCreateOpen(true)}
            sx={{ mt: 1.5 }}
          >
            {t('sites.action_create')}
          </Button>
        </Paper>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 2 }}>
          {active.map((s) => (
            <SiteCard
              key={s.id}
              summary={s}
              connStatus={s.connection_id ? connStatus[s.connection_id] : undefined}
              healthz={s.connection_id && s.last_deployed_at ? healthzStatus[s.id] : undefined}
              onArchive={handleArchive}
              onEdit={(site) => setEditTarget(site)}
              onDelete={(site) => setDeleteTarget(site)}
              onOps={(site) => {
                if (site.connection_id) {
                  void openSiteOpsWindow({
                    siteId: site.id,
                    siteName: site.name,
                    connectionId: site.connection_id,
                  });
                }
              }}
            />
          ))}
        </Box>
      )}

      {archived.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t('sites.archived_section')}
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 2 }}>
            {archived.map((s) => (
              <SiteCard key={s.id} summary={s} connStatus={s.connection_id ? connStatus[s.connection_id] : undefined} healthz={s.connection_id && s.last_deployed_at ? healthzStatus[s.id] : undefined} onRestore={handleRestore} onDelete={(site) => setDeleteTarget(site)} />
            ))}
          </Box>
        </Box>
      )}

      <CreateSiteDialog
        open={createOpen}
        connections={connections}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
        onConnectionsChanged={() => listConnections().then(setConnections).catch(() => {})}
      />

      {/* 编辑站点对话框 */}
      <EditSiteDialog
        open={editTarget !== null}
        site={editTarget}
        connections={connections}
        saving={editing}
        onClose={() => !editing && setEditTarget(null)}
        onSave={handleEditSave}
        onConnectionsChanged={() => listConnections().then(setConnections).catch(() => {})}
      />

      {/* 删除确认对话框 */}
      <Dialog
        open={deleteTarget !== null}
        onClose={() => !deleting && setDeleteTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TrashIcon size={20} color="error" weight="fill" />
            {t('sites.delete_confirm_title')}
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t('sites.delete_confirm_hint')}
          </Typography>
          <Paper
            variant="outlined"
            sx={{
              p: 1.5,
              bgcolor: 'error.light',
              borderColor: 'error.main',
              opacity: 0.8,
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'error.dark' }}>
              {deleteTarget?.name}
            </Typography>
            <Typography variant="caption" color="error.dark" sx={{ opacity: 0.8 }}>
              {deleteTarget?.domain || t('sites.no_domain')}
            </Typography>
          </Paper>
          <Alert severity="warning" sx={{ mt: 2, fontSize: 12 }}>
            {t('sites.delete_warning')}
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>
            {t('common:action.cancel')}
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => deleteTarget && handleDelete(deleteTarget)}
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : <TrashIcon size={16} weight="bold" />}
          >
            {t('sites.action_delete')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!toast}
        autoHideDuration={2500}
        onClose={() => setToast(null)}
        message={toast ?? ''}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}

function formatTime(ts: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

function SiteCard({
  summary,
  connStatus,
  healthz,
  onArchive,
  onRestore,
  onDelete,
  onEdit,
  onOps,
}: {
  summary: SiteSummary;
  connStatus?: 'checking' | 'ok' | 'fail';
  /// 已部署站点的 /healthz 状态；有值时优先于 connStatus 展示
  healthz?: 'checking' | 'ok' | 'fail';
  onArchive?: (site: Site) => void;
  onRestore?: (site: Site) => void;
  onDelete?: (site: SiteSummary) => void;
  onEdit?: (site: SiteSummary) => void;
  onOps?: (site: SiteSummary) => void;
}) {
  const { t } = useTranslation('cms');
  const navigate = useNavigate();
  const archived = summary.status === 'archived';

  // 已部署站点显示服务健康；否则显示服务器连通
  const dotStatus = healthz ?? connStatus;
  const dotTooltip = healthz
    ? healthz === 'ok'
      ? t('sites.health_ok')
      : healthz === 'checking'
        ? t('sites.health_checking')
        : t('sites.health_fail')
    : connStatus === 'ok'
      ? t('sites.server_ok')
      : connStatus === 'checking'
        ? t('sites.server_checking')
        : t('sites.server_fail');

  return (
    <Paper
      variant="outlined"
      onClick={(e) => {
        // 点击按钮区域不触发卡片点击
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('[role="button"]')) return;
        if (!archived && summary.connection_id) {
          onOps?.(summary);
        } else if (!archived) {
          navigate(`/sites/${summary.id}`);
        }
      }}
      sx={{
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        opacity: archived ? 0.65 : 1,
        cursor: archived ? 'default' : 'pointer',
        transition: 'all 0.15s ease',
        '&:hover': archived ? {} : {
          borderColor: 'primary.main',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          transform: 'translateY(-1px)',
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
        {dotStatus ? (
          <Tooltip
            title={dotTooltip}
          >
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                flexShrink: 0,
                bgcolor:
                  dotStatus === 'ok'
                    ? 'success.main'
                    : dotStatus === 'checking'
                      ? 'text.disabled'
                      : 'error.main',
                animation: dotStatus === 'checking' ? 'pulse 1.2s ease-in-out infinite' : undefined,
                '@keyframes pulse': {
                  '0%, 100%': { opacity: 0.4 },
                  '50%': { opacity: 1 },
                },
              }}
            />
          </Tooltip>
        ) : null}
        <Typography sx={{ fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {summary.name}
        </Typography>
        {!archived && onArchive ? (
          <Tooltip title={t('sites.action_archive')}>
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); onArchive(summary); }}
              sx={{ color: 'text.secondary', '&:hover': { color: 'warning.main' } }}
            >
              <ArchiveIcon size={14} weight="bold" />
            </IconButton>
          </Tooltip>
        ) : null}
        {summary.domain ? (
          <Tooltip title={normalizeSiteUrl(summary.domain)} placement="top">
            <Chip
              clickable
              size="small"
              variant="outlined"
              icon={<ArrowSquareOutIcon size={12} />}
              label={summary.domain}
              onClick={(e) => {
                e.stopPropagation();
                void openSiteDomain(summary.domain);
              }}
              sx={{
                maxWidth: 200,
                height: 24,
                color: 'primary.main',
                '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
                '&:hover': {
                  borderColor: 'primary.main',
                  bgcolor: 'action.hover',
                  textDecoration: 'underline',
                },
              }}
            />
          </Tooltip>
        ) : null}
      </Box>

      {summary.local_workdir ? (
        <Typography variant="caption" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {summary.local_workdir}
        </Typography>
      ) : null}

      <Box sx={{ display: 'flex', gap: 2, color: 'text.secondary', mt: 0.5 }}>
        <Typography variant="body2">
          {t('sites.stat_draft')}: <Box component="span" sx={{ fontWeight: 700 }}>{summary.draft_count}</Box>
        </Typography>
        <Typography variant="body2">
          {t('sites.stat_published')}: <Box component="span" sx={{ fontWeight: 700 }}>{summary.published_count}</Box>
        </Typography>
        {summary.connection_id ? null : (
          <Typography variant="body2">{t('sites.stat_local_only')}</Typography>
        )}
      </Box>

      <Typography variant="caption" color="text.secondary">
        {t('sites.stat_last_deployed')}: {formatTime(summary.last_deployed_at)}
      </Typography>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 1, mt: 0.5 }}>
        {archived ? (
          <>
            <Button
              size="small"
              startIcon={<ArrowClockwiseIcon size={16} weight="bold" />}
              onClick={() => onRestore?.(summary)}
            >
              {t('sites.action_restore')}
            </Button>
            <Button
              size="small"
              color="error"
              startIcon={<TrashIcon size={16} weight="bold" />}
              onClick={(e) => { e.stopPropagation(); onDelete?.(summary); }}
            >
              {t('sites.action_delete')}
            </Button>
          </>
        ) : (
          <>
            <Button
              size="small"
              startIcon={<ListChecksIcon size={16} weight="bold" />}
              onClick={(e) => { e.stopPropagation(); onOps?.(summary); }}
              disabled={!summary.connection_id}
            >
              {t('sites.action_ops')}
            </Button>
            <Button
              size="small"
              startIcon={<GlobeHemisphereWestIcon size={16} weight="bold" />}
              onClick={(e) => { e.stopPropagation(); navigate(`/sites/${summary.id}`); }}
            >
              {t('sites.action_contents')}
            </Button>
            <Button
              size="small"
              startIcon={<PencilIcon size={16} weight="bold" />}
              onClick={(e) => { e.stopPropagation(); onEdit?.(summary); }}
            >
              {t('sites.action_edit')}
            </Button>
            <Button
              size="small"
              color="error"
              startIcon={<TrashIcon size={16} weight="bold" />}
              onClick={(e) => { e.stopPropagation(); onDelete?.(summary); }}
            >
              {t('sites.action_delete')}
            </Button>
          </>
        )}
      </Box>
    </Paper>
  );
}

/* —— 服务器信息卡片（选中后展示） —— */
function ServerInfoCard({
  connectionId,
  connections,
  onChange,
  onRemove,
}: {
  connectionId: string;
  connections: ConnectionConfig[];
  onChange: () => void;
  /// 站点必须绑定服务器，新建流程不再提供「移除」入口，故此回调可选
  onRemove?: () => void;
}) {
  const { t } = useTranslation('cms');
  const conn = connections.find((c) => c.id === connectionId);

  if (!conn) return null;

  let host = '';
  let username = '';
  let port = 22;
  try {
    const s = JSON.parse(conn.config_json);
    host = s.host || '';
    username = s.username || '';
    port = s.port || 22;
  } catch {}

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.75,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        borderRadius: '10px',
        bgcolor: 'background.paper',
      }}
    >
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: '8px',
          bgcolor: 'primary.main',
          opacity: 0.1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: 'primary.main',
        }}
      >
        <LightningIcon size={18} weight="fill" />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
          {conn.name}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontFamily: 'monospace', fontSize: 11 }}
        >
          {username}@{host}:{port}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        <Tooltip title={t('sites.change_server')}>
          <IconButton size="small" onClick={onChange} sx={{ borderRadius: '6px' }}>
            <PencilIcon size={14} />
          </IconButton>
        </Tooltip>
        {onRemove && (
          <Tooltip title={t('sites.remove_server')}>
            <IconButton size="small" onClick={onRemove} sx={{ borderRadius: '6px', color: 'text.secondary' }}>
              <TrashIcon size={14} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Paper>
  );
}

function CreateSiteDialog({
  open,
  connections,
  onClose,
  onCreated,
  onConnectionsChanged,
}: {
  open: boolean;
  connections: ConnectionConfig[];
  onClose: () => void;
  onCreated: (site: Site) => void;
  onConnectionsChanged?: () => void;
}) {
  const { t } = useTranslation('cms');
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [connectionId, setConnectionId] = useState<string>('');
  const [remotePath, setRemotePath] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  /// 打开弹窗时重新拉取连接，避免用户停留在页面期间新增的服务器不生效
  const [connLoading, setConnLoading] = useState(false);
  // 远程初始化进度
  const [initStep, setInitStep] = useState<'idle' | 'creating' | 'init_remote' | 'done'>('idle');
  const [initError, setInitError] = useState<string | null>(null);
  const [createdSite, setCreatedSite] = useState<Site | null>(null);
  // 环境检测（新建站点 → 环境检测 → 部署 统一闭环）
  const [envResult, setEnvResult] = useState<EnvCheckResult | null>(null);
  const [envLoading, setEnvLoading] = useState(false);
  const [envError, setEnvError] = useState('');
  const [envCheckedAt, setEnvCheckedAt] = useState<number | null>(null);

  // 快速新建连接对话框
  const [quickConnOpen, setQuickConnOpen] = useState(false);
  const [qcMode, setQcMode] = useState<'list' | 'new'>('list');
  const [qcSearch, setQcSearch] = useState('');
  const [qcName, setQcName] = useState('');
  const [qcHost, setQcHost] = useState('');
  const [qcPort, setQcPort] = useState('22');
  const [qcUser, setQcUser] = useState('root');
  const [qcAuth, setQcAuth] = useState<'password' | 'private_key'>('password');
  const [qcPassword, setQcPassword] = useState('');
  const [qcKeyPath, setQcKeyPath] = useState('');
  const [qcShowPassword, setQcShowPassword] = useState(false);
  const [qcSaving, setQcSaving] = useState(false);
  const [qcTesting, setQcTesting] = useState(false);
  const [qcTestResult, setQcTestResult] = useState<'ok' | 'fail' | null>(null);
  const [qcError, setQcError] = useState<string | null>(null);

  const sshConnections = useMemo(
    () => connections.filter((c) => c.connection_type === 'ssh'),
    [connections],
  );

  // 搜索过滤后的连接列表
  const filteredConnections = useMemo(() => {
    if (!qcSearch.trim()) return sshConnections;
    const kw = qcSearch.trim().toLowerCase();
    return sshConnections.filter((c) => {
      if (c.name.toLowerCase().includes(kw)) return true;
      try {
        const s = JSON.parse(c.config_json);
        return (
          s.host?.toLowerCase().includes(kw) ||
          s.username?.toLowerCase().includes(kw) ||
          `${s.username}@${s.host}`.toLowerCase().includes(kw)
        );
      } catch {
        return false;
      }
    });
  }, [sshConnections, qcSearch]);

  // 打开时重置表单，并重新拉取服务器连接（站点必须绑定远程服务器）
  useEffect(() => {
    if (!open) return;
    setName('');
    setDomain('');
    setRemotePath('');
    setFormError(null);
    setSubmitting(false);
    setInitStep('idle');
    setInitError(null);
    setCreatedSite(null);
    setEnvResult(null);
    setEnvLoading(false);
    setEnvError('');
    setEnvCheckedAt(null);

    let cancelled = false;
    void (async () => {
      setConnLoading(true);
      try {
        const latest = await listConnections();
        if (cancelled) return;
        const ssh = latest.filter((c) => c.connection_type === 'ssh');
        setConnectionId(ssh.length > 0 ? ssh[0].id : '');
        onConnectionsChanged?.();
      } catch {
        if (!cancelled) setConnectionId('');
      } finally {
        if (!cancelled) setConnLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // 域名变化时更新远程路径（仅当用户未手动修改过时）
  useEffect(() => {
    if (connectionId && domain.trim()) {
      const defaultPath = `/var/www/${domain.trim()}/html`;
      // 只有当前路径为空或为默认路径时才自动更新
      if (!remotePath || remotePath === '/var/www/' || remotePath.startsWith('/var/www/') && remotePath.endsWith('/html')) {
        setRemotePath(defaultPath);
      }
    }
  }, [domain, connectionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 环境检测：复用运维中心 ops-web-env-check 脚本，把「目标服务器能否部署」结构化返回。
  const runEnvCheck = useCallback(async () => {
    if (!connectionId) return;
    setEnvLoading(true);
    setEnvError('');
    try {
      const params: Record<string, string> = {
        domain: domain || name || '',
        deploy_path: remotePath || '',

      };
      const result = await opsRunScript('ops-web-env-check', params, connectionId);
      if (!result.success) {
        throw new Error(result.stderr || result.stdout || t('sites.envcheck_failed'));
      }
      const stdout = result.stdout.trim();
      const firstBrace = stdout.indexOf('{');
      const lastBrace = stdout.lastIndexOf('}');
      if (firstBrace === -1 || lastBrace === -1) {
        throw new Error(t('sites.envcheck_parse_failed'));
      }
      const data = JSON.parse(stdout.slice(firstBrace, lastBrace + 1)) as EnvCheckResult;
      setEnvResult(data);
      setEnvCheckedAt(Date.now());
    } catch (e) {
      setEnvError(String(e));
      setEnvResult(null);
    } finally {
      setEnvLoading(false);
    }
  }, [connectionId, domain, name, remotePath, t]);

  /// 站点必须绑定远程服务器：名称 + 目标服务器，工作目录绑定网站时自动同步
  const canSubmit =
    name.trim().length > 0 &&
    !!connectionId &&
    !connLoading &&
    !submitting &&
    initStep === 'idle' &&
    !createdSite;

  const submit = useCallback(async () => {
    if (!connectionId) {
      setFormError(t('sites.no_server_required'));
      return;
    }
    setSubmitting(true);
    setFormError(null);
    setInitError(null);
    try {
      setInitStep('creating');
      const site = await createSite({
        name: name.trim(),
        domain: domain.trim(),
        localWorkdir: '',
        connectionId,
        remotePath: remotePath.trim() || undefined,
      });
      setCreatedSite(site);

      // 绑定了远程服务器，自动初始化远程目录
      if (remotePath.trim()) {
        setInitStep('init_remote');
        try {
          await initRemoteSite(site.id);
        } catch (e) {
          // 远程初始化失败不阻塞站点创建，记录错误但保留已创建的站点
          setInitError(String(e));
          setInitStep('idle');
          setSubmitting(false);
          return;
        }
      }

      setInitStep('done');
      // 已绑定服务器：自动跑环境检测，形成「新建站点 → 环境检测 → 部署」闭环。
      if (remotePath.trim()) {
        void runEnvCheck();
      }
    } catch (e) {
      setFormError(String(e));
      setSubmitting(false);
      setInitStep('idle');
    }
  }, [name, domain, connectionId, remotePath, t]);

  // —— 快速新建连接 ——
  const openQuickConn = () => {
    setQcMode('list');
    setQcSearch('');
    setQcName(domain.trim() || '');
    setQcHost('');
    setQcPort('22');
    setQcUser('root');
    setQcAuth('password');
    setQcPassword('');
    setQcKeyPath('');
    setQcError(null);
    setQcTestResult(null);
    setQuickConnOpen(true);
  };

  const handlePickConnection = (conn: ConnectionConfig) => {
    setConnectionId(conn.id);
    if (domain.trim()) {
      setRemotePath(`/var/www/${domain.trim()}/html`);
    }
    setQuickConnOpen(false);
  };

  const buildSshConfig = (): SshConnectionInfo | null => {
    if (!qcHost.trim()) return null;
    const portNum = Number(qcPort);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) return null;
    if (!qcUser.trim()) return null;

    const base: SshConnectionInfo = {
      host: qcHost.trim(),
      port: portNum,
      username: qcUser.trim(),
      auth_method: qcAuth,
    };
    if (qcAuth === 'password') {
      return { ...base, password: qcPassword };
    } else if (qcAuth === 'private_key') {
      return { ...base, private_key_path: qcKeyPath };
    }
    return base;
  };

  const handleTestConnection = useCallback(async () => {
    setQcTesting(true);
    setQcError(null);
    setQcTestResult(null);
    try {
      const config = buildSshConfig();
      if (!config) throw new Error('请先填写服务器地址、端口和用户名');
      if (qcAuth === 'private_key' && !qcKeyPath.trim()) throw new Error('请选择私钥文件');
      await testConnection(config, 8000);
      setQcTestResult('ok');
    } catch (e) {
      setQcTestResult('fail');
      setQcError(String(e));
    } finally {
      setQcTesting(false);
    }
  }, [qcHost, qcPort, qcUser, qcAuth, qcPassword, qcKeyPath]);

  const handleQuickConnSave = useCallback(async () => {
    setQcSaving(true);
    setQcError(null);
    try {
      if (!qcHost.trim()) throw new Error('请输入服务器地址');
      const portNum = Number(qcPort);
      if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) throw new Error('端口号无效');
      if (!qcUser.trim()) throw new Error('请输入用户名');

      const base: SshConnectionInfo = {
        host: qcHost.trim(),
        port: portNum,
        username: qcUser.trim(),
        auth_method: qcAuth,
      };
      let configJson: string;
      if (qcAuth === 'password') {
        configJson = JSON.stringify({ ...base, password: qcPassword });
      } else if (qcAuth === 'private_key') {
        configJson = JSON.stringify({ ...base, private_key_path: qcKeyPath });
      } else {
        configJson = JSON.stringify(base);
      }

      const connName = qcName.trim() || `${qcUser.trim()}@${qcHost.trim()}`;
      const conn: ConnectionConfig = {
        id: generateId(),
        name: connName,
        connection_type: 'ssh',
        config_json: configJson,
        created_at: Date.now(),
      };
      await saveConnection(conn);
      setQuickConnOpen(false);
      setConnectionId(conn.id);
      if (domain.trim()) {
        setRemotePath(`/var/www/${domain.trim()}/html`);
      }
      onConnectionsChanged?.();
    } catch (e) {
      setQcError(String(e));
    } finally {
      setQcSaving(false);
    }
  }, [qcName, qcHost, qcPort, qcUser, qcAuth, qcPassword, qcKeyPath, onConnectionsChanged]);

  const pickKeyFile = useCallback(async () => {
    const selected = await openFileDialog({
      multiple: false,
      filters: [{ name: 'SSH Key', extensions: ['pem', 'key', 'pub'] }],
      title: '选择私钥文件',
    });
    if (typeof selected === 'string' && selected) setQcKeyPath(selected);
  }, []);

  const hasServers = sshConnections.length > 0;

  return (
    <>
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('sites.create_title')}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
        {/* —— 分组一：基本信息 —— */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Box sx={{ color: 'text.secondary', display: 'flex' }}>
              <FileTextIcon size={16} weight="fill" />
            </Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary' }}>
              {t('sites.section_basic')}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pl: 0.25 }}>
            <TextField
              label={t('sites.form_name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              fullWidth
              required
              size="small"
            />
            <TextField
              label={t('sites.form_domain')}
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
              fullWidth
              size="small"
            />
          </Box>
        </Box>

        <Divider sx={{ mx: -1 }} />

        {/* —— 分组二：部署目标 —— */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Box sx={{ color: 'text.secondary', display: 'flex' }}>
              <CloudIcon size={16} weight="fill" />
            </Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary' }}>
              {t('sites.section_deploy')}
            </Typography>
            <Typography variant="caption" color="error.main" sx={{ ml: 0.5 }}>
              *
            </Typography>
            {connectionId && (
              <Chip
                label={t('sites.deploy_enabled')}
                size="small"
                color="success"
                variant="outlined"
                sx={{ height: 20, fontSize: 11, ml: 0.5 }}
              />
            )}
          </Box>
          <Box sx={{ pl: 0.25 }}>
            {connLoading ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2.5, justifyContent: 'center' }}>
                <CircularProgress size={18} />
                <Typography variant="caption" color="text.secondary">
                  {t('sites.checking_servers')}
                </Typography>
              </Box>
            ) : connectionId ? (
              /* 已选中服务器：展示服务器信息卡片 */
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <ServerInfoCard
                  connectionId={connectionId}
                  connections={connections}
                  onChange={openQuickConn}
                />
                <TextField
                  label={t('sites.form_remote_path')}
                  value={remotePath}
                  onChange={(e) => setRemotePath(e.target.value)}
                  placeholder="/var/www/example.com/html"
                  fullWidth
                  size="small"
                />
              </Box>
            ) : (
              /* 未选中服务器：阻断态 —— 站点必须部署到远程服务器 */
              <Paper
                variant="outlined"
                sx={{
                  p: 2.5,
                  textAlign: 'center',
                  borderStyle: 'dashed',
                  borderColor: 'warning.main',
                  bgcolor: 'action.hover',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <Box sx={{ color: 'warning.main', display: 'flex' }}>
                  <CloudIcon size={32} weight="thin" />
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {hasServers ? t('sites.pick_server_title') : t('sites.no_server_title')}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 300 }}>
                  {t('sites.no_server_required')}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {hasServers && (
                    <Button
                      variant="contained"
                      size="small"
                      onClick={openQuickConn}
                      startIcon={<PlusIcon size={14} weight="bold" />}
                      sx={{ textTransform: 'none', borderRadius: '8px' }}
                    >
                      {t('sites.choose_server_btn')}
                    </Button>
                  )}
                  <Button
                    variant={hasServers ? 'outlined' : 'contained'}
                    size="small"
                    onClick={() => navigate('/connections')}
                    startIcon={<ArrowSquareOutIcon size={14} weight="bold" />}
                    sx={{ textTransform: 'none', borderRadius: '8px' }}
                  >
                    {t('sites.go_connections')}
                  </Button>
                </Box>
              </Paper>
            )}
          </Box>
        </Box>


        {formError && <Alert severity="error" sx={{ mt: 0.5 }}>{formError}</Alert>}
        {initError && <Alert severity="warning" sx={{ mt: 0.5 }}>
          <strong>远程目录初始化失败：</strong>站点已创建，但服务器目录未初始化。你可以稍后在站点设置中重试。
          <Box sx={{ mt: 0.5, fontSize: 12, opacity: 0.8 }}>{initError}</Box>
        </Alert>}

        {/* 远程初始化进度 */}
        {initStep !== 'idle' && initStep !== 'done' && (
          <Box sx={{ mt: 1, p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
              <CircularProgress size={20} thickness={2.5} />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {initStep === 'creating' && t('sites.init_remote_progress_creating')}
                {initStep === 'init_remote' && t('sites.init_remote_progress_init')}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{
                  width: 8, height: 8, borderRadius: '50%',
                  bgcolor: 'success.main',
                }} />
                <Typography variant="caption" color="text.primary">
                  创建本地站点记录
                </Typography>
              </Box>
              {connectionId && remotePath.trim() && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{
                    width: 8, height: 8, borderRadius: '50%',
                    bgcolor: initStep === 'init_remote' ? 'success.main' : 'grey.300',
                  }} />
                  <Typography variant="caption" color={initStep === 'init_remote' ? 'text.primary' : 'text.secondary'}>
                    初始化远程目录：{remotePath.trim()}
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        )}

        {/* 新建完成 + 环境检测（统一闭环） */}
        {createdSite && connectionId && (
          <Box sx={{ mt: 1, p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Box sx={{ color: 'text.secondary', display: 'flex' }}><MonitorIcon size={16} weight="fill" /></Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                {t('sites.section_envcheck')}
              </Typography>
              {connectionId && (
                <Chip label={t('sites.envcheck_auto')} size="small" color="info" variant="outlined" sx={{ height: 20, fontSize: 11, ml: 0.5 }} />
              )}
            </Box>
            <EnvCheckPanel
              result={envResult}
              loading={envLoading}
              error={envError}
              connectionId={connectionId}
              onRefresh={runEnvCheck}
              siteName={createdSite.name}
              checkedAt={envCheckedAt ?? undefined}
              domain={domain || undefined}
              deployPath={remotePath || undefined}
              onDeploy={() => void openSiteOpsWindow({ siteId: createdSite.id, siteName: createdSite.name, connectionId, tab: 'deploy' })}
              onAiFix={() => {
                let h = ''; let u = '';
                try {
                  const s = JSON.parse((connections.find((c) => c.id === connectionId)?.config_json) || '{}');
                  h = s.host || ''; u = s.username || '';
                } catch { /* ignore */ }
                void openAiCopilotWindow({
                  scene: 'envFix',
                  host: h,
                  username: u,
                  siteName: createdSite.name,
                  domain: domain || undefined,
                  remotePath: remotePath || undefined,
                            checkReport: envResult ? JSON.stringify(envResult) : undefined,
                });
              }}
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        {createdSite ? (
          <>
            <Button
              variant="contained"
              onClick={() => void openSiteOpsWindow({ siteId: createdSite.id, siteName: createdSite.name, connectionId, tab: 'deploy' })}
              startIcon={<RocketIcon size={18} weight="bold" />}
            >
              {t('sites.go_deploy')}
            </Button>
            {/* 关闭时回调 onCreated：刷新站点列表，保证新建的站点立即可见 */}
            <Button onClick={() => onCreated(createdSite)}>{t('common:action.close')}</Button>
          </>
        ) : (
          <>
            <Button onClick={onClose} disabled={submitting && initStep !== 'idle'}>
              {t('common:action.cancel')}
            </Button>
            <Button variant="contained" onClick={submit} disabled={!canSubmit} startIcon={<PlusIcon size={18} weight="bold" />}>
              {submitting ? <CircularProgress size={18} color="inherit" /> : t('sites.action_create')}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>

    {/* 快速新建连接对话框 */}
    <Dialog open={quickConnOpen} onClose={qcSaving ? undefined : () => setQuickConnOpen(false)} maxWidth="sm" fullWidth>
      {qcMode === 'list' ? (
        /* —— 模式一：连接列表选择 —— */
        <>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1.5 }}>
            <CloudIcon size={20} color="#7c3aed" weight="fill" />
            {t('sites.choose_server')}
          </DialogTitle>
          <DialogContent sx={{ pt: 0.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t('sites.choose_server_desc')}
            </Typography>

            {/* 搜索框 */}
            {sshConnections.length > 0 && (
              <TextField
                size="small"
                fullWidth
                placeholder={t('sites.search_placeholder')}
                value={qcSearch}
                onChange={(e) => setQcSearch(e.target.value)}
                slotProps={{
                  input: {
                    startAdornment: <MagnifyingGlassIcon size={16} color="text.secondary" style={{ marginRight: 8 }} />,
                  },
                }}
                sx={{ mb: 2 }}
              />
            )}

            {sshConnections.length > 0 ? (
              filteredConnections.length > 0 ? (
                <Box sx={{ maxHeight: 280, overflow: 'auto', mx: -1, px: 1 }}>
                  {filteredConnections.map((conn) => {
                    let subtitle = '';
                    try {
                      const s = JSON.parse(conn.config_json);
                      subtitle = `${s.username}@${s.host}:${s.port}`;
                    } catch {}
                    const isSelected = connectionId === conn.id;
                    return (
                      <Box
                        key={conn.id}
                        onClick={() => handlePickConnection(conn)}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          p: 1.5,
                          mb: 0.5,
                          borderRadius: '10px',
                          cursor: 'pointer',
                          border: '1px solid',
                          borderColor: isSelected ? 'primary.main' : 'divider',
                          bgcolor: isSelected ? 'action.selected' : 'background.paper',
                          transition: 'all 0.15s',
                          '&:hover': {
                            bgcolor: isSelected ? 'action.selected' : 'action.hover',
                            borderColor: isSelected ? 'primary.main' : 'primary.light',
                          },
                        }}
                      >
                        <LightningIcon size={18} color="#F59E0B" weight="fill" />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{conn.name}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: 11 }}>
                            {subtitle}
                          </Typography>
                        </Box>
                        {isSelected && (
                          <CheckCircleIcon size={18} weight="fill" color="primary.main" />
                        )}
                      </Box>
                    );
                  })}
                </Box>
              ) : (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    {t('sites.no_matching_server')}
                  </Typography>
                </Box>
              )
            ) : (
              /* 无连接时的空状态 */
              <Box
                sx={{
                  p: 3,
                  borderRadius: '12px',
                  border: '1px dashed',
                  borderColor: 'divider',
                  bgcolor: 'action.hover',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <CloudIcon size={36} weight="thin" color="text.secondary" />
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {t('sites.no_saved_server')}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 280 }}>
                  {t('sites.no_saved_server_desc')}
                </Typography>
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => setQcMode('new')}
                  startIcon={<PlusIcon size={14} weight="bold" />}
                  sx={{ mt: 0.5, textTransform: 'none', borderRadius: '8px' }}
                >
                  {t('sites.add_first_server')}
                </Button>
              </Box>
            )}

            {/* 底部操作区 */}
            <Box sx={{ mt: 2.5, pt: 2, borderTop: '1px solid', borderColor: 'divider', display: 'flex', gap: 1 }}>
              {sshConnections.length > 0 && (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setQcMode('new')}
                  startIcon={<PlusIcon size={14} weight="bold" />}
                  sx={{ textTransform: 'none', borderRadius: '8px' }}
                >
                  {t('sites.add_new_server')}
                </Button>
              )}
              <Box sx={{ flex: 1 }} />
              <Button
                size="small"
                color="inherit"
                onClick={() => { setQuickConnOpen(false); navigate('/connections'); }}
                endIcon={<ArrowSquareOutIcon size={14} />}
                sx={{ textTransform: 'none', fontSize: 12, opacity: 0.8 }}
              >
                {t('sites.open_conn_manager')}
              </Button>
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setQuickConnOpen(false)}>
              {t('common:action.cancel')}
            </Button>
          </DialogActions>
        </>
      ) : (
        /* —— 模式二：新建 SSH 连接 —— */
        <>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1.5 }}>
            <LightningIcon size={20} color="#F59E0B" weight="fill" />
            {t('sites.quick_add_server')}
          </DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 0.5 }}>
            {/* —— 分组一：服务器信息 —— */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <GlobeHemisphereWestIcon size={15} weight="fill" color="text.secondary" />
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: 13 }}>
                  {t('sites.section_server_info')}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pl: 0.25 }}>
                <TextField
                  label={t('sites.server_name')}
                  value={qcName}
                  onChange={(e) => setQcName(e.target.value)}
                  size="small"
                  fullWidth
                  placeholder="我的服务器"
                />
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    label={t('sites.server_host')}
                    value={qcHost}
                    onChange={(e) => { setQcHost(e.target.value); setQcTestResult(null); }}
                    size="small"
                    sx={{ flex: 1 }}
                    placeholder="1.2.3.4"
                    autoFocus
                  />
                  <TextField
                    label={t('sites.server_port')}
                    value={qcPort}
                    onChange={(e) => { setQcPort(e.target.value); setQcTestResult(null); }}
                    size="small"
                    sx={{ width: 90 }}
                  />
                </Box>
                <TextField
                  label={t('sites.server_username')}
                  value={qcUser}
                  onChange={(e) => { setQcUser(e.target.value); setQcTestResult(null); }}
                  size="small"
                  fullWidth
                />
              </Box>
            </Box>

            <Divider sx={{ mx: -1 }} />

            {/* —— 分组二：认证方式 —— */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <LockIcon size={15} weight="fill" color="text.secondary" />
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: 13 }}>
                  {t('sites.section_auth')}
                </Typography>
                {qcTestResult === 'ok' && (
                  <Chip
                    label={t('sites.test_ok')}
                    size="small"
                    color="success"
                    variant="outlined"
                    sx={{ height: 20, fontSize: 11, ml: 0.5 }}
                  />
                )}
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pl: 0.25 }}>
                <TextField
                  select
                  label={t('sites.server_auth')}
                  value={qcAuth}
                  onChange={(e) => { setQcAuth(e.target.value as 'password' | 'private_key'); setQcTestResult(null); }}
                  size="small"
                  fullWidth
                >
                  <MenuItem value="password">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <LockIcon size={14} />
                      <span>{t('sites.auth_password')}</span>
                    </Box>
                  </MenuItem>
                  <MenuItem value="private_key">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <FileTextIcon size={14} />
                      <span>{t('sites.auth_private_key')}</span>
                    </Box>
                  </MenuItem>
                </TextField>

                {qcAuth === 'password' && (
                  <TextField
                    label={t('sites.server_password')}
                    value={qcPassword}
                    onChange={(e) => { setQcPassword(e.target.value); setQcTestResult(null); }}
                    size="small"
                    type={qcShowPassword ? 'text' : 'password'}
                    fullWidth
                    slotProps={{
                      input: {
                        endAdornment: (
                          <IconButton size="small" onClick={() => setQcShowPassword(!qcShowPassword)} edge="end">
                            {qcShowPassword ? <EyeSlashIcon size={16} /> : <EyeIcon size={16} />}
                          </IconButton>
                        ),
                      },
                    }}
                  />
                )}

                {qcAuth === 'private_key' && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <TextField
                      label={t('sites.server_key_path')}
                      value={qcKeyPath}
                      onChange={(e) => { setQcKeyPath(e.target.value); setQcTestResult(null); }}
                      size="small"
                      fullWidth
                      placeholder="~/.ssh/id_rsa"
                      slotProps={{
                        input: {
                          endAdornment: (
                            <Button
                              size="small"
                              onClick={pickKeyFile}
                              sx={{ flexShrink: 0, textTransform: 'none', borderRadius: '6px' }}
                              startIcon={<FolderOpenIcon size={14} weight="bold" />}
                            >
                              {t('sites.action_choose')}
                            </Button>
                          ),
                        },
                      }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                      {t('sites.key_formats')}
                    </Typography>
                  </Box>
                )}

                {/* 测试连接按钮 */}
                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleTestConnection}
                  disabled={qcTesting || !qcHost.trim()}
                  startIcon={
                    qcTesting
                      ? <CircularProgress size={14} color="inherit" />
                      : qcTestResult === 'ok'
                        ? <CheckCircleIcon size={14} weight="fill" color="success.main" />
                        : qcTestResult === 'fail'
                          ? <XCircleIcon size={14} weight="fill" color="error.main" />
                          : <WifiHighIcon size={14} />
                  }
                  sx={{
                    textTransform: 'none',
                    borderRadius: '8px',
                    alignSelf: 'flex-start',
                    color: qcTestResult === 'ok' ? 'success.main' : qcTestResult === 'fail' ? 'error.main' : undefined,
                    borderColor: qcTestResult === 'ok' ? 'success.main' : qcTestResult === 'fail' ? 'error.main' : undefined,
                  }}
                >
                  {qcTesting
                    ? t('sites.testing')
                    : qcTestResult === 'ok'
                      ? t('sites.test_ok')
                      : qcTestResult === 'fail'
                        ? t('sites.test_fail')
                        : t('sites.test_connection')}
                </Button>
              </Box>
            </Box>

            {qcError && <Alert severity="error" sx={{ fontSize: 13 }}>{qcError}</Alert>}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setQcMode('list')} disabled={qcSaving}>
              {t('sites.back_to_list')}
            </Button>
            <Button
              variant="contained"
              onClick={handleQuickConnSave}
              disabled={qcSaving}
              startIcon={qcSaving ? <CircularProgress size={16} color="inherit" /> : <PlusIcon size={16} weight="bold" />}
            >
              {t('sites.action_save')}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
    </>
  );
}

/* —— 编辑站点对话框 —— */
function EditSiteDialog({
  open,
  site,
  connections,
  saving,
  onClose,
  onSave,
  onConnectionsChanged,
}: {
  open: boolean;
  site: SiteSummary | null;
  connections: ConnectionConfig[];
  saving: boolean;
  onClose: () => void;
  onSave: (site: Site) => void;
  onConnectionsChanged?: () => void;
}) {
  const { t } = useTranslation('cms');
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [connectionId, setConnectionId] = useState<string>('');
  const [remotePath, setRemotePath] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [quickConnOpen, setQuickConnOpen] = useState(false);
  // 域名管理
  const [domains, setDomains] = useState<SiteDomain[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [domainLoading, setDomainLoading] = useState(false);
  const [dnsResults, setDnsResults] = useState<DomainDnsStatus[]>([]);
  const [dnsLoading, setDnsLoading] = useState(false);
  const [qcMode, setQcMode] = useState<'list' | 'new'>('list');
  const [qcSearch, setQcSearch] = useState('');
  const [qcName, setQcName] = useState('');
  const [qcHost, setQcHost] = useState('');
  const [qcPort, setQcPort] = useState('22');
  const [qcUser, setQcUser] = useState('root');
  const [qcAuth, setQcAuth] = useState<'password' | 'private_key'>('password');
  const [qcPassword, setQcPassword] = useState('');
  const [qcKeyPath, setQcKeyPath] = useState('');
  const [qcShowPassword, setQcShowPassword] = useState(false);
  const [qcSaving, setQcSaving] = useState(false);
  const [qcTesting, setQcTesting] = useState(false);
  const [qcTestResult, setQcTestResult] = useState<'ok' | 'fail' | null>(null);
  const [qcError, setQcError] = useState<string | null>(null);

  const sshConnections = useMemo(
    () => connections.filter((c) => c.connection_type === 'ssh'),
    [connections],
  );

  const filteredConnections = useMemo(() => {
    if (!qcSearch.trim()) return sshConnections;
    const kw = qcSearch.trim().toLowerCase();
    return sshConnections.filter((c) => {
      if (c.name.toLowerCase().includes(kw)) return true;
      try {
        const s = JSON.parse(c.config_json);
        return (
          s.host?.toLowerCase().includes(kw) ||
          s.username?.toLowerCase().includes(kw) ||
          `${s.username}@${s.host}`.toLowerCase().includes(kw)
        );
      } catch {
        return false;
      }
    });
  }, [sshConnections, qcSearch]);

  // 打开时初始化表单
  useEffect(() => {
    if (!open || !site) return;
    setName(site.name);
    setDomain(site.domain);
    setConnectionId(site.connection_id || '');
    setFormError(null);
    try {
      const deploy = JSON.parse(site.deploy_config_json || '{}');
      setRemotePath(deploy.remote_path || '');
    } catch {
      setRemotePath('');
    }
  }, [open, site]);

  // 加载域名列表
  useEffect(() => {
    if (!open || !site) return;
    setDomains([]);
    setDnsResults([]);
    setNewDomain('');
    let cancelled = false;
    void (async () => {
      try {
        const list = await listSiteDomains(site.id);
        if (!cancelled) setDomains(list);
      } catch (e) {
        console.error('加载域名列表失败:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [open, site]);

  const handleAddDomain = useCallback(async () => {
    if (!site || !newDomain.trim()) return;
    setDomainLoading(true);
    try {
      const added = await addSiteDomain(site.id, newDomain.trim(), false);
      setDomains(prev => [...prev, added]);
      setNewDomain('');
    } catch (e: any) {
      setFormError(e?.message || String(e));
    } finally {
      setDomainLoading(false);
    }
  }, [site, newDomain]);

  const handleRemoveDomain = useCallback(async (domainId: string) => {
    if (!site) return;
    setDomainLoading(true);
    try {
      await removeSiteDomain(domainId);
      // 后端 delete_with_fallback 已自动同步 sites.domain，无需前端再调 updateSite
      // 重新从服务器加载域名列表，确保与后端状态一致
      const updated = await listSiteDomains(site.id);
      setDomains(updated);
      // 更新主域名输入框：若主域名被删，后端已自动晋升新主域名
      const newPrimary = updated.find(d => d.is_primary);
      setDomain(newPrimary?.domain || '');
    } catch (e: any) {
      setFormError(e?.message || String(e));
    } finally {
      setDomainLoading(false);
    }
  }, [site]);

  const handleDnsCheck = useCallback(async () => {
    if (!site) return;
    setDnsLoading(true);
    try {
      const results = await checkDomainDns(site.id);
      setDnsResults(results);
    } catch (e: any) {
      setFormError(e?.message || String(e));
    } finally {
      setDnsLoading(false);
    }
  }, [site]);

  const buildSshConfig = (): SshConnectionInfo | null => {
    if (!qcHost.trim()) return null;
    const portNum = Number(qcPort);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) return null;
    if (!qcUser.trim()) return null;
    const base: SshConnectionInfo = {
      host: qcHost.trim(),
      port: portNum,
      username: qcUser.trim(),
      auth_method: qcAuth,
    };
    if (qcAuth === 'password') {
      return { ...base, password: qcPassword };
    } else if (qcAuth === 'private_key') {
      return { ...base, private_key_path: qcKeyPath };
    }
    return base;
  };

  const handleTestConnection = useCallback(async () => {
    setQcTesting(true);
    setQcError(null);
    setQcTestResult(null);
    try {
      const config = buildSshConfig();
      if (!config) throw new Error('请先填写服务器地址、端口和用户名');
      if (qcAuth === 'private_key' && !qcKeyPath.trim()) throw new Error('请选择私钥文件');
      await testConnection(config, 8000);
      setQcTestResult('ok');
    } catch (e) {
      setQcTestResult('fail');
      setQcError(String(e));
    } finally {
      setQcTesting(false);
    }
  }, [qcHost, qcPort, qcUser, qcAuth, qcPassword, qcKeyPath]);

  const handleQuickConnSave = useCallback(async () => {
    setQcSaving(true);
    setQcError(null);
    try {
      if (!qcHost.trim()) throw new Error('请输入服务器地址');
      const portNum = Number(qcPort);
      if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) throw new Error('端口号无效');
      if (!qcUser.trim()) throw new Error('请输入用户名');
      const base: SshConnectionInfo = {
        host: qcHost.trim(),
        port: portNum,
        username: qcUser.trim(),
        auth_method: qcAuth,
      };
      let configJson: string;
      if (qcAuth === 'password') {
        configJson = JSON.stringify({ ...base, password: qcPassword });
      } else if (qcAuth === 'private_key') {
        configJson = JSON.stringify({ ...base, private_key_path: qcKeyPath });
      } else {
        configJson = JSON.stringify(base);
      }
      const connName = qcName.trim() || `${qcUser.trim()}@${qcHost.trim()}`;
      const conn: ConnectionConfig = {
        id: generateId(),
        name: connName,
        connection_type: 'ssh',
        config_json: configJson,
        created_at: Date.now(),
      };
      await saveConnection(conn);
      setQuickConnOpen(false);
      setConnectionId(conn.id);
      if (domain.trim()) {
        setRemotePath(`/var/www/${domain.trim()}/html`);
      }
      onConnectionsChanged?.();
    } catch (e) {
      setQcError(String(e));
    } finally {
      setQcSaving(false);
    }
  }, [qcName, qcHost, qcPort, qcUser, qcAuth, qcPassword, qcKeyPath, domain, onConnectionsChanged]);

  const pickKeyFile = useCallback(async () => {
    const selected = await openFileDialog({
      multiple: false,
      filters: [{ name: 'SSH Key', extensions: ['pem', 'key', 'pub'] }],
      title: '选择私钥文件',
    });
    if (typeof selected === 'string' && selected) setQcKeyPath(selected);
  }, []);

  const openQuickConn = () => {
    setQcMode('list');
    setQcSearch('');
    setQcName(domain.trim() || '');
    setQcHost('');
    setQcPort('22');
    setQcUser('root');
    setQcAuth('password');
    setQcPassword('');
    setQcKeyPath('');
    setQcError(null);
    setQcTestResult(null);
    setQuickConnOpen(true);
  };

  const handlePickConnection = (conn: ConnectionConfig) => {
    setConnectionId(conn.id);
    if (domain.trim()) {
      setRemotePath(`/var/www/${domain.trim()}/html`);
    }
    setQuickConnOpen(false);
  };

  /// 与新建保持一致：站点必须绑定远程服务器，工作目录绑定网站时自动同步
  const canSubmit = name.trim().length > 0 && !!connectionId && !saving;

  const handleSubmit = useCallback(() => {
    if (!site) return;
    if (!connectionId) {
      setFormError(t('sites.no_server_required'));
      return;
    }
    setFormError(null);
    try {
      let deployConfig: Record<string, unknown> = {};
      try {
        deployConfig = JSON.parse(site.deploy_config_json || '{}');
      } catch {}
      deployConfig.remote_path = remotePath;
      onSave({
        ...site,
        name: name.trim(),
        domain: domain.trim(),
        connection_id: connectionId,
        deploy_config_json: JSON.stringify(deployConfig),
      });
    } catch (e) {
      setFormError(String(e));
    }
  }, [site, name, domain, connectionId, remotePath, onSave, t]);

  if (!site) return null;

  return (
    <>
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('sites.edit_title')}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
        {/* —— 分组一：基本信息 —— */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Box sx={{ color: 'text.secondary', display: 'flex' }}>
              <FileTextIcon size={16} weight="fill" />
            </Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary' }}>
              {t('sites.section_basic')}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pl: 0.25 }}>
            <TextField
              label={t('sites.form_name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              fullWidth
              required
              size="small"
            />
            <TextField
              label={t('sites.form_domain')}
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
              fullWidth
              size="small"
              helperText="主域名（保存后生效）。附加域名可在下方管理"
            />
            {/* 域名管理 */}
            {domains.length > 0 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  域名列表 ({domains.length})
                </Typography>
                {domains.map((d) => {
                  const dns = dnsResults.find(r => r.domain === d.domain);
                  const dnsColor = dns?.status === 'matched' ? 'success' : dns?.status === 'mismatch' ? 'warning' : dns?.status === 'unresolved' ? 'error' : 'default';
                  return (
                    <Box key={d.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.25 }}>
                      {d.is_primary && (
                        <Tooltip title="主域名">
                          <CheckCircleIcon size={14} weight="fill" color="#4caf50" />
                        </Tooltip>
                      )}
                      <Typography variant="body2" sx={{ flex: 1, fontFamily: 'monospace' }}>
                        {d.domain}
                      </Typography>
                      {dns && (
                        <Chip
                          size="small"
                          label={dns.status === 'matched' ? 'DNS 匹配' : dns.status === 'mismatch' ? 'IP 不匹配' : dns.status === 'unresolved' ? '未解析' : '未检测'}
                          color={dnsColor as any}
                          variant="outlined"
                          sx={{ height: 20 }}
                        />
                      )}
                      <IconButton size="small" onClick={() => handleRemoveDomain(d.id)} disabled={domainLoading} sx={{ p: 0.25 }}>
                        <TrashIcon size={14} />
                      </IconButton>
                    </Box>
                  );
                })}
              </Box>
            )}
            {/* 添加域名 + DNS 检测 */}
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField
                size="small"
                placeholder="添加域名..."
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddDomain(); } }}
                sx={{ flex: 1 }}
              />
              <Button size="small" onClick={handleAddDomain} disabled={domainLoading || !newDomain.trim()} startIcon={<PlusIcon size={14} />}>
                添加
              </Button>
              <Button size="small" variant="outlined" onClick={handleDnsCheck} disabled={dnsLoading || domains.length === 0} startIcon={dnsLoading ? <CircularProgress size={14} /> : <GlobeHemisphereWestIcon size={14} />}>
                DNS
              </Button>
            </Box>
            {dnsResults.length > 0 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                {dnsResults.filter(r => r.domain).map((r) => (
                  <Typography key={r.domain} variant="caption" color="text.secondary">
                    {r.domain}: {r.resolved_ip || '未解析'} {r.server_ip ? `→ ${r.server_ip}` : ''} — {r.detail}
                  </Typography>
                ))}
              </Box>
            )}
          </Box>
        </Box>

        <Divider sx={{ mx: -1 }} />

        {/* —— 分组二：部署目标 —— */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Box sx={{ color: 'text.secondary', display: 'flex' }}>
              <CloudIcon size={16} weight="fill" />
            </Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary' }}>
              {t('sites.section_deploy')}
            </Typography>
            {connectionId && (
              <Chip
                label={t('sites.deploy_enabled')}
                size="small"
                color="success"
                variant="outlined"
                sx={{ height: 20, fontSize: 11, ml: 0.5 }}
              />
            )}
          </Box>
          <Box sx={{ pl: 0.25 }}>
            {connectionId ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <ServerInfoCard
                  connectionId={connectionId}
                  connections={connections}
                  onChange={openQuickConn}
                />
                <TextField
                  label={t('sites.form_remote_path')}
                  value={remotePath}
                  onChange={(e) => setRemotePath(e.target.value)}
                  placeholder="/var/www/example.com/html"
                  fullWidth
                  size="small"
                />
              </Box>
            ) : (
              <Paper
                variant="outlined"
                sx={{
                  p: 2.5,
                  textAlign: 'center',
                  borderStyle: 'dashed',
                  borderColor: 'divider',
                  bgcolor: 'action.hover',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <Box sx={{ color: 'text.secondary', display: 'flex' }}>
                  <CloudIcon size={32} weight="thin" />
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {sshConnections.length > 0 ? t('sites.pick_server_title') : t('sites.no_server_title')}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 300 }}>
                  {t('sites.no_server_required')}
                </Typography>
                <Button
                  variant="contained"
                  size="small"
                  onClick={openQuickConn}
                  startIcon={<PlusIcon size={14} weight="bold" />}
                  sx={{ mt: 0.5, textTransform: 'none', borderRadius: '8px' }}
                >
                  {sshConnections.length > 0 ? t('sites.choose_server_btn') : t('sites.add_first_server')}
                </Button>
              </Paper>
            )}
          </Box>
        </Box>


        {formError && <Alert severity="error" sx={{ mt: 0.5 }}>{formError}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} disabled={saving}>
          {t('common:action.cancel')}
        </Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!canSubmit} startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <PencilIcon size={18} weight="bold" />}>
          {t('sites.action_save')}
        </Button>
      </DialogActions>
    </Dialog>

    {/* 快速新建连接对话框 */}
    <Dialog open={quickConnOpen} onClose={qcSaving ? undefined : () => setQuickConnOpen(false)} maxWidth="sm" fullWidth>
      {qcMode === 'list' ? (
        <>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1.5 }}>
            <CloudIcon size={20} color="#7c3aed" weight="fill" />
            {t('sites.choose_server')}
          </DialogTitle>
          <DialogContent sx={{ pt: 0.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t('sites.choose_server_desc')}
            </Typography>
            {sshConnections.length > 0 && (
              <TextField
                size="small"
                fullWidth
                placeholder={t('sites.search_placeholder')}
                value={qcSearch}
                onChange={(e) => setQcSearch(e.target.value)}
                slotProps={{
                  input: {
                    startAdornment: <MagnifyingGlassIcon size={16} color="text.secondary" style={{ marginRight: 8 }} />,
                  },
                }}
                sx={{ mb: 2 }}
              />
            )}
            {sshConnections.length > 0 ? (
              filteredConnections.length > 0 ? (
                <Box sx={{ maxHeight: 280, overflow: 'auto', mx: -1, px: 1 }}>
                  {filteredConnections.map((conn) => {
                    let subtitle = '';
                    try {
                      const s = JSON.parse(conn.config_json);
                      subtitle = `${s.username}@${s.host}:${s.port}`;
                    } catch {}
                    const isSelected = connectionId === conn.id;
                    return (
                      <Box
                        key={conn.id}
                        onClick={() => handlePickConnection(conn)}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          p: 1.5,
                          mb: 0.5,
                          borderRadius: '10px',
                          cursor: 'pointer',
                          border: '1px solid',
                          borderColor: isSelected ? 'primary.main' : 'divider',
                          bgcolor: isSelected ? 'action.selected' : 'background.paper',
                          transition: 'all 0.15s',
                          '&:hover': {
                            bgcolor: isSelected ? 'action.selected' : 'action.hover',
                            borderColor: isSelected ? 'primary.main' : 'primary.light',
                          },
                        }}
                      >
                        <LightningIcon size={18} color="#F59E0B" weight="fill" />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{conn.name}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: 11 }}>
                            {subtitle}
                          </Typography>
                        </Box>
                        {isSelected && (
                          <CheckCircleIcon size={18} weight="fill" color="primary.main" />
                        )}
                      </Box>
                    );
                  })}
                </Box>
              ) : (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    {t('sites.no_matching_server')}
                  </Typography>
                </Box>
              )
            ) : (
              <Box
                sx={{
                  p: 3,
                  borderRadius: '12px',
                  border: '1px dashed',
                  borderColor: 'divider',
                  bgcolor: 'action.hover',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <CloudIcon size={36} weight="thin" color="text.secondary" />
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {t('sites.no_saved_server')}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 280 }}>
                  {t('sites.no_saved_server_desc')}
                </Typography>
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => setQcMode('new')}
                  startIcon={<PlusIcon size={14} weight="bold" />}
                  sx={{ mt: 0.5, textTransform: 'none', borderRadius: '8px' }}
                >
                  {t('sites.add_first_server')}
                </Button>
              </Box>
            )}
            <Box sx={{ mt: 2.5, pt: 2, borderTop: '1px solid', borderColor: 'divider', display: 'flex', gap: 1 }}>
              {sshConnections.length > 0 && (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setQcMode('new')}
                  startIcon={<PlusIcon size={14} weight="bold" />}
                  sx={{ textTransform: 'none', borderRadius: '8px' }}
                >
                  {t('sites.add_new_server')}
                </Button>
              )}
              <Box sx={{ flex: 1 }} />
              <Button
                size="small"
                color="inherit"
                onClick={() => { setQuickConnOpen(false); }}
                endIcon={<ArrowSquareOutIcon size={14} />}
                sx={{ textTransform: 'none', fontSize: 12, opacity: 0.8 }}
              >
                {t('sites.open_conn_manager')}
              </Button>
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setQuickConnOpen(false)}>
              {t('common:action.cancel')}
            </Button>
          </DialogActions>
        </>
      ) : (
        <>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1.5 }}>
            <LightningIcon size={20} color="#F59E0B" weight="fill" />
            {t('sites.quick_add_server')}
          </DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 0.5 }}>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <GlobeHemisphereWestIcon size={15} weight="fill" color="text.secondary" />
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: 13 }}>
                  {t('sites.section_server_info')}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pl: 0.25 }}>
                <TextField
                  label={t('sites.server_name')}
                  value={qcName}
                  onChange={(e) => setQcName(e.target.value)}
                  size="small"
                  fullWidth
                  placeholder="我的服务器"
                />
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    label={t('sites.server_host')}
                    value={qcHost}
                    onChange={(e) => { setQcHost(e.target.value); setQcTestResult(null); }}
                    size="small"
                    sx={{ flex: 1 }}
                    placeholder="1.2.3.4"
                  />
                  <TextField
                    label={t('sites.server_port')}
                    value={qcPort}
                    onChange={(e) => { setQcPort(e.target.value); setQcTestResult(null); }}
                    size="small"
                    sx={{ width: 90 }}
                  />
                </Box>
                <TextField
                  label={t('sites.server_username')}
                  value={qcUser}
                  onChange={(e) => { setQcUser(e.target.value); setQcTestResult(null); }}
                  size="small"
                  fullWidth
                />
              </Box>
            </Box>

            <Divider sx={{ mx: -1 }} />

            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <LockIcon size={15} weight="fill" color="text.secondary" />
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: 13 }}>
                  {t('sites.section_auth')}
                </Typography>
                {qcTestResult === 'ok' && (
                  <Chip
                    label={t('sites.test_ok')}
                    size="small"
                    color="success"
                    variant="outlined"
                    sx={{ height: 20, fontSize: 11, ml: 0.5 }}
                  />
                )}
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pl: 0.25 }}>
                <TextField
                  select
                  label={t('sites.server_auth')}
                  value={qcAuth}
                  onChange={(e) => { setQcAuth(e.target.value as 'password' | 'private_key'); setQcTestResult(null); }}
                  size="small"
                  fullWidth
                >
                  <MenuItem value="password">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <LockIcon size={14} />
                      <span>{t('sites.auth_password')}</span>
                    </Box>
                  </MenuItem>
                  <MenuItem value="private_key">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <FileTextIcon size={14} />
                      <span>{t('sites.auth_private_key')}</span>
                    </Box>
                  </MenuItem>
                </TextField>

                {qcAuth === 'password' && (
                  <TextField
                    label={t('sites.server_password')}
                    value={qcPassword}
                    onChange={(e) => { setQcPassword(e.target.value); setQcTestResult(null); }}
                    size="small"
                    type={qcShowPassword ? 'text' : 'password'}
                    fullWidth
                    slotProps={{
                      input: {
                        endAdornment: (
                          <IconButton size="small" onClick={() => setQcShowPassword(!qcShowPassword)} edge="end">
                            {qcShowPassword ? <EyeSlashIcon size={16} /> : <EyeIcon size={16} />}
                          </IconButton>
                        ),
                      },
                    }}
                  />
                )}

                {qcAuth === 'private_key' && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <TextField
                      label={t('sites.server_key_path')}
                      value={qcKeyPath}
                      onChange={(e) => { setQcKeyPath(e.target.value); setQcTestResult(null); }}
                      size="small"
                      fullWidth
                      placeholder="~/.ssh/id_rsa"
                      slotProps={{
                        input: {
                          endAdornment: (
                            <Button
                              size="small"
                              onClick={pickKeyFile}
                              sx={{ flexShrink: 0, textTransform: 'none', borderRadius: '6px' }}
                              startIcon={<FolderOpenIcon size={14} weight="bold" />}
                            >
                              {t('sites.action_choose')}
                            </Button>
                          ),
                        },
                      }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                      {t('sites.key_formats')}
                    </Typography>
                  </Box>
                )}

                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleTestConnection}
                  disabled={qcTesting || !qcHost.trim()}
                  startIcon={
                    qcTesting
                      ? <CircularProgress size={14} color="inherit" />
                      : qcTestResult === 'ok'
                        ? <CheckCircleIcon size={14} weight="fill" color="success.main" />
                        : qcTestResult === 'fail'
                          ? <XCircleIcon size={14} weight="fill" color="error.main" />
                          : <WifiHighIcon size={14} />
                  }
                  sx={{
                    textTransform: 'none',
                    borderRadius: '8px',
                    alignSelf: 'flex-start',
                    color: qcTestResult === 'ok' ? 'success.main' : qcTestResult === 'fail' ? 'error.main' : undefined,
                    borderColor: qcTestResult === 'ok' ? 'success.main' : qcTestResult === 'fail' ? 'error.main' : undefined,
                  }}
                >
                  {qcTesting
                    ? t('sites.testing')
                    : qcTestResult === 'ok'
                      ? t('sites.test_ok')
                      : qcTestResult === 'fail'
                        ? t('sites.test_fail')
                        : t('sites.test_connection')}
                </Button>
              </Box>
            </Box>

            {qcError && <Alert severity="error" sx={{ fontSize: 13 }}>{qcError}</Alert>}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setQcMode('list')} disabled={qcSaving}>
              {t('sites.back_to_list')}
            </Button>
            <Button
              variant="contained"
              onClick={handleQuickConnSave}
              disabled={qcSaving}
              startIcon={qcSaving ? <CircularProgress size={16} color="inherit" /> : <PlusIcon size={16} weight="bold" />}
            >
              {t('sites.action_save')}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
    </>
  );
}
