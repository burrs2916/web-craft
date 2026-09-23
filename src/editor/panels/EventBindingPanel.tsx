import { useState, useMemo, useEffect } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import BoltIcon from "@mui/icons-material/Bolt";
import { useEditorStore } from "../../store/editorStore";
import type { EventBinding } from "../../types/editor";
import { EventBindingListItem } from "./EventBindingListItem";
import { EventBindingEditor } from "./EventBindingEditor";

interface EventBindingPanelProps {
  componentId: string;
  /** 需要高亮定位的事件绑定 id（来自 API 面板跳转），消费后回调清除 */
  highlightBindingId?: string | null;
  onHighlightConsumed?: () => void;
}

/**
 * EventBindingPanel - 事件绑定面板
 * 显示当前组件相关的事件绑定列表，支持添加/编辑/删除
 */
export function EventBindingPanel({
  componentId,
  highlightBindingId,
  onHighlightConsumed,
}: EventBindingPanelProps) {
  const eventBindings = useEditorStore((s) => s.eventBindings);
  const addEventBinding = useEditorStore((s) => s.addEventBinding);
  const removeEventBinding = useEditorStore((s) => s.removeEventBinding);
  const updateEventBinding = useEditorStore((s) => s.updateEventBinding);

  const [editingBinding, setEditingBinding] = useState<EventBinding | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // 当前组件作为 source 的绑定
  const sourceBindings = useMemo(
    () => eventBindings.filter((b) => b.sourceComponentId === componentId),
    [eventBindings, componentId]
  );

  // 当前组件作为 target 的绑定
  const targetBindings = useMemo(
    () =>
      eventBindings.filter(
        (b) => b.targetComponentId === componentId && b.sourceComponentId !== componentId
      ),
    [eventBindings, componentId]
  );

  const handleAdd = () => {
    const newBinding: EventBinding = {
      id: `eb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sourceComponentId: componentId,
      sourceEvent: "onClick",
      targetComponentId: "",
      targetAction: "",
    };
    setEditingBinding(newBinding);
    setIsAdding(true);
  };

  const handleEdit = (binding: EventBinding) => {
    setEditingBinding(binding);
    setIsAdding(false);
  };

  const handleSave = (binding: EventBinding) => {
    if (isAdding) {
      addEventBinding(binding);
    } else {
      updateEventBinding(binding.id, binding);
    }
    setEditingBinding(null);
    setIsAdding(false);
  };

  const handleCancel = () => {
    setEditingBinding(null);
    setIsAdding(false);
  };

  const handleDelete = (id: string) => {
    removeEventBinding(id);
  };

  // 高亮定位后自动清除（短暂高亮提示后恢复常态）
  useEffect(() => {
    if (!highlightBindingId) return;
    const t = setTimeout(() => onHighlightConsumed?.(), 2200);
    return () => clearTimeout(t);
  }, [highlightBindingId, onHighlightConsumed]);

  return (
    <Box sx={{ p: 1.5 }}>
      {/* 源事件绑定 */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 1,
        }}
      >
        <Typography variant="subtitle2" sx={{ fontSize: 13, fontWeight: 600 }}>
          触发事件
        </Typography>
        <Button
          size="small"
          startIcon={<AddIcon sx={{ fontSize: 14 }} />}
          onClick={handleAdd}
          sx={{ fontSize: 11, textTransform: "none", minWidth: "auto" }}
        >
          添加
        </Button>
      </Box>

      {sourceBindings.length > 0 ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, mb: 2 }}>
          {sourceBindings.map((binding) => (
            <EventBindingListItem
              key={binding.id}
              binding={binding}
              isSource={true}
              highlighted={highlightBindingId === binding.id}
              onEdit={() => handleEdit(binding)}
              onDelete={() => handleDelete(binding.id)}
            />
          ))}
        </Box>
      ) : (
        <Box
          sx={{
            py: 2,
            mb: 2,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 0.5,
            borderRadius: 1,
            border: 1,
            borderStyle: "dashed",
            borderColor: "divider",
          }}
        >
          <BoltIcon sx={{ fontSize: 20, color: "text.disabled" }} />
          <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>
            暂无触发事件绑定
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem" }}>
            点击"添加"配置组件的交互行为
          </Typography>
        </Box>
      )}

      {/* 目标事件绑定（只读） */}
      {targetBindings.length > 0 && (
        <>
          <Typography
            variant="subtitle2"
            sx={{ fontSize: 13, fontWeight: 600, mb: 1 }}
          >
            被引用
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
            {targetBindings.map((binding) => (
              <EventBindingListItem
                key={binding.id}
                binding={binding}
                isSource={false}
                highlighted={highlightBindingId === binding.id}
                onEdit={() => handleEdit(binding)}
                onDelete={() => handleDelete(binding.id)}
              />
            ))}
          </Box>
        </>
      )}

      {/* 编辑对话框 */}
      {editingBinding && (
        <EventBindingEditor
          binding={editingBinding}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
    </Box>
  );
}
