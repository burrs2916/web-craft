import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import React, { useState, useCallback, useEffect, useRef, useMemo, memo } from "react";
import { componentRegistry } from "../registry";
import { useComponentStore } from "../../store/componentStore";
import { PanelWrapper } from "../components/PanelWrapper";
import { resolveIcon } from "../plugins";
import { useEditorStore } from "../../store/editorStore";
import { ComponentGridCard } from "../../components/component";
import { collectPluginTypes } from "../../utils/componentTree";
import WidgetsIcon from "@mui/icons-material/Widgets";
import SearchIcon from "@mui/icons-material/Search";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import InputAdornment from "@mui/material/InputAdornment";

interface ComponentCenterPanelProps {
  collapsed: boolean;
  onToggle: () => void;
}

const ComponentLibraryTab = memo(function ComponentLibraryTab() {
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [search, setSearch] = useState("");
  const categoryTree = useComponentStore((s) => s.categoryTree);
  const refresh = useComponentStore((s) => s.refresh);
  const syncIconFromPreviewWindow = useComponentStore((s) => s.syncIconFromPreviewWindow);
  const setDraggedComponentType = useEditorStore((s) => s.setDraggedComponentType);
  const tabScrollRef = useRef<HTMLDivElement>(null);
  const tabItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // 监听预览窗口的图标更新事件
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen<{ pluginType: string; icon: string; name?: string; description?: string | null }>("component-icon-updated", (event) => {
        const { pluginType, icon, name, description } = event.payload;
        syncIconFromPreviewWindow(pluginType, icon, name, description);
      }).then((fn) => { unlisten = fn; });
    });
    return () => { unlisten?.(); };
  }, [syncIconFromPreviewWindow]);

  const handleDragStart = useCallback((_e: React.DragEvent, type: string) => {
    setDraggedComponentType(type);
  }, [setDraggedComponentType]);

  useEffect(() => {
    // 确保设备组件先注册到 componentRegistry，再 refresh 加载 plugins
    // 否则 loadPlugins() 看不到设备组件，设备分类下会为空
    import("../../store/deviceStore").then(({ ensureDevicesLoaded }) => {
      ensureDevicesLoaded().finally(() => {
        refresh();
      });
    });
  }, []);

  // 首次加载时自动生成缺失的缩略图
  useEffect(() => {
    let cancelled = false;
    import("../utils/thumbnailGenerator").then(({ thumbnailGenerator }) => {
      if (!cancelled) thumbnailGenerator.ensureAll();
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (categoryTree.length > 0 && !activeCategory) {
      setActiveCategory(categoryTree[0].id);
    }
  }, [categoryTree, activeCategory]);

  const activeNode = categoryTree.find((n) => n.id === activeCategory);

  // 只显示已启用的组件，和组件管理页保持一致
  const enabledPlugins = useComponentStore((s) => s.enabledPlugins);
  const enabledPluginTypes = useMemo(() => new Set(enabledPlugins.map((p) => p.type)), [enabledPlugins]);

  const allDefinitionsForCategory = React.useMemo(() => {
    if (!activeNode) return [];

    const types = collectPluginTypes(activeNode);
    return componentRegistry.getEnabled().filter((d) => types.has(d.type) && enabledPluginTypes.has(d.type));
  }, [activeNode, enabledPluginTypes]);

  // 响应式获取 store 中的 plugins，确保用户改名后搜索能自动更新
  const storePlugins = useComponentStore((s) => s.plugins);

  const filteredDefinitions = useMemo(() => {
    if (!search) return allDefinitionsForCategory;
    const q = search.toLowerCase();
    return allDefinitionsForCategory.filter((def) => {
      // 优先匹配 store 中的用户自定义名称
      const storePlugin = storePlugins.find((p) => p.type === def.type);
      const displayName = storePlugin?.name ?? def.name;
      const displayDesc = storePlugin?.description ?? def.description;
      return displayName.toLowerCase().includes(q) ||
        def.type.toLowerCase().includes(q) ||
        (displayDesc || "").toLowerCase().includes(q);
    });
  }, [allDefinitionsForCategory, search, storePlugins]);

  const switchToCategory = useCallback(
    (direction: "left" | "right") => {
      const rootIds = categoryTree.map((n) => n.id);
      const currentIndex = rootIds.indexOf(activeCategory);
      let nextIndex: number;
      if (direction === "left") {
        nextIndex = Math.max(0, currentIndex - 1);
      } else {
        nextIndex = Math.min(rootIds.length - 1, currentIndex + 1);
      }
      const nextCategory = rootIds[nextIndex];
      if (nextCategory === activeCategory) return;
      setActiveCategory(nextCategory);
      requestAnimationFrame(() => {
        const tabEl = tabItemRefs.current.get(nextCategory);
        if (tabEl) {
          tabEl.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
        }
      });
    },
    [categoryTree, activeCategory]
  );

  const rootCategories = categoryTree;
  const rootIds = rootCategories.map((n) => n.id);

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* 标题栏 */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: 1.25,
          py: 0.75,
          borderBottom: 1,
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        <WidgetsIcon sx={{ fontSize: 14, color: "primary.main" }} />
        <Typography variant="caption" sx={{ fontSize: 11, fontWeight: 600 }}>
          组件库
        </Typography>
        <Typography variant="caption" sx={{ fontSize: 9, color: "text.disabled", ml: "auto" }}>
          {filteredDefinitions.length} 个组件
        </Typography>
      </Box>

      {/* 搜索框 */}
      <Box sx={{ px: 1, py: 0.75, flexShrink: 0 }}>
        <TextField
          size="small"
          placeholder="搜索组件..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          fullWidth
          sx={{ "& .MuiInputBase-input": { fontSize: 11, py: 0.5 } }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                </InputAdornment>
              ),
            },
          }}
        />
      </Box>

      {/* 分类 tab 栏 */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          borderBottom: 1,
          borderColor: "divider",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {rootIds.indexOf(activeCategory) > 0 && (
          <IconButton
            size="small"
            onClick={() => switchToCategory("left")}
            sx={{ flexShrink: 0, width: 20, height: 20, mx: 0.25 }}
          >
            <ChevronLeftIcon sx={{ fontSize: 14 }} />
          </IconButton>
        )}
        <Box
          ref={tabScrollRef}
          sx={{
            display: "flex",
            flex: 1,
            overflowX: "auto",
            "&::-webkit-scrollbar": { height: 0 },
            px: 0.5,
          }}
        >
          {rootCategories.map((cat) => (
            <Box
              key={cat.id}
              ref={(el: any) => {
                if (el) tabItemRefs.current.set(cat.id, el as HTMLDivElement);
              }}
              onClick={() => setActiveCategory(cat.id)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.25,
                px: 1,
                py: 0.5,
                cursor: "pointer",
                whiteSpace: "nowrap",
                fontSize: 10,
                fontWeight: activeCategory === cat.id ? 600 : 400,
                color: activeCategory === cat.id ? cat.color || "primary.main" : "text.secondary",
                borderBottom: activeCategory === cat.id ? 2 : 0,
                borderColor: cat.color || "primary.main",
                transition: "all 0.15s",
                flexShrink: 0,
                "&:hover": {
                  color: cat.color || "primary.main",
                  backgroundColor: (theme: any) =>
                    theme.palette.mode === "dark"
                      ? "rgba(255,255,255,0.04)"
                      : "rgba(0,0,0,0.02)",
                },
              }}
            >
              {resolveIcon(cat.icon, "category", 12)}
              {cat.name}
            </Box>
          ))}
        </Box>
        {rootIds.indexOf(activeCategory) < rootIds.length - 1 && (
          <IconButton
            size="small"
            onClick={() => switchToCategory("right")}
            sx={{ flexShrink: 0, width: 20, height: 20, mx: 0.25 }}
          >
            <ChevronRightIcon sx={{ fontSize: 14 }} />
          </IconButton>
        )}
      </Box>

      {/* 当前分类名 */}
      <Box
        sx={{
          px: 1,
          py: 0.25,
          flexShrink: 0,
        }}
      >
        <Typography variant="caption" sx={{ color: "text.secondary", fontSize: 10 }}>
          {activeNode?.name || activeCategory}
        </Typography>
      </Box>

      {/* 组件网格 */}
      <Box
        sx={{
          flex: 1,
          overflow: "auto",
          px: 1,
          pb: 1,
          "&::-webkit-scrollbar": { width: 4 },
          "&::-webkit-scrollbar-thumb": { borderRadius: 2 },
        }}
      >
        {filteredDefinitions.length > 0 ? (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 0.75,
            }}
          >
            {filteredDefinitions.map((def) => (
              <ComponentGridCard key={def.type} definition={def} onDragStart={handleDragStart} />
            ))}
          </Box>
        ) : (
          <Box sx={{ textAlign: "center", py: 4, color: "text.secondary" }}>
            <Typography variant="caption">
              {search ? "未找到匹配的组件" : "暂无组件"}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
});

export function ComponentCenterPanel({
  collapsed,
  onToggle,
}: ComponentCenterPanelProps) {
  return (
    <PanelWrapper
      collapsed={collapsed}
      onToggle={onToggle}
      width={260}
      position="left"
    >
      <Box
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <ComponentLibraryTab />
      </Box>
    </PanelWrapper>
  );
}
