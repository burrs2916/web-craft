import { useRef, useEffect, useState, useCallback } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { DecorationWrapper } from "./DecorationWrapper";
import { getTitleFrameConfig, useFrameUid } from "./TitleFramePrimitives";

type ConnectorStyle = "dots" | "dashed" | "thin" | "gradient";
type FoldStyle = "sharp" | "round" | "square" | "none";
type WingEndStyle = "none" | "arrow" | "dot" | "triangle";

export function CenterDiamondTitleFrameRenderer({ config, width: propW, height: propH }: ComponentRendererProps) {
  const fc = getTitleFrameConfig(config);
  const uid = useFrameUid();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: propW ?? 400, h: propH ?? 50 });

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

  const hasDsX = config.diamondSizeX !== undefined && config.diamondSizeX !== null;
  const hasDsY = config.diamondSizeY !== undefined && config.diamondSizeY !== null;
  const hasGap = config.diamondGap !== undefined && config.diamondGap !== null;
  const hasDll = config.decoLineLength !== undefined && config.decoLineLength !== null;

  const diamondSizeX = hasDsX ? (config.diamondSizeX as number) : Math.max(4, Math.round(W * 0.015));
  const diamondSizeY = hasDsY ? (config.diamondSizeY as number) : Math.max(6, Math.round(H * 0.2));
  const diamondGap = hasGap ? (config.diamondGap as number) : Math.max(12, Math.round(W * 0.055));
  const diamondStyle = (config.diamondStyle as "filled" | "outlined" | "double") ?? "filled";
  const wingStyle = (config.wingStyle as string) ?? "double";
  const showDecoLine = (config.showDecoLine as boolean) ?? true;
  const decoLineLength = hasDll ? (config.decoLineLength as number) : Math.max(6, Math.round(H * 0.28));
  const animated = (config.animated as boolean) ?? false;
  const speed = (config.speed as number) ?? 3000;
  const connectorStyle = (config.connectorStyle as ConnectorStyle) ?? "dots";
  const foldStyle = (config.foldStyle as FoldStyle) ?? "sharp";
  const wingEndStyle = (config.wingEndStyle as WingEndStyle) ?? "none";
  const diamondCross = (config.diamondCross as boolean) ?? false;
  const diamondPulse = (config.diamondPulse as boolean) ?? false;
  const wingFlow = (config.wingFlow as boolean) ?? false;

  const dsx2 = diamondSizeX * 0.7;
  const dsy2 = diamondSizeY * 0.7;

  const midY = H * 0.36;
  const dTop = midY - diamondSizeY;
  const dBot = midY + diamondSizeY;

  const minGap = Math.max(4, diamondSizeY * 0.4);
  const midY2Min = dBot + minGap + dsy2;
  const midY2Default = H * 0.76;
  const midY2 = wingStyle === "double" ? Math.max(midY2Min, midY2Default) : midY;
  const dTop2 = midY2 - dsy2;
  const dBot2 = midY2 + dsy2;

  const leftDx = W / 2 - diamondGap;
  const rightDx = W / 2 + diamondGap;

  const gradId = `tf-grad-${uid}`;
  const gradVId = `tf-gradv-${uid}`;
  const pulseId = `tf-pulse-${uid}`;
  const glowId = `tf-glow-${uid}`;
  const bgGradId = `tf-bg-${uid}`;
  const diamondGlowId = `tf-dglow-${uid}`;
  const connectorGradId = `tf-conn-${uid}`;
  const flowId = `tf-flow-${uid}`;

  const bgPad = 3;
  const bgTop = Math.min(dTop, dTop2) - bgPad;
  const bgBot = wingStyle === "double" ? dBot2 + bgPad : dBot + bgPad;

  const connStart = leftDx + diamondSizeX + 4;
  const connEnd = rightDx - diamondSizeX - 4;
  const connStart2 = leftDx + dsx2 + 4;
  const connEnd2 = rightDx - dsx2 - 4;

  const foldH = Math.min(diamondSizeY * 0.5, 6);
  const foldW = Math.min(diamondSizeX * 0.4, 4);

  const dotSpacing = Math.max(5, W * 0.012);
  const dotR = Math.max(0.8, fc.strokeWidth * 0.35);

  const hasAnim = animated || diamondPulse || wingFlow;

  const renderFold = (x: number, y: number, _size: number, h: number, w: number, side: "left" | "right") => {
    if (foldStyle === "none") return null;
    const baseX = x;
    if (foldStyle === "sharp") {
      const tipX = side === "left" ? baseX - w - 1 : baseX + w + 1;
      return (
        <path
          d={`M ${tipX} ${y} L ${baseX} ${y - h} L ${baseX} ${y + h} Z`}
          fill={fc.stroke}
          opacity="0.6"
          filter={fc.glowEnabled ? `url(#${glowId})` : undefined}
        />
      );
    }
    if (foldStyle === "round") {
      const tipX = side === "left" ? baseX - w - 1 : baseX + w + 1;
      return (
        <path
          d={`M ${baseX} ${y - h} A ${h} ${h} 0 0 1 ${baseX} ${y + h} L ${tipX} ${y} Z`}
          fill={fc.stroke}
          opacity="0.5"
          filter={fc.glowEnabled ? `url(#${glowId})` : undefined}
        />
      );
    }
    if (foldStyle === "square") {
      const tipX = side === "left" ? baseX - w - 1 : baseX + w + 1;
      return (
        <path
          d={`M ${tipX} ${y} L ${tipX} ${y - h} L ${baseX} ${y - h} L ${baseX} ${y + h} L ${tipX} ${y + h} Z`}
          fill={fc.stroke}
          opacity="0.45"
          filter={fc.glowEnabled ? `url(#${glowId})` : undefined}
        />
      );
    }
    return null;
  };

  const renderWingEnd = (x: number, y: number, side: "left" | "right") => {
    if (wingEndStyle === "none") return null;
    const dir = side === "left" ? -1 : 1;
    const s = Math.max(3, fc.strokeWidth * 2.5);
    if (wingEndStyle === "arrow") {
      return (
        <path
          d={`M ${x + s * dir} ${y - s * 0.6} L ${x} ${y} L ${x + s * dir} ${y + s * 0.6}`}
          fill="none"
          stroke={fc.stroke}
          strokeWidth={fc.strokeWidth * 0.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          filter={fc.glowEnabled ? `url(#${glowId})` : undefined}
        />
      );
    }
    if (wingEndStyle === "dot") {
      return (
        <circle
          cx={x} cy={y}
          r={Math.max(1.5, fc.strokeWidth * 1.2)}
          fill={fc.stroke}
          filter={fc.glowEnabled ? `url(#${glowId})` : undefined}
        />
      );
    }
    if (wingEndStyle === "triangle") {
      return (
        <polygon
          points={`${x},${y} ${x + s * dir},${y - s * 0.5} ${x + s * dir},${y + s * 0.5}`}
          fill={fc.stroke}
          opacity="0.8"
          filter={fc.glowEnabled ? `url(#${glowId})` : undefined}
        />
      );
    }
    return null;
  };

  const renderConnector = (x1: number, x2: number, y: number, secondary: boolean) => {
    const len = x2 - x1;
    if (len <= 0) return null;
    const baseOpacity = secondary ? 0.35 : 0.5;
    const r = secondary ? dotR * 0.7 : dotR;

    if (connectorStyle === "dots") {
      return (
        <DotLine x1={x1} x2={x2} y={y} spacing={dotSpacing} r={r} color={fc.stroke} opacity={baseOpacity} animated={animated} animUid={uid} />
      );
    }
    if (connectorStyle === "dashed") {
      return (
        <line
          x1={x1} y1={y} x2={x2} y2={y}
          stroke={fc.stroke}
          strokeWidth={fc.strokeWidth * 0.5}
          strokeDasharray="4 3"
          opacity={baseOpacity}
          vectorEffect="non-scaling-stroke"
          filter={fc.glowEnabled ? `url(#${glowId})` : undefined}
        />
      );
    }
    if (connectorStyle === "thin") {
      return (
        <line
          x1={x1} y1={y} x2={x2} y2={y}
          stroke={fc.stroke}
          strokeWidth={fc.strokeWidth * 0.35}
          opacity={baseOpacity * 0.8}
          vectorEffect="non-scaling-stroke"
          filter={fc.glowEnabled ? `url(#${glowId})` : undefined}
        />
      );
    }
    if (connectorStyle === "gradient") {
      const sw = fc.strokeWidth * 0.6;
      return (
        <rect
          x={x1} y={y - sw / 2}
          width={len} height={sw}
          fill={`url(#${connectorGradId})`}
          opacity={baseOpacity}
          filter={fc.glowEnabled ? `url(#${glowId})` : undefined}
        />
      );
    }
    return null;
  };

  return (
    <DecorationWrapper config={config}>
      <Box ref={containerRef} sx={{ width: "100%", height: "100%", opacity: fc.opacity, overflow: "visible" }}>
        {hasAnim && (
          <style>{`
            @keyframes deco-tf-cd-pulse-${uid} {
              0%   { transform: translateX(-${W * 0.12}px); opacity: 0; }
              8%   { opacity: 1; }
              92%  { opacity: 1; }
              100% { transform: translateX(${W * 1.12}px); opacity: 0; }
            }
            @keyframes deco-tf-cd-diamond-breathe-${uid} {
              0%, 100% { opacity: 0.4; }
              50% { opacity: 0.9; }
            }
            @keyframes deco-tf-cd-ripple-${uid} {
              0%   { transform: scale(0); opacity: 0.7; }
              100% { transform: scale(1); opacity: 0; }
            }
            @keyframes deco-tf-cd-flow-${uid} {
              0%   { transform: translateX(-${W}px); opacity: 0; }
              5%   { opacity: 0.7; }
              95%  { opacity: 0.7; }
              100% { transform: translateX(${W}px); opacity: 0; }
            }
            @keyframes deco-tf-cd-dot-wave-${uid} {
              0%, 100% { opacity: 0.3; }
              50% { opacity: 0.9; }
            }
          `}</style>
        )}
        <svg width="100%" height="100%" style={{ overflow: "visible" }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={fc.stroke} stopOpacity="0" />
              <stop offset="5%" stopColor={fc.stroke} stopOpacity="0.15" />
              <stop offset="12%" stopColor={fc.stroke} stopOpacity="0.7" />
              <stop offset="50%" stopColor={fc.stroke} stopOpacity="1" />
              <stop offset="88%" stopColor={fc.stroke} stopOpacity="0.7" />
              <stop offset="95%" stopColor={fc.stroke} stopOpacity="0.15" />
              <stop offset="100%" stopColor={fc.stroke} stopOpacity="0" />
            </linearGradient>

            <linearGradient id={gradVId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={fc.stroke} stopOpacity="1" />
              <stop offset="60%" stopColor={fc.stroke} stopOpacity="0.55" />
              <stop offset="100%" stopColor={fc.stroke} stopOpacity="0.05" />
            </linearGradient>

            <radialGradient id={diamondGlowId} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={fc.stroke} stopOpacity="0.3" />
              <stop offset="60%" stopColor={fc.stroke} stopOpacity="0.1" />
              <stop offset="100%" stopColor={fc.stroke} stopOpacity="0" />
            </radialGradient>

            <linearGradient id={bgGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={fc.stroke} stopOpacity="0.08" />
              <stop offset="50%" stopColor={fc.stroke} stopOpacity="0.02" />
              <stop offset="100%" stopColor={fc.stroke} stopOpacity="0.06" />
            </linearGradient>

            <linearGradient id={pulseId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={fc.stroke} stopOpacity="0" />
              <stop offset="25%" stopColor={fc.stroke} stopOpacity="0.1" />
              <stop offset="50%" stopColor={fc.stroke} stopOpacity="0.45" />
              <stop offset="75%" stopColor={fc.stroke} stopOpacity="0.1" />
              <stop offset="100%" stopColor={fc.stroke} stopOpacity="0" />
            </linearGradient>

            <linearGradient id={connectorGradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={fc.stroke} stopOpacity="0.1" />
              <stop offset="30%" stopColor={fc.stroke} stopOpacity="0.6" />
              <stop offset="50%" stopColor={fc.stroke} stopOpacity="0.9" />
              <stop offset="70%" stopColor={fc.stroke} stopOpacity="0.6" />
              <stop offset="100%" stopColor={fc.stroke} stopOpacity="0.1" />
            </linearGradient>

            <linearGradient id={flowId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={fc.stroke} stopOpacity="0" />
              <stop offset="35%" stopColor={fc.stroke} stopOpacity="0.15" />
              <stop offset="50%" stopColor={fc.stroke} stopOpacity="0.55" />
              <stop offset="65%" stopColor={fc.stroke} stopOpacity="0.15" />
              <stop offset="100%" stopColor={fc.stroke} stopOpacity="0" />
            </linearGradient>

            {fc.glowEnabled && (
              <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="1.5" result="blur1" />
                <feGaussianBlur stdDeviation="4" result="blur2" />
                <feMerge>
                  <feMergeNode in="blur2" />
                  <feMergeNode in="blur1" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            )}
          </defs>

          {/* ═══════ 背景 ═══════ */}
          <rect
            x={3} y={bgTop}
            width={W - 6} height={bgBot - bgTop}
            rx="1" ry="1"
            fill={fc.fillColor} fillOpacity={fc.fillOpacity}
          />
          <rect
            x={3} y={bgTop}
            width={W - 6} height={bgBot - bgTop}
            rx="1" ry="1"
            fill={`url(#${bgGradId})`}
          />

          {/* ═══════ 上翼线（主线） ═══════ */}
          <line
            x1={wingEndStyle !== "none" ? 8 : 3} y1={midY}
            x2={leftDx - diamondSizeX - (foldStyle !== "none" ? foldW + 1 : 2)} y2={midY}
            stroke={`url(#${gradId})`}
            strokeWidth={fc.strokeWidth}
            vectorEffect="non-scaling-stroke"
            filter={fc.glowEnabled ? `url(#${glowId})` : undefined}
          />
          {renderFold(leftDx - diamondSizeX, midY, foldH, foldH, foldW, "left")}

          {renderConnector(connStart, connEnd, midY, false)}

          {renderFold(rightDx + diamondSizeX, midY, foldH, foldH, foldW, "right")}
          <line
            x1={rightDx + diamondSizeX + (foldStyle !== "none" ? foldW + 1 : 2)} y1={midY}
            x2={wingEndStyle !== "none" ? W - 8 : W - 3} y2={midY}
            stroke={`url(#${gradId})`}
            strokeWidth={fc.strokeWidth}
            vectorEffect="non-scaling-stroke"
            filter={fc.glowEnabled ? `url(#${glowId})` : undefined}
          />

          {renderWingEnd(3, midY, "left")}
          {renderWingEnd(W - 3, midY, "right")}

          {/* ═══════ 翼线流光 ═══════ */}
          {wingFlow && (
            <>
              <rect
                x={-W * 0.15}
                y={midY - fc.strokeWidth * 3}
                width={W * 0.3}
                height={fc.strokeWidth * 6}
                fill={`url(#${flowId})`}
                style={{ animation: `deco-tf-cd-flow-${uid} ${speed}ms ease-in-out infinite` }}
              />
            </>
          )}

          {/* ═══════ 下翼线 ═══════ */}
          {wingStyle === "double" && (
            <>
              <line
                x1={wingEndStyle !== "none" ? 8 : 3} y1={midY2}
                x2={leftDx - dsx2 - (foldStyle !== "none" ? foldW * 0.7 + 1 : 2)} y2={midY2}
                stroke={`url(#${gradId})`}
                strokeWidth={fc.strokeWidth * 0.6}
                vectorEffect="non-scaling-stroke"
                opacity="0.6"
                filter={fc.glowEnabled ? `url(#${glowId})` : undefined}
              />
              {renderFold(leftDx - dsx2, midY2, foldH * 0.6, foldH * 0.6, foldW * 0.7, "left")}

              {renderConnector(connStart2, connEnd2, midY2, true)}

              {renderFold(rightDx + dsx2, midY2, foldH * 0.6, foldH * 0.6, foldW * 0.7, "right")}
              <line
                x1={rightDx + dsx2 + (foldStyle !== "none" ? foldW * 0.7 + 1 : 2)} y1={midY2}
                x2={wingEndStyle !== "none" ? W - 8 : W - 3} y2={midY2}
                stroke={`url(#${gradId})`}
                strokeWidth={fc.strokeWidth * 0.6}
                vectorEffect="non-scaling-stroke"
                opacity="0.6"
                filter={fc.glowEnabled ? `url(#${glowId})` : undefined}
              />

              <rect
                x={leftDx - fc.strokeWidth * 0.6}
                y={dBot + 2}
                width={fc.strokeWidth * 1.2}
                height={Math.max(3, dTop2 - dBot - 4)}
                rx={fc.strokeWidth * 0.2}
                fill={fc.stroke}
                opacity="0.75"
                filter={fc.glowEnabled ? `url(#${glowId})` : undefined}
              />
              <rect
                x={rightDx - fc.strokeWidth * 0.6}
                y={dBot + 2}
                width={fc.strokeWidth * 1.2}
                height={Math.max(3, dTop2 - dBot - 4)}
                rx={fc.strokeWidth * 0.2}
                fill={fc.stroke}
                opacity="0.75"
                filter={fc.glowEnabled ? `url(#${glowId})` : undefined}
              />
            </>
          )}

          {/* ═══════ 菱形节点 ═══════ */}
          <circle cx={leftDx} cy={midY} r={diamondSizeY * 1.8} fill={`url(#${diamondGlowId})`} />
          <circle cx={rightDx} cy={midY} r={diamondSizeY * 1.8} fill={`url(#${diamondGlowId})`} />

          {diamondPulse && (
            <>
              <circle cx={leftDx} cy={midY} r={diamondSizeY * 2.5} fill="none" stroke={fc.stroke} strokeWidth={fc.strokeWidth * 0.5} opacity="0"
                style={{ transformOrigin: `${leftDx}px ${midY}px`, animation: `deco-tf-cd-ripple-${uid} ${speed * 0.8}ms ease-out infinite` }}
              />
              <circle cx={rightDx} cy={midY} r={diamondSizeY * 2.5} fill="none" stroke={fc.stroke} strokeWidth={fc.strokeWidth * 0.5} opacity="0"
                style={{ transformOrigin: `${rightDx}px ${midY}px`, animation: `deco-tf-cd-ripple-${uid} ${speed * 0.8}ms ease-out infinite ${speed * 0.25}ms` }}
              />
              <circle cx={leftDx} cy={midY} r={diamondSizeY * 2.5} fill="none" stroke={fc.stroke} strokeWidth={fc.strokeWidth * 0.3} opacity="0"
                style={{ transformOrigin: `${leftDx}px ${midY}px`, animation: `deco-tf-cd-ripple-${uid} ${speed * 0.8}ms ease-out infinite ${speed * 0.5}ms` }}
              />
              <circle cx={rightDx} cy={midY} r={diamondSizeY * 2.5} fill="none" stroke={fc.stroke} strokeWidth={fc.strokeWidth * 0.3} opacity="0"
                style={{ transformOrigin: `${rightDx}px ${midY}px`, animation: `deco-tf-cd-ripple-${uid} ${speed * 0.8}ms ease-out infinite ${speed * 0.75}ms` }}
              />
            </>
          )}

          <DiamondShape
            cx={leftDx} cy={midY}
            rx={diamondSizeX} ry={diamondSizeY}
            style={diamondStyle}
            stroke={fc.stroke}
            strokeWidth={fc.strokeWidth}
            glowFilter={fc.glowEnabled ? `url(#${glowId})` : undefined}
            animated={animated}
            animUid={uid}
            showCross={diamondCross}
          />
          <DiamondShape
            cx={rightDx} cy={midY}
            rx={diamondSizeX} ry={diamondSizeY}
            style={diamondStyle}
            stroke={fc.stroke}
            strokeWidth={fc.strokeWidth}
            glowFilter={fc.glowEnabled ? `url(#${glowId})` : undefined}
            animated={animated}
            animUid={uid}
            showCross={diamondCross}
          />

          {wingStyle === "double" && (
            <>
              <circle cx={leftDx} cy={midY2} r={dsy2 * 1.5} fill={`url(#${diamondGlowId})`} />
              <circle cx={rightDx} cy={midY2} r={dsy2 * 1.5} fill={`url(#${diamondGlowId})`} />
              <DiamondShape
                cx={leftDx} cy={midY2}
                rx={dsx2} ry={dsy2}
                style={diamondStyle}
                stroke={fc.stroke}
                strokeWidth={fc.strokeWidth}
                glowFilter={fc.glowEnabled ? `url(#${glowId})` : undefined}
                secondary
                showCross={diamondCross}
              />
              <DiamondShape
                cx={rightDx} cy={midY2}
                rx={dsx2} ry={dsy2}
                style={diamondStyle}
                stroke={fc.stroke}
                strokeWidth={fc.strokeWidth}
                glowFilter={fc.glowEnabled ? `url(#${glowId})` : undefined}
                secondary
                showCross={diamondCross}
              />
            </>
          )}

          {/* ═══════ 装饰竖线 ═══════ */}
          {showDecoLine && (
            <>
              <rect
                x={leftDx - fc.strokeWidth * 0.4}
                y={dTop - 2 - decoLineLength * 0.4}
                width={fc.strokeWidth * 0.8}
                height={decoLineLength * 0.4}
                rx={fc.strokeWidth * 0.15}
                fill={`url(#${gradVId})`}
              />
              <rect
                x={leftDx - fc.strokeWidth * 0.4}
                y={dBot + 2}
                width={fc.strokeWidth * 0.8}
                height={decoLineLength}
                rx={fc.strokeWidth * 0.15}
                fill={`url(#${gradVId})`}
              />
              <DiamondShape
                cx={leftDx} cy={dBot + 2 + decoLineLength}
                rx={fc.strokeWidth * 0.9} ry={fc.strokeWidth * 1.5}
                style="filled"
                stroke={fc.stroke}
                strokeWidth={fc.strokeWidth}
              />

              <rect
                x={rightDx - fc.strokeWidth * 0.4}
                y={dTop - 2 - decoLineLength * 0.4}
                width={fc.strokeWidth * 0.8}
                height={decoLineLength * 0.4}
                rx={fc.strokeWidth * 0.15}
                fill={`url(#${gradVId})`}
              />
              <rect
                x={rightDx - fc.strokeWidth * 0.4}
                y={dBot + 2}
                width={fc.strokeWidth * 0.8}
                height={decoLineLength}
                rx={fc.strokeWidth * 0.15}
                fill={`url(#${gradVId})`}
              />
              <DiamondShape
                cx={rightDx} cy={dBot + 2 + decoLineLength}
                rx={fc.strokeWidth * 0.9} ry={fc.strokeWidth * 1.5}
                style="filled"
                stroke={fc.stroke}
                strokeWidth={fc.strokeWidth}
              />

              {wingStyle === "double" && (
                <>
                  <rect
                    x={leftDx - fc.strokeWidth * 0.3}
                    y={dBot2 + 2}
                    width={fc.strokeWidth * 0.6}
                    height={decoLineLength * 0.6}
                    rx={fc.strokeWidth * 0.1}
                    fill={`url(#${gradVId})`}
                  />
                  <rect
                    x={rightDx - fc.strokeWidth * 0.3}
                    y={dBot2 + 2}
                    width={fc.strokeWidth * 0.6}
                    height={decoLineLength * 0.6}
                    rx={fc.strokeWidth * 0.1}
                    fill={`url(#${gradVId})`}
                  />
                </>
              )}
            </>
          )}

          {/* ═══════ 光脉冲动画 ═══════ */}
          {animated && (
            <rect
              x={-W * 0.1}
              y={bgTop}
              width={W * 0.2}
              height={bgBot - bgTop}
              fill={`url(#${pulseId})`}
              style={{
                animation: `deco-tf-cd-pulse-${uid} ${speed}ms ease-in-out infinite`,
              }}
            />
          )}
          {(() => {
            const text = (config.text as string) ?? "标题";
            const color = (config.color as string) || "#ffffff";
            const fontSize = (config.fontSize as number) ?? 20;
            // 文字居中显示在菱形之间（垂直居中在上下菱形中间）
            return (
              <text
                x={W / 2}
                y={wingStyle === "double" ? (midY + midY2) / 2 : midY}
                fill={color}
                fontSize={fontSize}
                fontWeight={600}
                textAnchor="middle"
                dominantBaseline="central"
                style={{ userSelect: "none", fontFamily: "'Microsoft YaHei', 'PingFang SC', sans-serif" }}
              >
                {text}
              </text>
            );
          })()}
        </svg>
      </Box>
    </DecorationWrapper>
  );
}

interface DiamondShapeProps {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  style: "filled" | "outlined" | "double";
  stroke: string;
  strokeWidth: number;
  glowFilter?: string;
  secondary?: boolean;
  animated?: boolean;
  animUid?: string;
  showCross?: boolean;
}

function DiamondShape({ cx, cy, rx, ry, style, stroke, strokeWidth, glowFilter, secondary, animated, animUid, showCross }: DiamondShapeProps) {
  const opacity = secondary ? 0.7 : 1;
  const top = `${cx},${cy - ry}`;
  const right = `${cx + rx},${cy}`;
  const bottom = `${cx},${cy + ry}`;
  const left = `${cx - rx},${cy}`;
  const pts = `${top} ${right} ${bottom} ${left}`;

  const breatheStyle = animated && !secondary && animUid
    ? { animation: `deco-tf-cd-diamond-breathe-${animUid} 3000ms ease-in-out infinite` }
    : undefined;

  const crossLines = showCross ? (
    <g opacity={secondary ? 0.3 : 0.45}>
      <line x1={cx - rx * 0.6} y1={cy} x2={cx + rx * 0.6} y2={cy}
        stroke={style === "filled" ? "white" : stroke}
        strokeWidth={strokeWidth * 0.3}
        vectorEffect="non-scaling-stroke"
      />
      <line x1={cx} y1={cy - ry * 0.6} x2={cx} y2={cy + ry * 0.6}
        stroke={style === "filled" ? "white" : stroke}
        strokeWidth={strokeWidth * 0.3}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  ) : null;

  if (style === "filled") {
    return (
      <g opacity={opacity}>
        <polygon
          points={pts}
          fill={stroke}
          opacity="0.15"
          transform={`translate(0, ${-strokeWidth * 0.3})`}
        />
        <polygon
          points={pts}
          fill={stroke}
          filter={glowFilter}
          style={breatheStyle}
        />
        {crossLines}
        <circle
          cx={cx} cy={cy}
          r={Math.max(1, Math.min(rx, ry) * 0.2)}
          fill="white"
          opacity="0.75"
        />
      </g>
    );
  }

  if (style === "outlined") {
    return (
      <g opacity={opacity}>
        <polygon
          points={pts}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth * 1.2}
          vectorEffect="non-scaling-stroke"
          filter={glowFilter}
          style={breatheStyle}
        />
        {crossLines}
        <circle
          cx={cx} cy={cy}
          r={Math.max(1.2, Math.min(rx, ry) * 0.18)}
          fill={stroke}
          opacity="0.7"
        />
      </g>
    );
  }

  const shrink = Math.min(rx, ry) * 0.35;
  const innerTop = `${cx},${cy - ry + shrink}`;
  const innerRight = `${cx + rx - shrink},${cy}`;
  const innerBottom = `${cx},${cy + ry - shrink}`;
  const innerLeft = `${cx - rx + shrink},${cy}`;
  const innerPts = `${innerTop} ${innerRight} ${innerBottom} ${innerLeft}`;

  return (
    <g opacity={opacity}>
      <polygon
        points={pts}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth * 0.7}
        vectorEffect="non-scaling-stroke"
        filter={glowFilter}
      />
      <polygon
        points={innerPts}
        fill={stroke}
        opacity={secondary ? 0.35 : 0.55}
        style={breatheStyle}
      />
      {crossLines}
    </g>
  );
}

interface DotLineProps {
  x1: number;
  x2: number;
  y: number;
  spacing: number;
  r: number;
  color: string;
  opacity: number;
  animated?: boolean;
  animUid?: string;
}

function DotLine({ x1, x2, y, spacing, r, color, opacity, animated, animUid }: DotLineProps) {
  const len = x2 - x1;
  if (len <= 0) return null;
  const count = Math.floor(len / spacing);
  if (count <= 0) return null;
  const midIdx = count / 2;
  const dots: JSX.Element[] = [];
  for (let i = 0; i <= count; i++) {
    const distFromCenter = Math.abs(i - midIdx) / Math.max(1, midIdx);
    const sizeScale = 1 - distFromCenter * 0.4;
    const actualR = r * sizeScale;
    const delay = animated && animUid ? `${(i / count) * 2000}ms` : undefined;
    const animStyle = animated && animUid
      ? { animation: `deco-tf-cd-dot-wave-${animUid} 2500ms ease-in-out infinite`, animationDelay: delay }
      : undefined;
    dots.push(
      <circle
        key={i}
        cx={x1 + i * spacing}
        cy={y}
        r={actualR}
        fill={color}
        opacity={opacity}
        style={animStyle}
      />
    );
  }
  return <g>{dots}</g>;
}
