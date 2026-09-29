import { useId } from "react";
import { BaseProps, useElementSize, withAlpha } from "./shared";

/* ===================== 扫描边框 BorderBox12 ===================== */

export function ScanBorder12({
  color1,
  color2,
  backgroundColor = "transparent",
  strokeWidth = 1,
  editorScale,
}: BaseProps) {
  const [ref, { width: w, height: h }] = useElementSize();
  const uid = useId().replace(/:/g, "");
  const filterId = `sb12-glow-${uid}`;
  const sw = Math.max(0.5, strokeWidth);
  const scale = editorScale && editorScale > 0 ? editorScale : 1;

  const mainStroke = 2 * sw;
  const cornerStroke = 2 * sw;
  const blur = 2 / scale;

  return (
    <div ref={ref} style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      >
        <defs>
          <filter id={filterId} height="150%" width="150%" x="-25%" y="-25%">
            <feMorphology operator="dilate" radius={sw} in="SourceAlpha" result="thicken" />
            <feGaussianBlur in="thicken" stdDeviation={blur} result="blurred" />
            <feFlood floodColor={withAlpha(color2, 0.7)} result="glowColor">
              <animate
                attributeName="flood-color"
                values={`${withAlpha(color2, 0.7)};${withAlpha(color2, 0.3)};${withAlpha(color2, 0.7)}`}
                dur="3s"
                begin="0s"
                repeatCount="indefinite"
              />
            </feFlood>
            <feComposite in="glowColor" in2="blurred" operator="in" result="softGlowColored" />
            <feMerge>
              <feMergeNode in="softGlowColored" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path
          fill={backgroundColor}
          stroke={color1}
          strokeWidth={mainStroke}
          vectorEffect="non-scaling-stroke"
          d={`
            M15 5 L ${w - 15} 5 Q ${w - 5} 5, ${w - 5} 15
            L ${w - 5} ${h - 15} Q ${w - 5} ${h - 5}, ${w - 15} ${h - 5}
            L 15, ${h - 5} Q 5 ${h - 5} 5 ${h - 15} L 5 15
            Q 5 5 15 5
          `}
        />
        <path
          fill="transparent"
          strokeWidth={cornerStroke}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          filter={`url(#${filterId})`}
          stroke={color2}
          d={`M 20 5 L 15 5 Q 5 5 5 15 L 5 20`}
        />
        <path
          fill="transparent"
          strokeWidth={cornerStroke}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          filter={`url(#${filterId})`}
          stroke={color2}
          d={`M ${w - 20} 5 L ${w - 15} 5 Q ${w - 5} 5 ${w - 5} 15 L ${w - 5} 20`}
        />
        <path
          fill="transparent"
          strokeWidth={cornerStroke}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          filter={`url(#${filterId})`}
          stroke={color2}
          d={`M ${w - 20} ${h - 5} L ${w - 15} ${h - 5} Q ${w - 5} ${h - 5} ${w - 5} ${h - 15} L ${w - 5} ${h - 20}`}
        />
        <path
          fill="transparent"
          strokeWidth={cornerStroke}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          filter={`url(#${filterId})`}
          stroke={color2}
          d={`M 20 ${h - 5} L 15 ${h - 5} Q 5 ${h - 5} 5 ${h - 15} L 5 ${h - 20}`}
        />
      </svg>
    </div>
  );
}

/* ===================== 折线角标边框 BorderBox13 ===================== */
/* 参考 SVG: vectorstock_50147517.svg
   结构层次（从底到顶）：
   1. 渐变填充的主体多边形（带斜切角，非对称）
   2. 内描边（白灰渐变，双线效果）
   3. 左下角斜切角标
   4. 右上角斜切角标
   5. 右下角梯形装饰条（蓝紫实色）
   6. 装饰条上的 10 条白色短竖线（30% 不透明）
   7. 外描边（蓝紫实色） */
export function PolylineBorder13({
  color1,
  color2,
  backgroundColor = "transparent",
  strokeWidth = 1,
  reverse = false,
}: BaseProps) {
  const [ref, { width: w, height: h }] = useElementSize();
  const uid = useId().replace(/:/g, "");
  const sw = Math.max(0.5, strokeWidth);

  // 使用与参考 SVG 一致的 viewBox 比例（1.7:1）
  const VBW = 2085;
  const VBH = 1223;

  // 比例尺：将参考 SVG 坐标映射到我们的 VBW
  // 我们的 viewBox 与参考图按比例缩放
  const scaleX = VBW / 2085;
  const scaleY = VBH / 1223;

  const gidGrad = `plb-grad-${uid}`;
  const gidGradStroke = `plb-grad-stroke-${uid}`;
  const gidMainFill = `plb-main-fill-${uid}`;
  const filterGlow = `plb-glow-${uid}`;

  // 参考 SVG 中的关键坐标（按比例缩放）
  // 主体多边形（带斜切角）
  const mainPolygon = [
    [0, 0],
    [0, 1121.5],
    [68.7, 1190.2],
    [1051.4, 1190.2],
    [1125.8, 1115.8],
    [2048.5, 1115.8],
    [2048.5, 69.8],
    [1983.8, 5],
    [1253.3, 5],
    [1202.3, 56],
    [500.3, 56],
    [446.2, 1.9],
  ].map(([x, y]) => `${x * scaleX},${y * scaleY}`).join(" ");

  // 内描边路径（双线，模拟参考图的 fill-rule 效果）
  const innerStrokePath = `
    M ${1056.8 * scaleX} ${1198 * scaleY}
    L ${71 * scaleX} ${1198 * scaleY}
    L 0 ${1127 * scaleY}
    L 0 0
    L ${451.6 * scaleX} ${2 * scaleY}
    L ${505.7 * scaleX} ${56.1 * scaleY}
    L ${1204.5 * scaleX} ${56.1 * scaleY}
    L ${1255.5 * scaleX} ${5.1 * scaleY}
    L ${1989.2 * scaleX} ${5.1 * scaleY}
    L ${2056.2 * scaleX} ${72.1 * scaleY}
    L ${2056.2 * scaleX} ${1123.5 * scaleY}
    L ${1131.3 * scaleX} ${1123.5 * scaleY}
    L ${1056.9 * scaleX} ${1197.9 * scaleY}
    Z
  `.trim();

  // 内描边路径 - 内层（缩进 7px 左右）
  const innerStrokePathInner = `
    M ${74.1 * scaleX} ${1190.3 * scaleY}
    L ${1053.6 * scaleX} ${1190.3 * scaleY}
    L ${1128 * scaleX} ${1115.9 * scaleY}
    L ${2048.5 * scaleX} ${1115.9 * scaleY}
    L ${2048.5 * scaleX} ${75.2 * scaleY}
    L ${1986 * scaleX} ${12.7 * scaleY}
    L ${1258.7 * scaleX} ${12.7 * scaleY}
    L ${1207.7 * scaleX} ${63.7 * scaleY}
    L ${502.5 * scaleX} ${63.7 * scaleY}
    L ${448.3 * scaleX} ${9.6 * scaleY}
    L ${7.5 * scaleX} ${7.7 * scaleY}
    L ${7.5 * scaleX} ${1123.8 * scaleY}
    L ${74 * scaleX} ${1190.3 * scaleY}
    Z
  `.trim();

  // 左下角斜切多边形
  const cornerBLPolygon = [
    [3.8, 133.2],
    [27.2, 109.9],
    [27.2, 53.7],
    [100.3, 53.7],
    [124.3, 29.8],
    [3.8, 29.8],
  ].map(([x, y]) => `${x * scaleX},${y * scaleY}`).join(" ");

  // 右上角斜切多边形
  const cornerTRPolygon = [
    [1595.7, 33.2],
    [1615.6, 53.1],
    [1978.1, 53.1],
    [2023.6, 98.6],
    [2052.4, 98.6],
    [1987.6, 33.2],
  ].map(([x, y]) => `${x * scaleX},${y * scaleY}`).join(" ");

  // 右下角梯形装饰条
  const bottomStripPolygon = [
    [2046.5, 1164.4],
    [2003, 1207],
    [1187.6, 1207],
    [1145, 1164.4],
  ].map(([x, y]) => `${x * scaleX},${y * scaleY}`).join(" ");

  // 外描边路径（比内描边大 24px）
  const outerStrokePath = `
    M ${1056.8 * scaleX} ${1222.3 * scaleY}
    L ${71 * scaleX} ${1222.3 * scaleY}
    L 0 ${1151.3 * scaleY}
    L 0 ${24.3 * scaleY}
    L ${451.6 * scaleX} ${26.3 * scaleY}
    L ${505.7 * scaleX} ${80.4 * scaleY}
    L ${1204.5 * scaleX} ${80.4 * scaleY}
    L ${1255.5 * scaleX} ${29.4 * scaleY}
    L ${1989.2 * scaleX} ${29.4 * scaleY}
    L ${2056.2 * scaleX} ${96.4 * scaleY}
    L ${2056.2 * scaleX} ${1147.8 * scaleY}
    L ${1131.3 * scaleX} ${1147.8 * scaleY}
    L ${1056.9 * scaleX} ${1222.2 * scaleY}
    Z
  `.trim();

  // 10 条白色短竖线（参考 SVG 中的关键元素）
  const lineGroupTransform = `translate(${1471.3 * scaleX}, ${1142.9 * scaleY})`;
  const lineWidth = 18.4 * scaleX;
  const lineHeight = 69.9 * scaleY;
  const lineXs = [497.6, 442.4, 387.1, 331.8, 276.5, 221.2, 165.9, 110.6, 55.3, 0];
  const lineOpacity = 0.3;

  const wrapperTransform = reverse
    ? `translate(0,${VBH}) scale(1,-1)`
    : undefined;

  return (
    <div ref={ref} style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${VBW} ${VBH}`}
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      >
        <defs>
          {/* 主体填充渐变：蓝紫 → 深灰 → 蓝紫（参考 linearGradient-1） */}
          <linearGradient id={gidMainFill} x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor={color1} />
            <stop offset="10%" stopColor={withAlpha(color1, 0.85)} />
            <stop offset="20%" stopColor={withAlpha(color2, 0.7)} />
            <stop offset="30%" stopColor={withAlpha(color1, 0.55)} />
            <stop offset="40%" stopColor={withAlpha(color2, 0.4)} />
            <stop offset="50%" stopColor={withAlpha(color1, 0.3)} />
            <stop offset="60%" stopColor={withAlpha(color2, 0.4)} />
            <stop offset="70%" stopColor={withAlpha(color1, 0.55)} />
            <stop offset="80%" stopColor={withAlpha(color2, 0.7)} />
            <stop offset="90%" stopColor={withAlpha(color1, 0.85)} />
            <stop offset="100%" stopColor={color1} />
          </linearGradient>
          {/* 内描边渐变：白灰 → 深色 → 白（参考 linearGradient-4） */}
          <linearGradient id={gidGradStroke} x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#F5F5F5" />
            <stop offset="0%" stopColor="#D1D1D1" />
            <stop offset="50%" stopColor={withAlpha(color1, 0.4)} />
            <stop offset="100%" stopColor="#E1E1E1" />
          </linearGradient>
          {/* 主体半透明渐变（用于背景层） */}
          <linearGradient id={gidGrad} x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor={withAlpha(color1, 0.25)} />
            <stop offset="50%" stopColor={withAlpha(color1, 0.08)} />
            <stop offset="100%" stopColor={withAlpha(color1, 0.25)} />
          </linearGradient>
          <filter id={filterGlow} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g transform={wrapperTransform}>
          {/* 1. 背景填充（可选） */}
          {backgroundColor !== "transparent" && (
            <rect
              x="0"
              y="0"
              width={VBW}
              height={VBH}
              fill={backgroundColor}
            />
          )}

          {/* 2. 主体半透明多边形（带斜切角） */}
          <polygon
            points={mainPolygon}
            fill={`url(#${gidGrad})`}
            opacity="0.2"
          />

          {/* 3. 内描边（外层路径 + 描边） */}
          <path
            d={innerStrokePath}
            fill="none"
            stroke={`url(#${gidGradStroke})`}
            strokeWidth={1.5 * sw}
            vectorEffect="non-scaling-stroke"
            opacity="0.95"
          />

          {/* 4. 内描边（内层路径 + 描边） */}
          <path
            d={innerStrokePathInner}
            fill="none"
            stroke={withAlpha(color1, 0.5)}
            strokeWidth={0.8 * sw}
            vectorEffect="non-scaling-stroke"
            opacity="0.7"
          />

          {/* 5. 左下角斜切角标 */}
          <polygon
            points={cornerBLPolygon}
            fill={color1}
            filter={`url(#${filterGlow})`}
          />

          {/* 6. 右上角斜切角标 */}
          <polygon
            points={cornerTRPolygon}
            fill={color1}
            filter={`url(#${filterGlow})`}
          />

          {/* 7. 外描边（蓝色实色） */}
          <path
            d={outerStrokePath}
            fill="none"
            stroke={color1}
            strokeWidth={1.5 * sw}
            vectorEffect="non-scaling-stroke"
            opacity="0.9"
          />

          {/* 8. 右下角梯形装饰条（蓝紫实色） */}
          <polygon
            points={bottomStripPolygon}
            fill={color1}
            filter={`url(#${filterGlow})`}
          />

          {/* 9. 装饰条上的 10 条白色短竖线 */}
          <g
            transform={lineGroupTransform}
            fill="#FFFFFF"
            opacity={lineOpacity}
          >
            {lineXs.map((x, i) => (
              <rect
                key={i}
                x={x * scaleX}
                y={0}
                width={lineWidth}
                height={lineHeight}
              />
            ))}
          </g>
        </g>
      </svg>
    </div>
  );
}
