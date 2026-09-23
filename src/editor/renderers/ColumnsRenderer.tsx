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

interface ColumnConfig {
  type: "fr" | "px" | "auto";
  value: number;
}

/** 解析单栏宽度配置 */
function getColumnConfig(config: Record<string, unknown>, index: number): ColumnConfig {
  const type = (config[`col${index + 1}Type`] as string) || "fr";
  const value = (config[`col${index + 1}Value`] as number) ?? 1;
  return { type: type as "fr" | "px" | "auto", value };
}

/** 构建单栏的 flex/width 样式值 */
function buildColumnStyle(col: ColumnConfig): { flex: string; width?: string } {
  switch (col.type) {
    case "px":
      return { flex: "0 0 auto", width: `${col.value}px` };
    case "auto":
      return { flex: "0 0 auto", width: "auto" };
    case "fr":
    default:
      return { flex: `${col.value} 1 0`, width: "auto" };
  }
}

export function ColumnsRenderer({ config }: ComponentRendererProps) {
  const count = Math.max(1, Math.min(6, (config.count as number) ?? 3));
  const gap = (config.gap as number) ?? 12;
  const alignItems = (config.alignItems as string) || "stretch";

  // —— 栏线 ——
  const showLines = (config.showLines as boolean) ?? true;
  const lineColor = (config.lineColor as string) || "rgba(255,255,255,0.12)";
  const lineStyle = (config.lineStyle as string) || "dashed";
  const lineWidth = (config.lineWidth as number) ?? 1;

  // —— 栏背景 ——
  const showCellBg = (config.showCellBg as boolean) ?? false;
  const cellBg = (config.cellBg as string) || "rgba(255,255,255,0.03)";

  // —— 背景 ——
  const bgEnabled = (config.backgroundEnabled as boolean) ?? false;
  const bgColor = (config.backgroundColor as string) || "rgba(255,255,255,0.02)";
  const bgOpacity = (config.backgroundOpacity as number) ?? 100;

  // —— 边框 ——
  const borderEnabled = (config.borderEnabled as boolean) ?? false;
  const borderColor = (config.borderColor as string) || "rgba(255,255,255,0.1)";
  const borderWidth = (config.borderWidth as number) ?? 1;
  const borderStyle = (config.borderStyle as string) || "solid";

  // —— 外观 ——
  const borderRadius = (config.borderRadius as number) ?? 0;
  const paddingX = (config.paddingX as number) ?? 0;
  const paddingY = (config.paddingY as number) ?? 0;

  // —— 阴影 ——
  const shadowEnabled = (config.shadowEnabled as boolean) ?? false;
  const shadowOffsetX = (config.shadowOffsetX as number) ?? 0;
  const shadowOffsetY = (config.shadowOffsetY as number) ?? 4;
  const shadowBlur = (config.shadowBlur as number) ?? 12;
  const shadowSpread = (config.shadowSpread as number) ?? 0;
  const shadowColor = (config.shadowColor as string) || "rgba(0,0,0,0.3)";

  // —— 溢出 ——
  const overflow = (config.overflow as string) || "hidden";

  const finalBg = bgEnabled ? withAlpha(bgColor, bgOpacity / 100) : "transparent";
  const finalShadow = shadowEnabled
    ? `${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px ${shadowSpread}px ${shadowColor}`
    : "none";

  // 构建每栏
  const columns: React.ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const col = getColumnConfig(config, i);
    const style = buildColumnStyle(col);
    columns.push(
      <Box
        key={i}
        sx={{
          ...style,
          height: "100%",
          boxSizing: "border-box",
          backgroundColor: showCellBg ? cellBg : "transparent",
          border: showLines
            ? `${lineWidth}px ${lineStyle} ${lineColor}`
            : "none",
          borderRadius: 2,
          minWidth: 0,
          minHeight: 0,
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
          display: "flex",
          flexDirection: "row",
          gap: `${gap}px`,
          alignItems,
        }}
      >
        {columns}
      </Box>
    </Box>
  );
}
