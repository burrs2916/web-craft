import { useId } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { DecorationWrapper } from "./DecorationWrapper";

export function OrnamentalDividerDecorationRenderer({ config }: ComponentRendererProps) {
  const stroke = (config.stroke as string) || "#2196F3";
  const strokeWidth = (config.strokeWidth as number) ?? 2;
  const text = (config.text as string) || "";
  const style = (config.style as string) || "diamond";
  const opacity = (config.opacity as number) ?? 1;

  const uid = useId().replace(/:/g, "");
  const leftGradId = `orn-div-l-${uid}`;
  const rightGradId = `orn-div-r-${uid}`;

  const midY = 50;
  const hasText = text && text.length > 0;
  const textW = hasText ? text.length * 8 + 16 : 0;

  const sharedDefs = (
    <defs>
      <linearGradient id={leftGradId} x1="1" y1="0" x2="0" y2="0">
        <stop offset="0%" stopColor={stroke} stopOpacity="1" />
        <stop offset="100%" stopColor={stroke} stopOpacity="0" />
      </linearGradient>
      <linearGradient id={rightGradId} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={stroke} stopOpacity="1" />
        <stop offset="100%" stopColor={stroke} stopOpacity="0" />
      </linearGradient>
    </defs>
  );

  const renderDiamond = () => {
    const d = 6;
    const cx = 50;
    const leftEnd = hasText ? cx - textW / 2 : cx - d;
    const rightStart = hasText ? cx + textW / 2 : cx + d;
    return (
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ overflow: "visible" }}>
        {sharedDefs}
        <line x1="0" y1={midY} x2={leftEnd} y2={midY} stroke={`url(#${leftGradId})`} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
        <line x1={rightStart} y1={midY} x2="100" y2={midY} stroke={`url(#${rightGradId})`} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
        {!hasText && (
          <polygon points={`${cx},${midY - d} ${cx + d},${midY} ${cx},${midY + d} ${cx - d},${midY}`} fill={stroke} />
        )}
        {hasText && (
          <text x="50" y={midY + 4} textAnchor="middle" fill={stroke} fontSize="10" fontFamily="sans-serif" fontWeight="bold">{text}</text>
        )}
      </svg>
    );
  };

  const renderDot = () => {
    const cx = 50;
    const leftEnd = hasText ? cx - textW / 2 : cx - 4;
    const rightStart = hasText ? cx + textW / 2 : cx + 4;
    return (
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ overflow: "visible" }}>
        {sharedDefs}
        <line x1="0" y1={midY} x2={leftEnd} y2={midY} stroke={`url(#${leftGradId})`} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
        <line x1={rightStart} y1={midY} x2="100" y2={midY} stroke={`url(#${rightGradId})`} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
        {!hasText && <circle cx={cx} cy={midY} r={4} fill={stroke} />}
        {hasText && (
          <text x="50" y={midY + 4} textAnchor="middle" fill={stroke} fontSize="10" fontFamily="sans-serif" fontWeight="bold">{text}</text>
        )}
      </svg>
    );
  };

  const renderArrow = () => {
    const cx = 50;
    const leftEnd = hasText ? cx - textW / 2 : cx - 8;
    const rightStart = hasText ? cx + textW / 2 : cx + 8;
    return (
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ overflow: "visible" }}>
        {sharedDefs}
        <line x1="0" y1={midY} x2={leftEnd} y2={midY} stroke={`url(#${leftGradId})`} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
        <line x1={rightStart} y1={midY} x2="100" y2={midY} stroke={`url(#${rightGradId})`} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
        {!hasText && (
          <>
            <path d={`M ${cx - 6} ${midY - 5} L ${cx} ${midY} L ${cx - 6} ${midY + 5}`} stroke={stroke} strokeWidth={strokeWidth} fill="none" vectorEffect="non-scaling-stroke" />
            <path d={`M ${cx + 6} ${midY - 5} L ${cx} ${midY} L ${cx + 6} ${midY + 5}`} stroke={stroke} strokeWidth={strokeWidth} fill="none" vectorEffect="non-scaling-stroke" />
          </>
        )}
        {hasText && (
          <text x="50" y={midY + 4} textAnchor="middle" fill={stroke} fontSize="10" fontFamily="sans-serif" fontWeight="bold">{text}</text>
        )}
      </svg>
    );
  };

  return (
    <DecorationWrapper config={config}>
      <Box sx={{ width: "100%", height: "100%", opacity }}>
        {style === "dot" && renderDot()}
        {style === "arrow" && renderArrow()}
        {style === "diamond" && renderDiamond()}
      </Box>
    </DecorationWrapper>
  );
}
