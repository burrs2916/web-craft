import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
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
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import {
  RocketLaunchIcon,
  ArrowClockwiseIcon,
  EyeIcon,
  PencilSimpleIcon,
  SparkleIcon,
  TrashIcon,
  GlobeHemisphereWestIcon,
  UploadSimpleIcon,
} from '@phosphor-icons/react';
import { useSceneStore } from '../store/sceneStore';
import type { SceneDSL } from '../types/scene';
import { listSites } from '../core/services/cms.service';
import type { SiteSummary } from '../proto';
import { EditWebsiteInfoDialog } from '../components/EditWebsiteInfoDialog';
import { openAiEditorWindow } from '../core/services/window.service';
import { logger } from '../utils/logger';

/// 已发布网站页面：列出所有 status=published 的场景，可选择部署到站点。
export function PublishedSitesPage() {
  const navigate = useNavigate();
  const { scenes, isLoading, loadScenes, unpublishScene, deleteScene, bindSite } = useSceneStore();
  const [snack, setSnack] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null);
  const [deployDialog, setDeployDialog] = useState<{ open: boolean; scene: SceneDSL | null }>({
    open: false,
    scene: null,
  });
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [editDialog, setEditDialog] = useState<{ open: boolean; scene: SceneDSL | null }>({ open: false, scene: null });

  const publishedScenes = scenes.filter((s) => s.status === 'published');

  const refresh = useCallback(async () => {
    await loadScenes();
    try {
      const siteList = await listSites();
      setSites(siteList);
    } catch {
      setSites([]);
    }
  }, [loadScenes]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleEdit = (scene: SceneDSL) => {
    setEditDialog({ open: true, scene });
  };

  const handleOpenEditor = (scene: SceneDSL) => {
    void openAiEditorWindow({ sceneId: scene.id, sceneName: scene.name });
  };

  const handleUnpublish = async (scene: SceneDSL) => {
    try {
      await unpublishScene(scene.id);
      setSnack({ msg: `已取消发布：${scene.name}`, severity: 'success' });
    } catch (err) {
      setSnack({ msg: `取消发布失败：${err}`, severity: 'error' });
    }
  };

  const handleDelete = async (scene: SceneDSL) => {
    try {
      await deleteScene(scene.id);
      setSnack({ msg: `已删除：${scene.name}`, severity: 'success' });
    } catch (err) {
      setSnack({ msg: `删除失败：${err}`, severity: 'error' });
    }
  };

  const handleOpenDeploy = (scene: SceneDSL) => {
    setDeployDialog({ open: true, scene });
    setSelectedSiteId('');
  };

  const handleDeploy = async () => {
    if (!deployDialog.scene || !selectedSiteId) return;
    const site = sites.find((s) => s.id === selectedSiteId);
    if (!site) return;
    // 先绑定场景到站点，建立 Scene → Site → Connection(服务器) 关联链
    // bindSite 内部自动同步 scene.metadata.localWorkDir → site.local_workdir
    try {
      await bindSite(deployDialog.scene.id, selectedSiteId);
      logger.info('PublishedSitesPage', 'Scene bound to site', { sceneId: deployDialog.scene.id, siteId: selectedSiteId });
    } catch (err) {
      logger.error('PublishedSitesPage', 'Failed to bind scene to site', { error: String(err) });
      setSnack({ msg: `绑定站点失败: ${err}`, severity: 'error' });
      return;
    }
    // 导航到站点详情页，附带场景 ID 参数用于部署
    navigate(`/sites/${site.id}?sceneId=${deployDialog.scene.id}`);
    setDeployDialog({ open: false, scene: null });
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <RocketLaunchIcon size={28} color="#34D399" weight="fill" />
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          已发布网站
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
          ({publishedScenes.length})
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Button
          startIcon={<ArrowClockwiseIcon size={18} />}
          onClick={() => void refresh()}
          size="small"
          variant="outlined"
        >
          刷新
        </Button>
      </Box>

      {publishedScenes.length === 0 ? (
        <Paper
          elevation={0}
          sx={{
            p: 6,
            textAlign: 'center',
            border: '1px dashed',
            borderColor: 'divider',
            borderRadius: 2,
          }}
        >
          <RocketLaunchIcon size={48} color="#94A3B8" />
          <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
            还没有已发布的网站
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            在编辑器中设计完成后，点击「发布」按钮即可在此查看
          </Typography>
          <Button
            variant="contained"
            startIcon={<PencilSimpleIcon size={18} />}
            onClick={() => navigate('/editor')}
            sx={{ mt: 2 }}
          >
            前往编辑器
          </Button>
        </Paper>
      ) : (
        <Grid container spacing={2}>
          {publishedScenes.map((scene) => (
            <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={scene.id}>
              <Card
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'box-shadow 0.2s',
                  '&:hover': { boxShadow: 6 },
                }}
              >
                <Box
                  sx={{
                    height: 160,
                    background: scene.thumbnail
                      ? scene.thumbnail.startsWith('data:') || scene.thumbnail.startsWith('linear-gradient(')
                        ? scene.thumbnail
                        : `url(${scene.thumbnail})`
                      : 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {!scene.thumbnail && (
                    <GlobeHemisphereWestIcon size={48} color="#475569" weight="fill" />
                  )}
                  <Chip
                    label="已发布"
                    size="small"
                    sx={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      bgcolor: '#34D399',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: 11,
                    }}
                  />
                </Box>
                <CardContent sx={{ flexGrow: 1, pb: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }} noWrap>
                    {scene.name}
                  </Typography>
                  {scene.description && (
                    <Typography variant="body2" color="text.secondary" sx={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}>
                      {scene.description}
                    </Typography>
                  )}
                  {scene.publishedAt && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                      发布于 {new Date(scene.publishedAt * 1000).toLocaleString('zh-CN')}
                    </Typography>
                  )}
                </CardContent>
                <CardActions sx={{ px: 2, pb: 2, gap: 0.5, flexWrap: 'wrap' }}>
                  <Tooltip title="部署到站点">
                    <IconButton size="small" color="primary" onClick={() => handleOpenDeploy(scene)}>
                      <UploadSimpleIcon size={18} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="编辑信息">
                    <IconButton size="small" onClick={() => handleEdit(scene)}>
                      <PencilSimpleIcon size={18} />
                    </IconButton>
                  </Tooltip>
                  {(scene.metadata.boundSiteId as string) ? (
                    <Tooltip title="AI 编辑">
                      <IconButton size="small" onClick={() => handleOpenEditor(scene)}>
                        <SparkleIcon size={18} />
                      </IconButton>
                    </Tooltip>
                  ) : (
                    <Tooltip title="需先绑定站点才能使用 AI 编辑">
                      <span>
                        <IconButton size="small" disabled>
                          <SparkleIcon size={18} />
                        </IconButton>
                      </span>
                    </Tooltip>
                  )}
                  <Tooltip title="取消发布">
                    <IconButton size="small" onClick={() => handleUnpublish(scene)}>
                      <EyeIcon size={18} />
                    </IconButton>
                  </Tooltip>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }} />
                  <Tooltip title="删除">
                    <IconButton size="small" color="error" onClick={() => handleDelete(scene)}>
                      <TrashIcon size={18} />
                    </IconButton>
                  </Tooltip>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* 编辑网站信息对话框 */}
      <EditWebsiteInfoDialog
        open={editDialog.open}
        scene={editDialog.scene}
        onClose={() => setEditDialog({ open: false, scene: null })}
        onSaved={() => setSnack({ msg: '网站信息已更新', severity: 'success' })}
      />

      {/* 部署对话框 */}
      <Dialog open={deployDialog.open} onClose={() => setDeployDialog({ open: false, scene: null })} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>部署到站点</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <Typography variant="body2" color="text.secondary">
            选择要部署「{deployDialog.scene?.name}」的目标站点
          </Typography>
          <TextField
            select
            autoFocus
            fullWidth
            label="选择站点"
            value={selectedSiteId}
            onChange={(e) => setSelectedSiteId(e.target.value)}
            size="small"
          >
            {sites.length === 0 ? (
              <MenuItem value="" disabled>
                暂无可用站点，请先在站点页面创建
              </MenuItem>
            ) : (
              sites.map((site) => (
                <MenuItem key={site.id} value={site.id}>
                  {site.name} {site.domain ? `(${site.domain})` : ''}
                </MenuItem>
              ))
            )}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeployDialog({ open: false, scene: null })} size="small">取消</Button>
          <Button
            variant="contained"
            size="small"
            onClick={handleDeploy}
            disabled={!selectedSiteId}
            startIcon={<UploadSimpleIcon size={18} />}
          >
            部署
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!snack}
        autoHideDuration={3000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snack?.severity ?? 'info'}
          onClose={() => setSnack(null)}
          sx={{ width: '100%' }}
        >
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
