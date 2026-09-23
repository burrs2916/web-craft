import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { DecorationWrapper } from "./DecorationWrapper";

export function ConnectorDecorationRenderer({ config }: ComponentRendererProps) {
  const stroke = (config.stroke as string) || "#2196F3";
  const strokeWidth = (config.strokeWidth as number) ?? 2;
  const connectorStyle = (config.connectorStyle as string) || "straight";
  const lineStyle = (config.lineStyle as string) || "solid";
  const opacity = (config.opacity as number) ?? 1;

  const dashArray =
    lineStyle === "dashed" ? "8 4"
      : lineStyle === "dotted" ? "2 4"
        : "none";

  const svgStyle = { overflow: "visible" };

  const renderConnector = () => {
    switch (connectorStyle) {
      case "elbow":
        return (
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={svgStyle}>
            <path d="M 0 10 L 50 10 L 50 90 L 100 90" stroke={stroke} strokeWidth={strokeWidth} fill="none" strokeDasharray={dashArray} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <circle cx="0" cy="10" r="3" fill={stroke} />
            <circle cx="100" cy="90" r="3" fill={stroke} />
          </svg>
        );
      case "curve":
        return (
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={svgStyle}>
            <path d="M 0 10 C 40 10, 60 90, 100 90" stroke={stroke} strokeWidth={strokeWidth} fill="none" strokeDasharray={dashArray} vectorEffect="non-scaling-stroke" />
            <circle cx="0" cy="10" r="3" fill={stroke} />
            <circle cx="100" cy="90" r="3" fill={stroke} />
          </svg>
        );
      case "step":
        return (
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={svgStyle}>
            <path d="M 0 10 L 25 10 L 25 50 L 75 50 L 75 90 L 100 90" stroke={stroke} strokeWidth={strokeWidth} fill="none" strokeDasharray={dashArray} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <circle cx="0" cy="10" r="3" fill={stroke} />
            <circle cx="100" cy="90" r="3" fill={stroke} />
          </svg>
        );
      case "straight":
      default:
        return (
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={svgStyle}>
            <line x1="0" y1="10" x2="100" y2="90" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dashArray} vectorEffect="non-scaling-stroke" />
            <circle cx="0" cy="10" r="3" fill={stroke} />
            <circle cx="100" cy="90" r="3" fill={stroke} />
          </svg>
        );
    }
  };

  return (
    <DecorationWrapper config={config}>
      <Box sx={{ width: "100%", height: "100%", opacity, overflow: "visible" }}>
        {renderConnector()}
      </Box>
    </DecorationWrapper>
  );
}
