import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Divider from "@mui/material/Divider";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import VisibilityIcon from "@mui/icons-material/Visibility";
import LockIcon from "@mui/icons-material/Lock";
import WallpaperIcon from "@mui/icons-material/Wallpaper";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import { NewFolderIcon } from "./NewFolderIcon";
import type { useLayerPanelState } from "./useLayerPanelState";

type LayerPanelState = ReturnType<typeof useLayerPanelState>;

/** 图层右键菜单：编组、取消编组、显隐/锁定、背景层、复制、删除。 */
export function LayerContextMenu({ st }: { st: LayerPanelState }) {
  const {
    contextMenu,
    handleContextClose,
    layerMap,
    layers,
    addLayerGroup,
    moveLayerToParent,
    toggleLayerVisibility,
    toggleLayerLock,
    updateLayer,
    removeLayer,
    setSelectedLayerId,
    handleDuplicateLayer,
  } = st;

  return (
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
  );
}