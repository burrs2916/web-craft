import { useId, useRef, useEffect, useState, useCallback } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { DecorationWrapper } from "./DecorationWrapper";

/**
 * 分区分隔边框组件
 *
 * 用 SVG 绘制矩形区域装饰边框：
 * - 1. 主体细线（圆角矩形）
 * - 2. 四角 L 形装饰（科技风）
 * - 3. 四角发光点（呼吸效果）
 * - 4. 边缘流光（沿矩形边框顺时针流动）
 * - 5. 区域名称徽章（左上角 / 右上角可选）
 * - 6. 内部编号（如 "01"/"02"/"03"）
 */
export function RegionFrameRenderer({ config, width: propW, height: propH }: ComponentRendererProps) {
  const uid = useId().replace(/[:]/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: propW ?? 600, h: propH ?? 800 });

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

  // ─── 排版 ───
  const labelColor = (config.labelColor as string) || "#4fc3f7";
  const labelFontSize = (config.labelFontSize as number) ?? 14;
  const indexText = (config.indexText as string) ?? "01";
  const indexColor = (config.indexColor as string) || "#4fc3f7";

  // ─── 边框 ───
  const stroke = (config.stroke as string) || "#4fc3f7";
  const strokeWidth = (config.strokeWidth as number) ?? 1.5;
  const cornerLength = (config.cornerLength as number) ?? 40;
  const cornerThickness = (config.cornerThickness as number) ?? 2.5;
  const cornerSize = (config.cornerSize as number) ?? 12; // L 形末端小斜线长度
  const cornerStyle = (config.cornerStyle as "sharp" | "rounded") || "rounded";
  const borderRadius = (config.borderRadius as number) ?? 8;

  // ─── 发光 ───
  const glowEnabled = (config.glowEnabled as boolean) ?? true;
  const glowColor = (config.glowColor as string) || "#4fc3f7";
  const glowIntensity = (config.glowIntensity as number) ?? 3;
  // cheapGlow：组件级边框在 4K/WKWebView 下改用"宽半透明描边"模拟外发光，
  // 避免 feGaussianBlur 的 CPU 光栅化（4K 下每帧/每次重渲染都重算，是卡顿主因）。
  // 默认开启（覆盖层与区域大框 36/37/38 均走廉价发光，去掉主大屏全部 feGaussianBlur）；
  // 个别组件如需真实模糊，显式 cheapGlow:false 即可。
  const cheapGlow = (config.cheapGlow as boolean) ?? true;
  const pulse = (config.pulse as boolean) ?? true;
  const flowLight = (config.flowLight as boolean) ?? true;
  // 霓虹闪烁：开启时用锐利/不规则的明灭关键帧（像霓虹灯管），默认关闭以保留平滑呼吸。
  const neonFlicker = (config.neonFlicker as boolean) ?? false;
  const blinkAnim = neonFlicker
    ? `rf-neon-${uid} 3.2s linear infinite`
    : pulse
      ? `rf-pulse-${uid} 2.5s ease-in-out infinite`
      : undefined;

  // ─── 角点光点 ───
  const cornerDotSize = (config.cornerDotSize as number) ?? 4;
  const showCornerDots = (config.showCornerDots as boolean) ?? true;

  // ─── 编号 ───
  const showIndex = (config.showIndex as boolean) ?? true;

  // 几何计算
  // frameInset：组件级边框可显式指定内缩量（贴边包裹内容），缺省沿用区域大框的
  // cornerLength/3 经验内缩，避免大框四角与内容贴死。
  const frameInsetRaw = config.frameInset;
  const padding =
    typeof frameInsetRaw === "number" && frameInsetRaw >= 0
      ? frameInsetRaw
      : Math.max(8, cornerLength / 3);
  const rectX = padding;
  const rectY = padding;
  const rectW = Math.max(0, W - padding * 2);
  const rectH = Math.max(0, H - padding * 2);

  // 边框路径（用于流光和发光）
  const rectPath = `M ${rectX + borderRadius} ${rectY}
                    L ${rectX + rectW - borderRadius} ${rectY}
                    Q ${rectX + rectW} ${rectY}, ${rectX + rectW} ${rectY + borderRadius}
                    L ${rectX + rectW} ${rectY + rectH - borderRadius}
                    Q ${rectX + rectW} ${rectY + rectH}, ${rectX + rectW - borderRadius} ${rectY + rectH}
                    L ${rectX + borderRadius} ${rectY + rectH}
                    Q ${rectX} ${rectY + rectH}, ${rectX} ${rectY + rectH - borderRadius}
                    L ${rectX} ${rectY + borderRadius}
                    Q ${rectX} ${rectY}, ${rectX + borderRadius} ${rectY} Z`;

  // 边框总长（用于流光动画 stroke-dasharray）
  const pathLength = 2 * (rectW + rectH - 4 * borderRadius) + 2 * Math.PI * borderRadius;

  // id
  const glowId = `rf-glow-${uid}`;
  const labelGradId = `rf-label-${uid}`;
  const flowGradId = `rf-flowgrad-${uid}`;

  // L 形角标 path
  const renderCorner = (cx: number, cy: number, dir: "tl" | "tr" | "bl" | "br") => {
    const L = cornerLength;
    const S = cornerSize;
    let path = "";
    let endMark1 = "";
    let endMark2 = "";
    if (dir === "tl") {
      path = `M ${cx} ${cy + L} L ${cx} ${cy} L ${cx + L} ${cy}`;
      endMark1 = `M ${cx - S} ${cy} L ${cx} ${cy} L ${cx} ${cy - S}`;
      endMark2 = `M ${cx} ${cy} L ${cx + S} ${cy + S * 0.3}`;
    } else if (dir === "tr") {
      path = `M ${cx - L} ${cy} L ${cx} ${cy} L ${cx} ${cy + L}`;
      endMark1 = `M ${cx + S} ${cy} L ${cx} ${cy} L ${cx} ${cy - S}`;
      endMark2 = `M ${cx} ${cy} L ${cx - S} ${cy + S * 0.3}`;
    } else if (dir === "bl") {
      path = `M ${cx} ${cy - L} L ${cx} ${cy} L ${cx + L} ${cy}`;
      endMark1 = `M ${cx - S} ${cy} L ${cx} ${cy} L ${cx} ${cy + S}`;
      endMark2 = `M ${cx} ${cy} L ${cx + S} ${cy - S * 0.3}`;
    } else if (dir === "br") {
      path = `M ${cx - L} ${cy} L ${cx} ${cy} L ${cx} ${cy - L}`;
      endMark1 = `M ${cx + S} ${cy} L ${cx} ${cy} L ${cx} ${cy + S}`;
      endMark2 = `M ${cx} ${cy} L ${cx - S} ${cy - S * 0.3}`;
    }
    return { path, endMark1, endMark2 };
  };

  const tl = renderCorner(rectX, rectY, "tl");
  const tr = renderCorner(rectX + rectW, rectY, "tr");
  const bl = renderCorner(rectX, rectY + rectH, "bl");
  const br = renderCorner(rectX + rectW, rectY + rectH, "br");

  // 标签位置
  const labelY = Math.max(8, padding - 4);

  // 内部编号位置（右上角）
  const indexX = W - padding;
  const indexY = labelY;
  const indexAnchor: "end" = "end";

  return (
    <DecorationWrapper config={config}>
      {/* 闪烁/呼吸动画挂在外层 Box 上，并提升为独立合成层：
          带 feGaussianBlur 的 SVG 只光栅化一次（缓存为纹理），
          闪烁仅改变图层 opacity（GPU 合成），避免每帧重光栅整框模糊 +
          整层提交，从而在 4K 下不再触发 WebKit display-link 崩溃。 */}
      <Box
        ref={containerRef}
        sx={{ width: "100%", height: "100%", overflow: "visible" }}
        style={{ animation: blinkAnim, willChange: "opacity" }}
      >
        {pulse && !neonFlicker && (
          <style>{`
            @keyframes rf-pulse-${uid} {
              0%, 100% { opacity: 0.65; }
              50% { opacity: 1; }
            }
          `}</style>
        )}
        {neonFlicker && (
          <style>{`
            @keyframes rf-neon-${uid} {
              0% { opacity: 1; }
              6% { opacity: 1; }
              7% { opacity: 0.35; }
              9% { opacity: 1; }
              40% { opacity: 1; }
              41% { opacity: 0.2; }
              43% { opacity: 0.9; }
              44% { opacity: 0.3; }
              46% { opacity: 1; }
              68% { opacity: 1; }
              69% { opacity: 0.5; }
              71% { opacity: 1; }
            }
          `}</style>
        )}
        <svg width="100%" height="100%" style={{ overflow: "visible" }}>
          <defs>
            {/* 发光滤镜（仅真实发光模式；cheapGlow 模式不创建滤镜，避免 4K 下 CPU 光栅化） */}
            {glowEnabled && !cheapGlow && (
              <filter id={glowId} x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur stdDeviation={Math.max(0.5, glowIntensity * 0.5)} result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            )}
            {/* 标签渐变背景 */}
            <linearGradient id={labelGradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={labelColor} stopOpacity="0.0" />
              <stop offset="20%" stopColor={labelColor} stopOpacity="0.15" />
              <stop offset="80%" stopColor={labelColor} stopOpacity="0.15" />
              <stop offset="100%" stopColor={labelColor} stopOpacity="0.0" />
            </linearGradient>
            {/* 流光渐变 */}
            <linearGradient id={flowGradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={glowColor} stopOpacity="0" />
              <stop offset="50%" stopColor={glowColor} stopOpacity="0.95" />
              <stop offset="100%" stopColor={glowColor} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* 廉价外发光（cheapGlow 模式）：用宽半透明描边模拟光晕，无 feGaussianBlur，
              4K/WKWebView 下不触发 CPU 滤镜光栅化。仅组件级边框启用，区域大框走下方真实模糊。 */}
          {glowEnabled && cheapGlow && (
            <g stroke={glowColor} fill="none" opacity={0.18} style={{ willChange: "opacity" }}>
              <path d={rectPath} strokeWidth={Math.max(strokeWidth * 3, 4)} />
              <g strokeWidth={cornerThickness * 2.5} strokeLinecap={cornerStyle === "rounded" ? "round" : "square"}>
                <path d={tl.path} />
                <path d={tr.path} />
                <path d={bl.path} />
                <path d={br.path} />
              </g>
            </g>
          )}

          {/* 整体外发光：模糊只光栅化一次（willChange 提升为独立层缓存），
              由外层 Box 统一闪烁，4K 下不每帧重光栅。cheapGlow 模式不加滤镜。 */}
          <g filter={glowEnabled && !cheapGlow ? `url(#${glowId})` : undefined} style={{ willChange: "opacity" }}>

            {/* 1) 主体细线矩形（透明 fill，只边框） */}
            <path
              d={rectPath}
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
              opacity={0.55}
            />

            {/* 2) 四角 L 形装饰（最显眼） */}
            <g stroke={stroke} strokeWidth={cornerThickness} fill="none" strokeLinecap={cornerStyle === "rounded" ? "round" : "square"}>
              <path d={tl.path} />
              <path d={tr.path} />
              <path d={bl.path} />
              <path d={br.path} />
              {/* 四角 L 末端的小斜线（科技感细节） */}
              {cornerSize > 0 && (
                <>
                  <path d={tl.endMark1} stroke={stroke} strokeWidth={cornerThickness * 0.6} opacity="0.7" />
                  <path d={tl.endMark2} stroke={stroke} strokeWidth={cornerThickness * 0.6} opacity="0.7" />
                  <path d={tr.endMark1} stroke={stroke} strokeWidth={cornerThickness * 0.6} opacity="0.7" />
                  <path d={tr.endMark2} stroke={stroke} strokeWidth={cornerThickness * 0.6} opacity="0.7" />
                  <path d={bl.endMark1} stroke={stroke} strokeWidth={cornerThickness * 0.6} opacity="0.7" />
                  <path d={bl.endMark2} stroke={stroke} strokeWidth={cornerThickness * 0.6} opacity="0.7" />
                  <path d={br.endMark1} stroke={stroke} strokeWidth={cornerThickness * 0.6} opacity="0.7" />
                  <path d={br.endMark2} stroke={stroke} strokeWidth={cornerThickness * 0.6} opacity="0.7" />
                </>
              )}
            </g>

            {/* 3) 四角光点（随整框闪烁，不再单独挂动画以避免重复光栅） */}
            {showCornerDots && (
              <g fill={glowColor}>
                <circle cx={rectX} cy={rectY} r={cornerDotSize} />
                <circle cx={rectX + rectW} cy={rectY} r={cornerDotSize} />
                <circle cx={rectX} cy={rectY + rectH} r={cornerDotSize} />
                <circle cx={rectX + rectW} cy={rectY + rectH} r={cornerDotSize} />
              </g>
            )}

            {/* 4) 流光（沿矩形边框流动，随整框闪烁） */}
            {flowLight && (
              <path
                d={rectPath}
                fill="none"
                stroke={`url(#${flowGradId})`}
                strokeWidth={strokeWidth * 1.5}
                strokeDasharray={`${pathLength * 0.15} ${pathLength * 0.85}`}
                strokeLinecap="round"
                opacity="0.85"
              />
            )}
          </g>

          {/* 5) 内部编号（右上角，独立于 labelPosition） */}
          {showIndex && indexText && (
            <text
              x={indexX}
              y={indexY}
              fill={indexColor}
              fontSize={labelFontSize * 1.6}
              fontWeight={700}
              textAnchor={indexAnchor}
              dominantBaseline="alphabetic"
              opacity="0.4"
              letterSpacing={2}
              style={{ userSelect: "none", fontFamily: "'Microsoft YaHei', 'PingFang SC', sans-serif" }}
            >
              {indexText}
            </text>
          )}
        </svg>
      </Box>
    </DecorationWrapper>
  );
}
