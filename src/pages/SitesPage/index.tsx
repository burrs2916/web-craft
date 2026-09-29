import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  CircularProgress,
  Alert,
  Snackbar,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { GlobeHemisphereWestIcon, PlusIcon } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import { listSites, archiveSite, updateSite, checkSiteHealthz, deleteSite } from '../../core/services/cms.service';
import { listConnections, testConnection } from '../../core/services/connection.service';
import type { SiteSummary, Site, SshConnectionInfo } from '../../proto';
import type { ConnectionConfig } from '../../proto';
import { openSiteOpsWindow } from '../../core/services/window.service';
import { SiteCard } from './SiteCard';
import { CreateSiteDialog } from './CreateSiteDialog';
import { EditSiteDialog } from './EditSiteDialog';
import { DeleteSiteDialog } from './DeleteSiteDialog';

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
      <DeleteSiteDialog
        open={deleteTarget !== null}
        site={deleteTarget}
        deleting={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />

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