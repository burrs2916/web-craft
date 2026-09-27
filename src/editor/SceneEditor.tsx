import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import IconButton from "@mui/material/IconButton";
import Divider from "@mui/material/Divider";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Button from "@mui/material/Button";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import SaveIcon from "@mui/icons-material/Save";
import PreviewIcon from "@mui/icons-material/Preview";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";

import PublishIcon from "@mui/icons-material/Publish";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import LayersIcon from "@mui/icons-material/Layers";
import SettingsIcon from "@mui/icons-material/Settings";
import WidgetsIcon from "@mui/icons-material/Widgets";
import BoltIcon from "@mui/icons-material/Bolt";
import DesktopWindowsIcon from "@mui/icons-material/DesktopWindows";
import TabletMacIcon from "@mui/icons-material/TabletMac";
import PhoneIphoneIcon from "@mui/icons-material/PhoneIphone";
import AppsIcon from "@mui/icons-material/Apps";
import ApiIcon from "@mui/icons-material/Api";
import { useCallback, useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { EditorCanvas } from "./canvas/EditorCanvas";
import { EditorLayerPanelContent } from "./panels/EditorLayerPanel";
import { EditorPropertyPanelContent } from "./panels/EditorPropertyPanel";
import { EditorCanvasPanel } from "./panels/EditorCanvasPanel";
import { EventBindingPanel } from "./panels/EventBindingPanel";
import { EditorApiConfigPanel } from "./panels/EditorApiConfigPanel";

import { SceneTabBar } from "./components/SceneTabBar";
import logger from "../utils/logger";
import { previewScene, publishScene as codegenPublish } from "../services/codegenService";
import { openPreviewWindow } from "../core/services/window.service";
import { FrameworkSelectDialog } from "../components/codegen/FrameworkSelectDialog";
import type { CodegenFramework } from "../codegen/types";
import { ComponentCenterPanel } from "./panels/ComponentCenterPanel";
import { PerformanceMonitor } from "./monitors/PerformanceMonitor";
import { useEditorStore, useDirtyStore } from "../store/editorStore";
import { BREAKPOINTS, createDefaultLayer } from "../types/editor";
import { useSceneStore } from "../store/sceneStore";
import { useEditorShortcuts } from "./hooks/useEditorShortcuts";
import { SceneEditorProvider } from "./context/SceneEditorContext";

export function SceneEditor() {
  useEditorShortcuts();
  const navigate = useNavigate();
  const canUndo = useEditorStore((s) => s.canUndo);
  const canRedo = useEditorStore((s) => s.canRedo);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const isDirty = useDirtyStore((s) => s.isDirty);
  const selectedIds = useEditorStore((s) => s.selection.selectedIds);
  const canvasConfig = useEditorStore((s) => s.canvasConfig);
  const activeBreakpoint = useEditorStore((s) => s.activeBreakpoint);
  const setActiveBreakpoint = useEditorStore((s) => s.setActiveBreakpoint);

  const activeSceneId = useSceneStore((s) => s.activeSceneId);
  const setActiveScene = useSceneStore((s) => s.setActiveScene);
  const scenes = useSceneStore((s) => s.scenes);
  const activeScene = scenes.find((s) => s.id === activeSceneId) ?? null;
  const updateScene = useSceneStore((s) => s.updateScene);
  const publishScene = useSceneStore((s) => s.publishScene);
  const unpublishScene = useSceneStore((s) => s.unpublishScene);

  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [rightPanelTab, setRightPanelTab] = useState<"property" | "layer" | "canvas" | "events" | "api">("property");
  // 从 API 面板跳转事件 Tab 时，需要高亮定位的事件绑定 id
  const [eventHighlightBindingId, setEventHighlightBindingId] = useState<string | null>(null);
  const [sceneMenuAnchor, setSceneMenuAnchor] = useState<HTMLElement | null>(null);
  const [viewportMenuAnchor, setViewportMenuAnchor] = useState<HTMLElement | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [frameworkDialogOpen, setFrameworkDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'preview' | 'publish'>('preview');

  useEffect(() => {
    if (selectedIds.length > 0) {
      setRightPanelOpen(true);
      setRightPanelTab("property");
    }
  }, [selectedIds]);

  const prevSceneIdRef = useRef<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSave = useCallback(async () => {
    if (!activeSceneId) return;
    const editorState = useEditorStore.getState();
    const { views, globalComponents, activeViewId } = editorState.exportSceneWithViews();
    const activeView = views.find((v) => v.id === activeViewId);
    const canvasConfig = activeView?.canvasConfig;
    try {
      await updateScene(activeSceneId, {
        canvasConfig,
        views,
        globalComponents,
        activeViewId,
        apiConfig: editorState.apiConfig,
        dataSources: editorState.dataSources,
      });
      useDirtyStore.getState().markClean();
    } catch (err) {
      logger.error("SceneEditor", "Auto-save failed, keeping isDirty", { sceneId: activeSceneId, error: err });
    }
  }, [activeSceneId, updateScene]);

  const handlePreview = useCallback(async (framework: CodegenFramework) => {
    if (!activeScene) return;
    setFrameworkDialogOpen(false);
    setPreviewing(true);
    try {
      if (isDirty) {
        await handleSaveRef.current();
      }
      const freshScene = useSceneStore.getState().scenes.find((s) => s.id === activeScene.id) ?? activeScene;
      const { previewUrl } = await previewScene(freshScene, { framework });
      const firstView = freshScene.views?.[0];
      const cw = firstView?.canvasConfig?.width ?? freshScene.canvasConfig?.width ?? 1920;
      const ch = firstView?.canvasConfig?.height ?? freshScene.canvasConfig?.height ?? 1080;
      await openPreviewWindow({
        url: previewUrl,
        sceneName: freshScene.name,
        width: cw,
        height: ch,
      });
    } catch (err) {
      logger.error("SceneEditor", "Preview failed", { error: err });
    } finally {
      setPreviewing(false);
    }
  }, [activeScene, isDirty]);

  const handlePublishWithFramework = useCallback(async (framework: CodegenFramework) => {
    if (!activeScene) return;
    setFrameworkDialogOpen(false);
    setPreviewing(true);
    try {
      if (isDirty) {
        await handleSaveRef.current();
      }
      const freshScene = useSceneStore.getState().scenes.find((s) => s.id === activeScene.id) ?? activeScene;
      await codegenPublish(freshScene, { framework });
      await publishScene(activeScene.id);
      logger.info("SceneEditor", "Publish done", { sceneId: activeScene.id, framework });
    } catch (err) {
      logger.error("SceneEditor", "Publish failed", { error: err });
    } finally {
      setPreviewing(false);
    }
  }, [activeScene, isDirty, publishScene]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  useEffect(() => {
    if (isDirty && activeSceneId) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        handleSaveRef.current();
      }, 1000);
    }
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [isDirty, activeSceneId]);

  // 编辑器打开时：保存防抖已在上方处理，此处无需额外初始化
  // （原设备/产品数据加载已移除，网站编辑器不需要 IoT 设备状态）

  useEffect(() => {
    if (!activeSceneId) return;

    const currentScene = useSceneStore.getState().scenes.find((s) => s.id === activeSceneId);
    if (!currentScene) return;

    if (prevSceneIdRef.current && prevSceneIdRef.current !== activeSceneId) {
      const prevSceneId = prevSceneIdRef.current;
      const prevScene = useSceneStore.getState().scenes.find((s) => s.id === prevSceneId);
      if (prevScene && useDirtyStore.getState().isDirty) {
        const prevEditorState = useEditorStore.getState();
        const { views, globalComponents, activeViewId } = prevEditorState.exportSceneWithViews();
        const activeView = views.find((v) => v.id === activeViewId);
        const canvasConfig = activeView?.canvasConfig;
        useSceneStore.getState().updateScene(prevSceneId, {
          canvasConfig,
          views,
          globalComponents,
          activeViewId,
          apiConfig: prevEditorState.apiConfig,
        }).then(() => {
          useDirtyStore.getState().markClean();
        }).catch((err) => {
          logger.error("SceneEditor", "Failed to save previous scene during switch", { sceneId: prevSceneId, error: err });
        });
      }
    }

    prevSceneIdRef.current = activeSceneId;

    const state = useEditorStore.getState();
    state.clearScene();

    // 调试日志已移除：场景加载详情通过 logger 记录
    const hasViews = currentScene.views && currentScene.views.length > 0;
    const hasComponents = currentScene.editorComponents && currentScene.editorComponents.length > 0;
    const hasLayers = currentScene.editorLayers && currentScene.editorLayers.length > 0;

    if (hasViews) {
      logger.info("SceneEditor", "Loading scene with views", { sceneId: activeSceneId, viewCount: currentScene.views!.length, activeViewId: currentScene.activeViewId });
      const activeVId = currentScene.activeViewId || currentScene.views![0].id;
      state.loadSceneWithViews(currentScene.views!, currentScene.globalComponents || [], activeVId);
      // 同步全局 API 配置
      if (currentScene.apiConfig) {
        state.setApiConfig(currentScene.apiConfig);
      }
    } else if (hasComponents || hasLayers) {
      logger.info("SceneEditor", "Migrating legacy scene to views", { sceneId: activeSceneId, components: currentScene.editorComponents?.length || 0, layers: currentScene.editorLayers?.length || 0 });
      const defaultLayer = hasLayers ? currentScene.editorLayers! : [createDefaultLayer("默认图层", "layer", null, true)];
      const canvasConfig = currentScene.canvasConfig ? { ...currentScene.canvasConfig } : undefined;
      const views = [{ id: "default", name: currentScene.name || "未命名页面", components: currentScene.editorComponents || [], layers: defaultLayer, canvasConfig }];
      state.loadSceneWithViews(views, [], "default");
      // 同步全局 API 配置
      if (currentScene.apiConfig) {
        state.setApiConfig(currentScene.apiConfig);
      }
      state.setActiveLayer(defaultLayer.find((l: any) => l.isDefault)?.id || defaultLayer[0]?.id);
    } else {
      logger.info("SceneEditor", "Creating default scene", { sceneId: activeSceneId });
      const defaultLayer = createDefaultLayer("默认图层", "layer", null, true);
      const canvasConfig = currentScene.canvasConfig ? { ...currentScene.canvasConfig } : undefined;
      const views = [{ id: "default", name: currentScene.name || "未命名页面", components: [], layers: [defaultLayer], canvasConfig }];
      state.loadSceneWithViews(views, [], "default");
      // 同步全局 API 配置
      if (currentScene.apiConfig) {
        state.setApiConfig(currentScene.apiConfig);
      }
    }
  }, [activeSceneId]);

  return (
    <SceneEditorProvider>
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          px: 1,
          flexShrink: 0,
          borderBottom: 1,
          borderColor: "divider",
          backgroundColor: (theme) =>
            theme.palette.mode === "dark"
              ? "rgba(18, 18, 24, 0.95)"
              : "rgba(255, 255, 255, 0.95)",
          gap: 0.5,
          height: 36,
          position: "relative",
          zIndex: 100,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
          <Tooltip title="撤销 (Ctrl+Z)">
            <span>
              <IconButton size="small" onClick={undo} disabled={!canUndo()}>
                <UndoIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="重做 (Ctrl+Y)">
            <span>
              <IconButton size="small" onClick={redo} disabled={!canRedo()}>
                <RedoIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="保存">
            <IconButton size="small" onClick={handleSave} color={isDirty ? "primary" : "default"}>
              <SaveIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
        </Box>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 20 }} />

        {/* 场景管理下拉 */}
        <Box sx={{ display: "flex", alignItems: "center" }}>
          <Box
            onClick={(e) => setSceneMenuAnchor(e.currentTarget)}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              px: 1,
              py: 0.25,
              borderRadius: 0.5,
              cursor: "pointer",
              maxWidth: 200,
              "&:hover": { backgroundColor: "action.hover" },
            }}
          >
            <Typography
              variant="body2"
              noWrap
              sx={{ fontSize: 12, fontWeight: 500, color: "text.primary" }}
            >
              {activeScene?.name || "未选择场景"}
            </Typography>
            {activeScene?.status === "published" && (
              <Chip label="已发布" size="small" sx={{ height: 16, fontSize: "0.6rem", fontWeight: 600 }} color="success" variant="outlined" />
            )}
            <ArrowDropDownIcon sx={{ fontSize: 16, color: "text.secondary" }} />
          </Box>
          <Menu
            open={Boolean(sceneMenuAnchor)}
            anchorEl={sceneMenuAnchor}
            onClose={() => setSceneMenuAnchor(null)}
            slotProps={{ paper: { sx: { minWidth: 220, maxHeight: 400 } } }}
          >
            {scenes.map((scene) => (
              <MenuItem
                key={scene.id}
                onClick={() => {
                  setActiveScene(scene.id);
                  setSceneMenuAnchor(null);
                }}
                selected={scene.id === activeSceneId}
                sx={{ display: "flex", alignItems: "center", gap: 1 }}
              >
                <Box sx={{ flex: 1, overflow: "hidden" }}>
                  <Typography variant="body2" noWrap sx={{ fontSize: 13, fontWeight: 500 }}>
                    {scene.name}
                  </Typography>
                  <Typography variant="caption" noWrap sx={{ display: "block", fontSize: 11, color: "text.secondary" }}>
                    {scene.status === "published" ? "已发布" : "草稿"}
                  </Typography>
                </Box>
                {scene.id === activeSceneId && (
                  <Chip label="当前" size="small" color="primary" sx={{ height: 18, fontSize: "0.6rem" }} />
                )}
              </MenuItem>
            ))}
            <Divider />
            <MenuItem onClick={() => { setSceneMenuAnchor(null); navigate("/websites"); }}>
              <ListItemIcon><AppsIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="我的网站" />
            </MenuItem>
          </Menu>
        </Box>

        {/* 断点切换器：网页模式下宽度由断点固定 */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, ml: 0.5 }}>
          <Box
            onClick={(e) => setViewportMenuAnchor(e.currentTarget)}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              px: 1,
              py: 0.25,
              borderRadius: 0.5,
              cursor: "pointer",
              "&:hover": { backgroundColor: "action.hover" },
            }}
          >
            {(() => {
              const current = BREAKPOINTS.find((b) => b.id === activeBreakpoint);
              const IconComp =
                current?.id === "mobile" ? PhoneIphoneIcon :
                current?.id === "tablet" ? TabletMacIcon :
                DesktopWindowsIcon;
              return <>
                <IconComp sx={{ fontSize: 15, color: "text.secondary" }} />
                <Typography variant="body2" sx={{ fontSize: 12, fontWeight: 500, color: "text.primary" }}>
                  {current ? `${current.label} ${current.canvasWidth}px` : `${canvasConfig.width}px`}
                </Typography>
                <ArrowDropDownIcon sx={{ fontSize: 16, color: "text.secondary" }} />
              </>;
            })()}
          </Box>
          <Menu
            open={Boolean(viewportMenuAnchor)}
            anchorEl={viewportMenuAnchor}
            onClose={() => setViewportMenuAnchor(null)}
            slotProps={{ paper: { sx: { minWidth: 200 } } }}
          >
            {BREAKPOINTS.map((bp) => {
              const IconComp =
                bp.id === "mobile" ? PhoneIphoneIcon :
                bp.id === "tablet" ? TabletMacIcon :
                DesktopWindowsIcon;
              const isActive = bp.id === activeBreakpoint;

              return (
                <MenuItem
                  key={bp.id}
                  onClick={() => {
                    setActiveBreakpoint(bp.id);
                    setViewportMenuAnchor(null);
                  }}
                  selected={isActive}
                  sx={{ display: "flex", alignItems: "center", gap: 1 }}
                >
                  <IconComp sx={{ fontSize: 18, color: "text.secondary" }} />
                  <Typography variant="body2" sx={{ fontSize: 13 }}>
                    {bp.label}
                  </Typography>
                  <Typography variant="caption" sx={{ fontSize: 11, color: "text.disabled", ml: "auto" }}>
                    {bp.canvasWidth}px
                  </Typography>
                </MenuItem>
              );
            })}
          </Menu>
        </Box>

        <Box sx={{ flex: 1 }} />

        <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
          <Tooltip title={leftPanelOpen ? "收起组件中心" : "展开组件中心"}>
            <IconButton
              size="small"
              onClick={() => setLeftPanelOpen(!leftPanelOpen)}
              sx={{
                backgroundColor: leftPanelOpen ? "action.selected" : "transparent",
              }}
            >
              <WidgetsIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="预览">
            <IconButton
              size="small"
              disabled={previewing}
              onClick={() => { setDialogMode('preview'); setFrameworkDialogOpen(true); }}
            >
              <PreviewIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
          {activeScene && (
            <Tooltip title={activeScene.status === "published" ? "取消发布" : "发布网站"}>
              <IconButton
                size="small"
                onClick={async () => {
                  if (activeScene.status === "published") {
                    unpublishScene(activeScene.id);
                  } else {
                    if (isDirty) {
                      await handleSaveRef.current();
                    }
                    setDialogMode('publish');
                    setFrameworkDialogOpen(true);
                  }
                }}
                color={activeScene.status === "published" ? "success" : "default"}
              >
                <PublishIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {!activeSceneId ? (
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Box sx={{ textAlign: "center" }}>
            <LayersIcon sx={{ fontSize: 48, color: "text.disabled", mb: 2 }} />
            <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
              暂无选中场景
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              前往「我的网站」创建一个新网站
            </Typography>
            <Button variant="contained" onClick={() => navigate("/websites")}>
              我的网站
            </Button>
          </Box>
        </Box>
      ) : (
      <Box
        sx={{
          display: "flex",
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        <ComponentCenterPanel
          collapsed={!leftPanelOpen}
          onToggle={() => setLeftPanelOpen(!leftPanelOpen)}
        />

        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, overflow: "hidden" }}>
          <SceneTabBar />
          <EditorCanvas />
        </Box>

        {rightPanelOpen && (
          <Box
            sx={{
              width: 300,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              borderLeft: 1,
              borderColor: "divider",
              backgroundColor: (theme) =>
                theme.palette.mode === "dark"
                  ? "rgba(14, 14, 20, 0.92)"
                  : "rgba(248, 248, 252, 0.95)",
              backdropFilter: "blur(12px)",
              overflow: "hidden",
            }}
          >
            {activeScene && (
              <Box
                sx={{
                  px: 1.5,
                  py: 1,
                  borderBottom: 1,
                  borderColor: "divider",
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  flexShrink: 0,
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 600,
                    fontSize: 13,
                    color: "text.primary",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {activeScene.name}
                </Typography>
                <Chip
                  label={
                    activeScene.status === "draft"
                      ? "草稿"
                      : activeScene.status === "published"
                        ? "已发布"
                        : "已归档"
                  }
                  size="small"
                  color={
                    activeScene.status === "published" ? "success" : "default"
                  }
                  variant="outlined"
                  sx={{ height: 20, fontSize: "0.65rem" }}
                />
              </Box>
            )}

            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                borderBottom: 1,
                borderColor: "divider",
                flexShrink: 0,
              }}
            >
              <Box
                onClick={() => setRightPanelTab("property")}
                sx={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 0.5,
                  py: 0.75,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: rightPanelTab === "property" ? 600 : 400,
                  color: rightPanelTab === "property" ? "primary.main" : "text.secondary",
                  borderBottom: rightPanelTab === "property" ? 2 : 0,
                  borderColor: "primary.main",
                  transition: "all 0.15s",
                  "&:hover": {
                    color: "primary.main",
                    backgroundColor: (theme: any) =>
                      theme.palette.mode === "dark"
                        ? "rgba(255,255,255,0.04)"
                        : "rgba(0,0,0,0.02)",
                  },
                }}
              >
                <SettingsIcon sx={{ fontSize: 14 }} />
                属性
              </Box>
              <Box
                onClick={() => setRightPanelTab("layer")}
                sx={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 0.5,
                  py: 0.75,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: rightPanelTab === "layer" ? 600 : 400,
                  color: rightPanelTab === "layer" ? "primary.main" : "text.secondary",
                  borderBottom: rightPanelTab === "layer" ? 2 : 0,
                  borderColor: "primary.main",
                  transition: "all 0.15s",
                  "&:hover": {
                    color: "primary.main",
                    backgroundColor: (theme: any) =>
                      theme.palette.mode === "dark"
                        ? "rgba(255,255,255,0.04)"
                        : "rgba(0,0,0,0.02)",
                  },
                }}
              >
                <LayersIcon sx={{ fontSize: 14 }} />
                图层
              </Box>
              <Box
                onClick={() => setRightPanelTab("canvas")}
                sx={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 0.5,
                  py: 0.75,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: rightPanelTab === "canvas" ? 600 : 400,
                  color: rightPanelTab === "canvas" ? "primary.main" : "text.secondary",
                  borderBottom: rightPanelTab === "canvas" ? 2 : 0,
                  borderColor: "primary.main",
                  transition: "all 0.15s",
                  "&:hover": {
                    color: "primary.main",
                    backgroundColor: (theme: any) =>
                      theme.palette.mode === "dark"
                        ? "rgba(255,255,255,0.04)"
                        : "rgba(0,0,0,0.02)",
                  },
                }}
              >
                画布
              </Box>
              {selectedIds.length > 0 && (
                <Box
                  onClick={() => setRightPanelTab("events")}
                  sx={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 0.5,
                    py: 0.75,
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: rightPanelTab === "events" ? 600 : 400,
                    color: rightPanelTab === "events" ? "primary.main" : "text.secondary",
                    borderBottom: rightPanelTab === "events" ? 2 : 0,
                    borderColor: "primary.main",
                    transition: "all 0.15s",
                    "&:hover": {
                      color: "primary.main",
                      backgroundColor: (theme: any) =>
                        theme.palette.mode === "dark"
                          ? "rgba(255,255,255,0.04)"
                          : "rgba(0,0,0,0.02)",
                    },
                  }}
                >
                  <BoltIcon sx={{ fontSize: 14 }} />
                  事件
                </Box>
              )}
              <Box
                onClick={() => setRightPanelTab("api")}
                sx={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 0.5,
                  py: 0.75,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: rightPanelTab === "api" ? 600 : 400,
                  color: rightPanelTab === "api" ? "primary.main" : "text.secondary",
                  borderBottom: rightPanelTab === "api" ? 2 : 0,
                  borderColor: "primary.main",
                  transition: "all 0.15s",
                  "&:hover": {
                    color: "primary.main",
                    backgroundColor: (theme: any) =>
                      theme.palette.mode === "dark"
                        ? "rgba(255,255,255,0.04)"
                        : "rgba(0,0,0,0.02)",
                  },
                }}
              >
                <ApiIcon sx={{ fontSize: 14 }} />
                API
              </Box>
            </Box>

            <Box sx={{ flex: 1, overflow: "auto", minHeight: 0 }}>
              {rightPanelTab === "property" ? (
                <EditorPropertyPanelContent />
              ) : rightPanelTab === "layer" ? (
                <EditorLayerPanelContent />
              ) : rightPanelTab === "events" ? (
                selectedIds.length > 0 ? (
                  <EventBindingPanel
                    componentId={selectedIds[0]}
                    highlightBindingId={eventHighlightBindingId}
                    onHighlightConsumed={() => setEventHighlightBindingId(null)}
                  />
                ) : (
                  <EditorPropertyPanelContent />
                )
              ) : rightPanelTab === "api" ? (
                <EditorApiConfigPanel
                  componentId={selectedIds.length > 0 ? selectedIds[0] : undefined}
                  onNavigateToEvent={(bindingId) => {
                    setEventHighlightBindingId(bindingId);
                    setRightPanelTab("events");
                  }}
                />
              ) : (
                <EditorCanvasPanel />
              )}
            </Box>
          </Box>
        )}

        <Box
          sx={{
            width: 24,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            backgroundColor: (theme) =>
              theme.palette.mode === "dark"
                ? "rgba(18, 18, 24, 0.4)"
                : "rgba(250, 250, 252, 0.6)",
            borderLeft: 1,
            borderColor: "divider",
            "&:hover": {
              backgroundColor: (theme) =>
                theme.palette.mode === "dark"
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(0,0,0,0.04)",
            },
          }}
          onClick={() => setRightPanelOpen(!rightPanelOpen)}
        >
          {rightPanelOpen ? (
            <ChevronRightIcon sx={{ fontSize: 14 }} />
          ) : (
            <ChevronLeftIcon sx={{ fontSize: 14 }} />
          )}
        </Box>
      </Box>
      )}
    </Box>
    <PerformanceMonitor />

    <FrameworkSelectDialog
      open={frameworkDialogOpen}
      mode={dialogMode}
      onClose={() => setFrameworkDialogOpen(false)}
      onSelect={(fw) => {
        if (dialogMode === 'publish') {
          void handlePublishWithFramework(fw);
        } else {
          void handlePreview(fw);
        }
      }}
    />

    </SceneEditorProvider>
  );
}
