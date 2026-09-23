import { useEffect, useRef } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { DecorationWrapper } from "./DecorationWrapper";

export function BadgeDecorationRenderer({ config, onConfigChange }: ComponentRendererProps) {
  const stroke = (config.stroke as string) || "#2196F3";
  const fill = (config.fill as string) || "rgba(33, 150, 243, 0.2)";
  const text = (config.text as string) || "标签";
  const fontSize = (config.fontSize as number) ?? 11;
  const style = (config.style as string) || "rounded";
  const opacity = (config.opacity as number) ?? 1;

  const autoFitH = Math.ceil(fontSize * 1.8 + 8);

  const lastReportedH = useRef(0);
  useEffect(() => {
    if (!onConfigChange) return;
    if (autoFitH !== lastReportedH.current) {
      lastReportedH.current = autoFitH;
      onConfigChange("_autoFitSize", { height: autoFitH });
    }
  }, [autoFitH, onConfigChange]);

  const renderBadge = () => {
    switch (style) {
      case "sharp":
        return (
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            <rect x="5" y="25" width="90" height="50" fill={fill} stroke={stroke} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            <text x="50" y={50 + fontSize * 0.35} textAnchor="middle" fill={stroke} fontSize={fontSize} fontFamily="sans-serif" fontWeight="bold">{text}</text>
          </svg>
        );
      case "pill":
        return (
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            <rect x="5" y="25" width="90" height="50" rx="25" ry="25" fill={fill} stroke={stroke} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            <text x="50" y={50 + fontSize * 0.35} textAnchor="middle" fill={stroke} fontSize={fontSize} fontFamily="sans-serif" fontWeight="bold">{text}</text>
          </svg>
        );
      case "tag":
        return (
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d="M 10 25 L 85 25 L 95 50 L 85 75 L 10 75 Z" fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <circle cx="20" cy="50" r="4" fill={stroke} />
            <text x="55" y={50 + fontSize * 0.35} textAnchor="middle" fill={stroke} fontSize={fontSize} fontFamily="sans-serif" fontWeight="bold">{text}</text>
          </svg>
        );
      case "rounded":
      default:
        return (
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            <rect x="5" y="25" width="90" height="50" rx="8" ry="8" fill={fill} stroke={stroke} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            <text x="50" y={50 + fontSize * 0.35} textAnchor="middle" fill={stroke} fontSize={fontSize} fontFamily="sans-serif" fontWeight="bold">{text}</text>
          </svg>
        );
    }
  };

  return (
    <DecorationWrapper config={config}>
      <Box sx={{ width: "100%", height: "100%", opacity }}>
        {renderBadge()}
      </Box>
    </DecorationWrapper>
  );
}
