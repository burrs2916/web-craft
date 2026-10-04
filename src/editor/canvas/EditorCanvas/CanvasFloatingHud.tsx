import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Divider from '@mui/material/Divider';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import { MIN_ZOOM, MAX_ZOOM } from '../../utils/canvasConstants';

/** 画布外层浮层 HUD：空格平移提示、缩放控制条、鼠标坐标标签。 */
export function CanvasFloatingHud({
  isPreview,
  spaceHeld,
  cursorPos,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onZoomToFit,
}: {
  isPreview: boolean;
  spaceHeld: boolean;
  cursorPos: { x: number; y: number } | null;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onZoomToFit: () => void;
}) {
  return (
    <>
      {/* ─── 空格平移模式提示 ─── */}
      {!isPreview && spaceHeld && (
        <Box
          sx={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            px: 1.5,
            py: 0.5,
            borderRadius: 1.5,
            fontSize: 11,
            fontWeight: 600,
            color: 'primary.contrastText',
            backgroundColor: 'primary.main',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            zIndex: 100,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          平移模式 · 按住拖动
        </Box>
      )}

      {/* ─── 缩放控制浮层 ─── */}
      {!isPreview && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 0.25,
            px: 0.5,
            py: 0.25,
            borderRadius: 1.5,
            backgroundColor: (t) => (t.palette.mode === 'dark' ? 'rgba(30,30,42,0.9)' : 'rgba(255,255,255,0.9)'),
            backdropFilter: 'blur(8px)',
            border: 1,
            borderColor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'),
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            zIndex: 100,
          }}
        >
          <Tooltip title="缩小 (Ctrl+-)">
            <IconButton size="small" onClick={onZoomOut} disabled={zoom <= MIN_ZOOM}>
              <ZoomOutIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="点击重置 100%">
            <Box
              onClick={onResetZoom}
              sx={{
                cursor: 'pointer',
                px: 0.75,
                minWidth: 48,
                textAlign: 'center',
                userSelect: 'none',
                '&:hover': { opacity: 0.7 },
              }}
            >
              <Typography variant="caption" sx={{ fontSize: 11, fontWeight: 600 }}>
                {Math.round(zoom * 100)}%
              </Typography>
            </Box>
          </Tooltip>
          <Tooltip title="放大 (Ctrl+=)">
            <IconButton size="small" onClick={onZoomIn} disabled={zoom >= MAX_ZOOM}>
              <ZoomInIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
          <Tooltip title="宽度自适应（缩放铺满浏览器宽度）">
            <IconButton size="small" onClick={onZoomToFit}>
              <FitScreenIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>
      )}

      {/* ─── 鼠标坐标标签 ─── */}
      {!isPreview && cursorPos && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 0.25,
            px: 1,
            py: 0.25,
            borderRadius: 0.75,
            fontFamily: 'monospace',
            fontSize: 11,
            fontWeight: 500,
            backgroundColor: (t) => (t.palette.mode === 'dark' ? 'rgba(30,30,42,0.85)' : 'rgba(255,255,255,0.85)'),
            color: 'text.secondary',
            backdropFilter: 'blur(8px)',
            border: 1,
            borderColor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'),
            pointerEvents: 'none',
            zIndex: 100,
          }}
        >
          <Box component="span" sx={{ color: 'text.disabled' }}>x</Box>
          <Box component="span" sx={{ fontWeight: 600, color: 'text.primary', minWidth: 24 }}>{cursorPos.x}</Box>
          <Box component="span" sx={{ color: 'text.disabled', ml: 0.5 }}>y</Box>
          <Box component="span" sx={{ fontWeight: 600, color: 'text.primary', minWidth: 24 }}>{cursorPos.y}</Box>
        </Box>
      )}
    </>
  );
}