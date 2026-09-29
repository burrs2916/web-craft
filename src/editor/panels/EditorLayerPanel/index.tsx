import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import AddIcon from "@mui/icons-material/Add";
import { useLayerPanelState } from "./useLayerPanelState";
import { NewFolderIcon } from "./NewFolderIcon";
import { LayerItem } from "./LayerItem";
import { LayerInspector } from "./LayerInspector";
import { LayerContextMenu } from "./LayerContextMenu";

/**
 * 图层面板：图层树（含组件树）、选中图层属性面板、右键菜单。
 *
 * 拆分说明：常量见 `constants.ts`，图标见 `NewFolderIcon.tsx`，
 * 树节点见 `ComponentItem.tsx` / `LayerItem.tsx`，
 * 状态与交互逻辑见 `useLayerPanelState.ts`，
 * 属性面板与右键菜单见 `LayerInspector.tsx` / `LayerContextMenu.tsx`。
 */
export function EditorLayerPanelContent() {
  const st = useLayerPanelState();
  const {
    rootLayers,
    layerMap,
    components,
    selection,
    selectedLayerId,
    editingLayerId,
    editValue,
    setEditValue,
    dragOverLayerId,
    dragOverPosition,
    toggleLayerExpanded,
    toggleLayerVisibility,
    toggleLayerLock,
    selectComponent,
    setHoveredComponent,
    removeComponent,
    toggleComponentVisibility,
    handleAddLayer,
    handleAddGroup,
    handleLayerClick,
    handleLayerDoubleClick,
    handleContextMenu,
    handleEditBlur,
    handleEditKeyDown,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
  } = st;

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

      <LayerInspector st={st} />

      <LayerContextMenu st={st} />
    </Box>
  );
}

export function EditorLayerPanel(_props: { collapsed: boolean; onToggle: () => void }) {
  return (
    <EditorLayerPanelContent />
  );
}