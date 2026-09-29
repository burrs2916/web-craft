/**
 * 通用数值小工具（与 fieldStyle / mediaStyle 同一套取值习惯）。
 * 从 tableData.ts 迁出，仅做代码搬迁。
 */

export function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function posInt(v: unknown, fallback: number): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/* ══════════════════════════════════════════════
 * 1. 表格（table）
 * ══════════════════════════════════════════════ */

/**
 * 列定义模型 —— 表格的核心元数据，替代旧式的逗号分隔 headers。
 * 支持从接口数据自动推断，也支持面板手动配置。
 */
