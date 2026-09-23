import { useRef, useEffect, useState, useCallback } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { DecorationWrapper } from "./DecorationWrapper";
import { getTitleFrameConfig, useFrameUid } from "./TitleFramePrimitives";

export function TechCornerTitleFrameRenderer({ config, width: propW, height: propH }: ComponentRendererProps) {
  const fc = getTitleFrameConfig(config);
  const uid = useFrameUid();
  const gradId = `tf-grad-${uid}`;
  const glowId = `tf-glow-${uid}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: propW ?? 200, h: propH ?? 60 });

  const measure = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setDims({ w: rect.width, h: rect.height });
      }
    }
  }, []);

  useEffect(() => {
    measure();
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const W = propW && propW > 0 ? propW : dims.w;
  const H = propH && propH > 0 ? propH : dims.h;

  const cornerSize = (config.cornerSize as number) ?? 4;
  const cornerOffset = (config.cornerOffset as number) ?? 2;

  const cx = W / 2;
  const cy = H / 2;
  const topY = H * 0.08;
  const botY = H * 0.92;
  const innerH = botY - topY;

  const text = (config.text as string) ?? "标题";
  const color = (config.color as string) || "#ffffff";
  const baseFontSize = (config.fontSize as number) ?? 20;
  const fontSize = Math.max(12, Math.min(baseFontSize, H * 0.4));

  return (
    <DecorationWrapper config={config}>
      <Box ref={containerRef} sx={{ width: "100%", height: "100%", opacity: fc.opacity, overflow: "visible" }}>
        <svg width={W} height={H} style={{ overflow: "visible" }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={fc.stroke} stopOpacity="0" />
              <stop offset="12%" stopColor={fc.stroke} stopOpacity="0.6" />
              <stop offset="50%" stopColor={fc.stroke} stopOpacity="1" />
              <stop offset="88%" stopColor={fc.stroke} stopOpacity="0.6" />
              <stop offset="100%" stopColor={fc.stroke} stopOpacity="0" />
            </linearGradient>
            {fc.glowEnabled && (
              <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            )}
          </defs>
          <rect x={cornerOffset} y={topY} width={W - cornerOffset * 2} height={innerH} fill={fc.fillColor} fillOpacity={fc.fillOpacity} />
          <line x1={cornerOffset} y1={topY} x2={W - cornerOffset} y2={topY} stroke={`url(#${gradId})`} strokeWidth={fc.strokeWidth} vectorEffect="non-scaling-stroke" filter={fc.glowEnabled ? `url(#${glowId})` : undefined} />
          <line x1={cornerOffset} y1={botY} x2={W - cornerOffset} y2={botY} stroke={`url(#${gradId})`} strokeWidth={fc.strokeWidth} vectorEffect="non-scaling-stroke" filter={fc.glowEnabled ? `url(#${glowId})` : undefined} />
          <path d={`M ${cornerOffset} ${topY + cornerSize} L ${cornerOffset} ${topY} L ${cornerOffset + cornerSize} ${topY}`} stroke={fc.stroke} strokeWidth={fc.strokeWidth * 1.8} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <path d={`M ${W - cornerOffset - cornerSize} ${topY} L ${W - cornerOffset} ${topY} L ${W - cornerOffset} ${topY + cornerSize}`} stroke={fc.stroke} strokeWidth={fc.strokeWidth * 1.8} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <path d={`M ${cornerOffset} ${botY - cornerSize} L ${cornerOffset} ${botY} L ${cornerOffset + cornerSize} ${botY}`} stroke={fc.stroke} strokeWidth={fc.strokeWidth * 1.8} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <path d={`M ${W - cornerOffset - cornerSize} ${botY} L ${W - cornerOffset} ${botY} L ${W - cornerOffset} ${botY - cornerSize}`} stroke={fc.stroke} strokeWidth={fc.strokeWidth * 1.8} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <rect x={cornerOffset} y={cy - 1} width={1} height={2} fill={fc.stroke} />
          <rect x={W - cornerOffset - 1} y={cy - 1} width={1} height={2} fill={fc.stroke} />
          <text
            x={cx}
            y={cy}
            fill={color}
            fontSize={fontSize}
            fontWeight={600}
            textAnchor="middle"
            dominantBaseline="central"
            style={{ userSelect: "none", fontFamily: "'Microsoft YaHei', 'PingFang SC', sans-serif" }}
          >
            {text}
          </text>
        </svg>
      </Box>
    </DecorationWrapper>
  );
}
