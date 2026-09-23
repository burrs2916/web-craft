import { useId } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { DecorationWrapper } from "./DecorationWrapper";

export function MetricCardDecorationRenderer({ config }: ComponentRendererProps) {
  const stroke = (config.stroke as string) || "#2196F3";
  const fill = (config.fill as string) || "rgba(33, 150, 243, 0.08)";
  const strokeWidth = (config.strokeWidth as number) ?? 1;
  const value = (config.value as string) || "1,234";
  const label = (config.label as string) || "指标名称";
  const unit = (config.unit as string) || "";
  const valueSize = (config.valueSize as number) ?? 28;
  const labelSize = (config.labelSize as number) ?? 10;
  const trend = (config.trend as string) || "none";
  const opacity = (config.opacity as number) ?? 1;

  const uid = useId().replace(/:/g, "");
  const gradId = `metric-grad-${uid}`;

  const sw = strokeWidth / 2;

  const trendPath = trend === "up"
    ? "M 88 55 L 92 48 L 96 55"
    : trend === "down"
      ? "M 88 48 L 92 55 L 96 48"
      : "";

  const trendColor = trend === "up" ? "#4CAF50" : trend === "down" ? "#F44336" : stroke;

  return (
    <DecorationWrapper config={config}>
      <Box sx={{ width: "100%", height: "100%", opacity }}>
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.15" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <rect x={sw} y={sw} width={100 - sw * 2} height={100 - sw * 2} rx="3" ry="3" fill={fill} stroke={stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
          <rect x={sw} y={sw} width={4} height={100 - sw * 2} rx="2" fill={stroke} />
          <text x="50" y="55" textAnchor="middle" fill={stroke} fontSize={valueSize} fontFamily="sans-serif" fontWeight="bold">{value}</text>
          {unit && <text x="50" y={55 + valueSize * 0.5} textAnchor="middle" fill={stroke} fontSize={labelSize + 2} fontFamily="sans-serif" opacity="0.7">{unit}</text>}
          <text x="50" y="82" textAnchor="middle" fill={stroke} fontSize={labelSize} fontFamily="sans-serif" opacity="0.6">{label}</text>
          {trend !== "none" && trendPath && (
            <path d={trendPath} stroke={trendColor} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
      </Box>
    </DecorationWrapper>
  );
}
