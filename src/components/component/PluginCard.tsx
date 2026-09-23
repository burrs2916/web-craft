import { memo, useState, useRef, useEffect, useCallback } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import Paper from "@mui/material/Paper";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import DriveFileMoveOutlineIcon from "@mui/icons-material/SwapHoriz";
import { resolveIcon } from "../../editor/plugins";
import { componentRegistry } from "../../editor/registry";
import { SKIP_THUMBNAIL_TYPES } from "../../editor/utils/thumbnailGenerator";
import { useComponentStore } from "../../store/componentStore";
import { renderCategoryIcon } from "./categoryConstants";
import type { ComponentPluginItem, ComponentCategoryNode } from "../../types/component";
import type { ComponentDefinition } from "../../types/editor";

interface PluginCardProps {
  plugin: ComponentPluginItem;
  onMove?: (plugin: ComponentPluginItem, targetCatId: string) => void;
  allCategories?: ComponentCategoryNode[];
  currentCategoryId?: string;
  onClick?: (plugin: ComponentPluginItem) => void;
  size?: "small" | "medium";
  isUngrouped?: boolean;
  /** 多选模式：是否选中 */
  selected?: boolean;
  /** 多选模式：选中状态变化回调（带原生事件以判断 Ctrl/Shift） */
  onSelectChange?: (plugin: ComponentPluginItem, e: React.MouseEvent) => void;
  /** 拖拽：开始拖拽时携带的全部组件类型（多选时一起拖） */
  draggingTypes?: string[];
}

export function PluginCard({
  plugin,
  onMove,
  allCategories,
  currentCategoryId,
  onClick,
  size = "medium",
  isUngrouped = false,
  selected = false,
  onSelectChange,
  draggingTypes,
}: PluginCardProps) {
  const definition = componentRegistry.get(plugin.type);
  // plugin prop 已从 store 合并，直接使用即可
  const displayName = plugin.name || definition?.name;
  const definitionIcon = componentRegistry.getEffectiveIcon(plugin.type) ?? plugin.iconOverride ?? plugin.icon;
  const displayIcon = plugin.iconOverride ?? definitionIcon;
  const icon = resolveIcon(displayIcon, "widgets", size === "small" ? 20 : 22, plugin.type);
  // 默认走缩略图渲染，只有用户主动选择了 material 图标（带 "material:" 前缀）时才走图标渲染
  // 裸字符串（旧数据）不阻止缩略图渲染
  // 特例：如果定义的默认 icon 是 thumbnail 类型，强制使用缩略图（组件设计为缩略图渲染，旧 iconOverride 无效）
  const defIconIsThumbnail = definition && (definition.icon === "thumbnail" || (typeof definition.icon === "string" && definition.icon.startsWith("thumbnail:")));
  const useThumbnail = (definition && !SKIP_THUMBNAIL_TYPES.has(plugin.type)
    && !(plugin.iconOverride && plugin.iconOverride.startsWith("material:")))
    || !!defIconIsThumbnail;
  const [hovered, setHovered] = useState(false);
  const [moveAnchor, setMoveAnchor] = useState<null | HTMLElement>(null);

  const handleMoveClick = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    setMoveAnchor(e.currentTarget);
  };

  const handleMoveTo = (targetCatId: string) => {
    setMoveAnchor(null);
    onMove?.(plugin, targetCatId);
  };

  const isSmall = size === "small";

  const handleCardClick = (e: React.MouseEvent) => {
    // 多选模式下：Ctrl/Cmd/Shift 触发选中切换；普通点击触发 onClick
    if (onSelectChange && (e.ctrlKey || e.metaKey || e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      onSelectChange(plugin, e);
      return;
    }
    // 多选已有选中且当前点击非修饰键：仍触发 onClick（详情）
    onClick?.(plugin);
  };

  const handleDragStart = (e: React.DragEvent) => {
    // 拖拽时携带组件类型；多选时携带全部选中类型
    const types = (draggingTypes && draggingTypes.includes(plugin.type) && draggingTypes.length > 1)
      ? draggingTypes
      : [plugin.type];
    e.dataTransfer.setData("application/x-plugin-types", JSON.stringify(types));
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <Paper
      draggable
      onDragStart={handleDragStart}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleCardClick}
      sx={{
        p: isSmall ? 0.75 : 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0.5,
        borderRadius: 1,
        cursor: "grab",
        border: "1px solid",
        borderColor: selected ? "primary.main" : "divider",
        bgcolor: selected ? "action.selected" : undefined,
        opacity: plugin.enabled ? 1 : 0.5,
        position: "relative",
        overflow: "hidden",
        transition: "all 0.15s",
        boxShadow: selected ? (theme) => `0 0 0 1px ${theme.palette.primary.main} inset` : undefined,
        "&:hover": {
          bgcolor: selected ? "action.selected" : "action.hover",
          borderColor: "primary.main",
          transform: "scale(1.05)",
        },
        "&:active": { cursor: "grabbing" },
      }}
    >
      <Box
        sx={{
          width: useThumbnail ? (isSmall ? 48 : 56) : (isSmall ? 32 : 36),
          height: useThumbnail ? (isSmall ? 32 : 38) : (isSmall ? 32 : 36),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: useThumbnail
            ? "transparent"
            : (theme) =>
                theme.palette.mode === "dark"
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(0,0,0,0.04)",
          borderRadius: 0.75,
          color: "text.secondary",
        }}
      >
        {useThumbnail ? (
          <ComponentPreviewThumbnail definition={definition} fallbackIcon={icon} />
        ) : (
          icon
        )}
      </Box>
      <Typography
        variant="caption"
        sx={{
          fontSize: isSmall ? 8 : 9,
          fontWeight: 500,
          textAlign: "center",
          lineHeight: 1.2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "100%",
        }}
      >
        {displayName}
      </Typography>

      {isUngrouped && (
        <Box
          sx={{
            position: "absolute",
            top: 2,
            left: 2,
            px: 0.5,
            py: 0,
            borderRadius: 0.5,
            bgcolor: "warning.main",
            color: "warning.contrastText",
            fontSize: 7,
            lineHeight: "12px",
            fontWeight: 600,
          }}
        >
          未分组
        </Box>
      )}
      {hovered && onMove && allCategories && allCategories.length > 1 && (
        <Box
          sx={{
            position: "absolute",
            top: 2,
            right: 2,
          }}
        >
          <IconButton
            size="small"
            onClick={handleMoveClick}
            sx={{ p: 0.25, bgcolor: "background.paper", color: "text.disabled", "&:hover": { color: "primary.main" } }}
          >
            <DriveFileMoveOutlineIcon sx={{ fontSize: 10 }} />
          </IconButton>
        </Box>
      )}
      {onMove && allCategories && (
        <Menu
          anchorEl={moveAnchor}
          open={Boolean(moveAnchor)}
          onClose={() => setMoveAnchor(null)}
          slotProps={{ paper: { sx: { maxHeight: 200 } } }}
        >
          {allCategories
            .filter((cat) => cat.id !== currentCategoryId)
            .map((cat) => (
              <MenuItem
                key={cat.id}
                onClick={() => handleMoveTo(cat.id)}
                sx={{ fontSize: 11 }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Box sx={{ width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", color: cat.color || "text.secondary" }}>
                    {renderCategoryIcon(cat.icon, 10)}
                  </Box>
                  {cat.name}
                </Box>
              </MenuItem>
            ))}
        </Menu>
      )}
    </Paper>
  );
}

interface ComponentGridCardProps {
  definition: ComponentDefinition;
  onClick?: (definition: ComponentDefinition) => void;
  onDragStart?: (e: React.DragEvent, type: string) => void;
}

export const ComponentPreviewThumbnail = memo(function ComponentPreviewThumbnail({
  definition,
  fallbackIcon,
}: {
  definition: ComponentDefinition;
  fallbackIcon: React.ReactElement;
}) {
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const thumbnailUpdatedAt = useComponentStore((s) => s.thumbnailUpdatedAt[definition.type]);

  // 缩略图被更新后，重置 error 状态以重新尝试加载
  useEffect(() => {
    if (thumbnailUpdatedAt) {
      setError(false);
      setLoaded(false);
    }
  }, [thumbnailUpdatedAt]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (error) return fallbackIcon;

  // 与后端 save_thumbnail 保持一致：冒号等非法字符替换为 __
  // 否则 /thumbnails/device:FY002-MainController.png 这样的 URL 在浏览器/Tauri 中无法解析
  const safeType = definition.type.replace(/:/g, "__");
  const thumbnailUrl = `/thumbnails/${safeType}.png${thumbnailUpdatedAt ? `?t=${thumbnailUpdatedAt}` : ""}`;

  return (
    <Box
      ref={ref}
      sx={{
        width: 56,
        height: 38,
        position: "relative",
        overflow: "hidden",
        borderRadius: 0.75,
        background: "linear-gradient(180deg, #07111f 0%, #0d1b2a 50%, #101827 100%)",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
      }}
    >
      {visible && (
        <img
          key={thumbnailUrl}
          src={thumbnailUrl}
          alt={definition.name}
          draggable={false}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            pointerEvents: "none",
            opacity: loaded ? 1 : 0,
            transition: "opacity 0.2s ease-in",
          }}
        />
      )}
    </Box>
  );
});

export const ComponentGridCard = memo(function ComponentGridCard({ definition, onClick, onDragStart }: ComponentGridCardProps) {
  const storePlugin = useComponentStore((s) => {
    const p = s.plugins.find((pl) => pl.type === definition.type);
    return p;
  });
  const iconOverride = storePlugin?.iconOverride;
  const definitionIcon = componentRegistry.getEffectiveIcon(definition.type) ?? definition.icon;
  // 优先使用 store 中的名称和描述（用户自定义）
  const displayName = storePlugin?.name ?? definition.name;
  const displayDescription = storePlugin?.description ?? definition.description;
  const displayIcon = iconOverride ?? definitionIcon;
  const icon = resolveIcon(displayIcon, "widgets", 22, definition.type);
  // 默认走缩略图渲染，只有用户主动选择了 material 图标（带 "material:" 前缀）时才走图标渲染
  // 特例：如果定义的默认 icon 是 thumbnail 类型，强制使用缩略图（组件设计为缩略图渲染，旧 iconOverride 无效）
  const defIconIsThumbnail = definition.icon === "thumbnail" || (typeof definition.icon === "string" && definition.icon.startsWith("thumbnail:"));
  const useThumbnail = (!SKIP_THUMBNAIL_TYPES.has(definition.type)
    && !(iconOverride && iconOverride.startsWith("material:")))
    || defIconIsThumbnail;

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData("application/x-component-type", definition.type);
    e.dataTransfer.effectAllowed = "copy";
    onDragStart?.(e, definition.type);
  }, [definition.type, onDragStart]);

  const handleClick = useCallback(() => {
    onClick?.(definition);
  }, [definition, onClick]);

  return (
    <Tooltip title={displayDescription || displayName} arrow placement="top">
      <Paper
        draggable
        onDragStart={handleDragStart}
        onClick={handleClick}
        sx={{
          p: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 0.5,
          borderRadius: 1,
          cursor: "grab",
          border: "1px solid",
          borderColor: "divider",
          overflow: "hidden",
          transition: "all 0.15s",
          "&:hover": {
            bgcolor: "action.hover",
            borderColor: "primary.main",
            transform: "scale(1.05)",
          },
          "&:active": {
            cursor: "grabbing",
            transform: "scale(0.98)",
          },
        }}
      >
        <Box
          sx={{
            width: useThumbnail ? 56 : 36,
            height: useThumbnail ? 38 : 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: useThumbnail
              ? "transparent"
              : (theme) =>
                  theme.palette.mode === "dark"
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.04)",
            borderRadius: 0.75,
            color: "text.secondary",
          }}
        >
          {useThumbnail ? (
            <ComponentPreviewThumbnail definition={definition} fallbackIcon={icon} />
          ) : (
            icon
          )}
        </Box>
        <Typography
          variant="caption"
          sx={{
            fontSize: 9,
            fontWeight: 500,
            textAlign: "center",
            lineHeight: 1.2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "100%",
          }}
        >
          {displayName}
        </Typography>
      </Paper>
    </Tooltip>
  );
});
