/**
 * 形状组件组（ccat_shape 的 `shape`）：多形状 + 渐变填充 + 阴影。
 *
 * 与装饰组的区别是**面板语义**（shapeType/fill/stroke/...），不是几何 ——
 * 因此这里做的是"面板配置 → 装饰组图元"的映射，几何仍然只此一份，
 * 不会出现"形状组一套字面量、装饰组另一套"的分叉。
 */

import { num, str } from "../cssDecls";
import type { DecorShapeOptions, DecorShapeSpec } from "./types";
import { decorationShape } from "./geometry";

/** `shape` 组件可选的形状种类（面板选项与实现共用同一份清单） */
export const SHAPE_KIND_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "矩形", value: "rect" },
  { label: "圆形", value: "circle" },
  { label: "椭圆", value: "ellipse" },
  { label: "线条", value: "line" },
  { label: "三角形", value: "triangle" },
  { label: "菱形", value: "diamond" },
  { label: "五角星", value: "star" },
  { label: "正多边形", value: "polygon" },
  { label: "十字", value: "cross" },
  { label: "虚线框", value: "dashed-box" },
];

/** `shape` 面板配置 → 装饰组图元声明（几何单一来源） */
export function shapeSpec(config: Record<string, unknown>, opts: DecorShapeOptions = {}): DecorShapeSpec {
  const shapeType = str(config.shapeType) || "rect";
  const gradient = config.gradientEnabled === true;
  const stroke = str(config.stroke) || "#2196F3";
  const strokeWidth = num(config.strokeWidth, 2);
  const borderStyle = str(config.borderStyle) || "solid";
  const opacity = num(config.opacity, 1);
  /* shadow 一并透传 → 由 decorationShape 统一写进 boxCss.filter（与装饰组同一层、同一映射） */
  /* lineCap / lineJoin 同样透传：形状组与装饰组共用几何，描边细节口径必须只有一份 */
  const base = {
    stroke, strokeWidth, borderStyle, opacity, shadow: config.shadow,
    lineCap: config.lineCap, lineJoin: config.lineJoin,
  };

  if (gradient) {
    return decorationShape("decoration-gradient", {
      gradientFrom: str(config.gradientFrom) || str(config.fill) || "#2196F3",
      gradientTo: str(config.gradientTo) || "#FF9800",
      direction: str(config.gradientDirection) || "to-right",
      borderRadius: num(config.borderRadius, 0),
      stroke: borderStyle === "none" ? "none" : stroke,
      strokeWidth: borderStyle === "none" ? 0 : strokeWidth,
      opacity,
      shadow: config.shadow,
    }, opts);
  }

  const fill = str(config.fill) || "rgba(33, 150, 243, 0.3)";

  switch (shapeType) {
    case "circle":
      return decorationShape("decoration-circle", { ...base, fill }, opts);
    case "ellipse":
      return decorationShape("decoration-ellipse", { ...base, fill }, opts);
    case "line":
      return decorationShape("decoration-line", {
        stroke,
        strokeWidth,
        lineStyle: borderStyle === "none" ? "solid" : borderStyle,
        direction: str(config.lineDirection) || "horizontal",
        opacity,
        shadow: config.shadow,
        lineCap: config.lineCap,
      }, opts);
    case "triangle":
      return decorationShape("decoration-triangle", { ...base, fill }, opts);
    case "diamond":
      return decorationShape("decoration-diamond", { ...base, fill }, opts);
    case "star":
      return decorationShape("decoration-star", {
        ...base, fill,
        points: num(config.points, 5),
        innerRatio: num(config.innerRatio, 0.4),
      }, opts);
    case "polygon":
      return decorationShape("decoration-polygon", { ...base, fill, sides: num(config.sides, 6) }, opts);
    case "cross":
      return decorationShape("decoration-cross", {
        fill,
        stroke: borderStyle === "none" ? "transparent" : stroke,
        strokeWidth: borderStyle === "none" ? 0 : strokeWidth,
        thickness: num(config.thickness, 10),
        opacity,
        shadow: config.shadow,
      }, opts);
    case "dashed-box":
      return decorationShape("decoration-dashed-box", {
        ...base,
        fill,
        dashLength: num(config.dashLength, 8),
        gapLength: num(config.gapLength, 4),
        borderRadius: num(config.borderRadius, 0),
      }, opts);
    case "rect":
    default:
      return decorationShape("decoration-rect", { ...base, fill, borderRadius: num(config.borderRadius, 0) }, opts);
  }
}