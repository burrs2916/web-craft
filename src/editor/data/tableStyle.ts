/**
 * 表格族（表格 / 分页 / 日历 / 描述列表 / 树形控件）的**唯一样式口径** ——
 * 编辑区渲染器与发布端 codegen 共用。
 *
 * 输出形态：**React 风格的 CSS 声明对象**（camelCase 键、值自带单位）。
 * - 编辑区：直接展开进 MUI `sx={{ ...decl }}`；
 * - 发布端：用 `cssText(decl)` 序列化成 `kebab-case:value;` 拼进 `style="…"`。
 * 两端因此读的是同一批字面量，不可能漂移。
 *
 * 圆角口径：表格族的 `borderRadius` 面板值是**像素**（不是表单/媒体族的"倍数"），
 * 两端一律输出 `${n}px`。历史实现里两端都是像素，保持一致，避免无谓的视觉回归。
 */

import type { PaginationModel, TableModel } from "./tableData";
import {
  type CssDecls,
  alignToFlex,
  alignToText,
  bool,
  clampNum,
  str,
} from "./cssDecls";

// 序列化原语与取值小工具统一来自 `./cssDecls`，此处重导出保持既有引用不变
export { type CssDecls, kebab, cssText, styleAttr } from "./cssDecls";

/** 字重面板值 → 数字字重（两端同一张映射表） */
const FONT_WEIGHT_MAP: Record<string, string> = {
  normal: "400",
  medium: "500",
  bold: "600",
  "400": "400",
  "500": "500",
  "600": "600",
  "700": "700",
};

function resolveFontWeight(v: unknown, fallback = "600"): string {
  return FONT_WEIGHT_MAP[String(v ?? "").trim()] ?? fallback;
}

/* ══════════════════════════════════════════════
 * 1. 表格（table）
 * ══════════════════════════════════════════════ */

export type TableDensity = "compact" | "default" | "comfortable";

const DENSITY_PADDING: Record<TableDensity, [number, number]> = {
  compact: [4, 8],
  default: [8, 12],
  comfortable: [12, 16],
};

export interface TableStyle {
  headerBg: string;
  headerColor: string;
  headerFontSize: number;
  headerFontWeight: string;
  headerHeight: number;
  rowColor: string;
  rowFontSize: number;
  rowHeight: number;
  stripeEnabled: boolean;
  stripeColor: string;
  /** 行悬浮背景（空串=不启用） */
  hoverBg: string;
  borderEnabled: boolean;
  borderColor: string;
  borderWidth: number;
  borderStyle: string;
  radius: number;
  align: string;
  overflowX: string;
  overflowY: string;
  stickyHeader: boolean;
  showHeader: boolean;
  emptyText: string;
  emptyColor: string;
  emptyBg: string;
  /** 单元格内边距（纵向 / 横向，px） */
  padY: number;
  padX: number;
  /** 完整边框声明（未启用时为空串） */
  borderCss: string;
  /** 外层容器声明 */
  outer: CssDecls;
  /** 表头单元格声明（含背景/字色/字号/字重/边框/内边距/对齐） */
  th: CssDecls;
  /** 数据单元格声明（含斑马纹，需按行索引生成） */
  td: (rowIndex: number) => CssDecls;
  /** 空态单元格声明 */
  emptyTd: CssDecls;
}

export function resolveTableStyle(c: Record<string, unknown>): TableStyle {
  const density = (["compact", "default", "comfortable"] as const).includes(
    String(c.density ?? "default") as TableDensity,
  )
    ? (String(c.density ?? "default") as TableDensity)
    : "default";

  const borderEnabled = bool(c.borderEnabled, true);
  const borderColor = str(c.borderColor, "rgba(255,255,255,0.12)");
  const borderWidth = clampNum(c.borderWidth, 1, 0, 8);
  const borderStyle = str(c.borderStyle, "solid");
  const radius = clampNum(c.borderRadius, 0, 0, 60);
  const padY = clampNum(c.cellPadY, DENSITY_PADDING[density][0], 0, 40);
  const padX = clampNum(c.cellPadX, DENSITY_PADDING[density][1], 0, 60);
  const borderCss = borderEnabled ? `${borderWidth}px ${borderStyle} ${borderColor}` : "";
  const overflowX = String(c.overflow ?? "scroll") === "hidden" ? "hidden" : "auto";
  const align = alignToText(c.align);

  const headerBg = str(c.headerBgColor, "rgba(255,255,255,0.08)");
  const headerColor = str(c.headerColor, "#ffffff");
  const headerFontSize = clampNum(c.headerFontSize, 13, 8, 32);
  const headerFontWeight = resolveFontWeight(c.headerFontWeight, "600");
  const headerHeight = clampNum(c.headerHeight, 0, 0, 200);
  const rowColor = str(c.rowColor, "rgba(255,255,255,0.75)");
  const rowFontSize = clampNum(c.rowFontSize, 13, 8, 32);
  const rowHeight = clampNum(c.rowHeight, 40, 20, 200);
  const stripeEnabled = bool(c.stripeEnabled, true);
  const stripeColor = str(c.stripeColor, "rgba(255,255,255,0.04)");
  const hoverBg = c.rowHoverEnabled === false ? "" : str(c.rowHoverBg, "rgba(255,255,255,0.06)");

  const thInner: CssDecls = {
    backgroundColor: headerBg,
    color: headerColor,
    fontSize: `${headerFontSize}px`,
    fontWeight: headerFontWeight,
    border: borderCss,
    padding: `${padY}px ${padX}px`,
    textAlign: align,
    whiteSpace: "nowrap",
  };
  if (headerHeight > 0) thInner.height = `${headerHeight}px`;

  const tdInner = (rowIndex: number): CssDecls => {
    const d: CssDecls = {
      color: rowColor,
      fontSize: `${rowFontSize}px`,
      height: `${rowHeight}px`,
      border: borderCss,
      padding: `${padY}px ${padX}px`,
      textAlign: align,
      whiteSpace: "nowrap",
    };
    if (stripeEnabled && rowIndex % 2 === 1) d.backgroundColor = stripeColor;
    return d;
  };

  return {
    headerBg,
    headerColor,
    headerFontSize,
    headerFontWeight,
    headerHeight,
    rowColor,
    rowFontSize,
    rowHeight,
    stripeEnabled,
    stripeColor,
    hoverBg,
    borderEnabled,
    borderColor,
    borderWidth,
    borderStyle,
    radius,
    align,
    overflowX,
    overflowY: "hidden",
    stickyHeader: bool(c.stickyHeader, false),
    showHeader: bool(c.showHeader, true),
    emptyText: str(c.emptyText, "暂无数据"),
    emptyColor: str(c.emptyColor, "rgba(255,255,255,0.35)"),
    emptyBg: str(c.emptyBg, "transparent"),
    padY,
    padX,
    borderCss,
    outer: {
      width: "100%",
      height: "100%",
      overflowX,
      overflowY: "hidden",
      borderRadius: `${radius}px`,
    },
    th: thInner,
    td: tdInner,
    emptyTd: {
      color: str(c.emptyColor, "rgba(255,255,255,0.35)"),
      backgroundColor: str(c.emptyBg, "transparent"),
      fontSize: `${rowFontSize}px`,
      padding: "24px 12px",
      textAlign: "center",
      border: borderCss,
    },
  };
}

/** 表格实际列数（表头与首行取较大者；用于补齐表头空列） */
export function tableColumnCount(model: TableModel): number {
  return model.headers.length || model.rows[0]?.length || 0;
}

/* ══════════════════════════════════════════════
 * 2. 分页（pagination）
 * ══════════════════════════════════════════════ */

export type PaginationShape = "square" | "round";

export interface PaginationStyle {
  btnSize: number;
  fontSize: number;
  radius: number;
  radiusCss: string;
  gap: number;
  themeColor: string;
  textColor: string;
  bgColor: string;
  activeBgColor: string;
  activeTextColor: string;
  borderColor: string;
  borderEnabled: boolean;
  hoverBg: string;
  align: string;
  /** 容器声明（自然尺寸内容在 stage 内按 align 摆放） */
  outer: CssDecls;
  /** 按钮基础声明（不含状态相关属性 —— 状态一律由类规则给） */
  btn: CssDecls;
}

/** 尺寸档位 → 按钮边长/字号（两端同一张表） */
export const PAGINATION_SIZE_MAP: Record<string, { btnSize: number; fontSize: number }> = {
  small: { btnSize: 24, fontSize: 11 },
  medium: { btnSize: 32, fontSize: 13 },
  large: { btnSize: 40, fontSize: 15 },
};

export function resolvePaginationStyle(c: Record<string, unknown>): PaginationStyle {
  const sizeKey = String(c.size ?? "medium");
  const dims = PAGINATION_SIZE_MAP[sizeKey] ?? PAGINATION_SIZE_MAP.medium;
  const shape = String(c.shape ?? "square") === "round" ? "round" : "square";
  const rawRadius = clampNum(c.borderRadius, 4, 0, 40);
  const radius = shape === "round" ? Math.round(dims.btnSize / 2) : rawRadius;

  const themeColor = str(c.color, "#2196F3");
  const textColor = str(c.textColor, "rgba(255,255,255,0.65)");
  const bgColor = str(c.bgColor, "transparent");
  const activeBgColor = str(c.activeBgColor, themeColor);
  const activeTextColor = str(c.activeTextColor, "#ffffff");
  const borderColor = str(c.borderColor, "rgba(255,255,255,0.12)");
  const borderEnabled = bool(c.borderEnabled, true);
  const hoverBg = str(c.hoverBgColor, "rgba(255,255,255,0.08)");

  return {
    btnSize: dims.btnSize,
    fontSize: dims.fontSize,
    radius,
    radiusCss: `${radius}px`,
    gap: clampNum(c.gap, 4, 0, 32),
    themeColor,
    textColor,
    bgColor,
    activeBgColor,
    activeTextColor,
    borderColor,
    borderEnabled,
    hoverBg,
    align: String(c.align ?? "center"),
    outer: {
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: alignToFlex(c.align ?? "center"),
      minWidth: "0",
      minHeight: "0",
    },
    // 注意：颜色/背景/字重等"会随状态变化的属性"一律不写进基础声明，
    // 由 `.pg-item` / `.pg-item.is-active` / `.pg-item:hover` 类规则承载。
    btn: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: `${dims.btnSize}px`,
      height: `${dims.btnSize}px`,
      borderRadius: `${radius}px`,
      fontSize: `${dims.fontSize}px`,
      userSelect: "none",
      flexShrink: "0",
    },
  };
}

/** 分页缩放基准：设计尺寸 400×40（与注册表 defaultSize 一致） */
export const PAGINATION_FIT = { refW: 400, refH: 40, min: 0.5, max: 3 };

/** 分页展示文案（两端同一份，避免"共 N 条"措辞漂移） */
export function paginationTexts(m: PaginationModel, showTotal: boolean, showPageSize: boolean) {
  return {
    totalLabel: showTotal ? `共 ${m.total} 条` : "",
    pageSizeLabel: showPageSize ? `${m.pageSize} 条/页` : "",
  };
}

/* ══════════════════════════════════════════════
 * 3. 日历（calendar）
 * ══════════════════════════════════════════════ */

export interface CalendarStyle {
  headerColor: string;
  headerBg: string;
  weekdayColor: string;
  dayColor: string;
  weekendColor: string;
  selectedBg: string;
  selectedText: string;
  todayBorderColor: string;
  todayBg: string;
  markDotColor: string;
  gridLineColor: string;
  fontSize: number;
  headerFontSize: number;
  weekdayFontSize: number;
  cellHeight: number;
  radius: number;
  fillHeight: boolean;
  showWeekend: boolean;
  showGridLines: boolean;
  showToday: boolean;
}

/** 单元格尺寸档位 → 行高（两端同一张表） */
export const CALENDAR_CELL_MAP: Record<string, number> = { small: 28, medium: 34, large: 42 };

export function resolveCalendarStyle(c: Record<string, unknown>): CalendarStyle {
  const cellSize = String(c.cellSize ?? "medium");
  const custom = clampNum(c.customCellSize, 0, 0, 120);
  const fontSize = clampNum(c.fontSize, 13, 8, 28);
  return {
    headerColor: str(c.headerColor, "#ffffff"),
    headerBg: str(c.headerBgColor, "rgba(255,255,255,0.08)"),
    weekdayColor: str(c.weekdayColor, str(c.headerColor, "#ffffff")),
    dayColor: str(c.dayColor, "rgba(255,255,255,0.75)"),
    weekendColor: str(c.weekendColor, "rgba(255,255,255,0.45)"),
    selectedBg: str(c.selectedBgColor, "#2196F3"),
    selectedText: str(c.selectedTextColor, "#ffffff"),
    todayBorderColor: str(c.todayBorderColor, "#FF9800"),
    todayBg: str(c.todayBgColor, "transparent"),
    markDotColor: str(c.markColor, "#FF9800"),
    gridLineColor: str(c.gridLineColor, "rgba(255,255,255,0.04)"),
    fontSize,
    headerFontSize: clampNum(c.headerFontSize, 14, 8, 32),
    weekdayFontSize: clampNum(c.weekdayFontSize, Math.max(8, fontSize - 1), 8, 28),
    cellHeight: custom || CALENDAR_CELL_MAP[cellSize] || CALENDAR_CELL_MAP.medium,
    radius: clampNum(c.borderRadius, 6, 0, 40),
    fillHeight: bool(c.fillHeight, true),
    showWeekend: bool(c.showWeekend, true),
    showGridLines: bool(c.showGridLines, true),
    showToday: bool(c.showTodayHighlight, true),
  };
}

/* ══════════════════════════════════════════════
 * 4. 描述列表（descriptions）
 * ══════════════════════════════════════════════ */

export interface DescriptionsStyle {
  labelBg: string;
  labelColor: string;
  labelFontWeight: number;
  valueColor: string;
  borderColor: string;
  borderEnabled: boolean;
  fontSize: number;
  titleColor: string;
  titleFontSize: number;
  radius: number;
  gap: number;
  columns: number;
  layout: "horizontal" | "vertical";
  labelWidth: number;
  labelAlign: string;
  valueAlign: string;
  striped: boolean;
  /** 网格/单元格完整边框声明 */
  borderCss: string;
}

export function resolveDescriptionsStyle(c: Record<string, unknown>): DescriptionsStyle {
  const borderEnabled = bool(c.border, true);
  const borderColor = str(c.borderColor, "rgba(255,255,255,0.1)");
  const fontSize = clampNum(c.fontSize, 13, 8, 28);
  return {
    labelBg: str(c.labelBgColor, "rgba(255,255,255,0.06)"),
    labelColor: str(c.labelColor, "rgba(255,255,255,0.5)"),
    labelFontWeight: clampNum(c.labelFontWeight, 500, 100, 900),
    valueColor: str(c.valueColor, "rgba(255,255,255,0.85)"),
    borderColor,
    borderEnabled,
    fontSize,
    titleColor: str(c.titleColor, "rgba(255,255,255,0.9)"),
    titleFontSize: clampNum(c.titleFontSize, fontSize + 2, 8, 40),
    radius: clampNum(c.borderRadius, 4, 0, 40),
    gap: clampNum(c.gap, 0, 0, 32),
    columns: clampNum(c.columns, 2, 1, 6),
    layout: String(c.layout ?? "horizontal") === "vertical" ? "vertical" : "horizontal",
    labelWidth: clampNum(c.labelWidth, 0, 0, 400),
    labelAlign: alignToText(c.labelAlign ?? "left"),
    valueAlign: alignToText(c.valueAlign ?? "left"),
    striped: bool(c.striped, false),
    borderCss: borderEnabled ? `1px solid ${borderColor}` : "",
  };
}

/* ══════════════════════════════════════════════
 * 5. 树形控件（tree）
 * ══════════════════════════════════════════════ */

type TreeStyle = {
  textColor: string;
  activeColor: string;
  activeBg: string;
  hoverBg: string;
  iconColor: string;
  leafIconColor: string;
  fontSize: number;
  gap: number;
  indent: number;
  rowHeight: number;
  radius: number;
  showLine: boolean;
  lineColor: string;
  showIcon: boolean;
  emptyText: string;
  disabled: boolean;
  /** 容器声明（超出滚动） */
  outer: CssDecls;
};

export type { TreeStyle };

export function resolveTreeStyle(c: Record<string, unknown>): TreeStyle {
  const activeColor = str(c.activeColor, "#2196F3");
  const fontSize = clampNum(c.fontSize, 13, 8, 28);
  return {
    textColor: str(c.textColor, "rgba(255,255,255,0.75)"),
    activeColor,
    activeBg: str(c.activeBgColor, `${activeColor}22`),
    hoverBg: str(c.hoverBgColor, "rgba(255,255,255,0.06)"),
    iconColor: str(c.iconColor, "rgba(255,255,255,0.4)"),
    leafIconColor: str(c.leafIconColor, "rgba(255,255,255,0.25)"),
    fontSize,
    gap: clampNum(c.gap, 2, 0, 24),
    indent: clampNum(c.indent, 18, 8, 60),
    rowHeight: clampNum(c.rowHeight, 0, 0, 80),
    radius: clampNum(c.borderRadius, 3, 0, 24),
    showLine: bool(c.showLine, false),
    lineColor: str(c.lineColor, "rgba(255,255,255,0.12)"),
    showIcon: bool(c.showIcon, true),
    emptyText: str(c.emptyText, "暂无数据"),
    disabled: bool(c.disabled, false),
    outer: {
      width: "100%",
      height: "100%",
      overflowX: "hidden",
      overflowY: "auto",
      padding: "4px",
    },
  };
}
