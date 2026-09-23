import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { DecorationWrapper } from "./DecorationWrapper";

export function NumberBadgeDecorationRenderer({ config }: ComponentRendererProps) {
  const stroke = (config.stroke as string) || "#2196F3";
  const fill = (config.fill as string) || "#2196F3";
  const text = (config.text as string) || "1";
  const fontSize = (config.fontSize as number) ?? 14;
  const shape = (config.shape as string) || "circle";
  const opacity = (config.opacity as number) ?? 1;

  const renderBadge = () => {
    switch (shape) {
      case "square":
        return (
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
            <rect x="15" y="15" width="70" height="70" rx="8" fill={fill} stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            <text x="50" y={50 + fontSize * 0.35} textAnchor="middle" fill="white" fontSize={fontSize} fontFamily="sans-serif" fontWeight="bold">{text}</text>
          </svg>
        );
      case "diamond":
        return (
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
            <polygon points="50,10 90,50 50,90 10,50" fill={fill} stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            <text x="50" y={50 + fontSize * 0.35} textAnchor="middle" fill="white" fontSize={fontSize} fontFamily="sans-serif" fontWeight="bold">{text}</text>
          </svg>
        );
      case "hexagon": {
        const pts = Array.from({ length: 6 }, (_, i) => {
          const angle = (Math.PI * i) / 3 - Math.PI / 2;
          return `${50 + 38 * Math.cos(angle)},${50 + 38 * Math.sin(angle)}`;
        }).join(" ");
        return (
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
            <polygon points={pts} fill={fill} stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            <text x="50" y={50 + fontSize * 0.35} textAnchor="middle" fill="white" fontSize={fontSize} fontFamily="sans-serif" fontWeight="bold">{text}</text>
          </svg>
        );
      }
      case "circle":
      default:
        return (
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
            <circle cx="50" cy="50" r="38" fill={fill} stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            <text x="50" y={50 + fontSize * 0.35} textAnchor="middle" fill="white" fontSize={fontSize} fontFamily="sans-serif" fontWeight="bold">{text}</text>
          </svg>
        );
    }
  };

  return (
    <DecorationWrapper config={config}>
      <Box sx={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", opacity }}>
        {renderBadge()}
      </Box>
    </DecorationWrapper>
  );
}
