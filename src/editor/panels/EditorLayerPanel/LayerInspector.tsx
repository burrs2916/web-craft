import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Slider from "@mui/material/Slider";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import Tooltip from "@mui/material/Tooltip";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import WallpaperIcon from "@mui/icons-material/Wallpaper";
import { LAYER_COLORS, BLEND_MODES } from "./constants";
import type { useLayerPanelState } from "./useLayerPanelState";

type LayerPanelState = ReturnType<typeof useLayerPanelState>;

/** 选中图层属性面板：重命名、颜色、透明度、混合模式、背景层、上下移动。 */
export function LayerInspector({ st }: { st: LayerPanelState }) {
  const {
    selectedLayer,
    layers,
    updateLayer,
    removeLayer,
    handleDuplicateLayer,
    handleMoveUp,
    handleMoveDown,
    setSelectedLayerId,
  } = st;

  if (!selectedLayer) return null;

  return (
    <Box
      sx={{
        px: 1,
        py: 1,
        borderTop: 1,
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        gap: 1,
        flexShrink: 0,
        maxHeight: 200,
        overflow: "auto",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <TextField
          value={selectedLayer.name}
          size="small"
          variant="standard"
          sx={{
            flex: 1,
            "& .MuiInput-input": { fontSize: 11, py: 0 },
          }}
          onChange={(e) => updateLayer(selectedLayer.id, { name: e.target.value })}
        />
        <Tooltip title="复制图层">
          <IconButton size="small" onClick={handleDuplicateLayer} sx={{ p: 0.25 }}>
            <ContentCopyIcon sx={{ fontSize: 12 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title={selectedLayer.isDefault ? "默认图层不能删除" : "删除图层"}>
          <IconButton
            size="small"
            onClick={() => {
              if (!selectedLayer.isDefault) {
                removeLayer(selectedLayer.id);
                setSelectedLayerId(null);
              }
            }}
            sx={{ p: 0.25 }}
            color="error"
            disabled={selectedLayer.isDefault}
          >
            <DeleteIcon sx={{ fontSize: 12 }} />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
        <Typography variant="caption" sx={{ fontSize: 10, color: "text.secondary", flexShrink: 0, width: 32 }}>
          颜色
        </Typography>
        <Box sx={{ display: "flex", gap: 0.25, flexWrap: "wrap" }}>
          {LAYER_COLORS.map((color) => (
            <Box
              key={color}
              sx={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                backgroundColor: color,
                cursor: "pointer",
                border: selectedLayer.color === color ? "2px solid currentColor" : "1px solid rgba(128,128,128,0.2)",
                transition: "transform 0.1s",
                "&:hover": { transform: "scale(1.2)" },
              }}
              onClick={() => updateLayer(selectedLayer.id, { color })}
            />
          ))}
        </Box>
      </Box>

      <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
        <Typography variant="caption" sx={{ fontSize: 10, color: "text.secondary", flexShrink: 0, width: 32 }}>
          透明
        </Typography>
        <Slider
          size="small"
          value={selectedLayer.opacity}
          min={0}
          max={1}
          step={0.05}
          sx={{ flex: 1, py: 0 }}
          onChange={(_, v) => updateLayer(selectedLayer.id, { opacity: v as number })}
        />
        <Typography variant="caption" sx={{ fontSize: 10, color: "text.secondary", width: 28, textAlign: "right" }}>
          {Math.round(selectedLayer.opacity * 100)}%
        </Typography>
      </Box>

      <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
        <Typography variant="caption" sx={{ fontSize: 10, color: "text.secondary", flexShrink: 0, width: 32 }}>
          混合
        </Typography>
        <FormControl size="small" sx={{ flex: 1 }}>
          <Select
            value={selectedLayer.blendMode || "normal"}
            sx={{ fontSize: 10, height: 22 }}
            onChange={(e) => updateLayer(selectedLayer.id, { blendMode: e.target.value })}
          >
            {BLEND_MODES.map((mode) => (
              <MenuItem key={mode.value} value={mode.value} sx={{ fontSize: 11 }}>
                {mode.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
        <Typography variant="caption" sx={{ fontSize: 10, color: "text.secondary", flexShrink: 0, width: 32 }}>
          背景
        </Typography>
        <Tooltip title={selectedLayer.isBackground ? "取消背景层" : "设为背景层"}>
          <IconButton
            size="small"
            sx={{
              p: 0.25,
              backgroundColor: selectedLayer.isBackground ? "primary.main" : "transparent",
              color: selectedLayer.isBackground ? "primary.contrastText" : "text.secondary",
              "&:hover": {
                backgroundColor: selectedLayer.isBackground ? "primary.dark" : "action.hover",
              },
              borderRadius: 0.5,
            }}
            onClick={() => {
              const newIsBackground = !selectedLayer.isBackground;
              if (newIsBackground) {
                const currentBgLayer = layers.find(l => l.isBackground && l.id !== selectedLayer.id);
                if (currentBgLayer) {
                  updateLayer(currentBgLayer.id, { isBackground: false, background: undefined });
                }
              }
              updateLayer(selectedLayer.id, {
                isBackground: newIsBackground,
                background: newIsBackground && !selectedLayer.background
                  ? { type: "solid", color: "#ffffff", gradient: { direction: "to-right" as const, colors: ["#ffffff", "#000000"] }, imageUrl: "", imageFit: "cover" as const, videoUrl: "", videoAutoplay: true, videoMuted: true, videoLoop: true }
                  : newIsBackground ? selectedLayer.background : undefined,
              });
            }}
          >
            <WallpaperIcon sx={{ fontSize: 12 }} />
          </IconButton>
        </Tooltip>
        {selectedLayer.isBackground && (
          <Typography variant="caption" sx={{ fontSize: 9, color: "primary.main" }}>
            背景层
          </Typography>
        )}
      </Box>

      <Box sx={{ display: "flex", gap: 0.25, justifyContent: "flex-end" }}>
        <Tooltip title="上移">
          <IconButton size="small" onClick={() => handleMoveUp(selectedLayer)} sx={{ p: 0.25 }}>
            <ArrowUpwardIcon sx={{ fontSize: 12 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="下移">
          <IconButton size="small" onClick={() => handleMoveDown(selectedLayer)} sx={{ p: 0.25 }}>
            <ArrowDownwardIcon sx={{ fontSize: 12 }} />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}