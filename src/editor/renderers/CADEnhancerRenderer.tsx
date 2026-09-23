import { useId } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { DecorationWrapper } from "./DecorationWrapper";

/**
 * CAD 装饰增强层（极致纯净版 — 0 横竖、0 矩形、0 线段）
 *
 * 设计原则（CAD 图纸本身由线条/区块构成 — 装饰绝不能引入任何"横""竖"形状）：
 *  1. 容器 100% 透明
 *  2. 0 横竖元素：禁用 <line> / <path> / <rect>（包括横向/竖向渐变光带）
 *  3. 仅保留 <circle>（圆点和径向光晕）—— 圆形是各向同性的，无"横""竖"感
 *  4. 4 个圆点严格位于 4 角小范围内（不进入 CAD 中心区）
 *
 * 此装饰层与 CAD 图纸完全正交：装饰是"圆点 + 圆光晕"，图纸是"线 + 区块"。
 */
export function CADEnhancerRenderer({ config }: ComponentRendererProps) {
  const uid = useId().replace(/[:]/g, "");

  const accent = (config.accent as string) || "#4fc3f7";
  const accent2 = (config.accent2 as string) || "#aedfff";

  const showCorners = (config.showCorners as boolean) ?? true;
  const cornerSize = (config.cornerSize as number) ?? 14; // 角部装饰的总半径
  const dotSize = (config.dotSize as number) ?? 2.5; // 中心点大小
  const showHalo = (config.showHalo as boolean) ?? true; // 4 角光晕

  // 4 角圆心（向中心偏移 innerOffset）
  //   SVG <circle> 的 cx/cy 不支持 calc()，改用「百分比锚点 + transform 平移」：
  //   右/下边锚定 100%，再用 transform=translate 向内偏移 innerOffset。
  const innerOffset = cornerSize + 4;
  const innerPos = {
    tl: { cx: 0, cy: 0, tx: innerOffset, ty: innerOffset },
    tr: { cx: "100%", cy: 0, tx: -innerOffset, ty: innerOffset },
    bl: { cx: 0, cy: "100%", tx: innerOffset, ty: -innerOffset },
    br: { cx: "100%", cy: "100%", tx: -innerOffset, ty: -innerOffset },
  };
  const cornerTransform = (p: { tx: number; ty: number }) => `translate(${p.tx}, ${p.ty})`;

  return (
    <DecorationWrapper config={config}>
      <Box
        sx={{
          width: "100%",
          height: "100%",
          position: "relative",
          pointerEvents: "none",
          overflow: "hidden",
          backgroundColor: "transparent",
          background: "transparent",
          backgroundImage: "none",
        }}
      >
        <style>{`
          @keyframes ce-pulse-${uid} {
            0%, 100% { opacity: 0.5; transform: scale(1); transform-origin: center; }
            50% { opacity: 1; transform: scale(1.15); transform-origin: center; }
          }
          @keyframes ce-halo-${uid} {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 0.7; }
          }
        `}</style>

        <svg
          width="100%"
          height="100%"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            overflow: "visible",
            background: "transparent",
          }}
        >
          <defs>
            {/* 4 角径向渐变光晕（圆形渐变 — 各向同性） */}
            <radialGradient id={`ce-halo-tl-${uid}`} cx="0%" cy="0%" r="100%">
              <stop offset="0%" stopColor={accent} stopOpacity="0.5" />
              <stop offset="40%" stopColor={accent} stopOpacity="0.18" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`ce-halo-tr-${uid}`} cx="100%" cy="0%" r="100%">
              <stop offset="0%" stopColor={accent} stopOpacity="0.5" />
              <stop offset="40%" stopColor={accent} stopOpacity="0.18" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`ce-halo-bl-${uid}`} cx="0%" cy="100%" r="100%">
              <stop offset="0%" stopColor={accent} stopOpacity="0.5" />
              <stop offset="40%" stopColor={accent} stopOpacity="0.18" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`ce-halo-br-${uid}`} cx="100%" cy="100%" r="100%">
              <stop offset="0%" stopColor={accent} stopOpacity="0.5" />
              <stop offset="40%" stopColor={accent} stopOpacity="0.18" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </radialGradient>

            {/* 4 角点光（中心高亮 → 边缘淡化） */}
            <radialGradient id={`ce-dot-${uid}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={accent2} stopOpacity="1" />
              <stop offset="50%" stopColor={accent} stopOpacity="0.7" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* 4 角光晕（4 个圆 — 4 角各 1 个） */}
          {showHalo && showCorners && (
            <g style={{ animation: `ce-halo-${uid} 3s ease-in-out infinite` }}>
              <circle cx={innerPos.tl.cx} cy={innerPos.tl.cy} transform={cornerTransform(innerPos.tl)} r={cornerSize * 2.2} fill={`url(#ce-halo-tl-${uid})`} />
              <circle cx={innerPos.tr.cx} cy={innerPos.tr.cy} transform={cornerTransform(innerPos.tr)} r={cornerSize * 2.2} fill={`url(#ce-halo-tr-${uid})`} />
              <circle cx={innerPos.bl.cx} cy={innerPos.bl.cy} transform={cornerTransform(innerPos.bl)} r={cornerSize * 2.2} fill={`url(#ce-halo-bl-${uid})`} />
              <circle cx={innerPos.br.cx} cy={innerPos.br.cy} transform={cornerTransform(innerPos.br)} r={cornerSize * 2.2} fill={`url(#ce-halo-br-${uid})`} />
            </g>
          )}

          {/* 4 角实心圆点（4 个圆 — 中心高亮 + 渐变小圆，呼吸效果） */}
          {showCorners && (
            <g>
              <circle cx={innerPos.tl.cx} cy={innerPos.tl.cy} transform={cornerTransform(innerPos.tl)} r={cornerSize * 0.6} fill={`url(#ce-dot-${uid})`} style={{ animation: `ce-pulse-${uid} 2.4s ease-in-out infinite` }} />
              <circle cx={innerPos.tr.cx} cy={innerPos.tr.cy} transform={cornerTransform(innerPos.tr)} r={cornerSize * 0.6} fill={`url(#ce-dot-${uid})`} style={{ animation: `ce-pulse-${uid} 2.4s ease-in-out infinite 0.6s` }} />
              <circle cx={innerPos.bl.cx} cy={innerPos.bl.cy} transform={cornerTransform(innerPos.bl)} r={cornerSize * 0.6} fill={`url(#ce-dot-${uid})`} style={{ animation: `ce-pulse-${uid} 2.4s ease-in-out infinite 1.2s` }} />
              <circle cx={innerPos.br.cx} cy={innerPos.br.cy} transform={cornerTransform(innerPos.br)} r={cornerSize * 0.6} fill={`url(#ce-dot-${uid})`} style={{ animation: `ce-pulse-${uid} 2.4s ease-in-out infinite 1.8s` }} />
              <circle cx={innerPos.tl.cx} cy={innerPos.tl.cy} transform={cornerTransform(innerPos.tl)} r={dotSize} fill={accent2} />
              <circle cx={innerPos.tr.cx} cy={innerPos.tr.cy} transform={cornerTransform(innerPos.tr)} r={dotSize} fill={accent2} />
              <circle cx={innerPos.bl.cx} cy={innerPos.bl.cy} transform={cornerTransform(innerPos.bl)} r={dotSize} fill={accent2} />
              <circle cx={innerPos.br.cx} cy={innerPos.br.cy} transform={cornerTransform(innerPos.br)} r={dotSize} fill={accent2} />
            </g>
          )}
        </svg>
      </Box>
    </DecorationWrapper>
  );
}
