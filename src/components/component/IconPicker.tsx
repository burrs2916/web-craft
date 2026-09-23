import React, { useState, useEffect, useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import HistoryIcon from "@mui/icons-material/History";
import FolderIcon from "@mui/icons-material/Folder";
import CategoryIcon from "@mui/icons-material/Category";
import WidgetsIcon from "@mui/icons-material/Widgets";
import ExtensionIcon from "@mui/icons-material/Extension";
import SettingsIcon from "@mui/icons-material/Settings";
import DashboardIcon from "@mui/icons-material/Dashboard";
import LayersIcon from "@mui/icons-material/Layers";
import GridOnIcon from "@mui/icons-material/GridOn";
import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import RefreshIcon from "@mui/icons-material/Refresh";
import CheckIcon from "@mui/icons-material/Check";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import InfoIcon from "@mui/icons-material/Info";
import WarningIcon from "@mui/icons-material/Warning";
import ErrorIcon from "@mui/icons-material/Error";
import HelpIcon from "@mui/icons-material/Help";
import StarIcon from "@mui/icons-material/Star";
import VisibilityIcon from "@mui/icons-material/Visibility";
import CloseIcon from "@mui/icons-material/Close";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import BarChartIcon from "@mui/icons-material/BarChart";
import InsertChartIcon from "@mui/icons-material/InsertChart";
import PieChartIcon from "@mui/icons-material/PieChart";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import TimelineIcon from "@mui/icons-material/Timeline";
import BubbleChartIcon from "@mui/icons-material/BubbleChart";
import ScatterPlotIcon from "@mui/icons-material/ScatterPlot";
import DonutLargeIcon from "@mui/icons-material/DonutLarge";
import StackedBarChartIcon from "@mui/icons-material/StackedBarChart";
import WaterfallChartIcon from "@mui/icons-material/WaterfallChart";
import TableChartIcon from "@mui/icons-material/TableChart";
import SpeedIcon from "@mui/icons-material/Speed";
import MapIcon from "@mui/icons-material/Map";
import ArchitectureIcon from "@mui/icons-material/Architecture";
import WallpaperIcon from "@mui/icons-material/Wallpaper";
import WhatshotIcon from "@mui/icons-material/Whatshot";
import PublicIcon from "@mui/icons-material/Public";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import ImageIcon from "@mui/icons-material/Image";
import CropSquareIcon from "@mui/icons-material/CropSquare";
import VideocamIcon from "@mui/icons-material/Videocam";
import MusicNoteIcon from "@mui/icons-material/MusicNote";
import PaletteIcon from "@mui/icons-material/Palette";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import TimerIcon from "@mui/icons-material/Timer";
import UploadIcon from "@mui/icons-material/Upload";
import DownloadIcon from "@mui/icons-material/Download";
import { resolveIcon } from "../../editor/plugins";
import { ICON_SOURCE_PREFIX } from "../../utils/iconSource";
import { useIconStore } from "../../store/iconStore";
import { CustomIconTabs } from "./CustomIconTabs";

export const ICON_CATEGORIES: Array<{
  label: string;
  items: Array<{ key: string; label: string; Icon: React.ComponentType<any> }>;
}> = [
  {
    label: "通用",
    items: [
      { key: "folder", label: "文件夹", Icon: FolderIcon },
      { key: "category", label: "分类", Icon: CategoryIcon },
      { key: "widgets", label: "组件", Icon: WidgetsIcon },
      { key: "extension", label: "扩展", Icon: ExtensionIcon },
      { key: "settings", label: "设置", Icon: SettingsIcon },
      { key: "dashboard", label: "仪表盘", Icon: DashboardIcon },
      { key: "layers", label: "图层", Icon: LayersIcon },
      { key: "grid_on", label: "网格", Icon: GridOnIcon },
      { key: "search", label: "搜索", Icon: SearchIcon },
      { key: "add", label: "添加", Icon: AddIcon },
      { key: "edit", label: "编辑", Icon: EditIcon },
      { key: "delete", label: "删除", Icon: DeleteIcon },
      { key: "refresh", label: "刷新", Icon: RefreshIcon },
      { key: "check", label: "确认", Icon: CheckIcon },
      { key: "check_circle", label: "完成", Icon: CheckCircleIcon },
      { key: "info", label: "信息", Icon: InfoIcon },
      { key: "warning", label: "警告", Icon: WarningIcon },
      { key: "error", label: "错误", Icon: ErrorIcon },
      { key: "help", label: "帮助", Icon: HelpIcon },
      { key: "star", label: "收藏", Icon: StarIcon },
      { key: "visibility", label: "可见", Icon: VisibilityIcon },
      { key: "close", label: "关闭", Icon: CloseIcon },
      { key: "arrow_back", label: "后退", Icon: ArrowBackIcon },
      { key: "arrow_forward", label: "前进", Icon: ArrowForwardIcon },
    ],
  },
  {
    label: "数据可视化",
    items: [
      { key: "bar_chart", label: "柱状图", Icon: BarChartIcon },
      { key: "insert_chart", label: "插入图表", Icon: InsertChartIcon },
      { key: "pie_chart", label: "饼图", Icon: PieChartIcon },
      { key: "show_chart", label: "折线图", Icon: ShowChartIcon },
      { key: "timeline", label: "时间线", Icon: TimelineIcon },
      { key: "bubble_chart", label: "气泡图", Icon: BubbleChartIcon },
      { key: "scatter_plot", label: "散点图", Icon: ScatterPlotIcon },
      { key: "donut_large", label: "环形图", Icon: DonutLargeIcon },
      { key: "stacked_bar_chart", label: "堆叠图", Icon: StackedBarChartIcon },
      { key: "waterfall_chart", label: "瀑布图", Icon: WaterfallChartIcon },
      { key: "table_chart", label: "表格", Icon: TableChartIcon },
      { key: "speed", label: "仪表", Icon: SpeedIcon },
    ],
  },
  {
    label: "地图与空间",
    items: [
      { key: "map", label: "地图", Icon: MapIcon },
      { key: "architecture", label: "CAD图纸", Icon: ArchitectureIcon },
      { key: "wallpaper", label: "蓝图", Icon: WallpaperIcon },
      { key: "public", label: "地球", Icon: PublicIcon },
      { key: "whatshot", label: "热力图", Icon: WhatshotIcon },
      { key: "layers", label: "图层", Icon: LayersIcon },
      { key: "view_in_ar", label: "3D视图", Icon: ViewInArIcon },
    ],
  },
  {
    label: "媒体与内容",
    items: [
      { key: "text_fields", label: "文本", Icon: TextFieldsIcon },
      { key: "image", label: "图片", Icon: ImageIcon },
      { key: "crop_square", label: "形状", Icon: CropSquareIcon },
      { key: "videocam", label: "视频", Icon: VideocamIcon },
      { key: "music_note", label: "音乐", Icon: MusicNoteIcon },
      { key: "palette", label: "调色板", Icon: PaletteIcon },
      { key: "auto_awesome", label: "特效", Icon: AutoAwesomeIcon },
      { key: "timer", label: "计时器", Icon: TimerIcon },
    ],
  },
  {
    label: "文件与传输",
    items: [
      { key: "upload", label: "上传", Icon: UploadIcon },
      { key: "download", label: "下载", Icon: DownloadIcon },
    ],
  },
];

const EMOJI_CATEGORIES: Array<{ label: string; items: string[] }> = [
  { label: "身份认证", items: ["🔑", "🚪", "🔄", "✅", "👤", "🛡️", "🔒", "🔓", "🔐", "🔏", "📜", "🪪", "🗝️"] },
  { label: "系统工具", items: ["⚙️", "🔧", "📊", "📈", "📉", "📋", "📁", "📂", "🗂️", "📅", "📆", "⏰", "⏱️", "🔔", "📢", "📣"] },
  { label: "通信信息", items: ["📧", "💬", "📱", "💻", "🌐", "📡", "🔔", "📌", "📮", "✉️", "💌", "📨", "📤", "📥", "📫", "📪"] },
  { label: "商务机构", items: ["🏢", "🏬", "🏦", "🏪", "🏭", "🏛️", "🏠", "🏗️", "🏘️", "🏨", "🏫", "🏬", "🏭"] },
  { label: "目标用户", items: ["🎯", "👥", "👤", "👨‍💼", "👩‍💼", "👨‍💻", "👩‍💻", "👨‍🎨", "👩‍🎨", "👨‍🔬", "👩‍🔬", "👨‍🏫", "👩‍🏫", "👨‍⚕️", "👩‍⚕️", "👨‍🚀"] },
  { label: "自然物品", items: ["🌟", "⭐", "☀️", "🌤️", "⛅", "🌥️", "☁️", "🌦️", "🌧️", "⛈️", "🌩️", "🌪️", "🌫️", "🌬️", "🌀", "🌈"] },
  { label: "手势动作", items: ["👍", "👎", "👌", "✌️", "🤞", "🤟", "🤘", "🤙", "👋", "🖐️", "✋", "🖖", "👏", "🙌", "👐", "🤲"] },
];

interface IconPickerProps {
  value: string;
  onChange: (icon: string) => void;
  /** 默认值（用于"重置"按钮）— 不传则用 "folder" */
  defaultValue?: string;
  /** 隐藏顶部"图标"标题（内嵌到已有标题的表单时用） */
  hideCaption?: boolean;
}

const RECENT_KEY = "iconpicker_recent_v1";
const RECENT_MAX = 12;

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch { return []; }
}

function saveRecent(icon: string) {
  try {
    const list = loadRecent().filter((x) => x !== icon);
    list.unshift(icon);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch { /* swallow */ }
}

export function IconPicker({ value, onChange, defaultValue = "folder", hideCaption = false }: IconPickerProps) {
  const [mainTab, setMainTab] = useState(1);
  const [materialTab, setMaterialTab] = useState(0);
  const [emojiTab, setEmojiTab] = useState(0);
  const [search, setSearch] = useState("");
  const [recent, setRecent] = useState<string[]>(() => loadRecent());

  const customIcons = useIconStore((s) => s.icons);
  const iconFileUrls = useIconStore((s) => s.urls);
  const iconsLoading = useIconStore((s) => s.loading);
  const iconsLoaded = useIconStore((s) => s.loaded);
  const fetchAllIcons = useIconStore((s) => s.fetchAll);

  // 包装 onChange：写入"最近使用"
  const handleSelect = (icon: string) => {
    saveRecent(icon);
    setRecent(loadRecent());
    onChange(icon);
  };

  useEffect(() => {
    if (!iconsLoaded && !iconsLoading) {
      fetchAllIcons().catch(() => {});
    }
  }, [iconsLoaded, iconsLoading, fetchAllIcons]);

  // 搜索过滤：跨 Material/Emoji 模糊匹配
  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.trim().toLowerCase();
    const materialMatches: Array<{ key: string; label: string; Icon: React.ComponentType<any> }> = [];
    for (const cat of ICON_CATEGORIES) {
      for (const item of cat.items) {
        if (item.label.toLowerCase().includes(q) || item.key.toLowerCase().includes(q)) {
          materialMatches.push(item);
        }
      }
    }
    const emojiMatches: Array<{ emoji: string; label: string }> = [];
    for (const cat of EMOJI_CATEGORIES) {
      if (cat.label.toLowerCase().includes(q)) {
        cat.items.forEach((e) => emojiMatches.push({ emoji: e, label: cat.label }));
      } else {
        cat.items.filter((e) => e.includes(q)).forEach((e) => emojiMatches.push({ emoji: e, label: cat.label }));
      }
    }
    return { material: materialMatches, emoji: emojiMatches };
  }, [search]);

  const getDisplayName = () => {
    if (/^\p{Emoji}/u.test(value) && value.length <= 2) {
      return value;
    }
    if (value.startsWith("custom-")) {
      const icon = customIcons.find((i) => i.id === value.replace("custom-", ""));
      return icon?.name || "自定义图标";
    }
    // Strip "material:" prefix for lookup
    const searchKey = value.startsWith("material:") ? value.slice(9) : value;
    const found = ICON_CATEGORIES.flatMap((c) => c.items).find((i) => i.key === searchKey);
    return found?.label || searchKey;
  };

  const renderPreview = () => {
    if (/^\p{Emoji}/u.test(value) && value.length <= 2) {
      return <Typography sx={{ fontSize: 18 }}>{value}</Typography>;
    }
    if (value.startsWith("custom-")) {
      const iconId = value.replace("custom-", "");
      const url = iconFileUrls[iconId];
      return url ? (
        <img src={url} alt="" style={{ maxWidth: 18, maxHeight: 18 }} />
      ) : (
        <FolderIcon sx={{ fontSize: 18 }} />
      );
    }
    return resolveIcon(value, "folder", 18);
  };

  // 选中匹配函数：兼容裸值和 material: 前缀
  const isSelected = (key: string) => {
    return value === key || value === `${ICON_SOURCE_PREFIX.material}${key}`;
  };

  return (
    <Box>
      {!hideCaption && (
        <Typography variant="caption" sx={{ fontSize: 10, color: "text.secondary", mb: 0.5, display: "block" }}>
          图标
        </Typography>
      )}
      {/* 当前选中预览 + 重置（内嵌模式隐藏，外层触发行已展示） */}
      {!hideCaption && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            p: 0.75,
            borderRadius: 1,
            border: "1px solid",
            borderColor: "divider",
            mb: 1,
          }}
        >
          <Box
            sx={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: "action.hover",
              borderRadius: 0.5,
              color: "text.secondary",
              flexShrink: 0,
            }}
          >
            {renderPreview()}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" sx={{ fontSize: 11, fontWeight: 600, display: "block", lineHeight: 1.2 }}>
              {getDisplayName()}
            </Typography>
            <Typography variant="caption" sx={{ fontSize: 10, color: "text.disabled", display: "block", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {value || "未设置"}
            </Typography>
          </Box>
          {value !== defaultValue && (
            <Tooltip title="恢复默认图标">
              <IconButton size="small" onClick={() => onChange(defaultValue)} sx={{ p: 0.5 }}>
                <RestartAltIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}

      {/* 搜索框 */}
      <TextField
        size="small"
        fullWidth
        placeholder="搜索图标名称或关键词..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 1, "& .MuiInputBase-input": { fontSize: 11, py: 0.5 } }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 14, color: "text.disabled" }} />
              </InputAdornment>
            ),
            endAdornment: search ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setSearch("")} sx={{ p: 0.25 }}>
                  <CloseIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          },
        }}
      />

      {/* 搜索结果 */}
      {searchResults && (
        <Box sx={{ mb: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5 }}>
            <SearchIcon sx={{ fontSize: 11, color: "text.secondary" }} />
            <Typography variant="caption" sx={{ fontSize: 10, color: "text.secondary" }}>
              搜索结果（{searchResults.material.length + searchResults.emoji.length}）
            </Typography>
          </Box>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(8, 1fr)",
              gap: 0.5,
              maxHeight: 180,
              overflow: "auto",
            }}
          >
            {searchResults.material.map((item) => (
              <Paper
                key={`m-${item.key}`}
                elevation={0}
                onClick={() => handleSelect(`${ICON_SOURCE_PREFIX.material}${item.key}`)}
                sx={{
                  p: 0.5,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 0.25,
                  borderRadius: 0.75,
                  cursor: "pointer",
                  border: "1px solid",
                  borderColor: isSelected(item.key) ? "primary.main" : "divider",
                  bgcolor: isSelected(item.key) ? "action.selected" : "transparent",
                  color: isSelected(item.key) ? "primary.main" : "text.secondary",
                  transition: "all 0.1s",
                  "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" },
                }}
              >
                <item.Icon sx={{ fontSize: 18 }} />
                <Typography variant="caption" sx={{ fontSize: 9, lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                  {item.label}
                </Typography>
              </Paper>
            ))}
            {searchResults.emoji.map((e, idx) => (
              <Paper
                key={`e-${idx}-${e.emoji}`}
                elevation={0}
                onClick={() => handleSelect(e.emoji)}
                sx={{
                  p: 0.5,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 0.75,
                  cursor: "pointer",
                  border: "1px solid",
                  borderColor: value === e.emoji ? "primary.main" : "divider",
                  bgcolor: value === e.emoji ? "action.selected" : "transparent",
                  transition: "all 0.1s",
                  "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" },
                }}
              >
                <Typography sx={{ fontSize: "1.1rem" }}>{e.emoji}</Typography>
              </Paper>
            ))}
            {searchResults.material.length === 0 && searchResults.emoji.length === 0 && (
              <Typography variant="caption" sx={{ fontSize: 10, color: "text.disabled", gridColumn: "span 8", textAlign: "center", py: 1 }}>
                未找到匹配图标
              </Typography>
            )}
          </Box>
        </Box>
      )}

      {/* 最近使用 */}
      {!searchResults && recent.length > 0 && (
        <Box sx={{ mb: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5 }}>
            <HistoryIcon sx={{ fontSize: 11, color: "text.secondary" }} />
            <Typography variant="caption" sx={{ fontSize: 10, color: "text.secondary" }}>
              最近使用
            </Typography>
          </Box>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(8, 1fr)",
              gap: 0.5,
            }}
          >
            {recent.map((iconStr, idx) => {
              const isEmoji = /^\p{Emoji}/u.test(iconStr) && iconStr.length <= 2;
              const isCustom = iconStr.startsWith("custom-");
              const sel = value === iconStr || (iconStr.startsWith("material:") && isSelected(iconStr.slice(9)));
              const customUrl = isCustom ? iconFileUrls[iconStr.slice(7)] : null;
              return (
                <Paper
                  key={`r-${idx}`}
                  elevation={0}
                  onClick={() => handleSelect(iconStr)}
                  sx={{
                    p: 0.5,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 0.75,
                    cursor: "pointer",
                    border: "1px solid",
                    borderColor: sel ? "primary.main" : "divider",
                    bgcolor: sel ? "action.selected" : "transparent",
                    transition: "all 0.1s",
                    "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" },
                  }}
                >
                  {isEmoji ? (
                    <Typography sx={{ fontSize: "1rem" }}>{iconStr}</Typography>
                  ) : isCustom && customUrl ? (
                    <img src={customUrl} alt="" style={{ maxWidth: 16, maxHeight: 16, objectFit: "contain" }} />
                  ) : (
                    resolveIcon(iconStr, "folder", 16)
                  )}
                </Paper>
              );
            })}
          </Box>
        </Box>
      )}

      {!searchResults && (
      <Tabs
        value={mainTab}
        onChange={(_, v) => setMainTab(v)}
        variant="fullWidth"
        sx={{
          minHeight: 28,
          mb: 0.5,
          "& .MuiTab-root": { minHeight: 28, py: 0, fontSize: 11, minWidth: "auto", px: 1 },
        }}
      >
        <Tab label="Emoji" />
        <Tab label="Material" />
        <Tab label="自定义" />
      </Tabs>
      )}

      {!searchResults && mainTab === 0 && (
        <>
          <Tabs
            value={emojiTab}
            onChange={(_, v) => setEmojiTab(v)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ minHeight: 26, mb: 0.5, "& .MuiTab-root": { minHeight: 26, py: 0, fontSize: 10, minWidth: "auto", px: 0.8 } }}
          >
            {EMOJI_CATEGORIES.map((cat, idx) => (
              <Tab key={idx} label={cat.label} />
            ))}
          </Tabs>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(8, 1fr)",
              gap: 0.5,
              maxHeight: 150,
              overflow: "auto",
              "&::-webkit-scrollbar": { width: 3 },
              "&::-webkit-scrollbar-thumb": { borderRadius: 2 },
            }}
          >
            {EMOJI_CATEGORIES[emojiTab]?.items.map((emoji, idx) => {
              const sel = value === emoji;
              return (
                <Paper
                  key={idx}
                  elevation={0}
                  onClick={() => handleSelect(emoji)}
                  sx={{
                    p: 0.5,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 0.75,
                    cursor: "pointer",
                    border: "1px solid",
                    borderColor: sel ? "primary.main" : "divider",
                    bgcolor: sel ? "action.selected" : "transparent",
                    transition: "all 0.1s",
                    "&:hover": {
                      bgcolor: "action.hover",
                      borderColor: "primary.main",
                    },
                  }}
                >
                  <Typography sx={{ fontSize: "1.1rem" }}>{emoji}</Typography>
                </Paper>
              );
            })}
          </Box>
        </>
      )}

      {!searchResults && mainTab === 1 && (
        <>
          <Tabs
            value={materialTab}
            onChange={(_, v) => setMaterialTab(v)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ minHeight: 26, mb: 0.5, "& .MuiTab-root": { minHeight: 26, py: 0, fontSize: 10, minWidth: "auto", px: 0.8 } }}
          >
            {ICON_CATEGORIES.map((cat, idx) => (
              <Tab key={idx} label={cat.label} />
            ))}
          </Tabs>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(6, 1fr)",
              gap: 0.5,
              maxHeight: 150,
              overflow: "auto",
              "&::-webkit-scrollbar": { width: 3 },
              "&::-webkit-scrollbar-thumb": { borderRadius: 2 },
            }}
          >
            {ICON_CATEGORIES[materialTab]?.items.map((item) => (
              <Paper
                key={item.key}
                elevation={0}
                onClick={() => handleSelect(`${ICON_SOURCE_PREFIX.material}${item.key}`)}
                sx={{
                  p: 0.5,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 0.25,
                  borderRadius: 0.75,
                  cursor: "pointer",
                  border: "1px solid",
                  borderColor: isSelected(item.key) ? "primary.main" : "divider",
                  bgcolor: isSelected(item.key) ? "action.selected" : "transparent",
                  color: isSelected(item.key) ? "primary.main" : "text.secondary",
                  transition: "all 0.1s",
                  "&:hover": {
                    bgcolor: "action.hover",
                    borderColor: "primary.main",
                  },
                }}
              >
                <Box
                  sx={{
                    width: 24,
                    height: 24,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <item.Icon sx={{ fontSize: 18 }} />
                </Box>
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: 9,
                    textAlign: "center",
                    lineHeight: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "100%",
                  }}
                >
                  {item.label}
                </Typography>
              </Paper>
            ))}
          </Box>
        </>
      )}

      {!searchResults && mainTab === 2 && (
        <Box sx={{ maxHeight: 250, overflow: "auto", "&::-webkit-scrollbar": { width: 3 }, "&::-webkit-scrollbar-thumb": { borderRadius: 2 } }}>
          <CustomIconTabs
            iconFileUrls={iconFileUrls}
            onSelectIcon={(iconId) => handleSelect(`custom-${iconId}`)}
            selectedIconId={value.startsWith("custom-") ? value.slice(8) : null}
          />
        </Box>
      )}
    </Box>
  );
}
