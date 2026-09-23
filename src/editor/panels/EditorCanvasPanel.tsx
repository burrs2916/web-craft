import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Switch from "@mui/material/Switch";
import Collapse from "@mui/material/Collapse";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import { forwardRef, useCallback, useEffect, useState } from "react";
import { useEditorStore } from "../../store/editorStore";
import { BREAKPOINTS } from "../../types/editor";
import type { GradientDirection, ImageFit } from "../../types/editor";
import { AssetPicker, type AssetPickerMode } from "../components/AssetPicker";
import { toAssetUrl } from "../utils/assetUrl";
import { MIN_CANVAS_H, MAX_CANVAS_H } from "../utils/canvasConstants";
import StraightenIcon from "@mui/icons-material/Straighten";
import TuneIcon from "@mui/icons-material/Tune";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import VideoIcon from "@mui/icons-material/Videocam";
import CloseIcon from "@mui/icons-material/Close";
import DesktopIcon from "@mui/icons-material/DesktopWindows";
import TabletIcon from "@mui/icons-material/TabletMac";
import PhoneIcon from "@mui/icons-material/PhoneIphone";

// --- 常量 ---

const GRADIENT_DIRECTION_OPTIONS: { label: string; value: GradientDirection }[] = [
  { label: "→ 向右", value: "to-right" },
  { label: "← 向左", value: "to-left" },
  { label: "↓ 向下", value: "to-bottom" },
  { label: "↑ 向上", value: "to-top" },
  { label: "↘ 右下", value: "to-bottom-right" },
  { label: "↙ 左下", value: "to-bottom-left" },
  { label: "↗ 右上", value: "to-top-right" },
  { label: "↖ 左上", value: "to-top-left" },
  { label: "◎ 径向", value: "radial" },
];

const IMAGE_FITS: { label: string; value: ImageFit }[] = [
  { label: "覆盖 (cover)", value: "cover" },
  { label: "包含 (contain)", value: "contain" },
  { label: "拉伸 (fill)", value: "fill" },
  { label: "原始 (none)", value: "none" },
];

// 精简为 18 色（3 行 × 6 列），去除中间过渡色
const SOLID_PRESETS = [
  "#ffffff", "#f5f5f5", "#9e9e9e", "#424242", "#1a1a1a", "#000000",
  "#f44336", "#e91e63", "#9c27b0", "#3f51b5", "#2196f3", "#00bcd4",
  "#009688", "#4caf50", "#cddc39", "#ffc107", "#ff9800", "#795548",
];

const GRADIENT_PRESETS: { name: string; direction: GradientDirection; colors: [string, string] }[] = [
  { name: "暖阳", direction: "to-bottom", colors: ["#f12711", "#f5af19"] },
  { name: "海洋", direction: "to-right", colors: ["#2193b0", "#6dd5ed"] },
  { name: "紫霞", direction: "to-bottom-right", colors: ["#8e2de2", "#4a00e0"] },
  { name: "翠绿", direction: "to-bottom", colors: ["#11998e", "#38ef7d"] },
  { name: "暮光", direction: "to-bottom", colors: ["#0f0c29", "#302b63"] },
  { name: "火焰", direction: "to-right", colors: ["#ff0844", "#ffb199"] },
  { name: "极光", direction: "to-bottom-left", colors: ["#43cea2", "#185a9d"] },
  { name: "星空", direction: "to-bottom", colors: ["#0f2027", "#2c5364"] },
  { name: "晨曦", direction: "to-right", colors: ["#ffecd2", "#fcb69f"] },
  { name: "深蓝", direction: "to-bottom", colors: ["#000428", "#004e92"] },
  { name: "樱花", direction: "to-right", colors: ["#ee9ca7", "#ffdde1"] },
  { name: "暗夜", direction: "radial", colors: ["#1a1a2e", "#16213e"] },
];

// --- 通用组件 ---

function SectionHeader({
  title,
  icon,
  expanded,
  onToggle,
}: {
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Box
      onClick={onToggle}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        cursor: "pointer",
        userSelect: "none",
        py: 0.75,
        "&:hover": { opacity: 0.8 },
      }}
    >
      <Box sx={{ color: "primary.main", display: "flex", alignItems: "center", fontSize: 18 }}>
        {icon}
      </Box>
      <Typography
        variant="caption"
        sx={{ fontWeight: 700, color: "text.primary", fontSize: 12.5, flex: 1, letterSpacing: 0.3 }}
      >
        {title}
      </Typography>
      <Box sx={{ color: "text.disabled", display: "flex", alignItems: "center" }}>
        {expanded ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
      </Box>
    </Box>
  );
}

const SettingRow = forwardRef<HTMLDivElement, {
  label: string;
  children: React.ReactNode;
  labelWidth?: number;
}>(function SettingRow({
  label,
  children,
  labelWidth = 72,
}, ref) {
  return (
    <Box ref={ref} sx={{ display: "flex", alignItems: "center", gap: 1, minHeight: 34 }}>
      <Typography
        variant="caption"
        sx={{ color: "text.secondary", width: labelWidth, flexShrink: 0, fontSize: 12, lineHeight: "34px" }}
      >
        {label}
      </Typography>
      <Box sx={{ flex: 1, display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>{children}</Box>
    </Box>
  );
});

const inputSx = {
  "& .MuiInputBase-input": { fontSize: 12.5, py: 0.5, px: 1 },
  "& .MuiInputBase-root": { minHeight: 30 },
  "& .MuiInputLabel-root": { fontSize: 12.5 },
} as const;

const selectSx = { fontSize: 12.5, flex: 1 } as const;
const menuItemSx = { fontSize: 12.5 } as const;

// --- 模块级常量 ---

const BP_ICONS: Record<string, React.ReactElement> = {
  desktop: <DesktopIcon sx={{ fontSize: 14 }} />,
  tablet: <TabletIcon sx={{ fontSize: 14 }} />,
  mobile: <PhoneIcon sx={{ fontSize: 14 }} />,
};

// --- 主组件 ---

export function EditorCanvasPanel() {
  const canvasConfig = useEditorStore((s) => s.canvasConfig);
  const setCanvasConfig = useEditorStore((s) => s.setCanvasConfig);
  const fitCanvasHeightToContent = useEditorStore((s) => s.fitCanvasHeightToContent);
  const components = useEditorStore((s) => s.components);
  const layers = useEditorStore((s) => s.layers);
  const activeBreakpoint = useEditorStore((s) => s.activeBreakpoint);
  const setActiveBreakpoint = useEditorStore((s) => s.setActiveBreakpoint);

  const activeBackground = canvasConfig.background;
  const setActiveBackground = useCallback((updates: Partial<typeof canvasConfig.background>) => {
    const current = useEditorStore.getState().canvasConfig.background;
    setCanvasConfig({ background: { ...current, ...updates } });
  }, [setCanvasConfig]);

  const [sizeExpanded, setSizeExpanded] = useState(true);
  const [bgExpanded, setBgExpanded] = useState(true);

  // 本地输入暂存：onChange 只更新本地 state，onBlur 才提交到 store（避免每按键 pushHistory）
  const [minHeightInput, setMinHeightInput] = useState(String(canvasConfig.minHeight));
  useEffect(() => setMinHeightInput(String(canvasConfig.minHeight)), [canvasConfig.minHeight]);

  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [assetPickerMode, setAssetPickerMode] = useState<AssetPickerMode>("image");

  const activeBpConfig = BREAKPOINTS.find((b) => b.id === activeBreakpoint);

  const handleMinHeightBlur = useCallback(() => {
    const v = parseInt(minHeightInput, 10);
    const clamped = isNaN(v) ? canvasConfig.minHeight : Math.max(MIN_CANVAS_H, Math.min(MAX_CANVAS_H, v));
    setMinHeightInput(String(clamped));
    if (clamped !== canvasConfig.minHeight) {
      setCanvasConfig({ minHeight: clamped });
      fitCanvasHeightToContent(); // 配置变更立即反映到画布
    }
  }, [minHeightInput, canvasConfig.minHeight, setCanvasConfig, fitCanvasHeightToContent]);

  const handleFitContent = useCallback(() => {
    fitCanvasHeightToContent();
  }, [fitCanvasHeightToContent]);

  // --- 背景相关 ---
  const updateBg = useCallback((field: string, value: unknown) => {
    setActiveBackground({ [field]: value } as any);
  }, [setActiveBackground]);

  const handlePickAsset = useCallback((mode: AssetPickerMode) => {
    setAssetPickerMode(mode);
    setAssetPickerOpen(true);
  }, []);

  const handleAssetSelected = useCallback((path: string) => {
    if (assetPickerMode === "image") updateBg("imageUrl", path);
    else updateBg("videoUrl", path);
    setAssetPickerOpen(false);
  }, [assetPickerMode, updateBg]);

  // 背景预览样式
  const getBgPreviewStyle = useCallback(() => {
    const bg = activeBackground;
    if (bg.type === "solid") return { backgroundColor: bg.color };
    if (bg.type === "gradient") {
      const dir = bg.gradient.direction;
      if (dir === "radial") return { background: `radial-gradient(circle, ${bg.gradient.colors[0]}, ${bg.gradient.colors[1]})` };
      return { background: `linear-gradient(${dir.replace(/-/g, " ")}, ${bg.gradient.colors[0]}, ${bg.gradient.colors[1]})` };
    }
    if (bg.type === "image" && bg.imageUrl) {
      const url = bg.imageUrl.startsWith("data:") || bg.imageUrl.startsWith("http")
        ? bg.imageUrl : toAssetUrl(bg.imageUrl);
      return { backgroundImage: `url(${url})`, backgroundSize: bg.imageFit || "cover", backgroundPosition: "center" };
    }
    if (bg.type === "video" && bg.videoUrl) return { backgroundColor: "#1a1a2e" };
    return { backgroundColor: "#ffffff" };
  }, [activeBackground]);

  const layerCount = layers.filter((l) => l.type === "layer").length;

  return (
    <Box sx={{ width: "100%", display: "flex", flexDirection: "column", overflow: "hidden", height: "100%" }}>
      {/* --- 摘要条（精简头部，不重复外层 Tab 标题） --- */}
      <Box sx={{
        display: "flex", justifyContent: "center", alignItems: "center",
        py: 0.5, borderBottom: 1, borderColor: "divider", flexShrink: 0,
      }}>
        <Typography variant="caption" sx={{ color: "text.disabled", fontSize: 11 }}>
          {canvasConfig.width} × {canvasConfig.height}px · {layerCount} 图层 · {components.length} 组件
        </Typography>
      </Box>

      {/* --- 滚动内容 --- */}
      <Box sx={{
        flex: 1, overflow: "auto", px: 1.5, py: 1.5,
        display: "flex", flexDirection: "column", gap: 1.5,
        "&::-webkit-scrollbar": { width: 6 },
        "&::-webkit-scrollbar-thumb": { borderRadius: 3, backgroundColor: "action.disabled" },
        "&::-webkit-scrollbar-thumb:hover": { backgroundColor: "action.disabledOpacity" },
      }}>
        {/* === 尺寸设置 === */}
        <Box>
          <SectionHeader title="尺寸设置" icon={<StraightenIcon sx={{ fontSize: 16 }} />} expanded={sizeExpanded} onToggle={() => setSizeExpanded(!sizeExpanded)} />
          <Collapse in={sizeExpanded} unmountOnExit>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25, pl: 0.5, pt: 0.5 }}>
              {/* 响应式断点切换器：宽度由断点固定 */}
              <Box sx={{ display: "flex", gap: 0.5 }}>
                {BREAKPOINTS.map((bp) => (
                  <Chip
                    key={bp.id}
                    label={bp.label}
                    icon={BP_ICONS[bp.id]}
                    size="small"
                    color={activeBreakpoint === bp.id ? "primary" : "default"}
                    variant={activeBreakpoint === bp.id ? "filled" : "outlined"}
                    onClick={() => setActiveBreakpoint(bp.id)}
                    sx={{ flex: 1, fontSize: 12, borderRadius: 1, justifyContent: "center" }}
                  />
                ))}
              </Box>

              {/* 当前画布尺寸（只读，由断点与内容决定） */}
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1, py: 0.5, borderRadius: 1, bgcolor: "action.hover" }}>
                <Typography variant="caption" sx={{ fontSize: 11.5, color: "text.secondary", flex: 1 }}>
                  {activeBpConfig ? `${activeBpConfig.label} · 宽 ${activeBpConfig.canvasWidth}px 固定` : "宽度随断点固定"}
                </Typography>
                <Typography variant="caption" sx={{ fontSize: 12, fontWeight: 700, color: "text.primary", fontVariantNumeric: "tabular-nums" }}>
                  {canvasConfig.width} × {canvasConfig.height}
                </Typography>
              </Box>

              <Tooltip title="内容不足时画布保持的最小高度，模拟真实网页的首屏高度" arrow>
                <SettingRow label="最小高度">
                  <TextField
                    type="number" size="small" value={minHeightInput}
                    onChange={(e) => setMinHeightInput(e.target.value)}
                    onBlur={handleMinHeightBlur}
                    sx={{ flex: 1, ...inputSx }}
                    slotProps={{ htmlInput: { min: MIN_CANVAS_H, max: MAX_CANVAS_H } }}
                  />
                  <Typography variant="caption" sx={{ fontSize: 11, color: "text.disabled", flexShrink: 0 }}>px</Typography>
                </SettingRow>
              </Tooltip>

              <Button
                size="small" variant="outlined" fullWidth
                startIcon={<FitScreenIcon sx={{ fontSize: 16 }} />}
                onClick={handleFitContent}
                sx={{ textTransform: "none", fontSize: 12.5 }}
              >
                适配内容高度
              </Button>

              <Typography variant="caption" sx={{ fontSize: 10.5, color: "text.disabled", lineHeight: 1.6 }}>
                画布底边自动贴合最底部的组件（不低于最小高度）：内容增减、拖拽缩放后自动跟随，组件可以稳定贴底。
              </Typography>
            </Box>
          </Collapse>
          <Divider sx={{ mt: 1.5 }} />
        </Box>

        {/* === 背景设置 === */}
        <Box>
          <SectionHeader title="背景设置" icon={<TuneIcon sx={{ fontSize: 16 }} />} expanded={bgExpanded} onToggle={() => setBgExpanded(!bgExpanded)} />
          <Collapse in={bgExpanded} unmountOnExit>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25, pl: 0.5 }}>
              <SettingRow label="背景类型">
                <Select size="small" value={activeBackground.type} onChange={(e) => updateBg("type", e.target.value)} sx={selectSx}>
                  <MenuItem value="solid" sx={menuItemSx}>纯色</MenuItem>
                  <MenuItem value="gradient" sx={menuItemSx}>渐变</MenuItem>
                  <MenuItem value="image" sx={menuItemSx}>图片</MenuItem>
                  <MenuItem value="video" sx={menuItemSx}>视频</MenuItem>
                </Select>
              </SettingRow>

              {/* -- 纯色 -- */}
              {activeBackground.type === "solid" && (
                <>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, py: 0.5 }}>
                    {SOLID_PRESETS.map((color) => (
                      <Tooltip key={color} title={color}>
                        <Box
                          onClick={() => updateBg("color", color)}
                          sx={{
                            width: 22, height: 22, borderRadius: 0.5, backgroundColor: color, cursor: "pointer",
                            border: activeBackground.color === color ? 2 : 1,
                            borderColor: activeBackground.color === color ? "primary.main" : "divider",
                            transition: "all 0.15s",
                            "&:hover": { transform: "scale(1.15)", borderColor: "primary.main" },
                          }}
                        />
                      </Tooltip>
                    ))}
                  </Box>
                  <SettingRow label="自定义">
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flex: 1, minWidth: 0 }}>
                      <input type="color" value={activeBackground.color} onChange={(e) => updateBg("color", e.target.value)} style={{ width: 28, height: 28, border: "1px solid #ccc", borderRadius: 4, cursor: "pointer", padding: 0, flexShrink: 0 }} />
                      <TextField size="small" value={activeBackground.color} onChange={(e) => updateBg("color", e.target.value)} sx={{ flex: 1, minWidth: 0, ...inputSx }} />
                    </Box>
                  </SettingRow>
                </>
              )}

              {/* -- 渐变 -- */}
              {activeBackground.type === "gradient" && (
                <>
                  <Typography variant="caption" sx={{ color: "text.secondary", fontSize: 11, fontWeight: 600 }}>预设渐变</Typography>
                  <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0.75 }}>
                    {GRADIENT_PRESETS.map((preset) => {
                      const cssDir = preset.direction === "radial" ? "radial-gradient(circle" : `linear-gradient(${preset.direction.replace(/-/g, " ")}`;
                      const isActive = activeBackground.gradient.direction === preset.direction && activeBackground.gradient.colors[0] === preset.colors[0] && activeBackground.gradient.colors[1] === preset.colors[1];
                      return (
                        <Tooltip key={preset.name} title={preset.name}>
                          <Box
                            onClick={() => updateBg("gradient", { direction: preset.direction, colors: [...preset.colors] as [string, string] })}
                            sx={{
                              height: 40, borderRadius: 1, cursor: "pointer",
                              border: isActive ? 2 : 1, borderColor: isActive ? "primary.main" : "divider",
                              background: `${cssDir}, ${preset.colors[0]}, ${preset.colors[1]})`,
                              transition: "all 0.15s",
                              "&:hover": { transform: "scale(1.05)", borderColor: "primary.main" },
                            }}
                          />
                        </Tooltip>
                      );
                    })}
                  </Box>
                  <SettingRow label="渐变方向">
                    <Select size="small" value={activeBackground.gradient.direction} onChange={(e) => updateBg("gradient", { ...activeBackground.gradient, direction: e.target.value as GradientDirection })} sx={selectSx}>
                      {GRADIENT_DIRECTION_OPTIONS.map((opt) => (
                        <MenuItem key={opt.value} value={opt.value} sx={menuItemSx}>{opt.label}</MenuItem>
                      ))}
                    </Select>
                  </SettingRow>
                  <SettingRow label="起始色">
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flex: 1, minWidth: 0 }}>
                      <input type="color" value={activeBackground.gradient.colors[0]} onChange={(e) => updateBg("gradient", { ...activeBackground.gradient, colors: [e.target.value, activeBackground.gradient.colors[1]] })} style={{ width: 28, height: 28, border: "1px solid #ccc", borderRadius: 4, cursor: "pointer", padding: 0, flexShrink: 0 }} />
                      <TextField size="small" value={activeBackground.gradient.colors[0]} onChange={(e) => updateBg("gradient", { ...activeBackground.gradient, colors: [e.target.value, activeBackground.gradient.colors[1]] })} sx={{ flex: 1, minWidth: 0, ...inputSx }} />
                    </Box>
                  </SettingRow>
                  <SettingRow label="结束色">
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flex: 1, minWidth: 0 }}>
                      <input type="color" value={activeBackground.gradient.colors[1]} onChange={(e) => updateBg("gradient", { ...activeBackground.gradient, colors: [activeBackground.gradient.colors[0], e.target.value] })} style={{ width: 28, height: 28, border: "1px solid #ccc", borderRadius: 4, cursor: "pointer", padding: 0, flexShrink: 0 }} />
                      <TextField size="small" value={activeBackground.gradient.colors[1]} onChange={(e) => updateBg("gradient", { ...activeBackground.gradient, colors: [activeBackground.gradient.colors[0], e.target.value] })} sx={{ flex: 1, minWidth: 0, ...inputSx }} />
                    </Box>
                  </SettingRow>
                </>
              )}

              {/* -- 图片 -- */}
              {activeBackground.type === "image" && (
                <>
                  <Button size="small" variant="outlined" fullWidth onClick={() => handlePickAsset("image")} sx={{ fontSize: 12.5, textTransform: "none", py: 0.5 }}>
                    {activeBackground.imageUrl ? "更换图片" : "选择图片"}
                  </Button>
                  {activeBackground.imageUrl && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                      <Typography variant="caption" sx={{ fontSize: 11, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                        {activeBackground.imageUrl.split("/").pop() || "已选择"}
                      </Typography>
                      <Tooltip title="清除">
                        <IconButton size="small" onClick={() => updateBg("imageUrl", "")} sx={{ color: "text.disabled", "&:hover": { color: "error.main" } }}>
                          <CloseIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  )}
                  <SettingRow label="填充模式">
                    <Select size="small" value={activeBackground.imageFit} onChange={(e) => updateBg("imageFit", e.target.value as ImageFit)} sx={selectSx}>
                      {IMAGE_FITS.map((f) => (
                        <MenuItem key={f.value} value={f.value} sx={menuItemSx}>{f.label}</MenuItem>
                      ))}
                    </Select>
                  </SettingRow>
                </>
              )}

              {/* -- 视频 -- */}
              {activeBackground.type === "video" && (
                <>
                  <Button size="small" variant="outlined" fullWidth onClick={() => handlePickAsset("video")} sx={{ fontSize: 12.5, textTransform: "none", py: 0.5 }}>
                    {activeBackground.videoUrl ? "更换视频" : "选择视频"}
                  </Button>
                  {activeBackground.videoUrl && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                      <Typography variant="caption" sx={{ fontSize: 11, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                        {activeBackground.videoUrl.split("/").pop() || "已选择"}
                      </Typography>
                      <Tooltip title="清除">
                        <IconButton size="small" onClick={() => updateBg("videoUrl", "")} sx={{ color: "text.disabled", "&:hover": { color: "error.main" } }}>
                          <CloseIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  )}
                  <SettingRow label="自动播放">
                    <Switch size="small" checked={activeBackground.videoAutoplay} onChange={(e) => updateBg("videoAutoplay", e.target.checked)} />
                  </SettingRow>
                  <SettingRow label="静音">
                    <Switch size="small" checked={activeBackground.videoMuted} onChange={(e) => updateBg("videoMuted", e.target.checked)} />
                  </SettingRow>
                  <SettingRow label="循环">
                    <Switch size="small" checked={activeBackground.videoLoop} onChange={(e) => updateBg("videoLoop", e.target.checked)} />
                  </SettingRow>
                </>
              )}

              {/* 背景预览 */}
              <Box sx={{ height: 56, borderRadius: 1, border: 1, borderColor: "divider", overflow: "hidden", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", ...getBgPreviewStyle() }}>
                {activeBackground.type === "video" && activeBackground.videoUrl && (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                    <VideoIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                    <Typography variant="caption" sx={{ fontSize: 10, color: "text.secondary" }}>
                      {activeBackground.videoUrl.split("/").pop() || "视频"}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>
          </Collapse>
        </Box>
      </Box>

      {/* 素材选择器 */}
      {assetPickerOpen && (
        <AssetPicker mode={assetPickerMode} open={assetPickerOpen} onClose={() => setAssetPickerOpen(false)} onSelect={handleAssetSelected} />
      )}
    </Box>
  );
}
