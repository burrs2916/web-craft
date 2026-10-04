import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import type { DragPreview, DropTargetPreview, GuideLine } from './types';

/** 画布内容区内的浮层：空状态、拖放位置预览、容器投放高亮、智能对齐参考线。 */
export function CanvasContentOverlays({
  isPreview,
  visibleCount,
  isDragOver,
  dragPreview,
  dropTargetPreview,
  guides,
}: {
  isPreview: boolean;
  visibleCount: number;
  isDragOver: boolean;
  dragPreview: DragPreview | null;
  dropTargetPreview: DropTargetPreview | null;
  guides: GuideLine[];
}) {
  return (
    <>
      {/* 空状态提示：拖拽入库期间也隐藏，避免"拖动组件后提示字还在" */}
      {!isPreview && visibleCount === 0 && !isDragOver && (
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            color: 'text.secondary',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          <Box
            sx={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 2,
              backgroundColor: (t) =>
                t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
              border: 1,
              borderColor: (t) =>
                t.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
            }}
          >
            <AddIcon sx={{ fontSize: 32, opacity: 0.3 }} />
          </Box>
          <Typography variant="body2" color="text.secondary">
            从左侧组件库拖入元素开始编辑
          </Typography>
        </Box>
      )}

      {/* 拖放位置预览框 */}
      {!isPreview && dragPreview && (
        <Box
          sx={{
            position: 'absolute',
            left: dragPreview.x,
            top: dragPreview.y,
            width: dragPreview.w,
            height: dragPreview.h,
            border: '2px dashed',
            borderColor: 'primary.main',
            borderRadius: 1,
            backgroundColor: (t) =>
              t.palette.mode === 'dark' ? 'rgba(100,149,237,0.08)' : 'rgba(100,149,237,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 3,
            '&::after': {
              content: `'${dragPreview.label}'`,
              fontSize: 11,
              color: 'primary.main',
              fontWeight: 600,
              opacity: 0.7,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
            },
          }}
        />
      )}

      {/* 容器投放高亮 */}
      {!isPreview && dropTargetPreview && (
        <Box
          sx={{
            position: 'absolute',
            left: dropTargetPreview.x,
            top: dropTargetPreview.y,
            width: dropTargetPreview.width,
            height: dropTargetPreview.height,
            border: '2px dashed #4caf50',
            backgroundColor: 'rgba(76,175,80,0.08)',
            borderRadius: 1,
            pointerEvents: 'none',
            zIndex: 5,
          }}
        />
      )}

      {/* 智能对齐参考线 */}
      {!isPreview && guides.length > 0 && (
        <Box sx={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 4 }}>
          {guides.map((g, i) => {
            const key = `${g.type}-${g.position}-${i}`;
            if (g.type === 'vertical') {
              return (
                <Box key={key} sx={{ position: 'absolute', left: g.position, top: g.start, height: g.end - g.start, width: 1, backgroundColor: '#1976d2', opacity: 0.5 }} />
              );
            }
            return (
              <Box key={key} sx={{ position: 'absolute', top: g.position, left: g.start, width: g.end - g.start, height: 1, backgroundColor: '#1976d2', opacity: 0.5 }} />
            );
          })}
        </Box>
      )}
    </>
  );
}