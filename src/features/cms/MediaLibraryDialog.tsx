import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import {
  ImageIcon,
  TrashIcon,
  UploadSimpleIcon,
  CopyIcon,
  CheckIcon,
  FileIcon,
} from '@phosphor-icons/react';
import { mediaList, mediaUpload, mediaDelete, onMediaChanged } from '../../core/services/media.service';
import { copyText } from '../../core/services/clipboard.service';
import { useNotify } from '../../core/notification';
import type { MediaAsset } from '../../proto/cms';

const PAGE_SIZE = 48;

/**
 * 媒体库对话框：站点媒体资源的网格浏览、上传与删除。
 *
 * 两种模式：
 * - 浏览模式（默认）：管理媒体资源
 * - 选择模式（selectMode=true）：点击图片触发 onSelect 回调，用于封面图/OG 图选择
 */
export function MediaLibraryDialog({
  open,
  onClose,
  siteId,
  selectMode = false,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  siteId: string;
  selectMode?: boolean;
  onSelect?: (asset: MediaAsset) => void;
}) {
  const { t } = useTranslation('cms');
  const { t: tCommon } = useTranslation('common');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const notify = useNotify().notify;

  const [items, setItems] = useState<MediaAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (reset = true) => {
    setLoading(true);
    setError(null);
    try {
      const offset = reset ? 0 : items.length;
      const result = await mediaList({
        siteId,
        limit: PAGE_SIZE,
        offset,
      });
      if (reset) {
        setItems(result.items);
      } else {
        setItems((prev) => [...prev, ...result.items]);
      }
      setTotal(result.total);
      setHasMore(result.items.length === PAGE_SIZE && items.length + result.items.length < result.total);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [siteId, items.length]);

  // 打开时加载 + 监听变更事件
  useEffect(() => {
    if (!open) return;
    void load(true);
    let unlisten: (() => void) | null = null;
    onMediaChanged(() => {
      void load(true);
    }).then((u) => { unlisten = u; });
    return () => {
      if (unlisten) unlisten();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, siteId]);

  const handleUpload = useCallback(async () => {
    const selected = await openFileDialog({
      multiple: true,
      title: t('media.upload'),
      filters: [
        {
          name: 'Images',
          extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'],
        },
        {
          name: 'All Files',
          extensions: ['*'],
        },
      ],
    });
    if (!selected || !Array.isArray(selected) || selected.length === 0) return;

    setUploading(true);
    let successCount = 0;
    let failCount = 0;
    for (const path of selected) {
      if (typeof path !== 'string') continue;
      const filename = path.split(/[/\\]/).pop() || 'file';
      try {
        await mediaUpload({ siteId, sourcePath: path, filename });
        successCount++;
      } catch (e) {
        failCount++;
        console.error('[media] upload failed:', e);
      }
    }
    setUploading(false);

    if (successCount > 0) {
      notify(t('media.upload_success'));
    }
    if (failCount > 0) {
      notify(t('media.upload_failed'), 'error');
    }
  }, [siteId, t, notify]);

  const handleDelete = useCallback(async (asset: MediaAsset) => {
    if (!window.confirm(t('media.delete_confirm', { name: asset.filename }))) return;
    try {
      await mediaDelete({ siteId, assetId: asset.id });
      notify(t('media.delete_success'));
    } catch (e) {
      notify(t('media.delete_failed'), 'error');
      console.error('[media] delete failed:', e);
    }
  }, [siteId, t, notify]);

  const handleCopyPath = useCallback(async (asset: MediaAsset) => {
    const publicPath = `/assets/${asset.storage_path}`;
    try {
      await copyText(publicPath);
      setCopiedId(asset.id);
      setTimeout(() => setCopiedId((id) => (id === asset.id ? null : id)), 1500);
    } catch {
      /* ignore */
    }
  }, []);

  const isImage = (asset: MediaAsset) => asset.mime_type.startsWith('image/');

  const accent = isDark ? '#60A5FA' : '#2563EB';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      sx={{
        '& .MuiDialog-paper': {
          bgcolor: isDark ? '#0D1117' : '#FFFFFF',
          borderRadius: '12px',
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 3,
          pt: 2.5,
          pb: 1,
          borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
        }}
      >
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.05rem' }}>
            {t('media.title')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>
            {t('media.subtitle')}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {t('media.total', { count: total })}
          </Typography>
          <Button
            variant="contained"
            size="small"
            startIcon={uploading ? <CircularProgress size={14} color="inherit" /> : <UploadSimpleIcon size={16} />}
            onClick={handleUpload}
            disabled={uploading}
            sx={{
              bgcolor: accent,
              '&:hover': { bgcolor: accent, filter: 'brightness(0.92)' },
              textTransform: 'none',
              borderRadius: '8px',
              px: 2,
            }}
          >
            {t('media.upload')}
          </Button>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 3, minHeight: 400 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading && items.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={28} />
          </Box>
        ) : items.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              py: 8,
              gap: 1.5,
            }}
          >
            <ImageIcon size={48} style={{ opacity: 0.3 }} />
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('media.empty')}
            </Typography>
          </Box>
        ) : (
          <>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: 'repeat(2, 1fr)',
                  sm: 'repeat(3, 1fr)',
                  md: 'repeat(4, 1fr)',
                  lg: 'repeat(6, 1fr)',
                },
                gap: 1.5,
              }}
            >
              {items.map((asset) => (
                <MediaCard
                  key={asset.id}
                  asset={asset}
                  isImage={isImage(asset)}
                  isDark={isDark}
                  accent={accent}
                  selectMode={selectMode}
                  onSelect={onSelect}
                  onDelete={handleDelete}
                  onCopyPath={handleCopyPath}
                  copied={copiedId === asset.id}
                />
              ))}
            </Box>

            {hasMore && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => load(false)}
                  disabled={loading}
                  sx={{ textTransform: 'none', borderRadius: '8px' }}
                >
                  {loading ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
                  {t('media.load_more')}
                </Button>
              </Box>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions
        sx={{
          px: 3,
          py: 2,
          borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
        }}
      >
        <Typography variant="caption" sx={{ color: 'text.secondary', flex: 1 }}>
          {t('media.max_size_hint')}
        </Typography>
        <Button onClick={onClose} sx={{ textTransform: 'none', borderRadius: '8px' }}>
          {tCommon('action.close')}
        </Button>
      </DialogActions>

      {/* 隐藏的 file input（备用，主路径用 Tauri 对话框） */}
      <input ref={fileInputRef} type="file" multiple hidden />
    </Dialog>
  );
}

// —— 单个媒体卡片 ——

function MediaCard({
  asset,
  isImage,
  isDark,
  accent,
  selectMode,
  onSelect,
  onDelete,
  onCopyPath,
  copied,
}: {
  asset: MediaAsset;
  isImage: boolean;
  isDark: boolean;
  accent: string;
  selectMode: boolean;
  onSelect?: (asset: MediaAsset) => void;
  onDelete: (asset: MediaAsset) => void;
  onCopyPath: (asset: MediaAsset) => void;
  copied: boolean;
}) {
  const { t } = useTranslation('cms');
  const [hover, setHover] = useState(false);

  const handleClick = () => {
    if (selectMode && onSelect) {
      onSelect(asset);
    }
  };

  const sizeLabel = formatSize(asset.size_bytes);
  const dimLabel = asset.width && asset.height
    ? `${asset.width} × ${asset.height}`
    : null;

  return (
    <Box
      onClick={handleClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      sx={{
        position: 'relative',
        borderRadius: '8px',
        overflow: 'hidden',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'}`,
        bgcolor: isDark ? 'rgba(255,255,255,0.02)' : '#FAFAFA',
        cursor: selectMode ? 'pointer' : 'default',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        '&:hover': {
          borderColor: selectMode ? accent : isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.15)',
          boxShadow: selectMode ? `0 0 0 2px ${accent}40` : undefined,
        },
      }}
    >
      {/* 缩略图区域 */}
      <Box
        sx={{
          width: '100%',
          aspectRatio: '1 / 1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          bgcolor: isDark ? '#0A0E14' : '#F0F0F0',
        }}
      >
        {isImage && asset.thumb_path ? (
          <img
            src={`tauri://localhost/${asset.thumb_path}`}
            alt={asset.filename}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <FileIcon size={32} style={{ opacity: 0.4 }} />
        )}
      </Box>

      {/* 文件名 + 信息 */}
      <Box sx={{ px: 1, py: 0.75 }}>
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={asset.filename}
        >
          {asset.filename}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
          {sizeLabel}
          {dimLabel ? ` · ${dimLabel}` : ''}
        </Typography>
      </Box>

      {/* 悬浮操作按钮 */}
      {hover && !selectMode && (
        <Box
          sx={{
            position: 'absolute',
            top: 6,
            right: 6,
            display: 'flex',
            gap: 0.5,
          }}
        >
          <Tooltip title={copied ? t('media.copied') : t('media.copy_url')}>
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); onCopyPath(asset); }}
              sx={{
                width: 28,
                height: 28,
                bgcolor: 'rgba(0,0,0,0.6)',
                color: '#fff',
                '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' },
              }}
            >
              {copied ? <CheckIcon size={14} weight="bold" /> : <CopyIcon size={14} />}
            </IconButton>
          </Tooltip>
          <Tooltip title={t('tags.action_delete')}>
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); onDelete(asset); }}
              sx={{
                width: 28,
                height: 28,
                bgcolor: 'rgba(0,0,0,0.6)',
                color: '#fff',
                '&:hover': { bgcolor: 'rgba(220,38,38,0.9)' },
              }}
            >
              <TrashIcon size={14} />
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
