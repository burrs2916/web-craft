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
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
  GlobeHemisphereWestIcon,
  PlusIcon,
  FolderOpenIcon,
  ArchiveIcon,
  ArrowClockwiseIcon,
  FileTextIcon,
} from '@phosphor-icons/react';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import { useNavigate } from 'react-router-dom';
import { createSite, listSites, archiveSite, updateSite } from '../core/services/cms.service';
import { listConnections } from '../core/services/connection.service';
import type { SiteSummary, Site } from '../proto';
import type { ConnectionConfig } from '../proto';

/// CMS 站点管理（FR-S2）：站点列表 + 新建向导（FR-S1 单站点形态）。
/// 数据来自 site_list 聚合视图；变更经 sites-changed 事件语义由操作后本地刷新承接。
export function SitesPage() {
  const { t } = useTranslation('cms');

  const [summaries, setSummaries] = useState<SiteSummary[] | null>(null);
  const [connections, setConnections] = useState<ConnectionConfig[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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

  const handleCreated = useCallback(
    async (site: Site) => {
      setCreateOpen(false);
      setToast(t('sites.toast_created', { name: site.name }));
      await refresh();
    },
    [refresh, t],
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
    <Box sx={{ p: 3, maxWidth: 1080, width: '100%' }}>
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
            <SiteCard key={s.id} summary={s} onArchive={handleArchive} />
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
              <SiteCard key={s.id} summary={s} onRestore={handleRestore} />
            ))}
          </Box>
        </Box>
      )}

      <CreateSiteDialog
        open={createOpen}
        connections={connections}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
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

function formatTime(ts: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

function SiteCard({
  summary,
  onArchive,
  onRestore,
}: {
  summary: SiteSummary;
  onArchive?: (site: Site) => void;
  onRestore?: (site: Site) => void;
}) {
  const { t } = useTranslation('cms');
  const navigate = useNavigate();
  const archived = summary.status === 'archived';

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        opacity: archived ? 0.65 : 1,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {summary.name}
        </Typography>
        {summary.domain ? (
          <Chip label={summary.domain} size="small" variant="outlined" sx={{ maxWidth: 160, height: 24, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }} />
        ) : null}
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {summary.local_workdir}
      </Typography>

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

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 0.5 }}>
        {archived ? (
          <Button
            size="small"
            startIcon={<ArrowClockwiseIcon size={16} weight="bold" />}
            onClick={() => onRestore?.(summary)}
          >
            {t('sites.action_restore')}
          </Button>
        ) : (
          <>
            <Button
              size="small"
              startIcon={<FileTextIcon size={16} weight="bold" />}
              onClick={() => navigate(`/sites/${summary.id}`)}
            >
              {t('sites.action_contents')}
            </Button>
            <Button
              size="small"
              color="inherit"
              startIcon={<ArchiveIcon size={16} weight="bold" />}
              onClick={() => onArchive?.(summary)}
            >
              {t('sites.action_archive')}
            </Button>
          </>
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
}: {
  open: boolean;
  connections: ConnectionConfig[];
  onClose: () => void;
  onCreated: (site: Site) => void;
}) {
  const { t } = useTranslation('cms');
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [workdir, setWorkdir] = useState('');
  const [connectionId, setConnectionId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setDomain('');
      setWorkdir('');
      setConnectionId('');
      setFormError(null);
      setSubmitting(false);
    }
  }, [open]);

  const pickWorkdir = useCallback(async () => {
    const dir = await openFileDialog({ directory: true, title: t('sites.form_pick_dir') });
    if (typeof dir === 'string' && dir) setWorkdir(dir);
  }, [t]);

  const canSubmit = name.trim().length > 0 && workdir.trim().length > 0 && !submitting;

  const submit = useCallback(async () => {
    setSubmitting(true);
    setFormError(null);
    try {
      const site = await createSite({
        name: name.trim(),
        domain: domain.trim(),
        localWorkdir: workdir.trim(),
        connectionId: connectionId || null,
      });
      onCreated(site);
    } catch (e) {
      setFormError(String(e));
      setSubmitting(false);
    }
  }, [name, domain, workdir, connectionId, onCreated]);

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('sites.create_title')}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <TextField
          label={t('sites.form_name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          fullWidth
          required
        />
        <TextField
          label={t('sites.form_domain')}
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="example.com"
          fullWidth
        />
        <TextField
          label={t('sites.form_workdir')}
          value={workdir}
          onChange={(e) => setWorkdir(e.target.value)}
          placeholder={t('sites.form_workdir_placeholder')}
          fullWidth
          required
          slotProps={{
            input: {
              endAdornment: (
                <Button size="small" onClick={pickWorkdir} startIcon={<FolderOpenIcon size={16} weight="bold" />} sx={{ flexShrink: 0 }}>
                  {t('sites.action_browse')}
                </Button>
              ),
            },
          }}
        />
        <TextField
          select
          label={t('sites.form_connection')}
          value={connectionId}
          onChange={(e) => setConnectionId(e.target.value)}
          fullWidth
          defaultValue=""
        >
          <MenuItem value="">{t('sites.form_connection_local')}</MenuItem>
          {connections.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
        {formError && <Alert severity="error">{formError}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          {t('common:action.cancel')}
        </Button>
        <Button variant="contained" onClick={submit} disabled={!canSubmit} startIcon={<PlusIcon size={18} weight="bold" />}>
          {submitting ? <CircularProgress size={18} color="inherit" /> : t('sites.action_create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
