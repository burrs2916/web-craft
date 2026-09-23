import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";

/** 将颜色转为指定透明度的 rgba */
function withAlpha(color: string, alpha: number): string {
  if (color.startsWith("rgba(")) {
    return color.replace(/rgba\(\s*([^,]+,\s*[^,]+,\s*[^,]+)\s*,\s*[\d.]+\s*\)/, `rgba($1, ${alpha})`);
  }
  if (color.startsWith("rgb(")) {
    return color.replace(/rgb\(\s*([^)]+)\s*\)/, `rgba($1, ${alpha})`);
  }
  if (color.startsWith("#")) {
    let hex = color.slice(1);
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  return color;
}

/** 构建 grid-template-columns 字符串 */
function buildColumnsTemplate(config: Record<string, unknown>): string {
  const mode = (config.columnMode as string) || "equal";
  const count = (config.columns as number) ?? 3;
  const width = (config.columnWidth as number) ?? 120;
  const minWidth = (config.columnMinWidth as number) ?? 100;

  switch (mode) {
    case "fixed":
      return `repeat(${count}, ${width}px)`;
    case "auto-fill":
      return `repeat(auto-fill, minmax(${minWidth}px, 1fr))`;
    case "auto-fit":
      return `repeat(auto-fit, minmax(${minWidth}px, 1fr))`;
    case "equal":
    default:
      return `repeat(${count}, 1fr)`;
  }
}

/** 构建 grid-template-rows 字符串 */
function buildRowsTemplate(config: Record<string, unknown>): string {
  const mode = (config.rowMode as string) || "equal";
  const count = (config.rows as number) ?? 2;
  const height = (config.rowHeight as number) ?? 80;

  switch (mode) {
    case "fixed":
      return `repeat(${count}, ${height}px)`;
    case "auto":
      return `repeat(${count}, auto)`;
    case "equal":
    default:
      return `repeat(${count}, 1fr)`;
  }
}

export function GridRenderer({ config }: ComponentRendererProps) {
  // —— 列 / 行 ——
  const columnMode = (config.columnMode as string) || "equal";
  const columns = (config.columns as number) ?? 3;
  const rows = (config.rows as number) ?? 2;
  const columnGap = (config.columnGap as number) ?? 8;
  const rowGap = (config.rowGap as number) ?? 8;

  // —— 对齐 ——
  const justifyItems = (config.justifyItems as string) || "stretch";
  const alignItems = (config.alignItems as string) || "stretch";
  const justifyContent = (config.justifyContent as string) || "start";
  const alignContent = (config.alignContent as string) || "start";

  // —— 内边距 ——
  const paddingX = (config.paddingX as number) ?? 0;
  const paddingY = (config.paddingY as number) ?? 0;

  // —— 背景 ——
  const bgEnabled = (config.backgroundEnabled as boolean) ?? false;
  const bgColor = (config.backgroundColor as string) || "rgba(255,255,255,0.03)";
  const bgOpacity = (config.backgroundOpacity as number) ?? 100;

  // —— 边框 ——
  const borderEnabled = (config.borderEnabled as boolean) ?? false;
  const borderColor = (config.borderColor as string) || "rgba(255,255,255,0.1)";
  const borderWidth = (config.borderWidth as number) ?? 1;
  const borderStyle = (config.borderStyle as string) || "solid";

  // —— 圆角 ——
  const borderRadius = (config.borderRadius as number) ?? 0;

  // —— 阴影 ——
  const shadowEnabled = (config.shadowEnabled as boolean) ?? false;
  const shadowOffsetX = (config.shadowOffsetX as number) ?? 0;
  const shadowOffsetY = (config.shadowOffsetY as number) ?? 4;
  const shadowBlur = (config.shadowBlur as number) ?? 12;
  const shadowSpread = (config.shadowSpread as number) ?? 0;
  const shadowColor = (config.shadowColor as string) || "rgba(0,0,0,0.3)";

  // —— 溢出 ——
  const overflow = (config.overflow as string) || "hidden";

  // —— 网格线（编辑辅助）——
  const showLines = (config.showLines as boolean) ?? true;
  const lineColor = (config.lineColor as string) || "rgba(255,255,255,0.15)";
  const lineStyle = (config.lineStyle as string) || "dashed";
  const lineWidth = (config.lineWidth as number) ?? 1;

  // —— 单元格背景 ——
  const showCellBg = (config.showCellBg as boolean) ?? false;
  const cellBg = (config.cellBg as string) || "rgba(255,255,255,0.02)";

  const finalBg = bgEnabled ? withAlpha(bgColor, bgOpacity / 100) : "transparent";
  const finalShadow = shadowEnabled
    ? `${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px ${shadowSpread}px ${shadowColor}`
    : "none";

  const gridTemplateColumns = buildColumnsTemplate(config);
  const gridTemplateRows = buildRowsTemplate(config);

  // 生成单元格（仅用于可视化展示网格结构）
  const cellCount = columnMode === "auto-fill" || columnMode === "auto-fit"
    ? Math.max(columns, 1) * Math.max(rows, 1)
    : columns * rows;

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < cellCount; i++) {
    cells.push(
      <Box
        key={i}
        sx={{
          backgroundColor: showCellBg ? cellBg : "transparent",
          border: showLines
            ? `${lineWidth}px ${lineStyle} ${lineColor}`
            : "none",
          borderRadius: 2,
          minHeight: 0,
          minWidth: 0,
        }}
      />
    );
  }

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        backgroundColor: finalBg,
        border: borderEnabled
          ? `${borderWidth}px ${borderStyle} ${borderColor}`
          : "none",
        borderRadius: `${borderRadius}px`,
        boxShadow: finalShadow,
        overflow,
        padding: `${paddingY}px ${paddingX}px`,
      }}
    >
      <Box
        sx={{
          width: "100%",
          height: "100%",
          display: "grid",
          gridTemplateColumns,
          gridTemplateRows,
          columnGap: `${columnGap}px`,
          rowGap: `${rowGap}px`,
          justifyItems,
          alignItems,
          justifyContent,
          alignContent,
        }}
      >
        {cells}
      </Box>
    </Box>
  );
}
