import React, { useMemo, useId } from "react";
import { useDatavSizeRef } from "./datavRenderSize";

interface BaseProps {
  color1: string;
  color2: string;
  backgroundColor?: string;
  strokeWidth?: number;
  reverse?: boolean;
  dur?: number;
  editorScale?: number;
}

/**
 * 容器尺寸 = 「发布端注入的尺寸」优先，否则用 ResizeObserver 实测。
 * 两边共用同一个尺寸变量 → 同一段几何代码；发布端因此能得到与编辑区逐字一致的 SVG。
 */
function useElementSize(): [
  React.RefObject<HTMLDivElement>,
  { width: number; height: number }
] {
  const [ref, size] = useDatavSizeRef<HTMLDivElement>();
  return [ref as React.RefObject<HTMLDivElement>, size];
}

function withAlpha(hex: string, alpha: number): string {
  if (!hex) return `rgba(0,0,0,${alpha})`;
  const m = /^#?([a-fA-F0-9]{6})$/.exec(hex.trim());
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  const r = (v >> 16) & 0xff;
  const g = (v >> 8) & 0xff;
  const b = v & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

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

/* ===================== 点阵装饰 Decoration1 ===================== */

export function DotMatrixDeco1({
  color1,
  color2,
  strokeWidth = 1,
}: BaseProps) {
  const [ref, { width: w, height: h }] = useElementSize();
  const VBW = 200;
  const VBH = 50;
  const rowNum = 4;
  const rowPoints = 20;
  const pointSize = Math.max(0.5, 2.5 * strokeWidth);

  const points = useMemo(() => {
    const horizontalGap = VBW / (rowPoints + 1);
    const verticalGap = VBH / (rowNum + 1);
    const result: Array<[number, number]> = [];
    for (let i = 0; i < rowNum; i++) {
      for (let j = 0; j < rowPoints; j++) {
        result.push([horizontalGap * (j + 1), verticalGap * (i + 1)]);
      }
    }
    return result;
  }, []);

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
        {points.map((p, i) => {
          const isAccent = i < rowPoints;
          const fill = isAccent ? color2 : color1;
          return (
            <rect
              key={i}
              fill={fill}
              x={p[0] - pointSize / 2}
              y={p[1] - pointSize / 2}
              width={pointSize}
              height={pointSize}
            />
          );
        })}
      </svg>
    </div>
  );
}

/* ===================== 扫描线装饰 Decoration2 ===================== */

export function ScanLineDeco2({
  color1,
  color2,
  strokeWidth = 1,
  reverse = false,
  dur = 6,
}: BaseProps) {
  const [ref, { width: w, height: h }] = useElementSize();
  const lineWidth = Math.max(1, 1 * strokeWidth);
  const headSize = Math.max(1, 1 * strokeWidth);

  if (reverse) {
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
          <rect x={0} y={h / 2 - lineWidth / 2} width={w} height={lineWidth} fill={color1}>
            <animate
              attributeName="height"
              from={`0`}
              to={`${h}`}
              dur={`${dur}s`}
              calcMode="spline"
              keyTimes="0;1"
              keySplines=".42,0,.58,1"
              repeatCount="indefinite"
            />
          </rect>
          <rect x={0} y={0} width={headSize} height={headSize} fill={color2}>
            <animate
              attributeName="y"
              from="0"
              to={`${h - headSize}`}
              dur={`${dur}s`}
              calcMode="spline"
              keyTimes="0;1"
              keySplines="0.42,0,0.58,1"
              repeatCount="indefinite"
            />
          </rect>
        </svg>
      </div>
    );
  }

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
        <rect x={0} y={h / 2 - lineWidth / 2} width={w} height={lineWidth} fill={color1}>
          <animate
            attributeName="width"
            from="0"
            to={`${w}`}
            dur={`${dur}s`}
            calcMode="spline"
            keyTimes="0;1"
            keySplines=".42,0,.58,1"
            repeatCount="indefinite"
          />
        </rect>
        <rect x={0} y={0} width={headSize} height={headSize} fill={color2}>
          <animate
            attributeName="x"
            from="0"
            to={`${w - headSize}`}
            dur={`${dur}s`}
            calcMode="spline"
            keyTimes="0;1"
            keySplines="0.42,0,0.58,1"
            repeatCount="indefinite"
          />
        </rect>
      </svg>
    </div>
  );
}

/* ===================== 闪烁点阵装饰 Decoration3 ===================== */

export function FlickerDotsDeco3({
  color1,
  color2,
  strokeWidth = 1,
}: BaseProps) {
  const [ref, { width: w, height: h }] = useElementSize();
  const VBW = 300;
  const VBH = 35;
  const rowNum = 2;
  const rowPoints = 25;
  const pointSize = Math.max(1, 7 * strokeWidth);

  const points = useMemo(() => {
    const horizontalGap = VBW / (rowPoints + 1);
    const verticalGap = VBH / (rowNum + 1);
    const result: Array<[number, number]> = [];
    for (let i = 0; i < rowNum; i++) {
      for (let j = 0; j < rowPoints; j++) {
        result.push([horizontalGap * (j + 1), verticalGap * (i + 1)]);
      }
    }
    return result;
  }, []);

  const flickerFlags = useMemo(() => points.map(() => Math.random() > 0.6), [points]);
  const durs = useMemo(() => points.map(() => Math.random() + 1), [points]);
  const begins = useMemo(() => points.map(() => Math.random() * 2), [points]);

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
        {points.map((p, i) => (
          <rect
            key={i}
            fill={color1}
            x={p[0] - pointSize / 2}
            y={p[1] - pointSize / 2}
            width={pointSize}
            height={pointSize}
          >
            {flickerFlags[i] && (
              <animate
                attributeName="fill"
                values={`${color1};${color2};${color1}`}
                dur={`${durs[i]}s`}
                begin={`${begins[i]}s`}
                repeatCount="indefinite"
              />
            )}
          </rect>
        ))}
      </svg>
    </div>
  );
}

/* ===================== 渐变边框装饰 Decoration4 ===================== */

export function GradientBorderDeco4({
  color1,
  color2,
  strokeWidth = 1,
  reverse = false,
  dur = 3,
}: BaseProps) {
  const [ref, { width: w, height: h }] = useElementSize();
  const thickness = Math.max(1, 5 * strokeWidth);
  const dashSw = Math.max(0.5, 3 * strokeWidth);

  if (reverse) {
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
          <line
            x1={0}
            y1={h / 2}
            x2={w}
            y2={h / 2}
            stroke={color1}
            strokeWidth={thickness}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={0}
            y1={h / 2}
            x2={w}
            y2={h / 2}
            stroke={color2}
            strokeWidth={dashSw}
            strokeDasharray="20, 80"
            strokeDashoffset="-30"
            vectorEffect="non-scaling-stroke"
          >
            <animate
              attributeName="stroke-dashoffset"
              from="0"
              to="-100"
              dur={`${dur}s`}
              repeatCount="indefinite"
            />
          </line>
        </svg>
      </div>
    );
  }

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
        <line
          x1={w / 2}
          y1={0}
          x2={w / 2}
          y2={h}
          stroke={color1}
          strokeWidth={thickness}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={w / 2}
          y1={0}
          x2={w / 2}
          y2={h}
          stroke={color2}
          strokeWidth={dashSw}
          strokeDasharray="20, 80"
          strokeDashoffset="-30"
          vectorEffect="non-scaling-stroke"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to="-100"
            dur={`${dur}s`}
            repeatCount="indefinite"
          />
        </line>
      </svg>
    </div>
  );
}

/* ===================== 折线装饰 Decoration5 ===================== */

export function PolylineDeco5({
  color1,
  color2,
  strokeWidth = 1,
  dur = 1.2,
}: BaseProps) {
  const [ref, { width: w, height: h }] = useElementSize();
  const line1Sw = Math.max(0.5, 3 * strokeWidth);
  const line2Sw = Math.max(0.5, 2 * strokeWidth);

  const { line1Points, line2Points, line1Length, line2Length } = useMemo(() => {
    const l1: Array<[number, number]> = [
      [0, h * 0.2],
      [w * 0.18, h * 0.2],
      [w * 0.2, h * 0.4],
      [w * 0.25, h * 0.4],
      [w * 0.27, h * 0.6],
      [w * 0.72, h * 0.6],
      [w * 0.75, h * 0.4],
      [w * 0.8, h * 0.4],
      [w * 0.82, h * 0.2],
      [w, h * 0.2],
    ];
    const l2: Array<[number, number]> = [
      [w * 0.3, h * 0.8],
      [w * 0.7, h * 0.8],
    ];
    const len = (pts: Array<[number, number]>) => {
      let total = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const dx = pts[i + 1][0] - pts[i][0];
        const dy = pts[i + 1][1] - pts[i][1];
        total += Math.hypot(dx, dy);
      }
      return total;
    };
    return {
      line1Points: l1.map((p) => p.join(",")).join(" "),
      line2Points: l2.map((p) => p.join(",")).join(" "),
      line1Length: len(l1),
      line2Length: len(l2),
    };
  }, [w, h]);

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
        <polyline
          fill="transparent"
          stroke={color1}
          strokeWidth={line1Sw}
          vectorEffect="non-scaling-stroke"
          points={line1Points}
        >
          <animate
            attributeName="stroke-dasharray"
            from={`0, ${line1Length / 2}, 0, ${line1Length / 2}`}
            to={`0, 0, ${line1Length}, 0`}
            dur={`${dur}s`}
            begin="0s"
            calcMode="spline"
            keyTimes="0;1"
            keySplines="0.4,1,0.49,0.98"
            repeatCount="indefinite"
          />
        </polyline>
        <polyline
          fill="transparent"
          stroke={color2}
          strokeWidth={line2Sw}
          vectorEffect="non-scaling-stroke"
          points={line2Points}
        >
          <animate
            attributeName="stroke-dasharray"
            from={`0, ${line2Length / 2}, 0, ${line2Length / 2}`}
            to={`0, 0, ${line2Length}, 0`}
            dur={`${dur}s`}
            begin="0s"
            calcMode="spline"
            keyTimes="0;1"
            keySplines=".4,1,.49,.98"
            repeatCount="indefinite"
          />
        </polyline>
      </svg>
    </div>
  );
}

/* ===================== 柱状跳动装饰 Decoration6 ===================== */

export function BarJumpingDeco6({
  color1,
  color2,
  strokeWidth = 1,
}: BaseProps) {
  const [ref, { width: w, height: h }] = useElementSize();
  const VBW = 300;
  const VBH = 35;
  const rowNum = 1;
  const rowPoints = 40;
  const rectWidth = Math.max(1, 7 * strokeWidth);

  const data = useMemo(() => {
    const horizontalGap = VBW / (rowPoints + 1);
    const verticalGap = VBH / (rowNum + 1);
    const points: Array<[number, number]> = [];
    for (let i = 0; i < rowNum; i++) {
      for (let j = 0; j < rowPoints; j++) {
        points.push([horizontalGap * (j + 1), verticalGap * (i + 1)]);
      }
    }
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const heights = new Array(rowNum * rowPoints).fill(0).map(() =>
      Math.random() > 0.8 ? rand(0.7 * VBH, VBH) : rand(0.2 * VBH, 0.5 * VBH)
    );
    const minHeights = heights.map((v) => v * Math.random());
    const randoms = new Array(rowNum * rowPoints).fill(0).map(() => Math.random() + 1.5);
    return { points, heights, minHeights, randoms };
  }, []);

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
        {data.points.map((p, i) => {
          const fill = Math.random() > 0.5 ? color1 : color2;
          const h1 = data.heights[i];
          const h2 = data.minHeights[i];
          return (
            <rect
              key={i}
              fill={fill}
              x={p[0] - rectWidth / 2}
              y={p[1] - h1 / 2}
              width={rectWidth}
              height={h1}
            >
              <animate
                attributeName="y"
                values={`${p[1] - h2 / 2};${p[1] - h1 / 2};${p[1] - h2 / 2}`}
                dur={`${data.randoms[i]}s`}
                keyTimes="0;0.5;1"
                calcMode="spline"
                keySplines="0.42,0,0.58,1;0.42,0,0.58,1"
                begin="0s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="height"
                values={`${h2};${h1};${h2}`}
                dur={`${data.randoms[i]}s`}
                keyTimes="0;0.5;1"
                calcMode="spline"
                keySplines="0.42,0,0.58,1;0.42,0,0.58,1"
                begin="0s"
                repeatCount="indefinite"
              />
            </rect>
          );
        })}
      </svg>
    </div>
  );
}

/* ===================== 箭头装饰 Decoration7 ===================== */

/**
 * 参考 vectorstock_45904626.svg
 *
 * 结构：每个"箭头对"由左右两个盾牌形多边形在中点 (1055.33, 879.68) 拼接，
 *       整对宽 2110.66，高 1759.36。
 *       参考图共 2 对，水平并排（左对偏移 527.67，右对偏移 0），间距 527.67。
 *
 *  - 左半（左指箭头）6 顶点：左平直 + 右双尖端 648.11（尾）/ 1055.33（头）
 *  - 右半（右指箭头）6 顶点：右平直 + 左双尖端 1462.55（尾）/ 2110.66（头）
 *  - 上下镜像对称，Y 中线 = 879.68
 */
/* ===================== 双翼装饰 DecorationArrow7 ===================== */
/* 参考 SVG: vectorstock_33677367.svg
   - viewBox: 0 0 4564 1506
   - 2 个主体翼（左右对角张开） + 2 个暗部小三角（翼根位置） + 1 个中间红色弧形带
   - 用户只配 2 个色：color1 = 最亮主色（高光），color2 = 最暗暗色（翼根/暗部三角）
   - 翼 9 色标、弧形带 5 色标、暗部三角 全部按 HSL 派生，保证色调整体协调 */

const VBW_WINGS = 4564;
const VBH_WINGS = 1506;

/* 翼 1（左）— 从画布底部向右上张开 */
const WING_LEFT_D =
  "M787.98,869.676 C775,874.186 761.94,878.776 749,883.456 L1176.42,1027.896 C1163.1,1031.226 1149.75,1034.676 1136.43,1038.136 C776.93,1131.766 426.53,1270.216 94.04,1453.506 C63.45,1470.356 33.11,1487.596 2.86,1505.166 C24.26,1469.986 45.67,1434.926 67.24,1400.126 C142.54,1278.316 218.76,1158.856 295.83,1041.676 C217.75,999.076 140.56,958.926 64.34,921.046 C42.81,910.386 21.36,899.856 0,889.566 C30.21,871.916 60.59,854.636 91.14,837.826 C303.46,720.566 523.11,621.586 747.78,540.976 C875.83,494.966 1005.52,454.936 1136.44,420.846 C1150.09,417.266 1163.83,413.806 1177.48,410.356 L1177.48,753.336 C1046.35,786.156 916.37,824.926 787.98,869.676 Z";

/* 翼 2（右）— 从画布底部向左上张开（翼 1 的镜像） */
const WING_RIGHT_D =
  "M4496.05,1400.116 C4517.62,1434.916 4539.03,1469.976 4560.43,1505.156 C4530.18,1487.586 4499.84,1470.356 4469.29,1453.496 C4140.38,1272.186 3793.98,1134.786 3438.61,1041.236 C3424.96,1037.616 3411.31,1034.076 3397.61,1030.616 L3826.3,887.736 C3813.2,883.016 3800.01,878.296 3786.82,873.666 C3658.52,828.576 3528.61,789.436 3397.53,756.276 L3397.53,413.296 C3411.27,416.796 3424.92,420.286 3438.61,423.916 C3569.44,458.336 3699.01,498.746 3826.97,545.096 C4047.63,624.946 4263.41,722.526 4472.15,837.816 C4502.7,854.626 4533.08,871.906 4563.29,889.556 C4541.93,899.836 4520.48,910.376 4498.95,921.036 C4422.73,958.916 4345.53,999.076 4267.5,1041.666 C4344.57,1158.846 4420.79,1278.296 4496.04,1400.116 Z";

/* 暗部小三角（翼根阴影，由 color2 HSL-35% 派生） */
const WING_SHADOW_LEFT_D =
  "M1177.49,753.336 L1177.49,1027.636 L749.02,883.446 C761.96,878.766 775.02,874.176 788,869.666 C916.39,824.916 1046.38,786.156 1177.5,753.326 Z";
const WING_SHADOW_RIGHT_D =
  "M3826.3,887.746 L3397.61,1030.626 L3397.53,756.276 C3528.61,789.436 3658.52,828.576 3786.82,873.666 C3800.01,878.296 3813.2,883.016 3826.3,887.736 Z";

/* 中间红色弧形带（横跨画布） */
const CENTER_BAND_D =
  "M3826.99,270.716 L3826.99,888.006 C3826.76,887.926 3826.51,887.836 3826.3,887.756 C3813.2,883.036 3800.01,878.316 3786.82,873.686 C3658.52,828.596 3528.61,789.456 3397.53,756.296 C2669.72,571.956 1905.63,570.986 1177.49,753.346 C1046.36,786.166 916.38,824.936 787.99,869.686 C775.01,874.196 761.95,878.786 749.01,883.466 C748.59,883.636 748.21,883.806 747.79,883.926 L747.79,266.596 C761.15,261.796 774.59,257.076 787.99,252.396 C1757.7,-85.443 2817.83,-84.143 3786.83,256.396 C3800.23,261.116 3813.67,265.876 3826.99,270.726 L3826.99,270.716 Z";

/* === 翼渐变色标（按 HSL 派生，offset 与参考 SVG 一致） ===
 *   索引  offset  角色                派生规则
 *   0     0%     起点（最深）         color2 HSL -25%
 *   1    15%     翼根深色             color2 HSL -12%
 *   2    30%     主体（中暗）         color1 HSL -18%
 *   3    42%     过渡到高光           color1 HSL -6%
 *   4    50%     最亮高光             color1
 *   5    54%     高光过渡             color1 HSL -6%
 *   6    72%     主体（次亮）         color1 HSL -16%
 *   7    87%     翼端暗色             color1 HSL -26%
 *   8   100%     末端                 color2
 */
const WING_OFFSETS = ["0%", "15%", "30%", "42%", "50%", "54%", "72%", "87%", "100%"];

/** 简单 hex 混合（线性 RGB） */
function blendHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(
    ar + (br - ar) * t,
    ag + (bg - ag) * t,
    ab + (bb - ab) * t
  );
}

/* === HSL 派生工具 === */
function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  return [
    parseInt(m.substring(0, 2), 16),
    parseInt(m.substring(2, 4), 16),
    parseInt(m.substring(4, 6), 16),
  ];
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = ((b - r) / d + 2); break;
      case b: h = ((r - g) / d + 4); break;
    }
    h *= 60;
  }
  return [h, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360;
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [r * 255, g * 255, b * 255];
}
/** 在 hex 色基础上调整亮度（正数变亮，负数变暗），保持色相与饱和度 */
function adjustLightness(hex: string, dl: number): string {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const newL = Math.max(0, Math.min(1, l + dl));
  const [nr, ng, nb] = hslToRgb(h, s, newL);
  return rgbToHex(nr, ng, nb);
}

/**
 * 翼 9 色标派生（对称、对角线、横向共用同一组派生规则）：
 *   - 0%/100%：color2 的 HSL 推暗版本（暗端）
 *   - 50%：color1（最亮）
 *   - 中间：color1 与 color2 之间按偏移插值
 */
function buildWingStops(c1: string, c2: string): string[] {
  // 参考 SVG 的 9 色标比例：0%, 15%, 30%, 42%, 50%, 54%, 72%, 87%, 100%
  // 派生规则：
  //   50% → c1
  //   0% / 100% → c2 HSL-25%（最深）
  //   30%/72% → c1/c2 中点（推暗 15%）
  //   42%/54% → 接近 c1，推暗 5%
  //   15%/87% → 接近 c2，推暗 10%
  return [
    adjustLightness(c2, -0.25), // 0%  起点最深
    adjustLightness(c2, -0.12), // 15% 深
    blendHex(c1, c2, 0.5) ? adjustLightness(blendHex(c1, c2, 0.5), -0.10) : c1, // 30% 中暗
    adjustLightness(c1, -0.05), // 42% 过渡
    c1,                         // 50% 最亮
    adjustLightness(c1, -0.05), // 54% 过渡
    adjustLightness(blendHex(c1, c2, 0.6), -0.10), // 72% 中暗
    adjustLightness(c2, -0.12), // 87% 深
    c2,                         // 100% 末端
  ];
}

/** 弧形带 5 色标派生：50%→100% 范围，从 c1 平滑到 c2 */
function buildBandStops(c1: string, c2: string): string[] {
  return [
    c1,                         // 50% 最亮
    adjustLightness(c1, -0.05), // 54%
    adjustLightness(blendHex(c1, c2, 0.5), -0.08), // 72%
    adjustLightness(c2, -0.12), // 87%
    c2,                         // 100%
  ];
}

export function DecorationArrow7({
  color1,
  color2,
  backgroundColor,
  strokeWidth = 1,
}: BaseProps) {
  const [ref, { width: w, height: h }] = useElementSize();
  const uid = useId().replace(/:/g, "");
  const gradL = `dw7-gradL-${uid}`;
  const gradR = `dw7-gradR-${uid}`;
  const gradC = `dw7-gradC-${uid}`;

  // 用户只配 2 个色，默认与参考 SVG 保持一致
  const c1 = color1 || "#FF0000";
  const c2 = color2 || "#750000";
  // 暗部三角用 c2 HSL-30%（比 c2 更深，确保可见对比）
  const shadowColor = adjustLightness(c2, -0.30);
  // 描边用 c2（暗端）
  const strokeColor = c2;

  const wingStops = buildWingStops(c1, c2);
  const bandStops = buildBandStops(c1, c2);

  return (
    <div
      ref={ref}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        backgroundColor: backgroundColor || "transparent",
      }}
    >
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${VBW_WINGS} ${VBH_WINGS}`}
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      >
        <defs>
          {/* 翼 1（左侧）— 对角渐变（左下→右上），9 色标由 color1/color2 派生 */}
          <linearGradient
            id={gradL}
            x1="5.64%"
            y1="69.53%"
            x2="78.81%"
            y2="36.47%"
          >
            {WING_OFFSETS.map((off, i) => (
              <stop
                key={`l-${i}`}
                offset={off}
                stopColor={wingStops[i]}
                stopOpacity="1"
              />
            ))}
          </linearGradient>
          {/* 翼 2（右侧）— 横向渐变（左→右），9 色标由 color1/color2 派生 */}
          <linearGradient
            id={gradR}
            x1="0%"
            y1="50%"
            x2="100%"
            y2="50%"
          >
            {WING_OFFSETS.map((off, i) => (
              <stop
                key={`r-${i}`}
                offset={off}
                stopColor={wingStops[i]}
                stopOpacity="1"
              />
            ))}
          </linearGradient>
          {/* 中间红色弧形带 — 半边渐变 50%→100% */}
          <linearGradient
            id={gradC}
            x1="2.36%"
            y1="50.26%"
            x2="98.72%"
            y2="49.91%"
          >
            {bandStops.map((color, i) => (
              <stop
                key={`c-${i}`}
                offset={["50%", "54%", "72%", "87%", "100%"][i]}
                stopColor={color}
                stopOpacity="1"
              />
            ))}
          </linearGradient>
        </defs>

        {/* 阴影层（每翼黑色 20% 透明，偏移 (40, 40)） */}
        <g opacity="0.2" transform="translate(40, 40)">
          <path d={WING_LEFT_D} fill="#000000" />
          <path d={WING_RIGHT_D} fill="#000000" />
        </g>

        {/* 暗部小三角（翼根处，加深翼的根部，由 color2 派生） */}
        <path d={WING_SHADOW_LEFT_D} fill={shadowColor} opacity="0.55" />
        <path d={WING_SHADOW_RIGHT_D} fill={shadowColor} opacity="0.55" />

        {/* 主体 — 2 片翼 */}
        <path
          d={WING_LEFT_D}
          fill={`url(#${gradL})`}
          stroke={strokeColor}
          strokeWidth={Math.max(0.5, strokeWidth)}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={WING_RIGHT_D}
          fill={`url(#${gradR})`}
          stroke={strokeColor}
          strokeWidth={Math.max(0.5, strokeWidth)}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* 中间红色弧形带（横跨画布） */}
        <path
          d={CENTER_BAND_D}
          fill={`url(#${gradC})`}
          stroke={strokeColor}
          strokeWidth={Math.max(0.5, strokeWidth * 0.5)}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

/* 别名（语义） */
export const DecorationDualWings7 = DecorationArrow7;

/* ===================== 折线角装饰 FoldingCornerDeco8 ===================== */
/* 参考 SVG: vectorstock_50184197.svg
   - viewBox: 0 0 1611 294
   - 1 个徽章形外框（双环 evenodd，外圈大圆角矩形 + 内圈小圆角矩形，环形带状）
   - 4 角各 1 组缠枝纹 + 小装饰（左/右花纹是不同路径，不是 scale 镜像）
   - 全部元素同一色（#C89F49 黄金色），用户只配 1 个色 */

const VBW_DECO8 = 1611;
const VBH_DECO8 = 294;

/* 徽章形外框：双环路径，fill-rule="evenodd" 形成环形带状 */
const BADGE_OUTER_D =
  "M1561.38587,294 L49.6141304,294 L49.2827281,292.770446 C42.0239489,266.117692 23.9999403,245.178016 1.05834926,236.757435 L0,236.372423 L0,57.6275769 L1.05834926,57.2425651 C23.9999403,48.8219838 42.0346393,27.8698885 49.2827281,1.2295539 L49.6141304,0 L1561.38587,0 L1561.71727,1.2295539 C1568.97605,27.8823082 1587.00006,48.8219838 1609.94165,57.2425651 L1611,57.6275769 L1611,236.372423 L1609.94165,236.757435 C1587.00006,245.178016 1568.96536,266.130112 1561.71727,292.770446 L1561.38587,294 Z M51.8163521,290.485215 L1559.17296,290.485215 C1566.82728,263.733102 1584.9475,242.681649 1607.97462,233.801538 L1607.97462,60.1860426 C1584.9475,51.3059311 1566.82728,30.2544779 1559.17296,3.50236566 L51.8163521,3.50236566 C44.1620282,30.2544779 26.041806,51.3059311 3.01469183,60.1860426 L3.01469183,233.801538 C26.041806,242.681649 44.1620282,263.733102 51.8163521,290.485215 Z";

/* 4 份缠枝纹路径：每角是独立路径（不是 scale 镜像） */
const ORNAMENT_TOP_LEFT = [
  "M81.9422766,62.9312539 C102.585432,53.4301556 106.070502,44.6990809 106.070502,44.6990809 C106.070502,44.6990809 97.6357788,47.6798176 97.8175155,43.6309836 C97.9992523,39.5821495 95.2518204,34.2540826 95.2518204,34.2540826 C95.2518204,34.2540826 87.7792332,50.8095912 68.3440922,52.0018859 C48.9089513,53.1941806 35.9842618,29.3855459 42.1419303,16.6925753 C48.2995987,3.99960474 57.2474606,5.67626915 60.0162733,8.23473485 C62.785086,10.7932005 63.8434353,16.8540319 62.1329718,19.7850897 C61.3953345,21.0394831 60.3690564,21.6356304 59.3213975,21.797087 C59.4283015,21.6977291 59.5458958,21.5983712 59.6421094,21.4865936 C60.6576971,20.3067186 60.6576971,18.406499 59.6421094,17.226624 C58.6265217,16.046749 56.9908911,16.046749 55.9753034,17.226624 C55.0559293,18.2947213 54.9704061,19.958966 55.7187339,21.138841 C55.9325418,22.1572593 56.7877735,25.1007369 59.791775,25.5230079 C61.7908791,25.8086618 63.7472217,24.7778237 65.0621405,22.9893817 C67.4033373,19.8099292 70.3538868,13.2150491 64.0679336,4.42187577 C55.0773101,-8.14689746 30.1366149,8.0484388 35.0862685,28.2926091 C40.0359221,48.5367795 61.2884305,72.4323523 81.9422766,62.9312539 L81.9422766,62.9312539 Z",
  "M44.7610774,79.3998244 C43.7347993,101.978905 29.4845007,110.660301 29.4845007,110.660301 C29.4845007,110.660301 34.0706808,113.852173 37.5557501,113.641038 C41.0408194,113.429902 38.4751242,123.229074 38.4751242,123.229074 C38.4751242,123.229074 45.990473,119.18024 54.1686264,95.1977291 C62.3467797,71.2152181 41.7784568,46.5247822 24.3531104,40.7620245 C6.92776398,35.0116865 -7.01251313,63.9869315 3.80616819,74.4319298 C11.3642786,81.7347348 17.0515695,78.3068876 19.788311,75.5869653 C21.3170378,74.0593378 22.2150311,71.786526 21.9691519,69.4640353 C21.5949881,65.9740894 19.0720545,64.9680907 18.195442,64.7321157 C17.1798543,63.8751539 15.7473411,63.9620921 14.8386574,65.0301894 C13.8230698,66.2100644 13.8230698,68.110284 14.8386574,69.290159 C15.8542451,70.4700339 17.4898758,70.4700339 18.5054635,69.290159 C18.601677,69.1783813 18.6978906,69.054184 18.7727234,68.9175669 C18.6337482,70.1347011 18.1312996,71.3269957 17.0408791,72.1839576 C14.5179455,74.1711154 9.30103202,72.9415615 7.09881033,69.7248498 C4.89658864,66.508138 3.4533851,56.1128187 14.3789704,48.9590505 C25.3045557,41.8052823 45.7980459,56.8207436 44.7717678,79.3998244 L44.7610774,79.3998244 Z",
  "M36.176689,53.8027477 C36.176689,53.8027477 41.7250048,59.6151843 42.3343574,73.6743259 C42.94371,87.7334675 25.8925275,82.8028322 26.4591185,72.5689694 C27.0257095,62.3351066 35.9521906,67.2533222 35.9521906,67.2533222 L35.0969589,75.9098785 C35.0969589,75.9098785 38.8279073,77.5741232 38.4858146,70.7184287 C38.1437219,63.8627342 42.0777879,67.9488274 36.176689,53.790328 L36.176689,53.8027477 Z",
  "M46.3111849,42.0412573 C46.3111849,42.0412573 51.3142905,48.4871005 63.4158194,49.1950255 C75.5173483,49.9029505 71.2732609,30.0934709 62.4643741,30.7517169 C53.6554873,31.409963 57.8888844,41.7804429 57.8888844,41.7804429 L65.3400908,40.7868639 C65.3400908,40.7868639 66.7726039,45.1213519 60.871505,44.7239204 C54.9704061,44.3264888 58.4875466,48.8969518 46.3004945,42.0412573 L46.3111849,42.0412573 Z",
];

const ORNAMENT_BOTTOM_LEFT = [
  "M81.9422766,60.2978202 C102.585432,69.7989186 106.070502,78.5299932 106.070502,78.5299932 C106.070502,78.5299932 97.6357788,75.5492565 97.8175155,79.5980906 C97.9992523,83.6469246 95.2518204,88.9749916 95.2518204,88.9749916 C95.2518204,88.9749916 87.7792332,72.4194829 68.3440922,71.2271882 C48.9089513,70.0348935 35.9842618,93.8435282 42.1419303,106.536499 C48.2995987,119.229469 57.2474606,117.552805 60.0162733,114.994339 C62.785086,112.435874 63.8434353,106.375042 62.1329718,103.443984 C61.3953345,102.189591 60.3690564,101.593444 59.3213975,101.431987 C59.4283015,101.531345 59.5458958,101.630703 59.6421094,101.742481 C60.6576971,102.922356 60.6576971,104.822575 59.6421094,106.00245 C58.6265217,107.182325 56.9908911,107.182325 55.9753034,106.00245 C55.0559293,104.934353 54.9704061,103.270108 55.7187339,102.102653 C55.9325418,101.084235 56.7877735,98.140757 59.791775,97.718486 C61.7908791,97.432832 63.7472217,98.4636702 65.0621405,100.252112 C67.4033373,103.431565 70.3538868,110.026445 64.0679336,118.819618 C55.0773101,131.388391 30.1366149,115.193055 35.0862685,94.9488848 C40.0359221,74.7047144 61.2884305,50.8091416 81.9422766,60.3102399 L81.9422766,60.2978202 Z",
  "M44.7610774,43.8292497 C43.7347993,21.250169 29.4845007,12.5687732 29.4845007,12.5687732 C29.4845007,12.5687732 34.0706808,9.37690098 37.5557501,9.5880365 C41.0408194,9.79917202 38.4751242,0 38.4751242,0 C38.4751242,0 45.990473,4.04883407 54.1686264,28.031345 C62.3467797,52.013856 41.7784568,76.704292 24.3531104,82.4670497 C6.92776398,88.2173876 -7.01251313,59.2421426 3.80616819,48.7971443 C11.3642786,41.4943393 17.0515695,44.9221865 19.788311,47.6421088 C21.3170378,49.1697364 22.2150311,51.4425482 21.9691519,53.7650389 C21.5949881,57.2549848 19.0720545,58.2609834 18.195442,58.4969584 C17.1798543,59.3539202 15.7473411,59.2669821 14.8386574,58.1988848 C13.8230698,57.0190098 13.8230698,55.1187901 14.8386574,53.9389152 C15.8542451,52.7590402 17.4898758,52.7590402 18.5054635,53.9389152 C18.601677,54.0506928 18.6978906,54.1748902 18.7727234,54.3115073 C18.6337482,53.0943731 18.1312996,51.9020784 17.0408791,51.0451166 C14.5179455,49.0579588 9.30103202,50.2875127 7.09881033,53.5042244 C4.89658864,56.7209361 3.4533851,67.1162555 14.3789704,74.2700237 C25.3045557,81.4237918 45.7980459,66.4083305 44.7717678,43.8292497 L44.7610774,43.8292497 Z",
  "M36.176689,69.4263265 C36.176689,69.4263265 41.7250048,63.6138898 42.3343574,49.5547482 C42.94371,35.4956066 25.8925275,40.426242 26.4591185,50.6601048 C27.0257095,60.8939676 35.9521906,55.9757519 35.9521906,55.9757519 L35.0969589,47.3191957 C35.0969589,47.3191957 38.8279073,45.654951 38.4858146,52.5106455 C38.1437219,59.36634 42.0777879,55.2802467 36.176689,69.4387462 L36.176689,69.4263265 Z",
  "M46.3111849,81.2002366 C46.3111849,81.2002366 51.3142905,74.7543934 63.4158194,74.0464684 C75.5173483,73.3385434 71.2732609,93.148023 62.4643741,92.489777 C53.6554873,91.8315309 57.8888844,81.461051 57.8888844,81.461051 L65.3400908,82.4546299 C65.3400908,82.4546299 66.7726039,78.1201419 60.871505,78.5175735 C54.9704061,78.9150051 58.4875466,74.3445421 46.3004945,81.2002366 L46.3111849,81.2002366 Z",
];

const ORNAMENT_TOP_RIGHT = [
  "M24.128225,62.9312539 C3.48506928,53.4301556 0,44.6990809 0,44.6990809 C0,44.6990809 8.43472289,47.6798176 8.25298614,43.6309836 C8.0712494,39.5821495 10.8186813,34.2540826 10.8186813,34.2540826 C10.8186813,34.2540826 18.2912685,50.8095912 37.7264095,52.0018859 C57.1615504,53.1941806 70.0862398,29.3855459 63.9285714,16.6925753 C57.770903,3.99960474 48.8230411,5.67626915 46.0542284,8.23473485 C43.2854157,10.7932005 42.2270664,16.8540319 43.9375299,19.7850897 C44.6751672,21.0394831 45.7014453,21.6356304 46.7491042,21.797087 C46.6422002,21.6977291 46.5246058,21.5983712 46.4283923,21.4865936 C45.4128046,20.3067186 45.4128046,18.406499 46.4283923,17.226624 C47.4439799,16.046749 49.0796106,16.046749 50.0951983,17.226624 C51.0145724,18.2947213 51.1000956,19.958966 50.3517678,21.138841 C50.1379599,22.1572593 49.2827281,25.1007369 46.2787267,25.5230079 C44.2796226,25.8086618 42.32328,24.7778237 41.0083612,22.9893817 C38.6671644,19.8099292 35.7166149,13.2150491 42.0025681,4.42187577 C50.9931916,-8.14689746 75.9338868,8.0484388 70.9842332,28.2926091 C66.0345796,48.5367795 44.7820712,72.4323523 24.128225,62.9312539 L24.128225,62.9312539 Z",
  "M61.3094243,79.3998244 C62.3357023,101.978905 76.586001,110.660301 76.586001,110.660301 C76.586001,110.660301 71.9998208,113.852173 68.5147516,113.641038 C65.0296823,113.429902 67.5953774,123.229074 67.5953774,123.229074 C67.5953774,123.229074 60.0800287,119.18024 51.9018753,95.1977291 C43.7237219,71.2152181 64.2920449,46.5247822 81.7173913,40.7620245 C99.1427377,35.0116865 113.083015,63.9869315 102.264333,74.4319298 C94.7062231,81.7347348 89.0189322,78.3068876 86.2821906,75.5869653 C84.7534639,74.0593378 83.8554706,71.786526 84.1013497,69.4640353 C84.4755136,65.9740894 86.9984472,64.9680907 87.8750597,64.7321157 C88.8906474,63.8751539 90.3231605,63.9620921 91.2318442,65.0301894 C92.2474319,66.2100644 92.2474319,68.110284 91.2318442,69.290159 C90.2162566,70.4700339 88.5806259,70.4700339 87.5650382,69.290159 C87.4688247,69.1783813 87.3726111,69.054184 87.2977783,68.9175669 C87.4367535,70.1347011 87.9392021,71.3269957 89.0296226,72.1839576 C91.5525561,74.1711154 96.7694697,72.9415615 98.9716914,69.7248498 C101.173913,66.508138 102.617117,56.1128187 91.6915313,48.9590505 C80.765946,41.8052823 60.2724558,56.8207436 61.2987339,79.3998244 L61.3094243,79.3998244 Z",
  "M69.8831223,53.8027477 C69.8831223,53.8027477 64.3348065,59.6151843 63.7254539,73.6743259 C63.1161013,87.7334675 80.1672838,82.8028322 79.6006928,72.5689694 C79.0341018,62.3351066 70.1076206,67.2533222 70.1076206,67.2533222 L70.9628524,75.9098785 C70.9628524,75.9098785 67.231904,77.5741232 67.5739967,70.7184287 C67.9160893,63.8627342 63.9820234,67.9488274 69.8831223,53.790328 L69.8831223,53.8027477 Z",
  "M59.7593168,42.0412573 C59.7593168,42.0412573 54.7562112,48.4871005 42.6546823,49.1950255 C30.5531534,49.9029505 34.7972408,30.0934709 43.6061276,30.7517169 C52.4150143,31.409963 48.1816173,41.7804429 48.1816173,41.7804429 L40.7304109,40.7868639 C40.7304109,40.7868639 39.2978978,45.1213519 45.1989967,44.7239204 C51.1000956,44.3264888 47.5829551,48.8969518 59.7700072,42.0412573 L59.7593168,42.0412573 Z",
];

const ORNAMENT_BOTTOM_RIGHT = [
  "M24.128225,60.2978202 C3.48506928,69.7989186 0,78.5299932 0,78.5299932 C0,78.5299932 8.43472289,75.5492565 8.25298614,79.5980906 C8.0712494,83.6469246 10.8186813,88.9749916 10.8186813,88.9749916 C10.8186813,88.9749916 18.2912685,72.4194829 37.7264095,71.2271882 C57.1615504,70.0348935 70.0862398,93.8435282 63.9285714,106.536499 C57.770903,119.229469 48.8230411,117.552805 46.0542284,114.994339 C43.2854157,112.435874 42.2270664,106.375042 43.9375299,103.443984 C44.6751672,102.189591 45.7014453,101.593444 46.7491042,101.431987 C46.6422002,101.531345 46.5246058,101.630703 46.4283923,101.742481 C45.4128046,102.922356 45.4128046,104.822575 46.4283923,106.00245 C47.4439799,107.182325 49.0796106,107.182325 50.0951983,106.00245 C51.0145724,104.934353 51.1000956,103.270108 50.3517678,102.102653 C50.1379599,101.084235 49.2827281,98.140757 46.2787267,97.718486 C44.2796226,97.432832 42.32328,98.4636702 41.0083612,100.252112 C38.6671644,103.431565 35.7166149,110.026445 42.0025681,118.819618 C50.9931916,131.388391 75.9338868,115.193055 70.9842332,94.9488848 C66.0345796,74.7047144 44.7820712,50.8091416 24.128225,60.3102399 L24.128225,60.2978202 Z",
  "M61.3094243,43.8292497 C62.3357023,21.250169 76.586001,12.5687732 76.586001,12.5687732 C76.586001,12.5687732 71.9998208,9.37690098 68.5147516,9.5880365 C65.0296823,9.79917202 67.5953774,0 67.5953774,0 C67.5953774,0 60.0800287,4.04883407 51.9018753,28.031345 C43.7237219,52.013856 64.2920449,76.704292 81.7173913,82.4670497 C99.1427377,88.2173876 113.083015,59.2421426 102.264333,48.7971443 C94.7062231,41.4943393 89.0189322,44.9221865 86.2821906,47.6421088 C84.7534639,49.1697364 83.8554706,51.4425482 84.1013497,53.7650389 C84.4755136,57.2549848 86.9984472,58.2609834 87.8750597,58.4969584 C88.8906474,59.3539202 90.3231605,59.2669821 91.2318442,58.1988848 C92.2474319,57.0190098 92.2474319,55.1187901 91.2318442,53.9389152 C90.2162566,52.7590402 88.5806259,52.7590402 87.5650382,53.9389152 C87.4688247,54.0506928 87.3726111,54.1748902 87.2977783,54.3115073 C87.4367535,53.0943731 87.9392021,51.9020784 89.0296226,51.0451166 C91.5525561,49.0579588 96.7694697,50.2875127 98.9716914,53.5042244 C101.173913,56.7209361 102.617117,67.1162555 91.6915313,74.2700237 C80.765946,81.4237918 60.2724558,66.4083305 61.2987339,43.8292497 L61.3094243,43.8292497 Z",
  "M69.8831223,69.4263265 C69.8831223,69.4263265 64.3348065,63.6138898 63.7254539,49.5547482 C63.1161013,35.4956066 80.1672838,40.426242 79.6006928,50.6601048 C79.0341018,60.8939676 70.1076206,55.9757519 70.1076206,55.9757519 L70.9628524,47.3191957 C70.9628524,47.3191957 67.231904,45.654951 67.5739967,52.5106455 C67.9160893,59.36634 63.9820234,55.2802467 69.8831223,69.4387462 L69.8831223,69.4263265 Z",
  "M59.7593168,81.2002366 C59.7593168,81.2002366 54.7562112,74.7543934 42.6546823,74.0464684 C30.5531534,73.3385434 34.7972408,93.148023 43.6061276,92.489777 C52.4150143,91.8315309 48.1816173,81.461051 48.1816173,81.461051 L40.7304109,82.4546299 C40.7304109,82.4546299 39.2978978,78.1201419 45.1989967,78.5175735 C51.1000956,78.9150051 47.5829551,74.3445421 59.7700072,81.2002366 L59.7593168,81.2002366 Z",
];

/* 小装饰：2 圆角矩形 + 1 椭圆（左花纹） / 3 圆角矩形（右花纹，椭圆位置被替换为第 3 矩形） */
const SMALL_LEFT_TOP = [
  "M13.2988533,8.68139574 C11.5883899,6.69423792 11.5883899,3.47752619 13.2988533,1.49036837 C15.0093168,-0.496789456 17.7781295,-0.496789456 19.4885929,1.49036837 C21.1990564,3.47752619 21.1990564,6.69423792 19.4885929,8.68139574 C17.7781295,10.6685536 15.0093168,10.6685536 13.2988533,8.68139574 Z",
  "M1.28284759,22.6411795 C-0.427615862,20.6540216 -0.427615862,17.4373099 1.28284759,15.4501521 C2.99331104,13.4629943 5.76212375,13.4629943 7.4725872,15.4501521 C9.18305065,17.4373099 9.18305065,20.6540216 7.4725872,22.6411795 C5.76212375,24.6283373 2.99331104,24.6283373 1.28284759,22.6411795 Z",
];
const SMALL_LEFT_BOTTOM = [
  "M13.2988533,18.4433086 C11.5883899,20.4304664 11.5883899,23.6471781 13.2988533,25.6343359 C15.0093168,27.6214937 17.7781295,27.6214937 19.4885929,25.6343359 C21.1990564,23.6471781 21.1990564,20.4304664 19.4885929,18.4433086 C17.7781295,16.4561507 15.0093168,16.4561507 13.2988533,18.4433086 Z",
  "M1.28284759,4.48352484 C-0.427615862,6.47068266 -0.427615862,9.68739439 1.28284759,11.6745522 C2.99331104,13.66171 5.76212375,13.66171 7.4725872,11.6745522 C9.18305065,9.68739439 9.18305065,6.47068266 7.4725872,4.48352484 C5.76212375,2.49636702 2.99331104,2.49636702 1.28284759,4.48352484 Z",
];
const SMALL_RIGHT_TOP = [
  "M9.68549928,8.68139574 C11.3959627,6.69423792 11.3959627,3.47752619 9.68549928,1.49036837 C7.97503583,-0.496789456 5.20622312,-0.496789456 3.49575968,1.49036837 C1.78529623,3.47752619 1.78529623,6.69423792 3.49575968,8.68139574 C5.20622312,10.6685536 7.97503583,10.6685536 9.68549928,8.68139574 Z",
  "M21.701505,22.6411795 C23.4119685,20.6540216 23.4119685,17.4373099 21.701505,15.4501521 C19.9910416,13.4629943 17.2222289,13.4629943 15.5117654,15.4501521 C13.801302,17.4373099 13.801302,20.6540216 15.5117654,22.6411795 C17.2222289,24.6283373 19.9910416,24.6283373 21.701505,22.6411795 Z",
  "M7.4725872,25.6343359 C9.18305065,23.6471781 9.18305065,20.4304664 7.4725872,18.4433086 C5.76212375,16.4561507 2.99331104,16.4561507 1.28284759,18.4433086 C-0.427615862,20.4304664 -0.427615862,23.6471781 1.28284759,25.6343359 C2.99331104,27.6214937 5.76212375,27.6214937 7.4725872,25.6343359 Z",
];
const SMALL_RIGHT_BOTTOM = [
  "M9.68549928,18.4557283 C11.3959627,20.4428861 11.3959627,23.6595978 9.68549928,25.6467557 C7.97503583,27.6339135 5.20622312,27.6339135 3.49575968,25.6467557 C1.78529623,23.6595978 1.78529623,20.4428861 3.49575968,18.4557283 C5.20622312,16.4685705 7.97503583,16.4685705 9.68549928,18.4557283 Z",
  "M21.701505,4.49594458 C23.4119685,6.4831024 23.4119685,9.69981413 21.701505,11.6869719 C19.9910416,13.6741298 17.2222289,13.6741298 15.5117654,11.6869719 C13.801302,9.69981413 13.801302,6.4831024 15.5117654,4.49594458 C17.2222289,2.50878675 19.9910416,2.50878675 21.701505,4.49594458 Z",
  "M7.4725872,1.49036837 C9.18305065,3.47752619 9.18305065,6.69423792 7.4725872,8.68139574 C5.76212375,10.6685536 2.99331104,10.6685536 1.28284759,8.68139574 C-0.427615862,6.69423792 -0.427615862,3.47752619 1.28284759,1.49036837 C2.99331104,-0.496789456 5.76212375,-0.496789456 7.4725872,1.49036837 Z",
];

/* 椭圆：左花纹在 2 圆角矩形之间的椭圆形（参考 SVG 第 3 个子元素） */
const SMALL_LEFT_ELLIPSE = { cx: 18.6119804, cy: 22.0326124, rx: 4.37237219, ry: 5.07967219 };
const SMALL_LEFT_ELLIPSE_BOTTOM = { cx: 18.6119804, cy: 5.07967219, rx: 4.37237219, ry: 5.07967219 };

interface CurlingBranchBandProps {
  color1: string;
  backgroundColor?: string;
  strokeWidth?: number;
}

export function CurlingBranchBand({
  color1,
  backgroundColor,
  strokeWidth = 1,
}: CurlingBranchBandProps) {
  const [ref, { width: w, height: h }] = useElementSize();

  const c1 = color1 || "#C89F49";
  const fill = c1;
  const strokeColor = c1;

  return (
    <div
      ref={ref}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        backgroundColor: backgroundColor || "transparent",
      }}
    >
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${VBW_DECO8} ${VBH_DECO8}`}
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      >
        {/* 徽章形外框（双环路径，fill-rule="evenodd" 形成环形带状） */}
        <path
          d={BADGE_OUTER_D}
          fill={fill}
          fillRule="evenodd"
          stroke={strokeColor}
          strokeWidth={Math.max(0.5, strokeWidth)}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* 左上花纹 + 小装饰（translate 包含小装饰） */}
        <g transform="translate(5.5372, 7.7246)">
          {ORNAMENT_TOP_LEFT.map((d, i) => (
            <path
              key={`tl-${i}`}
              d={d}
              fill={fill}
              stroke={fill}
              strokeWidth={Math.max(0.5, strokeWidth * 0.3)}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <g transform="translate(63.0737, 73.2893)">
            {SMALL_LEFT_TOP.map((d, i) => (
              <path
                key={`tl-sm-${i}`}
                d={d}
                fill="none"
                stroke={fill}
                strokeWidth={Math.max(0.5, strokeWidth * 0.4)}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <ellipse
              cx={SMALL_LEFT_ELLIPSE.cx}
              cy={SMALL_LEFT_ELLIPSE.cy}
              rx={SMALL_LEFT_ELLIPSE.rx}
              ry={SMALL_LEFT_ELLIPSE.ry}
              fill="none"
              stroke={fill}
              strokeWidth={Math.max(0.5, strokeWidth * 0.4)}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        </g>
        {/* 左下花纹 + 小装饰 */}
        <g transform="translate(5.5372, 160.1898)">
          {ORNAMENT_BOTTOM_LEFT.map((d, i) => (
            <path
              key={`bl-${i}`}
              d={d}
              fill={fill}
              stroke={fill}
              strokeWidth={Math.max(0.5, strokeWidth * 0.3)}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <g transform="translate(63.0737, 22.8275)">
            {SMALL_LEFT_BOTTOM.map((d, i) => (
              <path
                key={`bl-sm-${i}`}
                d={d}
                fill="none"
                stroke={fill}
                strokeWidth={Math.max(0.5, strokeWidth * 0.4)}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <ellipse
              cx={SMALL_LEFT_ELLIPSE_BOTTOM.cx}
              cy={SMALL_LEFT_ELLIPSE_BOTTOM.cy}
              rx={SMALL_LEFT_ELLIPSE_BOTTOM.rx}
              ry={SMALL_LEFT_ELLIPSE_BOTTOM.ry}
              fill="none"
              stroke={fill}
              strokeWidth={Math.max(0.5, strokeWidth * 0.4)}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        </g>
        {/* 右上花纹 + 小装饰（3 圆角矩形，无椭圆） */}
        <g transform="translate(1497.4894, 7.7246)">
          {ORNAMENT_TOP_RIGHT.map((d, i) => (
            <path
              key={`tr-${i}`}
              d={d}
              fill={fill}
              stroke={fill}
              strokeWidth={Math.max(0.5, strokeWidth * 0.3)}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <g transform="translate(20.0017, 73.2893)">
            {SMALL_RIGHT_TOP.map((d, i) => (
              <path
                key={`tr-sm-${i}`}
                d={d}
                fill="none"
                stroke={fill}
                strokeWidth={Math.max(0.5, strokeWidth * 0.4)}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        </g>
        {/* 右下花纹 + 小装饰 */}
        <g transform="translate(1497.4894, 160.1898)">
          {ORNAMENT_BOTTOM_RIGHT.map((d, i) => (
            <path
              key={`br-${i}`}
              d={d}
              fill={fill}
              stroke={fill}
              strokeWidth={Math.max(0.5, strokeWidth * 0.3)}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <g transform="translate(20.0017, 22.8151)">
            {SMALL_RIGHT_BOTTOM.map((d, i) => (
              <path
                key={`br-sm-${i}`}
                d={d}
                fill="none"
                stroke={fill}
                strokeWidth={Math.max(0.5, strokeWidth * 0.4)}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        </g>
      </svg>
    </div>
  );
}

/* ===================== 流光飘带 FlowingLightBand ===================== */
/* 参考 SVG: vectorstock_53385032.svg
   - viewBox: 0 0 1548 2287
   - 18 条主路径 (transform="translate(258.65, 24.46)") + 18 条透明度 0.5 的副路径 (transform="translate(0, 24.28)")
   - 2 条大弧形装饰路径（左下/右上）
   - 所有元素共用一个纵向渐变；通过 gradientTransform 平移实现"流动"动画
   - 默认 2 个色（color1 主色, color2 副色），内部按 4 段派生保证渐变协调
   - 默认动画效果：纵向流光（dur=3s, 无限循环） */

const VBW_FLOW = 1548;
const VBH_FLOW = 2287;

/* Group A: 18 条主路径 (transform="translate(258.65, 24.46)") */
const FLOW_PATHS_A: string[] = [
  "M739.94,2136.57 L736.19,2135.47 C736.47,2134.65 763.28,2045.87 688.65,1460.19 C649.57,1153.47 464.43,773.35 315.99,508.49 C155.13,221.43 1.53,4.15 -1.13686838e-13,1.99 L3.29,0 C4.82,2.16 158.52,219.57 319.48,506.78 C414.02,675.48 492.54,834.91 552.85,980.63 C628.27,1162.85 675.27,1324.05 692.56,1459.76 C767.47,2047.7 741.1,2133.22 739.94,2136.57 L739.94,2136.57 Z",
  "M703.04,2135.51 L699.92,2133.3 C703.93,2128.49 737.23,2068.83 673.2,1463.99 C640.43,1154.45 469.53,773.43 331.93,508.29 C182.81,220.96 39.62,4.1 38.19,1.94 L41.54,0.05 C42.97,2.21 186.27,219.23 335.47,506.72 C423.11,675.58 495.61,835.37 550.96,981.63 C620.17,1164.52 662.61,1326.69 677.11,1463.63 C739.96,2057.3 709.73,2127.47 703.03,2135.51 L703.04,2135.51 Z",
  "M666.45,2133.9 L663.33,2131.69 C684.17,2106.67 700.12,1971.18 657.74,1467.79 C631.43,1155.3 474.78,773.4 348,508.05 C210.6,220.47 77.72,4.05 76.39,1.89 L79.81,0.1 C81.14,2.25 214.11,218.81 351.58,506.54 C432.33,675.54 498.81,835.68 549.19,982.5 C612.18,1166.08 650.02,1329.26 661.66,1467.5 C695.28,1866.86 696.94,2097.29 666.45,2133.9 L666.45,2133.9 Z",
  "M629.86,2132.28 L626.74,2130.07 C649.35,2102.93 675.55,2005.15 642.28,1471.58 C622.6,1155.97 480.18,773.18 364.18,507.64 C238.46,219.86 115.81,3.98 114.59,1.83 L118.07,0.14 C119.3,2.29 242.02,218.3 367.81,506.24 C441.7,675.36 502.17,835.85 547.56,983.24 C604.31,1167.53 637.5,1331.75 646.21,1471.36 C660.88,1706.64 665.37,1880.79 659.54,1988.98 C653.98,2092.15 639.94,2120.17 629.86,2132.28 L629.86,2132.28 Z",
  "M593.27,2130.67 L590.15,2128.45 C621.35,2090.99 647.4,1985.95 626.82,1475.38 C613.97,1156.51 485.78,772.85 380.5,507.15 C266.41,219.2 153.9,3.93 152.78,1.79 L156.32,0.21 C157.44,2.35 270.02,217.76 384.18,505.87 C451.23,675.09 505.71,835.92 546.09,983.89 C596.58,1168.89 625.07,1334.21 630.75,1475.25 C651.37,1986.98 624.92,2092.68 593.27,2130.67 L593.27,2130.67 Z",
  "M556.68,2129.06 L553.56,2126.84 C594.35,2077.88 619.78,1949.01 611.36,1479.18 C605.58,1156.93 491.6,772.4 397,506.57 C294.48,218.48 192,3.87 190.98,1.74 L194.58,0.27 C195.6,2.4 298.15,217.15 400.73,505.4 C460.98,674.7 509.46,835.87 544.82,984.43 C589.03,1170.17 612.74,1336.61 615.3,1479.13 C623.77,1951.58 599.15,2078.09 556.68,2129.06 L556.68,2129.06 Z",
  "M520.09,2127.44 L516.97,2125.22 C564.05,2068.7 593.68,1941.55 595.91,1482.97 C597.49,1157.22 497.7,771.81 413.7,505.86 C322.68,217.66 230.11,3.8 229.18,1.68 L232.83,0.33 C233.75,2.46 326.4,216.48 417.47,504.85 C470.96,674.22 513.45,835.73 543.77,984.87 C581.67,1171.35 600.53,1338.94 599.83,1482.99 C598.76,1704.57 591.56,1855.04 577.18,1956.55 C564.93,2042.99 547.86,2094.1 520.08,2127.44 L520.09,2127.44 Z",
  "M483.5,2125.84 L480.38,2123.61 C534.23,2058.97 567.86,1934.05 580.45,1486.77 C589.72,1157.44 504.11,771.17 430.65,505.13 C351.05,216.84 268.21,3.74 267.38,1.62 L271.08,0.39 C271.91,2.51 354.82,215.78 434.46,504.24 C481.24,673.67 517.75,835.5 543,985.26 C574.56,1172.49 588.48,1341.26 584.38,1486.88 C571.76,1935.15 537.83,2060.61 483.49,2125.84 L483.5,2125.84 Z",
  "M446.91,2124.2 L443.79,2121.99 C503.45,2050.37 542.41,1924.09 565,1490.56 C582.35,1157.6 510.9,770.5 447.9,504.39 C379.63,216.01 306.32,3.67 305.59,1.55 L309.33,0.44 C310.06,2.55 383.42,215.03 451.73,503.57 C491.85,673.04 522.4,835.21 542.54,985.57 C567.72,1173.55 576.59,1343.51 568.93,1490.73 C546.29,1925.21 507.05,2052.01 446.91,2124.2 Z",
  "M410.32,2122.6 L407.2,2120.38 C483.83,2028.39 521.08,1864.57 549.55,1494.36 C575.43,1157.72 518.11,769.75 465.47,503.56 C408.43,215.11 344.44,3.6 343.8,1.5 L347.59,0.52 C348.23,2.62 412.26,214.3 469.34,502.91 C502.86,672.42 527.47,834.92 542.46,985.89 C561.21,1174.64 564.92,1345.8 553.47,1494.62 C524.95,1865.64 487.48,2029.97 410.32,2122.6 L410.32,2122.6 Z",
  "M373.73,2120.97 L370.61,2118.76 C453.54,2019.22 497.85,1851.01 534.09,1498.14 C569.04,1157.86 525.83,769.04 483.43,502.79 C437.48,214.26 382.55,3.52 382,1.42 L385.82,0.57 C386.37,2.67 441.33,213.54 487.31,502.22 C514.31,671.77 532.98,834.6 542.8,986.18 C555.07,1175.68 553.46,1348.05 538,1498.48 C518.94,1683.99 497.82,1815.67 471.51,1912.87 C446.36,2005.79 416.2,2069.96 373.72,2120.97 L373.73,2120.97 Z",
  "M337.14,2119.35 L334.02,2117.14 C424.46,2008.58 474.49,1841.84 518.64,1501.93 C563.31,1158.04 534.17,768.37 501.86,502.03 C466.85,213.41 420.68,3.44 420.22,1.36 L424.07,0.63 C424.53,2.72 470.73,212.82 505.76,501.59 C538.09,768.13 567.25,1158.12 522.54,1502.36 C499.73,1678.01 475.33,1804.99 445.78,1901.97 C417.27,1995.52 382.75,2064.6 337.13,2119.35 L337.14,2119.35 Z",
  "M300.56,2117.74 L297.44,2115.53 C394.32,1999.24 452.01,1828.26 503.2,1505.72 C558.33,1158.34 543.23,767.81 520.85,501.36 C496.6,212.63 458.82,3.38 458.44,1.3 L462.32,0.7 C462.7,2.78 500.5,212.16 524.77,501.04 C547.17,767.68 562.28,1158.52 507.09,1506.25 C455.79,1829.47 397.88,2000.91 300.55,2117.74 L300.56,2117.74 Z",
  "M263.97,2116.12 L260.85,2113.91 C364.11,1989.96 429.85,1814.85 487.76,1509.5 C554.27,1158.81 553.14,767.39 540.49,500.78 C526.78,211.9 496.96,3.3 496.66,1.23 L500.56,0.75 C500.86,2.82 530.7,211.58 544.42,500.62 C557.08,767.41 558.2,1159.11 491.63,1510.12 C433.6,1816.1 367.64,1991.67 263.97,2116.12 L263.97,2116.12 Z",
  "M227.38,2114.51 L224.26,2112.3 C333.73,1980.9 407.91,1801.75 472.31,1513.29 C551.27,1159.61 564.08,767.32 560.92,500.51 C557.5,211.39 535.11,3.25 534.88,1.18 L538.79,0.81 C539.02,2.88 561.42,211.15 564.84,500.42 C568,767.42 555.18,1160 476.15,1514.01 C444.1,1657.59 409.38,1773.9 370.01,1869.6 C329.71,1967.55 283.06,2047.66 227.36,2114.51 L227.38,2114.51 Z",
  "M190.79,2112.89 L187.67,2110.68 C301.49,1974.06 387.03,1785.43 456.87,1517.06 C549.58,1160.81 576.24,767.62 582.29,500.5 C588.84,211.05 573.26,3.18 573.11,1.12 L577.03,0.86 C577.19,2.93 592.78,210.92 586.22,500.53 C580.17,767.84 553.48,1161.33 460.69,1517.9 C425.86,1651.74 388.08,1763.31 345.18,1858.99 C300.4,1958.88 249.89,2041.93 190.78,2112.89 L190.79,2112.89 Z",
  "M154.2,2111.29 L151.08,2109.07 C270.21,1966.07 365.19,1773.66 441.43,1520.84 C549.45,1162.65 589.89,768.52 604.8,500.97 C620.95,211.04 611.43,3.15 611.33,1.09 L615.26,0.93 C615.36,3 624.89,211.02 608.73,501.11 C593.82,768.86 553.34,1163.29 445.22,1521.82 C368.84,1775.09 273.65,1967.91 154.2,2111.29 L154.2,2111.29 Z",
  "M117.61,2109.66 L114.49,2107.45 C407.59,1755.63 537.46,1201.69 594.8,798.95 C656.94,362.45 649.64,4.6 649.55,1.03 L653.48,0.95 C653.56,4.52 660.88,362.6 598.7,799.36 C562.18,1055.9 509.18,1289 441.18,1492.18 C356.15,1746.24 247.28,1953.99 117.6,2109.66 L117.61,2109.66 Z",
];

/* Group B: 18 条副路径 (transform="translate(0, 24.28)", opacity="0.5") */
const FLOW_PATHS_B: string[] = [
  "M1144.73,2136.2 L1140.79,2136.2 C1140.79,1983.85 976.93,1909.62 803.46,1831.03 C718.76,1792.66 631.19,1752.98 562.8,1703.13 C425.34,1602.93 429.78,1421.95 435.41,1192.82 C438.18,1079.77 441.33,951.63 426.85,817.91 C404.54,611.88 289.7,401.13 197.29,260.62 C97.09,108.3 0.96,3.39 -2.84217094e-14,2.35 L2.99,-4.26325641e-14 C3.95,1.04 100.26,106.13 200.6,258.68 C259.54,348.29 308.32,436.51 345.59,520.9 C392.21,626.43 420.86,726.24 430.75,817.55 C445.26,951.49 442.11,1079.75 439.33,1192.9 C433.73,1421.02 429.31,1601.2 565.23,1700.28 C633.29,1749.89 720.68,1789.48 805.19,1827.77 C893,1867.55 975.93,1905.12 1039.24,1953.04 C1110.22,2006.77 1144.73,2066.68 1144.73,2136.2 L1144.73,2136.2 Z",
  "M1154.79,2136.21 C1154.71,2064.77 1122.25,2005.4 1052.62,1949.36 C990.96,1899.74 910.23,1860.55 824.75,1819.07 C745.55,1780.63 663.65,1740.89 599.15,1692.27 C455.6,1584.07 457.56,1395.1 460.03,1155.85 C460.5,1110.84 460.98,1064.3 460.52,1016.1 C459.78,940.05 456.81,876.49 451.17,816.09 C432.05,610.96 328.66,400.64 245.29,260.33 C154.91,108.22 67.94,3.32 67.07,2.28 L70.19,0.07 C71.06,1.11 158.19,106.19 248.7,258.53 C301.87,348.01 345.79,436.05 379.26,520.21 C421.11,625.45 446.62,724.9 455.09,815.78 C460.74,876.28 463.71,939.92 464.45,1016.07 C464.91,1064.31 464.43,1110.87 463.96,1155.89 C461.5,1394.16 459.55,1582.37 601.63,1689.47 C665.82,1737.85 747.54,1777.51 826.57,1815.86 C908.49,1855.62 993.19,1896.72 1055.2,1946.63 C1124.78,2002.63 1158.64,2064.64 1158.72,2136.21 L1154.79,2136.21 L1154.79,2136.21 Z",
  "M1168.79,2136.2 C1168.44,1974.22 1011.85,1892.8 846.07,1806.61 C772.35,1768.28 696.11,1728.64 635.51,1681.42 C484.47,1563.73 484.19,1364.46 483.83,1112.18 C483.78,1080.16 483.74,1047.06 483.38,1013.22 C482.52,934.17 480.1,872.81 475.51,814.27 C459.59,610.02 367.63,400.11 293.28,259.98 C212.7,108.1 134.92,3.24 134.14,2.2 L137.38,0.14 C138.16,1.18 216.1,106.26 296.8,258.37 C371.3,398.79 463.45,609.17 479.42,814 C484.01,872.62 486.44,934.05 487.3,1013.18 C487.66,1047.03 487.7,1080.15 487.75,1112.17 C488.11,1363.51 488.4,1562.04 638.04,1678.64 C698.36,1725.64 774.43,1765.2 848,1803.44 C927.88,1844.97 1010.48,1887.92 1071.18,1939.89 C1139.35,1998.26 1172.56,2062.47 1172.72,2136.2 L1168.79,2136.2 L1168.79,2136.2 Z",
  "M1182.79,2136.21 C1182.26,1969.02 1022.2,1879.84 867.41,1793.6 C799.15,1755.57 728.56,1716.24 671.86,1670.57 C597.98,1611.07 552.92,1530.86 530.03,1418.14 C509.19,1315.48 508.04,1196.45 506.71,1058.62 C506.56,1042.74 506.4,1026.65 506.21,1010.34 C505.47,948.36 504.18,881.49 499.83,812.45 C487.11,609.12 406.61,399.65 341.31,259.73 C270.55,108.05 201.9,3.16 201.21,2.12 L204.57,0.24 C205.26,1.28 274.02,106.35 344.9,258.23 C410.33,398.43 491,608.36 503.76,812.23 C508.12,881.35 509.41,948.27 510.15,1010.3 C510.34,1026.61 510.49,1042.7 510.65,1058.59 C513.24,1327.36 515.28,1539.64 674.45,1667.84 C730.9,1713.3 801.33,1752.55 869.45,1790.5 C947.29,1833.87 1027.78,1878.71 1087.17,1932.85 C1153.92,1993.7 1186.49,2060.22 1186.73,2136.21 L1182.8,2136.21 L1182.79,2136.21 Z",
  "M1196.79,2136.21 C1196.07,1963.49 1039.84,1870.18 888.75,1779.95 C825.94,1742.44 760.99,1703.65 708.21,1659.71 C629.86,1594.49 581.63,1508.79 556.42,1390 C534.18,1285.18 531.05,1165.33 529.06,1007.46 L529.03,1005.34 C528.21,942.55 527.35,877.63 524.16,810.62 C514.64,608.17 445.57,399.09 389.31,259.35 C328.34,107.92 268.88,3.06 268.28,2.02 L271.76,0.33 C272.36,1.37 331.94,106.43 392.99,258.08 C449.35,398.07 518.54,607.53 528.08,810.45 C531.28,877.51 532.13,942.46 532.96,1005.28 L532.99,1007.4 C536.56,1290.6 539.38,1514.28 710.84,1657 C763.39,1700.75 828.21,1739.45 890.88,1776.89 C966.68,1822.16 1045.06,1868.97 1103.13,1925.37 C1168.47,1988.83 1200.39,2057.79 1200.71,2136.18 L1196.78,2136.18 L1196.79,2136.21 Z",
  "M1210.79,2136.23 C1209.87,1957.58 1057.46,1859.97 910.08,1765.58 C852.72,1728.84 793.4,1690.86 744.57,1648.85 C665.14,1580.52 614.85,1495.08 586.3,1379.97 C560.61,1276.42 553.98,1155.01 551.92,1004.57 C551.7,989.24 551.51,973.74 551.33,958.08 C550.75,909.73 550.14,859.73 548.51,808.79 C542.19,607.25 484.58,398.61 437.37,259.08 C386.2,107.85 335.88,2.96 335.38,1.92 L338.97,0.45 C339.47,1.49 389.87,106.54 441.11,257.96 C488.4,397.73 546.11,606.73 552.45,808.7 C554.09,859.67 554.69,909.69 555.27,958.05 C555.46,973.71 555.65,989.21 555.87,1004.54 C559.61,1278.03 576.08,1498.95 747.27,1646.21 C795.89,1688.04 855.09,1725.95 912.34,1762.62 C1060.56,1857.54 1213.82,1955.7 1214.75,2136.23 L1210.82,2136.23 L1210.79,2136.23 Z",
  "M1224.79,2136.21 C1223.67,1951.23 1075.05,1849.13 931.33,1750.38 C879.42,1714.72 825.75,1677.84 780.92,1637.99 C700.26,1566.28 647.92,1481.09 616.19,1369.91 C589.6,1276.72 577.21,1166.59 574.77,1001.68 C574.31,971.85 574.1,941.94 573.88,910.27 C573.65,876.67 573.41,841.93 572.83,806.96 C569.71,606.3 523.54,398.06 485.37,258.7 C444,107.69 402.86,2.83 402.45,1.79 L406.14,0.55 C406.55,1.59 447.77,106.63 489.18,257.81 C527.41,397.36 573.63,605.89 576.76,806.91 C577.33,841.9 577.57,876.65 577.81,910.25 C578.03,941.91 578.24,971.81 578.7,1001.63 C582.99,1291.41 617.9,1488 783.65,1635.37 C828.29,1675.06 881.87,1711.87 933.68,1747.47 C1078.18,1846.74 1227.59,1949.4 1228.73,2136.21 L1224.8,2136.21 L1224.79,2136.21 Z",
  "M1238.79,2136.21 C1237.45,1944.33 1092.57,1837.51 952.46,1734.2 C906.03,1699.96 858.01,1664.56 817.28,1627.13 C640.7,1464.85 601.76,1258.58 597.62,998.8 C596.88,954.51 596.98,909.46 597.1,861.77 C597.14,843.05 597.19,824.17 597.18,805.14 C597.33,422.83 470.83,5.84 469.55,1.67 L473.33,0.68 C474.61,4.85 601.26,422.31 601.11,805.14 C601.11,824.17 601.08,843.06 601.03,861.78 C600.92,909.46 600.82,954.49 601.55,998.75 C605.68,1257.65 644.42,1463.15 820.05,1624.56 C860.63,1661.85 906.42,1695.62 954.91,1731.37 C1095.74,1835.21 1241.37,1942.58 1242.72,2136.21 L1238.79,2136.21 Z",
  "M1252.78,2136.21 C1251.22,1936.75 1109.96,1824.95 973.36,1716.83 C930.56,1682.95 890.13,1650.96 853.62,1616.27 C692.94,1463.61 625.39,1283.88 620.45,995.92 C619.4,937.08 620.34,876.39 621.35,812.13 L621.49,803.31 C627.77,422.71 537.53,5.7 536.62,1.53 L540.47,0.81 C541.38,4.98 631.7,422.36 625.42,803.36 L625.28,812.18 C624.28,876.41 623.33,937.07 624.38,995.86 C629.3,1282.8 696.53,1461.81 856.44,1613.74 C892.82,1648.31 933.19,1680.26 975.92,1714.08 C1113.19,1822.72 1255.13,1935.07 1256.71,2136.21 L1252.78,2136.21 L1252.78,2136.21 Z",
  "M1266.78,2136.24 C1264.97,1928.31 1127.19,1811.24 993.94,1698.02 C956.99,1666.63 922.09,1636.97 889.98,1605.42 C803.97,1520.91 745.53,1436.43 706.06,1339.56 C666.32,1242.02 645.79,1128.67 643.31,993.05 C642.19,934.91 643.51,874.42 645.83,801.5 C658.24,422.61 604.28,5.58 603.74,1.41 L607.64,0.97 C608.19,5.14 662.18,422.44 649.76,801.61 C647.44,874.48 646.13,934.92 647.24,992.99 C652.13,1259.64 723.29,1436.35 892.85,1602.95 C924.86,1634.4 959.71,1664.01 996.61,1695.36 C1062.54,1751.38 1130.72,1809.31 1182.48,1879.25 C1241.04,1958.37 1269.9,2042.43 1270.72,2136.21 L1266.79,2136.24 L1266.78,2136.24 Z",
  "M1280.78,2136.23 C1278.71,1918.73 1144.14,1796.02 1013.99,1677.36 C983.03,1649.13 953.79,1622.47 926.33,1594.57 C837.5,1504.28 777.05,1420.02 736.1,1329.38 C691.58,1230.86 668.7,1119.9 666.16,990.17 C664.79,923.28 667.58,853.23 670.17,799.67 C688.71,422.49 671.04,5.43 670.86,1.26 L674.79,1.11 C674.97,5.28 692.65,422.49 674.1,799.83 C671.52,853.33 668.73,923.31 670.1,990.1 C674.91,1235.51 750,1409.92 929.26,1592.13 C956.64,1619.96 985.85,1646.59 1016.77,1674.78 C1080.96,1733.31 1147.33,1793.83 1198.02,1867.15 C1255.44,1950.21 1283.8,2038.22 1284.73,2136.2 L1280.8,2136.23 L1280.78,2136.23 Z",
  "M1294.78,2136.24 C1292.42,1907.62 1160.66,1778.84 1033.23,1654.3 C1008.49,1630.12 985.12,1607.28 962.7,1583.7 C797.81,1410.25 694.51,1249.98 689.02,987.28 C687.86,933.74 689.6,873.55 694.51,797.84 C719.19,422.36 737.81,5.27 738,1.11 L741.93,1.26 C741.74,5.43 723.12,422.55 698.44,798.06 C693.54,873.67 691.79,933.77 692.95,987.21 C698.42,1248.8 801.35,1408.48 965.66,1581.31 C988.03,1604.85 1011.38,1627.66 1036.09,1651.82 C1098.72,1713.03 1163.49,1776.33 1213.25,1853.4 C1269.7,1940.84 1297.66,2033.34 1298.72,2136.2 L1294.79,2136.24 L1294.78,2136.24 Z",
  "M1308.78,2136.22 C1306.1,1894.39 1170.67,1752.89 1051.17,1628.04 C1033.02,1609.07 1015.87,1591.16 999.05,1572.83 C839.89,1399.47 717.68,1246.06 711.86,984.39 C710.62,930.38 712.9,868.75 718.84,796 C749.65,422.23 804.59,5.12 805.14,0.95 L809.04,1.39 C808.49,5.56 753.57,422.6 722.76,796.28 C716.83,868.91 714.55,930.42 715.79,984.32 C721.59,1244.8 843.4,1397.69 1002.05,1570.49 C1018.85,1588.79 1035.98,1606.69 1054.12,1625.64 C1115.49,1689.76 1178.95,1756.06 1228.04,1837.37 C1283.81,1929.76 1311.51,2027.5 1312.72,2136.18 L1308.79,2136.22 L1308.78,2136.22 Z",
  "M1322.78,2136.22 C1319.73,1878.04 1185.48,1728.89 1067.04,1597.3 C1056.59,1585.69 1045.78,1573.68 1035.41,1561.98 L1023.02,1548 C865.22,1370.08 740.58,1229.54 734.71,981.51 C733.38,926.73 736.15,865.45 743.18,794.18 C780.13,422.13 871.38,4.98 872.3,0.81 L876.15,1.53 C875.23,5.7 784.03,422.66 747.09,794.51 C740.08,865.64 737.31,926.79 738.64,981.43 C744.47,1228.2 868.74,1368.31 1026.06,1545.69 L1038.46,1559.67 C1048.82,1571.36 1059.62,1583.36 1070.07,1594.97 C1188.93,1727.03 1323.65,1876.71 1326.72,2136.17 L1322.79,2136.22 L1322.78,2136.22 Z",
  "M1336.78,2136.22 C1333.27,1856.86 1198.38,1699.15 1079.37,1560.01 L1071.76,1551.11 C1052.07,1528.07 1032.49,1505.74 1013.56,1484.13 C946.27,1407.36 882.71,1334.85 836.47,1255.44 C785.16,1167.32 760.08,1079.36 757.55,978.62 C756.13,923.36 759.39,862.43 767.51,792.34 C810.6,422.01 938.18,4.84 939.46,0.67 L943.24,1.66 C941.96,5.83 814.47,422.71 771.42,792.73 C763.32,862.66 760.07,923.43 761.49,978.54 C766.97,1197.03 882.66,1329.02 1016.62,1481.85 C1035.56,1503.46 1055.15,1525.81 1074.85,1548.86 L1082.46,1557.76 C1201.86,1697.36 1337.19,1855.58 1340.71,2136.18 L1336.78,2136.22 Z",
  "M1350.78,2136.22 C1347.03,1853.65 1228.85,1686.86 1108.12,1540.25 C1077.15,1502.63 1046.11,1467.65 1016.09,1433.81 C892.45,1294.44 785.68,1174.08 780.41,975.75 C778.91,920.19 782.66,859.6 791.85,790.53 C841.09,421.91 1004.99,4.73 1006.64,0.56 L1010.33,1.8 C1008.68,5.97 844.93,422.77 795.75,790.97 C786.58,859.86 782.84,920.28 784.33,975.66 C789.56,1172.74 895.95,1292.66 1019.12,1431.51 C1049.16,1465.37 1080.22,1500.39 1111.24,1538.05 C1165.89,1604.43 1228.12,1683.4 1274.9,1780.84 C1326.86,1889.06 1352.96,2005.29 1354.7,2136.18 L1350.77,2136.22 L1350.78,2136.22 Z",
  "M1364.78,2136.22 C1360.66,1841.19 1251.11,1663.9 1144.48,1529.38 C1105.08,1479.68 1064.71,1435.41 1025.66,1392.6 C909.06,1264.77 808.36,1154.37 803.26,972.86 C801.71,917.91 806.06,855.95 816.19,788.69 C871.57,421.8 1071.81,4.6 1073.83,0.43 L1077.42,1.91 C1075.41,6.08 875.39,422.82 820.09,789.19 C809.98,856.25 805.64,918.01 807.19,972.76 C812.25,1153 912.54,1262.95 1028.67,1390.26 C1067.76,1433.11 1108.18,1477.43 1147.66,1527.23 C1194.44,1586.25 1253.82,1667.59 1298.08,1773.55 C1343.73,1882.83 1366.83,2001.44 1368.72,2136.17 L1364.79,2136.22 L1364.78,2136.22 Z",
  "M1378.78,2136.23 C1372.53,1708.93 1195.67,1522.39 1039.64,1357.81 C927.74,1239.78 831.09,1137.84 826.11,969.99 C823.42,879.24 838.3,771.78 870.36,650.59 C895.99,553.69 932.6,447.84 979.16,335.97 C1058.43,145.53 1140.2,1.76 1141.02,0.33 L1144.5,2.02 C1143.68,3.45 1062,147.06 982.82,337.31 C909.77,512.82 823.97,765.04 830.05,969.88 C834.99,1136.42 931.2,1237.9 1042.61,1355.41 C1117.62,1434.52 1202.63,1524.19 1267.74,1645.63 C1342.32,1784.73 1379.93,1945.18 1382.72,2136.17 L1378.79,2136.23 L1378.78,2136.23 Z",
];

/* 2 条大弧形装饰路径（左下 / 右上） */
const FLOW_PATH_BIG_LEFT =
  "M665.67,0 L809.41,28.28 C809.41,28.28 843.27,313.96 677.03,519.68 C510.78,725.39 384.03,989.69 373.69,1191.91 C363.35,1394.13 451.98,1547.73 446.56,1771.34 C441.14,1994.95 138.23,2286 138.23,2286 C138.23,2286 420.72,1954.06 393.24,1781.28 C365.76,1608.5 215.5,1405.9 328.91,1019.7 C442.32,633.51 601.01,463.87 632.01,316.78 C663.01,169.69 665.68,0 665.68,0 L665.67,0 Z";

const FLOW_PATH_BIG_RIGHT =
  "M1404.93,2270.84 L1546.76,2235.27 C1546.76,2235.27 1563.48,1948.29 1385.17,1751.38 C1206.86,1554.46 1064.48,1297.04 1042.06,1095.65 C1019.63,894.27 1098.94,736.38 1080.14,513.39 C1061.35,290.4 741.48,15.25 741.48,15.25 C741.48,15.25 1043.4,332.27 1026.3,506.19 C1009.2,680.11 871.3,890.07 1007.65,1269.89 C1144,1649.71 1312.6,1810.98 1352.35,1956.27 C1392.11,2101.55 1404.93,2270.84 1404.93,2270.84 L1404.93,2270.84 Z";

/** 5 段渐变色派生：上下深 → 中央高光（高光带在 50% 居中）*/
function buildFlowStops(c1: string, c2: string): string[] {
  const mid = blendHex(c1, c2, 0.5);
  return [
    adjustLightness(c1, -0.35),       // 0%   顶端（最深）
    blendHex(adjustLightness(c1, -0.2), c2, 0.4), // 30%  上半过渡
    adjustLightness(mid, 0.4),        // 50%  中央高光（最亮）
    blendHex(adjustLightness(c1, -0.2), c2, 0.4), // 70%  下半过渡
    adjustLightness(c1, -0.35),       // 100% 底端（最深，与顶端同色保证 ping-pong 无缝）
  ];
}

interface FlowingLightBandProps {
  color1: string;
  color2: string;
  backgroundColor?: string;
  strokeWidth?: number;
  dur?: number;
}

export function FlowingLightBand({
  color1,
  color2,
  backgroundColor,
  strokeWidth = 1,
  dur = 3,
}: FlowingLightBandProps) {
  const [ref, { width: w, height: h }] = useElementSize();
  const uid = useId().replace(/:/g, "");
  const gradId = `flow-grad-${uid}`;

  const stops = useMemo(() => buildFlowStops(color1, color2), [color1, color2]);
  const fillRef = `url(#${gradId})`;
  const sw = Math.max(0.5, strokeWidth);

  return (
    <div
      ref={ref}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        backgroundColor: backgroundColor || "transparent",
      }}
    >
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${VBW_FLOW} ${VBH_FLOW}`}
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      >
        <defs>
          <linearGradient
            id={gradId}
            gradientUnits="userSpaceOnUse"
            x1={0}
            y1={0}
            x2={0}
            y2={VBH_FLOW}
            spreadMethod="reflect"
          >
            <stop offset="0%" stopColor={stops[0]} />
            <stop offset="30%" stopColor={stops[1]} />
            <stop offset="50%" stopColor={stops[2]} />
            <stop offset="70%" stopColor={stops[3]} />
            <stop offset="100%" stopColor={stops[4]} />
            {/* 上下水流动：中央高光带在垂直方向做 ping-pong 振荡
                - t=0:   高光在中部
                - t=0.5: 高光移到顶端（reflect 使底端也出现镜像高光）
                - t=1:   高光回到中部（无缝循环） */}
            <animateTransform
              attributeName="gradientTransform"
              type="translate"
              values={`0 0; 0 ${-VBH_FLOW / 2}; 0 0`}
              keyTimes="0; 0.5; 1"
              dur={`${dur * 2}s`}
              calcMode="spline"
              keySplines="0.42 0 0.58 1; 0.42 0 0.58 1"
              repeatCount="indefinite"
            />
          </linearGradient>
        </defs>
        {/* 18 条主路径 (transform=translate(258.65, 24.46)) */}
        <g transform="translate(258.65, 24.46)">
          {FLOW_PATHS_A.map((d, i) => (
            <path
              key={`flow-a-${i}`}
              d={d}
              fill={fillRef}
              stroke={fillRef}
              strokeWidth={sw * 0.2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
        {/* 18 条副路径 (transform=translate(0, 24.28), opacity=0.5) */}
        <g opacity="0.5" transform="translate(0, 24.28)">
          {FLOW_PATHS_B.map((d, i) => (
            <path
              key={`flow-b-${i}`}
              d={d}
              fill={fillRef}
              stroke={fillRef}
              strokeWidth={sw * 0.2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
        {/* 2 条大弧形装饰（左下 / 右上） */}
        <path d={FLOW_PATH_BIG_LEFT} fill={fillRef} />
        <path d={FLOW_PATH_BIG_RIGHT} fill={fillRef} />
      </svg>
    </div>
  );
}

/* ===================== 雕花边框 CarvedFrameDeco10 ===================== */
/* 依据 vectorstock_81332.svg 重写的矩形雕花边框装饰：
   - viewBox 0 0 455 681（竖长矩形）
   - 4 个角花（顶部 2 + 底部 2）+ 左/右长边各 3 个边花，共 10 条贝塞尔 path
   - 单色填充（color1），与参考 SVG 一致（参考 SVG 无描边）
   - 用 useElementSize + ResizeObserver 实时响应外层容器尺寸变化
   - preserveAspectRatio="none" 允许边框被任意拉伸填满容器 */
import { CARVED_FRAME_PATH } from "./decorPaths/carvedFrame";

interface CarvedFrameDeco10Props {
  color1: string;
  color2?: string;
  backgroundColor?: string;
}

export function CarvedFrameDeco10({
  color1,
  color2: _color2,
  backgroundColor,
}: CarvedFrameDeco10Props) {
  const [ref, { width: w, height: h }] = useElementSize();

  return (
    <div
      ref={ref}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        backgroundColor: backgroundColor || "transparent",
      }}
    >
      <svg
        width={w}
        height={h}
        viewBox="0 0 455 681"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      >
        {/* 参考 SVG 全局 translate(0.71, 0.62) + 单色填充 fillRule="evenodd"，无描边 */}
        <g transform="translate(0.71, 0.62)" fill={color1} fillRule="evenodd">
          {CARVED_FRAME_PATH.map((g, gi) => (
            <g key={`f-${gi}`} transform={g.transform}>
              {g.d.map((d, di) => (
                <path key={`f-${gi}-${di}`} d={d} />
              ))}
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

/* ===================== deco-12 雷达装饰 ===================== */

const RADAR_VB = 200; // viewBox 200x200
const RADAR_CENTER = RADAR_VB / 2; // 100
const RADAR_RING_NUM = 3;
const RADAR_RING_WIDTH = 1;
const RADAR_SEGMENT = 30;
const RADAR_SECTOR_ANGLE = Math.PI / 3; // 60°
const RADAR_SPLIT_LINE_NUM = 6;

interface RadarDeco12Props {
  color1: string;
  color2: string;
  backgroundColor?: string;
  strokeWidth?: number;
  scanDur?: number;
  haloDur?: number;
}

export function RadarDeco12({
  color1,
  color2,
  backgroundColor,
  strokeWidth = 1,
  scanDur = 3,
  haloDur = 2,
}: RadarDeco12Props) {
  const [ref, { width: w, height: h }] = useElementSize();
  const gradientId = useId();
  const sw = strokeWidth;

  // 3 同心圆环
  const radiusGap = (RADAR_CENTER - RADAR_RING_WIDTH / 2) / RADAR_RING_NUM;

  // 扇形扫描路径 — 从 -90° 开始，60° 扇形，分 30 段渐变
  const sectorAngleGap = RADAR_SECTOR_ANGLE / RADAR_SEGMENT;
  const sectorR = RADAR_CENTER / 2; // 扫描扇形半径

  // 分割线（6 条直径线）
  const splitAngleGap = Math.PI / RADAR_SPLIT_LINE_NUM;

  // 4 段外弧
  const arcAngleGap = Math.PI / 6;
  const arcR = RADAR_CENTER - 1;

  // 扫描路径色渐变（从 color1 不透明到透明）
  const pathColors = useMemo(() => {
    const colorGap = 100 / (RADAR_SEGMENT - 1);
    return new Array(RADAR_SEGMENT).fill(0).map((_, i) => withAlpha(color1, 1 - i * colorGap / 100));
  }, [color1]);

  return (
    <div
      ref={ref}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        backgroundColor: backgroundColor || "transparent",
      }}
    >
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${RADAR_VB} ${RADAR_VB}`}
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      >
        <defs>
          <radialGradient id={gradientId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="transparent" stopOpacity="1" />
            <stop offset="100%" stopColor={withAlpha(color2, 0.3)} stopOpacity="1" />
          </radialGradient>
        </defs>

        {/* 3 同心圆环 */}
        {new Array(RADAR_RING_NUM).fill(0).map((_, i) => {
          const r = Math.max(0.1, radiusGap * (i + 1) * sw);
          return (
            <circle
              key={`ring-${i}`}
              r={r}
              cx={RADAR_CENTER}
              cy={RADAR_CENTER}
              stroke={color2}
              strokeWidth={0.5 * sw}
              fill="transparent"
            />
          );
        })}

        {/* 光晕动画 */}
        <circle
          r={1}
          cx={RADAR_CENTER}
          cy={RADAR_CENTER}
          stroke="transparent"
          fill={`url(#${gradientId})`}
        >
          <animate
            attributeName="r"
            values={`1;${RADAR_CENTER}`}
            dur={`${haloDur}s`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="1;0"
            dur={`${haloDur}s`}
            repeatCount="indefinite"
          />
        </circle>

        {/* 中心点 */}
        <circle r={2 * sw} cx={RADAR_CENTER} cy={RADAR_CENTER} fill={color2} />

        {/* 分割线（6 条直径） */}
        <g>
          {new Array(RADAR_SPLIT_LINE_NUM).fill(0).map((_, i) => {
            const startAngle = splitAngleGap * (i + 1);
            const endAngle = startAngle + Math.PI;
            const x1 = RADAR_CENTER + RADAR_CENTER * Math.cos(startAngle);
            const y1 = RADAR_CENTER + RADAR_CENTER * Math.sin(startAngle);
            const x2 = RADAR_CENTER + RADAR_CENTER * Math.cos(endAngle);
            const y2 = RADAR_CENTER + RADAR_CENTER * Math.sin(endAngle);
            return (
              <polyline
                key={`split-${i}`}
                points={`${x1.toFixed(2)},${y1.toFixed(2)} ${x2.toFixed(2)},${y2.toFixed(2)}`}
                stroke={color2}
                strokeWidth={0.5 * sw}
                opacity="0.5"
              />
            );
          })}
        </g>

        {/* 4 段外弧 */}
        {new Array(4).fill(0).map((_, i) => {
          const startAngle = arcAngleGap * (3 * i + 1);
          const endAngle = startAngle + arcAngleGap;
          const sx = RADAR_CENTER + arcR * Math.cos(startAngle);
          const sy = RADAR_CENTER + arcR * Math.sin(startAngle);
          const ex = RADAR_CENTER + arcR * Math.cos(endAngle);
          const ey = RADAR_CENTER + arcR * Math.sin(endAngle);
          return (
            <path
              key={`arc-${i}`}
              d={`M${sx.toFixed(2)},${sy.toFixed(2)} A${RADAR_CENTER},${RADAR_CENTER} 0 0 1 ${ex.toFixed(2)},${ey.toFixed(2)}`}
              stroke={color2}
              strokeWidth={2 * sw}
              fill="transparent"
            />
          );
        })}

        {/* 扫描扇形 */}
        <g>
          {new Array(RADAR_SEGMENT).fill(0).map((_, i) => {
            const startAngle = -Math.PI / 2 - i * sectorAngleGap;
            const endAngle = -Math.PI / 2 - (i + 1) * sectorAngleGap;
            const sx = RADAR_CENTER + sectorR * Math.cos(startAngle);
            const sy = RADAR_CENTER + sectorR * Math.sin(startAngle);
            const ex = RADAR_CENTER + sectorR * Math.cos(endAngle);
            const ey = RADAR_CENTER + sectorR * Math.sin(endAngle);
            return (
              <path
                key={`scan-${i}`}
                d={`M${sx.toFixed(2)},${sy.toFixed(2)} A${sectorR},${sectorR} 0 0 0 ${ex.toFixed(2)},${ey.toFixed(2)}`}
                stroke={pathColors[i]}
                strokeWidth={RADAR_CENTER * sw}
                fill="transparent"
              />
            );
          })}
          <animateTransform
            attributeName="transform"
            type="rotate"
            values={`0 ${RADAR_CENTER} ${RADAR_CENTER};360 ${RADAR_CENTER} ${RADAR_CENTER}`}
            dur={`${scanDur}s`}
            repeatCount="indefinite"
          />
        </g>
      </svg>
    </div>
  );
}
