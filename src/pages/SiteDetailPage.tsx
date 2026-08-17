import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  IconButton,
  CircularProgress,
  TextField,
  MenuItem,
  Chip,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Snackbar,
  Alert,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import {
  ArrowLeftIcon,
  PlusIcon,
  TrashIcon,
  ArrowCounterClockwiseIcon,
  PaperPlaneRightIcon,
  ArrowUUpLeftIcon,
  PushPinIcon,
  FileTextIcon,
  GlobeIcon,
  RocketIcon,
} from '@phosphor-icons/react';
import {
  getSite,
  listContents,
  createContent,
  publishContent,
  unpublishContent,
  deleteContent,
  restoreContent,
  purgeContent,
  setContentPinned,
} from '../core/services/cms.service';
import { listConnections } from '../core/services/connection.service';
import { spawnTerminal } from '../core/services/terminal.service';
import { ensureServerEnvSetupAgent } from '../core/services/agent.service';
import { openAiCopilotWindow } from '../core/services/window.service';
import { useConnectIntent } from '../features/terminal/connectIntent';
import { DeployDialog } from '../features/cms/DeployDialog';
import { previewStart, previewStop } from '../core/services/cms.service';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { Site, Content, ContentListFilter, ContentType, ContentStatus, SshConnectionInfo, PtyConfig } from '../proto';
import type { ConnectionConfig } from '../proto';
import {
  TerminalIcon,
  FolderOpenIcon as RemoteFolderIcon,
  WrenchIcon,
  PlayIcon,
  StopIcon,
} from '@phosphor-icons/react';

/// 站点详情页（FR-C1/C2/C8 的列表侧）：内容列表 + 类型/状态筛选 + 回收站。
/// 内容编辑器（TipTap）下一步接入；本页先完成状态机操作闭环。
export function SiteDetailPage() {
  const { siteId = '' } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation('cms');

  const [site, setSite] = useState<Site | null>(null);
  const [contents, setContents] = useState<Content[] | null>(null);
  const [sshInfo, setSshInfo] = useState<SshConnectionInfo | null>(null);
  const [connectionName, setConnectionName] = useState<string>('');
  const [remotePath, setRemotePath] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<'' | ContentType>('');
  const [statusFilter, setStatusFilter] = useState<'' | ContentStatus>('');
  const [keyword, setKeyword] = useState('');
  const [trashView, setTrashView] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  /// 本地预览当前会话；非空即运行中（含地址与端口）
  const [preview, setPreview] = useState<{ baseUrl: string; port: number } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const filter: ContentListFilter = {};
      if (typeFilter) filter.type = typeFilter;
      if (statusFilter) filter.status = statusFilter;
      if (keyword.trim()) filter.keyword = keyword.trim();
      if (trashView) filter.include_deleted = true;
      setContents(await listContents(siteId, filter));
    } catch (e) {
      setError(String(e));
      setContents([]);
    }
  }, [siteId, typeFilter, statusFilter, keyword, trashView]);

  useEffect(() => {
    getSite(siteId)
      .then((s) => {
        if (!s) navigate('/sites', { replace: true });
        else {
          setSite(s);
          try {
            const deploy = JSON.parse(s.deploy_config_json || '{}');
            if (typeof deploy.remote_path === 'string') setRemotePath(deploy.remote_path);
          } catch {
            // 部署配置损坏时忽略，不影响列表功能
          }
        }
      })
      .catch((e) => setError(String(e)));
  }, [siteId, navigate]);

  // 部署成功后刷新站点（last_deployed_at 变化）
  const refreshSite = useCallback(() => {
    getSite(siteId)
      .then((s) => s && setSite(s))
      .catch(() => undefined);
  }, [siteId]);

  // 解析绑定服务器的 SSH 信息（终端/SFTP 联动用）
  useEffect(() => {
    if (!site?.connection_id) {
      setSshInfo(null);
      setConnectionName('');
      return;
    }
    listConnections()
      .then((conns) => {
        const conn: ConnectionConfig | undefined = conns.find((c) => c.id === site.connection_id);
        if (!conn) {
          setSshInfo(null);
          return;
        }
        setConnectionName(conn.name);
        try {
          setSshInfo(JSON.parse(conn.config_json));
        } catch {
          setSshInfo(null);
        }
      })
      .catch(() => setSshInfo(null));
  }, [site?.connection_id]);

  const openServerTerminal = useCallback(() => {
    if (!sshInfo || !site?.connection_id) return;
    useConnectIntent.getState().set({
      connectionType: 'ssh',
      ssh: sshInfo,
      name: connectionName || `${sshInfo.username}@${sshInfo.host}`,
      connectionId: site.connection_id,
    });
    navigate('/terminal');
  }, [sshInfo, site?.connection_id, connectionName, navigate]);

  const openServerFiles = useCallback(() => {
    if (!sshInfo) return;
    const q = new URLSearchParams({
      host: sshInfo.host,
      port: String(sshInfo.port),
      username: sshInfo.username,
      authMethod: sshInfo.auth_method,
    });
    if (sshInfo.private_key_path) q.set('privateKeyPath', sshInfo.private_key_path);
    if (sshInfo.password) q.set('password', sshInfo.password);
    navigate(`/sftp?${q.toString()}`);
  }, [sshInfo, navigate]);

  // M-x1 环境剧本入口：建安装用 SSH 终端会话 → 播种环境安装助手 → 打开独立 AI 窗口。
  // AI 探测（nginx/systemd/端口/防火墙）→ 汇报征求同意 → 同意后安装，全程驱动该终端会话。
  const [envBusy, setEnvBusy] = useState(false);
  const prepareServerEnv = useCallback(async () => {
    if (!sshInfo || !site || envBusy) return;
    setEnvBusy(true);
    setError(null);
    try {
      const sessionId = `srv-env-${Date.now()}`;
      const config: PtyConfig = { rows: 24, cols: 80, connection_type: 'ssh', ssh: sshInfo };
      await spawnTerminal(sessionId, config);
      const agentId = await ensureServerEnvSetupAgent(undefined, i18n.language || 'zh-CN');
      await openAiCopilotWindow({
        scene: 'srvEnv',
        agentId,
        sessionId,
        host: sshInfo.host,
        username: sshInfo.username,
        siteName: site.name,
        remotePath: remotePath || undefined,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setEnvBusy(false);
    }
  }, [sshInfo, site, remotePath, envBusy, i18n.language]);

  // AI 窗口安装完成事件：提示环境已就绪（窗口关闭重开均不重复触发，事件是即时的）。
  useEffect(() => {
    const un = listen('srv-env-setup-completed', () => {
      setToast(t('contents.env_ready_toast'));
    });
    return () => {
      un.then((fn) => fn());
    };
  }, [t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 本地预览：启动并打开浏览器；再次点击停止。不依赖 SSH 服务器。
  const togglePreview = useCallback(async () => {
    if (previewBusy) return;
    setPreviewBusy(true);
    setError(null);
    try {
      if (preview) {
        await previewStop(siteId);
        setPreview(null);
        setToast(t('contents.preview_stopped'));
      } else {
        const info = await previewStart(siteId);
        setPreview({ baseUrl: info.baseUrl, port: info.port });
        await openUrl(info.baseUrl).catch(() => undefined);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setPreviewBusy(false);
    }
  }, [preview, previewBusy, siteId, t]);

  const run = useCallback(
    async (action: () => Promise<unknown>, message?: string) => {
      setBusy(true);
      setError(null);
      try {
        await action();
        if (message) setToast(message);
        await refresh();
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const handleCreate = useCallback(
    (type: ContentType) => {
      run(
        () => createContent({ siteId, type, title: '' }),
        t('contents.toast_created', { type: t(`contents.type_${type}`) }),
      );
    },
    [run, siteId, t],
  );

  const statusChip = useCallback(
    (c: Content) => {
      const key = `contents.status_${c.status}`;
      const color =
        c.status === 'published' ? 'success' : c.status === 'scheduled' ? 'warning' : 'default';
      return <Chip label={t(key)} size="small" color={color} variant="outlined" />;
    },
    [t],
  );

  const emptyText = useMemo(() => {
    if (trashView) return t('contents.empty_trash');
    if (keyword.trim()) return t('contents.empty_search');
    return t('contents.empty');
  }, [trashView, keyword, t]);

  if (!site) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1080, width: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton onClick={() => navigate('/sites')} size="small">
          <ArrowLeftIcon size={20} />
        </IconButton>
        <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>
          {site.name}
        </Typography>
        {site.domain ? (
          <Chip icon={<GlobeIcon size={14} />} label={site.domain} size="small" variant="outlined" />
        ) : null}
        <Tooltip title={sshInfo ? t('contents.open_server_terminal_hint') : t('contents.no_server')}>
          <span>
            <Button
              variant="outlined"
              startIcon={<TerminalIcon size={16} weight="bold" />}
              onClick={openServerTerminal}
              disabled={!sshInfo}
            >
              {t('contents.open_server_terminal')}
            </Button>
          </span>
        </Tooltip>
        <Tooltip title={sshInfo ? t('contents.open_server_files_hint') : t('contents.no_server')}>
          <span>
            <Button
              variant="outlined"
              startIcon={<RemoteFolderIcon size={16} weight="bold" />}
              onClick={openServerFiles}
              disabled={!sshInfo}
            >
              {t('contents.open_server_files')}
            </Button>
          </span>
        </Tooltip>
        <Tooltip title={sshInfo ? t('contents.prepare_env_hint') : t('contents.no_server')}>
          <span>
            <Button
              variant="outlined"
              startIcon={<WrenchIcon size={16} weight="bold" />}
              onClick={prepareServerEnv}
              disabled={!sshInfo || envBusy}
            >
              {envBusy ? <CircularProgress size={16} /> : null}
              {t('contents.prepare_env')}
            </Button>
          </span>
        </Tooltip>
        <Tooltip title={t('contents.preview_hint')}>
          <span>
            <Button
              variant={preview ? 'contained' : 'outlined'}
              color={preview ? 'success' : 'primary'}
              startIcon={preview ? <StopIcon size={16} weight="bold" /> : <PlayIcon size={16} weight="bold" />}
              onClick={togglePreview}
              disabled={previewBusy}
            >
              {previewBusy ? <CircularProgress size={16} /> : null}
              {preview ? t('contents.preview_stop') : t('contents.preview')}
            </Button>
          </span>
        </Tooltip>
        <Tooltip title={sshInfo ? t('contents.deploy_hint') : t('contents.no_server')}>
          <span>
            <Button
              variant="outlined"
              startIcon={<RocketIcon size={16} weight="bold" />}
              onClick={() => setDeployOpen(true)}
              disabled={!sshInfo}
            >
              {t('contents.deploy')}
            </Button>
          </span>
        </Tooltip>
        <Button
          variant="outlined"
          startIcon={<PlusIcon size={18} weight="bold" />}
          onClick={() => handleCreate('page')}
          disabled={busy}
        >
          {t('contents.action_new_page')}
        </Button>
        <Button
          variant="contained"
          startIcon={<PlusIcon size={18} weight="bold" />}
          onClick={() => handleCreate('post')}
          disabled={busy}
        >
          {t('contents.action_new_post')}
        </Button>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2, ml: 5 }}>
        {sshInfo
          ? `${t('contents.info_local')}: ${site.local_workdir} · ${t('contents.info_server')}: ${sshInfo.username}@${sshInfo.host}${remotePath ? ` → ${remotePath}` : ''}`
          : `${t('contents.info_local')}: ${site.local_workdir}`}
      </Typography>

      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <TextField
          select
          size="small"
          label={t('contents.filter_type')}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as '' | ContentType)}
          sx={{ minWidth: 120 }}
          disabled={trashView}
        >
          <MenuItem value="">{t('contents.filter_all')}</MenuItem>
          <MenuItem value="post">{t('contents.type_post')}</MenuItem>
          <MenuItem value="page">{t('contents.type_page')}</MenuItem>
        </TextField>
        <TextField
          select
          size="small"
          label={t('contents.filter_status')}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as '' | ContentStatus)}
          sx={{ minWidth: 120 }}
          disabled={trashView}
        >
          <MenuItem value="">{t('contents.filter_all')}</MenuItem>
          <MenuItem value="draft">{t('contents.status_draft')}</MenuItem>
          <MenuItem value="published">{t('contents.status_published')}</MenuItem>
        </TextField>
        <TextField
          size="small"
          label={t('contents.filter_keyword')}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          sx={{ minWidth: 200 }}
          disabled={trashView}
        />
        <Button
          size="small"
          variant={trashView ? 'contained' : 'outlined'}
          color={trashView ? 'error' : 'inherit'}
          startIcon={<TrashIcon size={16} weight="bold" />}
          onClick={() => {
            setTrashView((v) => !v);
            setTypeFilter('');
            setStatusFilter('');
            setKeyword('');
          }}
        >
          {t('contents.action_trash')}
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <TableContainer>
        <Table size="small" aria-label={t('contents.table_label')}>
          <TableHead>
            <TableRow>
              <TableCell>{t('contents.col_title')}</TableCell>
              <TableCell width={90}>{t('contents.col_type')}</TableCell>
              <TableCell width={100}>{t('contents.col_status')}</TableCell>
              <TableCell>{t('contents.col_slug')}</TableCell>
              <TableCell width={170}>{t('contents.col_updated')}</TableCell>
              <TableCell width={150} align="right">{t('contents.col_actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {contents === null ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            ) : contents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                  {emptyText}
                </TableCell>
              </TableRow>
            ) : (
              contents.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {c.pinned ? (
                        <Tooltip title={t('contents.pinned')}>
                          <PushPinIcon size={14} weight="fill" />
                        </Tooltip>
                      ) : null}
                      <Typography variant="body2" noWrap sx={{ maxWidth: 320 }}>
                        {c.title}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
                      <FileTextIcon size={14} />
                      <Typography variant="caption">
                        {t(`contents.type_${c.type}`)}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>{statusChip(c)}</TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 180, display: 'block' }}>
                      {c.slug}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(c.updated_at).toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                      {trashView ? (
                        <>
                          <Tooltip title={t('contents.action_restore')}>
                            <IconButton size="small" onClick={() => run(() => restoreContent(c.id), t('contents.toast_restored'))} disabled={busy}>
                              <ArrowCounterClockwiseIcon size={16} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={t('contents.action_purge')}>
                            <IconButton size="small" color="error" onClick={() => run(() => purgeContent(c.id), t('contents.toast_purged'))} disabled={busy}>
                              <TrashIcon size={16} />
                            </IconButton>
                          </Tooltip>
                        </>
                      ) : (
                        <>
                          {c.status === 'draft' ? (
                            <Tooltip title={t('contents.action_publish')}>
                              <IconButton size="small" color="primary" onClick={() => run(() => publishContent(c.id), t('contents.toast_published'))} disabled={busy}>
                                <PaperPlaneRightIcon size={16} />
                              </IconButton>
                            </Tooltip>
                          ) : null}
                          {c.status === 'published' ? (
                            <Tooltip title={t('contents.action_unpublish')}>
                              <IconButton size="small" onClick={() => run(() => unpublishContent(c.id), t('contents.toast_unpublished'))} disabled={busy}>
                                <ArrowUUpLeftIcon size={16} />
                              </IconButton>
                            </Tooltip>
                          ) : null}
                          <Tooltip title={c.pinned ? t('contents.action_unpin') : t('contents.action_pin')}>
                            <IconButton size="small" onClick={() => run(() => setContentPinned(c.id, !c.pinned))} disabled={busy}>
                              <PushPinIcon size={16} weight={c.pinned ? 'fill' : 'regular'} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={t('contents.action_delete')}>
                            <IconButton size="small" color="error" onClick={() => run(() => deleteContent(c.id), t('contents.toast_deleted'))} disabled={busy}>
                              <TrashIcon size={16} />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <DeployDialog
        open={deployOpen}
        onClose={() => setDeployOpen(false)}
        site={site}
        sshInfo={sshInfo}
        onDeployed={refreshSite}
      />

      <Snackbar
        open={!!toast}
        autoHideDuration={2000}
        onClose={() => setToast(null)}
        message={toast ?? ''}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
