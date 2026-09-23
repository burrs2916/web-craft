import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  IconButton,
  CircularProgress,
  Chip,
  Tooltip,
  Snackbar,
  Alert,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  Avatar,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import {
  ArrowLeftIcon,
  PlusIcon,
  GlobeIcon,
  RocketIcon,
  RocketLaunchIcon,
  LinkIcon,
} from '@phosphor-icons/react';
import { getSite } from '../core/services/cms.service';
import { listConnections } from '../core/services/connection.service';
import { spawnTerminal } from '../core/services/terminal.service';
import { ensureServerEnvSetupAgent } from '../core/services/agent.service';
import { openAiCopilotWindow, openSftpWindow } from '../core/services/window.service';
import { useConnectIntent } from '../features/terminal/connectIntent';
import { DeployDialog } from '../features/cms/DeployDialog';
import { previewStart, previewStop } from '../core/services/cms.service';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useSceneStore } from '../store/sceneStore';
import { publishBuildAndDeploy, publishScene, buildProject } from '../services/codegenService';
import { logger } from '../utils/logger';
import type { Site, SshConnectionInfo, PtyConfig } from '../proto';
import type { ConnectionConfig } from '../proto';
import type { SceneDSL } from '../types/scene';
import {
  TerminalIcon,
  FolderOpenIcon as RemoteFolderIcon,
  WrenchIcon,
  PlayIcon,
  StopIcon,
} from '@phosphor-icons/react';

/// 站点详情页：绑定已发布网站（Scene）→ 部署到远程服务器。
/// 服务器管理（终端/SFTP/环境检测）+ 本地预览 + 网站部署（codegen 全链路）。
export function SiteDetailPage() {
  const { siteId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation('cms');
  const { scenes, bindSite } = useSceneStore();

  const [site, setSite] = useState<Site | null>(null);
  const [sshInfo, setSshInfo] = useState<SshConnectionInfo | null>(null);
  const [connectionName, setConnectionName] = useState<string>('');
  const [remotePath, setRemotePath] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [deployOpen, setDeployOpen] = useState(false);
  /// 本地预览当前会话；非空即运行中（含地址与端口）
  const [preview, setPreview] = useState<{ baseUrl: string; port: number } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  // 预览前自动构建的进度
  const [previewBuildProgress, setPreviewBuildProgress] = useState<{ message: string; percent: number } | null>(null);

  // 网站部署（codegen 全链路）状态
  const [siteDeployBusy, setSiteDeployBusy] = useState(false);
  const [siteDeployProgress, setSiteDeployProgress] = useState<{ phase: string; message: string; percent: number } | null>(null);
  // 场景选择对话框
  const [sceneSelectOpen, setSceneSelectOpen] = useState(false);

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
    void openSftpWindow(
      {
        host: sshInfo.host,
        port: sshInfo.port,
        username: sshInfo.username,
        authMethod: sshInfo.auth_method,
        privateKeyPath: sshInfo.private_key_path,
        password: sshInfo.password,
        connectionId: site?.connection_id ?? undefined,
      },
      (msg) => setError(msg),
    );
  }, [sshInfo, site?.connection_id]);

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

  // ─── 场景绑定 ───
  // 从 URL ?sceneId=xxx 读取场景 ID，自动绑定到当前站点
  const urlSceneId = searchParams.get('sceneId');

  // 从场景列表中找到绑定到当前站点的场景
  const boundScene = useMemo<SceneDSL | null>(() => {
    if (!scenes || scenes.length === 0) return null;
    return scenes.find((s) => s.metadata?.boundSiteId === siteId) ?? null;
  }, [scenes, siteId]);

  // 当 URL 携带 sceneId 时执行绑定（从 PublishedSitesPage 跳转过来）
  useEffect(() => {
    if (!urlSceneId || !siteId) return;
    let cancelled = false;
    (async () => {
      try {
        // bindSite 内部自动同步 localWorkDir
        await bindSite(urlSceneId, siteId);
        logger.info('SiteDetailPage', `Scene ${urlSceneId} bound to site ${siteId}`);
        if (!cancelled) {
          setToast('场景已绑定到当前站点');
          navigate(`/sites/${siteId}`, { replace: true });
        }
      } catch (e) {
        if (!cancelled) {
          logger.error('SiteDetailPage', `bindSite failed: ${e}`);
          setError(`绑定场景失败: ${e}`);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [urlSceneId, siteId, bindSite, navigate]);

  // ─── 网站部署（codegen 全链路：publish → build → deploy） ───
  const handleSiteDeploy = useCallback(async () => {
    if (!boundScene || siteDeployBusy) return;
    setSiteDeployBusy(true);
    setSiteDeployProgress(null);
    setError(null);
    try {
      await publishBuildAndDeploy(boundScene, 'static-html', (phase, progress) => {
        setSiteDeployProgress({ phase, message: progress.message, percent: progress.percent });
      });
      setToast('网站部署完成');
      refreshSite();
    } catch (e) {
      setError(`网站部署失败: ${e}`);
      logger.error('SiteDetailPage', `publishBuildAndDeploy failed: ${e}`);
    } finally {
      setSiteDeployBusy(false);
      setSiteDeployProgress(null);
    }
  }, [boundScene, siteDeployBusy, refreshSite]);

  // ─── 场景选择 ───
  // 已发布场景列表（供用户在站点侧选择绑定）
  const publishedScenes = useMemo<SceneDSL[]>(() => {
    if (!scenes || scenes.length === 0) return [];
    return scenes.filter((s) => s.status === 'published');
  }, [scenes]);

  // 从对话框中选择场景并绑定
  const handleSelectScene = useCallback(
    async (sceneId: string) => {
      if (!site) return;
      try {
        // bindSite 内部会自动同步 scene.metadata.localWorkDir → site.local_workdir
        await bindSite(sceneId, siteId);
        logger.info('SiteDetailPage', `Scene ${sceneId} bound to site ${siteId}`);
        setSceneSelectOpen(false);
        setToast('已绑定到选定的网站');
      } catch (e) {
        setError(`绑定场景失败: ${e}`);
      }
    },
    [site, bindSite, siteId],
  );

  // 解绑当前场景
  const handleUnbindScene = useCallback(async () => {
    if (!boundScene) return;
    try {
      await bindSite(boundScene.id, null);
      logger.info('SiteDetailPage', `Scene ${boundScene.id} unbound from site ${siteId}`);
      setToast('已解绑场景');
    } catch (e) {
      setError(`解绑失败: ${e}`);
    }
  }, [boundScene, bindSite, siteId]);

  // 本地预览：启动并打开浏览器；再次点击停止。不依赖 SSH 服务器。
  // 若 dist 不存在，自动触发构建（publish + build，不含部署）后重试。
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
        try {
          const info = await previewStart(siteId);
          setPreview({ baseUrl: info.baseUrl, port: info.port });
          await openUrl(info.baseUrl).catch(() => undefined);
        } catch (previewErr) {
          const errMsg = String(previewErr);
          // dist 不存在 → 自动构建后重试
          if (errMsg.includes('dist not found') || errMsg.includes('please build first') || errMsg.includes('No such file')) {
            if (!boundScene) {
              throw new Error('请先绑定网站，再预览');
            }
            // Phase 1: 生成脚手架
            setPreviewBuildProgress({ message: '生成工程脚手架...', percent: 5 });
            await publishScene(boundScene, { framework: 'static-html' });
            // Phase 2: 构建
            setPreviewBuildProgress({ message: '正在构建...', percent: 15 });
            const buildResult = await buildProject(boundScene, 'static-html', (p) => {
              setPreviewBuildProgress({ message: p.message, percent: 15 + Math.round(p.percent * 0.8) });
            });
            if (!buildResult.success) {
              throw new Error(`构建失败: ${buildResult.error ?? '未知错误'}`);
            }
            setPreviewBuildProgress(null);
            // 构建完成 → 重试预览
            const info = await previewStart(siteId);
            setPreview({ baseUrl: info.baseUrl, port: info.port });
            await openUrl(info.baseUrl).catch(() => undefined);
          } else {
            throw previewErr;
          }
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setPreviewBusy(false);
      setPreviewBuildProgress(null);
    }
  }, [preview, previewBusy, siteId, boundScene, t]);

  if (!site) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, width: '100%' }}>
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
        <Tooltip title={previewBuildProgress ? previewBuildProgress.message : t('contents.preview_hint')}>
          <span>
            <Button
              variant={preview ? 'contained' : 'outlined'}
              color={preview ? 'success' : 'primary'}
              startIcon={preview ? <StopIcon size={16} weight="bold" /> : <PlayIcon size={16} weight="bold" />}
              onClick={togglePreview}
              disabled={previewBusy}
            >
              {previewBusy ? <CircularProgress size={16} /> : null}
              {previewBuildProgress
                ? `构建中 ${previewBuildProgress.percent}%`
                : preview ? t('contents.preview_stop') : t('contents.preview')}
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
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2, ml: 5 }}>
        {sshInfo
          ? `${t('contents.info_local')}: ${site.local_workdir} · ${t('contents.info_server')}: ${sshInfo.username}@${sshInfo.host}${remotePath ? ` → ${remotePath}` : ''}`
          : `${t('contents.info_local')}: ${site.local_workdir}`}
      </Typography>

      {/* ─── 场景绑定 & 网站部署 ─── */}
      <Box sx={{ mb: 2, ml: 5 }}>
        {boundScene ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              p: 1.5,
              borderRadius: 1,
              bgcolor: 'action.hover',
              border: 1,
              borderColor: 'divider',
              flexWrap: 'wrap',
            }}
          >
            <LinkIcon size={18} weight="bold" />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              已绑定网站：{boundScene.name || boundScene.id}
            </Typography>
            {boundScene.status === 'published' ? (
              <Chip label="已发布" size="small" color="success" variant="outlined" />
            ) : (
              <Chip label="草稿" size="small" color="default" variant="outlined" />
            )}
            <Typography variant="caption" color="text.secondary">
              工作目录：{site.local_workdir}
            </Typography>
            <Button
              variant="text"
              size="small"
              onClick={() => setSceneSelectOpen(true)}
              sx={{ textTransform: 'none', color: 'text.secondary' }}
            >
              更换
            </Button>
            <Button
              variant="text"
              size="small"
              onClick={handleUnbindScene}
              sx={{ textTransform: 'none', color: 'text.secondary' }}
            >
              解绑
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button
              variant="contained"
              color="primary"
              size="small"
              startIcon={
                siteDeployBusy ? <CircularProgress size={14} color="inherit" /> : <RocketLaunchIcon size={16} weight="bold" />
              }
              onClick={handleSiteDeploy}
              disabled={siteDeployBusy || !sshInfo}
            >
              {siteDeployBusy ? '部署中…' : '部署网站'}
            </Button>
            {!sshInfo ? (
              <Typography variant="caption" color="text.secondary">
                需先绑定服务器
              </Typography>
            ) : null}
          </Box>
        ) : (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              p: 1.5,
              borderRadius: 1,
              bgcolor: 'action.hover',
              border: 1,
              borderColor: 'divider',
              borderStyle: 'dashed',
            }}
          >
            <GlobeIcon size={18} weight="bold" />
            <Typography variant="body2" color="text.secondary">
              未绑定网站
            </Typography>
            <Button
              variant="outlined"
              size="small"
              startIcon={<PlusIcon size={14} weight="bold" />}
              onClick={() => setSceneSelectOpen(true)}
            >
              选择已发布网站
            </Button>
          </Box>
        )}
        {/* 部署进度条 */}
        {siteDeployProgress ? (
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {siteDeployProgress.phase}：{siteDeployProgress.message}
            </Typography>
            <LinearProgress
              variant="determinate"
              value={siteDeployProgress.percent}
              sx={{ mt: 0.5 }}
            />
          </Box>
        ) : null}
      </Box>

      {/* 场景选择对话框 */}
      <Dialog open={sceneSelectOpen} onClose={() => setSceneSelectOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>选择已发布网站</DialogTitle>
        <DialogContent dividers>
          {publishedScenes.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="body2" color="text.secondary">
                暂无已发布的网站，请先在编辑器中发布场景
              </Typography>
            </Box>
          ) : (
            <List disablePadding>
              {publishedScenes.map((scene) => (
                <ListItemButton
                  key={scene.id}
                  onClick={() => handleSelectScene(scene.id)}
                  sx={{ borderRadius: 1, mb: 0.5 }}
                >
                  <ListItemAvatar>
                    <Avatar variant="rounded" src={scene.thumbnail || undefined}>
                      <GlobeIcon size={20} />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={scene.name || scene.id}
                    secondary={scene.description || `更新于 ${new Date(scene.updatedAt).toLocaleDateString('zh-CN')}`}
                  />
                  {boundScene?.id === scene.id ? (
                    <Chip label="当前" size="small" color="primary" variant="outlined" />
                  ) : null}
                </ListItemButton>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSceneSelectOpen(false)}>取消</Button>
        </DialogActions>
      </Dialog>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

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
