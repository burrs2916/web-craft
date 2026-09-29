import { useId, useMemo } from "react";
import { useElementSize, withAlpha } from "./shared";

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
