import React, { useRef, useMemo, useId } from "react";
import { useDatavBoxSize } from "./datavRenderSize";
import {
  BL_MAIN_CURL_PATH,
  BL_DECOR_ELEMENTS,
  ORNAMENT_VIEW_W,
  ORNAMENT_VIEW_H,
} from "./ornamentalFramePaths";

const VW = ORNAMENT_VIEW_W;
const VH = ORNAMENT_VIEW_H;
const OUTER_BORDER_D =
  `M${VW},${VH}H0V0h${VW}v${VH}ZM19.82,${VH - 19.82}h${VW - 39.64}V19.82H19.82v${VH - 39.64}Z`;

const L_STRIP_TL = `${1147.83},${62.53} ${68.55},${62.53} ${68.55},${1260.92} ${80.02},${1260.92} ${80.02},${74} ${1147.83},${74}`;
const L_STRIP_TR = `${3652.17},${62.53} ${4731.45},${62.53} ${4731.45},${1260.92} ${4719.98},${1260.92} ${4719.98},${74} ${3652.17},${74}`;
const L_STRIP_BL = `${1147.83},${2794.44} ${68.55},${2794.44} ${68.55},${1596.05} ${80.02},${1596.05} ${80.02},${2782.97} ${1147.83},${2782.97}`;
const L_STRIP_BR = `${3652.17},${2794.44} ${4731.45},${2794.44} ${4731.45},${1596.05} ${4719.98},${1596.05} ${4719.98},${2782.97} ${3652.17},${2782.97}`;

interface OrnamentalFrameProps {
  color1: string;
  color2: string;
  backgroundColor: string;
  reverse?: boolean;
  editorScale?: number;
}

interface CornerProps {
  gradientId: string;
}

const CornerOrnament = React.memo(function CornerOrnament({ gradientId }: CornerProps) {
  return (
    <g fill={`url(#${gradientId})`}>
      <path d={BL_MAIN_CURL_PATH} />
      {BL_DECOR_ELEMENTS.map((el, idx) => {
        if (el.type === "path" && el.d) {
          return <path key={idx} d={el.d} />;
        }
        if (el.type === "ellipse") {
          return (
            <ellipse
              key={idx}
              cx={el.cx}
              cy={el.cy}
              rx={el.rx}
              ry={el.ry}
              transform={el.transform || undefined}
            />
          );
        }
        return null;
      })}
    </g>
  );
});

export function OrnamentalFrame({
  color1,
  color2,
  backgroundColor,
  reverse = false,
  editorScale,
}: OrnamentalFrameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/:/g, "");
  const gradientId = `of-grad-${uid}`;
  const filterId = `of-glow-${uid}`;
  /* 尺寸：编辑区实测，发布端由 Context 注入（同一个变量，同一段几何） */
  const size = useDatavBoxSize<HTMLDivElement>(containerRef);

  const { width: w, height: h } = size;

  const strokes = useMemo(() => {
    const scale = editorScale && editorScale > 0 ? editorScale : 1;
    return {
      glowBlur: 6 / scale,
      outer: 14 / scale,
      inner: 6 / scale,
    };
  }, [editorScale]);

  const wrapperTransform = reverse
    ? `scale(-1,-1) translate(${-VW},${-VH})`
    : undefined;

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      >
        <defs>
          <linearGradient
            id={gradientId}
            x1="0%"
            y1="0%"
            x2="0%"
            y2="100%"
          >
            <stop offset="0%" stopColor={color2} stopOpacity="0.85" />
            <stop offset="40%" stopColor={color1} stopOpacity="1" />
            <stop offset="60%" stopColor={color1} stopOpacity="1" />
            <stop offset="100%" stopColor={color2} stopOpacity="0.85" />
          </linearGradient>
          <filter
            id={filterId}
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation={strokes.glowBlur} result="blurred" />
            <feFlood floodColor={color2} floodOpacity="0.8" result="flood" />
            <feComposite in="flood" in2="blurred" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g transform={wrapperTransform}>
          <rect
            x="0"
            y="0"
            width={VW}
            height={VH}
            fill={backgroundColor === "transparent" ? "none" : backgroundColor}
          />

          <path
            d={OUTER_BORDER_D}
            fill="none"
            stroke={color1}
            strokeWidth={strokes.outer}
            vectorEffect="non-scaling-stroke"
            opacity="0.45"
          />
          <path
            d={OUTER_BORDER_D}
            fill="none"
            stroke={color1}
            strokeWidth={strokes.inner}
            vectorEffect="non-scaling-stroke"
          />

          <polygon points={L_STRIP_TL} fill={`url(#${gradientId})`} filter={`url(#${filterId})`} />
          <polygon points={L_STRIP_TR} fill={`url(#${gradientId})`} filter={`url(#${filterId})`} />
          <polygon points={L_STRIP_BL} fill={`url(#${gradientId})`} filter={`url(#${filterId})`} />
          <polygon points={L_STRIP_BR} fill={`url(#${gradientId})`} filter={`url(#${filterId})`} />

          <CornerOrnament gradientId={gradientId} />
          <g transform={`scale(-1,1) translate(${-VW},0)`}>
            <CornerOrnament gradientId={gradientId} />
          </g>
          <g transform={`scale(1,-1) translate(0,${-VH})`}>
            <CornerOrnament gradientId={gradientId} />
          </g>
          <g transform={`scale(-1,-1) translate(${-VW},${-VH})`}>
            <CornerOrnament gradientId={gradientId} />
          </g>
        </g>
      </svg>
      <div
        style={{ position: "relative", width: "100%", height: "100%" }}
      />
    </div>
  );
}

export default OrnamentalFrame;
