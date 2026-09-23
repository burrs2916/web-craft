import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Card,
  CardContent,
  CardActions,
  Chip,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  TextField,
  Tooltip,
  IconButton,
  Grid,
  Menu,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import {
  BrowserIcon,
  ArrowClockwiseIcon,
  PencilSimpleIcon,
  SparkleIcon,
  TrashIcon,
  RocketLaunchIcon,
  GlobeHemisphereWestIcon,
  UploadSimpleIcon,
  PlusIcon,
  DotsThreeIcon,
  LinkIcon,
  FolderOpenIcon,
  EyeIcon,
} from '@phosphor-icons/react';
import { useSceneStore } from '../store/sceneStore';
import type { SceneDSL } from '../types/scene';
import { listSites } from '../core/services/cms.service';
import type { SiteSummary } from '../proto';
import { EditWebsiteInfoDialog } from '../components/EditWebsiteInfoDialog';
import { openAiEditorWindow } from '../core/services/window.service';
import { open as openDirectoryDialog } from '@tauri-apps/plugin-dialog';
import { previewScene as codegenPreview, publishScene as codegenPublish } from '../services/codegenService';
import { openPreviewWindow } from '../core/services/window.service';
import { FrameworkSelectDialog } from '../components/codegen/FrameworkSelectDialog';
import type { CodegenFramework } from '../codegen/types';

/// 我的网站页面：统一管理所有网站（场景），支持新建、编辑、发布、绑定站点、部署。
export function WebsitesPage() {
  const navigate = useNavigate();
  const scenes = useSceneStore((s) => s.scenes);
  const isLoading = useSceneStore((s) => s.isLoading);
  const init = useSceneStore((s) => s.init);
  const setActiveScene = useSceneStore((s) => s.setActiveScene);
  const createScene = useSceneStore((s) => s.createScene);
  const deleteScene = useSceneStore((s) => s.deleteScene);
  const publishScene = useSceneStore((s) => s.publishScene);
  const unpublishScene = useSceneStore((s) => s.unpublishScene);
  const bindSite = useSceneStore((s) => s.bindSite);
  const setLocalWorkDir = useSceneStore((s) => s.setLocalWorkDir);

  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [snack, setSnack] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [bindDialog, setBindDialog] = useState<{ open: boolean; scene: SceneDSL | null }>({ open: false, scene: null });
  const [bindSiteId, setBindSiteId] = useState('');
  const [menuAnchor, setMenuAnchor] = useState<{ el: HTMLElement | null; sceneId: string | null }>({ el: null, sceneId: null });
  const [editDialog, setEditDialog] = useState<{ open: boolean; scene: SceneDSL | null }>({ open: false, scene: null });
  const [previewing, setPreviewing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [frameworkDialogOpen, setFrameworkDialogOpen] = useState(false);
  const [pendingPreviewScene, setPendingPreviewScene] = useState<SceneDSL | null>(null);
  const [pendingPublishScene, setPendingPublishScene] = useState<SceneDSL | null>(null);

  const refresh = useCallback(async () => {
    await Promise.all([
      init(),
      listSites().then(setSites).catch(() => {}),
    ]);
  }, [init]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 按状态分组：已发布在前，草稿在后
  const sortedScenes = useMemo(() => {
    return [...scenes].sort((a, b) => {
      if (a.status === 'published' && b.status !== 'published') return -1;
      if (a.status !== 'published' && b.status === 'published') return 1;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  }, [scenes]);

  const draftCount = useMemo(() => scenes.filter((s) => s.status === 'draft').length, [scenes]);
  const publishedCount = useMemo(() => scenes.filter((s) => s.status === 'published').length, [scenes]);

  const showSnack = useCallback((msg: string, severity: 'success' | 'error' = 'success') => {
    setSnack({ msg, severity });
  }, []);

  const handleCreate = useCallback(async () => {
    const name = createName.trim() || '未命名网站';
    setCreating(true);
    try {
      const scene = await createScene({ name, description: createDesc.trim() });
      setCreateOpen(false);
      setCreateName('');
      setCreateDesc('');
      setActiveScene(scene.id);
      navigate('/editor');
    } catch (err) {
      showSnack(`创建失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setCreating(false);
    }
  }, [createName, createDesc, createScene, setActiveScene, navigate, showSnack]);

  const handleEdit = useCallback((scene: SceneDSL) => {
    setEditDialog({ open: true, scene });
  }, []);

  const handleOpenEditor = useCallback((scene: SceneDSL) => {
    void openAiEditorWindow({ sceneId: scene.id, sceneName: scene.name });
  }, []);

  const handlePreview = useCallback((scene: SceneDSL) => {
    setPendingPreviewScene(scene);
    setFrameworkDialogOpen(true);
  }, []);

  const handlePreviewWithFramework = useCallback(async (framework: CodegenFramework) => {
    const scene = pendingPreviewScene;
    if (!scene) return;
    setFrameworkDialogOpen(false);
    setPreviewing(true);
    try {
      const { previewUrl } = await codegenPreview(scene, { framework });
      const firstView = scene.views?.[0];
      const canvasW = firstView?.canvasConfig?.width ?? scene.canvasConfig?.width ?? 1920;
      const canvasH = firstView?.canvasConfig?.height ?? scene.canvasConfig?.height ?? 1080;
      await openPreviewWindow({
        url: previewUrl,
        sceneName: scene.name,
        width: canvasW,
        height: canvasH,
      });
      showSnack('预览已打开');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showSnack(`预览失败: ${msg}`, 'error');
    } finally {
      setPreviewing(false);
      setPendingPreviewScene(null);
    }
  }, [showSnack, pendingPreviewScene]);

  const handlePublish = useCallback((scene: SceneDSL) => {
    setPendingPublishScene(scene);
    setFrameworkDialogOpen(true);
  }, []);

  const handlePublishWithFramework = useCallback(async (framework: CodegenFramework) => {
    const scene = pendingPublishScene;
    if (!scene) return;
    setFrameworkDialogOpen(false);
    setPublishing(true);
    try {
      // 1. 通过 codegen 引擎生成 HTML 并写入绑定的 localWorkDir/{framework}/ 目录
      await codegenPublish(scene, { framework });
      // 2. 更新场景状态为已发布
      await publishScene(scene.id);
      showSnack(`发布成功 → ${framework}`);
    } catch (err) {
      showSnack(`发布失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setPublishing(false);
      setPendingPublishScene(null);
    }
  }, [pendingPublishScene, publishScene, showSnack]);

  const handleUnpublish = useCallback(async (scene: SceneDSL) => {
    try {
      await unpublishScene(scene.id);
      showSnack('已取消发布');
    } catch (err) {
      showSnack(`操作失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  }, [unpublishScene, showSnack]);

  const handleDelete = useCallback(async (scene: SceneDSL) => {
    try {
      await deleteScene(scene.id);
      showSnack('已删除');
    } catch (err) {
      showSnack(`删除失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  }, [deleteScene, showSnack]);

  const handleOpenBind = useCallback((scene: SceneDSL) => {
    setBindSiteId((scene.metadata.boundSiteId as string) || '');
    setBindDialog({ open: true, scene });
  }, []);

  const handleSetWorkDir = useCallback(async (scene: SceneDSL) => {
    try {
      const selected = await openDirectoryDialog({ directory: true, multiple: false });
      if (typeof selected === 'string' && selected) {
        await setLocalWorkDir(scene.id, selected);
        showSnack(`本地工作目录已设置：${selected}`);
      }
    } catch (err) {
      showSnack(`设置失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  }, [setLocalWorkDir, showSnack]);

  const handleConfirmBind = useCallback(async () => {
    if (!bindDialog.scene) return;
    try {
      await bindSite(bindDialog.scene.id, bindSiteId || null);
      showSnack(bindSiteId ? '站点已绑定' : '已解绑站点');
      setBindDialog({ open: false, scene: null });
    } catch (err) {
      showSnack(`绑定失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  }, [bindDialog.scene, bindSiteId, bindSite, showSnack]);

  const handleDeploy = useCallback((scene: SceneDSL) => {
    const siteId = scene.metadata.boundSiteId as string;
    if (!siteId) {
      showSnack('请先绑定站点', 'error');
      return;
    }
    if (scene.status !== 'published') {
      showSnack('请先发布网站', 'error');
      return;
    }
    navigate(`/sites/${siteId}?sceneId=${scene.id}`);
  }, [navigate, showSnack]);

  const getBoundSite = useCallback((scene: SceneDSL): SiteSummary | undefined => {
    const sid = scene.metadata.boundSiteId as string;
    return sid ? sites.find((s) => s.id === sid) : undefined;
  }, [sites]);

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      {/* 页面头部 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <BrowserIcon size={28} weight="fill" color="#6366F1" />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, fontSize: 20 }}>
            我的网站
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 13, mt: 0.25 }}>
            共 {scenes.length} 个网站 · {publishedCount} 已发布 · {draftCount} 草稿
          </Typography>
        </Box>
        <Tooltip title="刷新">
          <IconButton size="small" onClick={() => void refresh()}>
            <ArrowClockwiseIcon size={18} />
          </IconButton>
        </Tooltip>
        <Button
          variant="contained"
          size="small"
          startIcon={<PlusIcon size={16} weight="bold" />}
          onClick={() => setCreateOpen(true)}
          sx={{ borderRadius: 1.5, textTransform: 'none' }}
        >
          新建网站
        </Button>
      </Box>

      {/* 加载态 */}
      {isLoading && scenes.length === 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={32} />
        </Box>
      )}

      {/* 空状态 */}
      {!isLoading && scenes.length === 0 && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            py: 10,
            border: '2px dashed',
            borderColor: 'divider',
            borderRadius: 2,
          }}
        >
          <BrowserIcon size={48} weight="thin" color="#94A3B8" />
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>
            还没有网站，点击「新建网站」开始创建
          </Typography>
          <Button
            variant="outlined"
            startIcon={<PlusIcon size={16} weight="bold" />}
            onClick={() => setCreateOpen(true)}
            sx={{ borderRadius: 1.5, textTransform: 'none' }}
          >
            新建网站
          </Button>
        </Box>
      )}

      {/* 网站卡片网格 */}
      {scenes.length > 0 && (
        <Grid container spacing={2}>
          {sortedScenes.map((scene) => {
            const isPublished = scene.status === 'published';
            const boundSite = getBoundSite(scene);
            const isDeployed = !!boundSite && isPublished;
            return (
              <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={scene.id}>
                <Card
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: 2,
                    transition: 'box-shadow 0.2s, transform 0.2s',
                    '&:hover': { boxShadow: 6, transform: 'translateY(-2px)' },
                  }}
                >
                  {/* 缩略图区 */}
                  <Box
                    sx={{
                      height: 140,
                      background: scene.thumbnail
                        ? scene.thumbnail.startsWith('data:') || scene.thumbnail.startsWith('linear-gradient(')
                          ? scene.thumbnail
                          : `url(${scene.thumbnail})`
                        : 'linear-gradient(135deg, #6366F1 0%, #818CF8 100%)',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'flex-end',
                      p: 1.5,
                    }}
                  >
                    {/* 状态标签 */}
                    <Box sx={{ display: 'flex', gap: 0.5, position: 'absolute', top: 8, right: 8 }}>
                      {isPublished ? (
                        <Chip
                          label="已发布"
                          size="small"
                          color="success"
                          sx={{ height: 22, fontSize: 11, fontWeight: 600, backdropFilter: 'blur(8px)' }}
                        />
                      ) : (
                        <Chip
                          label="草稿"
                          size="small"
                          sx={{
                            height: 22,
                            fontSize: 11,
                            fontWeight: 600,
                            backgroundColor: 'rgba(245,158,11,0.85)',
                            color: '#fff',
                            backdropFilter: 'blur(8px)',
                          }}
                        />
                      )}
                      {isDeployed && (
                        <Chip
                          label="已部署"
                          size="small"
                          sx={{
                            height: 22,
                            fontSize: 11,
                            fontWeight: 600,
                            backgroundColor: 'rgba(59,130,246,0.85)',
                            color: '#fff',
                            backdropFilter: 'blur(8px)',
                          }}
                        />
                      )}
                    </Box>
                    {/* 绑定站点信息 */}
                    {boundSite && (
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                          backgroundColor: 'rgba(0,0,0,0.5)',
                          color: '#fff',
                          px: 1,
                          py: 0.25,
                          borderRadius: 1,
                          fontSize: 11,
                          fontWeight: 500,
                          backdropFilter: 'blur(8px)',
                        }}
                      >
                        <GlobeHemisphereWestIcon size={12} />
                        {boundSite.domain || boundSite.name}
                      </Box>
                    )}
                    {/* 本地工作目录信息 */}
                    {(scene.metadata.localWorkDir as string) && (
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                          backgroundColor: 'rgba(0,0,0,0.5)',
                          color: '#FBBF24',
                          px: 1,
                          py: 0.25,
                          borderRadius: 1,
                          fontSize: 11,
                          fontWeight: 500,
                          backdropFilter: 'blur(8px)',
                          maxWidth: 120,
                        }}
                      >
                        <FolderOpenIcon size={12} />
                        <Box
                          component="span"
                          sx={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {(scene.metadata.localWorkDir as string).split('/').pop()}
                        </Box>
                      </Box>
                    )}
                  </Box>

                  <CardContent sx={{ flex: 1, pb: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: 14, mb: 0.5 }} noWrap>
                      {scene.name}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ color: 'text.secondary', fontSize: 12, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                    >
                      {scene.description || '暂无描述'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: 11, mt: 0.5, display: 'block' }}>
                      更新于 {new Date((scene.updatedAt || 0) * 1000).toLocaleDateString('zh-CN')}
                    </Typography>
                  </CardContent>

                  <CardActions sx={{ px: 1.5, pb: 1.5, gap: 0.5, flexWrap: 'wrap' }}>
                    <Tooltip title="编辑信息">
                      <IconButton size="small" onClick={() => handleEdit(scene)}>
                        <PencilSimpleIcon size={16} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="预览">
                      <IconButton size="small" onClick={() => void handlePreview(scene)}>
                        <EyeIcon size={16} />
                      </IconButton>
                    </Tooltip>
                    {(scene.metadata.boundSiteId as string) ? (
                      <Tooltip title="AI 编辑">
                        <IconButton size="small" onClick={() => handleOpenEditor(scene)}>
                          <SparkleIcon size={16} />
                        </IconButton>
                      </Tooltip>
                    ) : (
                      <Tooltip title="需先绑定站点才能使用 AI 编辑">
                        <span>
                          <IconButton size="small" disabled>
                            <SparkleIcon size={16} />
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}
                    {isPublished ? (
                      <Tooltip title="取消发布">
                        <IconButton size="small" onClick={() => void handleUnpublish(scene)}>
                          <RocketLaunchIcon size={16} color="#34D399" />
                        </IconButton>
                      </Tooltip>
                    ) : (
                      <Tooltip title="发布">
                        <IconButton size="small" onClick={() => void handlePublish(scene)}>
                          <RocketLaunchIcon size={16} />
                        </IconButton>
                      </Tooltip>
                    )}
                    {isPublished ? (
                      <Tooltip title={boundSite ? '更换绑定站点' : '绑定站点'}>
                        <IconButton size="small" onClick={() => handleOpenBind(scene)}>
                          <LinkIcon size={16} color={boundSite ? '#6366F1' : undefined} />
                        </IconButton>
                      </Tooltip>
                    ) : (
                      <Tooltip title="需先发布网站才能绑定站点">
                        <span>
                          <IconButton size="small" disabled>
                            <LinkIcon size={16} />
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}
                    {isPublished && boundSite && (
                      <Tooltip title="部署">
                        <IconButton size="small" onClick={() => handleDeploy(scene)}>
                          <UploadSimpleIcon size={16} color="#3B82F6" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {(() => {
                      const workDir = scene.metadata.localWorkDir as string | undefined;
                      return (
                        <Tooltip title={workDir ? `本地工作目录：${workDir}` : '设置本地工作目录'}>
                          <IconButton size="small" onClick={() => handleSetWorkDir(scene)}>
                            <FolderOpenIcon size={16} color={workDir ? '#F59E0B' : undefined} />
                          </IconButton>
                        </Tooltip>
                      );
                    })()}
                    <Box sx={{ flex: '1 1 0%', minWidth: 0 }} />
                    <Tooltip title="删除">
                      <IconButton
                        size="small"
                        onClick={(e) => setMenuAnchor({ el: e.currentTarget, sceneId: scene.id })}
                      >
                        <DotsThreeIcon size={16} />
                      </IconButton>
                    </Tooltip>
                  </CardActions>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* 编辑网站信息对话框 */}
      <EditWebsiteInfoDialog
        open={editDialog.open}
        scene={editDialog.scene}
        onClose={() => setEditDialog({ open: false, scene: null })}
        onSaved={() => showSnack('网站信息已更新')}
      />

      {/* 新建网站对话框 */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>新建网站</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            autoFocus
            label="网站名称"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !creating) void handleCreate(); }}
            size="small"
            fullWidth
            sx={{ mt: 0.5 }}
          />
          <TextField
            label="网站描述（可选）"
            value={createDesc}
            onChange={(e) => setCreateDesc(e.target.value)}
            size="small"
            fullWidth
            multiline
            rows={2}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)} size="small">取消</Button>
          <Button
            onClick={() => void handleCreate()}
            variant="contained"
            size="small"
            disabled={creating}
            startIcon={creating ? <CircularProgress size={14} color="inherit" /> : null}
          >
            创建并编辑
          </Button>
        </DialogActions>
      </Dialog>

      {/* 绑定站点对话框 */}
      <Dialog open={bindDialog.open} onClose={() => setBindDialog({ open: false, scene: null })} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>绑定站点</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          {(() => {
            // 只显示已部署过的站点（有 last_deployed_at）
            const deployedSites = sites.filter(
              (s) => s.status === 'active' && s.last_deployed_at !== null,
            );
            const hasActiveButUndeployed = sites.some(
              (s) => s.status === 'active' && s.last_deployed_at === null,
            );
            if (deployedSites.length === 0) {
              return (
                <Alert severity="info">
                  暂无已部署的站点。请先在「站点」页面创建站点并完成首次部署。
                  {hasActiveButUndeployed && (
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                      （有 {sites.filter((s) => s.status === 'active' && !s.last_deployed_at).length} 个站点尚未部署）
                    </Typography>
                  )}
                </Alert>
              );
            }
            return (
              <>
                <TextField
                  select
                  autoFocus
                  label="选择站点"
                  value={bindSiteId}
                  onChange={(e) => setBindSiteId(e.target.value)}
                  size="small"
                  fullWidth
                  sx={{ mt: 0.5 }}
                >
                  <MenuItem value="">不绑定</MenuItem>
                  {deployedSites.map((site) => (
                    <MenuItem key={site.id} value={site.id}>
                      {site.name}{site.domain ? ` (${site.domain})` : ''}
                    </MenuItem>
                  ))}
                </TextField>
                {hasActiveButUndeployed && (
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    仅显示已部署的站点，还有 {sites.filter((s) => s.status === 'active' && !s.last_deployed_at).length} 个站点尚未部署
                  </Typography>
                )}
              </>
            );
          })()}
          {bindDialog.scene && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              网站：{bindDialog.scene.name}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBindDialog({ open: false, scene: null })} size="small">取消</Button>
          <Button onClick={() => void handleConfirmBind()} variant="contained" size="small">确认</Button>
        </DialogActions>
      </Dialog>

      {/* 删除确认菜单 */}
      <Menu
        open={!!menuAnchor.el}
        anchorEl={menuAnchor.el}
        onClose={() => setMenuAnchor({ el: null, sceneId: null })}
      >
        <MenuItem
          onClick={() => {
            const scene = scenes.find((s) => s.id === menuAnchor.sceneId);
            if (scene) void handleDelete(scene);
            setMenuAnchor({ el: null, sceneId: null });
          }}
          sx={{ color: 'error.main', gap: 1.5 }}
        >
          <ListItemIcon><TrashIcon size={16} color="#EF4444" /></ListItemIcon>
          <ListItemText primary="删除网站" sx={{ fontSize: 13 }} />
        </MenuItem>
      </Menu>

      {/* Snackbar */}
      <Snackbar
        open={!!snack}
        autoHideDuration={3000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snack?.severity || 'info'}
          onClose={() => setSnack(null)}
          sx={{ borderRadius: 1 }}
        >
          {snack?.msg}
        </Alert>
      </Snackbar>

      {/* 预览加载中 */}
      <Dialog
        open={previewing}
        maxWidth="xs"
        slotProps={{
          paper: { sx: { borderRadius: 3, boxShadow: 0, backgroundColor: 'transparent' } },
          transition: { timeout: 200 },
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 4 }}>
          <CircularProgress size={48} />
          <Typography variant="body2" color="text.secondary">
            正在生成预览...
          </Typography>
        </Box>
      </Dialog>

      {/* 框架选择对话框（预览和发布共用） */}
      <FrameworkSelectDialog
        open={frameworkDialogOpen}
        mode={pendingPublishScene ? 'publish' : 'preview'}
        onClose={() => {
          setFrameworkDialogOpen(false);
          setPendingPreviewScene(null);
          setPendingPublishScene(null);
        }}
        onSelect={(fw) => {
          if (pendingPreviewScene) {
            void handlePreviewWithFramework(fw);
          } else if (pendingPublishScene) {
            void handlePublishWithFramework(fw);
          }
        }}
      />

      {/* 发布中遮罩 */}
      <Dialog open={publishing} maxWidth="xs">
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 4 }}>
          <CircularProgress size={48} />
          <Typography variant="body2" color="text.secondary">
            正在发布...
          </Typography>
        </Box>
      </Dialog>
    </Box>
  );
}
