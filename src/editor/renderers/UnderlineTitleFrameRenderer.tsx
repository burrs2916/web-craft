import { useRef, useEffect, useState, useCallback } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { DecorationWrapper } from "./DecorationWrapper";
import { getTitleFrameConfig, useFrameUid } from "./TitleFramePrimitives";

type LineStyle = "gradient" | "single" | "double" | "dashed" | "beam" | "pulse";
type EndCapStyle = "none" | "dot" | "glow" | "diamond" | "arrow" | "flare";
type CenterDecor = "none" | "diamond" | "dot" | "ring" | "star" | "cross" | "shortLine";

export function UnderlineTitleFrameRenderer({ config, width: propW, height: propH }: ComponentRendererProps) {
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

  const lineStyle = (config.lineStyle as LineStyle) ?? "gradient";
  const endCapStyle = (config.endCapStyle as EndCapStyle) ?? "none";
  const centerDecor = (config.centerDecor as CenterDecor) ?? "diamond";
  const linePosition = (config.linePosition as number) ?? 0;
  const lineLength = (config.lineLength as number) ?? 96;
  const decorSize = (config.decorSize as number) ?? 100;
  const glowPulse = (config.glowPulse as boolean) ?? true;
  const flowLight = (config.flowLight as boolean) ?? true;
  const speed = (config.speed as number) ?? 3000;

  const glowEnabled = fc.glowEnabled;
  const glowColor = fc.glowColor || fc.stroke;
  const sw = fc.strokeWidth;

  const lineY = H - linePosition;
  const cx = W / 2;
  const halfLen = (lineLength / 100) * (W / 2);
  const lineStartX = Math.max(0, cx - halfLen);
  const lineEndX = Math.min(W, cx + halfLen);
  const ds = Math.max(3, sw * 2.2 * (decorSize / 100));

  const gradId = `tf-ul-grad-${uid}`;
  const grad2Id = `tf-ul-grad2-${uid}`;
  const beamGradId = `tf-ul-beam-${uid}`;
  const glowId = `tf-ul-glow-${uid}`;
  const flowId = `tf-ul-flow-${uid}`;
  const bgGradId = `tf-ul-bg-${uid}`;
  const upGlowId = `tf-ul-upglow-${uid}`;
  const sideGradLId = `tf-ul-sidel-${uid}`;
  const sideGradRId = `tf-ul-sider-${uid}`;
  const clipId = `tf-ul-clip-${uid}`;

  const hasAnim = glowPulse || flowLight || lineStyle === "pulse";

  const renderEndCap = (x: number, side: "left" | "right") => {
    if (endCapStyle === "none") return null;
    const dir = side === "left" ? -1 : 1;
    const s = Math.max(3, sw * 2.5 * (decorSize / 100));

    switch (endCapStyle) {
      case "dot": {
        const r = Math.max(2, sw * 1.5 * (decorSize / 100));
        return (
          <circle
            cx={x} cy={lineY} r={r}
            fill={fc.stroke}
            filter={glowEnabled ? `url(#${glowId})` : undefined}
          />
        );
      }
      case "glow": {
        const r = Math.max(3, sw * 2 * (decorSize / 100));
        return (
          <g filter={glowEnabled ? `url(#${glowId})` : undefined}>
            <circle cx={x} cy={lineY} r={r * 1.8} fill={glowColor} opacity="0.15" />
            <circle cx={x} cy={lineY} r={r} fill={glowColor} opacity="0.5" />
            <circle cx={x} cy={lineY} r={r * 0.4} fill="#fff" opacity="0.8" />
          </g>
        );
      }
      case "diamond":
        return (
          <path
            d={`M ${x} ${lineY - ds} L ${x + ds * dir} ${lineY} L ${x} ${lineY + ds} L ${x - ds * dir} ${lineY} Z`}
            fill={fc.stroke}
            opacity="0.9"
            filter={glowEnabled ? `url(#${glowId})` : undefined}
          />
        );
      case "arrow":
        return (
          <path
            d={`M ${x + s * dir} ${lineY - s * 0.5} L ${x} ${lineY} L ${x + s * dir} ${lineY + s * 0.5}`}
            fill="none"
            stroke={fc.stroke}
            strokeWidth={sw * 0.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={glowEnabled ? `url(#${glowId})` : undefined}
          />
        );
      case "flare":
        return (
          <g filter={glowEnabled ? `url(#${glowId})` : undefined}>
            <line x1={x} y1={lineY} x2={x + s * 1.2 * dir} y2={lineY - s * 0.5} stroke={fc.stroke} strokeWidth={sw * 0.6} strokeLinecap="round" />
            <line x1={x} y1={lineY} x2={x + s * 1.2 * dir} y2={lineY + s * 0.5} stroke={fc.stroke} strokeWidth={sw * 0.6} strokeLinecap="round" />
            <line x1={x} y1={lineY} x2={x + s * 0.8 * dir} y2={lineY} stroke={fc.stroke} strokeWidth={sw * 0.4} strokeLinecap="round" />
          </g>
        );
      default:
        return null;
    }
  };

  const renderCenterDecor = () => {
    if (centerDecor === "none") return null;
    const s = Math.max(3, sw * 2.5 * (decorSize / 100));
    const filterAttr = glowEnabled ? `url(#${glowId})` : undefined;

    switch (centerDecor) {
      case "dot": {
        const r = Math.max(2.5, sw * 1.8 * (decorSize / 100));
        return (
          <g filter={filterAttr}>
            <circle cx={cx} cy={lineY} r={r * 1.6} fill={glowColor} opacity="0.2" />
            <circle cx={cx} cy={lineY} r={r} fill={glowColor} />
          </g>
        );
      }
      case "diamond":
        return (
          <g filter={filterAttr}>
            <path
              d={`M ${cx} ${lineY - ds * 1.5} L ${cx + ds * 1.5} ${lineY} L ${cx} ${lineY + ds * 1.5} L ${cx - ds * 1.5} ${lineY} Z`}
              fill={glowColor} opacity="0.15"
            />
            <path
              d={`M ${cx} ${lineY - ds} L ${cx + ds} ${lineY} L ${cx} ${lineY + ds} L ${cx - ds} ${lineY} Z`}
              fill={glowColor} opacity="0.9"
            />
          </g>
        );
      case "ring": {
        const r = Math.max(3, sw * 2.5 * (decorSize / 100));
        return (
          <g filter={filterAttr}>
            <circle cx={cx} cy={lineY} r={r * 1.5} fill={glowColor} opacity="0.1" />
            <circle cx={cx} cy={lineY} r={r} fill="none" stroke={glowColor} strokeWidth={sw * 0.8} opacity="0.9" />
            <circle cx={cx} cy={lineY} r={r * 0.3} fill={glowColor} opacity="0.6" />
          </g>
        );
      }
      case "star": {
        const outerR = Math.max(4, sw * 3 * (decorSize / 100));
        const innerR = outerR * 0.4;
        const points = 4;
        let d = "";
        for (let i = 0; i < points * 2; i++) {
          const angle = (Math.PI / points) * i - Math.PI / 2;
          const r = i % 2 === 0 ? outerR : innerR;
          const px = cx + r * Math.cos(angle);
          const py = lineY + r * Math.sin(angle);
          d += (i === 0 ? "M" : "L") + ` ${px} ${py} `;
        }
        d += "Z";
        return (
          <g filter={filterAttr}>
            <circle cx={cx} cy={lineY} r={outerR * 1.3} fill={glowColor} opacity="0.1" />
            <path d={d} fill={glowColor} opacity="0.9" />
          </g>
        );
      }
      case "cross":
        return (
          <g filter={filterAttr}>
            <line x1={cx - s * 0.7} y1={lineY} x2={cx + s * 0.7} y2={lineY} stroke={glowColor} strokeWidth={sw * 0.8} />
            <line x1={cx} y1={lineY - s * 0.7} x2={cx} y2={lineY + s * 0.7} stroke={glowColor} strokeWidth={sw * 0.8} />
          </g>
        );
      case "shortLine": {
        const halfLen2 = Math.max(6, W * 0.04);
        return (
          <line
            x1={cx - halfLen2} y1={lineY} x2={cx + halfLen2} y2={lineY}
            stroke={glowColor}
            strokeWidth={sw * 1.8}
            strokeLinecap="round"
            filter={filterAttr}
          />
        );
      }
      default:
        return null;
    }
  };

  const renderMainLine = () => {
    const filterAttr = glowEnabled ? `url(#${glowId})` : undefined;

    switch (lineStyle) {
      case "single":
        return (
          <line
            x1={lineStartX} y1={lineY} x2={lineEndX} y2={lineY}
            stroke={fc.stroke}
            strokeWidth={sw * 1.5}
            strokeLinecap="round"
            filter={filterAttr}
          />
        );
      case "double": {
        const gap = Math.max(2, sw * 2);
        return (
          <g filter={filterAttr}>
            <line x1={lineStartX} y1={lineY - gap} x2={lineEndX} y2={lineY - gap} stroke={`url(#${gradId})`} strokeWidth={sw} strokeLinecap="round" />
            <line x1={lineStartX} y1={lineY + gap} x2={lineEndX} y2={lineY + gap} stroke={`url(#${gradId})`} strokeWidth={sw * 0.6} strokeLinecap="round" opacity="0.5" />
          </g>
        );
      }
      case "gradient":
        return (
          <line
            x1={lineStartX} y1={lineY} x2={lineEndX} y2={lineY}
            stroke={`url(#${gradId})`}
            strokeWidth={sw * 1.5}
            strokeLinecap="round"
            filter={filterAttr}
          />
        );
      case "dashed":
        return (
          <line
            x1={lineStartX} y1={lineY} x2={lineEndX} y2={lineY}
            stroke={`url(#${gradId})`}
            strokeWidth={sw * 1.2}
            strokeDasharray={`${Math.max(8, W * 0.03)} ${Math.max(3, W * 0.01)}`}
            strokeLinecap="round"
            filter={filterAttr}
          />
        );
      case "beam":
        return (
          <g>
            <rect
              x={lineStartX} y={lineY - sw * 3}
              width={lineEndX - lineStartX} height={sw * 6}
              fill={`url(#${beamGradId})`}
              filter={filterAttr}
            />
            <line
              x1={lineStartX} y1={lineY} x2={lineEndX} y2={lineY}
              stroke={`url(#${gradId})`}
              strokeWidth={sw * 0.8}
              strokeLinecap="round"
            />
          </g>
        );
      case "pulse":
        return (
          <g>
            <line
              x1={lineStartX} y1={lineY} x2={lineEndX} y2={lineY}
              stroke={`url(#${gradId})`}
              strokeWidth={sw * 1.5}
              strokeLinecap="round"
              filter={filterAttr}
              style={{ animation: `deco-tf-ul-linepulse-${uid} ${speed}ms ease-in-out infinite` }}
            />
          </g>
        );
      default:
        return null;
    }
  };

  const renderUpGlow = () => {
    if (!glowEnabled) return null;
    const glowH = lineY;
    if (glowH <= 0) return null;
    return (
      <rect
        x={lineStartX} y={0}
        width={lineEndX - lineStartX} height={glowH}
        fill={`url(#${upGlowId})`}
        opacity={glowPulse ? undefined : "0.5"}
        style={glowPulse ? {
          animation: `deco-tf-ul-pulse-${uid} ${speed * 1.2}ms ease-in-out infinite`,
        } : undefined}
      />
    );
  };

  const renderSideEdges = () => {
    const edgeH = lineY;
    if (edgeH <= 0) return null;
    const edgeOpacity = 0.12;
    return (
      <g opacity={edgeOpacity}>
        <rect x={lineStartX} y={0} width={sw * 0.5} height={edgeH} fill={`url(#${sideGradLId})`} />
        <rect x={lineEndX - sw * 0.5} y={0} width={sw * 0.5} height={edgeH} fill={`url(#${sideGradRId})`} />
      </g>
    );
  };

  return (
    <DecorationWrapper config={config}>
      <Box ref={containerRef} sx={{ width: "100%", height: "100%", opacity: fc.opacity, overflow: "visible" }}>
        {hasAnim && (
          <style>{`
            @keyframes deco-tf-ul-flow-${uid} {
              0%   { transform: translateX(${-W * 0.3}px); opacity: 0; }
              8%   { opacity: 0.8; }
              92%  { opacity: 0.8; }
              100% { transform: translateX(${W * 1.3}px); opacity: 0; }
            }
            @keyframes deco-tf-ul-pulse-${uid} {
              0%   { opacity: 0.3; }
              50%  { opacity: 0.7; }
              100% { opacity: 0.3; }
            }
            @keyframes deco-tf-ul-linepulse-${uid} {
              0%   { opacity: 0.4; strokeWidth: ${sw * 1.2}; }
              50%  { opacity: 1; strokeWidth: ${sw * 2.5}; }
              100% { opacity: 0.4; strokeWidth: ${sw * 1.2}; }
            }
          `}</style>
        )}
        <svg
          width="100%"
          height="100%"
          style={{ overflow: "visible" }}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={fc.stroke} stopOpacity="0" />
              <stop offset="8%" stopColor={fc.stroke} stopOpacity="0.4" />
              <stop offset="20%" stopColor={fc.stroke} stopOpacity="1" />
              <stop offset="50%" stopColor={fc.stroke} stopOpacity="1" />
              <stop offset="80%" stopColor={fc.stroke} stopOpacity="1" />
              <stop offset="92%" stopColor={fc.stroke} stopOpacity="0.4" />
              <stop offset="100%" stopColor={fc.stroke} stopOpacity="0" />
            </linearGradient>
            <linearGradient id={grad2Id} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={fc.stroke} stopOpacity="0.05" />
              <stop offset="20%" stopColor={fc.stroke} stopOpacity="0.2" />
              <stop offset="50%" stopColor={fc.stroke} stopOpacity="0.3" />
              <stop offset="80%" stopColor={fc.stroke} stopOpacity="0.2" />
              <stop offset="100%" stopColor={fc.stroke} stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id={beamGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={glowColor} stopOpacity="0" />
              <stop offset="35%" stopColor={glowColor} stopOpacity="0.08" />
              <stop offset="50%" stopColor={glowColor} stopOpacity="0.2" />
              <stop offset="65%" stopColor={glowColor} stopOpacity="0.08" />
              <stop offset="100%" stopColor={glowColor} stopOpacity="0" />
            </linearGradient>
            <linearGradient id={bgGradId} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={glowColor} stopOpacity="0.12" />
              <stop offset="30%" stopColor={glowColor} stopOpacity="0.06" />
              <stop offset="70%" stopColor={glowColor} stopOpacity="0.02" />
              <stop offset="100%" stopColor={glowColor} stopOpacity="0" />
            </linearGradient>
            <linearGradient id={upGlowId} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={glowColor} stopOpacity="0.35" />
              <stop offset="15%" stopColor={glowColor} stopOpacity="0.18" />
              <stop offset="40%" stopColor={glowColor} stopOpacity="0.06" />
              <stop offset="100%" stopColor={glowColor} stopOpacity="0" />
            </linearGradient>
            <linearGradient id={sideGradLId} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={fc.stroke} stopOpacity="1" />
              <stop offset="40%" stopColor={fc.stroke} stopOpacity="0.3" />
              <stop offset="100%" stopColor={fc.stroke} stopOpacity="0" />
            </linearGradient>
            <linearGradient id={sideGradRId} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={fc.stroke} stopOpacity="1" />
              <stop offset="40%" stopColor={fc.stroke} stopOpacity="0.3" />
              <stop offset="100%" stopColor={fc.stroke} stopOpacity="0" />
            </linearGradient>
            <linearGradient id={flowId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={glowColor} stopOpacity="0" />
              <stop offset="30%" stopColor={glowColor} stopOpacity="0.3" />
              <stop offset="50%" stopColor={glowColor} stopOpacity="0.7" />
              <stop offset="70%" stopColor={glowColor} stopOpacity="0.3" />
              <stop offset="100%" stopColor={glowColor} stopOpacity="0" />
            </linearGradient>
            {glowEnabled && (
              <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="2" result="blur1" />
                <feGaussianBlur stdDeviation="5" result="blur2" />
                <feMerge>
                  <feMergeNode in="blur2" />
                  <feMergeNode in="blur1" />
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

          {renderUpGlow()}

          {renderSideEdges()}

          {renderMainLine()}

          {lineStyle === "double" && (
            <line
              x1={lineStartX} y1={lineY} x2={lineEndX} y2={lineY}
              stroke={`url(#${grad2Id})`}
              strokeWidth={sw * 0.3}
              opacity="0.3"
            />
          )}

          {renderCenterDecor()}

          {renderEndCap(lineStartX, "left")}
          {renderEndCap(lineEndX, "right")}

          {flowLight && (
            <rect
              x={-W * 0.15} y={lineY - sw * 4}
              width={W * 0.3} height={sw * 8}
              fill={`url(#${flowId})`}
              style={{ animation: `deco-tf-ul-flow-${uid} ${speed}ms ease-in-out infinite` }}
            />
          )}
          </g>
          {(() => {
            const text = (config.text as string) ?? "标题";
            const color = (config.color as string) || "#ffffff";
            const fontSize = (config.fontSize as number) ?? 20;
            return (
              <text
                x={W / 2}
                y={lineY - sw * 6}
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
