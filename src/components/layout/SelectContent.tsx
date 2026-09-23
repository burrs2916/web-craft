import { useState, useCallback, useRef } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArchitectureRoundedIcon from "@mui/icons-material/ArchitectureRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import CreateNewFolderRoundedIcon from "@mui/icons-material/CreateNewFolderRounded";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import ImageIcon from "@mui/icons-material/ImageRounded";
import LabelRoundedIcon from "@mui/icons-material/LabelRounded";
import MapRoundedIcon from "@mui/icons-material/MapRounded";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import NoteAddRoundedIcon from "@mui/icons-material/NoteAddRounded";
import PreviewRoundedIcon from "@mui/icons-material/PreviewRounded";
import UploadRoundedIcon from "@mui/icons-material/UploadRounded";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useSceneStore } from "../../store/sceneStore";
import { logger } from "../../utils/logger";
import { SCENE_TEMPLATES } from "../../types/scene";
import type { SceneDSL, SceneCategory, SceneTemplate } from "../../types/scene";

const DEFAULT_CATEGORY_ID = "cat_default";

const CATEGORY_COLORS = [
  "#2196F3", "#4CAF50", "#FF9800", "#9C27B0",
  "#F44336", "#00BCD4", "#795548", "#607D8B",
];

const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  note_add: <NoteAddRoundedIcon sx={{ fontSize: "2rem" }} />,
  map: <MapRoundedIcon sx={{ fontSize: "2rem" }} />,
  dashboard: <DashboardRoundedIcon sx={{ fontSize: "2rem" }} />,
  architecture: <ArchitectureRoundedIcon sx={{ fontSize: "2rem" }} />,
};

const SCENE_COVER_GRADIENTS = [
  { id: "gradient-0", value: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", label: "靛蓝紫" },
  { id: "gradient-1", value: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)", label: "粉红" },
  { id: "gradient-2", value: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)", label: "天蓝" },
  { id: "gradient-3", value: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)", label: "翠绿" },
  { id: "gradient-4", value: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)", label: "橙粉" },
  { id: "gradient-5", value: "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)", label: "薰衣草" },
  { id: "gradient-6", value: "linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)", label: "暖橘" },
  { id: "gradient-7", value: "linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)", label: "淡蓝紫" },
];

function getSceneGradient(sceneId: string): string {
  let hash = 0;
  for (let i = 0; i < sceneId.length; i++) {
    hash = sceneId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SCENE_COVER_GRADIENTS[Math.abs(hash) % SCENE_COVER_GRADIENTS.length].value;
}

function isGradientCover(thumbnail: string | undefined): boolean {
  if (!thumbnail) return false;
  return thumbnail.startsWith("linear-gradient(") || SCENE_COVER_GRADIENTS.some((g) => g.value === thumbnail);
}

function isCustomImageCover(thumbnail: string | undefined): boolean {
  if (!thumbnail) return false;
  return !isGradientCover(thumbnail);
}

export default function SelectContent() {
  const {
    scenes, categories, activeSceneId,
    setActiveScene, createScene,
    updateScene, deleteScene,
    createCategory, updateCategory, deleteCategory,
  } = useSceneStore();

  const triggerRef = useRef<HTMLDivElement>(null);

  const [groupMenuAnchor, setGroupMenuAnchor] = useState<HTMLElement | null>(null);
  const [scenesDialogOpen, setScenesDialogOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(DEFAULT_CATEGORY_ID);

  const [catMenuAnchor, setCatMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuCategory, setMenuCategory] = useState<SceneCategory | null>(null);

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const [newCategoryDialogOpen, setNewCategoryDialogOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState(CATEGORY_COLORS[0]);

  const [createSceneDialogOpen, setCreateSceneDialogOpen] = useState(false);
  const [newSceneName, setNewSceneName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("blank");

  const [editSceneDialogOpen, setEditSceneDialogOpen] = useState(false);
  const [editSceneId, setEditSceneId] = useState<string>("");
  const [editSceneName, setEditSceneName] = useState("");
  const [editSceneDesc, setEditSceneDesc] = useState("");
  const [editSceneCover, setEditSceneCover] = useState<string>("");
  const [editSceneCoverType, setEditSceneCoverType] = useState<"gradient" | "custom">("gradient");

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteSceneId, setDeleteSceneId] = useState<string>("");
  const [deleteSceneName, setDeleteSceneName] = useState<string>("");

  const activeScene = scenes.find((s) => s.id === activeSceneId) ?? null;
  const activeCategory = activeScene
    ? categories.find((c) => c.id === activeScene.categoryId)
    : null;

  const sortedCategories = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);

  const getScenesForCategory = useCallback(
    (catId: string) => {
      const isDefault = catId === DEFAULT_CATEGORY_ID;
      if (isDefault) {
        return scenes.filter(
          (s) => s.categoryId === DEFAULT_CATEGORY_ID
            || !s.categoryId
            || !categories.some((c) => c.id === s.categoryId)
        );
      }
      return scenes.filter((s) => s.categoryId === catId);
    },
    [scenes, categories]
  );

  const handleTriggerClick = useCallback(() => {
    if (groupMenuAnchor) {
      setGroupMenuAnchor(null);
    } else {
      setGroupMenuAnchor(triggerRef.current);
    }
  }, [groupMenuAnchor]);

  const handleGroupClick = useCallback((catId: string) => {
    setSelectedGroupId(catId);
    setGroupMenuAnchor(null);
    setScenesDialogOpen(true);
  }, []);

  const handleActivateScene = useCallback(
    (sceneId: string) => {
      setActiveScene(sceneId);
      setScenesDialogOpen(false);
      setGroupMenuAnchor(null);
    },
    [setActiveScene]
  );

  const handleCatMenuOpen = useCallback(
    (e: React.MouseEvent<HTMLElement>, cat: SceneCategory) => {
      e.stopPropagation();
      setCatMenuAnchor(e.currentTarget);
      setMenuCategory(cat);
    },
    []
  );

  const handleCatMenuClose = useCallback(() => {
    setCatMenuAnchor(null);
    setMenuCategory(null);
  }, []);

  const handleRename = useCallback(() => {
    if (!menuCategory) return;
    setRenameValue(menuCategory.name);
    setRenameDialogOpen(true);
    handleCatMenuClose();
  }, [menuCategory, handleCatMenuClose]);

  const handleRenameSubmit = useCallback(async () => {
    if (!menuCategory || !renameValue.trim()) return;
    await updateCategory(menuCategory.id, { name: renameValue.trim() });
    setRenameDialogOpen(false);
    setRenameValue("");
  }, [menuCategory, renameValue, updateCategory]);

  const handleDeleteCategory = useCallback(async () => {
    if (!menuCategory) return;
    await deleteCategory(menuCategory.id);
    handleCatMenuClose();
  }, [menuCategory, deleteCategory, handleCatMenuClose]);

  const handleNewCategory = useCallback(() => {
    setGroupMenuAnchor(null);
    setNewCategoryName("");
    setNewCategoryColor(CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)]);
    setNewCategoryDialogOpen(true);
  }, []);

  const handleNewCategorySubmit = useCallback(async () => {
    if (!newCategoryName.trim()) return;
    await createCategory({ name: newCategoryName.trim(), color: newCategoryColor });
    setNewCategoryDialogOpen(false);
    setNewCategoryName("");
  }, [newCategoryName, newCategoryColor, createCategory]);

  const handleOpenCreateScene = useCallback(() => {
    setNewSceneName("");
    setSelectedTemplate("blank");
    setCreateSceneDialogOpen(true);
  }, []);

  const handleCreateScene = useCallback(async () => {
    if (!newSceneName.trim()) return;
    logger.info("Scene", "Creating scene", { name: newSceneName.trim(), categoryId: selectedGroupId || DEFAULT_CATEGORY_ID, template: selectedTemplate });
    try {
      const tpl = SCENE_TEMPLATES.find(t => t.id === selectedTemplate);
      const scene = await createScene({
        name: newSceneName.trim(),
        categoryId: selectedGroupId || DEFAULT_CATEGORY_ID,
        ...(tpl?.defaults || {}),
      });
      setActiveScene(scene.id);
      setCreateSceneDialogOpen(false);
      setNewSceneName("");
      setSelectedTemplate("blank");
      logger.info("Scene", "Scene created successfully", { sceneId: scene.id, name: scene.name });
    } catch (err) {
      logger.error("Scene", "Failed to create scene", { name: newSceneName.trim(), error: String(err) });
    }
  }, [newSceneName, selectedGroupId, selectedTemplate, createScene, setActiveScene]);

  const handleOpenEditScene = useCallback(
    async (e: React.MouseEvent, scene: SceneDSL) => {
      e.stopPropagation();
      logger.info("Scene", "Opening edit dialog", { sceneId: scene.id, name: scene.name, thumbnail: scene.thumbnail });
      setEditSceneId(scene.id);
      setEditSceneName(scene.name);
      setEditSceneDesc(scene.description || "");
      const isGradient = isGradientCover(scene.thumbnail);
      if (!isGradient && scene.thumbnail && (scene.thumbnail.startsWith("/") || scene.thumbnail.startsWith("file://"))) {
        try {
          const dataUrl = await invoke<string>("read_file_as_data_url", { filePath: scene.thumbnail });
          setEditSceneCover(dataUrl);
        } catch {
          setEditSceneCover(scene.thumbnail);
        }
      } else {
        setEditSceneCover(scene.thumbnail || getSceneGradient(scene.id));
      }
      setEditSceneCoverType(isGradient || !scene.thumbnail ? "gradient" : "custom");
      setEditSceneDialogOpen(true);
    },
    []
  );

  const handleSelectCustomCover = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: "图片",
          extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"],
        }],
      });
      if (selected) {
        logger.info("Scene", "Custom cover selected, converting to data URL", { path: selected });
        try {
          const dataUrl = await invoke<string>("read_file_as_data_url", { filePath: selected });
          logger.info("Scene", "Custom cover converted to data URL", { path: selected, dataUrlLength: dataUrl.length });
          setEditSceneCover(dataUrl);
          setEditSceneCoverType("custom");
        } catch (convertErr) {
          logger.error("Scene", "Failed to convert cover to data URL", { path: selected, error: String(convertErr) });
          setEditSceneCover(selected);
          setEditSceneCoverType("custom");
        }
      }
    } catch (err) {
      logger.warn("Scene", "Custom cover selection cancelled or failed", { error: String(err) });
    }
  }, []);

  const handleEditSceneSubmit = useCallback(async () => {
    if (!editSceneName.trim()) return;
    logger.info("Scene", "Saving scene edits", { sceneId: editSceneId, name: editSceneName.trim(), thumbnail: editSceneCover });
    try {
      await updateScene(editSceneId, {
        name: editSceneName.trim(),
        description: editSceneDesc.trim() || undefined,
        thumbnail: editSceneCover || undefined,
      });
      setEditSceneDialogOpen(false);
      logger.info("Scene", "Scene updated successfully", { sceneId: editSceneId });
    } catch (err) {
      logger.error("Scene", "Failed to update scene", { sceneId: editSceneId, error: String(err) });
    }
  }, [editSceneId, editSceneName, editSceneDesc, editSceneCover, updateScene]);

  const handleOpenDeleteConfirm = useCallback(
    (e: React.MouseEvent, scene: SceneDSL) => {
      e.stopPropagation();
      setDeleteSceneId(scene.id);
      setDeleteSceneName(scene.name);
      setDeleteConfirmOpen(true);
    },
    []
  );

  const handleDeleteScene = useCallback(async () => {
    logger.info("Scene", "Deleting scene", { sceneId: deleteSceneId });
    try {
      await deleteScene(deleteSceneId);
      setDeleteConfirmOpen(false);
      logger.info("Scene", "Scene deleted successfully", { sceneId: deleteSceneId });
    } catch (err) {
      logger.error("Scene", "Failed to delete scene", { sceneId: deleteSceneId, error: String(err) });
    }
  }, [deleteSceneId, deleteScene]);

  const currentGroupScenes = getScenesForCategory(selectedGroupId);
  const selectedGroup = categories.find((c) => c.id === selectedGroupId);

  return (
    <>
      <Box
        ref={triggerRef}
        onClick={handleTriggerClick}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          px: 1.5,
          py: 1,
          borderRadius: 1,
          border: "1px solid",
          borderColor: groupMenuAnchor ? "primary.main" : "divider",
          cursor: "pointer",
          minWidth: 200,
          maxWidth: 260,
          bgcolor: "background.paper",
          "&:hover": { borderColor: "primary.main" },
          transition: "border-color 0.2s",
        }}
      >
        {activeScene ? (
          <>
            <Box
              sx={{
                width: 28,
                height: 28,
                borderRadius: 0.75,
                overflow: "hidden",
                flexShrink: 0,
                border: "1px solid",
                borderColor: "divider",
              }}
            >
              {isCustomImageCover(activeScene.thumbnail) ? (
                <Box
                  component="img"
                  src={activeScene.thumbnail}
                  sx={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <Box
                  sx={{
                    width: "100%",
                    height: "100%",
                    background: activeScene.thumbnail || getSceneGradient(activeScene.id),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <MapRoundedIcon sx={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.7)" }} />
                </Box>
              )}
            </Box>
            <Box sx={{ flex: 1, overflow: "hidden" }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 500, lineHeight: 1.3 }}>
                {activeScene.name}
              </Typography>
              <Typography variant="caption" noWrap color="text.secondary" sx={{ lineHeight: 1.2 }}>
                {activeCategory?.name || "默认分组"}
              </Typography>
            </Box>
          </>
        ) : (
          <>
            <FolderRoundedIcon sx={{ fontSize: "1.1rem", color: "text.disabled" }} />
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
              默认场景
            </Typography>
          </>
        )}
        <ExpandMoreRoundedIcon
          sx={{
            fontSize: "1.1rem",
            color: "text.secondary",
            transition: "transform 0.2s",
            transform: groupMenuAnchor ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </Box>

      <Menu
        open={Boolean(groupMenuAnchor)}
        anchorEl={groupMenuAnchor}
        onClose={() => setGroupMenuAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { minWidth: 220 } } }}
      >
        {sortedCategories.map((cat) => {
          const catScenes = getScenesForCategory(cat.id);
          const isActive = activeScene && catScenes.some((s) => s.id === activeScene.id);
          return (
            <MenuItem
              key={cat.id}
              onClick={() => handleGroupClick(cat.id)}
              sx={{ display: "flex", alignItems: "center", gap: 1, pr: 0.5 }}
            >
              <FolderRoundedIcon sx={{ fontSize: "1rem", color: cat.color || "text.secondary" }} />
              <ListItemText primary={cat.name} secondary={`${catScenes.length} 个场景`} />
              {isActive && (
                <CheckRoundedIcon sx={{ fontSize: "0.9rem", color: "primary.main" }} />
              )}
              <IconButton
                size="small"
                sx={{ p: 0.25 }}
                onClick={(e) => handleCatMenuOpen(e, cat)}
              >
                <MoreVertRoundedIcon sx={{ fontSize: "0.85rem" }} />
              </IconButton>
            </MenuItem>
          );
        })}
        <Divider />
        <MenuItem onClick={handleNewCategory}>
          <ListItemIcon><CreateNewFolderRoundedIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="新建分组" />
        </MenuItem>
      </Menu>

      <Dialog
        open={scenesDialogOpen}
        onClose={() => setScenesDialogOpen(false)}
        maxWidth="md"
        fullWidth
        slotProps={{ paper: { sx: { minHeight: 420 } } }}
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pb: 1 }}>
          <FolderRoundedIcon sx={{ fontSize: "1.2rem", color: selectedGroup?.color || "text.secondary" }} />
          <Typography variant="h6" component="span" sx={{ fontWeight: 600 }}>
            {selectedGroup?.name || "默认分组"}
          </Typography>
          <Chip
            size="small"
            label={`${currentGroupScenes.length} 个场景`}
            variant="outlined"
            sx={{ ml: 0.5 }}
          />
          <Box sx={{ flex: 1 }} />
          <IconButton
            size="small"
            onClick={(e) => {
              if (selectedGroup) handleCatMenuOpen(e, selectedGroup);
            }}
          >
            <MoreVertRoundedIcon sx={{ fontSize: "1rem" }} />
          </IconButton>
          <IconButton size="small" onClick={() => setScenesDialogOpen(false)}>
            <CloseRoundedIcon sx={{ fontSize: "1rem" }} />
          </IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ p: 2 }}>
          {currentGroupScenes.length > 0 ? (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 2,
              }}
            >
              {currentGroupScenes.map((scene: SceneDSL) => {
                const isActive = scene.id === activeSceneId;
                const isCustomImage = isCustomImageCover(scene.thumbnail);
                return (
                  <Card
                    key={scene.id}
                    variant="outlined"
                    sx={{
                      position: "relative",
                      borderColor: isActive ? "primary.main" : "divider",
                      borderWidth: isActive ? 2 : 1,
                      transition: "border-color 0.2s, box-shadow 0.2s",
                      "&:hover": {
                        borderColor: "primary.main",
                        boxShadow: 2,
                      },
                    }}
                  >
                    <CardActionArea onClick={() => handleActivateScene(scene.id)}>
                      <Box sx={{ position: "relative", height: 120, overflow: "hidden" }}>
                        {isCustomImage ? (
                          <Box
                            component="img"
                            src={scene.thumbnail}
                            sx={{ height: "100%", width: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <Box
                            sx={{
                              height: "100%",
                              background: scene.thumbnail || getSceneGradient(scene.id),
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <MapRoundedIcon sx={{ fontSize: 40, color: "rgba(255,255,255,0.6)" }} />
                          </Box>
                        )}
                        {isActive && (
                          <Chip
                            icon={<CheckRoundedIcon sx={{ fontSize: "0.85rem !important" }} />}
                            label="当前"
                            size="small"
                            color="primary"
                            sx={{ position: "absolute", top: 8, right: 8, fontWeight: 600 }}
                          />
                        )}
                        {scene.status === "draft" && (
                          <Chip
                            label="草稿"
                            size="small"
                            variant="outlined"
                            sx={{
                              position: "absolute",
                              top: 8,
                              left: 8,
                              bgcolor: "rgba(255,255,255,0.85)",
                              fontWeight: 500,
                              fontSize: "0.7rem",
                            }}
                          />
                        )}
                      </Box>
                      <CardContent sx={{ py: 1.2, px: 1.5, "&:last-child": { pb: 1.2 } }}>
                        <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                          {scene.name}
                        </Typography>
                        {scene.description ? (
                          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                            {scene.description}
                          </Typography>
                        ) : (
                          <Typography variant="caption" color="text.disabled" sx={{ display: "block" }}>
                            暂无描述
                          </Typography>
                        )}
                      </CardContent>
                    </CardActionArea>
                    <CardActions sx={{ pt: 0, px: 1, pb: 0.5, justifyContent: "flex-end", flexWrap: 'wrap' }}>
                      <Tooltip title="激活场景" arrow>
                        <IconButton size="small" onClick={() => handleActivateScene(scene.id)} color={isActive ? "primary" : "default"}>
                          <PreviewRoundedIcon sx={{ fontSize: "1rem" }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="编辑" arrow>
                        <IconButton size="small" onClick={(e) => handleOpenEditScene(e, scene)}>
                          <EditRoundedIcon sx={{ fontSize: "1rem" }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="删除" arrow>
                        <IconButton size="small" onClick={(e) => handleOpenDeleteConfirm(e, scene)} color="error">
                          <DeleteOutlineRoundedIcon sx={{ fontSize: "1rem" }} />
                        </IconButton>
                      </Tooltip>
                    </CardActions>
                  </Card>
                );
              })}
            </Box>
          ) : (
            <Box sx={{ py: 6, textAlign: "center" }}>
              <FolderRoundedIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
              <Typography variant="body1" color="text.secondary" sx={{ mb: 0.5 }}>
                该分组暂无场景
              </Typography>
              <Typography variant="caption" color="text.disabled">
                点击下方按钮创建第一个场景
              </Typography>
            </Box>
          )}
        </DialogContent>
        <Divider />
        <DialogActions sx={{ px: 2, py: 1.5 }}>
          <Button
            variant="contained"
            startIcon={<AddRoundedIcon />}
            onClick={handleOpenCreateScene}
          >
            新增场景
          </Button>
        </DialogActions>
      </Dialog>

      <Menu
        open={Boolean(catMenuAnchor)}
        anchorEl={catMenuAnchor}
        onClose={handleCatMenuClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <MenuItem onClick={handleRename}>
          <ListItemIcon><EditRoundedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>重命名</ListItemText>
        </MenuItem>
        {menuCategory && menuCategory.id !== DEFAULT_CATEGORY_ID && (
          <MenuItem onClick={handleDeleteCategory} sx={{ color: "error.main" }}>
            <ListItemIcon><DeleteOutlineRoundedIcon fontSize="small" sx={{ color: "error.main" }} /></ListItemIcon>
            <ListItemText>删除分组</ListItemText>
          </MenuItem>
        )}
      </Menu>

      <Dialog open={renameDialogOpen} onClose={() => setRenameDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>重命名分组</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="分组名称"
            fullWidth
            variant="outlined"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialogOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleRenameSubmit} disabled={!renameValue.trim()}>
            保存
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={newCategoryDialogOpen} onClose={() => setNewCategoryDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>新建分组</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="分组名称"
            fullWidth
            variant="outlined"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            sx={{ mb: 2, mt: 1 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
            选择颜色标识
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {CATEGORY_COLORS.map((color) => (
              <IconButton
                key={color}
                size="small"
                onClick={() => setNewCategoryColor(color)}
                sx={{
                  bgcolor: newCategoryColor === color ? "action.selected" : "transparent",
                  borderRadius: 1,
                }}
              >
                <LabelRoundedIcon sx={{ color, fontSize: "1.2rem" }} />
              </IconButton>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewCategoryDialogOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleNewCategorySubmit} disabled={!newCategoryName.trim()}>
            创建
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={createSceneDialogOpen} onClose={() => setCreateSceneDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          新增场景
          {selectedGroup && (
            <Chip
              size="small"
              icon={<FolderRoundedIcon sx={{ fontSize: "0.85rem !important" }} />}
              label={selectedGroup.name}
              sx={{ ml: 1 }}
              variant="outlined"
            />
          )}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="场景名称"
            fullWidth
            variant="outlined"
            value={newSceneName}
            onChange={(e) => setNewSceneName(e.target.value)}
            sx={{ mb: 2, mt: 1 }}
          />
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            选择模板
          </Typography>
          <Grid container spacing={1}>
            {SCENE_TEMPLATES.map((tpl: SceneTemplate) => (
              <Grid key={tpl.id} size={{ xs: 6 }}>
                <Card
                  variant={selectedTemplate === tpl.id ? "elevation" : "outlined"}
                  elevation={selectedTemplate === tpl.id ? 4 : 0}
                  sx={{ borderColor: selectedTemplate === tpl.id ? "primary.main" : undefined }}
                >
                  <CardActionArea onClick={() => setSelectedTemplate(tpl.id)}>
                    <CardContent sx={{ textAlign: "center", py: 1.5, "&:last-child": { pb: 1.5 } }}>
                      {TEMPLATE_ICONS[tpl.icon] || <NoteAddRoundedIcon sx={{ fontSize: "2rem" }} />}
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {tpl.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {tpl.description}
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateSceneDialogOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleCreateScene} disabled={!newSceneName.trim()}>
            创建
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editSceneDialogOpen} onClose={() => setEditSceneDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>编辑场景</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="场景名称"
            fullWidth
            variant="outlined"
            value={editSceneName}
            onChange={(e) => setEditSceneName(e.target.value)}
            sx={{ mb: 2, mt: 1 }}
          />
          <TextField
            margin="dense"
            label="场景描述"
            fullWidth
            variant="outlined"
            multiline
            rows={2}
            value={editSceneDesc}
            onChange={(e) => setEditSceneDesc(e.target.value)}
            sx={{ mb: 2 }}
          />

          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            封面图片
          </Typography>

          <Box sx={{ display: "flex", gap: 1, mb: 1.5 }}>
            <Button
              size="small"
              variant={editSceneCoverType === "gradient" ? "contained" : "outlined"}
              startIcon={<ImageIcon />}
              onClick={() => setEditSceneCoverType("gradient")}
            >
              默认封面
            </Button>
            <Button
              size="small"
              variant={editSceneCoverType === "custom" ? "contained" : "outlined"}
              startIcon={<UploadRoundedIcon />}
              onClick={handleSelectCustomCover}
            >
              自定义图片
            </Button>
          </Box>

          {editSceneCoverType === "gradient" && (
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1 }}>
              {SCENE_COVER_GRADIENTS.map((g) => (
                <Box
                  key={g.id}
                  onClick={() => setEditSceneCover(g.value)}
                  sx={{
                    height: 56,
                    borderRadius: 1,
                    background: g.value,
                    cursor: "pointer",
                    border: editSceneCover === g.value ? "2px solid" : "2px solid transparent",
                    borderColor: editSceneCover === g.value ? "primary.main" : "transparent",
                    transition: "border-color 0.2s, transform 0.15s",
                    "&:hover": { transform: "scale(1.05)" },
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {editSceneCover === g.value && (
                    <CheckRoundedIcon sx={{ color: "rgba(255,255,255,0.9)", fontSize: "1.2rem" }} />
                  )}
                </Box>
              ))}
            </Box>
          )}

          {editSceneCoverType === "custom" && (
            <Box
              sx={{
                height: 120,
                borderRadius: 1,
                border: "1px solid",
                borderColor: "divider",
                overflow: "hidden",
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {editSceneCover && !isGradientCover(editSceneCover) ? (
                <Box
                  component="img"
                  src={editSceneCover}
                  sx={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <Box sx={{ textAlign: "center" }}>
                  <UploadRoundedIcon sx={{ fontSize: 32, color: "text.disabled", mb: 0.5 }} />
                  <Typography variant="caption" color="text.disabled">
                    点击上方按钮选择图片
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditSceneDialogOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleEditSceneSubmit} disabled={!editSceneName.trim()}>
            保存
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-desc"
        role="alertdialog"
      >
        <DialogTitle id="delete-dialog-title">确认删除场景</DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-dialog-desc">
            确定要删除场景「{deleteSceneName}」吗？此操作不可撤销，场景中的所有数据将被永久删除。
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)} autoFocus>取消</Button>
          <Button onClick={handleDeleteScene} color="error" variant="contained">
            删除
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
