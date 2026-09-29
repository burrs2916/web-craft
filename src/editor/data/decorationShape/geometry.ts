/**
 * 各形状几何：形状名 + 面板配置 → SVG 图元声明。
 *
 * 这是「形状 → 图元」推导的唯一实现，编辑区与发布端共用。
 */

import { num, str } from "../cssDecls";
import type { DecorDef, DecorPrimitive, DecorShapeOptions, DecorShapeSpec } from "./types";
import { decorBorderDash, decorLineCapOf, decorLineDash, decorLineJoinOf, resolveDecorStroke } from "./stroke";
import { decorFillOf, decorShadowFilter } from "./fill";

/** 正多边形顶点（半径 45、圆心 50,50，与旧实现一致） */
function polygonPoints(sides: number): string {
  const cx = 50;
  const cy = 50;
  const r = 45;
  return Array.from({ length: Math.max(3, sides) }, (_, i) => {
    const angle = (2 * Math.PI * i) / Math.max(3, sides) - Math.PI / 2;
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(" ");
}

/** 星形路径（外径 45） */
function starPath(points: number, innerRatio: number): string {
  const cx = 50;
  const cy = 50;
  const outerR = 45;
  const innerR = outerR * innerRatio;
  const parts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const angle = (Math.PI * i) / points - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    parts.push(`${i === 0 ? "M" : "L"} ${cx + r * Math.cos(angle)} ${cy + r * Math.sin(angle)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

/** 十字路径（臂宽 thickness） */
function crossPath(thickness: number): string {
  const ht = thickness / 2;
  return [
    `M ${50 - ht} 5`,
    `L ${50 + ht} 5`,
    `L ${50 + ht} ${50 - ht}`,
    `L 95 ${50 - ht}`,
    `L 95 ${50 + ht}`,
    `L ${50 + ht} ${50 + ht}`,
    `L ${50 + ht} 95`,
    `L ${50 - ht} 95`,
    `L ${50 - ht} ${50 + ht}`,
    `L 5 ${50 + ht}`,
    `L 5 ${50 - ht}`,
    `L ${50 - ht} ${50 - ht}`,
    "Z",
  ].join(" ");
}

/** 箭头翼（tip 为尖端，reverse 用于双向上游那支） */
function arrowHeadPath(tipX: number, tipY: number, size: number, reverse: boolean, shape: string): string {
  if (shape === "diamond") {
    const half = size / 2;
    const back = reverse ? half : -half;
    return `M ${tipX + back} ${tipY - half / 2} L ${tipX} ${tipY} L ${tipX + back} ${tipY + half / 2} L ${tipX + back * 2} ${tipY} Z`;
  }
  const halfAngle = (30 * Math.PI) / 180;
  const dx = size * Math.cos(halfAngle);
  const dy = size * Math.sin(halfAngle);
  return reverse
    ? `M ${tipX + dx} ${tipY - dy} L ${tipX} ${tipY} L ${tipX + dx} ${tipY + dy} Z`
    : `M ${tipX - dx} ${tipY - dy} L ${tipX} ${tipY} L ${tipX - dx} ${tipY + dy} Z`;
}

const GRADIENT_KEYFRAMES = `
@keyframes deco-grad-shift {
  0% { transform: translateX(-50%); }
  100% { transform: translateX(0%); }
}
@keyframes deco-grad-shift-v {
  0% { transform: translateY(-50%); }
  100% { transform: translateY(0%); }
}
@keyframes deco-grad-rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
`;

/** 支持等比缩放的 viewBox（保持长宽比，内容不会被拉伸变形） */
const VB_FIT = "0 0 100 100";
const PAR_MEET = "xMidYMid meet";
/** 铺满 viewBox（形状按拖动框拉伸，矩形/椭圆/线条/网格等） */
const PAR_NONE = "none";

/** 填充 + 描边图形（rect/circle/ellipse/polygon/path 共用） */
function filledAttrs(fill: string, s: ReturnType<typeof resolveDecorStroke>, extra: Record<string, string | number> = {}): Record<string, string | number> {
  return {
    ...extra,
    fill,
    stroke: s.hasStroke ? s.stroke : "none",
    strokeWidth: s.hasStroke ? s.strokeWidth : 0,
    strokeDasharray: s.hasStroke ? s.dashArray : "none",
    vectorEffect: "non-scaling-stroke",
  };
}

/**
 * 形状 → 图元声明。**未知类型返回空图元**（不抛错，避免一个坏组件炸掉整页预览）。
 *
 * 对外入口只做一件事：在 `buildDecorationShape` 的几何之上叠加"轮廓阴影"这一层
 * （写进 `boxCss.filter`，编辑区与发布端都把 boxCss 铺在最外层容器上 → 两端同层）。
 */
export function decorationShape(
  kind: string,
  config: Record<string, unknown>,
  opts: DecorShapeOptions = {},
): DecorShapeSpec {
  const spec = buildDecorationShape(kind, config, opts);
  const filter = decorShadowFilter(config.shadow);
  if (!filter) return spec;
  return { ...spec, boxCss: { ...(spec.boxCss ?? {}), filter } };
}

function buildDecorationShape(
  kind: string,
  config: Record<string, unknown>,
  opts: DecorShapeOptions = {},
): DecorShapeSpec {
  const plain = kind.replace(/^decoration-/, "");
  const uid = opts.uid || "deco";
  const opacity = num(config.opacity, 1);
  /* 纯色 / 渐变填充：只有在本形状真的画填充时才被消费 */
  const fillSpec = decorFillOf(config, uid, "rgba(33, 150, 243, 0.3)");

  switch (plain) {
    case "rect": {
      const s = resolveDecorStroke(config);
      const sw = s.hasStroke ? s.strokeWidth / 2 : 0;
      const r = num(config.borderRadius, 0);
      return {
        viewBox: VB_FIT,
        preserveAspectRatio: PAR_NONE,
        overflowVisible: true,
        boxCss: { opacity: String(opacity) },
        defs: fillSpec.defs,
        primitives: [{
          tag: "rect",
          attrs: filledAttrs(fillSpec.fill, s, {
            x: sw, y: sw, width: 100 - sw * 2, height: 100 - sw * 2, rx: r, ry: r,
          }),
        }],
      };
    }

    case "circle": {
      const s = resolveDecorStroke(config);
      const sw = s.hasStroke ? s.strokeWidth / 2 : 0;
      return {
        viewBox: VB_FIT,
        preserveAspectRatio: PAR_MEET,
        boxCss: { opacity: String(opacity) },
        defs: fillSpec.defs,
        primitives: [{
          tag: "circle",
          attrs: filledAttrs(fillSpec.fill, s, { cx: 50, cy: 50, r: 50 - sw }),
        }],
      };
    }

    case "ellipse": {
      const s = resolveDecorStroke(config);
      const w = opts.width || 200;
      const h = opts.height || 120;
      const cx = w / 2;
      const cy = h / 2;
      const sw = s.hasStroke ? s.strokeWidth / 2 : 0;
      return {
        viewBox: `0 0 ${w} ${h}`,
        preserveAspectRatio: PAR_NONE,
        overflowVisible: true,
        boxCss: { opacity: String(opacity) },
        defs: fillSpec.defs,
        primitives: [{
          tag: "ellipse",
          attrs: filledAttrs(fillSpec.fill, s, {
            cx, cy, rx: Math.max(1, cx - sw), ry: Math.max(1, cy - sw),
          }),
        }],
      };
    }

    case "triangle": {
      const s = resolveDecorStroke(config);
      const direction = str(config.direction) || "up";
      const points =
        direction === "down" ? "5,5 95,5 50,95"
          : direction === "left" ? "95,5 95,95 5,50"
            : direction === "right" ? "5,5 5,95 95,50"
              : "50,5 95,95 5,95";
      return {
        viewBox: VB_FIT,
        preserveAspectRatio: PAR_MEET,
        boxCss: { opacity: String(opacity) },
        defs: fillSpec.defs,
        primitives: [{
          tag: "polygon",
          attrs: filledAttrs(fillSpec.fill, s, { points, strokeLinejoin: decorLineJoinOf(config, "decoration-triangle") }),
        }],
      };
    }

    case "polygon": {
      const s = resolveDecorStroke(config);
      return {
        viewBox: VB_FIT,
        preserveAspectRatio: PAR_MEET,
        boxCss: { opacity: String(opacity) },
        defs: fillSpec.defs,
        primitives: [{
          tag: "polygon",
          attrs: filledAttrs(fillSpec.fill, s, {
            points: polygonPoints(num(config.sides, 6)),
            strokeLinejoin: decorLineJoinOf(config, "decoration-polygon"),
          }),
        }],
      };
    }

    case "star": {
      const s = resolveDecorStroke(config);
      return {
        viewBox: VB_FIT,
        preserveAspectRatio: PAR_MEET,
        boxCss: { opacity: String(opacity) },
        defs: fillSpec.defs,
        primitives: [{
          tag: "path",
          attrs: filledAttrs(fillSpec.fill, s, {
            d: starPath(Math.max(3, num(config.points, 5)), num(config.innerRatio, 0.4)),
            strokeLinejoin: decorLineJoinOf(config, "decoration-star"),
          }),
        }],
      };
    }

    case "ring": {
      const stroke = str(config.stroke) || "#2196F3";
      const ringWidth = num(config.ringWidth, 6);
      const borderStyle = str(config.borderStyle) || "solid";
      const fill = str(config.fill) || "none";
      const strokeWidth = num(config.strokeWidth, 0);
      const dash = decorBorderDash(borderStyle);
      const primitives: DecorPrimitive[] = [{
        tag: "circle",
        attrs: {
          cx: 50, cy: 50,
          r: Math.max(1, 50 - ringWidth / 2),
          fill,
          stroke,
          strokeWidth: ringWidth,
          strokeDasharray: dash,
          vectorEffect: "non-scaling-stroke",
        },
      }];
      if (strokeWidth > 0) {
        primitives.push({
          tag: "circle",
          attrs: {
            cx: 50, cy: 50,
            r: Math.max(1, 50 - ringWidth - strokeWidth / 2),
            fill: "none",
            stroke,
            strokeWidth,
            opacity: 0.5,
            vectorEffect: "non-scaling-stroke",
          },
        });
      }
      return { viewBox: VB_FIT, preserveAspectRatio: PAR_MEET, overflowVisible: true, boxCss: { opacity: String(opacity) }, primitives };
    }

    case "diamond": {
      const s = resolveDecorStroke(config);
      return {
        viewBox: VB_FIT,
        preserveAspectRatio: PAR_MEET,
        boxCss: { opacity: String(opacity) },
        defs: fillSpec.defs,
        primitives: [{
          tag: "polygon",
          attrs: filledAttrs(fillSpec.fill, s, {
            points: "50,5 95,50 50,95 5,50",
            strokeLinejoin: decorLineJoinOf(config, "decoration-diamond"),
          }),
        }],
      };
    }

    case "cross": {
      const crossFill = decorFillOf(config, uid, "#2196F3");
      const fill = crossFill.fill;
      const stroke = str(config.stroke) || "transparent";
      const strokeWidth = num(config.strokeWidth, 0);
      const hasStroke = strokeWidth > 0 && stroke !== "transparent";
      return {
        viewBox: VB_FIT,
        preserveAspectRatio: PAR_MEET,
        boxCss: { opacity: String(opacity) },
        defs: crossFill.defs,
        primitives: [{
          tag: "path",
          attrs: {
            d: crossPath(num(config.thickness, 10)),
            fill,
            stroke: hasStroke ? stroke : "none",
            strokeWidth,
            strokeLinejoin: decorLineJoinOf(config, "decoration-cross"),
            vectorEffect: "non-scaling-stroke",
          },
        }],
      };
    }

    case "divider": {
      const stroke = str(config.stroke) || "#2196F3";
      const strokeWidth = num(config.strokeWidth, 2);
      const style = str(config.style) || "single";
      const gap = num(config.gap, 3);
      const dash = decorLineDash(str(config.lineStyle) || "solid");
      const defs: DecorDef[] = [];
      const primitives: DecorPrimitive[] = [];
      const lineCommon = { stroke, strokeWidth, strokeLinecap: decorLineCapOf(config, "decoration-divider"), vectorEffect: "non-scaling-stroke" };

      if (style === "double") {
        primitives.push({ tag: "line", attrs: { x1: 0, y1: 50 - gap / 2, x2: 100, y2: 50 - gap / 2, strokeDasharray: dash, ...lineCommon } });
        primitives.push({ tag: "line", attrs: { x1: 0, y1: 50 + gap / 2, x2: 100, y2: 50 + gap / 2, strokeDasharray: dash, ...lineCommon } });
      } else if (style === "gradient") {
        const id = `divider-grad-${uid}`;
        defs.push({
          kind: "linear",
          id,
          attrs: { x1: 0, y1: 0, x2: 1, y2: 0 },
          stops: [
            { offset: "0%", color: stroke, opacity: 0 },
            { offset: "50%", color: stroke, opacity: 1 },
            { offset: "100%", color: stroke, opacity: 0 },
          ],
        });
        primitives.push({ tag: "line", attrs: { x1: 0, y1: 50, x2: 100, y2: 50, ...lineCommon, stroke: `url(#${id})` } });
      } else {
        primitives.push({ tag: "line", attrs: { x1: 0, y1: 50, x2: 100, y2: 50, strokeDasharray: dash, ...lineCommon } });
      }

      return {
        viewBox: VB_FIT,
        preserveAspectRatio: PAR_NONE,
        overflowVisible: true,
        boxCss: { opacity: String(opacity) },
        defs,
        primitives,
        autoFit: { height: style === "double" ? Math.ceil(strokeWidth * 2 + gap + 4) : Math.ceil(strokeWidth + 4) },
      };
    }

    case "wave": {
      const stroke = str(config.stroke) || "#2196F3";
      const strokeWidth = num(config.strokeWidth, 2);
      const amplitude = Math.min(num(config.amplitude, 10), 45);
      const wavelength = num(config.wavelength, 30);
      const dash = decorLineDash(str(config.lineStyle) || "solid");
      const fill = str(config.fill) || "none";

      const vbW = 100;
      const vbH = 100;
      const midY = 50;
      const numWaves = Math.max(2, Math.ceil(vbW / wavelength));
      const effectiveWL = vbW / numWaves;

      let d = `M 0 ${midY}`;
      for (let x = 0; x <= vbW; x += 0.5) {
        const y = midY + amplitude * Math.sin((2 * Math.PI * x) / effectiveWL);
        d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      const fillPath = fill && fill !== "none" ? d + ` L ${vbW} ${vbH} L 0 ${vbH} Z` : "";

      const primitives: DecorPrimitive[] = [];
      if (fillPath) primitives.push({ tag: "path", attrs: { d: fillPath, fill } });
      primitives.push({
        tag: "path",
        attrs: {
          d, stroke, strokeWidth, strokeDasharray: dash, fill: "none",
          strokeLinecap: decorLineCapOf(config, "decoration-wave"), strokeLinejoin: "round", vectorEffect: "non-scaling-stroke",
        },
      });

      return {
        viewBox: `0 0 ${vbW} ${vbH}`,
        preserveAspectRatio: PAR_NONE,
        overflowVisible: true,
        boxCss: { opacity: String(opacity) },
        primitives,
        autoFit: { height: Math.ceil(amplitude * 2 + strokeWidth + 4) },
      };
    }

    case "dashed-box": {
      const stroke = str(config.stroke) || "#2196F3";
      const strokeWidth = num(config.strokeWidth, 2);
      const dashLength = num(config.dashLength, 8);
      const gapLength = num(config.gapLength, 4);
      const borderRadius = num(config.borderRadius, 0);
      const sw = strokeWidth / 2;
      const r = borderRadius;
      return {
        viewBox: VB_FIT,
        preserveAspectRatio: PAR_NONE,
        overflowVisible: true,
        boxCss: { opacity: String(opacity) },
        primitives: [{
          tag: "rect",
          attrs: {
            x: sw, y: sw,
            width: 100 - strokeWidth, height: 100 - strokeWidth,
            rx: r, ry: r,
            fill: str(config.fill) || "none",
            stroke,
            strokeWidth,
            strokeDasharray: `${dashLength} ${gapLength}`,
            strokeLinecap: decorLineCapOf(config, "decoration-dashed-box"),
            vectorEffect: "non-scaling-stroke",
          },
        }],
      };
    }

    case "gradient": {
      const from = str(config.gradientFrom) || "#2196F3";
      const to = str(config.gradientTo) || "#FF9800";
      const direction = str(config.direction) || "to-right";
      const borderRadius = num(config.borderRadius, 0);
      const stroke = str(config.stroke) || "none";
      const strokeWidth = num(config.strokeWidth, 0);
      const animated = config.animated === true;
      const speed = num(config.speed, 3000);

      const r = borderRadius;
      const hasStroke = strokeWidth > 0 && stroke !== "none";
      const sw = hasStroke ? strokeWidth / 2 : 0;
      const isRadial = direction === "radial";
      const isVertical = direction === "to-bottom" || direction === "to-top";

      const rectAttrs = (fill: string): Record<string, string | number> => ({
        x: sw, y: sw, width: 100 - sw * 2, height: 100 - sw * 2, rx: r, ry: r,
        fill,
        stroke: hasStroke ? stroke : "none",
        strokeWidth: hasStroke ? strokeWidth : 0,
        vectorEffect: "non-scaling-stroke",
      });

      const staticId = `deco-grad-${uid}`;
      const animId = `deco-grad-anim-${uid}`;
      let defs: DecorDef[] = [];
      let primitives: DecorPrimitive[] = [];

      if (!animated) {
        defs = [{
          kind: isRadial ? "radial" : "linear",
          id: staticId,
          attrs: isRadial
            ? { cx: "50%", cy: "50%", r: "50%", fx: "50%", fy: "50%" }
            : direction === "to-left" ? { x1: 1, y1: 0, x2: 0, y2: 0 }
              : direction === "to-bottom" ? { x1: 0, y1: 0, x2: 0, y2: 1 }
                : direction === "to-top" ? { x1: 0, y1: 1, x2: 0, y2: 0 }
                  : direction === "to-right-bottom" ? { x1: 0, y1: 0, x2: 1, y2: 1 }
                    : direction === "to-left-bottom" ? { x1: 1, y1: 0, x2: 0, y2: 1 }
                      : { x1: 0, y1: 0, x2: 1, y2: 0 },
          stops: [{ offset: "0%", color: from }, { offset: "100%", color: to }],
        }];
        primitives = [{ tag: "rect", attrs: rectAttrs(`url(#${staticId})`) }];
      } else if (isRadial) {
        defs = [{
          kind: "radial",
          id: animId,
          attrs: { cx: "50%", cy: "50%", r: "50%", fx: "50%", fy: "50%" },
          stops: [
            { offset: "0%", color: from }, { offset: "33%", color: to },
            { offset: "66%", color: from }, { offset: "100%", color: to },
          ],
        }];
        primitives = [{
          tag: "rect",
          attrs: rectAttrs(`url(#${animId})`),
          css: { animation: `deco-grad-rotate ${speed * 3}ms linear infinite`, transformOrigin: "50% 50%" },
        }];
      } else {
        const shift = isVertical ? "deco-grad-shift-v" : "deco-grad-shift";
        const clipId = `clip-${uid}`;
        defs = [
          {
            kind: "linear",
            id: animId,
            attrs: { x1: 0, y1: 0, x2: 1, y2: 0 },
            stops: [
              { offset: "0%", color: from }, { offset: "25%", color: to },
              { offset: "50%", color: from }, { offset: "75%", color: to },
              { offset: "100%", color: from },
            ],
          },
          { kind: "clip", id: clipId, attrs: {}, rect: { x: sw, y: sw, width: 100 - sw * 2, height: 100 - sw * 2, rx: r, ry: r } },
        ];
        primitives = [{
          tag: "rect",
          attrs: {
            x: isVertical ? sw : -50,
            y: isVertical ? -50 : sw,
            width: isVertical ? 100 - sw * 2 : 200,
            height: isVertical ? 200 : 100 - sw * 2,
            fill: `url(#${animId})`,
            clipPath: `url(#${clipId})`,
          },
          css: { animation: `${shift} ${speed}ms linear infinite` },
        }];
        if (hasStroke) primitives.push({ tag: "rect", attrs: rectAttrs("none") });
      }

      return {
        viewBox: VB_FIT,
        preserveAspectRatio: PAR_NONE,
        overflowVisible: true,
        boxCss: { opacity: String(opacity) },
        defs,
        primitives,
        keyframes: animated ? GRADIENT_KEYFRAMES : undefined,
      };
    }

    case "corner": {
      const stroke = str(config.stroke) || "#2196F3";
      const s = num(config.size, 15);
      const strokeWidth = num(config.strokeWidth, 2);
      const position = str(config.position) || "all";
      const style = str(config.style) || "bracket";
      const show = {
        tl: ["all", "top-left", "top", "left"].includes(position),
        tr: ["all", "top-right", "top", "right"].includes(position),
        bl: ["all", "bottom-left", "bottom", "left"].includes(position),
        br: ["all", "bottom-right", "bottom", "right"].includes(position),
      };
      const cornerPath = (corner: "tl" | "tr" | "bl" | "br"): string => {
        if (style === "l-shape") {
          switch (corner) {
            case "tl": return `M 0 0 L ${s} 0 L ${s} ${s}`;
            case "tr": return `M 100 0 L ${100 - s} 0 L ${100 - s} ${s}`;
            case "bl": return `M 0 100 L ${s} 100 L ${s} ${100 - s}`;
            case "br": return `M 100 100 L ${100 - s} 100 L ${100 - s} ${100 - s}`;
          }
        }
        switch (corner) {
          case "tl": return `M 0 ${s} L ${s} ${s} L ${s} 0`;
          case "tr": return `M 100 ${s} L ${100 - s} ${s} L ${100 - s} 0`;
          case "bl": return `M 0 ${100 - s} L ${s} ${100 - s} L ${s} 100`;
          case "br": return `M 100 ${100 - s} L ${100 - s} ${100 - s} L ${100 - s} 100`;
        }
        return "";
      };
      const attrs = {
        stroke, strokeWidth, fill: "none",
        strokeLinecap: decorLineCapOf(config, "decoration-corner"),
        strokeLinejoin: decorLineJoinOf(config, "decoration-corner"),
        vectorEffect: "non-scaling-stroke",
      };
      const primitives: DecorPrimitive[] = [];
      for (const corner of ["tl", "tr", "bl", "br"] as const) {
        if (show[corner]) primitives.push({ tag: "path", attrs: { d: cornerPath(corner), ...attrs } });
      }
      return {
        viewBox: VB_FIT,
        preserveAspectRatio: PAR_NONE,
        boxCss: { opacity: String(opacity), position: "relative" },
        primitives,
      };
    }

    case "dot": {
      const fill = str(config.fill) || "#2196F3";
      const stroke = str(config.stroke) || "transparent";
      const strokeWidth = num(config.strokeWidth, 0);
      const shape = str(config.shape) || "circle";
      const hasStroke = strokeWidth > 0 && stroke !== "transparent";
      const base = {
        fill,
        stroke: hasStroke ? stroke : "none",
        strokeWidth,
        vectorEffect: "non-scaling-stroke",
      };
      let primitive: DecorPrimitive;
      switch (shape) {
        case "square":
          primitive = {
            tag: "rect",
            attrs: {
              x: hasStroke ? strokeWidth : 0, y: hasStroke ? strokeWidth : 0,
              width: hasStroke ? 100 - strokeWidth * 2 : 100,
              height: hasStroke ? 100 - strokeWidth * 2 : 100,
              ...base,
            },
          };
          break;
        case "triangle":
          primitive = { tag: "polygon", attrs: { points: "50,5 95,95 5,95", strokeLinejoin: "round", ...base } };
          break;
        case "diamond":
          primitive = { tag: "polygon", attrs: { points: "50,5 95,50 50,95 5,50", strokeLinejoin: "round", ...base } };
          break;
        case "cross":
          primitive = { tag: "path", attrs: { d: crossPath(25), strokeLinejoin: "round", ...base } };
          break;
        case "star": {
          primitive = { tag: "path", attrs: { d: starPath(5, 18 / 45), strokeLinejoin: "round", ...base } };
          break;
        }
        default:
          primitive = { tag: "circle", attrs: { cx: 50, cy: 50, r: hasStroke ? 50 - strokeWidth / 2 : 50, ...base } };
      }
      return {
        viewBox: VB_FIT,
        preserveAspectRatio: PAR_MEET,
        boxCss: { opacity: String(opacity), display: "flex", alignItems: "center", justifyContent: "center" },
        primitives: [primitive],
      };
    }

    case "grid": {
      const stroke = str(config.stroke) || "rgba(255,255,255,0.1)";
      const strokeWidth = num(config.strokeWidth, 1);
      // 步长护栏：面板 min=0，用户填 0 时 x += 0 是死循环（发布端直接挂死）
      const spacing = Math.max(num(config.spacing, 20), 1);
      const dash = decorLineDash(str(config.lineStyle) || "solid");
      const primitives: DecorPrimitive[] = [];
      for (let x = spacing; x < 100; x += spacing) {
        primitives.push({ tag: "line", attrs: { x1: x, y1: 0, x2: x, y2: 100, stroke, strokeWidth, strokeDasharray: dash, vectorEffect: "non-scaling-stroke" } });
      }
      for (let y = spacing; y < 100; y += spacing) {
        primitives.push({ tag: "line", attrs: { x1: 0, y1: y, x2: 100, y2: y, stroke, strokeWidth, strokeDasharray: dash, vectorEffect: "non-scaling-stroke" } });
      }
      return { viewBox: VB_FIT, preserveAspectRatio: PAR_NONE, boxCss: { opacity: String(opacity) }, primitives };
    }

    case "diagonal": {
      const stroke = str(config.stroke) || "rgba(255,255,255,0.1)";
      const strokeWidth = num(config.strokeWidth, 1);
      const spacing = num(config.spacing, 10);
      const angle = num(config.angle, 45);
      const dash = decorLineDash(str(config.lineStyle) || "solid");
      const rad = (angle * Math.PI) / 180;
      const tanA = Math.abs(Math.tan(rad));
      const effectiveSpacing = Math.max(spacing, strokeWidth + 2);
      const primitives: DecorPrimitive[] = [];
      const push = (x1: number, y1: number, x2: number, y2: number) => {
        primitives.push({ tag: "line", attrs: { x1, y1, x2, y2, stroke, strokeWidth, strokeDasharray: dash, vectorEffect: "non-scaling-stroke" } });
      };

      if (angle > 0 && angle < 90) {
        const step = effectiveSpacing / Math.sin(rad);
        const stepY = effectiveSpacing / Math.cos(rad);
        const totalStep = Math.min(step, stepY);
        for (let offset = -200; offset <= 300; offset += totalStep) {
          push(offset, 0, offset + 100 * tanA, 100);
        }
      } else if (angle === 90) {
        for (let x = 0; x <= 100; x += effectiveSpacing) push(x, 0, x, 100);
      } else if (angle === 0) {
        for (let y = 0; y <= 100; y += effectiveSpacing) push(0, y, 100, y);
      } else {
        const absAngle = ((angle % 360) + 360) % 360;
        const normalizedAngle = absAngle > 180 ? absAngle - 360 : absAngle;
        const nRad = (normalizedAngle * Math.PI) / 180;
        const step = effectiveSpacing / Math.abs(Math.sin(nRad));
        for (let offset = -200; offset <= 300; offset += step) {
          push(offset, 0, offset - 100 * Math.abs(tanA), 100);
        }
      }
      return { viewBox: VB_FIT, preserveAspectRatio: PAR_NONE, overflowVisible: true, boxCss: { opacity: String(opacity) }, primitives };
    }

    case "dots-pattern": {
      const fill = str(config.fill) || "rgba(255,255,255,0.15)";
      const dotSize = num(config.dotSize, 2);
      // 步长护栏：同 grid，spacing=0 会让双层 for 死循环
      const spacing = Math.max(num(config.spacing, 12), 1);
      const shape = str(config.shape) || "circle";
      const r = dotSize;
      const s = dotSize * 2;
      const primitives: DecorPrimitive[] = [];
      for (let x = spacing; x < 100; x += spacing) {
        for (let y = spacing; y < 100; y += spacing) {
          if (shape === "square") {
            primitives.push({ tag: "rect", attrs: { x: x - r, y: y - r, width: s, height: s, fill } });
          } else if (shape === "diamond") {
            primitives.push({ tag: "rect", attrs: { x: x - r, y: y - r, width: s, height: s, fill, transform: `rotate(45 ${x} ${y})` } });
          } else {
            primitives.push({ tag: "circle", attrs: { cx: x, cy: y, r, fill } });
          }
        }
      }
      return { viewBox: VB_FIT, preserveAspectRatio: PAR_NONE, boxCss: { opacity: String(opacity) }, primitives };
    }

    case "line": {
      const stroke = str(config.stroke) || "#2196F3";
      const strokeWidth = num(config.strokeWidth, 3);
      const dash = decorLineDash(str(config.lineStyle) || "solid");
      const direction = str(config.direction) || "horizontal";
      const attrs = {
        stroke, strokeWidth, strokeDasharray: dash,
        strokeLinecap: decorLineCapOf(config, "decoration-line"), vectorEffect: "non-scaling-stroke",
      };
      const coords =
        direction === "vertical" ? { x1: 50, y1: 0, x2: 50, y2: 100 }
          : direction === "diagonal-tl-br" ? { x1: 0, y1: 0, x2: 100, y2: 100 }
            : direction === "diagonal-tr-bl" ? { x1: 100, y1: 0, x2: 0, y2: 100 }
              : { x1: 0, y1: 50, x2: 100, y2: 50 };
      const isVertical = direction === "vertical";
      return {
        viewBox: VB_FIT,
        preserveAspectRatio: PAR_NONE,
        overflowVisible: true,
        boxCss: { opacity: String(opacity) },
        primitives: [{ tag: "line", attrs: { ...coords, ...attrs } }],
        autoFit: isVertical
          ? { width: Math.ceil(strokeWidth + 4) }
          : { height: Math.ceil(strokeWidth + 4) },
      };
    }

    case "arrow": {
      const stroke = str(config.color1) || str(config.color) || "#2196F3";
      const strokeWidth = num(config.strokeWidth, 2);
      const direction = str(config.direction) || "right";
      const arrowType = str(config.arrowType) || "single";
      const arrowSize = num(config.arrowSize, 10);
      const dash = decorLineDash(str(config.lineStyle) || "solid");
      const arrowShape = str(config.arrowShape) || "triangle";
      const arrowCount = Math.max(1, num(config.arrowCount, 1));

      const rotation = direction === "up" ? -90 : direction === "down" ? 90 : direction === "left" ? 180 : 0;
      const startX = arrowType === "double" ? 15 : 0;
      const endX = arrowType === "double" ? 85 : 100;
      // 「连续」＝沿线均匀排布 arrowCount 个箭头，尖端朝前；单/双向沿用首尾布局
      const spread = arrowType === "chain" ? arrowCount : 1;
      const isMulti = spread > 1;
      const lineStart = isMulti ? 0 : startX;
      const lineEnd = isMulti ? 100 : endX;

      const primitives: DecorPrimitive[] = [];
      const group: DecorPrimitive[] = [];

      group.push({
        tag: "path",
        attrs: {
          d: `M ${lineStart} 50 L ${lineEnd} 50`,
          stroke, strokeWidth, strokeDasharray: dash, fill: "none",
          strokeLinecap: decorLineCapOf(config, "decoration-arrow"), vectorEffect: "non-scaling-stroke",
        },
      });

      if (isMulti) {
        for (let i = 0; i < spread; i++) {
          const tip = ((i + 1) * 100) / spread;
          group.push({
            tag: "path",
            attrs: {
              d: arrowHeadPath(tip, 50, arrowSize, false, arrowShape),
              stroke, strokeWidth, fill: stroke, strokeLinejoin: decorLineJoinOf(config, "decoration-arrow"), vectorEffect: "non-scaling-stroke",
            },
          });
        }
      } else {
        group.push({
          tag: "path",
          attrs: {
            d: arrowHeadPath(endX, 50, arrowSize, false, arrowShape),
            stroke, strokeWidth, fill: stroke, strokeLinejoin: "round", vectorEffect: "non-scaling-stroke",
          },
        });
        if (arrowType === "double") {
          group.push({
            tag: "path",
            attrs: {
              d: arrowHeadPath(startX, 50, arrowSize, true, arrowShape),
              stroke, strokeWidth, fill: stroke, strokeLinejoin: decorLineJoinOf(config, "decoration-arrow"), vectorEffect: "non-scaling-stroke",
            },
          });
        }
      }

      if (rotation !== 0) {
        for (const p of group) p.attrs = { ...p.attrs, transform: `rotate(${rotation} 50 50)` };
      }
      primitives.push(...group);

      const isVertical = direction === "up" || direction === "down";
      return {
        viewBox: VB_FIT,
        preserveAspectRatio: PAR_NONE,
        overflowVisible: true,
        boxCss: { opacity: String(opacity), display: "flex", alignItems: "center", justifyContent: "center" },
        primitives,
        autoFit: isVertical
          ? { width: Math.ceil(arrowSize + strokeWidth + 4) }
          : { height: Math.ceil(arrowSize + strokeWidth + 4) },
      };
    }

    default:
      return { viewBox: VB_FIT, preserveAspectRatio: PAR_MEET, primitives: [] };
  }
}