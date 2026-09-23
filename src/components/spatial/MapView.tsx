import { useState, useMemo, useCallback } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardActions from "@mui/material/CardActions";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Divider from "@mui/material/Divider";
import Slider from "@mui/material/Slider";
import MapRoundedIcon from "@mui/icons-material/MapRounded";
import ThreeDRotationRoundedIcon from "@mui/icons-material/ThreeDRotationRounded";
import LayersRoundedIcon from "@mui/icons-material/LayersRounded";
import FullscreenRoundedIcon from "@mui/icons-material/FullscreenRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import RemoveRoundedIcon from "@mui/icons-material/RemoveRounded";
import MyLocationRoundedIcon from "@mui/icons-material/MyLocationRounded";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import ArchitectureRoundedIcon from "@mui/icons-material/ArchitectureRounded";
import ImageRoundedIcon from "@mui/icons-material/ImageRounded";
import DevicesIcon from "@mui/icons-material/Devices";
import TimelineIcon from "@mui/icons-material/Timeline";
import CheckIcon from "@mui/icons-material/Check";
import GridOnIcon from "@mui/icons-material/GridOn";
import ExploreIcon from "@mui/icons-material/Explore";
import type { MapViewProps } from "./types";
import {
  getCRSConfig,
  transformCoordinate,
  type CRSType,
} from "../../types/spatial";

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
};

function MapPlaceholder({ viewMode, layers, visibleCount, crsConfig }: {
  viewMode: string;
  layers: Array<{ id: string; name: string; type: string; dimension: string; visible: boolean; opacity?: number }>;
  visibleCount: number;
  crsConfig: ReturnType<typeof getCRSConfig>;
}) {
  const visibleLayers = layers.filter((l) => l.visible);

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 320,
        background: (theme) =>
          theme.palette.mode === "dark"
            ? "linear-gradient(135deg, #0d1b2a 0%, #1b2838 40%, #162032 100%)"
            : "linear-gradient(135deg, #e8f0fe 0%, #d4e4f7 40%, #c8ddf0 100%)",
        borderRadius: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        border: (theme) => `1px solid ${theme.palette.divider}`,
      }}
    >
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          opacity: 0.08,
          backgroundImage: (theme) =>
            theme.palette.mode === "dark"
              ? "radial-gradient(circle at 30% 40%, #4fc3f7 0%, transparent 50%), radial-gradient(circle at 70% 60%, #81c784 0%, transparent 50%)"
              : "radial-gradient(circle at 30% 40%, #1976d2 0%, transparent 50%), radial-gradient(circle at 70% 60%, #388e3c 0%, transparent 50%)",
        }}
      />

      <svg
        width="200"
        height="200"
        viewBox="0 0 200 200"
        style={{ position: "absolute", opacity: 0.06 }}
      >
        {Array.from({ length: 9 }, (_, i) => (
          <line
            key={`h${i}`}
            x1="0"
            y1={i * 25}
            x2="200"
            y2={i * 25}
            stroke="currentColor"
            strokeWidth="0.5"
          />
        ))}
        {Array.from({ length: 9 }, (_, i) => (
          <line
            key={`v${i}`}
            x1={i * 25}
            y1="0"
            x2={i * 25}
            y2="200"
            stroke="currentColor"
            strokeWidth="0.5"
          />
        ))}
      </svg>

      {viewMode === "2D" && (
        <svg
          width="180"
          height="120"
          viewBox="0 0 180 120"
          style={{ position: "absolute", opacity: 0.12 }}
        >
          <polygon
            points="30,90 60,40 90,60 120,30 150,50 150,90"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <circle cx="60" cy="40" r="3" fill="currentColor" />
          <circle cx="120" cy="30" r="3" fill="currentColor" />
          <circle cx="90" cy="60" r="2" fill="currentColor" />
        </svg>
      )}

      {viewMode === "3D" && (
        <svg
          width="160"
          height="120"
          viewBox="0 0 160 120"
          style={{ position: "absolute", opacity: 0.12 }}
        >
          <polygon points="80,10 140,50 80,90 20,50" fill="none" stroke="currentColor" strokeWidth="1" />
          <polygon points="80,30 120,55 80,80 40,55" fill="none" stroke="currentColor" strokeWidth="0.8" />
          <line x1="80" y1="10" x2="80" y2="90" stroke="currentColor" strokeWidth="0.5" />
          <line x1="20" y1="50" x2="140" y2="50" stroke="currentColor" strokeWidth="0.5" />
        </svg>
      )}

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          alignItems: "center",
          zIndex: 1,
        }}
      >
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: (theme) =>
              theme.palette.mode === "dark"
                ? "rgba(79, 195, 247, 0.12)"
                : "rgba(25, 118, 210, 0.08)",
            border: (theme) =>
              theme.palette.mode === "dark"
                ? "1px solid rgba(79, 195, 247, 0.2)"
                : "1px solid rgba(25, 118, 210, 0.15)",
          }}
        >
          {viewMode === "2D" ? (
            <MapRoundedIcon sx={{ fontSize: 32, color: "primary.main" }} />
          ) : (
            <ThreeDRotationRoundedIcon sx={{ fontSize: 32, color: "primary.main" }} />
          )}
        </Box>

        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            color: "text.primary",
            opacity: 0.8,
          }}
        >
          {viewMode} 视图 · {visibleCount}/{layers.length} 图层
        </Typography>

        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", justifyContent: "center", maxWidth: 280 }}>
          {visibleLayers.slice(0, 4).map((layer) => (
            <Chip
              key={layer.id}
              size="small"
              icon={layerTypeIcons[layer.type] as React.ReactElement}
              label={layer.name}
              variant="outlined"
              sx={{ height: 20, fontSize: "0.6rem" }}
            />
          ))}
          {visibleLayers.length > 4 && (
            <Chip
              size="small"
              label={`+${visibleLayers.length - 4}`}
              variant="outlined"
              sx={{ height: 20, fontSize: "0.6rem" }}
            />
          )}
        </Box>

        <Typography variant="caption" color="text.disabled" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <ExploreIcon sx={{ fontSize: 12 }} />
          {crsConfig.name} · {crsConfig.type === "geographic" ? "经纬度" : crsConfig.type === "projected" ? "投影" : "局部"}坐标系
        </Typography>
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
        <Chip
          size="small"
          icon={<GridOnIcon sx={{ fontSize: "12px !important" }} />}
          label={crsConfig.unit}
          sx={{
            height: 20,
            fontSize: "0.6rem",
            bgcolor: "background.paper",
            opacity: 0.8,
          }}
        />
      </Box>
    </Box>
  );
}

export default function MapView({
  title = "场景预览",
  coordinateSystem,
  layers,
  camera,
  visible = true,
  style,
  className,
  onSpatialInteract: _onSpatialInteract,
  onBoundsChange: _onBoundsChange,
  onCameraChange,
}: MapViewProps) {
  const [viewMode, setViewMode] = useState<"2D" | "3D">("2D");
  const [zoom, setZoom] = useState(camera?.zoom ?? 100);
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>(() => {
    const vis: Record<string, boolean> = {};
    layers.forEach((l) => {
      vis[l.id] = l.visible;
    });
    return vis;
  });
  const [layersAnchorEl, setLayersAnchorEl] = useState<null | HTMLElement>(null);
  const [crsAnchorEl, setCrsAnchorEl] = useState<null | HTMLElement>(null);

  const crsConfig = useMemo(() => getCRSConfig(coordinateSystem), [coordinateSystem]);

  const layers2D = useMemo(
    () => layers.filter((l) => l.dimension === "2d"),
    [layers]
  );
  const layers3D = useMemo(
    () => layers.filter((l) => l.dimension === "3d"),
    [layers]
  );
  const visibleCount = useMemo(
    () => Object.values(layerVisibility).filter(Boolean).length,
    [layerVisibility]
  );

  const mergedLayers = useMemo(
    () =>
      layers.map((l) => ({
        ...l,
        visible: layerVisibility[l.id] ?? l.visible,
      })),
    [layers, layerVisibility]
  );

  const handleViewModeChange = useCallback(
    (_event: React.MouseEvent<HTMLElement>, newViewMode: "2D" | "3D" | null) => {
      if (newViewMode !== null) {
        setViewMode(newViewMode);
      }
    },
    []
  );

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 10, 200));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 10, 50));
  }, []);

  const handleToggleLayer = useCallback((layerId: string) => {
    setLayerVisibility((prev) => ({
      ...prev,
      [layerId]: !prev[layerId],
    }));
  }, []);

  const handleCRSChange = useCallback(
    (newCRS: CRSType) => {
      if (newCRS !== coordinateSystem && camera?.center) {
        const newCenter = transformCoordinate(camera.center, coordinateSystem, newCRS);
        onCameraChange?.({
          ...camera,
          center: newCenter,
        });
      }
      setCrsAnchorEl(null);
    },
    [coordinateSystem, camera, onCameraChange]
  );

  if (!visible) return null;

  return (
    <Card
      variant="outlined"
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        transition: "all 0.2s ease-in-out",
        "&:hover": {
          borderColor: "primary.main",
          boxShadow: (theme) =>
            theme.vars
              ? `0 4px 20px rgba(${theme.vars.palette.primary.mainChannel} / 0.15)`
              : "0 4px 20px rgba(0,0,0,0.08)",
        },
      }}
      style={style}
      className={className}
    >
      <CardContent sx={{ flex: 1, display: "flex", flexDirection: "column", pb: 1 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 1.5,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 600 }}>
              {title}
            </Typography>
            <Chip
              size="small"
              label={crsConfig.name}
              color="primary"
              variant="outlined"
              onClick={(e) => setCrsAnchorEl(e.currentTarget)}
              sx={{ cursor: "pointer", height: 22, fontSize: "0.65rem" }}
            />
          </Box>
          <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
            <Chip
              size="small"
              label={`${zoom}%`}
              variant="outlined"
              sx={{ height: 22, fontSize: "0.65rem" }}
            />
            <Tooltip title="图层管理">
              <IconButton size="small" onClick={(e) => setLayersAnchorEl(e.currentTarget)}>
                <LayersRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="全屏">
              <IconButton size="small">
                <FullscreenRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        <MapPlaceholder
          viewMode={viewMode}
          layers={mergedLayers}
          visibleCount={visibleCount}
          crsConfig={crsConfig}
        />

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mt: 1.5,
          }}
        >
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={handleViewModeChange}
            size="small"
          >
            <ToggleButton value="2D" disabled={layers2D.length === 0} sx={{ px: 2 }}>
              <MapRoundedIcon sx={{ mr: 0.5 }} fontSize="small" />
              2D
            </ToggleButton>
            <ToggleButton value="3D" disabled={layers3D.length === 0} sx={{ px: 2 }}>
              <ThreeDRotationRoundedIcon sx={{ mr: 0.5 }} fontSize="small" />
              3D
            </ToggleButton>
          </ToggleButtonGroup>

          <Box sx={{ display: "flex", gap: 0.5 }}>
            <Tooltip title="缩小">
              <IconButton size="small" onClick={handleZoomOut}>
                <RemoveRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Slider
              value={zoom}
              onChange={(_, v) => setZoom(v as number)}
              min={50}
              max={200}
              size="small"
              sx={{ width: 80 }}
            />
            <Tooltip title="放大">
              <IconButton size="small" onClick={handleZoomIn}>
                <AddRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="定位">
              <IconButton size="small">
                <MyLocationRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </CardContent>

      <CardActions sx={{ justifyContent: "flex-end", px: 2, pb: 1.5, pt: 0 }}>
        <Button size="small" color="primary">
          导入场景
        </Button>
        <Button size="small" variant="contained" color="primary">
          打开编辑器
        </Button>
      </CardActions>

      <Menu
        anchorEl={layersAnchorEl}
        open={Boolean(layersAnchorEl)}
        onClose={() => setLayersAnchorEl(null)}
        slotProps={{
          paper: { sx: { maxHeight: 300, width: 260 } },
        }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            图层管理 ({visibleCount}/{layers.length})
          </Typography>
        </Box>
        <Divider />
        {layers.map((layer) => (
          <MenuItem
            key={layer.id}
            onClick={() => handleToggleLayer(layer.id)}
            sx={{ py: 0.5 }}
          >
            <ListItemIcon sx={{ minWidth: 28 }}>
              {layerVisibility[layer.id] ? (
                <VisibilityIcon fontSize="small" color="primary" />
              ) : (
                <VisibilityOffIcon fontSize="small" />
              )}
            </ListItemIcon>
            <ListItemText
              primary={
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  {layerTypeIcons[layer.type]}
                  <Typography variant="body2">{layer.name}</Typography>
                  <Chip
                    size="small"
                    label={layer.dimension.toUpperCase()}
                    sx={{ height: 16, fontSize: "0.55rem", ml: "auto" }}
                    color={layer.dimension === "3d" ? "secondary" : "default"}
                    variant="outlined"
                  />
                </Box>
              }
              secondary={
                <Typography variant="caption" color="text.secondary">
                  {layerTypeLabels[layer.type] || layer.type} · 透明度 {Math.round((layer.opacity ?? 1) * 100)}%
                </Typography>
              }
            />
          </MenuItem>
        ))}
      </Menu>

      <Menu
        anchorEl={crsAnchorEl}
        open={Boolean(crsAnchorEl)}
        onClose={() => setCrsAnchorEl(null)}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            坐标系切换
          </Typography>
        </Box>
        <Divider />
        {(["EPSG:4326", "EPSG:3857", "EPSG:4490", "local"] as CRSType[]).map((crs) => {
          const config = getCRSConfig(crs);
          return (
            <MenuItem
              key={crs}
              onClick={() => handleCRSChange(crs)}
              selected={crs === coordinateSystem}
            >
              <ListItemIcon sx={{ minWidth: 28 }}>
                {crs === coordinateSystem && <CheckIcon fontSize="small" />}
              </ListItemIcon>
              <ListItemText
                primary={config.name}
                secondary={
                  <Typography variant="caption" color="text.secondary">
                    {config.description}
                  </Typography>
                }
              />
            </MenuItem>
          );
        })}
      </Menu>
    </Card>
  );
}
