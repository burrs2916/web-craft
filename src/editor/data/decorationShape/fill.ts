/**
 * 填充（纯色 / 渐变）与阴影 —— 装饰组与形状组的**共用口径**。
 *
 * 背景：形状组（`shape`）早就有"渐变填充 + 阴影"，装饰组 20 个原生形状却只有纯色填充，
 * 属性栏也没有这两组控件。若在装饰组各写一份，必然出现"同一档阴影两个数值"的漂移，
 * 所以这里把取值口径收成纯函数，两端（编辑区渲染器 / 发布端 codegen）与本文件各形状共用。
 */

import { str } from "../cssDecls";
import type { DecorFillResult } from "./types";

/** 阴影档位 → CSS filter 的唯一映射（形状组历史上就叫 SHAPE_SHADOWS，保留该名字避免破坏引用） */
export const SHAPE_SHADOWS: Record<string, string> = {
  none: "",
  soft: "drop-shadow(0 2px 4px rgba(0,0,0,0.18))",
  medium: "drop-shadow(0 4px 10px rgba(0,0,0,0.28))",
  strong: "drop-shadow(0 8px 20px rgba(0,0,0,0.38))",
};

/** 阴影档位 → CSS filter（未知/缺省 → 空串，即无阴影） */
export function decorShadowFilter(value: unknown): string {
  return SHAPE_SHADOWS[str(value) || "none"] ?? "";
}

/** 阴影档位的面板选项（装饰组与形状组共用，避免两处写两份 label） */
export const DECOR_SHADOW_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "无", value: "none" },
  { label: "浅", value: "soft" },
  { label: "中", value: "medium" },
  { label: "深", value: "strong" },
];

/** 渐变方向 → linearGradient 坐标（与 `decoration-gradient` 静态档同一映射） */
export function decorGradientAttrs(direction: string): Record<string, string | number> {
  switch (direction) {
    case "to-left": return { x1: 1, y1: 0, x2: 0, y2: 0 };
    case "to-bottom": return { x1: 0, y1: 0, x2: 0, y2: 1 };
    case "to-top": return { x1: 0, y1: 1, x2: 0, y2: 0 };
    case "to-right-bottom": return { x1: 0, y1: 0, x2: 1, y2: 1 };
    case "to-left-bottom": return { x1: 1, y1: 0, x2: 0, y2: 1 };
    default: return { x1: 0, y1: 0, x2: 1, y2: 0 };
  }
}

/** 渐变方向的面板选项（与上面的坐标映射一一对应） */
export const DECOR_GRADIENT_DIRECTIONS: Array<{ label: string; value: string }> = [
  { label: "向右", value: "to-right" },
  { label: "向左", value: "to-left" },
  { label: "向下", value: "to-bottom" },
  { label: "向上", value: "to-top" },
  { label: "右下对角", value: "to-right-bottom" },
  { label: "左下对角", value: "to-left-bottom" },
  { label: "径向", value: "radial" },
];

export function decorFillOf(
  config: Record<string, unknown>,
  uid: string,
  fallback: string,
): DecorFillResult {
  const plain = str(config.fill) || fallback;
  if (config.gradientEnabled !== true) return { fill: plain, defs: [] };
  const from = str(config.gradientFrom) || plain || "#2196F3";
  const to = str(config.gradientTo) || "#FF9800";
  const direction = str(config.gradientDirection) || "to-right";
  const isRadial = direction === "radial";
  const id = `deco-fill-${uid}`;
  return {
    fill: `url(#${id})`,
    defs: [{
      kind: isRadial ? "radial" : "linear",
      id,
      attrs: isRadial
        ? { cx: "50%", cy: "50%", r: "50%", fx: "50%", fy: "50%" }
        : decorGradientAttrs(direction),
      stops: [{ offset: "0%", color: from }, { offset: "100%", color: to }],
    }],
  };
}

/**
 * 哪些装饰形状支持"渐变填充"：只给**默认就有可见填充**的形状，否则开关拨过去看不见任何变化
 * （圆环/波浪/虚线框默认 fill=none，属"按需填充"，不给渐变开关，避免属性栏出现假能力）。
 */
export const DECOR_GRADIENT_KINDS: ReadonlySet<string> = new Set([
  "decoration-rect",
  "decoration-circle",
  "decoration-ellipse",
  "decoration-triangle",
  "decoration-polygon",
  "decoration-star",
  "decoration-diamond",
  "decoration-cross",
]);

export function decorSupportsGradient(kind: string): boolean {
  return DECOR_GRADIENT_KINDS.has(kind);
}