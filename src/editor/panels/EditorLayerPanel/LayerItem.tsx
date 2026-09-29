import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Collapse from "@mui/material/Collapse";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import LayersIcon from "@mui/icons-material/Layers";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import FolderIcon from "@mui/icons-material/Folder";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import WallpaperIcon from "@mui/icons-material/Wallpaper";
import type {
  MouseEvent as ReactMouseEvent,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { LayerNode, SceneComponent } from "../../../types/editor";
import { LAYER_COLORS } from "./constants";
import { ComponentItem } from "./ComponentItem";

interface LayerItemProps {
  layer: LayerNode;
  depth: number;
  selectedLayerId: string | null;
  dragOverLayerId: string | null;
  dragOverPosition: "top" | "bottom" | "middle" | null;
  onLayerClick: (id: string) => void;
  onLayerDoubleClick: (id: string) => void;
  onContextMenu: (e: ReactMouseEvent, id: string) => void;
  onToggleExpand: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onDragStart: (e: ReactDragEvent, id: string) => void;
  onDragOver: (e: ReactDragEvent, id: string) => void;
  onDragLeave: () => void;
  onDrop: (e: ReactDragEvent, targetId: string) => void;
  onDragEnd: () => void;
  editingLayerId: string | null;
  editValue: string;
  onEditChange: (v: string) => void;
  onEditBlur: () => void;
  onEditKeyDown: (e: ReactKeyboardEvent) => void;
  layerMap: Map<string, LayerNode>;
  components: SceneComponent[];
  selection: { selectedIds: string[]; hoveredId: string | null };
  selectComponent: (id: string) => void;
  setHoveredComponent: (id: string | null) => void;
  removeComponent: (id: string) => void;
  toggleComponentVisibility: (id: string) => void;
}

/** 图层树中的单个图层/分组节点（分组递归渲染子图层）。 */
export function LayerItem({
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
}: LayerItemProps) {
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