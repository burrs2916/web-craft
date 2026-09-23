// @ts-nocheck
import { useState, useCallback, useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Chip from "@mui/material/Chip";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Checkbox from "@mui/material/Checkbox";
import Slider from "@mui/material/Slider";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import LayersIcon from "@mui/icons-material/Layers";
import MapRoundedIcon from "@mui/icons-material/MapRounded";
import ThreeDRotationRoundedIcon from "@mui/icons-material/ThreeDRotationRounded";
import ArchitectureRoundedIcon from "@mui/icons-material/ArchitectureRounded";
import ImageRoundedIcon from "@mui/icons-material/ImageRounded";
import DevicesIcon from "@mui/icons-material/Devices";
import TimelineIcon from "@mui/icons-material/Timeline";
import FullscreenRoundedIcon from "@mui/icons-material/FullscreenRounded";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import type { SceneCanvasProps } from "./types";
import type { SceneLayer } from "../../types/scene";
import { createDefaultSceneLayer } from "../../types/scene";
import { getCRSConfig } from "../../types/spatial";

const layerTypeIcons: Record<string, React.ReactNode> = {
  tile: <MapRoundedIcon fontSize="small" />,
  vector: <MapRoundedIcon fontSize="small" />,
  geojson: <MapRoundedIcon fontSize="small" />,
  cad: <ArchitectureRoundedIcon fontSize="small" />,
  image: <ImageRoundedIcon fontSize="small" />,
  "3d-model": <ThreeDRotationRoundedIcon fontSize="small" />,
  devices: <DevicesIcon fontSize="small" />,
  topology: <TimelineIcon fontSize="small" />,
  heatmap: <TimelineIcon fontSize="small" />,
  chart: <TimelineIcon fontSize="small" />,
  metric: <TimelineIcon fontSize="small" />,
  table: <TimelineIcon fontSize="small" />,
  text: <TimelineIcon fontSize="small" />,
  video: <TimelineIcon fontSize="small" />,
};

const layerTypeLabels: Record<string, string> = {
  tile: "瓦片地图",
  vector: "矢量数据",
  geojson: "GeoJSON",
  cad: "工程图纸",
  image: "图片叠加",
  "3d-model": "三维模型",
  devices: "设备标注",
  topology: "拓扑网络",
  heatmap: "热力图",
  chart: "图表",
  metric: "指标",
  table: "表格",
  text: "文本",
  video: "视频",
};

export default function SceneCanvas({
  scene,
  title,
  visible = true,
  style,
  className,
  editable = true,
  onLayerAdd,
  onLayerUpdate,
  onLayerRemove,
  onLayerReorder: _onLayerReorder,
}: SceneCanvasProps) {
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"2D" | "3D" | "mixed">("mixed");
  const [sidebarOpen] = useState(true);

  const layers2D = useMemo(
    () => scene.layers.filter((l) => l.dimension === "2d"),
    [scene.layers]
  );
  const layers3D = useMemo(
    () => scene.layers.filter((l) => l.dimension === "3d"),
    [scene.layers]
  );
  const visibleLayers = useMemo(
    () => scene.layers.filter((l) => l.visible),
    [scene.layers]
  );

  const selectedLayer = useMemo(
    () => scene.layers.find((l) => l.id === selectedLayerId) || null,
    [scene.layers, selectedLayerId]
  );

  const crsConfig = getCRSConfig(scene.coordinateSystem);

  const handleToggleVisibility = useCallback(
    (layer: SceneLayer) => {
      onLayerUpdate?.(layer.id, { visible: !layer.visible });
    },
    [onLayerUpdate]
  );

  const handleOpacityChange = useCallback(
    (layerId: string, opacity: number) => {
      onLayerUpdate?.(layerId, { opacity });
    },
    [onLayerUpdate]
  );

  const handleDeleteLayer = useCallback(
    (layerId: string) => {
      onLayerRemove?.(layerId);
      if (selectedLayerId === layerId) {
        setSelectedLayerId(null);
      }
    },
    [onLayerRemove, selectedLayerId]
  );

  const handleAddLayer = useCallback(() => {
    const newLayer = createDefaultSceneLayer({
      name: `图层 ${scene.layers.length + 1}`,
      zIndex: scene.layers.length,
    });
    onLayerAdd?.(newLayer);
  }, [onLayerAdd, scene.layers.length]);

  if (!visible) return null;

  return (
    <Paper
      sx={{ height: "100%", display: "flex", flexDirection: "column" }}
      style={style}
      className={className}
    >
      <Box
        sx={{
          p: 1.5,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <LayersIcon fontSize="small" />
          <Typography variant="subtitle2">
            {title || scene.name}
          </Typography>
          <Chip
            size="small"
            label={crsConfig.name}
            color="primary"
            variant="outlined"
            sx={{ height: 20, fontSize: "0.65rem" }}
          />
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, mode) => mode && setViewMode(mode)}
            size="small"
          >
            <ToggleButton value="2D" disabled={layers2D.length === 0} sx={{ py: 0.3, px: 1 }}>
              <MapRoundedIcon sx={{ fontSize: 14, mr: 0.3 }} /> 2D
            </ToggleButton>
            <ToggleButton value="3D" disabled={layers3D.length === 0} sx={{ py: 0.3, px: 1 }}>
              <ThreeDRotationRoundedIcon sx={{ fontSize: 14, mr: 0.3 }} /> 3D
            </ToggleButton>
            <ToggleButton value="mixed" sx={{ py: 0.3, px: 1 }}>
              混合
            </ToggleButton>
          </ToggleButtonGroup>

          <Tooltip title="全屏">
            <IconButton size="small">
              <FullscreenRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Box sx={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <Box
          sx={{
            flex: 1,
            position: "relative",
            backgroundColor: (theme) =>
              theme.vars
                ? `rgba(${theme.vars.palette.background.defaultChannel} / 0.8)`
                : "action.hover",
          }}
        >
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Box sx={{ textAlign: "center", color: "text.secondary" }}>
              {viewMode === "3D" ? (
                <ThreeDRotationRoundedIcon sx={{ fontSize: 72, opacity: 0.2 }} />
              ) : (
                <MapRoundedIcon sx={{ fontSize: 72, opacity: 0.2 }} />
              )}
              <Typography variant="body2" sx={{ mt: 1 }}>
                {viewMode === "mixed"
                  ? `2D/3D 混合视图 · ${visibleLayers.length}/${scene.layers.length} 图层`
                  : `${viewMode} 视图 · ${viewMode === "2D" ? layers2D.filter((l) => l.visible).length : layers3D.filter((l) => l.visible).length} 可见图层`}
              </Typography>
              <Typography variant="caption" color="text.disabled">
                坐标系: {crsConfig.name} ({crsConfig.type})
              </Typography>
            </Box>
          </Box>

          <Box
            sx={{
              position: "absolute",
              bottom: 8,
              left: 8,
              display: "flex",
              gap: 0.5,
            }}
          >
            {layers2D.length > 0 && (
              <Chip
                size="small"
                icon={<MapRoundedIcon />}
                label={`2D: ${layers2D.filter((l) => l.visible).length}/${layers2D.length}`}
                variant="outlined"
                sx={{ height: 22, fontSize: "0.65rem" }}
              />
            )}
            {layers3D.length > 0 && (
              <Chip
                size="small"
                icon={<ThreeDRotationRoundedIcon />}
                label={`3D: ${layers3D.filter((l) => l.visible).length}/${layers3D.length}`}
                variant="outlined"
                sx={{ height: 22, fontSize: "0.65rem" }}
              />
            )}
          </Box>
        </Box>

        {sidebarOpen && (
          <Box
            sx={{
              width: 260,
              borderLeft: 1,
              borderColor: "divider",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <Box
              sx={{
                p: 1,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Typography variant="caption" color="text.secondary">
                图层管理 ({scene.layers.length})
              </Typography>
              {editable && (
                <IconButton size="small" onClick={handleAddLayer}>
                  <AddIcon fontSize="small" />
                </IconButton>
              )}
            </Box>

            <Divider />

            <List dense sx={{ flex: 1, overflow: "auto", py: 0 }}>
              {scene.layers.map((layer) => (
                <ListItem
                  key={layer.id}
                  disablePadding
                  secondaryAction={
                    editable && (
                      <IconButton
                        size="small"
                        edge="end"
                        onClick={() => handleDeleteLayer(layer.id)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    )
                  }
                >
                  <ListItemButton
                    selected={selectedLayerId === layer.id}
                    onClick={() =>
                      setSelectedLayerId(
                        selectedLayerId === layer.id ? null : layer.id
                      )
                    }
                    sx={{ pr: 6 }}
                  >
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <Checkbox
                        size="small"
                        checked={layer.visible}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => handleToggleVisibility(layer)}
                        icon={<VisibilityOffIcon fontSize="small" />}
                        checkedIcon={<VisibilityIcon fontSize="small" />}
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                          {layerTypeIcons[layer.type]}
                          <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
                            {layer.name}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <Typography variant="caption" color="text.secondary">
                          {layerTypeLabels[layer.type] || layer.type} · {layer.dimension.toUpperCase()}
                        </Typography>
                      }
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>

            {selectedLayer && (
              <>
                <Divider />
                <Box sx={{ p: 1.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
                    图层属性
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {selectedLayer.name}
                  </Typography>
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      透明度: {Math.round((selectedLayer.opacity ?? 1) * 100)}%
                    </Typography>
                    <Slider
                      size="small"
                      value={Math.round((selectedLayer.opacity ?? 1) * 100)}
                      onChange={(_, value) =>
                        handleOpacityChange(selectedLayer.id, (value as number) / 100)
                      }
                      min={0}
                      max={100}
                    />
                  </Box>
                </Box>
              </>
            )}
          </Box>
        )}
      </Box>
    </Paper>
  );
}
