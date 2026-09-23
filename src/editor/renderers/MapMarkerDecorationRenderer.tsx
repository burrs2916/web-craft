import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { DecorationWrapper } from "./DecorationWrapper";

export function MapMarkerDecorationRenderer({ config }: ComponentRendererProps) {
  const stroke = (config.stroke as string) || "#F44336";
  const fill = (config.fill as string) || "#F44336";
  const strokeWidth = (config.strokeWidth as number) ?? 1.5;
  const markerStyle = (config.markerStyle as string) || "pin";
  const label = (config.label as string) || "";
  const fontSize = (config.fontSize as number) ?? 10;
  const opacity = (config.opacity as number) ?? 1;

  const renderMarker = () => {
    switch (markerStyle) {
      case "diamond":
        return (
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
            <polygon points="50,8 75,40 50,72 25,40" fill={fill} stroke={stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
            <circle cx="50" cy="40" r="8" fill="white" opacity="0.9" />
            {label && <text x="50" y={40 + fontSize * 0.35} textAnchor="middle" fill={stroke} fontSize={fontSize} fontFamily="sans-serif" fontWeight="bold">{label}</text>}
          </svg>
        );
      case "circle":
        return (
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
            <circle cx="50" cy="40" r="25" fill={fill} stroke={stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
            <circle cx="50" cy="40" r="8" fill="white" opacity="0.9" />
            {label && <text x="50" y={40 + fontSize * 0.35} textAnchor="middle" fill="white" fontSize={fontSize} fontFamily="sans-serif" fontWeight="bold">{label}</text>}
          </svg>
        );
      case "pin":
      default:
        return (
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
            <path d="M 50 90 C 50 90, 25 55, 25 40 C 25 26, 36 15, 50 15 C 64 15, 75 26, 75 40 C 75 55, 50 90, 50 90 Z" fill={fill} stroke={stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
            <circle cx="50" cy="40" r="10" fill="white" opacity="0.9" />
            {label && <text x="50" y={40 + fontSize * 0.35} textAnchor="middle" fill={stroke} fontSize={fontSize} fontFamily="sans-serif" fontWeight="bold">{label}</text>}
          </svg>
        );
    }
  };

  return (
    <DecorationWrapper config={config}>
      <Box sx={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", opacity }}>
        {renderMarker()}
      </Box>
    </DecorationWrapper>
  );
}
