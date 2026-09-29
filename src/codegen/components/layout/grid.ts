import type { ComponentCodegenFn } from "../../types";
import { generateChildHTML } from "../../engine";
import { applyOpacity } from "./shared";

/**
 * grid 组件 → HTML
 * 配置：columnMode/columns/columnWidth/columnMinWidth,
 *       rowMode/rows/rowHeight,
 *       columnGap/rowGap,
 *       justifyItems/alignItems/justifyContent/alignContent,
 *       showLines/lineColor/lineStyle/lineWidth,
 *       showCellBg/cellBg,
 *       backgroundEnabled/backgroundColor/backgroundOpacity,
 *       borderEnabled/borderColor/borderWidth/borderStyle,
 *       borderRadius, paddingX/paddingY,
 *       shadowEnabled/shadowOffsetX/shadowOffsetY/shadowBlur/shadowSpread/shadowColor,
 *       overflow
 */
export const gridCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;

  // —— 列模板 ——
  const columnMode = c.columnMode ?? "equal";
  const columns = c.columns ?? 3;
  const columnWidth = c.columnWidth ?? 120;
  const columnMinWidth = c.columnMinWidth ?? 100;
  let gridTemplateColumns: string;
  switch (columnMode) {
    case "fixed":
      gridTemplateColumns = `repeat(${columns}, ${columnWidth}px)`;
      break;
    case "auto-fill":
      gridTemplateColumns = `repeat(auto-fill, minmax(${columnMinWidth}px, 1fr))`;
      break;
    case "auto-fit":
      gridTemplateColumns = `repeat(auto-fit, minmax(${columnMinWidth}px, 1fr))`;
      break;
    case "equal":
    default:
      gridTemplateColumns = `repeat(${columns}, 1fr)`;
  }

  // —— 行模板 ——
  const rowMode = c.rowMode ?? "equal";
  const rows = c.rows ?? 2;
  const rowHeight = c.rowHeight ?? 80;
  let gridTemplateRows: string;
  switch (rowMode) {
    case "fixed":
      gridTemplateRows = `repeat(${rows}, ${rowHeight}px)`;
      break;
    case "auto":
      gridTemplateRows = `repeat(${rows}, auto)`;
      break;
    case "equal":
    default:
      gridTemplateRows = `repeat(${rows}, 1fr)`;
  }

  // —— 单元格数量 ——
  const colCount = (columnMode === "auto-fill" || columnMode === "auto-fit")
    ? Math.max(Number(columns), 1)
    : Number(columns);
  const rowCount = (rowMode === "auto")
    ? Math.max(Number(rows), 1)
    : Number(rows);
  const cellCount = colCount * rowCount;

  // —— 外层样式 ——
  const outerStyles: string[] = [
    "width: 100%",
    "height: 100%",
    "box-sizing: border-box",
    "display: grid",
    `grid-template-columns: ${gridTemplateColumns}`,
    `grid-template-rows: ${gridTemplateRows}`,
    `column-gap: ${c.columnGap ?? 8}px`,
    `row-gap: ${c.rowGap ?? 8}px`,
    `justify-items: ${c.justifyItems ?? "stretch"}`,
    `align-items: ${c.alignItems ?? "stretch"}`,
    `justify-content: ${c.justifyContent ?? "start"}`,
    `align-content: ${c.alignContent ?? "start"}`,
  ];

  // 背景
  if (c.backgroundEnabled) {
    outerStyles.push(`background: ${applyOpacity(String(c.backgroundColor ?? "rgba(255,255,255,0.03)"), Number(c.backgroundOpacity ?? 100))}`);
  }

  // 边框
  if (c.borderEnabled) {
    outerStyles.push(`border: ${c.borderWidth ?? 1}px ${c.borderStyle ?? "solid"} ${c.borderColor ?? "rgba(255,255,255,0.1)"}`);
  }

  // 圆角
  if (c.borderRadius !== undefined) {
    outerStyles.push(`border-radius: ${c.borderRadius}px`);
  }

  // 内边距
  if (c.paddingX !== undefined || c.paddingY !== undefined) {
    const py = c.paddingY ?? 0;
    const px = c.paddingX ?? 0;
    outerStyles.push(`padding: ${py}px ${px}px`);
  }

  // 阴影
  if (c.shadowEnabled) {
    const sx = c.shadowOffsetX ?? 0;
    const sy = c.shadowOffsetY ?? 4;
    const blur = c.shadowBlur ?? 12;
    const spread = c.shadowSpread ?? 0;
    const color = c.shadowColor ?? "rgba(0,0,0,0.3)";
    outerStyles.push(`box-shadow: ${sx}px ${sy}px ${blur}px ${spread}px ${color}`);
  }

  // 溢出
  outerStyles.push(`overflow: ${c.overflow ?? "hidden"}`);

  // —— 单元格 ——
  const showLines = c.showLines ?? true;
  const lineColor = c.lineColor ?? "rgba(255,255,255,0.15)";
  const lineStyle = c.lineStyle ?? "dashed";
  const lineWidth = c.lineWidth ?? 1;
  const showCellBg = c.showCellBg ?? false;
  const cellBg = c.cellBg ?? "rgba(255,255,255,0.02)";

  const cellStyles: string[] = ["min-height: 0", "min-width: 0"];
  if (showCellBg) {
    cellStyles.push(`background: ${cellBg}`);
  }
  if (showLines) {
    cellStyles.push(`border: ${lineWidth}px ${lineStyle} ${lineColor}`);
    cellStyles.push("border-radius: 2px");
  }
  const cellStyleStr = cellStyles.join("; ");

  const children = ctx.childrenByParent?.get(component.id) ?? [];

  let html = `<div style="${outerStyles.join("; ")}${children.length > 0 ? "; position: relative" : ""}">`;
  for (let i = 0; i < cellCount; i++) {
    html += `<div style="${cellStyleStr}"></div>`;
  }
  // 渲染嵌入的子组件（绝对定位，相对此容器）
  for (const child of children) {
    html += generateChildHTML(child, ctx);
  }
  html += `</div>`;
  return html;
};

