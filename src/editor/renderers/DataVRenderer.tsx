import React, { useEffect, useRef, useMemo, useCallback, useState, useId } from "react";
import type { ComponentRendererProps } from "../../types/editor";
import {
  getAnimationSx,
  getLineEffectAnimations,
  getLineEffectFilter,
  getLineEffectSx,
  getSvgLineEffectProps,
  injectAnimationKeyframes,
  type AnimationConfig,
  type LineEffectType,
} from "./decorationAnimation";
import {
  OrnamentalFrame as ScalableBorderBox11,
} from "./ornamentalFrame";
import {
  DiamondScrollFrame as ScalableDeco11,
} from "./ornamentalDiamondFrame";
import {
  DATAV_WITH_REVERSE,
  DATAV_WITH_DUR,
  DATAV_WITH_CHILDREN,
  datavDefaultColors,
  datavDefaultDur,
  datavMountedCss,
} from "../../editor/data/datavDecor";
import { DatavRenderSizeContext, type DatavRenderSize } from "./datavRenderSize";
import {
  ScanBorder12,
  PolylineBorder13,
  DotMatrixDeco1,
  ScanLineDeco2,
  FlickerDotsDeco3,
  GradientBorderDeco4,
  PolylineDeco5,
  BarJumpingDeco6,
  DecorationArrow7,
  CurlingBranchBand,
  FlowingLightBand,
  CarvedFrameDeco10,
  RadarDeco12,
} from "./datavScalable";

type DataVComp = React.ComponentType<any>;

const BORDER_MAP: Record<string, DataVComp> = {
  "1": (() => null) as DataVComp, "2": (() => null) as DataVComp,
  "3": (() => null) as DataVComp, "4": (() => null) as DataVComp,
  "5": (() => null) as DataVComp, "6": (() => null) as DataVComp,
  "7": (() => null) as DataVComp, "8": (() => null) as DataVComp,
  "9": (() => null) as DataVComp, "10": (() => null) as DataVComp,
  "12": (() => null) as DataVComp,
  "13": (() => null) as DataVComp,
  "11": (() => null) as DataVComp,
};

const DECO_MAP: Record<string, DataVComp> = {
  "1": (() => null) as DataVComp, "2": (() => null) as DataVComp,
  "3": (() => null) as DataVComp, "4": (() => null) as DataVComp,
  "5": (() => null) as DataVComp, "6": (() => null) as DataVComp,
  "7": (() => null) as DataVComp, "8": (() => null) as DataVComp,
  "9": (() => null) as DataVComp, "11": (() => null) as DataVComp, "12": (() => null) as DataVComp,
};

/**
 * datav 装饰族的元数据（默认配色 / 尺寸 / 开关集合 / 线条规则）**只有一份**，
 * 放在 `editor/data/datavDecor.ts`：面板注册、本渲染器、发布端 codegen 三方共用。
 * 此前这里另抄了一套 BORDER_DEFAULTS / DECO_DEFAULTS / *_WITH_REVERSE —— 已与面板漂移，现删除。
 */
const SVG_NS = "http://www.w3.org/2000/svg";
const DATAV_EFFECT_OVERLAY_ATTR = "data-datav-effect-overlay";
const DATAV_STROKE_SELECTOR = "line[stroke],rect[stroke],circle[stroke],ellipse[stroke],polygon[stroke],polyline[stroke],path[stroke]";
const DATAV_SVG_OVERLAY_EFFECTS: Set<LineEffectType> = new Set([
  "flow", "dashFlow", "draw", "lightWave", "pulseWave", "sparkle", "gradientFlow",
]);

function clearDataVLineEffectOverlays(container: HTMLElement): void {
  container.querySelectorAll(`[${DATAV_EFFECT_OVERLAY_ATTR}="true"]`).forEach((node) => node.remove());
}

function toCssName(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function applyOverlayStyle(el: SVGElement, style?: Record<string, any>): void {
  if (!style) return;
  for (const [key, value] of Object.entries(style)) {
    if (value == null) continue;
    el.style.setProperty(key.startsWith("--") ? key : toCssName(key), String(value));
  }
}

function createDataVLineEffectClone(
  source: SVGElement,
  effectProps: NonNullable<ReturnType<typeof getSvgLineEffectProps>>
): SVGElement | null {
  const tagName = source.tagName.toLowerCase();
  if (!["line", "rect", "circle", "ellipse", "polygon", "polyline", "path"].includes(tagName)) return null;

  const clone = source.cloneNode(false) as SVGElement;
  clone.removeAttribute("id");
  clone.removeAttribute("class");
  clone.removeAttribute("filter");
  clone.setAttribute(DATAV_EFFECT_OVERLAY_ATTR, "true");
  clone.setAttribute("pointer-events", "none");
  clone.setAttribute("stroke", effectProps.stroke || source.getAttribute("stroke") || "#fff");
  clone.setAttribute("stroke-width", String(effectProps.strokeWidth ?? source.getAttribute("stroke-width") ?? 2));
  clone.setAttribute("fill", effectProps.fill || "none");

  if (effectProps.strokeDasharray) clone.setAttribute("stroke-dasharray", effectProps.strokeDasharray);
  if (effectProps.strokeDashoffset != null) clone.setAttribute("stroke-dashoffset", String(effectProps.strokeDashoffset));
  if (effectProps.vectorEffect) clone.setAttribute("vector-effect", effectProps.vectorEffect);
  if (effectProps.strokeLinecap) clone.setAttribute("stroke-linecap", effectProps.strokeLinecap);
  if (effectProps.strokeLinejoin) clone.setAttribute("stroke-linejoin", effectProps.strokeLinejoin);
  if (effectProps.animationName) clone.style.animationName = effectProps.animationName;
  if (effectProps.animationDuration) clone.style.animationDuration = effectProps.animationDuration;
  if (effectProps.animationTimingFunction) clone.style.animationTimingFunction = effectProps.animationTimingFunction;
  if (effectProps.animationIterationCount) clone.style.animationIterationCount = effectProps.animationIterationCount;
  applyOverlayStyle(clone, effectProps.style);

  return clone;
}

function applyDataVLineEffectOverlays(
  container: HTMLElement,
  effectProps: NonNullable<ReturnType<typeof getSvgLineEffectProps>> | null
): void {
  clearDataVLineEffectOverlays(container);
  if (!effectProps) return;

  container.querySelectorAll("svg").forEach((svg) => {
    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute(DATAV_EFFECT_OVERLAY_ATTR, "true");
    group.setAttribute("pointer-events", "none");

    svg.querySelectorAll<SVGElement>(DATAV_STROKE_SELECTOR).forEach((source) => {
      if (source.closest(`[${DATAV_EFFECT_OVERLAY_ATTR}]`)) return;
      const stroke = source.getAttribute("stroke");
      if (!stroke || stroke === "none" || stroke === "transparent") return;
      const clone = createDataVLineEffectClone(source, effectProps);
      if (clone) group.appendChild(clone);
    });

    if (group.childNodes.length > 0) {
      svg.appendChild(group);
    }
  });
}

function buildDataVAnimationStyle(config: Partial<AnimationConfig>): React.CSSProperties {
  const style: React.CSSProperties & Record<string, any> = {};
  const animationSx = getAnimationSx(config);
  if (animationSx && typeof animationSx === "object" && !Array.isArray(animationSx)) {
    Object.assign(style, animationSx);
  }

  const filterStr = getLineEffectFilter(config);
  if (filterStr) {
    style.filter = [style.filter, filterStr].filter(Boolean).join(" ");
  }

  Object.assign(style, getLineEffectSx(config));

  const lineAnimations = getLineEffectAnimations(config);
  if (lineAnimations.length > 0) {
    const current = style.animation || "";
    style.animation = [current, ...lineAnimations].filter(Boolean).join(", ");
  }

  return style;
}

/**
 * 已删除的死代码：`buildFillStrokeCss` / `removeFillStrokeColors` /
 * `applyFillStrokeWithTracking` 三件套的前提是 `FILL_STROKE_COMPONENTS` 非空，
 * 而该集合**自建立起就是空集**（`new Set<string>([])`）→ 所有分支恒不可达，
 * 却带着一个 `MutationObserver` 常驻监听。随本次口径收口一并移除。
 */

interface ScalableBorderBox5Props {
  color1: string;
  color2: string;
  backgroundColor: string;
  reverse: boolean;
}

function ScalableBorderBox5({ color1, color2, backgroundColor, reverse }: ScalableBorderBox5Props) {
  const w = 400;
  const h = 300;

  const svgClassName = reverse ? "dv-border-svg-container dv-reverse" : "dv-border-svg-container";
  const svgStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    ...(reverse ? { transform: "rotate(180deg)" } : {}),
  };

  return (
    <div className="dv-border-box-5" style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg
        className={svgClassName}
        width="100%"
        height="100%"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={svgStyle}
      >
        <polygon
          fill={backgroundColor}
          points={`10, 22 ${w - 22}, 22 ${w - 22}, ${h - 86} ${w - 84}, ${h - 24} 10, ${h - 24}`}
        />
        <polyline
          className="dv-bb5-line-1"
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`8, 5 ${w - 5}, 5 ${w - 5}, ${h - 100} ${w - 100}, ${h - 5} 8, ${h - 5} 8, 5`}
        />
        <polyline
          className="dv-bb5-line-2"
          stroke={color2}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`3, 5 ${w - 20}, 5 ${w - 20}, ${h - 60} ${w - 74}, ${h - 5} 3, ${h - 5} 3, 5`}
        />
        <polyline
          className="dv-bb5-line-3"
          stroke={color2}
          fill="none"
          strokeWidth={5}
          vectorEffect="non-scaling-stroke"
          points={`50, 13 ${w - 35}, 13`}
        />
        <polyline
          className="dv-bb5-line-4"
          stroke={color2}
          fill="none"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          points={`15, 20 ${w - 35}, 20`}
        />
        <polyline
          className="dv-bb5-line-5"
          stroke={color2}
          fill="none"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          points={`15, ${h - 20} ${w - 110}, ${h - 20}`}
        />
        <polyline
          className="dv-bb5-line-6"
          stroke={color2}
          fill="none"
          strokeWidth={5}
          vectorEffect="non-scaling-stroke"
          points={`15, ${h - 13} ${w - 110}, ${h - 13}`}
        />
      </svg>
      <div className="border-box-content" style={{ position: "relative", width: "100%", height: "100%" }} />
    </div>
  );
}

// ── BorderBox 10 自实现：渐变边框 + 四角装饰 ──
interface ScalableBorderBox10Props {
  color1: string;
  color2: string;
  backgroundColor: string;
}

function ScalableBorderBox10({ color1, color2, backgroundColor }: ScalableBorderBox10Props) {
  const w = 400;
  const h = 300;
  const cornerSize = 18;

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", boxSizing: "border-box" }}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0 }}
      >
        <defs>
          <linearGradient id="dv-bb10-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color1} />
            <stop offset="50%" stopColor={color2} />
            <stop offset="100%" stopColor={color1} />
          </linearGradient>
          <linearGradient id="dv-bb10-grad-v" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color1} />
            <stop offset="50%" stopColor={color2} />
            <stop offset="100%" stopColor={color1} />
          </linearGradient>
        </defs>
        {/* 背景 */}
        <rect x="2" y="2" width={w - 4} height={h - 4} fill={backgroundColor} rx="4" />
        {/* 外边框 */}
        <rect x="2" y="2" width={w - 4} height={h - 4} fill="none" stroke="url(#dv-bb10-grad)" strokeWidth="2" rx="4" />
        {/* 内描边 */}
        <rect x="8" y="8" width={w - 16} height={h - 16} fill="none" stroke={color1} strokeWidth="1" opacity="0.5" rx="2" />
        {/* 四角装饰 */}
        <path d={`M 2 ${cornerSize} L 2 2 L ${cornerSize} 2`} fill="none" stroke={color2} strokeWidth="3" strokeLinecap="round" />
        <path d={`M ${w - cornerSize} 2 L ${w - 2} 2 L ${w - 2} ${cornerSize}`} fill="none" stroke={color2} strokeWidth="3" strokeLinecap="round" />
        <path d={`M ${w - 2} ${h - cornerSize} L ${w - 2} ${h - 2} L ${w - cornerSize} ${h - 2}`} fill="none" stroke={color2} strokeWidth="3" strokeLinecap="round" />
        <path d={`M ${cornerSize} ${h - 2} L 2 ${h - 2} L 2 ${h - cornerSize}`} fill="none" stroke={color2} strokeWidth="3" strokeLinecap="round" />
      </svg>
      <div style={{ position: "relative", width: "100%", height: "100%" }} />
    </div>
  );
}

interface ScalableBorderBox6Props {
  color1: string;
  color2: string;
  backgroundColor: string;
}

function ScalableBorderBox6({ color1, color2, backgroundColor }: ScalableBorderBox6Props) {
  const w = 400;
  const h = 300;

  return (
    <div className="dv-border-box-6" style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg
        className="dv-border-svg-container"
        width="100%"
        height="100%"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0 }}
      >
        <polygon
          fill={backgroundColor}
          points={`9, 7 ${w - 9}, 7 ${w - 9}, ${h - 7} 9, ${h - 7}`}
        />
        <circle fill={color2} cx="5" cy="5" r="2" />
        <circle fill={color2} cx={w - 5} cy="5" r="2" />
        <circle fill={color2} cx={w - 5} cy={h - 5} r="2" />
        <circle fill={color2} cx="5" cy={h - 5} r="2" />
        <polyline
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`10, 4 ${w - 10}, 4`}
        />
        <polyline
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`10, ${h - 4} ${w - 10}, ${h - 4}`}
        />
        <polyline
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`5, 70 5, ${h - 70}`}
        />
        <polyline
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`${w - 5}, 70 ${w - 5}, ${h - 70}`}
        />
        <polyline
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points="3, 10 3, 50"
        />
        <polyline
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points="7, 30 7, 80"
        />
        <polyline
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`${w - 3}, 10 ${w - 3}, 50`}
        />
        <polyline
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`${w - 7}, 30 ${w - 7}, 80`}
        />
        <polyline
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`3, ${h - 10} 3, ${h - 50}`}
        />
        <polyline
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`7, ${h - 30} 7, ${h - 80}`}
        />
        <polyline
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`${w - 3}, ${h - 10} ${w - 3}, ${h - 50}`}
        />
        <polyline
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`${w - 7}, ${h - 30} ${w - 7}, ${h - 80}`}
        />
      </svg>
      <div className="border-box-content" style={{ position: "relative", width: "100%", height: "100%" }} />
    </div>
  );
}

interface ScalableBorderBox7Props {
  color1: string;
  color2: string;
  backgroundColor: string;
}

function ScalableBorderBox7({ color1, color2, backgroundColor }: ScalableBorderBox7Props) {
  const w = 400;
  const h = 300;

  return (
    <div
      className="dv-border-box-7"
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        boxShadow: `inset 0 0 40px ${color1}`,
        border: `1px solid ${color1}`,
        backgroundColor,
      }}
    >
      <svg
        className="dv-border-svg-container"
        width="100%"
        height="100%"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <polyline
          className="dv-bb7-line-width-2"
          stroke={color1}
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          points={`0, 25 0, 0 25, 0`}
        />
        <polyline
          className="dv-bb7-line-width-2"
          stroke={color1}
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          points={`${w - 25}, 0 ${w}, 0 ${w}, 25`}
        />
        <polyline
          className="dv-bb7-line-width-2"
          stroke={color1}
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          points={`${w - 25}, ${h} ${w}, ${h} ${w}, ${h - 25}`}
        />
        <polyline
          className="dv-bb7-line-width-2"
          stroke={color1}
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          points={`0, ${h - 25} 0, ${h} 25, ${h}`}
        />
        <polyline
          className="dv-bb7-line-width-5"
          stroke={color2}
          fill="none"
          strokeWidth={5}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          points={`0, 10 0, 0 10, 0`}
        />
        <polyline
          className="dv-bb7-line-width-5"
          stroke={color2}
          fill="none"
          strokeWidth={5}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          points={`${w - 10}, 0 ${w}, 0 ${w}, 10`}
        />
        <polyline
          className="dv-bb7-line-width-5"
          stroke={color2}
          fill="none"
          strokeWidth={5}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          points={`${w - 10}, ${h} ${w}, ${h} ${w}, ${h - 10}`}
        />
        <polyline
          className="dv-bb7-line-width-5"
          stroke={color2}
          fill="none"
          strokeWidth={5}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          points={`0, ${h - 10} 0, ${h} 10, ${h}`}
        />
      </svg>
      <div className="border-box-content" style={{ position: "relative", width: "100%", height: "100%" }} />
    </div>
  );
}

interface ScalableBorderBox8Props {
  color1: string;
  color2: string;
  backgroundColor: string;
  dur: number;
  reverse: boolean;
}

function ScalableBorderBox8({ color1, color2, backgroundColor, dur, reverse }: ScalableBorderBox8Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const motionRefs = useRef<Element[]>([]);
  const dashAnimRefs = useRef<Element[]>([]);
  const sizeRef = useRef({ width: 400, height: 300 });
  const uid = useId().replace(/:/g, "");

  const getPathD = (w: number, h: number) => {
    if (reverse) return `M 2.5, 2.5 L 2.5, ${h - 2.5} L ${w - 2.5}, ${h - 2.5} L ${w - 2.5}, 2.5 L 2.5, 2.5`;
    return `M2.5, 2.5 L${w - 2.5}, 2.5 L${w - 2.5}, ${h - 2.5} L2.5, ${h - 2.5} L2.5, 2.5`;
  };

  useEffect(() => {
    const el = containerRef.current;
    const svg = svgRef.current;
    const path = pathRef.current;
    if (!el || !svg || !path) return;
    const update = () => {
      const w = el.clientWidth || 400;
      const h = el.clientHeight || 300;
      if (sizeRef.current.width === w && sizeRef.current.height === h) return;
      sizeRef.current = { width: w, height: h };
      svg.setAttribute("width", String(w));
      svg.setAttribute("height", String(h));
      const d = getPathD(w, h);
      path.setAttribute("d", d);
      motionRefs.current.forEach((am) => am.setAttribute("path", d));
      const newLen = (w + h - 5) * 2;
      if (dashAnimRefs.current[0]) {
        dashAnimRefs.current[0].setAttribute("from", `0, ${newLen}`);
        dashAnimRefs.current[0].setAttribute("to", `${newLen}, 0`);
      }
      if (dashAnimRefs.current[1]) {
        dashAnimRefs.current[1].setAttribute("from", `${newLen}, 0`);
        dashAnimRefs.current[1].setAttribute("to", `0, ${newLen}`);
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [reverse]);

  const { width, height } = sizeRef.current;
  const pathD = getPathD(width, height);
  const length = (width + height - 5) * 2;

  const glowRadius = 180;
  const trailRadius1 = 120;
  const trailRadius2 = 70;

  const pathId = `bb8-path-${uid}`;
  const gradientId = `bb8-grad-${uid}`;
  const maskId = `bb8-mask-${uid}`;

  const staggerOffset = dur / 3;

  return (
    <div
      className="dv-border-box-8"
      ref={containerRef}
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor,
          zIndex: 0,
          pointerEvents: "none",
        }}
      />
      <svg
        ref={svgRef}
        className="dv-border-svg-container"
        width={width}
        height={height}
        style={{ position: "absolute", top: 0, left: 0, zIndex: 2, pointerEvents: "none" }}
      >
        <defs>
          <path ref={pathRef} id={pathId} d={pathD} fill="transparent" />
          <radialGradient id={gradientId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="30%" stopColor="#fff" stopOpacity="0.8" />
            <stop offset="60%" stopColor="#fff" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <mask id={maskId}>
            <circle cx="0" cy="0" r={glowRadius} fill={`url(#${gradientId})`}>
              <animateMotion
                ref={(el) => { if (el) motionRefs.current[0] = el; }}
                dur={`${dur}s`}
                path={pathD}
                rotate="auto"
                repeatCount="indefinite"
              />
            </circle>
            <circle cx="0" cy="0" r={trailRadius1} fill={`url(#${gradientId})`} opacity="0.6">
              <animateMotion
                ref={(el) => { if (el) motionRefs.current[1] = el; }}
                dur={`${dur}s`}
                begin={`${staggerOffset}s`}
                path={pathD}
                rotate="auto"
                repeatCount="indefinite"
              />
            </circle>
            <circle cx="0" cy="0" r={trailRadius2} fill={`url(#${gradientId})`} opacity="0.35">
              <animateMotion
                ref={(el) => { if (el) motionRefs.current[2] = el; }}
                dur={`${dur}s`}
                begin={`${staggerOffset * 2}s`}
                path={pathD}
                rotate="auto"
                repeatCount="indefinite"
              />
            </circle>
          </mask>
        </defs>

        <use
          stroke={color1}
          strokeWidth="1"
          href={`#${pathId}`}
          xlinkHref={`#${pathId}`}
        />

        <use
          stroke={color2}
          strokeWidth="3"
          href={`#${pathId}`}
          xlinkHref={`#${pathId}`}
          mask={`url(#${maskId})`}
        >
          <animate
            ref={(el) => { if (el) dashAnimRefs.current[0] = el; }}
            attributeName="stroke-dasharray"
            from={`0, ${length}`}
            to={`${length}, 0`}
            dur={`${dur}s`}
            repeatCount="indefinite"
          />
        </use>

        <use
          stroke={color2}
          strokeWidth="1.5"
          strokeOpacity="0.6"
          href={`#${pathId}`}
          xlinkHref={`#${pathId}`}
          mask={`url(#${maskId})`}
        >
          <animate
            ref={(el) => { if (el) dashAnimRefs.current[1] = el; }}
            attributeName="stroke-dasharray"
            from={`${length}, 0`}
            to={`0, ${length}`}
            dur={`${dur}s`}
            repeatCount="indefinite"
          />
        </use>
      </svg>
      <div
        className="border-box-content"
        style={{ position: "relative", width: "100%", height: "100%", zIndex: 1 }}
      />
    </div>
  );
}

interface ScalableBorderBox9Props {
  color1: string;
  color2: string;
  backgroundColor: string;
}

function ScalableBorderBox9({ color1, color2, backgroundColor }: ScalableBorderBox9Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 400, height: 300 });
  const uid = useId().replace(/:/g, "");

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth || 400;
      const h = el.clientHeight || 300;
      setSize({ width: w, height: h });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { width, height } = size;

  const gradientId = `bb9-grad-${uid}`;
  const maskId = `bb9-mask-${uid}`;

  return (
    <div className="dv-border-box-9" ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg className="dv-border-svg-container" width={width} height={height} style={{ position: "absolute", top: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <animate attributeName="x1" values="0%;100%;0%" dur="10s" begin="0s" repeatCount="indefinite" />
            <animate attributeName="x2" values="100%;0%;100%" dur="10s" begin="0s" repeatCount="indefinite" />
            <stop offset="0%" stopColor={color1}>
              <animate attributeName="stop-color" values={`${color1};${color2};${color1}`} dur="10s" begin="0s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stopColor={color2}>
              <animate attributeName="stop-color" values={`${color2};${color1};${color2}`} dur="10s" begin="0s" repeatCount="indefinite" />
            </stop>
          </linearGradient>

          <mask id={maskId}>
            <polyline stroke="#fff" strokeWidth="3" fill="transparent" points={`8, ${height * 0.4} 8, 3, ${width * 0.4 + 7}, 3`} />
            <polyline fill="#fff" points={`8, ${height * 0.15} 8, 3, ${width * 0.1 + 7}, 3 ${width * 0.1}, 8 14, 8 14, ${height * 0.15 - 7}`} />

            <polyline stroke="#fff" strokeWidth="3" fill="transparent" points={`${width * 0.5}, 3 ${width - 3}, 3, ${width - 3}, ${height * 0.25}`} />
            <polyline fill="#fff" points={`${width * 0.52}, 3 ${width * 0.58}, 3 ${width * 0.58 - 7}, 9 ${width * 0.52 + 7}, 9`} />
            <polyline fill="#fff" points={`${width * 0.9}, 3 ${width - 3}, 3 ${width - 3}, ${height * 0.1} ${width - 9}, ${height * 0.1 - 7} ${width - 9}, 9 ${width * 0.9 + 7}, 9`} />

            <polyline stroke="#fff" strokeWidth="3" fill="transparent" points={`8, ${height * 0.5} 8, ${height - 3} ${width * 0.3 + 7}, ${height - 3}`} />
            <polyline fill="#fff" points={`8, ${height * 0.55} 8, ${height * 0.7} 2, ${height * 0.7 - 7} 2, ${height * 0.55 + 7}`} />

            <polyline stroke="#fff" strokeWidth="3" fill="transparent" points={`${width * 0.35}, ${height - 3} ${width - 3}, ${height - 3} ${width - 3}, ${height * 0.35}`} />
            <polyline fill="#fff" points={`${width * 0.92}, ${height - 3} ${width - 3}, ${height - 3} ${width - 3}, ${height * 0.8} ${width - 9}, ${height * 0.8 + 7} ${width - 9}, ${height - 9} ${width * 0.92 + 7}, ${height - 9}`} />
          </mask>
        </defs>

        <polygon
          fill={backgroundColor}
          points={`15, 9 ${width * 0.1 + 1}, 9 ${width * 0.1 + 4}, 6 ${width * 0.52 + 2}, 6 ${width * 0.52 + 6}, 10 ${width * 0.58 - 7}, 10 ${width * 0.58 - 2}, 6 ${width * 0.9 + 2}, 6 ${width * 0.9 + 6}, 10 ${width - 10}, 10 ${width - 10}, ${height * 0.1 - 6} ${width - 6}, ${height * 0.1 - 1} ${width - 6}, ${height * 0.8 + 1} ${width - 10}, ${height * 0.8 + 6} ${width - 10}, ${height - 10} ${width * 0.92 + 7}, ${height - 10} ${width * 0.92 + 2}, ${height - 6} 11, ${height - 6} 11, ${height * 0.15 - 2} 15, ${height * 0.15 - 7}`}
        />

        <rect
          x="0"
          y="0"
          width={width}
          height={height}
          fill={color1}
          opacity="0.25"
          mask={`url(#${maskId})`}
        />

        <rect
          x="0"
          y="0"
          width={width}
          height={height}
          fill={`url(#${gradientId})`}
          mask={`url(#${maskId})`}
        />
      </svg>
      <div className="border-box-content" style={{ position: "relative", width: "100%", height: "100%" }} />
    </div>
  );
}

interface ScalableBorderBox4Props {
  color1: string;
  color2: string;
  backgroundColor: string;
  reverse: boolean;
}

function ScalableBorderBox4({ color1, color2, backgroundColor, reverse }: ScalableBorderBox4Props) {
  const w = 400;
  const h = 300;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(400);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerW(el.clientWidth || 400);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = containerW / w;
  const dash9 = `${100 * scale} ${250 * scale}`;
  const dash10 = `${80 * scale} ${270 * scale}`;

  const svgClassName = reverse ? "dv-border-svg-container dv-reverse" : "dv-border-svg-container";
  const svgStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    ...(reverse ? { transform: "rotate(180deg)" } : {}),
  };

  return (
    <div ref={containerRef} className="dv-border-box-4" style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg
        className={svgClassName}
        width="100%"
        height="100%"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={svgStyle}
      >
        <polygon
          fill={backgroundColor}
          points={`${w - 15}, 22 170, 22 150, 7 40, 7 28, 21 32, 24 16, 42 16, ${h - 32} 41, ${h - 7} ${w - 15}, ${h - 7}`}
        />
        <polyline
          className="dv-bb4-line-1"
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`145, ${h - 5} 40, ${h - 5} 10, ${h - 35} 10, 40 40, 5 150, 5 170, 20 ${w - 15}, 20`}
        />
        <polyline
          className="dv-bb4-line-2"
          stroke={color2}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`245, ${h - 1} 36, ${h - 1} 14, ${h - 23} 14, ${h - 100}`}
        />
        <polyline
          className="dv-bb4-line-3"
          stroke={color1}
          fill="none"
          strokeWidth={3}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          points={`7, ${h - 40} 7, ${h - 75}`}
        />
        <polyline
          className="dv-bb4-line-4"
          stroke={color1}
          fill="none"
          strokeWidth={3}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          points="28, 24 13, 41 13, 64"
        />
        <polyline
          className="dv-bb4-line-5"
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points="5, 45 5, 140"
        />
        <polyline
          className="dv-bb4-line-6"
          stroke={color2}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points="14, 75 14, 180"
        />
        <polyline
          className="dv-bb4-line-7"
          stroke={color2}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points="55, 11 147, 11 167, 26 250, 26"
        />
        <polyline
          className="dv-bb4-line-8"
          stroke={color2}
          fill="none"
          strokeWidth={3}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          points="158, 5 173, 16"
        />
        <polyline
          className="dv-bb4-line-9"
          stroke={color1}
          fill="none"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={dash9}
          vectorEffect="non-scaling-stroke"
          points={`200, 17 ${w - 10}, 17`}
        />
        <polyline
          className="dv-bb4-line-10"
          stroke={color2}
          fill="none"
          strokeWidth={1}
          strokeDasharray={dash10}
          vectorEffect="non-scaling-stroke"
          points={`385, 17 ${w - 10}, 17`}
        />
      </svg>
      <div className="border-box-content" style={{ position: "relative", width: "100%", height: "100%" }} />
    </div>
  );
}

interface ScalableBorderBox3Props {
  color1: string;
  color2: string;
  backgroundColor: string;
}

function ScalableBorderBox3({ color1, color2, backgroundColor }: ScalableBorderBox3Props) {
  const w = 400;
  const h = 300;

  return (
    <div className="dv-border-box-3" style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg
        className="dv-border-svg-container"
        width="100%"
        height="100%"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0 }}
      >
        <polygon
          fill={backgroundColor}
          points={`23, 23 ${w - 24}, 23 ${w - 24}, ${h - 24} 23, ${h - 24}`}
        />
        <polyline
          className="dv-bb3-line1"
          stroke={color1}
          fill="none"
          strokeWidth={3}
          vectorEffect="non-scaling-stroke"
          points={`4, 4 ${w - 22}, 4 ${w - 22}, ${h - 22} 4, ${h - 22} 4, 4`}
        />
        <polyline
          className="dv-bb3-line2"
          stroke={color2}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`10, 10 ${w - 16}, 10 ${w - 16}, ${h - 16} 10, ${h - 16} 10, 10`}
        />
        <polyline
          className="dv-bb3-line2"
          stroke={color2}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`16, 16 ${w - 10}, 16 ${w - 10}, ${h - 10} 16, ${h - 10} 16, 16`}
        />
        <polyline
          className="dv-bb3-line2"
          stroke={color2}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`22, 22 ${w - 4}, 22 ${w - 4}, ${h - 4} 22, ${h - 4} 22, 22`}
        />
      </svg>
      <div className="border-box-content" style={{ position: "relative", width: "100%", height: "100%" }} />
    </div>
  );
}

interface ScalableBorderBox2Props {
  color1: string;
  color2: string;
  backgroundColor: string;
}

function ScalableBorderBox2({ color1, color2, backgroundColor }: ScalableBorderBox2Props) {
  const w = 400;
  const h = 300;

  return (
    <div className="dv-border-box-2" style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg
        className="dv-border-svg-container"
        width="100%"
        height="100%"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0 }}
      >
        <polygon
          fill={backgroundColor}
          points={`7, 7 ${w - 7}, 7 ${w - 7}, ${h - 7} 7, ${h - 7}`}
        />
        <polyline
          stroke={color1}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`2, 2 ${w - 2}, 2 ${w - 2}, ${h - 2} 2, ${h - 2} 2, 2`}
        />
        <polyline
          stroke={color2}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          points={`6, 6 ${w - 6}, 6 ${w - 6}, ${h - 6} 6, ${h - 6} 6, 6`}
        />
        <circle fill={color1} cx={11} cy={11} r={1} vectorEffect="non-scaling-stroke" />
        <circle fill={color1} cx={w - 11} cy={11} r={1} vectorEffect="non-scaling-stroke" />
        <circle fill={color1} cx={w - 11} cy={h - 11} r={1} vectorEffect="non-scaling-stroke" />
        <circle fill={color1} cx={11} cy={h - 11} r={1} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="border-box-content" style={{ position: "relative", width: "100%", height: "100%" }} />
    </div>
  );
}

interface ScalableBorderBox1Props {
  color1: string;
  color2: string;
  backgroundColor: string;
}

function ScalableBorderBox1({ color1, color2, backgroundColor }: ScalableBorderBox1Props) {
  const w = 400;
  const h = 300;
  const cw = 150;
  const ch = 150;
  const sx = cw / 150;
  const sy = ch / 150;

  const mainPoints = `
    10, 27 10, ${h - 27} 13, ${h - 24} 13, ${h - 21} 24, ${h - 11}
    38, ${h - 11} 41, ${h - 8} 73, ${h - 8} 75, ${h - 10} 81, ${h - 10}
    85, ${h - 6} ${w - 85}, ${h - 6} ${w - 81}, ${h - 10} ${w - 75}, ${h - 10}
    ${w - 73}, ${h - 8} ${w - 41}, ${h - 8} ${w - 38}, ${h - 11}
    ${w - 24}, ${h - 11} ${w - 13}, ${h - 21} ${w - 13}, ${h - 24}
    ${w - 10}, ${h - 27} ${w - 10}, 27 ${w - 13}, 25 ${w - 13}, 21
    ${w - 24}, 11 ${w - 38}, 11 ${w - 41}, 8 ${w - 73}, 8 ${w - 75}, 10
    ${w - 81}, 10 ${w - 85}, 6 85, 6 81, 10 75, 10 73, 8 41, 8 38, 11 24, 11 13, 21 13, 24
  `;

  const cornerPoly1 = "6,66 6,18 12,12 18,12 24,6 27,6 30,9 36,9 39,6 84,6 81,9 75,9 73.2,7 40.8,7 37.8,10.2 24,10.2 12,21 12,24 9,27 9,51 7.8,54 7.8,63";
  const cornerPoly2 = "27.599999999999998,4.8 38.4,4.8 35.4,7.8 30.599999999999998,7.8";
  const cornerPoly3 = "9,54 9,63 7.199999999999999,66 7.199999999999999,75 7.8,78 7.8,110 8.4,110 8.4,66 9.6,66 9.6,54";

  return (
    <div className="dv-border-box-1" style={{ width: "100%", height: "100%", position: "relative" }}>
      <style>
        {`@keyframes dv1-fill-a{0%,100%{fill:var(--dv1-c0)}50%{fill:var(--dv1-c1)}}@keyframes dv1-fill-b{0%,100%{fill:var(--dv1-c1)}50%{fill:var(--dv1-c0)}}@keyframes dv1-fill-c{0%,100%{fill:var(--dv1-c0)}33%{fill:var(--dv1-c1)}66%{fill:transparent}}`}
      </style>
      <svg
        className="dv-border-svg-container"
        width="100%"
        height="100%"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
      >
        <polygon fill={backgroundColor} points={mainPoints} />

        <g style={{ "--dv1-c0": color1, "--dv1-c1": color2 } as React.CSSProperties}>
          <g transform={`translate(0,0) scale(${sx},${sy})`}>
            <polygon fill={color1} points={cornerPoly1} style={{ animation: "dv1-fill-a 0.5s infinite" }} />
            <polygon fill={color2} points={cornerPoly2} style={{ animation: "dv1-fill-b 0.5s infinite" }} />
            <polygon fill={color1} points={cornerPoly3} style={{ animation: "dv1-fill-c 1s infinite" }} />
          </g>

          <g transform={`translate(${w},0) scale(-${sx},${sy})`}>
            <polygon fill={color1} points={cornerPoly1} style={{ animation: "dv1-fill-a 0.5s infinite" }} />
            <polygon fill={color2} points={cornerPoly2} style={{ animation: "dv1-fill-b 0.5s infinite" }} />
            <polygon fill={color1} points={cornerPoly3} style={{ animation: "dv1-fill-c 1s infinite" }} />
          </g>

          <g transform={`translate(0,${h}) scale(${sx},-${sy})`}>
            <polygon fill={color1} points={cornerPoly1} style={{ animation: "dv1-fill-a 0.5s infinite" }} />
            <polygon fill={color2} points={cornerPoly2} style={{ animation: "dv1-fill-b 0.5s infinite" }} />
            <polygon fill={color1} points={cornerPoly3} style={{ animation: "dv1-fill-c 1s infinite" }} />
          </g>

          <g transform={`translate(${w},${h}) scale(-${sx},-${sy})`}>
            <polygon fill={color1} points={cornerPoly1} style={{ animation: "dv1-fill-a 0.5s infinite" }} />
            <polygon fill={color2} points={cornerPoly2} style={{ animation: "dv1-fill-b 0.5s infinite" }} />
            <polygon fill={color1} points={cornerPoly3} style={{ animation: "dv1-fill-c 1s infinite" }} />
          </g>
        </g>
      </svg>
      <div className="border-box-content" style={{ position: "relative", width: "100%", height: "100%" }} />
    </div>
  );
}

let uidCounter = 0;

function DataVRendererInner({ config, sizeOverride, uidOverride }: ComponentRendererProps & {
  /** 发布端静态渲染：容器尺寸由组件 transform 给出，不再依赖 ResizeObserver */
  sizeOverride?: DatavRenderSize | null;
  /** 发布端静态渲染：容器 id 必须可确定（编辑区用自增计数器即可） */
  uidOverride?: string;
}) {
  const kind = (config.datavKind as string) || "border";
  const idx = String((config.datavIndex as number) ?? 1);

  const isBorder = kind === "border";
  const datavKind = isBorder ? "border" : "decoration";
  const typeKey = `datav-${datavKind}-${idx}`;
  const compMap = isBorder ? BORDER_MAP : DECO_MAP;
  const Component = compMap[idx];
  const uidRef = useRef(uidOverride || `datv-${++uidCounter}`);
  const uid = uidRef.current;
  const containerRef = useRef<HTMLDivElement>(null);
  const datavRef = useRef<any>(null);
  const overlayRafRef = useRef<number | null>(null);
  const overlayApplyingRef = useRef(false);

  useEffect(() => {
    injectAnimationKeyframes();
  }, []);

  const defaultColors = datavDefaultColors(datavKind, idx);
  const color1 = (config.color1 as string) || defaultColors[0];
  const color2 = (config.color2 as string) || defaultColors[1];
  const backgroundColor = (config.backgroundColor as string) || "transparent";
  const opacity = (config.opacity as number) ?? 1;
  const padding = (config.padding as number) ?? 0;
  const reverse = (config.reverse as boolean) ?? false;
  const dur = (config.dur as number) ?? datavDefaultDur(datavKind, idx);
  const scanDur = (config.scanDur as number) ?? 3;
  const haloDur = (config.haloDur as number) ?? 2;
  const borderRadius = (config.borderRadius as number) ?? 0;
  const strokeWidth = (config.strokeWidth as number) ?? 1;
  const multiplier = strokeWidth;
  const animConfig: Partial<AnimationConfig> = {
    animation: config.animation as any,
    animationDuration: config.animationDuration as number,
    lineEffect: config.lineEffect as any,
    lineEffectColor: config.lineEffectColor as string,
    lineEffectIntensity: config.lineEffectIntensity as number,
    lineEffectSpeed: config.lineEffectSpeed as number,
    lineEffectWidth: config.lineEffectWidth as number,
  };
  const lineEffect = (animConfig.lineEffect as LineEffectType) || "none";
  const containerEffectsStyle = useMemo(() => buildDataVAnimationStyle(animConfig), [
    animConfig.animation,
    animConfig.animationDuration,
    animConfig.lineEffect,
    animConfig.lineEffectColor,
    animConfig.lineEffectIntensity,
    animConfig.lineEffectSpeed,
    animConfig.lineEffectWidth,
  ]);
  const svgEffectProps = useMemo(() => getSvgLineEffectProps(animConfig), [
    animConfig.lineEffect,
    animConfig.lineEffectColor,
    animConfig.lineEffectIntensity,
    animConfig.lineEffectSpeed,
    animConfig.lineEffectWidth,
  ]);
  const isBorder1 = isBorder && idx === "1";
  const isBorder2 = isBorder && idx === "2";
  const isBorder3 = isBorder && idx === "3";
  const isBorder4 = isBorder && idx === "4";
  const isBorder5 = isBorder && idx === "5";
  const isBorder6 = isBorder && idx === "6";
  const isBorder7 = isBorder && idx === "7";
  const isBorder8 = isBorder && idx === "8";
  const isBorder9 = isBorder && idx === "9";
  const isBorder10 = isBorder && idx === "10";
  const isBorder11 = isBorder && idx === "11";
  const usesScalableBorder1 = isBorder1;
  const usesScalableBorder2 = isBorder2;
  const usesScalableBorder3 = isBorder3;
  const usesScalableBorder4 = isBorder4;
  const usesScalableBorder5 = isBorder5;
  const usesScalableBorder6 = isBorder6;
  const usesScalableBorder7 = isBorder7;
  const usesScalableBorder8 = isBorder8;
  const usesScalableBorder9 = isBorder9;
  const usesScalableBorder10 = isBorder10;
  const usesScalableBorder11 = isBorder11;
  const usesScalableBorder12 = isBorder && idx === "12";
  const usesScalableBorder13 = isBorder && idx === "13";
  const isDeco1 = !isBorder && idx === "1";
  const isDeco2 = !isBorder && idx === "2";
  const isDeco3 = !isBorder && idx === "3";
  const isDeco4 = !isBorder && idx === "4";
  const isDeco5 = !isBorder && idx === "5";
  const isDeco6 = !isBorder && idx === "6";
  const isDeco7 = !isBorder && idx === "7";
  const isBand8 = !isBorder && idx === "8";
  const isFlow9 = !isBorder && idx === "9";
  const isDeco10 = !isBorder && idx === "10";
  const isDeco11 = !isBorder && idx === "11";
  const isDeco12 = !isBorder && idx === "12";
  const usesScalableBand8 = isBand8;
  const usesScalableFlow9 = isFlow9;
  const usesScalableDeco1 = isDeco1;
  const usesScalableDeco2 = isDeco2;
  const usesScalableDeco3 = isDeco3;
  const usesScalableDeco4 = isDeco4;
  const usesScalableDeco5 = isDeco5;
  const usesScalableDeco6 = isDeco6;
  const usesScalableDeco7 = isDeco7;
  const usesScalableDeco10 = isDeco10;
  const usesScalableDeco11 = isDeco11;
  const usesScalableDeco12 = isDeco12;
  const shouldUseSvgLineEffect = !isBorder1 && !isBorder2 && !isBorder3 && !isBorder4 && !isBorder5 && !isBorder6 && !isBorder7 && !isBorder8 && !isBorder9 && !isBorder10 && !isBorder11 && !usesScalableBorder12 && !usesScalableBorder13 && !usesScalableDeco1 && !usesScalableDeco2 && !usesScalableDeco3 && !usesScalableDeco4 && !usesScalableDeco5 && !usesScalableDeco6 && !usesScalableDeco7 && !usesScalableBand8 && !usesScalableFlow9 && !usesScalableDeco10 && !usesScalableDeco11 && !usesScalableDeco12 && DATAV_SVG_OVERLAY_EFFECTS.has(lineEffect) && !!svgEffectProps;

  const props: Record<string, any> = {
    color: [color1, color2],
    backgroundColor,
    style: { width: "100%", height: "100%" },
  };

  /* 开关集合来自元数据（唯一一份）：面板显示什么，这里就传什么 */
  if (DATAV_WITH_REVERSE.has(typeKey)) props.reverse = reverse;
  if (DATAV_WITH_DUR.has(typeKey)) props.dur = dur;
  if (!isBorder && idx === "12") {
    props.scanDur = scanDur;
    props.haloDur = haloDur;
  }

  const needsChildren = isBorder || DATAV_WITH_CHILDREN.has(typeKey);

  const containerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    position: "relative",
    overflow: "visible",
    opacity,
    borderRadius: borderRadius > 0 ? borderRadius : undefined,
    pointerEvents: "none",
    ...containerEffectsStyle,
  };

  if (isBorder && padding > 0) {
    containerStyle.padding = padding;
    containerStyle.boxSizing = "border-box";
  }

  const injectCss = useMemo(
    () => datavMountedCss(uid, datavKind, idx, multiplier),
    [uid, datavKind, idx, multiplier],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let styleEl = el.querySelector(":scope > style[data-datav-inject]") as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.setAttribute("data-datav-inject", "true");
      el.prepend(styleEl);
    }
    styleEl.textContent = injectCss;
  }, [injectCss]);

  const refreshDataVLineEffect = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    if (overlayRafRef.current != null) {
      cancelAnimationFrame(overlayRafRef.current);
    }

    overlayRafRef.current = requestAnimationFrame(() => {
      overlayApplyingRef.current = true;
      applyDataVLineEffectOverlays(el, shouldUseSvgLineEffect ? svgEffectProps : null);
      requestAnimationFrame(() => {
        overlayApplyingRef.current = false;
      });
    });
  }, [shouldUseSvgLineEffect, svgEffectProps]);

  useEffect(() => {
    refreshDataVLineEffect();
    return () => {
      if (overlayRafRef.current != null) {
        cancelAnimationFrame(overlayRafRef.current);
        overlayRafRef.current = null;
      }
      const el = containerRef.current;
      if (el) clearDataVLineEffectOverlays(el);
    };
  }, [refreshDataVLineEffect]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !shouldUseSvgLineEffect) return;

    let rafId: number | null = null;
    const observer = new MutationObserver(() => {
      if (overlayApplyingRef.current) return;
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        refreshDataVLineEffect();
      });
    });

    observer.observe(el, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [refreshDataVLineEffect, shouldUseSvgLineEffect]);

  return (
    <DatavRenderSizeContext.Provider value={sizeOverride ?? null}>
    <div id={uid} ref={containerRef} style={containerStyle}>
      {usesScalableBorder1 ? (
        <ScalableBorderBox1
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
        />
      ) : usesScalableBorder2 ? (
        <ScalableBorderBox2
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
        />
      ) : usesScalableBorder3 ? (
        <ScalableBorderBox3
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
        />
      ) : usesScalableBorder4 ? (
        <ScalableBorderBox4
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
          reverse={reverse}
        />
      ) : usesScalableBorder5 ? (
        <ScalableBorderBox5
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
          reverse={reverse}
        />
      ) : usesScalableBorder6 ? (
        <ScalableBorderBox6
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
        />
      ) : usesScalableBorder7 ? (
        <ScalableBorderBox7
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
        />
      ) : usesScalableBorder8 ? (
        <ScalableBorderBox8
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
          dur={dur}
          reverse={reverse}
        />
      ) : usesScalableBorder9 ? (
        <ScalableBorderBox9
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
        />
      ) : usesScalableBorder10 ? (
        <ScalableBorderBox10
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
        />
      ) : usesScalableBorder11 ? (
        <ScalableBorderBox11
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
          reverse={reverse}
        />
      ) : usesScalableBorder12 ? (
        <ScanBorder12
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
          strokeWidth={strokeWidth}
        />
      ) : usesScalableBorder13 ? (
        <PolylineBorder13
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
          strokeWidth={strokeWidth}
        />
      ) : usesScalableDeco1 ? (
        <DotMatrixDeco1
          color1={color1}
          color2={color2}
          strokeWidth={strokeWidth}
        />
      ) : usesScalableDeco2 ? (
        <ScanLineDeco2
          color1={color1}
          color2={color2}
          strokeWidth={strokeWidth}
          reverse={reverse}
          dur={dur}
        />
      ) : usesScalableDeco3 ? (
        <FlickerDotsDeco3
          color1={color1}
          color2={color2}
          strokeWidth={strokeWidth}
        />
      ) : usesScalableDeco4 ? (
        <GradientBorderDeco4
          color1={color1}
          color2={color2}
          strokeWidth={strokeWidth}
          reverse={reverse}
          dur={dur}
        />
      ) : usesScalableDeco5 ? (
        <PolylineDeco5
          color1={color1}
          color2={color2}
          strokeWidth={strokeWidth}
          dur={dur}
        />
      ) : usesScalableDeco6 ? (
        <BarJumpingDeco6
          color1={color1}
          color2={color2}
          strokeWidth={strokeWidth}
        />
      ) : usesScalableDeco7 ? (
        <DecorationArrow7
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
          strokeWidth={strokeWidth}
        />
      ) : usesScalableBand8 ? (
        <CurlingBranchBand
          color1={color1}
          backgroundColor={backgroundColor}
          strokeWidth={strokeWidth}
        />
      ) : usesScalableFlow9 ? (
        <FlowingLightBand
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
          strokeWidth={strokeWidth}
          /* dur 从 config 读（面板「动画时长」），与 1261 行通用 props 路径同源；此前硬编码 3 → 面板假开关 */
          dur={dur}
        />
      ) : usesScalableDeco10 ? (
        <CarvedFrameDeco10
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
        />
      ) : usesScalableDeco11 ? (
        <ScalableDeco11
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
          reverse={reverse}
        />
      ) : usesScalableDeco12 ? (
        <RadarDeco12
          color1={color1}
          color2={color2}
          backgroundColor={backgroundColor}
          strokeWidth={strokeWidth}
          scanDur={scanDur}
          haloDur={haloDur}
        />
      ) : needsChildren ? (
        <Component {...props} ref={datavRef}>
          <div />
        </Component>
      ) : (
        <Component {...props} ref={datavRef} />
      )}
    </div>
    </DatavRenderSizeContext.Provider>
  );
}

export const DataVRenderer = React.memo(DataVRendererInner, (prevProps, nextProps) => {
  if (prevProps.mode !== nextProps.mode) return false;
  if (prevProps.editorSelected !== nextProps.editorSelected) return false;
  /* 发布端静态渲染会带 sizeOverride；尺寸变了必须重渲染 */
  const ps = prevProps.sizeOverride;
  const ns = nextProps.sizeOverride;
  if (((ps?.width ?? null) !== (ns?.width ?? null)) || ((ps?.height ?? null) !== (ns?.height ?? null))) return false;
  const prev = prevProps.config;
  const next = nextProps.config;
  return prev.datavKind === next.datavKind &&
    prev.datavIndex === next.datavIndex &&
    prev.color1 === next.color1 &&
    prev.color2 === next.color2 &&
    prev.backgroundColor === next.backgroundColor &&
    prev.opacity === next.opacity &&
    prev.padding === next.padding &&
    prev.reverse === next.reverse &&
    prev.dur === next.dur &&
    prev.titleWidth === next.titleWidth &&
    prev.titleOffsetX === next.titleOffsetX &&
    prev.titleAlign === next.titleAlign &&
    prev.title === next.title &&
    prev.titleColor === next.titleColor &&
    prev.titleFontSize === next.titleFontSize &&
    prev.scanDur === next.scanDur &&
    prev.haloDur === next.haloDur &&
    prev.borderRadius === next.borderRadius &&
    prev.strokeWidth === next.strokeWidth &&
    prev.animation === next.animation &&
    prev.animationDuration === next.animationDuration &&
    prev.lineEffect === next.lineEffect &&
    prev.lineEffectColor === next.lineEffectColor &&
    prev.lineEffectIntensity === next.lineEffectIntensity &&
    prev.lineEffectSpeed === next.lineEffectSpeed &&
    prev.lineEffectWidth === next.lineEffectWidth
});
