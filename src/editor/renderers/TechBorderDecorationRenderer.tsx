import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { DecorationWrapper } from "./DecorationWrapper";

export function TechBorderDecorationRenderer({ config }: ComponentRendererProps) {
  const stroke = (config.stroke as string) || "#2196F3";
  const fill = (config.fill as string) || "rgba(33, 150, 243, 0.05)";
  const strokeWidth = (config.strokeWidth as number) ?? 1.5;
  const cornerSize = (config.cornerSize as number) ?? 15;
  const style = (config.style as string) || "corner";
  const opacity = (config.opacity as number) ?? 1;

  const cs = cornerSize;
  const sw = strokeWidth / 2;

  const renderCorner = () => (
    <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
      <rect x={sw} y={sw} width={100 - sw * 2} height={100 - sw * 2} fill={fill} stroke="none" />
      <path d={`M ${cs} ${sw} L ${sw} ${sw} L ${sw} ${cs}`} stroke={stroke} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <path d={`M ${100 - cs} ${sw} L ${100 - sw} ${sw} L ${100 - sw} ${cs}`} stroke={stroke} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <path d={`M ${sw} ${100 - cs} L ${sw} ${100 - sw} L ${cs} ${100 - sw}`} stroke={stroke} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <path d={`M ${100 - sw} ${100 - cs} L ${100 - sw} ${100 - sw} L ${100 - cs} ${100 - sw}`} stroke={stroke} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );

  const renderFull = () => (
    <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
      <rect x={sw} y={sw} width={100 - sw * 2} height={100 - sw * 2} fill={fill} stroke={stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
      <path d={`M ${cs} ${sw} L ${sw} ${sw} L ${sw} ${cs}`} stroke={stroke} strokeWidth={strokeWidth * 2.5} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <path d={`M ${100 - cs} ${sw} L ${100 - sw} ${sw} L ${100 - sw} ${cs}`} stroke={stroke} strokeWidth={strokeWidth * 2.5} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <path d={`M ${sw} ${100 - cs} L ${sw} ${100 - sw} L ${cs} ${100 - sw}`} stroke={stroke} strokeWidth={strokeWidth * 2.5} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <path d={`M ${100 - sw} ${100 - cs} L ${100 - sw} ${100 - sw} L ${100 - cs} ${100 - sw}`} stroke={stroke} strokeWidth={strokeWidth * 2.5} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );

  const renderDouble = () => {
    const gap = 4;
    return (
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <rect x={sw} y={sw} width={100 - sw * 2} height={100 - sw * 2} fill={fill} stroke="none" />
        <rect x={sw + gap} y={sw + gap} width={100 - (sw + gap) * 2} height={100 - (sw + gap) * 2} fill="none" stroke={stroke} strokeWidth={strokeWidth * 0.7} vectorEffect="non-scaling-stroke" />
        <path d={`M ${cs} ${sw} L ${sw} ${sw} L ${sw} ${cs}`} stroke={stroke} strokeWidth={strokeWidth * 2} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path d={`M ${100 - cs} ${sw} L ${100 - sw} ${sw} L ${100 - sw} ${cs}`} stroke={stroke} strokeWidth={strokeWidth * 2} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path d={`M ${sw} ${100 - cs} L ${sw} ${100 - sw} L ${cs} ${100 - sw}`} stroke={stroke} strokeWidth={strokeWidth * 2} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path d={`M ${100 - sw} ${100 - cs} L ${100 - sw} ${100 - sw} L ${100 - cs} ${100 - sw}`} stroke={stroke} strokeWidth={strokeWidth * 2} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    );
  };

  return (
    <DecorationWrapper config={config}>
      <Box sx={{ width: "100%", height: "100%", opacity }}>
        {style === "full" && renderFull()}
        {style === "double" && renderDouble()}
        {style === "corner" && renderCorner()}
      </Box>
    </DecorationWrapper>
  );
}
