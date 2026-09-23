/**
 * 金色卷草花纹边框 — 路径数据
 *
 * 参考自 vectorstock_51337396.svg
 * 原始 SVG viewBox: 0 0 2500 1290
 *
 * 布局结构（对角线 L 形对称）：
 * - 右上角：卷草主花纹 + L 形饰带（顶边 + 左边）
 * - 左下角：卷草主花纹 + L 形饰带（右边 + 下边）
 * - 左上角、右下角：留白（参考 SVG 设计）
 *
 * 路径数据通过 Python 脚本从原始 SVG 提取，包含累计 transform，
 * 所有坐标均为 viewBox 绝对坐标。
 */

import paths from "./ornamentalDiamondPaths.json";

export const DIAMOND_VW = paths.viewBox.w;
export const DIAMOND_VH = paths.viewBox.h;

// ==================== 右上角（TR）卷草 ====================

/** 右上角花纹组的累计偏移（用于子组定位） */
export const TR_TX = paths.tr.tx;
export const TR_TY = paths.tr.ty;

/** 右上角 9 条主花纹路径（绝对坐标） */
export const TR_PATHS: string[] = paths.tr.data.paths;

/** 右上角独立圆点（绝对坐标） */
export const TR_DOTS: Array<{
  type: "circle" | "ellipse";
  cx: number;
  cy: number;
  r?: number;
  rx?: number;
  ry?: number;
  transform?: string;
}> = [
  ...paths.tr.data.circles.map((c) => ({ type: "circle" as const, ...c })),
  ...paths.tr.data.ellipses.map((e: { cx: number; cy: number; rx: number; ry: number; transform?: string }) => ({ type: "ellipse" as const, ...e })),
];

/** 右上角子组：每个子组是独立坐标系下的花纹块（绝对偏移） */
export const TR_SUBGROUPS: Array<{
  tx: number;
  ty: number;
  paths: string[];
  dots: Array<{
    type: "circle" | "ellipse";
    cx: number;
    cy: number;
    r?: number;
    rx?: number;
    ry?: number;
    transform?: string;
  }>;
}> = paths.tr.data.subgroups.map((g) => ({
  tx: 0, // 由 extract 脚本中已统一为绝对坐标，无需额外偏移
  ty: 0,
  paths: g.paths,
  dots: [
    ...g.circles.map((c) => ({ type: "circle" as const, ...c })),
    ...g.ellipses.map((e: { cx: number; cy: number; rx: number; ry: number; transform?: string }) => ({ type: "ellipse" as const, ...e })),
  ],
}));

// ==================== 左下角（BL）卷草 ====================

export const BL_TX = paths.bl.tx;
export const BL_TY = paths.bl.ty;

export const BL_PATHS: string[] = paths.bl.data.paths;

export const BL_DOTS: Array<{
  type: "circle" | "ellipse";
  cx: number;
  cy: number;
  r?: number;
  rx?: number;
  ry?: number;
  transform?: string;
}> = [
  ...paths.bl.data.circles.map((c) => ({ type: "circle" as const, ...c })),
  ...paths.bl.data.ellipses.map((e: { cx: number; cy: number; rx: number; ry: number; transform?: string }) => ({ type: "ellipse" as const, ...e })),
];

export const BL_SUBGROUPS: Array<{
  tx: number;
  ty: number;
  paths: string[];
  dots: Array<{
    type: "circle" | "ellipse";
    cx: number;
    cy: number;
    r?: number;
    rx?: number;
    ry?: number;
    transform?: string;
  }>;
}> = paths.bl.data.subgroups.map((g) => ({
  tx: 0,
  ty: 0,
  paths: g.paths,
  dots: [
    ...g.circles.map((c) => ({ type: "circle" as const, ...c })),
    ...g.ellipses.map((e: { cx: number; cy: number; rx: number; ry: number; transform?: string }) => ({ type: "ellipse" as const, ...e })),
  ],
}));

// ==================== L 形饰带 ====================

/**
 * 顶部 L 形饰带（顶边 + 左边，包裹 TR 卷草）
 * 索引 0 = outer 外圈，索引 1 = inner 内圈
 */
export const TOP_STRIP_OUTER = paths.tr_strips[0];
export const TOP_STRIP_INNER = paths.tr_strips[1];

/**
 * 底部 L 形饰带（右边 + 下边，包裹 BL 卷草）
 * 索引 0 = outer 外圈，索引 1 = inner 内圈
 */
export const BOTTOM_STRIP_OUTER = paths.bl_strips[0];
export const BOTTOM_STRIP_INNER = paths.bl_strips[1];

/**
 * 兼容旧 API — 通过 group 偏移生成饰带 polygon
 * （保留与旧版本的接口一致，新代码请直接使用 TOP_STRIP_* / BOTTOM_STRIP_*）
 */
export const STRIP_TX = 0;
export const STRIP_TY = 0;
export const BOTTOM_STRIP_TX = 0;
export const BOTTOM_STRIP_TY = 0;
