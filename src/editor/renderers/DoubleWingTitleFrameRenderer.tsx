import { useRef, useEffect, useState, useCallback } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { DecorationWrapper } from "./DecorationWrapper";
import { getTitleFrameConfig, useFrameUid } from "./TitleFramePrimitives";

type WingCurve = "gentle" | "dramatic" | "angular" | "swoop";
type CenterAnchor = "diamond" | "line" | "dot" | "cross" | "none";
type WingTipStyle = "arrow" | "flare" | "dot" | "diamond" | "none";

export function DoubleWingTitleFrameRenderer({ config, width: propW, height: propH }: ComponentRendererProps) {
  const fc = getTitleFrameConfig(config);
  const uid = useFrameUid();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: propW ?? 400, h: propH ?? 42 });

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

  const wingSpread = (config.wingSpread as number) ?? 16;
  const wingWidth = (config.wingWidth as number) ?? 150;
  const wingCurve = (config.wingCurve as WingCurve) ?? "angular";
  const centerAnchor = (config.centerAnchor as CenterAnchor) ?? "diamond";
  const wingTipStyle = (config.wingTipStyle as WingTipStyle) ?? "arrow";
  const innerLine = (config.innerLine as boolean) ?? true;
  const wingGlow = (config.wingGlow as boolean) ?? true;
  const centerPulse = (config.centerPulse as boolean) ?? true;
  const wingFlow = (config.wingFlow as boolean) ?? true;
  const scanLine = (config.scanLine as boolean) ?? false;
  const speed = (config.speed as number) ?? 3000;

  // 兼容旧字段名：wingColor → stroke（通过 getTitleFrameConfig 内部兼容）
  // 兼容旧字段：lineEffectColor → glowColor（通过 getTitleFrameConfig 内部兼容）
  const strokeColor = fc.stroke;
  const glowColor = fc.glowColor;

  const glowEnabled = fc.glowEnabled || wingGlow;

  const wingFillBase = fc.fillColor && fc.fillColor !== "rgba(33, 150, 243, 0.05)" && fc.fillColor !== "rgba(33, 150, 243, 0.08)" ? fc.fillColor : strokeColor;
  const wingFillOpacity = fc.fillOpacity;

  const midY = H / 2;
  const cx = W / 2;
  const sw = fc.strokeWidth;

  const glowId = `tf-dw-glow-${uid}`;
  const wingGradLId = `tf-dw-wgl-${uid}`;
  const wingGradRId = `tf-dw-wgr-${uid}`;
  const scanId = `tf-dw-scan-${uid}`;
  const bgGradId = `tf-dw-bg-${uid}`;
  const clipId = `tf-dw-clip-${uid}`;

  const hasAnim = centerPulse || wingFlow || scanLine;

  const buildWingFill = (side: "left" | "right"): string => {
    const dir = side === "left" ? -1 : 1;
    const baseX = cx + dir * wingWidth;
    const topEndY = midY - wingSpread;
    const botEndY = midY + wingSpread;

    switch (wingCurve) {
      case "gentle":
        return [
          `M ${cx} ${midY}`,
          `Q ${cx + dir * wingWidth * 0.5} ${midY - wingSpread * 0.15} ${baseX} ${topEndY}`,
          `L ${baseX} ${botEndY}`,
          `Q ${cx + dir * wingWidth * 0.5} ${midY + wingSpread * 0.15} ${cx} ${midY}`,
          `Z`,
        ].join(" ");
      case "dramatic":
        return [
          `M ${cx} ${midY}`,
          `C ${cx + dir * wingWidth * 0.2} ${midY} ${cx + dir * wingWidth * 0.8} ${topEndY + wingSpread * 0.3} ${baseX} ${topEndY}`,
          `L ${baseX} ${botEndY}`,
          `C ${cx + dir * wingWidth * 0.8} ${botEndY - wingSpread * 0.3} ${cx + dir * wingWidth * 0.2} ${midY} ${cx} ${midY}`,
          `Z`,
        ].join(" ");
      case "angular": {
        const midX = cx + dir * wingWidth * 0.5;
        return [
          `M ${cx} ${midY}`,
          `L ${midX} ${midY - wingSpread * 0.1}`,
          `L ${midX} ${topEndY}`,
          `L ${baseX} ${topEndY}`,
          `L ${baseX} ${botEndY}`,
          `L ${midX} ${botEndY}`,
          `L ${midX} ${midY + wingSpread * 0.1}`,
          `Z`,
        ].join(" ");
      }
      case "swoop":
        return [
          `M ${cx} ${midY}`,
          `C ${cx + dir * wingWidth * 0.1} ${midY - wingSpread * 0.6} ${cx + dir * wingWidth * 0.6} ${topEndY} ${baseX} ${topEndY}`,
          `L ${baseX} ${botEndY}`,
          `C ${cx + dir * wingWidth * 0.6} ${botEndY} ${cx + dir * wingWidth * 0.1} ${midY + wingSpread * 0.6} ${cx} ${midY}`,
          `Z`,
        ].join(" ");
      default:
        return `M ${cx} ${midY} L ${baseX} ${topEndY} L ${baseX} ${botEndY} Z`;
    }
  };

  const buildWingStroke = (side: "left" | "right"): string => {
    const dir = side === "left" ? -1 : 1;
    const baseX = cx + dir * wingWidth;
    const topEndY = midY - wingSpread;
    const botEndY = midY + wingSpread;

    switch (wingCurve) {
      case "gentle":
        return [
          `M ${cx} ${midY - sw * 0.5}`,
          `Q ${cx + dir * wingWidth * 0.5} ${midY - wingSpread * 0.15} ${baseX} ${topEndY}`,
          `L ${baseX} ${botEndY}`,
          `Q ${cx + dir * wingWidth * 0.5} ${midY + wingSpread * 0.15} ${cx} ${midY + sw * 0.5}`,
        ].join(" ");
      case "dramatic":
        return [
          `M ${cx} ${midY - sw * 0.5}`,
          `C ${cx + dir * wingWidth * 0.2} ${midY} ${cx + dir * wingWidth * 0.8} ${topEndY + wingSpread * 0.3} ${baseX} ${topEndY}`,
          `L ${baseX} ${botEndY}`,
          `C ${cx + dir * wingWidth * 0.8} ${botEndY - wingSpread * 0.3} ${cx + dir * wingWidth * 0.2} ${midY} ${cx} ${midY + sw * 0.5}`,
        ].join(" ");
      case "angular": {
        const midX = cx + dir * wingWidth * 0.5;
        return [
          `M ${cx} ${midY - sw * 0.5}`,
          `L ${midX} ${midY - wingSpread * 0.1}`,
          `L ${midX} ${topEndY}`,
          `L ${baseX} ${topEndY}`,
          `L ${baseX} ${botEndY}`,
          `L ${midX} ${botEndY}`,
          `L ${midX} ${midY + wingSpread * 0.1}`,
          `L ${cx} ${midY + sw * 0.5}`,
        ].join(" ");
      }
      case "swoop":
        return [
          `M ${cx} ${midY - sw * 0.5}`,
          `C ${cx + dir * wingWidth * 0.1} ${midY - wingSpread * 0.6} ${cx + dir * wingWidth * 0.6} ${topEndY} ${baseX} ${topEndY}`,
          `L ${baseX} ${botEndY}`,
          `C ${cx + dir * wingWidth * 0.6} ${botEndY} ${cx + dir * wingWidth * 0.1} ${midY + wingSpread * 0.6} ${cx} ${midY + sw * 0.5}`,
        ].join(" ");
      default:
        return `M ${cx} ${midY} L ${baseX} ${topEndY} L ${baseX} ${botEndY} L ${cx} ${midY}`;
    }
  };

  const buildInnerLinePath = (side: "left" | "right", isTop: boolean): string => {
    const dir = side === "left" ? -1 : 1;
    const offset = Math.max(3, wingSpread * 0.15);
    const sign = isTop ? -1 : 1;
    const innerY = midY + sign * offset;
    const innerSpread = wingSpread * 0.6;
    const endY = innerY + sign * innerSpread;
    const baseX = cx + dir * wingWidth;

    switch (wingCurve) {
      case "gentle":
        return `M ${cx} ${innerY} Q ${cx + dir * wingWidth * 0.5} ${innerY + sign * innerSpread * 0.15} ${baseX} ${endY}`;
      case "dramatic":
        return `M ${cx} ${innerY} C ${cx + dir * wingWidth * 0.2} ${innerY} ${cx + dir * wingWidth * 0.8} ${endY - sign * innerSpread * 0.3} ${baseX} ${endY}`;
      case "angular": {
        const midX = cx + dir * wingWidth * 0.5;
        return `M ${cx} ${midY + sign * offset * 0.2} L ${midX} ${midY + sign * offset * 0.2} L ${midX} ${endY} L ${baseX} ${endY}`;
      }
      case "swoop":
        return `M ${cx} ${innerY} C ${cx + dir * wingWidth * 0.1} ${innerY + sign * innerSpread * 0.6} ${cx + dir * wingWidth * 0.6} ${endY} ${baseX} ${endY}`;
      default:
        return `M ${cx} ${innerY} L ${baseX} ${endY}`;
    }
  };

  const renderCenterAnchor = () => {
    const s = Math.max(4, Math.min(wingSpread * 0.35, 12));
    switch (centerAnchor) {
      case "diamond":
        return (
          <path
            d={`M ${cx} ${midY - s} L ${cx + s} ${midY} L ${cx} ${midY + s} L ${cx - s} ${midY} Z`}
            fill={glowColor}
            opacity="0.9"
            filter={glowEnabled ? `url(#${glowId})` : undefined}
          />
        );
      case "line":
        return (
          <line
            x1={cx} y1={midY - s * 1.2} x2={cx} y2={midY + s * 1.2}
            stroke={glowColor}
            strokeWidth={sw}
          />
        );
      case "dot": {
        const r = Math.max(2.5, s * 0.4);
        return (
          <ellipse
            cx={cx} cy={midY} rx={r} ry={r}
            fill={glowColor}
            filter={glowEnabled ? `url(#${glowId})` : undefined}
          />
        );
      }
      case "cross":
        return (
          <g filter={glowEnabled ? `url(#${glowId})` : undefined}>
            <line x1={cx - s * 0.7} y1={midY} x2={cx + s * 0.7} y2={midY} stroke={glowColor} strokeWidth={sw} />
            <line x1={cx} y1={midY - s * 0.7} x2={cx} y2={midY + s * 0.7} stroke={glowColor} strokeWidth={sw} />
          </g>
        );
      case "none":
        return null;
    }
  };

  const renderWingTip = (side: "left" | "right") => {
    if (wingTipStyle === "none") return null;
    const dir = side === "left" ? -1 : 1;
    const baseX = cx + dir * wingWidth;
    const topEndY = midY - wingSpread;
    const botEndY = midY + wingSpread;
    const tipX = baseX + dir * 2;
    const s = Math.max(4, sw * 3);

    switch (wingTipStyle) {
      case "arrow":
        return (
          <g filter={glowEnabled ? `url(#${glowId})` : undefined}>
            <path
              d={`M ${tipX} ${topEndY} L ${tipX + s * dir} ${topEndY - s * 0.4} M ${tipX} ${botEndY} L ${tipX + s * dir} ${botEndY + s * 0.4}`}
              fill="none"
              stroke={strokeColor}
              strokeWidth={sw * 0.8}
              strokeLinecap="round"
            />
          </g>
        );
      case "flare":
        return (
          <g filter={glowEnabled ? `url(#${glowId})` : undefined}>
            <path
              d={`M ${tipX} ${topEndY} L ${tipX + s * 1.5 * dir} ${topEndY - s * 0.6} M ${tipX} ${botEndY} L ${tipX + s * 1.5 * dir} ${botEndY + s * 0.6} M ${tipX} ${topEndY} L ${tipX + s * 1.5 * dir} ${topEndY + s * 0.3} M ${tipX} ${botEndY} L ${tipX + s * 1.5 * dir} ${botEndY - s * 0.3}`}
              fill="none"
              stroke={strokeColor}
              strokeWidth={sw * 0.6}
              strokeLinecap="round"
            />
          </g>
        );
      case "dot": {
        const r = Math.max(2, sw * 1.2);
        return (
          <g filter={glowEnabled ? `url(#${glowId})` : undefined}>
            <circle cx={tipX} cy={topEndY} r={r} fill={strokeColor} />
            <circle cx={tipX} cy={botEndY} r={r} fill={strokeColor} />
          </g>
        );
      }
      case "diamond": {
        const ds = s * 0.4;
        return (
          <g filter={glowEnabled ? `url(#${glowId})` : undefined}>
            <path d={`M ${tipX} ${topEndY - ds} L ${tipX + ds * dir} ${topEndY} L ${tipX} ${topEndY + ds} L ${tipX - ds * dir} ${topEndY} Z`} fill={strokeColor} opacity="0.8" />
            <path d={`M ${tipX} ${botEndY - ds} L ${tipX + ds * dir} ${botEndY} L ${tipX} ${botEndY + ds} L ${tipX - ds * dir} ${botEndY} Z`} fill={strokeColor} opacity="0.8" />
          </g>
        );
      }
      default:
        return null;
    }
  };

  const renderInnerLines = () => {
    if (!innerLine) return null;
    return (
      <g opacity="0.4">
        <path d={buildInnerLinePath("left", true)} fill="none" stroke={strokeColor} strokeWidth={sw * 0.4} />
        <path d={buildInnerLinePath("right", true)} fill="none" stroke={strokeColor} strokeWidth={sw * 0.4} />
        <path d={buildInnerLinePath("left", false)} fill="none" stroke={strokeColor} strokeWidth={sw * 0.4} />
        <path d={buildInnerLinePath("right", false)} fill="none" stroke={strokeColor} strokeWidth={sw * 0.4} />
      </g>
    );
  };

  const renderFullWidthCenterLine = () => {
    const leftWingTip = cx - wingWidth;
    const rightWingTip = cx + wingWidth;
    return (
      <g>
        <line x1={0} y1={midY} x2={leftWingTip} y2={midY} stroke={strokeColor} strokeWidth={sw * 0.6} opacity="0.5" />
        <line x1={rightWingTip} y1={midY} x2={W} y2={midY} stroke={strokeColor} strokeWidth={sw * 0.6} opacity="0.5" />
      </g>
    );
  };

  const renderEdgeMarkers = () => {
    const edgeLen = Math.max(3, sw * 4);
    const edgeH = Math.max(3, sw * 4);
    return (
      <g opacity="0.7" filter={glowEnabled ? `url(#${glowId})` : undefined}>
        <path d={`M 0 ${midY - edgeH} L ${edgeLen} ${midY - edgeH} L ${edgeLen} ${midY} L 0 ${midY}`} fill="none" stroke={strokeColor} strokeWidth={sw * 0.8} />
        <path d={`M 0 ${midY + edgeH} L ${edgeLen} ${midY + edgeH} L ${edgeLen} ${midY} L 0 ${midY}`} fill="none" stroke={strokeColor} strokeWidth={sw * 0.8} />
        <path d={`M ${W} ${midY - edgeH} L ${W - edgeLen} ${midY - edgeH} L ${W - edgeLen} ${midY} L ${W} ${midY}`} fill="none" stroke={strokeColor} strokeWidth={sw * 0.8} />
        <path d={`M ${W} ${midY + edgeH} L ${W - edgeLen} ${midY + edgeH} L ${W - edgeLen} ${midY} L ${W} ${midY}`} fill="none" stroke={strokeColor} strokeWidth={sw * 0.8} />
      </g>
    );
  };

  return (
    <DecorationWrapper config={config}>
      <Box ref={containerRef} sx={{ width: "100%", height: "100%", opacity: fc.opacity, overflow: "visible" }}>
        {hasAnim && (
          <style>{`
            @keyframes deco-tf-dw-scan-${uid} {
              0%   { transform: translateX(${-W * 0.15}px); opacity: 0; }
              8%   { opacity: 1; }
              92%  { opacity: 1; }
              100% { transform: translateX(${W * 1.15}px); opacity: 0; }
            }
            @keyframes deco-tf-dw-pulse-${uid} {
              0%   { opacity: 0.6; transform: scale(1); }
              50%  { opacity: 1; transform: scale(1.15); }
              100% { opacity: 0.6; transform: scale(1); }
            }
            @keyframes deco-tf-dw-flowl-${uid} {
              0%   { transform: translateX(${wingWidth * 0.8}px); opacity: 0; }
              10%  { opacity: 0.7; }
              90%  { opacity: 0.7; }
              100% { transform: translateX(${-wingWidth * 0.8}px); opacity: 0; }
            }
            @keyframes deco-tf-dw-flowr-${uid} {
              0%   { transform: translateX(${-wingWidth * 0.8}px); opacity: 0; }
              10%  { opacity: 0.7; }
              90%  { opacity: 0.7; }
              100% { transform: translateX(${wingWidth * 0.8}px); opacity: 0; }
            }
          `}</style>
        )}
        <svg
          width="100%"
          height="100%"
          style={{ overflow: "visible" }}
        >
          <defs>
            <linearGradient id={bgGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={wingFillBase} stopOpacity={wingFillOpacity * 0.06} />
              <stop offset="50%" stopColor={wingFillBase} stopOpacity={wingFillOpacity * 0.03} />
              <stop offset="100%" stopColor={wingFillBase} stopOpacity={wingFillOpacity * 0.06} />
            </linearGradient>
            <linearGradient id={wingGradLId} x1="1" y1="0" x2="0" y2="0">
              <stop offset="0%" stopColor={wingFillBase} stopOpacity={wingFillOpacity * 0.15} />
              <stop offset="100%" stopColor={wingFillBase} stopOpacity={wingFillOpacity * 0.02} />
            </linearGradient>
            <linearGradient id={wingGradRId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={wingFillBase} stopOpacity={wingFillOpacity * 0.15} />
              <stop offset="100%" stopColor={wingFillBase} stopOpacity={wingFillOpacity * 0.02} />
            </linearGradient>
            <linearGradient id={scanId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={glowColor} stopOpacity="0" />
              <stop offset="40%" stopColor={glowColor} stopOpacity="0.4" />
              <stop offset="60%" stopColor={glowColor} stopOpacity="0.4" />
              <stop offset="100%" stopColor={glowColor} stopOpacity="0" />
            </linearGradient>
            {glowEnabled && (
              <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feFlood floodColor={glowColor} floodOpacity="0.6" result="color" />
                <feComposite in="color" in2="blur" operator="in" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            )}
            <clipPath id={clipId}>
              <rect x={0} y={0} width={W} height={H} />
            </clipPath>
          </defs>

          <g clipPath={`url(#${clipId})`}>
          <rect x={0} y={0} width={W} height={H} fill={`url(#${bgGradId})`} />

          {renderFullWidthCenterLine()}

          <path d={buildWingFill("left")} fill={`url(#${wingGradLId})`} />
          <path d={buildWingFill("right")} fill={`url(#${wingGradRId})`} />

          <path d={buildWingStroke("left")} fill="none" stroke={strokeColor} strokeWidth={sw} filter={glowEnabled ? `url(#${glowId})` : undefined} />
          <path d={buildWingStroke("right")} fill="none" stroke={strokeColor} strokeWidth={sw} filter={glowEnabled ? `url(#${glowId})` : undefined} />

          {renderInnerLines()}

          {centerPulse && centerAnchor !== "none" ? (
            <g style={{ transformOrigin: `${cx}px ${midY}px`, animation: `deco-tf-dw-pulse-${uid} ${speed * 0.8}ms ease-in-out infinite` }}>
              {renderCenterAnchor()}
            </g>
          ) : (
            renderCenterAnchor()
          )}

          {renderWingTip("left")}
          {renderWingTip("right")}

          {renderEdgeMarkers()}

          {wingFlow && (
            <g>
              <rect
                x={cx - wingWidth} y={midY - wingSpread}
                width={wingWidth * 0.3} height={wingSpread * 2}
                fill={`url(#${scanId})`}
                style={{ animation: `deco-tf-dw-flowl-${uid} ${speed}ms linear infinite` }}
              />
              <rect
                x={cx + wingWidth * 0.7} y={midY - wingSpread}
                width={wingWidth * 0.3} height={wingSpread * 2}
                fill={`url(#${scanId})`}
                style={{ animation: `deco-tf-dw-flowr-${uid} ${speed}ms linear infinite` }}
              />
            </g>
          )}

          {scanLine && (
            <rect
              x={-W * 0.15} y={0}
              width={W * 0.3} height={H}
              fill={`url(#${scanId})`}
              style={{ animation: `deco-tf-dw-scan-${uid} ${speed}ms ease-in-out infinite` }}
            />
          )}
          </g>
          {(() => {
            const text = (config.text as string) ?? "标题";
            const color = (config.color as string) || "#ffffff";
            const baseFontSize = (config.fontSize as number) ?? 20;
            // 根据组件高度动态调整 fontSize，避免文字过大超出边界
            const fontSize = Math.max(12, Math.min(baseFontSize, H * 0.35));
            return (
              <text
                x={cx}
                y={midY}
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
