import { useId } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { DecorationWrapper } from "./DecorationWrapper";

export function CircularProgressDecorationRenderer({ config }: ComponentRendererProps) {
  const stroke = (config.stroke as string) || "#2196F3";
  const trackColor = (config.trackColor as string) || "rgba(255,255,255,0.1)";
  const strokeWidth = (config.strokeWidth as number) ?? 6;
  const progress = (config.progress as number) ?? 60;
  const showLabel = (config.showLabel as boolean) ?? true;
  const label = (config.label as string) || "";
  const opacity = (config.opacity as number) ?? 1;

  const uid = useId().replace(/:/g, "");
  const gradId = `circ-prog-${uid}`;

  const p = Math.max(0, Math.min(100, progress));
  const cx = 50;
  const cy = 50;
  const r = 38;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - p / 100);

  return (
    <DecorationWrapper config={config}>
      <Box sx={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", opacity }}>
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" style={{ overflow: "visible" }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.6" />
              <stop offset="100%" stopColor={stroke} stopOpacity="1" />
            </linearGradient>
          </defs>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`}
            vectorEffect="non-scaling-stroke"
          />
          {showLabel && (
            <text x={cx} y={cy + 2} textAnchor="middle" fill={stroke} fontSize="14" fontFamily="sans-serif" fontWeight="bold">{`${p}%`}</text>
          )}
          {label && (
            <text x={cx} y={cy + 14} textAnchor="middle" fill={stroke} fontSize="7" fontFamily="sans-serif" opacity="0.7">{label}</text>
          )}
        </svg>
      </Box>
    </DecorationWrapper>
  );
}
