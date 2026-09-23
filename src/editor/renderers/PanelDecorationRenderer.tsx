import { useId } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { DecorationWrapper } from "./DecorationWrapper";

export function PanelDecorationRenderer({ config }: ComponentRendererProps) {
  const stroke = (config.stroke as string) || "#2196F3";
  const fill = (config.fill as string) || "rgba(33, 150, 243, 0.05)";
  const strokeWidth = (config.strokeWidth as number) ?? 1.5;
  const title = (config.title as string) || "面板";
  const fontSize = (config.fontSize as number) ?? 12;
  const cornerSize = (config.cornerSize as number) ?? 12;
  const opacity = (config.opacity as number) ?? 1;

  const uid = useId().replace(/:/g, "");
  const gradId = `panel-grad-${uid}`;

  const cs = cornerSize;
  const sw = strokeWidth / 2;
  const headerH = 20;

  return (
    <DecorationWrapper config={config}>
      <Box sx={{ width: "100%", height: "100%", opacity }}>
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.1" />
              <stop offset="50%" stopColor={stroke} stopOpacity="0.3" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0.1" />
            </linearGradient>
          </defs>
          <rect x={sw} y={sw} width={100 - sw * 2} height={100 - sw * 2} fill={fill} stroke="none" />
          <rect x={sw} y={sw} width={100 - sw * 2} height={headerH} fill={`url(#${gradId})`} stroke="none" />
          <line x1={sw} y1={headerH} x2={100 - sw} y2={headerH} stroke={stroke} strokeWidth={strokeWidth * 0.5} vectorEffect="non-scaling-stroke" />
          <path d={`M ${cs} ${sw} L ${sw} ${sw} L ${sw} ${cs}`} stroke={stroke} strokeWidth={strokeWidth * 2} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <path d={`M ${100 - cs} ${sw} L ${100 - sw} ${sw} L ${100 - sw} ${cs}`} stroke={stroke} strokeWidth={strokeWidth * 2} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <path d={`M ${sw} ${100 - cs} L ${sw} ${100 - sw} L ${cs} ${100 - sw}`} stroke={stroke} strokeWidth={strokeWidth * 2} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <path d={`M ${100 - sw} ${100 - cs} L ${100 - sw} ${100 - sw} L ${100 - cs} ${100 - sw}`} stroke={stroke} strokeWidth={strokeWidth * 2} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <text x="8" y={headerH / 2 + fontSize * 0.35} fill={stroke} fontSize={fontSize} fontFamily="sans-serif" fontWeight="bold">{title}</text>
        </svg>
      </Box>
    </DecorationWrapper>
  );
}
