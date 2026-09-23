import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import TextField from "@mui/material/TextField";
import Slider from "@mui/material/Slider";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Divider from "@mui/material/Divider";
import Collapse from "@mui/material/Collapse";
import Select from "@mui/material/Select";
import FormControl from "@mui/material/FormControl";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import LayersIcon from "@mui/icons-material/Layers";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import FolderIcon from "@mui/icons-material/Folder";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import WallpaperIcon from "@mui/icons-material/Wallpaper";
import React, { useState, useCallback } from "react";
import { useEditorStore } from "../../store/editorStore";
import type { LayerNode, SceneComponent } from "../../types/editor";
import { getLayerDescendants } from "../../types/editor";
import { componentRegistry } from "../registry";

function NewFolderIcon({ fontSize = 14 }: { fontSize?: number }) {
  return (
    <Box sx={{ position: "relative", width: fontSize, height: fontSize, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <FolderIcon sx={{ fontSize: fontSize * 0.9 }} />
      <AddIcon
        sx={{
          position: "absolute",
          fontSize: fontSize * 0.5,
          bottom: -1,
          right: -1,
          backgroundColor: "background.paper",
          borderRadius: "50%",
          border: "1px solid",
          borderColor: "divider",
        }}
      />
    </Box>
  );
}

const LAYER_COLORS = [
  "#2196F3", "#4CAF50", "#FF9800", "#9C27B0",
  "#F44336", "#00BCD4", "#E91E63", "#8BC34A",
];

const BLEND_MODES = [
  { label: "正常", value: "normal" },
  { label: "正片叠底", value: "multiply" },
  { label: "滤色", value: "screen" },
  { label: "叠加", value: "overlay" },
  { label: "变暗", value: "darken" },
  { label: "变亮", value: "lighten" },
  { label: "颜色减淡", value: "color-dodge" },
  { label: "颜色加深", value: "color-burn" },
  { label: "强光", value: "hard-light" },
  { label: "柔光", value: "soft-light" },
  { label: "差值", value: "difference" },
  { label: "排除", value: "exclusion" },
];

function ComponentItem({
  comp,
  depth,
  selectedIds,
  hoveredId,
  onSelect,
  onHover,
  onDelete,
  onToggleVisibility,
  childComponents,
  childrenMap,
}: {
  comp: SceneComponent;
  depth: number;
  selectedIds: string[];
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onDelete: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  childComponents: SceneComponent[];
  childrenMap: Map<string, SceneComponent[]>;
}) {
  const [expanded, setExpanded] = useState(true);
  const definition = componentRegistry.get(comp.type);
  const isSelected = selectedIds.includes(comp.id);
  const isHovered = hoveredId === comp.id;
  const hasChildren = childComponents.length > 0;

  return (
    <Box>
      <Box
        onClick={() => onSelect(comp.id)}
        onMouseEnter={() => onHover(comp.id)}
        onMouseLeave={() => onHover(null)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          pl: 2 + depth * 1.5,
          pr: 0.5,
          py: 0.2,
          cursor: "pointer",
          borderRadius: 0.5,
          mx: 0.5,
          backgroundColor: isSelected
            ? "action.selected"
            : isHovered
              ? "action.hover"
              : "transparent",
          transition: "background-color 0.1s",
          borderLeft: "2px solid",
          borderLeftColor: "divider",
          ml: 1,
        }}
      >
        {hasChildren ? (
          <IconButton
            size="small"
            sx={{ p: 0, width: 16, height: 16, flexShrink: 0 }}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? (
              <ExpandMoreIcon sx={{ fontSize: 12 }} />
            ) : (
              <ChevronRightIcon sx={{ fontSize: 12 }} />
            )}
          </IconButton>
        ) : (
          <Box sx={{ width: 16, height: 16, flexShrink: 0 }} />
        )}
        <Box
          sx={{
            width: 4,
            height: 4,
            borderRadius: "50%",
            backgroundColor: comp.visible ? "text.secondary" : "text.disabled",
            flexShrink: 0,
          }}
        />
        <Typography
          variant="caption"
          noWrap
          sx={{
            flex: 1,
            fontSize: 10,
            opacity: comp.visible ? 0.8 : 0.4,
            color: "text.secondary",
          }}
        >
          {comp.name}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            fontSize: 9,
            color: "text.disabled",
            flexShrink: 0,
            mr: 0.5,
          }}
        >
          {definition?.name || comp.type}
        </Typography>
        <Box sx={{ display: "flex", gap: 0.25, ml: "auto" }}>
          <IconButton
            size="small"
            sx={{
              p: 0.15,
              opacity: isHovered ? 1 : 0.3,
              transition: "opacity 0.15s",
            }}
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility(comp.id);
            }}
          >
            {comp.visible ? (
              <VisibilityIcon sx={{ fontSize: 10 }} />
            ) : (
              <VisibilityOffIcon sx={{ fontSize: 10 }} />
            )}
          </IconButton>
          <IconButton
            size="small"
            sx={{
              p: 0.15,
              opacity: isHovered ? 1 : 0,
              transition: "opacity 0.15s",
              "&:hover": { color: "error.main" },
            }}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(comp.id);
            }}
          >
            <DeleteIcon sx={{ fontSize: 10 }} />
          </IconButton>
        </Box>
      </Box>

      {hasChildren && (
        <Collapse in={expanded} timeout="auto">
          {childComponents.map((child) => (
            <ComponentItem
              key={child.id}
              comp={child}
              depth={depth + 1}
              selectedIds={selectedIds}
              hoveredId={hoveredId}
              onSelect={onSelect}
              onHover={onHover}
              onDelete={onDelete}
              onToggleVisibility={onToggleVisibility}
              childComponents={childrenMap.get(child.id) || []}
              childrenMap={childrenMap}
            />
          ))}
        </Collapse>
      )}
    </Box>
  );
}

function LayerItem({
  layer,
  depth,
  selectedLayerId,
  dragOverLayerId,
  dragOverPosition,
  onLayerClick,
  onLayerDoubleClick,
  onContextMenu,
  onToggleExpand,
  onToggleVisibility,
  onToggleLock,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  editingLayerId,
  editValue,
  onEditChange,
  onEditBlur,
  onEditKeyDown,
  layerMap,
  components,
  selection,
  selectComponent,
  setHoveredComponent,
  removeComponent,
  toggleComponentVisibility,
}: {
  layer: LayerNode;
  depth: number;
  selectedLayerId: string | null;
  dragOverLayerId: string | null;
  dragOverPosition: "top" | "bottom" | "middle" | null;
  onLayerClick: (id: string) => void;
  onLayerDoubleClick: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  onToggleExpand: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, targetId: string) => void;
  onDragEnd: () => void;
  editingLayerId: string | null;
  editValue: string;
  onEditChange: (v: string) => void;
  onEditBlur: () => void;
  onEditKeyDown: (e: React.KeyboardEvent) => void;
  layerMap: Map<string, LayerNode>;
  components: SceneComponent[];
  selection: { selectedIds: string[]; hoveredId: string | null };
  selectComponent: (id: string) => void;
  setHoveredComponent: (id: string | null) => void;
  removeComponent: (id: string) => void;
  toggleComponentVisibility: (id: string) => void;
}) {
  const isGroup = layer.type === "group";
  const childLayers = isGroup
    ? layer.children
        .map((cid) => layerMap.get(cid))
        .filter(Boolean)
        .sort((a, b) => a!.order - b!.order) as LayerNode[]
    : [];
  const layerComps = components.filter((c) => c.layerId === layer.id);
  const rootLayerComps = layerComps.filter((c) => !c.parentId);
  const layerChildrenMap = new Map<string, SceneComponent[]>();
  for (const c of layerComps) {
    if (c.parentId) {
      const siblings = layerChildrenMap.get(c.parentId);
      if (siblings) {
        siblings.push(c);
      } else {
        layerChildrenMap.set(c.parentId, [c]);
      }
    }
  }
  const isSelected = selectedLayerId === layer.id;
  const isDragOver = dragOverLayerId === layer.id;
  const isEditing = editingLayerId === layer.id;

  const layerColor = layer.color || LAYER_COLORS[layerMap.size > 0 ? Array.from(layerMap.keys()).indexOf(layer.id) % LAYER_COLORS.length : 0];

  return (
    <Box>
      <Box
        draggable={!layer.locked}
        onDragStart={(e) => onDragStart(e, layer.id)}
        onDragOver={(e) => onDragOver(e, layer.id)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, layer.id)}
        onDragEnd={onDragEnd}
        sx={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          pl: isGroup ? 0.5 : 2.5,
          pr: 0.5,
          py: 0.3,
          cursor: layer.locked ? "not-allowed" : "pointer",
          backgroundColor: isSelected ? "action.selected" : "transparent",
          borderRadius: 0.5,
          mx: 0.5,
          transition: "background-color 0.1s",
          fontWeight: 600,
          "&:hover": {
            backgroundColor: isSelected ? "action.selected" : "action.hover",
          },
          "&:before": isDragOver && dragOverPosition === "top"
            ? {
                content: '""',
                position: "absolute",
                top: -1,
                left: depth * 16 + 8,
                right: 8,
                height: 2,
                borderRadius: 1,
                backgroundColor: "primary.main",
              }
            : undefined,
          "&:after": isDragOver && dragOverPosition === "bottom"
            ? {
                content: '""',
                position: "absolute",
                bottom: -1,
                left: depth * 16 + 8,
                right: 8,
                height: 2,
                borderRadius: 1,
                backgroundColor: "primary.main",
              }
            : undefined,
          ...(isDragOver && dragOverPosition === "middle"
            ? {
                outline: "2px solid",
                outlineColor: "primary.main",
                outlineOffset: -2,
                borderRadius: 1,
              }
            : {}),
        }}
        onClick={() => onLayerClick(layer.id)}
        onDoubleClick={() => onLayerDoubleClick(layer.id)}
        onContextMenu={(e) => onContextMenu(e, layer.id)}
      >
        <DragIndicatorIcon
          sx={{
            fontSize: 12,
            color: "text.disabled",
            mr: 0.25,
            cursor: layer.locked ? "not-allowed" : "grab",
            opacity: layer.locked ? 0.2 : 0.5,
            flexShrink: 0,
            "&:hover": { opacity: layer.locked ? 0.2 : 0.8 },
          }}
        />

        {isGroup && (
          <IconButton
            size="small"
            sx={{ p: 0, mr: 0.25, width: 20, height: 20 }}
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(layer.id);
            }}
          >
            {layer.expanded ? (
              <ExpandMoreIcon sx={{ fontSize: 14 }} />
            ) : (
              <ChevronRightIcon sx={{ fontSize: 14 }} />
            )}
          </IconButton>
        )}

        {!isGroup && <Box sx={{ width: 20, height: 20, flexShrink: 0 }} />}

        <Box
          sx={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            backgroundColor: layerColor,
            opacity: layer.visible ? 1 : 0.3,
            flexShrink: 0,
            mr: 0.75,
            transition: "opacity 0.15s",
          }}
        />

        {isGroup ? (
          layer.expanded ? (
            <FolderOpenIcon sx={{ fontSize: 16, mr: 0.5, color: "text.secondary", flexShrink: 0 }} />
          ) : (
            <FolderIcon sx={{ fontSize: 16, mr: 0.5, color: "text.secondary", flexShrink: 0 }} />
          )
        ) : (
          <LayersIcon sx={{ fontSize: 14, mr: 0.5, color: "text.secondary", flexShrink: 0 }} />
        )}

        {isEditing ? (
          <TextField
            value={editValue}
            size="small"
            variant="standard"
            autoFocus
            sx={{ flex: 1, "& .MuiInput-input": { fontSize: 12, py: 0, fontWeight: 600 } }}
            onChange={(e) => onEditChange(e.target.value)}
            onBlur={onEditBlur}
            onKeyDown={onEditKeyDown}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              noWrap
              sx={{
                fontSize: 12,
                fontWeight: 600,
                opacity: layer.visible ? 1 : 0.5,
                textDecoration: layer.locked ? "line-through" : "none",
              }}
            >
              {layer.name}
            </Typography>
            {layer.isBackground && (
              <WallpaperIcon sx={{ fontSize: 10, color: "primary.main", flexShrink: 0 }} />
            )}
          </Box>
        )}

        <Typography
          variant="caption"
          sx={{
            color: "text.disabled",
            ml: 0.5,
            flexShrink: 0,
            fontSize: 10,
            minWidth: 12,
            textAlign: "right",
            fontWeight: 600,
          }}
        >
          {layerComps.length || ""}
        </Typography>

        <Box sx={{ display: "flex", flexShrink: 0, ml: "auto" }}>
          <IconButton
            size="small"
            sx={{ p: 0.15 }}
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility(layer.id);
            }}
          >
            {layer.visible ? (
              <VisibilityIcon sx={{ fontSize: 12, opacity: 0.7 }} />
            ) : (
              <VisibilityOffIcon sx={{ fontSize: 12, opacity: 0.4 }} />
            )}
          </IconButton>
          <IconButton
            size="small"
            sx={{ p: 0.15 }}
            onClick={(e) => {
              e.stopPropagation();
              onToggleLock(layer.id);
            }}
          >
            {layer.locked ? (
              <LockIcon sx={{ fontSize: 12, opacity: 0.9 }} />
            ) : (
              <LockOpenIcon sx={{ fontSize: 12, opacity: 0.4 }} />
            )}
          </IconButton>
        </Box>
      </Box>

      {!isGroup && rootLayerComps.length > 0 && (
        <Collapse in={true} timeout="auto">
          {rootLayerComps
            .sort((a, b) => a.zIndex - b.zIndex)
            .map((comp) => (
              <ComponentItem
                key={comp.id}
                comp={comp}
                depth={0}
                selectedIds={selection.selectedIds}
                hoveredId={selection.hoveredId}
                onSelect={selectComponent}
                onHover={setHoveredComponent}
                onDelete={removeComponent}
                onToggleVisibility={toggleComponentVisibility}
                childComponents={layerChildrenMap.get(comp.id) || []}
                childrenMap={layerChildrenMap}
              />
            ))}
        </Collapse>
      )}

      {isGroup && (
        <Collapse in={layer.expanded} timeout="auto">
          {childLayers.map((child) => (
            <LayerItem
              key={child.id}
              layer={child}
              depth={depth + 1}
              selectedLayerId={selectedLayerId}
              dragOverLayerId={dragOverLayerId}
              dragOverPosition={dragOverPosition}
              onLayerClick={onLayerClick}
              onLayerDoubleClick={onLayerDoubleClick}
              onContextMenu={onContextMenu}
              onToggleExpand={onToggleExpand}
              onToggleVisibility={onToggleVisibility}
              onToggleLock={onToggleLock}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
              editingLayerId={editingLayerId}
              editValue={editValue}
              onEditChange={onEditChange}
              onEditBlur={onEditBlur}
              onEditKeyDown={onEditKeyDown}
              layerMap={layerMap}
              components={components}
              selection={selection}
              selectComponent={selectComponent}
              setHoveredComponent={setHoveredComponent}
              removeComponent={removeComponent}
              toggleComponentVisibility={toggleComponentVisibility}
            />
          ))}
        </Collapse>
      )}
    </Box>
  );
}

export function EditorLayerPanelContent() {
  const layers = useEditorStore((s) => s.layers);
  const components = useEditorStore((s) => s.components);
  const addLayer = useEditorStore((s) => s.addLayer);
  const addLayerGroup = useEditorStore((s) => s.addLayerGroup);
  const removeLayer = useEditorStore((s) => s.removeLayer);
  const updateLayer = useEditorStore((s) => s.updateLayer);
  const toggleLayerVisibility = useEditorStore((s) => s.toggleLayerVisibility);
  const toggleLayerLock = useEditorStore((s) => s.toggleLayerLock);
  const toggleLayerExpanded = useEditorStore((s) => s.toggleLayerExpanded);
  const reorderLayer = useEditorStore((s) => s.reorderLayer);
  const moveLayerToParent = useEditorStore((s) => s.moveLayerToParent);
  const selectComponent = useEditorStore((s) => s.selectComponent);
  const setHoveredComponent = useEditorStore((s) => s.setHoveredComponent);
  const removeComponent = useEditorStore((s) => s.removeComponent);
  const updateComponent = useEditorStore((s) => s.updateComponent);
  const selection = useEditorStore((s) => s.selection);

  const toggleComponentVisibility = useCallback(
    (id: string) => {
      const comp = components.find((c) => c.id === id);
      if (comp) {
        updateComponent(id, { visible: !comp.visible });
      }
    },
    [components, updateComponent]
  );

  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  const [dragOverLayerId, setDragOverLayerId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<"top" | "bottom" | "middle" | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    layerId: string;
    x: number;
    y: number;
  } | null>(null);

  const layerMap = new Map(layers.map((l) => [l.id, l]));
  const rootLayers = layers
    .filter((l) => l.parentId === null)
    .sort((a, b) => b.order - a.order);

  const selectedLayer = layers.find((l) => l.id === selectedLayerId);

  const handleLayerClick = useCallback(
    (layerId: string) => {
      setSelectedLayerId(layerId);
      const state = useEditorStore.getState();
      const layer = state.layers.find(l => l.id === layerId);
      if (layer?.type === "layer") {
        state.setActiveLayer(layerId);
      }
    },
    []
  );

  const handleLayerDoubleClick = useCallback(
    (layerId: string) => {
      const layer = layerMap.get(layerId);
      if (!layer) return;
      setEditingLayerId(layerId);
      setEditValue(layer.name);
    },
    [layerMap]
  );

  const handleEditBlur = useCallback(() => {
    if (editingLayerId && editValue.trim()) {
      updateLayer(editingLayerId, { name: editValue.trim() });
    }
    setEditingLayerId(null);
  }, [editingLayerId, editValue, updateLayer]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleEditBlur();
      } else if (e.key === "Escape") {
        setEditingLayerId(null);
      }
    },
    [handleEditBlur]
  );

  const handleAddLayer = useCallback(() => {
    const targetParent =
      selectedLayerId && layerMap.get(selectedLayerId)?.type === "group"
        ? selectedLayerId
        : null;
    const layer = addLayer(undefined, targetParent);
    setSelectedLayerId(layer.id);
  }, [addLayer, selectedLayerId, layerMap]);

  const handleAddGroup = useCallback(() => {
    const targetParent =
      selectedLayerId && layerMap.get(selectedLayerId)?.type === "group"
        ? selectedLayerId
        : null;
    const group = addLayerGroup(undefined, targetParent);
    setSelectedLayerId(group.id);
  }, [addLayerGroup, selectedLayerId, layerMap]);

  const handleDuplicateLayer = useCallback(() => {
    if (!selectedLayerId) return;
    const source = layerMap.get(selectedLayerId);
    if (!source) return;
    if (source.type === "group") {
      const group = addLayerGroup(`${source.name} 副本`, source.parentId);
      setSelectedLayerId(group.id);
    } else {
      const layer = addLayer(`${source.name} 副本`, source.parentId);
      const layerComps = components.filter((c) => c.layerId === source.id);
      const addComp = useEditorStore.getState().addComponent;
      layerComps.forEach((comp) => {
        addComp(comp.type, layer.id, {
          x: comp.transform.x + 20,
          y: comp.transform.y + 20,
        });
      });
      setSelectedLayerId(layer.id);
    }
  }, [selectedLayerId, layerMap, addLayer, addLayerGroup, components]);

  const handleMoveUp = useCallback(
    (layer: LayerNode) => {
      const siblings = layers
        .filter((l) => l.parentId === layer.parentId)
        .sort((a, b) => b.order - a.order);
      const idx = siblings.findIndex((s) => s.id === layer.id);
      if (idx > 0) {
        const above = siblings[idx - 1];
        reorderLayer(layer.id, above.order);
        reorderLayer(above.id, layer.order);
      }
    },
    [layers, reorderLayer]
  );

  const handleMoveDown = useCallback(
    (layer: LayerNode) => {
      const siblings = layers
        .filter((l) => l.parentId === layer.parentId)
        .sort((a, b) => b.order - a.order);
      const idx = siblings.findIndex((s) => s.id === layer.id);
      if (idx < siblings.length - 1) {
        const below = siblings[idx + 1];
        reorderLayer(layer.id, below.order);
        reorderLayer(below.id, layer.order);
      }
    },
    [layers, reorderLayer]
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, layerId: string) => {
      const layer = layerMap.get(layerId);
      if (layer?.locked) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData("application/x-layer-id", layerId);
      e.dataTransfer.effectAllowed = "move";
      setDragSourceId(layerId);
      console.log(`[LayerDrag] start: ${layerId}`);
    },
    [layerMap]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      e.stopPropagation();

      const sourceId = dragSourceId;
      if (!sourceId || sourceId === targetId) return;

      const targetLayer = layerMap.get(targetId);
      if (!targetLayer) return;

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const y = e.clientY - rect.top;
      const height = rect.height;
      const ratio = y / height;

      let position: "top" | "bottom" | "middle";
      if (targetLayer.type === "group" && ratio > 0.25 && ratio < 0.75) {
        position = "middle";
      } else if (ratio <= 0.5) {
        position = "top";
      } else {
        position = "bottom";
      }

      setDragOverLayerId(targetId);
      setDragOverPosition(position);
    },
    [dragSourceId, layerMap]
  );

  const handleDragLeave = useCallback(() => {
    setDragOverLayerId(null);
    setDragOverPosition(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      e.stopPropagation();

      const sourceId = e.dataTransfer.getData("application/x-layer-id");
      if (!sourceId || sourceId === targetId) {
        resetDragState();
        return;
      }

      const sourceLayer = layerMap.get(sourceId);
      const targetLayer = layerMap.get(targetId);
      if (!sourceLayer || !targetLayer) {
        resetDragState();
        return;
      }

      const descendants = getLayerDescendants(layers, targetId);
      if (descendants.includes(sourceId)) {
        resetDragState();
        return;
      }

      if (dragOverPosition === "middle" && targetLayer.type === "group") {
        moveLayerToParent(sourceId, targetId);
        console.log(`[LayerDrag] move ${sourceId} into group ${targetId}`);
      } else {
        moveLayerToParent(sourceId, targetLayer.parentId);

        const siblings = layers
          .filter((l) => l.parentId === targetLayer.parentId && l.id !== sourceId)
          .sort((a, b) => b.order - a.order);

        const targetIdx = siblings.findIndex((s) => s.id === targetId);
        if (targetIdx !== -1) {
          const insertIdx =
            dragOverPosition === "top" ? targetIdx : targetIdx + 1;

          siblings.splice(insertIdx, 0, sourceLayer);

          siblings.forEach((s, i) => {
            reorderLayer(s.id, siblings.length - 1 - i);
          });
        }
        console.log(`[LayerDrag] reorder ${sourceId} ${dragOverPosition} ${targetId}`);
      }

      resetDragState();
    },
    [dragOverPosition, layerMap, layers, moveLayerToParent, reorderLayer]
  );

  const handleDragEnd = useCallback(() => {
    resetDragState();
  }, []);

  const resetDragState = useCallback(() => {
    setDragSourceId(null);
    setDragOverLayerId(null);
    setDragOverPosition(null);
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, layerId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setSelectedLayerId(layerId);
      setContextMenu({ layerId, x: e.clientX, y: e.clientY });
    },
    []
  );

  const handleContextClose = useCallback(() => {
    setContextMenu(null);
  }, []);

  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        height: "100%",
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          px: 1,
          py: 0.5,
          borderBottom: 1,
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        <Typography
          variant="caption"
          sx={{ fontWeight: 600, color: "text.secondary", fontSize: 11 }}
        >
          图层
        </Typography>
        <Box sx={{ display: "flex", gap: 0 }}>
          <Tooltip title="新建图层">
            <IconButton size="small" onClick={handleAddLayer} sx={{ p: 0.25 }}>
              <AddIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="新建分组">
            <IconButton size="small" onClick={handleAddGroup} sx={{ p: 0.25 }}>
              <NewFolderIcon fontSize={14} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Box
        sx={{
          flex: 1,
          overflow: "auto",
          py: 0.25,
          minHeight: 0,
          "&::-webkit-scrollbar": { width: 4 },
          "&::-webkit-scrollbar-thumb": {
            backgroundColor: "rgba(128,128,128,0.2)",
            borderRadius: 2,
          },
        }}
      >
        {rootLayers.length === 0 ? (
          <Box sx={{ p: 2, textAlign: "center" }}>
            <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.5 }}>
              暂无图层
            </Typography>
          </Box>
        ) : (
          rootLayers.map((layer) => (
            <LayerItem
              key={layer.id}
              layer={layer}
              depth={0}
              selectedLayerId={selectedLayerId}
              dragOverLayerId={dragOverLayerId}
              dragOverPosition={dragOverPosition}
              onLayerClick={handleLayerClick}
              onLayerDoubleClick={handleLayerDoubleClick}
              onContextMenu={handleContextMenu}
              onToggleExpand={toggleLayerExpanded}
              onToggleVisibility={toggleLayerVisibility}
              onToggleLock={toggleLayerLock}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              editingLayerId={editingLayerId}
              editValue={editValue}
              onEditChange={setEditValue}
              onEditBlur={handleEditBlur}
              onEditKeyDown={handleEditKeyDown}
              layerMap={layerMap}
              components={components}
              selection={selection}
              selectComponent={selectComponent}
              setHoveredComponent={setHoveredComponent}
              removeComponent={removeComponent}
              toggleComponentVisibility={toggleComponentVisibility}
            />
          ))
        )}
      </Box>

      {selectedLayer && (
        <Box
          sx={{
            px: 1,
            py: 1,
            borderTop: 1,
            borderColor: "divider",
            display: "flex",
            flexDirection: "column",
            gap: 1,
            flexShrink: 0,
            maxHeight: 200,
            overflow: "auto",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <TextField
              value={selectedLayer.name}
              size="small"
              variant="standard"
              sx={{
                flex: 1,
                "& .MuiInput-input": { fontSize: 11, py: 0 },
              }}
              onChange={(e) => updateLayer(selectedLayer.id, { name: e.target.value })}
            />
            <Tooltip title="复制图层">
              <IconButton size="small" onClick={handleDuplicateLayer} sx={{ p: 0.25 }}>
                <ContentCopyIcon sx={{ fontSize: 12 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title={selectedLayer.isDefault ? "默认图层不能删除" : "删除图层"}>
              <IconButton
                size="small"
                onClick={() => {
                  if (!selectedLayer.isDefault) {
                    removeLayer(selectedLayer.id);
                    setSelectedLayerId(null);
                  }
                }}
                sx={{ p: 0.25 }}
                color="error"
                disabled={selectedLayer.isDefault}
              >
                <DeleteIcon sx={{ fontSize: 12 }} />
              </IconButton>
            </Tooltip>
          </Box>

          <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
            <Typography variant="caption" sx={{ fontSize: 10, color: "text.secondary", flexShrink: 0, width: 32 }}>
              颜色
            </Typography>
            <Box sx={{ display: "flex", gap: 0.25, flexWrap: "wrap" }}>
              {LAYER_COLORS.map((color) => (
                <Box
                  key={color}
                  sx={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    backgroundColor: color,
                    cursor: "pointer",
                    border: selectedLayer.color === color ? "2px solid currentColor" : "1px solid rgba(128,128,128,0.2)",
                    transition: "transform 0.1s",
                    "&:hover": { transform: "scale(1.2)" },
                  }}
                  onClick={() => updateLayer(selectedLayer.id, { color })}
                />
              ))}
            </Box>
          </Box>

          <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
            <Typography variant="caption" sx={{ fontSize: 10, color: "text.secondary", flexShrink: 0, width: 32 }}>
              透明
            </Typography>
            <Slider
              size="small"
              value={selectedLayer.opacity}
              min={0}
              max={1}
              step={0.05}
              sx={{ flex: 1, py: 0 }}
              onChange={(_, v) => updateLayer(selectedLayer.id, { opacity: v as number })}
            />
            <Typography variant="caption" sx={{ fontSize: 10, color: "text.secondary", width: 28, textAlign: "right" }}>
              {Math.round(selectedLayer.opacity * 100)}%
            </Typography>
          </Box>

          <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
            <Typography variant="caption" sx={{ fontSize: 10, color: "text.secondary", flexShrink: 0, width: 32 }}>
              混合
            </Typography>
            <FormControl size="small" sx={{ flex: 1 }}>
              <Select
                value={selectedLayer.blendMode || "normal"}
                sx={{ fontSize: 10, height: 22 }}
                onChange={(e) => updateLayer(selectedLayer.id, { blendMode: e.target.value })}
              >
                {BLEND_MODES.map((mode) => (
                  <MenuItem key={mode.value} value={mode.value} sx={{ fontSize: 11 }}>
                    {mode.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
            <Typography variant="caption" sx={{ fontSize: 10, color: "text.secondary", flexShrink: 0, width: 32 }}>
              背景
            </Typography>
            <Tooltip title={selectedLayer.isBackground ? "取消背景层" : "设为背景层"}>
              <IconButton
                size="small"
                sx={{
                  p: 0.25,
                  backgroundColor: selectedLayer.isBackground ? "primary.main" : "transparent",
                  color: selectedLayer.isBackground ? "primary.contrastText" : "text.secondary",
                  "&:hover": {
                    backgroundColor: selectedLayer.isBackground ? "primary.dark" : "action.hover",
                  },
                  borderRadius: 0.5,
                }}
                onClick={() => {
                  const newIsBackground = !selectedLayer.isBackground;
                  if (newIsBackground) {
                    const currentBgLayer = layers.find(l => l.isBackground && l.id !== selectedLayer.id);
                    if (currentBgLayer) {
                      updateLayer(currentBgLayer.id, { isBackground: false, background: undefined });
                    }
                  }
                  updateLayer(selectedLayer.id, {
                    isBackground: newIsBackground,
                    background: newIsBackground && !selectedLayer.background
                      ? { type: "solid", color: "#ffffff", gradient: { direction: "to-right" as const, colors: ["#ffffff", "#000000"] }, imageUrl: "", imageFit: "cover" as const, videoUrl: "", videoAutoplay: true, videoMuted: true, videoLoop: true }
                      : newIsBackground ? selectedLayer.background : undefined,
                  });
                }}
              >
                <WallpaperIcon sx={{ fontSize: 12 }} />
              </IconButton>
            </Tooltip>
            {selectedLayer.isBackground && (
              <Typography variant="caption" sx={{ fontSize: 9, color: "primary.main" }}>
                背景层
              </Typography>
            )}
          </Box>

          <Box sx={{ display: "flex", gap: 0.25, justifyContent: "flex-end" }}>
            <Tooltip title="上移">
              <IconButton size="small" onClick={() => handleMoveUp(selectedLayer)} sx={{ p: 0.25 }}>
                <ArrowUpwardIcon sx={{ fontSize: 12 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="下移">
              <IconButton size="small" onClick={() => handleMoveDown(selectedLayer)} sx={{ p: 0.25 }}>
                <ArrowDownwardIcon sx={{ fontSize: 12 }} />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      )}

      <Menu
        open={contextMenu !== null}
        onClose={handleContextClose}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu ? { top: contextMenu.y, left: contextMenu.x } : undefined
        }
      >
        <MenuItem
          onClick={() => {
            if (contextMenu) {
              const group = addLayerGroup(undefined, layerMap.get(contextMenu.layerId)?.parentId);
              moveLayerToParent(contextMenu.layerId, group.id);
            }
            handleContextClose();
          }}
        >
          <ListItemIcon><NewFolderIcon fontSize={18} /></ListItemIcon>
          <ListItemText>编组到新建分组</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (contextMenu) {
              const layer = layerMap.get(contextMenu.layerId);
              if (layer?.parentId) {
                moveLayerToParent(contextMenu.layerId, layerMap.get(layer.parentId)?.parentId ?? null);
              }
            }
            handleContextClose();
          }}
        >
          <ListItemIcon><FolderOpenIcon fontSize="small" /></ListItemIcon>
          <ListItemText>取消编组</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            if (contextMenu) toggleLayerVisibility(contextMenu.layerId);
            handleContextClose();
          }}
        >
          <ListItemIcon><VisibilityIcon fontSize="small" /></ListItemIcon>
          <ListItemText>切换可见</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (contextMenu) toggleLayerLock(contextMenu.layerId);
            handleContextClose();
          }}
        >
          <ListItemIcon><LockIcon fontSize="small" /></ListItemIcon>
          <ListItemText>切换锁定</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (contextMenu) {
              const targetLayer = layerMap.get(contextMenu.layerId);
              if (!targetLayer) return;
              const newIsBg = !targetLayer.isBackground;
              if (newIsBg) {
                const currentBgLayer = layers.find(l => l.isBackground && l.id !== contextMenu.layerId);
                if (currentBgLayer) {
                  updateLayer(currentBgLayer.id, { isBackground: false, background: undefined });
                }
              }
              updateLayer(contextMenu.layerId, {
                isBackground: newIsBg,
                background: newIsBg && !targetLayer.background
                  ? { type: "solid", color: "#ffffff", gradient: { direction: "to-right" as const, colors: ["#ffffff", "#000000"] }, imageUrl: "", imageFit: "cover" as const, videoUrl: "", videoAutoplay: true, videoMuted: true, videoLoop: true }
                  : newIsBg ? targetLayer.background : undefined,
              });
            }
            handleContextClose();
          }}
        >
          <ListItemIcon><WallpaperIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{layerMap.get(contextMenu?.layerId || "")?.isBackground ? "取消背景层" : "设为背景层"}</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            if (contextMenu) {
              setSelectedLayerId(contextMenu.layerId);
              handleDuplicateLayer();
            }
            handleContextClose();
          }}
        >
          <ListItemIcon><ContentCopyIcon fontSize="small" /></ListItemIcon>
          <ListItemText>复制图层</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (contextMenu) {
              const layer = layerMap.get(contextMenu.layerId);
              if (layer && !layer.isDefault) {
                removeLayer(contextMenu.layerId);
                setSelectedLayerId(null);
              }
            }
            handleContextClose();
          }}
          sx={{ color: "error.main" }}
            disabled={!contextMenu || layerMap.get(contextMenu.layerId)?.isDefault}
          >
          <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText>删除图层</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
}

export function EditorLayerPanel(_props: { collapsed: boolean; onToggle: () => void }) {
  return (
    <EditorLayerPanelContent />
  );
}
