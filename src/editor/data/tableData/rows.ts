/**
 * 表格模型与行操作：表头、筛选、排序、分页、选择、取值与格式化。
 * 从 tableData.ts 迁出，仅做代码搬迁。
 */
import { headersToColumnDefs, inferColumnDefs, parseColumnDefs, visibleColumnDefs } from './columns';
import type { ColumnDef } from './columns';

export type TableRow = Record<string, unknown>;

export interface TableModel {
  /** 列定义（新版核心；优先使用） */
  columns?: ColumnDef[];
  /** 旧版表头（向后兼容，columns 缺失时降级使用） */
  headers?: string[];
  /** 新版数据行：对象数组 */
  data?: TableRow[];
  /** 旧版行数据：二维字符串数组（向后兼容） */
  rows?: string[][];
}

/** 过滤不可见列（列显隐切换统一口径：拿到的列一定是要渲染/导出的） */

export const MAX_TABLE_ROWS = 10000;

/** 列定义优先的列标题列表 */

export type SortOrder = "asc" | "desc" | "none";

/** 搜索过滤：按关键词匹配任意列（忽略大小写，布尔/数值/文本多态） */

export function getTableHeaders(model: TableModel): string[] {
  const columns = getColumnDefs(model);
  if (columns.length > 0) {
    return columns.map((c) => c.header || c.field);
  }
  if (model.headers && model.headers.length > 0) return model.headers;
  // 从 data 推断
  if (model.data && model.data.length > 0) {
    return Object.keys(model.data[0]);
  }
  return [];
}

/** 排序方向 */

export function filterTableRows(
  data: TableRow[],
  columns: ColumnDef[],
  keyword: string,
): TableRow[] {
  const k = keyword.trim().toLowerCase();
  if (!k) return data;
  return data.filter((row) =>
    columns.some((col) => {
      const raw = row[col.field];
      if (raw == null) return false;
      if (col.type === "boolean") {
        const on = raw === true || raw === "true" || raw === 1;
        if (k === "true" || k === "是") return on;
        if (k === "false" || k === "否") return !on;
        return (on ? "是" : "否").toLowerCase().includes(k);
      }
      if (col.type === "number") {
        const n = Number(raw);
        if (!Number.isNaN(n)) {
          return String(n).includes(k) || String(n) === k;
        }
      }
      return String(raw).toLowerCase().includes(k);
    }),
  );
}

/** 按列类型获取比较函数 */

function getCompareFn(field: string, type: ColumnDef["type"]): (a: TableRow, b: TableRow) => number {
  return (a, b) => {
    const av = a[field];
    const bv = b[field];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;

    if (type === "number") {
      const an = Number(av);
      const bn = Number(bv);
      if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
    }
    if (type === "date") {
      const ad = new Date(String(av)).getTime();
      const bd = new Date(String(bv)).getTime();
      if (!Number.isNaN(ad) && !Number.isNaN(bd)) return ad - bd;
    }
    if (type === "boolean") {
      const at = av === true || av === "true" || av === 1 ? 1 : 0;
      const bt = bv === true || bv === "true" || bv === 1 ? 1 : 0;
      return at - bt;
    }

    // 默认按字符串 localeCompare（中文友好）
    return String(av).localeCompare(String(bv));
  };
}

/** 对数据行按列排序（浅拷贝，不修改原数组） */

export function sortTableRows(
  data: TableRow[],
  columns: ColumnDef[],
  sortField: string,
  sortOrder: SortOrder,
): TableRow[] {
  if (sortOrder === "none" || !sortField) return data;
  const col = columns.find((c) => c.field === sortField);
  if (!col || col.sortable === false) return data;

  const compare = getCompareFn(sortField, col.type);
  const sorted = [...data];
  sorted.sort((a, b) => (sortOrder === "asc" ? compare(a, b) : compare(b, a)));
  return sorted;
}

/**
 * 分页切片：从全量行中取当前页（页码从 1 开始，越界自动夹在合法范围）。
 * 编辑区渲染器与发布端脚本共用，避免"画布显示的页与发布后不同"。
 */

export function paginateTableRows(
  data: TableRow[],
  page: number,
  pageSize: number,
): TableRow[] {
  const size = Math.max(1, Math.floor(pageSize || 10));
  const totalPages = Math.max(1, Math.ceil(data.length / size));
  const current = Math.min(totalPages, Math.max(1, Math.floor(page || 1)));
  const start = (current - 1) * size;
  return data.slice(start, start + size);
}
/**
 * 行选择：切换某行的选中状态（以行对象引用为标识 —— 排序/过滤/分页只重排数组、
 * 不复制行对象，故引用在交互间保持稳定）。返回新数组，不改入参。
 */

export function toggleRowSelection(selected: TableRow[], row: TableRow): TableRow[] {
  const next = selected.filter((r) => r !== row);
  if (next.length === selected.length) next.push(row);
  return next;
}

/**
 * 行选择 · 表头全选/反选：候选行（当前展示行）全部已选 → 全部移除（全不选）；
 * 否则候选行全部加入（保留此前其他页/过滤外已选）。返回新数组，不改入参。
 */

export function toggleAllRowsSelection(selected: TableRow[], candidates: TableRow[]): TableRow[] {
  if (!candidates || candidates.length === 0) return selected.slice();
  const set = new Set(selected);
  const allPicked = candidates.every((r) => set.has(r));
  if (allPicked) candidates.forEach((r) => set.delete(r));
  else candidates.forEach((r) => set.add(r));
  return [...set];
}

export function getColumnDefs(model: TableModel): ColumnDef[] {
  if (model.columns && model.columns.length > 0) return visibleColumnDefs(model.columns);
  if (model.headers && model.headers.length > 0) return headersToColumnDefs(model.headers);
  if (model.data && model.data.length > 0) return inferColumnDefs(model.data[0]);
  return [];
}

/** 按列定义提取一行数据 → 字符串数组（与旧版 rows[i] 同口径） */

export function getRowValues(row: TableRow, columns: ColumnDef[]): string[] {
  return columns.map((col) => {
    const raw = row[col.field];
    if (raw == null) return "";
    return String(raw);
  });
}

/**
 * 单元格展示文本（两端共用，且可被 codegen 以 toString() 内联进发布端运行时，
 * 因此必须自包含——不得引用模块级标识符，日期 token 格式化内联实现）。
 *
 * 规则（仅当 col.format 非空时生效）：
 *   - date  ：按 token 重排日期字符串，支持 YYYY / MM / DD / HH / mm / ss
 *             （例：format="YYYY-MM-DD"，输入 "2026-09-28T08:30:00" → "2026-09-28"）
 *   - number：纯整数 N → toFixed(N)；"percent" → 乘 100 加 %；其余 → toFixed(2)
 * boolean/link/image/status 的"是/否"或富渲染在各自渲染器单独处理，本函数只产出纯文本底值。
 */

export function formatCellDisplay(row: TableRow, col: ColumnDef): string {
  const raw = row[col.field];
  if (raw == null) return "";
  if (col.type === "boolean") {
    return raw === true || raw === "true" || raw === 1 ? "是" : "否";
  }
  const fmt = col.format != null ? String(col.format).trim() : "";
  if (fmt && col.type === "date") {
    const d = new Date(String(raw));
    if (!Number.isNaN(d.getTime())) {
      const pad = (x: number): string => (x < 10 ? "0" + x : "" + x);
      const tokens: Record<string, string> = {
        YYYY: "" + d.getFullYear(),
        MM: pad(d.getMonth() + 1),
        DD: pad(d.getDate()),
        HH: pad(d.getHours()),
        mm: pad(d.getMinutes()),
        ss: pad(d.getSeconds()),
      };
      let out = fmt;
      out = out.split("YYYY").join(tokens.YYYY);
      out = out.split("MM").join(tokens.MM);
      out = out.split("DD").join(tokens.DD);
      out = out.split("HH").join(tokens.HH);
      out = out.split("mm").join(tokens.mm);
      out = out.split("ss").join(tokens.ss);
      return out;
    }
  }
  if (fmt && col.type === "number") {
    const n = Number(raw);
    if (!Number.isNaN(n)) {
      if (/^\d+$/.test(fmt)) return n.toFixed(parseInt(fmt, 10));
      if (fmt === "percent") return (n * 100).toFixed(2) + "%";
      return n.toFixed(2);
    }
  }
  return String(raw);
}

/** 把旧版 rows（string[][]）转成对象数组（按 headers 做 field 名） */

export function rowsToData(rows: string[][], headers: string[]): TableRow[] {
  return rows.map((cells) => {
    const obj: TableRow = {};
    headers.forEach((h, i) => {
      obj[h] = cells[i] ?? "";
    });
    return obj;
  });
}

/** 兼容新旧两版的数据行遍历器 */

export function iterateTableRows(
  model: TableModel,
  callback: (row: TableRow, index: number, columns: ColumnDef[]) => void,
): void {
  const columns = getColumnDefs(model);
  if (model.data && model.data.length > 0) {
    model.data.forEach((row, i) => callback(row, i, columns));
  } else if (model.rows && model.rows.length > 0) {
    const headers = model.headers ?? [];
    model.rows.forEach((cells, i) => {
      const obj: TableRow = {};
      headers.forEach((h, idx) => {
        obj[h] = cells[idx] ?? "";
      });
      // 补全列定义中没有的 headers（旧数据列数可能比 columnDefs 多）
      cells.forEach((c, idx) => {
        const key = headers[idx] ?? `col_${idx}`;
        if (!(key in obj)) obj[key] = c;
      });
      callback(obj, i, columns);
    });
  }
}

/** ── 旧版兼容函数（保留，但内部优先走新版） ── */

/** 表头字符串 → 数组（也接受已经是数组的形态） */

export function parseTableHeaders(input: unknown): string[] {
  if (Array.isArray(input)) return input.map((s) => String(s));
  return String(input ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 行数据文本 → 二维数组（每行一个记录，列用逗号分隔） */

export function parseTableRows(input: unknown): string[][] {
  if (Array.isArray(input)) {
    return (input as unknown[]).map((r) =>
      Array.isArray(r) ? r.map((c) => String(c)) : [String(r)],
    );
  }
  return String(input ?? "")
    .split("\n")
    .map((line) => line.split(",").map((s) => s.trim()))
    .filter((row) => row.some((c) => c !== ""));
}

/**
 * 接口/静态数据的**统一归一**：把任意响应形态转成 TableModel。
 * 支持：
 *   - `[{a:1,b:2}, …]`           → 自动推断 columnDefs + data（推荐）
 *   - `["a","b"] / [[...]]`     → 旧版 headers / rows
 *   - `{columns:[…], rows:[…]}`  → 显式列 + 行（旧版兼容）
 *   - `{columns:[…], data:[{…}]}` → 新版列定义 + 对象数组
 *   - 以上任意形态的 JSON 字符串
 * 无法识别时返回 null（调用方决定回退策略）。
 */

export function normalizeTablePayload(data: unknown): TableModel | null {
  if (data == null) return null;

  let parsed: unknown = data;
  if (typeof data === "string") {
    const trimmed = data.trim();
    if (!trimmed) return null;
    const looksJson = trimmed.startsWith("[") || trimmed.startsWith("{");
    if (!looksJson) return null;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  if (Array.isArray(parsed)) {
    const clamped = parsed.slice(0, MAX_TABLE_ROWS);
    if (clamped.length === 0) return { columns: [], data: [] };
    const first = clamped[0];

    // 对象数组 → 新版 TableModel（自动推断列定义，数据截断上限）
    if (first && typeof first === "object" && !Array.isArray(first)) {
      const columns = inferColumnDefs(first as Record<string, unknown>);
      const data = clamped as Record<string, unknown>[];
      return { columns, data };
    }

    // 纯字符串数组 → 旧版 headers
    if (typeof first === "string") {
      return { headers: clamped.map(String), rows: [] };
    }

    // 二维数组 → 旧版 rows（截断上限）
    if (Array.isArray(first)) {
      return {
        headers: [],
        rows: (clamped as unknown[][]).map((r) => (Array.isArray(r) ? r.map(String) : [String(r)])),
      };
    }
    return null;
  }

  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;

    // 新版：显式 columns + data
    if (Array.isArray(obj.columns)) {
      const columns = parseColumnDefs(obj.columns);
      if (Array.isArray(obj.data)) {
        const clampedData = (obj.data as Record<string, unknown>[]).slice(0, MAX_TABLE_ROWS);
        return { columns, data: clampedData };
      }
      // 旧版：columns + rows
      if (Array.isArray(obj.rows)) {
        const headers = columns.map((c) => c.header || c.field);
        const rows = (obj.rows as unknown[][]).slice(0, MAX_TABLE_ROWS).map((r) =>
          Array.isArray(r) ? r.map(String) : [String(r)],
        );
        return { columns, headers, rows };
      }
      return { columns, data: [] };
    }

    // 旧版：{columns:[…], rows:[…]}
    if (Array.isArray(obj.columns) && Array.isArray(obj.rows)) {
      const headers = (obj.columns as unknown[]).map(String);
      const rows = (obj.rows as unknown[][]).map((r) =>
        Array.isArray(r) ? r.map(String) : [String(r)],
      );
      return { headers, rows };
    }

    // 单条记录对象 → 一行两列（键 / 值）
    const entries = Object.entries(obj).filter(([, v]) => typeof v !== "object" || v === null);
    if (entries.length > 0) {
      return {
        headers: ["字段", "值"],
        rows: entries.map(([k, v]) => [k, String(v ?? "")]),
      };
    }
  }

  return null;
}
