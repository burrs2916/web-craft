import { useState, useCallback } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import type { SpatialCoordinate } from "../../types/spatial";
import type { TransformParams } from "./coordinate/TransformCalculator";

export interface DeviceMarker {
  id: string;
  name: string;
  type: "sensor" | "actuator" | "camera" | "gateway" | "controller" | "other";
  cadCoordinate: SpatialCoordinate;
  status: "online" | "offline" | "warning" | "error";
  data?: Record<string, unknown>;
  icon?: string;
}

export interface DeviceOverlayProps {
  devices: DeviceMarker[];
  transformParams: TransformParams | null;
  containerBounds: DOMRect | null;
  cadToScreen: (cadCoord: SpatialCoordinate) => { x: number; y: number } | null;
  onDeviceClick?: (device: DeviceMarker) => void;
  onDeviceHover?: (device: DeviceMarker | null) => void;
  showLabels?: boolean;
  markerSize?: number;
}

const STATUS_COLORS: Record<DeviceMarker["status"], string> = {
  online: "#4caf50",
  offline: "#9e9e9e",
  warning: "#ff9800",
  error: "#f44336",
};

const TYPE_ICONS: Record<DeviceMarker["type"], string> = {
  sensor: "📡",
  actuator: "⚙️",
  camera: "📹",
  gateway: "🌐",
  controller: "🎮",
  other: "📍",
};

export function DeviceOverlay({
  devices,
  transformParams: _transformParams,
  containerBounds,
  cadToScreen,
  onDeviceClick,
  onDeviceHover,
  showLabels = true,
  markerSize = 24,
}: DeviceOverlayProps) {
  const [hoveredDeviceId, setHoveredDeviceId] = useState<string | null>(null);

  const getDeviceScreenPos = useCallback(
    (device: DeviceMarker): { x: number; y: number } | null => {
      return cadToScreen(device.cadCoordinate);
    },
    [cadToScreen]
  );

  return (
    <Box
      sx={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 15,
      }}
    >
      {devices.map((device) => {
        const screenPos = getDeviceScreenPos(device);
        if (!screenPos || !containerBounds) return null;

        const isHovered = hoveredDeviceId === device.id;
        const statusColor = STATUS_COLORS[device.status];
        const typeIcon = device.icon || TYPE_ICONS[device.type];

        return (
          <Box
            key={device.id}
            sx={{
              position: "absolute",
              left: screenPos.x - markerSize / 2,
              top: screenPos.y - markerSize / 2,
              width: markerSize,
              height: markerSize,
              pointerEvents: "auto",
              cursor: "pointer",
              transition: "transform 0.15s ease",
              transform: isHovered ? "scale(1.3)" : "scale(1)",
              zIndex: isHovered ? 20 : 15,
            }}
            onMouseEnter={() => {
              setHoveredDeviceId(device.id);
              onDeviceHover?.(device);
            }}
            onMouseLeave={() => {
              setHoveredDeviceId(null);
              onDeviceHover?.(null);
            }}
            onClick={() => onDeviceClick?.(device)}
          >
            <Tooltip
              title={
                <Box sx={{ p: 0.5 }}>
                  <Typography variant="caption" sx={{ fontWeight: "bold" }}>
                    {device.name}
                  </Typography>
                  <br />
                  <Typography variant="caption" sx={{ color: statusColor }}>
                    {device.status.toUpperCase()}
                  </Typography>
                  <br />
                  <Typography variant="caption">
                    CAD: ({device.cadCoordinate.x.toFixed(1)}, {device.cadCoordinate.y.toFixed(1)})
                  </Typography>
                </Box>
              }
              arrow
              placement="top"
            >
              <Box
                sx={{
                  width: "100%",
                  height: "100%",
                  borderRadius: "50%",
                  backgroundColor: `${statusColor}cc`,
                  border: `2px solid ${statusColor}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: markerSize * 0.5,
                  boxShadow: `0 0 8px ${statusColor}66`,
                  animation: device.status === "error" ? "pulse 1.5s infinite" : "none",
                  "@keyframes pulse": {
                    "0%": { boxShadow: `0 0 4px ${statusColor}66` },
                    "50%": { boxShadow: `0 0 16px ${statusColor}cc` },
                    "100%": { boxShadow: `0 0 4px ${statusColor}66` },
                  },
                }}
              >
                {typeIcon}
              </Box>
            </Tooltip>

            {showLabels && (
              <Typography
                variant="caption"
                sx={{
                  position: "absolute",
                  top: markerSize + 2,
                  left: "50%",
                  transform: "translateX(-50%)",
                  whiteSpace: "nowrap",
                  color: "rgba(255,255,255,0.8)",
                  backgroundColor: "rgba(0,0,0,0.6)",
                  px: 0.5,
                  borderRadius: 0.25,
                  fontSize: 10,
                  pointerEvents: "none",
                }}
              >
                {device.name}
              </Typography>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
