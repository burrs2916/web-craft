import { useEffect, useRef } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { DecorationWrapper } from "./DecorationWrapper";

export function TimelineDecorationRenderer({ config, onConfigChange }: ComponentRendererProps) {
  const stroke = (config.stroke as string) || "#2196F3";
  const strokeWidth = (config.strokeWidth as number) ?? 2;
  const nodeCount = (config.nodeCount as number) ?? 3;
  const direction = (config.direction as string) || "horizontal";
  const nodeStyle = (config.nodeStyle as string) || "circle";
  const opacity = (config.opacity as number) ?? 1;

  const count = Math.max(2, Math.min(8, nodeCount));
  const svgStyle = { overflow: "visible" };

  const nodeRadius = nodeStyle === "diamond" ? 5 : nodeStyle === "square" ? 4 : 4;
  const isVertical = direction === "vertical";
  const autoFitH = isVertical ? undefined : Math.ceil(nodeRadius * 2 + strokeWidth + 4);
  const autoFitW = isVertical ? Math.ceil(nodeRadius * 2 + strokeWidth + 4) : undefined;

  const lastReported = useRef({ h: 0, w: 0 });
  useEffect(() => {
    if (!onConfigChange) return;
    const size: { width?: number; height?: number } = {};
    if (autoFitH != null && autoFitH !== lastReported.current.h) {
      lastReported.current.h = autoFitH;
      size.height = autoFitH;
    }
    if (autoFitW != null && autoFitW !== lastReported.current.w) {
      lastReported.current.w = autoFitW;
      size.width = autoFitW;
    }
    if (size.width || size.height) {
      onConfigChange("_autoFitSize", size);
    }
  }, [autoFitH, autoFitW, onConfigChange]);

  const renderNode = (cx: number, cy: number) => {
    if (nodeStyle === "diamond") {
      const s = 5;
      return <polygon key={`n-${cx}-${cy}`} points={`${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`} fill={stroke} />;
    }
    if (nodeStyle === "square") {
      const s = 4;
      return <rect key={`n-${cx}-${cy}`} x={cx - s} y={cy - s} width={s * 2} height={s * 2} fill={stroke} />;
    }
    return <circle key={`n-${cx}-${cy}`} cx={cx} cy={cy} r="4" fill={stroke} />;
  };

  const renderHorizontal = () => {
    const elements = [];
    const startX = 10;
    const endX = 90;
    const step = (endX - startX) / (count - 1);
    for (let i = 0; i < count; i++) {
      const x = startX + i * step;
      elements.push(renderNode(x, 50));
    }
    return (
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={svgStyle}>
        <line x1={startX} y1="50" x2={endX} y2="50" stroke={stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
        {elements}
      </svg>
    );
  };

  const renderVertical = () => {
    const elements = [];
    const startY = 10;
    const endY = 90;
    const step = (endY - startY) / (count - 1);
    for (let i = 0; i < count; i++) {
      const y = startY + i * step;
      elements.push(renderNode(50, y));
    }
    return (
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={svgStyle}>
        <line x1="50" y1={startY} x2="50" y2={endY} stroke={stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
        {elements}
      </svg>
    );
  };

  return (
    <DecorationWrapper config={config}>
      <Box sx={{ width: "100%", height: "100%", opacity, overflow: "visible" }}>
        {direction === "vertical" ? renderVertical() : renderHorizontal()}
      </Box>
    </DecorationWrapper>
  );
}
