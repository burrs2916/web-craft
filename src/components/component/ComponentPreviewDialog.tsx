import { useState, useEffect, useRef, useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Tooltip from "@mui/material/Tooltip";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import CloseIcon from "@mui/icons-material/Close";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ColorLensIcon from "@mui/icons-material/ColorLens";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import SaveIcon from "@mui/icons-material/Save";
import LinkIcon from "@mui/icons-material/Link";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import FullscreenRoundedIcon from "@mui/icons-material/FullscreenRounded";
import FullscreenExitRoundedIcon from "@mui/icons-material/FullscreenExitRounded";
import Divider from "@mui/material/Divider";
import Modal from "@mui/material/Modal";

import { componentRegistry } from "../../editor/registry";
import { resolveIcon } from "../../editor/plugins";
import { useComponentStore } from "../../store/componentStore";
import { IconPicker } from "./IconPicker";
import {
  parseIconSource,
  serializeIconSource,
  type IconSource,
} from "../../utils/iconSource";
import type { ComponentPluginItem } from "../../types/component";

interface Props {
  plugin: ComponentPluginItem;
  definition: any;
  open: boolean;
  onClose: () => void;
  onApplied?: () => void;
}

type TabKey = "auto" | "icon" | "upload" | "text" | "color";

const PRESETS = [
  { w: 200, h: 150, label: "200×150" },
  { w: 400, h: 300, label: "400×300" },
  { w: 600, h: 400, label: "600×400" },
  { w: 800, h: 600, label: "800×600" },
];

const ASPECT_PRESETS = [
  { w: 1, h: 1, label: "1:1" },
  { w: 4, h: 3, label: "4:3" },
  { w: 16, h: 9, label: "16:9" },
  { w: 3, h: 4, label: "3:4" },
  { w: 9, h: 16, label: "9:16" },
];

const BG_PRESETS = [
  "#0a1929", "#1a2942", "#0d1b2a", "#1e3a5f",
  "#ffffff", "#f5f5f5", "#263238", "#000000",
];

const COLOR_PRESETS = [
  "#4fc3f7", "#7acaec", "#3faacb", "#235fa7",
  "#11eefd", "#00c2ff", "#1dc1f5", "#ff7043",
  "#ffa726", "#66bb6a", "#ab47bc", "#ec407a",
];

const EMOJI_SAMPLES = ["📊", "📈", "📉", "🎯", "⚙️", "🔧", "💡", "🔥", "⚡", "🌐", "🗺️", "📍", "🛰️", "🏗️", "🛠️", "✨", "🎨", "🧭", "📐", "🔍"];

export function ComponentPreviewDialog({ plugin, definition, open, onClose, onApplied }: Props) {
  const updatePluginMeta = useComponentStore((s) => s.updatePluginMeta);
  const setThumbnailUpdatedAt = useComponentStore((s) => s.setThumbnailUpdatedAt);

  // 当前图标源（编辑态）
  const initialSrc: IconSource = useMemo(
    () => parseIconSource(plugin.iconOverride ?? definition?.icon),
    [plugin.iconOverride, definition?.icon]
  );

  const [tab, setTab] = useState<TabKey>(initialSrc.kind === "thumbnail" ? "auto" : "icon");
  const [draft, setDraft] = useState<IconSource>(initialSrc);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 截图模式参数（默认 800×600，常用缩略图尺寸）
  const defaultW = definition?.defaultSize?.width ?? 800;
  const defaultH = definition?.defaultSize?.height ?? 600;
  const [previewW, setPreviewW] = useState(defaultW);
  const [previewH, setPreviewH] = useState(defaultH);
  const [lockAspect, setLockAspect] = useState(true);
  const [pixelRatio, setPixelRatio] = useState<1 | 2 | 3>(2);
  const [fitMode, setFitMode] = useState<"contain" | "cover">("contain");
  const [transparent, setTransparent] = useState(false);
  const [screenshotBg, setScreenshotBg] = useState("#0a1929");
  const [padding, setPadding] = useState(8);
  const [borderRadius, setBorderRadius] = useState(8);
  // 弹窗位置与大小（自定义拖动 / 缩放）
  const [dlgFull, setDlgFull] = useState(false);
  type ResizeHandle = "t" | "b" | "l" | "r" | "tl" | "tr" | "bl" | "br";
  const DEFAULT_W = 960;
  const DEFAULT_H = 640;
  const [dlgPos, setDlgPos] = useState({ x: 0, y: 0 });
  const [dlgSize, setDlgSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });
  const [dlgDrag, setDlgDrag] = useState<null | {
    type: "move" | "resize";
    handle?: ResizeHandle;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    baseW: number;
    baseH: number;
  }>(null);

  // open 变化时初始化居中尺寸
  useEffect(() => {
    if (!open) return;
    const cx = Math.max(40, Math.round((window.innerWidth - DEFAULT_W) / 2));
    const cy = Math.max(40, Math.round((window.innerHeight - DEFAULT_H) / 2));
    setDlgPos({ x: cx, y: cy });
    setDlgSize({ w: DEFAULT_W, h: DEFAULT_H });
  }, [open]);

  // 全局 pointermove / pointerup
  useEffect(() => {
    if (!dlgDrag) return;
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - dlgDrag.startX;
      const dy = e.clientY - dlgDrag.startY;
      if (dlgDrag.type === "move") {
        setDlgPos({ x: Math.max(0, dlgDrag.baseX + dx), y: Math.max(0, dlgDrag.baseY + dy) });
        return;
      }
      // resize
      const handle = dlgDrag.handle!;
      let newX = dlgDrag.baseX;
      let newY = dlgDrag.baseY;
      let newW = dlgDrag.baseW;
      let newH = dlgDrag.baseH;
      const affectsLeft = handle === "l" || handle === "tl" || handle === "bl";
      const affectsRight = handle === "r" || handle === "tr" || handle === "br";
      const affectsTop = handle === "t" || handle === "tl" || handle === "tr";
      const affectsBottom = handle === "b" || handle === "bl" || handle === "br";
      if (affectsLeft) { newW = dlgDrag.baseW - dx; if (newW < 480) newW = 480; newX = dlgDrag.baseX + (dlgDrag.baseW - newW); }
      if (affectsRight) { newW = dlgDrag.baseW + dx; if (newW < 480) newW = 480; }
      if (affectsTop) { newH = dlgDrag.baseH - dy; if (newH < 400) newH = 400; newY = dlgDrag.baseY + (dlgDrag.baseH - newH); }
      if (affectsBottom) { newH = dlgDrag.baseH + dy; if (newH < 400) newH = 400; }
      // 防止拖出视口顶部
      if (newY < 0) { newH += newY; newY = 0; }
      setDlgPos({ x: Math.max(0, newX), y: Math.max(0, newY) });
      setDlgSize({ w: newW, h: newH });
    };
    const onUp = () => setDlgDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dlgDrag]);

  const aspectRatio = previewW / previewH;
  const setPreviewSize = (w: number, h: number) => {
    if (lockAspect) {
      // 保持当前比例，按宽度变化
      if (w !== previewW) setPreviewH(Math.max(50, Math.min(2000, Math.round(w / aspectRatio))));
      else setPreviewW(Math.max(50, Math.min(2000, Math.round(h * aspectRatio))));
    } else {
      setPreviewW(w);
      setPreviewH(h);
    }
  };

  // 文字模式参数
  const [textContent, setTextContent] = useState(initialSrc.kind === "text" ? initialSrc.content : "");
  const [textBg, setTextBg] = useState("#1a2942");
  const [textColor, setTextColor] = useState("#ffffff");
  const [textSize, setTextSize] = useState(36);
  const [textWeight, setTextWeight] = useState<400 | 600 | 700>(600);
  const [textRadius, setTextRadius] = useState(8);

  // 纯色块模式参数
  const [colorValue, setColorValue] = useState(initialSrc.kind === "color" ? initialSrc.color : "#4fc3f7");
  const [colorRadius, setColorRadius] = useState(8);
  const [colorShowName, setColorShowName] = useState(true);

  // 上传模式
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadMeta, setUploadMeta] = useState<{ name: string; size: number } | null>(null);
  const [uploadBg, setUploadBg] = useState("#0a1929");
  const [uploadRadius, setUploadRadius] = useState(8);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 名称/描述编辑
  const [editName, setEditName] = useState(plugin.name);
  const [editDescription, setEditDescription] = useState(plugin.description ?? "");

  // 渲染器
  const [Renderer, setRenderer] = useState<React.ComponentType<any> | null>(null);
  const [loading, setLoading] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      const src = parseIconSource(plugin.iconOverride ?? definition?.icon);
      setDraft(src);
      setTab(src.kind === "thumbnail" ? "auto" : src.kind === "text" ? "text" : src.kind === "color" ? "color" : "icon");
      setPreviewW(defaultW);
      setPreviewH(defaultH);
      setSavedAt(null);
      setErrorMsg(null);
      setUploadPreview(null);
      setUploadMeta(null);
      setEditName(plugin.name);
      setEditDescription(plugin.description ?? "");
      if (src.kind === "text") setTextContent(src.content);
      if (src.kind === "color") setColorValue(src.color);
    }
  }, [open, plugin.iconOverride, plugin.name, plugin.description, definition?.icon, defaultW, defaultH]);

  useEffect(() => {
    if (!open || !definition) return;
    let cancelled = false;
    setLoading(true);
    componentRegistry.loadRenderer(plugin.type).then((comp) => {
      if (!cancelled && comp) setRenderer(() => comp);
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [open, plugin.type, definition]);

  const defaultConfig = definition?.defaultConfig ?? {};

  const handleTabChange = (_: any, v: TabKey) => {
    setTab(v);
    setErrorMsg(null);
  };

  const handleReset = () => {
    const def = parseIconSource(definition?.icon);
    setDraft(def);
    setTab(def.kind === "thumbnail" ? "auto" : def.kind === "text" ? "text" : def.kind === "color" ? "color" : "icon");
    if (def.kind === "text") setTextContent(def.content);
    if (def.kind === "color") setColorValue(def.color);
    setUploadPreview(null);
    setUploadMeta(null);
    setEditName(plugin.name);
    setEditDescription(plugin.description ?? "");
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrorMsg("请选择图片文件 (PNG / JPG / SVG)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setUploadPreview(dataUrl);
      setUploadMeta({ name: file.name, size: file.size });
      setErrorMsg(null);
    };
    reader.readAsDataURL(file);
  };

  // 应用：保存到后端 + store
  const handleApply = async () => {
    if (saving) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      let finalSource: IconSource = draft;
      // 截图 / 上传 模式：把图写入 public/thumbnails/{type}.png
      if (tab === "auto") {
        if (!stageRef.current) {
          setErrorMsg("预览区未就绪");
          setSaving(false);
          return;
        }
        // 调试：截图前打印 stage 内容概要，便于排查"截到了什么"
        if (process.env.NODE_ENV === "development") {
          const stage = stageRef.current;
          const inner = stage.querySelector('[data-thumbnail-renderer]') as HTMLElement | null;
          console.log("[PreviewDialog] stage summary", {
            pluginType: plugin.type,
            pluginName: plugin.name,
            stageW: stage.offsetWidth,
            stageH: stage.offsetHeight,
            hasSvg: !!stage.querySelector("svg"),
            svgCount: stage.querySelectorAll("svg").length,
            innerRenderer: inner?.getAttribute("data-thumbnail-renderer") ?? null,
            innerHTMLPreview: stage.innerHTML.slice(0, 400),
          });
        }
        // 在截图前用配置的背景色、padding、圆角包裹 stage
        const dataUrl = await captureWithStyle(stageRef.current, {
          bg: screenshotBg,
          padding,
          borderRadius,
          w: previewW,
          h: previewH,
          pixelRatio,
          transparent,
        });
        if (!dataUrl) {
          setErrorMsg("截图失败");
          setSaving(false);
          return;
        }
        await writeThumbnail(plugin.type, dataUrl);
        const ts = Date.now();
        setThumbnailUpdatedAt(plugin.type, ts);
        setSavedAt(ts);
        finalSource = { kind: "thumbnail" };
      } else if (tab === "upload") {
        if (!uploadPreview) {
          setErrorMsg("请先选择图片");
          setSaving(false);
          return;
        }
        // 合成背景色+图片后写入缩略图
        const composited = await compositeWithBg(uploadPreview, uploadBg, uploadRadius);
        await writeThumbnail(plugin.type, composited);
        const ts = Date.now();
        setThumbnailUpdatedAt(plugin.type, ts);
        setSavedAt(ts);
        finalSource = { kind: "thumbnail" };
      } else if (tab === "text") {
        if (!textContent.trim()) {
          setErrorMsg("请输入文字或 emoji");
          setSaving(false);
          return;
        }
        const svg = makeTextSvg(textContent, textBg, textColor, textSize, textWeight, textRadius);
        const dataUrl = `data:image/svg+xml;base64,${btoa(decodeURIComponent(encodeURIComponent(svg)))}`;
        await writeThumbnail(plugin.type, dataUrl);
        const ts = Date.now();
        setThumbnailUpdatedAt(plugin.type, ts);
        setSavedAt(ts);
        // 同时把文字内容存到 icon 字段
        finalSource = { kind: "text", content: textContent };
      } else if (tab === "color") {
        // 纯色块：写一个 SVG
        const svg = makeColorSvg(colorValue, plugin.name, colorRadius, colorShowName);
        const dataUrl = `data:image/svg+xml;base64,${btoa(decodeURIComponent(encodeURIComponent(svg)))}`;
        await writeThumbnail(plugin.type, dataUrl);
        const ts = Date.now();
        setThumbnailUpdatedAt(plugin.type, ts);
        setSavedAt(ts);
        finalSource = { kind: "color", color: colorValue };
      } else if (tab === "icon") {
        finalSource = draft;
      }

      // 更新 store + DB（图标 + 名称/描述合并为一次调用）
      const serialized = serializeIconSource(finalSource);
      const trimmedName = editName.trim() || plugin.name;
      const trimmedDesc = editDescription.trim() || null;
      await updatePluginMeta(plugin.type, {
        icon: serialized,
        ...(trimmedName !== plugin.name ? { name: trimmedName } : {}),
        ...((plugin.description ?? null) !== trimmedDesc ? { description: trimmedDesc } : {}),
      });
      componentRegistry.setIconOverride(plugin.type, serialized);
      onApplied?.();
      setTimeout(() => onClose(), 600);
    } catch (e) {
      console.error("[PreviewDialog] apply failed:", e);
      setErrorMsg(String(e));
    } finally {
      setSaving(false);
    }
  };

  const renderLivePreview = () => {
    if (tab === "text") {
      return (
        <Box sx={{
          width: 240, height: 160,
          display: "flex", alignItems: "center", justifyContent: "center",
          bgcolor: textBg, borderRadius: `${textRadius}px`,
          color: textColor, fontSize: textSize, fontWeight: textWeight,
          letterSpacing: 1, overflow: "hidden",
        }}>
          {textContent || "示例"}
        </Box>
      );
    }
    if (tab === "color") {
      return (
        <Box sx={{
          width: 240, height: 160,
          display: "flex", alignItems: "center", justifyContent: "center",
          bgcolor: colorValue, borderRadius: `${colorRadius}px`,
          color: "#fff", fontSize: 12, opacity: 0.95,
        }}>
          {colorShowName ? plugin.name : ""}
        </Box>
      );
    }
    if (tab === "upload") {
      return (
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
          <Box sx={{ width: 240, height: 160, display: "flex", alignItems: "center", justifyContent: "center", p: 1, borderRadius: `${uploadRadius}px`, border: "1px dashed", borderColor: "divider", bgcolor: uploadBg }}>
            {uploadPreview
              ? <img src={uploadPreview} alt="upload" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
              : <Typography variant="caption" sx={{ color: "text.disabled", fontSize: 11 }}>未选择文件</Typography>
            }
          </Box>
          {uploadMeta && (
            <Typography variant="caption" sx={{ fontSize: 10, color: "text.secondary" }}>
              {uploadMeta.name} · {(uploadMeta.size / 1024).toFixed(1)} KB
            </Typography>
          )}
        </Box>
      );
    }
    if (tab === "icon") {
      const matName = draft.kind === "material" ? draft.name : "widgets";
      return <Box sx={{ width: 240, height: 160, display: "flex", alignItems: "center", justifyContent: "center" }}>{resolveIcon(matName, "widgets", 56)}</Box>;
    }
    // auto 模式：把 stage 元素用配置的背景/padding/圆角包裹，预览与最终截图完全一致
    if (loading) return <Typography variant="caption" sx={{ color: "text.secondary" }}>加载渲染器...</Typography>;
    if (!Renderer) return <Typography variant="caption" sx={{ color: "text.disabled" }}>无法加载渲染器</Typography>;
    // 内框：始终承载 screenshotBg 底色，避免 Renderer 自带 bgcolor 完全盖住
    const innerSx = {
      width: "100%",
      height: "100%",
      bgcolor: transparent ? "transparent" : screenshotBg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      // contain 时让子元素按比例缩入；cover 时让子元素满铺并裁切
      "& > *": fitMode === "cover"
        ? { width: "100%", height: "100%", display: "block" }
        : { maxWidth: "100%", maxHeight: "100%", objectFit: "contain" as const },
    };
    return (
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
        <Box
          ref={stageRef}
          data-thumbnail-stage
          sx={{
            width: previewW, height: previewH,
            p: `${padding}px`,
            // stage 外层也始终是 screenshotBg 底色，保证 padding 周边可见
            bgcolor: transparent ? "transparent" : screenshotBg,
            borderRadius: `${borderRadius}px`,
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden",
            boxShadow: transparent ? "0 0 0 1px rgba(0,0,0,0.2)" : "0 0 0 1px rgba(0,0,0,0.08)",
          }}
        >
          <Box sx={innerSx}>
            <Renderer config={{ ...defaultConfig, _thumbnail: true }} componentId={`preview_${plugin.type}`} mode="preview" width={previewW} height={previewH} />
          </Box>
        </Box>
        <Typography variant="caption" sx={{ fontSize: 10, color: "text.disabled" }}>
          {previewW}×{previewH} · {fitMode} · 内边距 {padding} · 圆角 {borderRadius} · {transparent ? "透明" : screenshotBg.toUpperCase()} · {pixelRatio}x
        </Typography>
      </Box>
    );
  };

  // 8 个 resize handle：4 角是明显的"折角"按钮（L 形两条线 + 12x12 热区），4 边是细线热区
  const CORNER_SIZE = 16;
  const EDGE_THICK = 6;
  const HANDLES: Array<{ key: ResizeHandle; sx: any; corner?: "tl" | "tr" | "bl" | "br" }> = [
    { key: "t",  sx: { top: 0, left: EDGE_THICK, right: EDGE_THICK, height: EDGE_THICK, cursor: "ns-resize" } },
    { key: "b",  sx: { bottom: 0, left: EDGE_THICK, right: EDGE_THICK, height: EDGE_THICK, cursor: "ns-resize" } },
    { key: "l",  sx: { left: 0, top: EDGE_THICK, bottom: EDGE_THICK, width: EDGE_THICK, cursor: "ew-resize" } },
    { key: "r",  sx: { right: 0, top: EDGE_THICK, bottom: EDGE_THICK, width: EDGE_THICK, cursor: "ew-resize" } },
    { key: "tl", sx: { top: 0, left: 0, width: CORNER_SIZE, height: CORNER_SIZE, cursor: "nwse-resize" }, corner: "tl" },
    { key: "tr", sx: { top: 0, right: 0, width: CORNER_SIZE, height: CORNER_SIZE, cursor: "nesw-resize" }, corner: "tr" },
    { key: "bl", sx: { bottom: 0, left: 0, width: CORNER_SIZE, height: CORNER_SIZE, cursor: "nesw-resize" }, corner: "bl" },
    { key: "br", sx: { bottom: 0, right: 0, width: CORNER_SIZE, height: CORNER_SIZE, cursor: "nwse-resize" }, corner: "br" },
  ];

  return (
    <Modal open={open} onClose={onClose} sx={{ zIndex: 1300 }}>
      <Box
        onClick={(e) => e.stopPropagation()}
        sx={{
          position: "absolute",
          left: dlgFull ? 0 : dlgPos.x,
          top: dlgFull ? 0 : dlgPos.y,
          width: dlgFull ? "100vw" : dlgSize.w,
          height: dlgFull ? "100vh" : dlgSize.h,
          bgcolor: "background.paper",
          color: "text.primary",
          borderRadius: dlgFull ? 0 : 1.5,
          boxShadow: 24,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          outline: "none",
          userSelect: dlgDrag ? "none" : "auto",
        }}
      >
        {/* resize 把手：4 角 = 折角按钮 + 热区，4 边 = 细线热区。全屏时隐藏 */}
        {!dlgFull && HANDLES.map((h) => {
          const onPointerDown = (e: React.PointerEvent) => {
            e.preventDefault();
            setDlgDrag({
              type: "resize",
              handle: h.key,
              startX: e.clientX, startY: e.clientY,
              baseX: dlgPos.x, baseY: dlgPos.y,
              baseW: dlgSize.w, baseH: dlgSize.h,
            });
          };
          if (h.corner) {
            // 折角 L 形：用两条 1.5px 的线段形成 L，再叠一个透明热区
            const isTop = h.corner === "tl" || h.corner === "tr";
            const isLeft = h.corner === "tl" || h.corner === "bl";
            const lineColor = "rgba(33,150,243,0.6)";
            return (
              <Box
                key={h.key}
                sx={{ position: "absolute", zIndex: 5, ...h.sx, "&:hover .corner-line": { borderColor: "primary.main" }, "&:hover .corner-bg": { bgcolor: "rgba(33,150,243,0.1)" } }}
                onPointerDown={onPointerDown}
              >
                <Box className="corner-bg" sx={{ position: "absolute", inset: 0, bgcolor: "transparent" }} />
                {/* 横向线 */}
                <Box className="corner-line" sx={{
                  position: "absolute",
                  [isTop ? "top" : "bottom"]: 2,
                  left: isLeft ? 2 : "auto",
                  right: isLeft ? "auto" : 2,
                  width: CORNER_SIZE - 4,
                  height: 0,
                  borderTop: `1.5px solid ${lineColor}`,
                  pointerEvents: "none",
                }} />
                {/* 纵向线 */}
                <Box className="corner-line" sx={{
                  position: "absolute",
                  top: isTop ? 2 : "auto",
                  bottom: isTop ? "auto" : 2,
                  [isLeft ? "left" : "right"]: 2,
                  width: 0,
                  height: CORNER_SIZE - 4,
                  borderLeft: `1.5px solid ${lineColor}`,
                  pointerEvents: "none",
                }} />
                {/* 角点小方块 */}
                <Box sx={{
                  position: "absolute",
                  [isTop ? "top" : "bottom"]: 0,
                  [isLeft ? "left" : "right"]: 0,
                  width: 4, height: 4,
                  bgcolor: "primary.main",
                  borderRadius: 0.25,
                  pointerEvents: "none",
                  opacity: 0.7,
                }} />
              </Box>
            );
          }
          // 4 边：透明热区，hover 时出现浅色提示
          return (
            <Box
              key={h.key}
              sx={{
                position: "absolute", zIndex: 5, ...h.sx,
                bgcolor: "transparent",
                transition: "background-color 0.15s",
                "&:hover": { bgcolor: "rgba(33,150,243,0.12)" },
              }}
              onPointerDown={onPointerDown}
            />
          );
        })}
        <Box
          sx={{ cursor: dlgFull ? "default" : "move", flexShrink: 0 }}
          onPointerDown={(e) => {
            if (dlgFull) return;
            // 排除按钮区域：让按钮点击不被吞
            const target = e.target as HTMLElement;
            if (target.closest("button, a, input, textarea, [role='button']")) return;
            setDlgDrag({
              type: "move",
              startX: e.clientX, startY: e.clientY,
              baseX: dlgPos.x, baseY: dlgPos.y,
              baseW: dlgSize.w, baseH: dlgSize.h,
            });
          }}
        >
      <DialogTitle sx={{ display: "flex", flexDirection: "column", gap: 0.75, fontSize: 13, pb: 1, cursor: dlgFull ? "default" : "move" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {resolveIcon(plugin.icon, "widgets", 16, plugin.type)}
          <Typography variant="subtitle2" sx={{ fontSize: 13, fontWeight: 600 }}>设置图标 / 元数据</Typography>
          <Typography variant="caption" sx={{ fontSize: 10, color: "text.disabled" }}>· {plugin.description || plugin.name}</Typography>
          <Box sx={{ flex: 1 }} />
          <Tooltip title={dlgFull ? "退出全屏" : "全屏"}>
            <IconButton size="small" onClick={() => setDlgFull(!dlgFull)}>
              {dlgFull ? <FullscreenExitRoundedIcon sx={{ fontSize: 16 }} /> : <FullscreenRoundedIcon sx={{ fontSize: 16 }} />}
            </IconButton>
          </Tooltip>
          <Tooltip title="恢复为默认">
            <IconButton size="small" onClick={handleReset}><RestartAltIcon sx={{ fontSize: 16 }} /></IconButton>
          </Tooltip>
          <IconButton size="small" onClick={onClose}><CloseIcon sx={{ fontSize: 16 }} /></IconButton>
        </Box>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
          <TextField
            size="small"
            label="名称"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 30, style: { fontSize: 11 } } }}
            sx={{ flex: "1 1 140px", "& .MuiOutlinedInput-root": { borderRadius: 0.5 } }}
          />
          <TextField
            size="small"
            label="描述"
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 80, style: { fontSize: 11 } } }}
            sx={{ flex: "2 1 200px", "& .MuiOutlinedInput-root": { borderRadius: 0.5 } }}
          />
        </Box>
      </DialogTitle>
      <DialogContent sx={{ p: 0, flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <Tabs
          value={tab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ borderBottom: 1, borderColor: "divider", minHeight: 36, flexShrink: 0, "& .MuiTab-root": { minHeight: 36, fontSize: 11, textTransform: "none", py: 0.5 } }}
        >
          <Tab value="auto" icon={<PhotoCameraIcon sx={{ fontSize: 14 }} />} iconPosition="start" label="自动截图" />
          <Tab value="icon" icon={<AutoAwesomeIcon sx={{ fontSize: 14 }} />} iconPosition="start" label="选择图标" />
          <Tab value="upload" icon={<UploadFileIcon sx={{ fontSize: 14 }} />} iconPosition="start" label="上传图片" />
          <Tab value="text" icon={<TextFieldsIcon sx={{ fontSize: 14 }} />} iconPosition="start" label="文字/Emoji" />
          <Tab value="color" icon={<ColorLensIcon sx={{ fontSize: 14 }} />} iconPosition="start" label="纯色块" />
        </Tabs>

        <Box sx={{ display: "flex", flex: 1, minHeight: 0 }}>
          {/* 左侧：参数面板 */}
          <Box sx={{ width: 280, flexShrink: 0, borderRight: 1, borderColor: "divider", p: 1.5, bgcolor: "background.default", overflow: "auto" }}>
            {tab === "auto" && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Typography variant="caption" sx={{ fontSize: 11, fontWeight: 600 }}>渲染尺寸</Typography>
                  <Tooltip title={lockAspect ? "已锁定横竖比" : "未锁定"}>
                    <IconButton size="small" onClick={() => setLockAspect(!lockAspect)} sx={{ p: 0.25 }}>
                      {lockAspect ? <LinkIcon sx={{ fontSize: 14, color: "primary.main" }} /> : <LinkOffIcon sx={{ fontSize: 14, color: "text.disabled" }} />}
                    </IconButton>
                  </Tooltip>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                  <Typography variant="caption" sx={{ fontSize: 10, width: 32, color: "text.secondary" }}>宽 W</Typography>
                  <TextField type="number" size="small" value={previewW}
                    onChange={(e) => { const raw = e.target.value; if (raw === "") return; const v = parseInt(raw, 10); if (!isNaN(v) && v >= 50 && v <= 2000) setPreviewSize(v, previewH); }}
                    onBlur={() => { if (previewW < 50) setPreviewW(50); if (previewW > 2000) setPreviewW(2000); }}
                    slotProps={{ htmlInput: { min: 50, max: 2000, step: 10, style: { fontSize: 12, textAlign: "center", fontVariantNumeric: "tabular-nums", padding: "6px 0" } } }}
                    sx={{ flex: 1, "& .MuiOutlinedInput-root": { borderRadius: 0.5 }, "& input": { textAlign: "center" } }} />
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                  <Typography variant="caption" sx={{ fontSize: 10, width: 32, color: "text.secondary" }}>高 H</Typography>
                  <TextField type="number" size="small" value={previewH}
                    onChange={(e) => { const raw = e.target.value; if (raw === "") return; const v = parseInt(raw, 10); if (!isNaN(v) && v >= 50 && v <= 2000) setPreviewSize(previewW, v); }}
                    onBlur={() => { if (previewH < 50) setPreviewH(50); if (previewH > 2000) setPreviewH(2000); }}
                    slotProps={{ htmlInput: { min: 50, max: 2000, step: 10, style: { fontSize: 12, textAlign: "center", fontVariantNumeric: "tabular-nums", padding: "6px 0" } } }}
                    sx={{ flex: 1, "& .MuiOutlinedInput-root": { borderRadius: 0.5 }, "& input": { textAlign: "center" } }} />
                </Box>
                <Button size="small" onClick={() => { setLockAspect(false); setPreviewW(defaultW); setPreviewH(defaultH); }} sx={{ fontSize: 9, textTransform: "none", alignSelf: "flex-start", minWidth: "auto" }}>↺ 恢复默认（{defaultW}×{defaultH}）</Button>
                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                  {PRESETS.map((p) => (
                    <Button key={p.label} size="small" variant={previewW === p.w && previewH === p.h ? "contained" : "text"} onClick={() => { setLockAspect(false); setPreviewW(p.w); setPreviewH(p.h); }} sx={{ fontSize: 9, textTransform: "none", minWidth: "auto", px: 0.75, py: 0 }}>{p.label}</Button>
                  ))}
                </Box>
                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", alignItems: "center" }}>
                  <Typography variant="caption" sx={{ fontSize: 9, color: "text.disabled", mr: 0.5 }}>比例</Typography>
                  {ASPECT_PRESETS.map((a) => {
                    const active = Math.abs(previewW / previewH - a.w / a.h) < 0.02;
                    return (
                      <Button key={a.label} size="small" variant={active ? "contained" : "outlined"} onClick={() => {
                        const newH = Math.max(50, Math.min(2000, Math.round(previewW * a.h / a.w)));
                        setLockAspect(true);
                        setPreviewH(newH);
                      }} sx={{ fontSize: 9, textTransform: "none", minWidth: "auto", px: 0.75, py: 0 }}>{a.label}</Button>
                    );
                  })}
                </Box>
                <Divider />
                <Typography variant="caption" sx={{ fontSize: 11, fontWeight: 600 }}>截图样式</Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Typography variant="caption" sx={{ fontSize: 10, width: 50 }}>背景色</Typography>
                  <TextField type="color" size="small" value={screenshotBg} onChange={(e) => { setScreenshotBg(e.target.value); setTransparent(false); }} disabled={transparent} sx={{ width: 60, "& input": { p: 0.5, height: 24 } }} />
                  <TextField size="small" value={screenshotBg} onChange={(e) => { setScreenshotBg(e.target.value); setTransparent(false); }} disabled={transparent} slotProps={{ htmlInput: { style: { fontSize: 10, padding: "4px 6px" } } }} sx={{ flex: 1, "& .MuiOutlinedInput-root": { borderRadius: 0.5 } }} />
                </Box>
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 0.5 }}>
                  {BG_PRESETS.map((c) => (
                    <Box key={c} onClick={() => { setScreenshotBg(c); setTransparent(false); }} sx={{ width: "100%", height: 20, borderRadius: 0.5, bgcolor: c, cursor: "pointer", border: !transparent && screenshotBg.toLowerCase() === c.toLowerCase() ? "2px solid" : "1px solid", borderColor: !transparent && screenshotBg.toLowerCase() === c.toLowerCase() ? "primary.main" : "divider" }} />
                  ))}
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <input type="checkbox" id="transBg" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} style={{ width: 13, height: 13 }} />
                  <label htmlFor="transBg">
                    <Typography variant="caption" sx={{ fontSize: 10, cursor: "pointer" }}>透明背景（PNG）</Typography>
                  </label>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography variant="caption" sx={{ fontSize: 10, width: 50 }}>内边距</Typography>
                  <TextField type="number" size="small" value={padding}
                    onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 0 && v <= 50) setPadding(v); }}
                    slotProps={{ htmlInput: { min: 0, max: 50, style: { fontSize: 11, padding: "4px 6px" } } }}
                    sx={{ width: 70, "& .MuiOutlinedInput-root": { borderRadius: 0.5 } }} />
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography variant="caption" sx={{ fontSize: 10, width: 50 }}>圆角</Typography>
                  <TextField type="number" size="small" value={borderRadius}
                    onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 0 && v <= 40) setBorderRadius(v); }}
                    slotProps={{ htmlInput: { min: 0, max: 40, style: { fontSize: 11, padding: "4px 6px" } } }}
                    sx={{ width: 70, "& .MuiOutlinedInput-root": { borderRadius: 0.5 } }} />
                </Box>
                <Divider />
                <Typography variant="caption" sx={{ fontSize: 11, fontWeight: 600 }}>输出选项</Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Typography variant="caption" sx={{ fontSize: 10, width: 50 }}>像素比</Typography>
                  {[1, 2, 3].map((p) => (
                    <Button key={p} size="small" variant={pixelRatio === p ? "contained" : "outlined"}
                      onClick={() => setPixelRatio(p as 1 | 2 | 3)}
                      sx={{ minWidth: "auto", px: 0.75, py: 0, fontSize: 10, textTransform: "none" }}>
                      {p}x
                    </Button>
                  ))}
                  <Typography variant="caption" sx={{ fontSize: 9, color: "text.disabled" }}>· 输出 {previewW * pixelRatio}×{previewH * pixelRatio}</Typography>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Typography variant="caption" sx={{ fontSize: 10, width: 50 }}>填充</Typography>
                  {(["contain", "cover"] as const).map((m) => (
                    <Button key={m} size="small" variant={fitMode === m ? "contained" : "outlined"}
                      onClick={() => setFitMode(m)}
                      sx={{ minWidth: "auto", px: 0.75, py: 0, fontSize: 10, textTransform: "none" }}>
                      {m === "contain" ? "Contain 完整" : "Cover 铺满"}
                    </Button>
                  ))}
                </Box>
              </Box>
            )}

            {tab === "icon" && (
              <Box>
                <Typography variant="caption" sx={{ fontSize: 11, fontWeight: 600, mb: 1, display: "block" }}>选择 MUI 图标</Typography>
                <IconPicker
                  value={draft.kind === "material" ? draft.name : "widgets"}
                  onChange={(name) => setDraft({ kind: "material", name })}
                />
              </Box>
            )}

            {tab === "upload" && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                <Typography variant="caption" sx={{ fontSize: 11, fontWeight: 600 }}>上传图片</Typography>
                <Typography variant="caption" sx={{ fontSize: 10, color: "text.secondary" }}>支持 PNG / JPG / SVG，文件会覆盖缩略图。</Typography>
                <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleFileSelect} />
                <Button size="small" variant="outlined" startIcon={<UploadFileIcon sx={{ fontSize: 14 }} />} onClick={() => fileInputRef.current?.click()} sx={{ fontSize: 11, textTransform: "none" }}>
                  选择文件
                </Button>
                {uploadPreview && (
                  <Button size="small" color="error" onClick={() => setUploadPreview(null)} sx={{ fontSize: 10, textTransform: "none" }}>清除已选</Button>
                )}
                <Divider />
                <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 600 }}>背景色</Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
                  {BG_PRESETS.map((c) => (
                    <Box key={c} onClick={() => setUploadBg(c)} sx={{ width: 22, height: 22, borderRadius: 0.75, bgcolor: c, cursor: "pointer", border: uploadBg.toLowerCase() === c.toLowerCase() ? "2px solid" : "1px solid", borderColor: uploadBg.toLowerCase() === c.toLowerCase() ? "primary.main" : "divider" }} />
                  ))}
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Typography variant="caption" sx={{ fontSize: 10, width: 50 }}>自定义</Typography>
                  <TextField type="color" size="small" value={uploadBg} onChange={(e) => setUploadBg(e.target.value)} sx={{ width: 60, "& input": { p: 0.5, height: 24 } }} />
                  <TextField size="small" value={uploadBg} onChange={(e) => setUploadBg(e.target.value)} slotProps={{ htmlInput: { style: { fontSize: 10, padding: "4px 6px" } } }} sx={{ flex: 1, "& .MuiOutlinedInput-root": { borderRadius: 0.5 } }} />
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography variant="caption" sx={{ fontSize: 10, width: 50 }}>圆角</Typography>
                  <TextField type="number" size="small" value={uploadRadius}
                    onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 0 && v <= 40) setUploadRadius(v); }}
                    slotProps={{ htmlInput: { min: 0, max: 40, style: { fontSize: 11, padding: "4px 6px" } } }}
                    sx={{ width: 60, "& .MuiOutlinedInput-root": { borderRadius: 0.5 } }} />
                  <Typography variant="caption" sx={{ fontSize: 9, color: "text.disabled" }}>px</Typography>
                </Box>
              </Box>
            )}

            {tab === "text" && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                <Typography variant="caption" sx={{ fontSize: 11, fontWeight: 600 }}>文字 / Emoji</Typography>
                <TextField size="small" placeholder="输入文字或 emoji" value={textContent} onChange={(e) => { setTextContent(e.target.value); setDraft({ kind: "text", content: e.target.value }); }} slotProps={{ htmlInput: { maxLength: 4, style: { fontSize: 14, textAlign: "center" } } }} sx={{ "& .MuiOutlinedInput-root": { borderRadius: 0.5 } }} />
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                  {EMOJI_SAMPLES.map((e) => (
                    <Button key={e} size="small" variant={textContent === e ? "contained" : "outlined"} onClick={() => { setTextContent(e); setDraft({ kind: "text", content: e }); }} sx={{ minWidth: "auto", px: 0.75, py: 0, fontSize: 16 }}>{e}</Button>
                  ))}
                </Box>
                <Divider />
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Typography variant="caption" sx={{ fontSize: 10, width: 50 }}>背景</Typography>
                  <TextField type="color" size="small" value={textBg} onChange={(e) => setTextBg(e.target.value)} sx={{ width: 50, "& input": { p: 0.5, height: 22 } }} />
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Typography variant="caption" sx={{ fontSize: 10, width: 50 }}>文字</Typography>
                  <TextField type="color" size="small" value={textColor} onChange={(e) => setTextColor(e.target.value)} sx={{ width: 50, "& input": { p: 0.5, height: 22 } }} />
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography variant="caption" sx={{ fontSize: 10, width: 50 }}>字号</Typography>
                  <TextField type="number" size="small" value={textSize}
                    onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 12 && v <= 96) setTextSize(v); }}
                    slotProps={{ htmlInput: { min: 12, max: 96, style: { fontSize: 11, padding: "4px 6px" } } }}
                    sx={{ width: 60, "& .MuiOutlinedInput-root": { borderRadius: 0.5 } }} />
                  <Typography variant="caption" sx={{ fontSize: 9, color: "text.disabled" }}>px</Typography>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Typography variant="caption" sx={{ fontSize: 10, width: 50 }}>字重</Typography>
                  {[400, 600, 700].map((w) => (
                    <Button key={w} size="small" variant={textWeight === w ? "contained" : "outlined"}
                      onClick={() => setTextWeight(w as 400 | 600 | 700)}
                      sx={{ minWidth: "auto", px: 0.75, py: 0, fontSize: 10, textTransform: "none" }}>
                      {w === 400 ? "细" : w === 600 ? "中" : "粗"}
                    </Button>
                  ))}
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography variant="caption" sx={{ fontSize: 10, width: 50 }}>圆角</Typography>
                  <TextField type="number" size="small" value={textRadius}
                    onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 0 && v <= 40) setTextRadius(v); }}
                    slotProps={{ htmlInput: { min: 0, max: 40, style: { fontSize: 11, padding: "4px 6px" } } }}
                    sx={{ width: 60, "& .MuiOutlinedInput-root": { borderRadius: 0.5 } }} />
                  <Typography variant="caption" sx={{ fontSize: 9, color: "text.disabled" }}>px</Typography>
                </Box>
              </Box>
            )}

            {tab === "color" && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                <Typography variant="caption" sx={{ fontSize: 11, fontWeight: 600 }}>纯色块</Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 0.5 }}>
                  {COLOR_PRESETS.map((c) => (
                    <Box key={c} onClick={() => { setColorValue(c); setDraft({ kind: "color", color: c }); }} sx={{ width: 28, height: 28, borderRadius: 0.75, bgcolor: c, cursor: "pointer", border: colorValue === c ? "2px solid" : "1px solid", borderColor: colorValue === c ? "primary.main" : "divider" }} />
                  ))}
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Typography variant="caption" sx={{ fontSize: 10, width: 50 }}>自定义</Typography>
                  <TextField type="color" size="small" value={colorValue} onChange={(e) => { setColorValue(e.target.value); setDraft({ kind: "color", color: e.target.value }); }} sx={{ width: 50, "& input": { p: 0.5, height: 22 } }} />
                  <TextField size="small" value={colorValue} onChange={(e) => { setColorValue(e.target.value); setDraft({ kind: "color", color: e.target.value }); }} slotProps={{ htmlInput: { style: { fontSize: 10, padding: "4px 6px" } } }} sx={{ flex: 1, "& .MuiOutlinedInput-root": { borderRadius: 0.5 } }} />
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography variant="caption" sx={{ fontSize: 10, width: 50 }}>圆角</Typography>
                  <TextField type="number" size="small" value={colorRadius}
                    onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 0 && v <= 40) setColorRadius(v); }}
                    slotProps={{ htmlInput: { min: 0, max: 40, style: { fontSize: 11, padding: "4px 6px" } } }}
                    sx={{ width: 60, "& .MuiOutlinedInput-root": { borderRadius: 0.5 } }} />
                  <Typography variant="caption" sx={{ fontSize: 9, color: "text.disabled" }}>px</Typography>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <input type="checkbox" id="showName" checked={colorShowName} onChange={(e) => setColorShowName(e.target.checked)} style={{ width: 13, height: 13 }} />
                  <label htmlFor="showName">
                    <Typography variant="caption" sx={{ fontSize: 10, cursor: "pointer" }}>在色块上叠加显示组件名称</Typography>
                  </label>
                </Box>
              </Box>
            )}
          </Box>

          {/* 右侧：实时预览（画布跟随主题，不再写死 #0a1929） */}
          <Box sx={{ flex: 1, display: "flex", flexDirection: "column", bgcolor: "background.paper", minHeight: 0 }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 0.75, borderBottom: 1, borderColor: "divider", bgcolor: "background.default" }}>
              <Typography variant="caption" sx={{ fontSize: 10, color: "text.secondary" }}>实时预览（应用后保存为图标）</Typography>
              {(savedAt || errorMsg) && (
                <Typography
                  variant="caption"
                  sx={{ color: errorMsg ? "error.main" : "success.main", fontSize: 10 }}
                >
                  {errorMsg ? `⚠ ${errorMsg}` : "✓ 图标已更新"}
                </Typography>
              )}
            </Box>
            <Box sx={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              p: 2,
              // 画布自身不写死颜色，auto + transparent 时用棋盘格，让用户一眼看出透明状态
              ...(tab === "auto" && transparent ? {
                backgroundImage: "repeating-conic-gradient(#80808080 0% 25%, transparent 0% 50%)",
                backgroundSize: "16px 16px",
              } : {}),
              minHeight: 0,
              overflow: "auto",
            }}>
              {renderLivePreview()}
            </Box>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1, borderTop: 1, borderColor: "divider", flexShrink: 0, bgcolor: "background.default" }}>
        <Button size="small" onClick={onClose} sx={{ fontSize: 11, textTransform: "none" }}>取消</Button>
        <Button size="small" variant="contained" startIcon={<SaveIcon sx={{ fontSize: 14 }} />} onClick={handleApply} disabled={saving} sx={{ fontSize: 11, textTransform: "none" }}>
          {saving ? "保存中..." : "应用"}
        </Button>
      </DialogActions>
        </Box>
      </Box>
    </Modal>
  );
}

// ============ 工具函数 ============

async function writeThumbnail(componentType: string, dataUrl: string) {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("save_thumbnail", { componentType, dataUrl });
}

/** 用 Canvas 合成背景色+前景图片，输出 PNG dataUrl */
function compositeWithBg(
  fgDataUrl: string,
  bg: string,
  radius: number,
  width = 120,
  height = 80,
): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;

    // 绘制圆角背景
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(width - radius, 0);
    ctx.quadraticCurveTo(width, 0, width, radius);
    ctx.lineTo(width, height - radius);
    ctx.quadraticCurveTo(width, height, width - radius, height);
    ctx.lineTo(radius, height);
    ctx.quadraticCurveTo(0, height, 0, height - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.clip();

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const scale = Math.min(width / img.width, height / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const x = (width - w) / 2;
      const y = (height - h) / 2;
      ctx.drawImage(img, x, y, w, h);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(canvas.toDataURL("image/png"));
    img.src = fgDataUrl;
  });
}

interface CaptureOpts {
  bg: string;
  padding: number;
  borderRadius: number;
  w: number;
  h: number;
  pixelRatio: number;
  transparent: boolean;
}

async function captureWithStyle(stage: HTMLDivElement, opts: CaptureOpts): Promise<string | null> {
  try {
    // 透明时先把 stage 的棋盘格背景临时去除，避免被写入 PNG
    let restore: (() => void) | null = null;
    if (opts.transparent) {
      const prev = stage.style.backgroundImage;
      stage.style.backgroundImage = "none";
      restore = () => { stage.style.backgroundImage = prev; };
    }
    // 用 html-to-image 直接截 stage 元素（包含内部 Renderer）
    const { toPng } = await import("html-to-image");
    const dataUrl = await toPng(stage, {
      width: opts.w,
      height: opts.h,
      pixelRatio: opts.pixelRatio,
      ...(opts.transparent ? {} : { backgroundColor: opts.bg }),
      cacheBust: true,
    });
    restore?.();
    return dataUrl;
  } catch (e) {
    console.error("[captureWithStyle] failed:", e);
    return null;
  }
}

function makeTextSvg(content: string, bg: string, fg: string, size: number, weight: number, radius: number): string {
  const escaped = content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80">
    <rect width="120" height="80" fill="${bg}" rx="${radius}" ry="${radius}"/>
    <text x="60" y="50" text-anchor="middle" font-size="${size}" font-weight="${weight}" font-family="system-ui, -apple-system, sans-serif" fill="${fg}">${escaped}</text>
  </svg>`;
}

function makeColorSvg(color: string, name: string, radius: number, showName: boolean): string {
  if (!showName) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80">
      <rect width="120" height="80" fill="${color}" rx="${radius}" ry="${radius}"/>
    </svg>`;
  }
  const escaped = name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80">
    <rect width="120" height="80" fill="${color}" rx="${radius}" ry="${radius}"/>
    <text x="60" y="46" text-anchor="middle" font-size="11" font-family="system-ui, -apple-system, sans-serif" fill="#ffffff" opacity="0.9">${escaped}</text>
  </svg>`;
}
