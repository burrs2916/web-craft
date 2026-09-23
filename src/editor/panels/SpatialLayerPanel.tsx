import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import LayersIcon from "@mui/icons-material/Layers";
import { useSpatialLayers } from "../hooks/useSpatialLayers";
import { useLayerRegistry } from "../context/SceneEditorContext";
import type { SpatialLayer } from "../layers/SpatialLayer";

function getLayerTypeLabel(type: SpatialLayer["type"]): string {
  switch (type) {
    case "spatial": return "空间";
    case "overlay": return "叠加";
    case "widget": return "组件";
    default: return type;
  }
}

function getLayerTypeIcon(type: SpatialLayer["type"]): string {
  switch (type) {
    case "spatial": return "🗺️";
    case "overlay": return "📐";
    case "widget": return "📊";
    default: return "📄";
  }
}

export function SpatialLayerPanel() {
  const { layers } = useSpatialLayers();
  const layerRegistry = useLayerRegistry();

  const toggleVisibility = (layerId: string, currentVisible: boolean) => {
    layerRegistry?.setLayerVisibility(layerId, !currentVisible);
  };

  if (layers.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: "center", color: "text.disabled" }}>
        <LayersIcon sx={{ fontSize: 32, mb: 1, opacity: 0.5 }} />
        <Typography variant="caption" sx={{ display: "block" }}>
          暂无空间图层
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ py: 0.5 }}>
      {layers.map((layer) => (
        <Box
          key={layer.id}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            px: 1.5,
            py: 0.5,
            "&:hover": { backgroundColor: "action.hover" },
            opacity: layer.visible ? 1 : 0.5,
          }}
        >
          <Typography variant="body2" sx={{ fontSize: 12, width: 20, textAlign: "center" }}>
            {getLayerTypeIcon(layer.type)}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              flex: 1,
              fontSize: 12,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {layer.name}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              fontSize: 10,
              color: "text.secondary",
              px: 0.5,
              border: 1,
              borderColor: "divider",
              borderRadius: 0.5,
            }}
          >
            {getLayerTypeLabel(layer.type)}
          </Typography>
          <Typography
            variant="caption"
            sx={{ fontSize: 10, color: "text.secondary", minWidth: 20, textAlign: "center" }}
          >
            z:{layer.zIndex}
          </Typography>
          <Tooltip title={layer.visible ? "隐藏" : "显示"}>
            <IconButton
              size="small"
              sx={{ p: 0.25 }}
              onClick={() => toggleVisibility(layer.id, layer.visible)}
            >
              {layer.visible ? (
                <VisibilityIcon sx={{ fontSize: 14 }} />
              ) : (
                <VisibilityOffIcon sx={{ fontSize: 14 }} />
              )}
            </IconButton>
          </Tooltip>
        </Box>
      ))}
    </Box>
  );
}
