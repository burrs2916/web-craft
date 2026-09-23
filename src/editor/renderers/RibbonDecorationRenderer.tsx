import { useId } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { DecorationWrapper } from "./DecorationWrapper";

export function RibbonDecorationRenderer({ config }: ComponentRendererProps) {
  const stroke = (config.stroke as string) || "#2196F3";
  const fill = (config.fill as string) || "#2196F3";
  const text = (config.text as string) || "标签";
  const fontSize = (config.fontSize as number) ?? 11;
  const position = (config.position as string) || "top-left";
  const opacity = (config.opacity as number) ?? 1;

  const uid = useId().replace(/:/g, "");
  const gradId = `ribbon-${uid}`;

  const renderRibbon = () => {
    switch (position) {
      case "top-right":
        return (
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={fill} stopOpacity="0.8" />
                <stop offset="100%" stopColor={fill} stopOpacity="1" />
              </linearGradient>
            </defs>
            <path d="M 55 0 L 100 0 L 100 30 L 55 30 L 62 15 Z" fill={`url(#${gradId})`} stroke={stroke} strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <text x="77" y={15 + fontSize * 0.35} textAnchor="middle" fill="white" fontSize={fontSize} fontFamily="sans-serif" fontWeight="bold">{text}</text>
          </svg>
        );
      case "bottom-left":
        return (
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <linearGradient id={gradId} x1="1" y1="0" x2="0" y2="0">
                <stop offset="0%" stopColor={fill} stopOpacity="0.8" />
                <stop offset="100%" stopColor={fill} stopOpacity="1" />
              </linearGradient>
            </defs>
            <path d="M 0 70 L 45 70 L 38 85 L 45 100 L 0 100 Z" fill={`url(#${gradId})`} stroke={stroke} strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <text x="22" y={85 + fontSize * 0.35} textAnchor="middle" fill="white" fontSize={fontSize} fontFamily="sans-serif" fontWeight="bold">{text}</text>
          </svg>
        );
      case "bottom-right":
        return (
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={fill} stopOpacity="0.8" />
                <stop offset="100%" stopColor={fill} stopOpacity="1" />
              </linearGradient>
            </defs>
            <path d="M 55 70 L 100 70 L 100 100 L 55 100 L 62 85 Z" fill={`url(#${gradId})`} stroke={stroke} strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <text x="77" y={85 + fontSize * 0.35} textAnchor="middle" fill="white" fontSize={fontSize} fontFamily="sans-serif" fontWeight="bold">{text}</text>
          </svg>
        );
      case "top-left":
      default:
        return (
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <linearGradient id={gradId} x1="1" y1="0" x2="0" y2="0">
                <stop offset="0%" stopColor={fill} stopOpacity="0.8" />
                <stop offset="100%" stopColor={fill} stopOpacity="1" />
              </linearGradient>
            </defs>
            <path d="M 0 0 L 45 0 L 38 15 L 45 30 L 0 30 Z" fill={`url(#${gradId})`} stroke={stroke} strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <text x="22" y={15 + fontSize * 0.35} textAnchor="middle" fill="white" fontSize={fontSize} fontFamily="sans-serif" fontWeight="bold">{text}</text>
          </svg>
        );
    }
  };

  return (
    <DecorationWrapper config={config}>
      <Box sx={{ width: "100%", height: "100%", opacity, overflow: "visible" }}>
        {renderRibbon()}
      </Box>
    </DecorationWrapper>
  );
}
