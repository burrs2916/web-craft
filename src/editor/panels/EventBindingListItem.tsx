import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Switch from "@mui/material/Switch";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import BoltIcon from "@mui/icons-material/Bolt";
import { useEffect, useRef } from "react";
import type { EventBinding } from "../../types/editor";
import { useEditorStore } from "../../store/editorStore";

interface EventBindingListItemProps {
  binding: EventBinding;
  isSource: boolean;
  highlighted?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

const ACTION_LABELS: Record<string, string> = {
  highlight: '高亮',
  hide: '隐藏',
  show: '显示',
  setData: '设置数据',
  navigate: '打开链接',
  navigateToScene: '跳转场景',
  toggleVisible: '切换可见',
  toggleData: '切换数据',
  setVariable: '设置变量',
  switchView: '切换视图',
  playSound: '播放声音',
  openDialog: '打开弹窗',
  closeDialog: '关闭弹窗',
  callApi: '调用接口',
  executeScript: '执行脚本',
};

const EVENT_LABELS: Record<string, string> = {
  onClick: '点击',
  onDblClick: '双击',
  onMouseEnter: '鼠标进入',
  onMouseLeave: '鼠标离开',
  onDataChange: '数据变化',
  onThreshold: '阈值越限',
  onTimer: '定时触发',
  onStateChange: '状态切换',
};

const TRIGGER_SOURCE_LABELS: Record<string, string> = {
  interaction: '交互',
  data: '数据',
  threshold: '阈值',
  timer: '定时',
  state: '状态',
};

export function EventBindingListItem({ binding, isSource, highlighted, onEdit, onDelete }: EventBindingListItemProps) {
  const components = useEditorStore((s) => s.components);
  const updateEventBinding = useEditorStore((s) => s.updateEventBinding);

  const targetComp = components.find((c) => c.id === binding.targetComponentId);
  const sourceComp = components.find((c) => c.id === binding.sourceComponentId);

  const eventLabel = EVENT_LABELS[binding.sourceEvent] ?? binding.sourceEvent;
  const actionLabel = ACTION_LABELS[binding.targetAction] ?? binding.targetAction;
  const targetName = targetComp?.name ?? binding.targetComponentId;
  const sourceName = binding.sourceComponentId === '*'
    ? '任意组件'
    : (sourceComp?.name ?? binding.sourceComponentId);
  const isEnabled = binding.enabled !== false;
  const triggerLabel = TRIGGER_SOURCE_LABELS[binding.triggerSource ?? 'interaction'] ?? '';

  const handleToggleEnabled = () => {
    updateEventBinding(binding.id, { enabled: !isEnabled });
  };

  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (highlighted && rootRef.current) {
      rootRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [highlighted]);

  return (
    <Box
      ref={rootRef}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        py: 0.75,
        px: 1,
        borderRadius: 1,
        border: 1,
        borderColor: highlighted ? 'primary.main' : 'divider',
        boxShadow: highlighted ? (theme) => `0 0 0 1px ${theme.palette.primary.main}, 0 0 8px ${theme.palette.primary.main}33` : 'none',
        opacity: isEnabled ? 1 : 0.5,
        backgroundColor: (theme) =>
          highlighted
            ? theme.palette.mode === 'dark'
              ? 'rgba(90,80,237,0.18)'
              : 'rgba(75,63,227,0.10)'
            : theme.palette.mode === 'dark'
              ? 'rgba(255,255,255,0.03)'
              : 'rgba(0,0,0,0.02)',
        '&:hover': {
          backgroundColor: (theme) =>
            theme.palette.mode === 'dark'
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(0,0,0,0.04)',
        },
        transition: highlighted ? 'background-color 0.3s, box-shadow 0.3s' : undefined,
      }}
    >
      <BoltIcon sx={{ fontSize: 14, color: isEnabled ? 'primary.main' : 'text.disabled', flexShrink: 0 }} />

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            fontWeight: 500,
            lineHeight: 1.3,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {triggerLabel && (
            <Box component="span" sx={{ fontSize: '0.6rem', color: 'text.secondary', mr: 0.5 }}>
              [{triggerLabel}]
            </Box>
          )}
          {isSource ? eventLabel : `${sourceName} → ${eventLabel}`}
          {' → '}
          <Box component="span" sx={{ color: 'primary.main' }}>
            {binding.targetAction === 'callApi' ? '调用接口' : `${targetName}.${actionLabel}`}
            {binding.params?.boundCompApi ? '（绑定组件）' : ''}
          </Box>
        </Typography>
        {binding.condition && (
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              fontSize: '0.65rem',
              color: 'text.secondary',
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            if ({binding.condition})
          </Typography>
        )}
      </Box>

      <Tooltip title={isEnabled ? '禁用' : '启用'}>
        <Switch
          size="small"
          checked={isEnabled}
          onChange={handleToggleEnabled}
          sx={{ transform: 'scale(0.7)' }}
        />
      </Tooltip>

      <Tooltip title="编辑">
        <IconButton size="small" onClick={onEdit} sx={{ p: 0.25 }}>
          <EditIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title="删除">
        <IconButton size="small" onClick={onDelete} sx={{ p: 0.25 }}>
          <DeleteIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
