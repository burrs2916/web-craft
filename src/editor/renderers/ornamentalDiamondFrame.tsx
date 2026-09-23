/**
 * 金色卷草花纹边框 — 自定义 SVG 渲染器
 *
 * 实现参考 vectorstock_51337396.svg 的对角线 L 形布局：
 * - 右上角：9 条卷草主花纹 + 装饰圆点 + L 形饰带（顶边+左边）
 * - 左下角：独立 9 条卷草主花纹 + 装饰圆点 + L 形饰带（右边+下边）
 * - 左上角、右下角：留白（参考 SVG 设计）
 *
 * 与 ornamentalFrame（81332.svg 花环）的区别：
 * - 路径数据来自不同 SVG 源
 * - 布局为对角线 L 形而非四角全镜像
 * - 纯色填充 + 内部阴影描边，无外发光
 */

import React, { useRef, useMemo, useId } from "react";
import { useDatavBoxSize } from "./datavRenderSize";
import {
  DIAMOND_VW,
  DIAMOND_VH,
  TR_PATHS,
  TR_DOTS,
  TR_SUBGROUPS,
  BL_PATHS,
  BL_DOTS,
  BL_SUBGROUPS,
  TOP_STRIP_OUTER,
  TOP_STRIP_INNER,
  BOTTOM_STRIP_OUTER,
  BOTTOM_STRIP_INNER,
} from "./ornamentalDiamondPaths";

const VW = DIAMOND_VW;
const VH = DIAMOND_VH;

interface DotData {
  type: "circle" | "ellipse";
  cx: number;
  cy: number;
  r?: number;
  rx?: number;
  ry?: number;
  transform?: string;
}

const DiamondDot = React.memo(function DiamondDot({
  dot,
  fill,
}: {
  dot: DotData;
  fill: string;
}) {
  if (dot.type === "circle") {
    return <circle cx={dot.cx} cy={dot.cy} r={dot.r} fill={fill} transform={dot.transform} />;
  }
  return <ellipse cx={dot.cx} cy={dot.cy} rx={dot.rx} ry={dot.ry} fill={fill} transform={dot.transform} />;
});

interface CornerScrollworkProps {
  paths: string[];
  dots: DotData[];
  subgroups: Array<{
    paths: string[];
    dots: DotData[];
  }>;
  fill: string;
}

/** 卷草花纹组件 — 路径数据已是绝对坐标，无需 translate */
const CornerScrollwork = React.memo(function CornerScrollwork({
  paths: mainPaths,
  dots,
  subgroups,
  fill,
}: CornerScrollworkProps) {
  return (
    <g fill={fill}>
      {mainPaths.map((d, idx) => (
        <path key={`p-${idx}`} d={d} />
      ))}
      {subgroups.map((sub, sIdx) => (
        <g key={`sub-${sIdx}`}>
          {sub.paths.map((d, pIdx) => (
            <path key={`sp-${sIdx}-${pIdx}`} d={d} />
          ))}
          {sub.dots.map((dot, dIdx) => (
            <DiamondDot key={`sd-${sIdx}-${dIdx}`} dot={dot} fill={fill} />
          ))}
        </g>
      ))}
      {dots.map((dot, idx) => (
        <DiamondDot key={`d-${idx}`} dot={dot} fill={fill} />
      ))}
    </g>
  );
});

interface DiamondScrollFrameProps {
  color1: string;
  color2: string;
  backgroundColor: string;
  reverse?: boolean;
  editorScale?: number;
}

/**
 * 金色卷草花纹边框主组件
 *
 * 布局：
 * ┌──────────┐
 * │╲         │  ← 顶部 L 形饰带 + 右上角卷草
 * │ ╲        │
 * │  ╲       │
 * │   ╲      │
 * │    ╲     │
 * │     ╲    │
 * │      ╲   │
 * │       ╲  │
 * │        ╲ │
 * │         ╲│
 * │          │  ← 底部 L 形饰带
 * └──────────┘
 */
export function DiamondScrollFrame({
  color1,
  color2,
  backgroundColor,
  reverse = false,
  editorScale,
}: DiamondScrollFrameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/:/g, "");
  const filterId = `dsf-shadow-${uid}`;
  /* 尺寸：编辑区实测，发布端由 Context 注入（同一个变量，同一段几何） */
  const size = useDatavBoxSize<HTMLDivElement>(containerRef);

  // 描边宽度计算
  const strokes = useMemo(() => {
    const scale = editorScale && editorScale > 0 ? editorScale : 1;
    return {
      stripStroke: 1 / scale,
    };
  }, [editorScale]);

  const wrapperTransform = useMemo(() => {
    if (!reverse) return undefined;
    return `scale(-1,-1) translate(${-VW},${-VH})`;
  }, [reverse]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}
    >
      <svg
        width={size.width}
        height={size.height}
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      >
        <defs>
          {/* 内阴影效果 — 模拟金箔雕花的浮雕感 */}
          <filter
            id={filterId}
            x="-5%"
            y="-5%"
            width="110%"
            height="110%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur in="SourceAlpha" stdDeviation="1.5" result="blur" />
            <feOffset in="blur" dx="0.8" dy="0.8" result="offsetBlur" />
            <feFlood floodColor={color2} floodOpacity="0.9" result="color" />
            <feComposite in="color" in2="offsetBlur" operator="in" result="shadow" />
            <feMerge>
              <feMergeNode in="SourceGraphic" />
              <feMergeNode in="shadow" />
            </feMerge>
          </filter>
        </defs>

        <g transform={wrapperTransform}>
          {/* 背景 */}
          <rect
            x="0"
            y="0"
            width={VW}
            height={VH}
            fill={backgroundColor === "transparent" ? "none" : backgroundColor}
          />

          {/* 顶部 L 形饰带（顶边 + 左边，包裹右上卷草） */}
          <g>
            <polygon
              points={TOP_STRIP_OUTER}
              fill={color1}
              stroke={color2}
              strokeWidth={strokes.stripStroke}
              vectorEffect="non-scaling-stroke"
              filter={`url(#${filterId})`}
            />
            <polygon
              points={TOP_STRIP_INNER}
              fill={color1}
              stroke={color2}
              strokeWidth={strokes.stripStroke}
              vectorEffect="non-scaling-stroke"
              filter={`url(#${filterId})`}
            />
          </g>

          {/* 底部 L 形饰带（右边 + 下边，包裹左下卷草） */}
          <g>
            <polygon
              points={BOTTOM_STRIP_OUTER}
              fill={color1}
              stroke={color2}
              strokeWidth={strokes.stripStroke}
              vectorEffect="non-scaling-stroke"
              filter={`url(#${filterId})`}
            />
            <polygon
              points={BOTTOM_STRIP_INNER}
              fill={color1}
              stroke={color2}
              strokeWidth={strokes.stripStroke}
              vectorEffect="non-scaling-stroke"
              filter={`url(#${filterId})`}
            />
          </g>

          {/* 右上角卷草（路径已是绝对坐标，无需 translate） */}
          <CornerScrollwork
            paths={TR_PATHS}
            dots={TR_DOTS}
            subgroups={TR_SUBGROUPS}
            fill={color1}
          />

          {/* 左下角卷草（使用独立路径，非镜像） */}
          <CornerScrollwork
            paths={BL_PATHS}
            dots={BL_DOTS}
            subgroups={BL_SUBGROUPS}
            fill={color1}
          />
        </g>
      </svg>
      <div style={{ position: "relative", width: "100%", height: "100%" }} />
    </div>
  );
}

export default DiamondScrollFrame;
