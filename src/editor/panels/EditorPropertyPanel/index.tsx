import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import WidgetsIcon from '@mui/icons-material/Widgets';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

import { useEditorStore } from '../../../store/editorStore';
import { componentRegistry } from '../../registry';
import { getEffectiveTransform } from '../../../types/editor';
import { PanelWrapper } from '../../components/PanelWrapper';
import { CollapsibleSection } from '../property/CollapsibleSection';
import { fieldSx } from '../property/sharedStyles';
import { ComponentConfigPanel } from './ComponentConfigPanel';
import { CompactNumberInput, ZIndexInput } from './inputs';

export { HANDLED_FIELD_TYPES, assertAllFieldTypesHandled } from './fieldTypes';

interface EditorPropertyPanelProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function EditorPropertyPanelContent() {
  const selectedIds = useEditorStore((s) => s.selection.selectedIds);
  const components = useEditorStore((s) => s.components);
  const updateComponent = useEditorStore((s) => s.updateComponent);
  const updateComponentTransform = useEditorStore((s) => s.updateComponentTransform);
  const removeComponent = useEditorStore((s) => s.removeComponent);
  const duplicateComponent = useEditorStore((s) => s.duplicateComponent);
  const reorderComponent = useEditorStore((s) => s.reorderComponent);
  const activeBreakpoint = useEditorStore((s) => s.activeBreakpoint);

  const selectedComponents = components.filter((c) => selectedIds.includes(c.id));

  if (selectedComponents.length === 0) {
    return (
      <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          <Typography sx={{ fontWeight: 600, fontSize: 12 }}>属性</Typography>
        </Box>
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            p: 3,
            gap: 1,
          }}
        >
          <WidgetsIcon sx={{ fontSize: 28, color: 'text.disabled', opacity: 0.4 }} />
          <Typography sx={{ textAlign: 'center', fontSize: 11, color: 'text.secondary' }}>选择画布中的组件</Typography>
          <Typography sx={{ textAlign: 'center', fontSize: 9.5, color: 'text.disabled' }}>以编辑其属性</Typography>
        </Box>
      </Box>
    );
  }

  const comp = selectedComponents[0];
  const definition = componentRegistry.get(comp.type);
  const hasConfig = (definition?.configSchema?.length ?? 0) > 0;
  const sameLayerComps = components.filter((c) => c.layerId === comp.layerId);
  const maxZIndex = sameLayerComps.reduce((max, c) => Math.max(max, c.zIndex), 0);
  const effectiveTransform = getEffectiveTransform(comp, activeBreakpoint);

  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ px: 1.25, py: 0.75, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
          <TextField
            value={comp.name}
            size="small"
            fullWidth
            onChange={(e) => updateComponent(comp.id, { name: e.target.value })}
            sx={{
              ...fieldSx,
              '& .MuiInputBase-input': { fontSize: 12, fontWeight: 600, py: 0.2 },
              '& .MuiOutlinedInput-root': { borderRadius: 0.75, pr: 0.5 },
            }}
          />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Chip
            label={definition?.name || comp.type}
            size="small"
            variant="outlined"
            sx={{ height: 16, fontSize: 9, '& .MuiChip-label': { px: 0.5 } }}
          />
          <Box sx={{ display: 'flex', gap: 0 }}>
            <Tooltip title={comp.visible ? '隐藏' : '显示'} arrow enterDelay={400}>
              <IconButton
                size="small"
                onClick={() => updateComponent(comp.id, { visible: !comp.visible })}
                sx={{ p: 0.2 }}
              >
                {comp.visible ? <VisibilityIcon sx={{ fontSize: 13 }} /> : <VisibilityOffIcon sx={{ fontSize: 13 }} />}
              </IconButton>
            </Tooltip>
            <Tooltip title={comp.locked ? '解锁' : '锁定'} arrow enterDelay={400}>
              <IconButton
                size="small"
                onClick={() => updateComponent(comp.id, { locked: !comp.locked })}
                sx={{ p: 0.2 }}
              >
                {comp.locked ? <LockIcon sx={{ fontSize: 13 }} /> : <LockOpenIcon sx={{ fontSize: 13 }} />}
              </IconButton>
            </Tooltip>
            <Tooltip title="复制" arrow enterDelay={400}>
              <IconButton size="small" onClick={() => duplicateComponent(comp.id)} sx={{ p: 0.2 }}>
                <ContentCopyIcon sx={{ fontSize: 13 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="删除" arrow enterDelay={400}>
              <IconButton size="small" onClick={() => removeComponent(comp.id)} sx={{ p: 0.2, color: 'error.main' }}>
                <DeleteIcon sx={{ fontSize: 13 }} />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Box>

      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          p: 1.25,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          '&::-webkit-scrollbar': { width: 3 },
          '&::-webkit-scrollbar-thumb': { borderRadius: 2 },
        }}
      >
        <CollapsibleSection title="位置与大小">
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
            <CompactNumberInput
              label="X"
              value={effectiveTransform.x}
              onChange={(v) => updateComponentTransform(comp.id, { x: v })}
            />
            <CompactNumberInput
              label="Y"
              value={effectiveTransform.y}
              onChange={(v) => updateComponentTransform(comp.id, { y: v })}
            />
            <CompactNumberInput
              label="W"
              value={effectiveTransform.width}
              onChange={(v) => updateComponentTransform(comp.id, { width: v })}
            />
            <CompactNumberInput
              label="H"
              value={effectiveTransform.height}
              onChange={(v) => updateComponentTransform(comp.id, { height: v })}
            />
          </Box>
          {definition?.capabilities.rotatable && (
            <Box sx={{ mt: 0.5 }}>
              <CompactNumberInput
                label="旋转"
                value={effectiveTransform.rotation}
                onChange={(v) => updateComponentTransform(comp.id, { rotation: v })}
                adornment="°"
              />
            </Box>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="层级顺序">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, py: 0.25 }}>
            <Typography sx={{ fontSize: 10.5, color: 'text.secondary' }}>Z-Index</Typography>
            <ZIndexInput value={comp.zIndex} onCommit={(n) => reorderComponent(comp.id, n)} />
            <Box sx={{ flex: 1 }} />
            <Tooltip title="上移一层" arrow enterDelay={400}>
              <span>
                <IconButton
                  size="small"
                  disabled={comp.zIndex >= maxZIndex}
                  onClick={() => reorderComponent(comp.id, comp.zIndex + 1)}
                  sx={{ p: 0.25 }}
                >
                  <ArrowUpwardIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="下移一层" arrow enterDelay={400}>
              <span>
                <IconButton
                  size="small"
                  disabled={comp.zIndex <= 0}
                  onClick={() => reorderComponent(comp.id, Math.max(0, comp.zIndex - 1))}
                  sx={{ p: 0.25 }}
                >
                  <ArrowDownwardIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        </CollapsibleSection>

        {hasConfig && (
          <>
            <Divider sx={{ borderColor: 'divider', opacity: 0.5 }} />
            <ComponentConfigPanel component={comp} />
          </>
        )}
      </Box>
    </Box>
  );
}

export function EditorPropertyPanel({ collapsed, onToggle }: EditorPropertyPanelProps) {
  return (
    <PanelWrapper collapsed={collapsed} onToggle={onToggle} width={280} position="right" borderSide="left">
      <EditorPropertyPanelContent />
    </PanelWrapper>
  );
}