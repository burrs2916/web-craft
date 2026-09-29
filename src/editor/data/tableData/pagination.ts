/**
 * 分页与虚拟滚动：分页模型、虚拟区间、冻结列与滚动配置。
 * 从 tableData.ts 迁出，仅做代码搬迁。
 */
import { num, posInt } from './util';

export interface PaginationModel {
  /** 归一后的当前页（已夹在 [1, totalPages]） */
  current: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** 展示项：页码数字，或 "…" 省略标记 */
  pageItems: (number | "ellipsis")[];
  /** 上一页/下一页是否可用 */
  canPrev: boolean;
  canNext: boolean;
}

/** 每页条数候选（面板"显示每页条数"与运行时下拉共用同一份） */

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

/**
 * 分页模型的唯一算法。两端（编辑区渲染器 / 发布端脚本）都必须调用本函数，
 * 避免"画布显示的页码与发布后不同"。
 * 页码范围规则：
 *   - 总页数 ≤ maxButtons → 全部平铺
 *   - 否则以当前页为中心取 maxButtons 个，并在需要时首尾补第 1 页 / 末页与省略号
 */

export function buildPaginationModel(input: {
  current?: unknown;
  pageSize?: unknown;
  total?: unknown;
  maxButtons?: unknown;
}): PaginationModel {
  const pageSize = posInt(input.pageSize, 10);
  const total = Math.max(0, Math.floor(num(input.total, 0)));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(totalPages, Math.max(1, Math.floor(num(input.current, 1))));
  const maxButtons = Math.min(9, Math.max(3, Math.floor(num(input.maxButtons, 5))));

  const pageItems: (number | "ellipsis")[] = [];
  if (totalPages <= maxButtons) {
    for (let i = 1; i <= totalPages; i++) pageItems.push(i);
  } else {
    const half = Math.floor(maxButtons / 2);
    let start = Math.max(1, current - half);
    const end = Math.min(totalPages, start + maxButtons - 1);
    if (end - start < maxButtons - 1) start = Math.max(1, end - maxButtons + 1);

    if (start > 1) {
      pageItems.push(1);
      if (start > 2) pageItems.push("ellipsis");
    }
    for (let i = start; i <= end; i++) pageItems.push(i);
    if (end < totalPages) {
      if (end < totalPages - 1) pageItems.push("ellipsis");
      pageItems.push(totalPages);
    }
  }

  return {
    current,
    pageSize,
    total,
    totalPages,
    pageItems,
    canPrev: current > 1,
    canNext: current < totalPages,
  };
}

/**
 * 从接口响应推导分页信息（"总数由接口给出"是分页最常见的动态接入方式）。
 * 支持 `{total}` / `{totalCount}` / `{count}` / `{data:{total}}` / 直接给出数组（取长度）。
 * 无法识别时返回 null，调用方回退到面板静态 total。
 */

export function normalizePaginationTotal(data: unknown): number | null {
  if (data == null) return null;
  if (Array.isArray(data)) return data.length;
  if (typeof data === "number" && Number.isFinite(data)) return Math.max(0, Math.floor(data));
  if (typeof data === "object") {
    const rec = data as Record<string, unknown>;
    for (const k of ["total", "totalCount", "totalElements", "count"]) {
      const v = rec[k];
      if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.floor(v));
    }
  }
  return null;
}

/* ══════════════════════════════════════════════
 * 5.5 虚拟滚动（P4：大数据量渲染优化）
 * ────────────────────────────────────────────
 * 表格族「虚拟滚动」的唯一算法：给定滚动容器的可视高度与固定行高，
 * 计算应当真实渲染的行窗口 [start, end)。编辑区 React 渲染器与发布端
 * 运行时脚本必须调用同一函数，保证画布与发布后的窗口计算结果一致。
 * 窗口之外的区域用占位行撑起总高度，滚动条比例与首行定位由此得到保持。
 * ══════════════════════════════════════════════ */

/** 可视区上下各额外渲染的行数（缓冲，避免快速滚动露白） */

export const VIRTUAL_OVERSCAN = 6;

/** 虚拟滚动窗口范围 */

export interface VirtualRange {
  start: number;
  end: number;
}

/**
 * 计算虚拟滚动窗口。
 * 输入全为 unknown（发布端运行时来自 DOM 数值），统一做数值兜底，
 * 与分页模型 `buildPaginationModel` 的防御风格保持一致。
 */

export function computeVirtualRange(input: {
  scrollTop?: unknown;
  viewportHeight?: unknown;
  rowHeight?: unknown;
  total?: unknown;
  overscan?: unknown;
}): VirtualRange {
  // 数值兜底自包含：本函数会被 codegen 以 `toString()` 内联进发布端运行时脚本，
  // 因此不依赖模块级 `num`，保证编辑区与发布端调用的是同一份实现（消除双份字面量漂移）。
  const num = (v: unknown, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const total = Math.max(0, Math.floor(num(input.total, 0)));
  const viewportHeight = Math.max(0, Math.floor(num(input.viewportHeight, 0)));
  const rowHeight = Math.max(1, Math.floor(num(input.rowHeight, 40)));
  const overscan = Math.max(0, Math.floor(num(input.overscan, VIRTUAL_OVERSCAN)));

  // 无数据或容器不可见 → 空窗口
  if (total === 0 || viewportHeight === 0) return { start: 0, end: 0 };

  const scrollTop = Math.max(0, Math.floor(num(input.scrollTop, 0)));
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
  const firstVisible = Math.floor(scrollTop / rowHeight);
  const start = Math.min(total, Math.max(0, firstVisible - overscan));
  // 滚动超界时保证窗口不悬空：至少包含一行（与发布端运行时同构夹紧）
  const end = Math.min(total, Math.max(start + visibleCount, start + 1));
  return { start, end };
}

/**
 * 冻结列运行时（P2）：把表格前 N 列设为 position:sticky 并回填不透明背景。
 * 自包含（无反引号/`${`、不引用模块级标识符），可被 codegen 以 `toString()` 内联进
 * 发布端运行时；编辑区在 useLayoutEffect 中直接调用同一函数，两端严格同源。
 *
 * 背景回填：表格本身透明（s.outer 无背景），冻结单元若保持透明，横向滚动时下层内容
 * 会透出。向上遍历祖先取首个非透明背景回填，任意主题/背景下都正确；
 * sticky left 偏移按冻结单元实测 offsetWidth 累加，兼容任意列宽单位（px/%/fr/auto）。
 */

export function applyFrozenColumns(root: HTMLElement | null, frozenCount: number, stickyHeader: boolean): void {
  if (!root || frozenCount <= 0) return;
  const tables = root.querySelectorAll("table");
  for (let t = 0; t < tables.length; t++) {
    const table = tables[t];
    let bg = "";
    let n = table as HTMLElement | null;
    while (n && n.nodeType === 1) {
      let cb = "";
      try { cb = getComputedStyle(n).backgroundColor; } catch (e) { cb = ""; }
      if (cb && cb !== "rgba(0, 0, 0, 0)" && cb !== "transparent" && cb !== "") { bg = cb; break; }
      n = n.parentElement;
    }
    if (!bg) bg = "rgba(30,30,46,1)";
    const rows = table.querySelectorAll("tr");
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const isHead = !!(row.parentElement && row.parentElement.tagName === "THEAD");
      const cells = row.children;
      let localCum = 0;
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i] as HTMLElement;
        const ciAttr = cell.getAttribute("data-col-index");
        if (ciAttr == null) continue;
        const ci = parseInt(ciAttr, 10);
        if (ci < frozenCount) {
          let cbg = "";
          try { cbg = getComputedStyle(cell).backgroundColor; } catch (e) { cbg = ""; }
          if (cbg === "rgba(0, 0, 0, 0)" || cbg === "transparent" || cbg === "") cbg = bg;
          cell.style.backgroundColor = cbg;
          cell.style.position = "sticky";
          cell.style.left = localCum + "px";
          cell.style.zIndex = isHead ? "4" : "3";
          if (isHead && stickyHeader) cell.style.top = "0";
          localCum += cell.offsetWidth;
        }
      }
    }
  }
}

/**
 * 行展开详情内容口径（P2-2）：把行对象详情字段的值归一为多行纯文本。
 * 对象 → 「key: value」行（跳过 null/嵌套对象）；字符串/数字/布尔 → String；
 * 数组 → JSON 文本。空值（null/undefined/空串）返回空串（调用方据此不渲染箭头）。
 * 自包含（无反引号/`${`、不引用模块级标识符），可被 codegen 以 `toString()` 内联；
 * 编辑区直接 import 调用，两端严格同源。调用方负责 HTML 转义。
 */

export function renderRowDetail(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "object") {
    if (Array.isArray(v)) return JSON.stringify(v);
    const lines: string[] = [];
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const val = obj[k];
      if (val == null || typeof val === "object") continue;
      lines.push(k + ": " + String(val));
    }
    return lines.join("\n");
  }
  return String(v);
}

/**
 * 读取组件的虚拟滚动配置（编辑端/发布端同口径）。
 * - 是否启用：`virtualScroll === true`
 * - 滚动容器高度：`virtualScrollHeight`（非法或未配置时回落默认 360px）
 */

export function readVirtualScroll(config: Record<string, unknown>): {
  enabled: boolean;
  viewportHeight: number;
} {
  return {
    enabled: config.virtualScroll === true,
    viewportHeight: Math.max(120, Math.floor(num(config.virtualScrollHeight, 360))),
  };
}

/** 列宽拖拽是否启用（编辑端/发布端同口径） */

export function readColumnResize(config: Record<string, unknown>): boolean {
  return config.resizableColumns === true;
}

/* ══════════════════════════════════════════════
 * 4.5 单元格编辑（多维第一档）
 * ────────────────────────────────────────────
 * 表格「双击编辑 + 字段类型 + 写回」的唯一口径。编辑区 React 渲染器与
 * 发布端运行时脚本共用同一份取值/解析/渲染函数（codegen 以 toString() 内联），
 * 保证"画布上编辑成什么值"与"发布后提交什么值"严格一致。
 * ══════════════════════════════════════════════ */

/** 可编辑的列类型集合（status/link/image 展示态特殊，第一档不开放编辑） */
