/**
 * 表格族（表格 / 分页 / 日历 / 描述列表 / 树形控件）的**唯一取值口径**：数据解析。
 *
 * 为什么必须收口（沿用 `mediaStyle.ts` / `optionItems.ts` 已确立的范式）：
 * 这五个组件的"数据解析"原本在编辑区渲染器与发布端 codegen 里**各写了一份**——
 * `parseHeaders/parseRows/resolveApiTableData`、`parseData/normalizeTree`、
 * `parseItems/toDescItems`、`computePageRange`、`DEFAULT_TREE_DATA`/`DEFAULT_ITEMS`
 * 全部是双份字面量。后果是真实的：
 *   - 树/描述列表的默认数据两端各写一份，改一处忘另一处即漂移；
 *   - 描述列表"接口返回单对象 → 字段名/值"的归一规则两端实现细节不同；
 *   - 分页页码范围在两端各算一次，边界（maxButtons 为偶数、总页数不足）不一致时
 *     画布显示的页码与发布后不同。
 * 现在两端**只读本文件**，不再自带任何默认值与解析分支。
 */

/* ──────────────────────────────────────────────
 * 通用小工具（与 fieldStyle / mediaStyle 同一套取值习惯）
 * ────────────────────────────────────────────── */

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function posInt(v: unknown, fallback: number): number {
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
export interface ColumnDef {
  /** 字段键名（接口数据映射、对象数组取值的依据） */
  field: string;
  /** 列标题（空串或缺失时回退到 field） */
  header?: string;
  /** 列数据类型，决定单元格渲染方式与格式化策略；
   *  select 为可编辑下拉类型（候选值见 options），编辑型类型见 EDITABLE_CELL_TYPES */
  type?: "text" | "number" | "date" | "boolean" | "status" | "link" | "image" | "select";
  /** select 类型的候选值（编辑时下拉展示；展示态仍按纯文本渲染） */
  options?: string[];
  /** 列宽：支持 px / % / fr / auto */
  width?: string;
  /** 水平对齐 */
  align?: "left" | "center" | "right";
  /** 格式化模板或规则名（日期格式、数字精度、状态映射键等） */
  format?: string;
  /** 是否允许排序 */
  sortable?: boolean;
  /** 是否显示（用于列显隐切换） */
  visible?: boolean;
  /** 是否允许单元格编辑（仅编辑型类型生效；undefined = 跟随类型默认，false = 明确只读） */
  editable?: boolean;
}

/** 旧版表头 → 列定义的降级转换（保持向后兼容） */
export function headersToColumnDefs(headers: string[]): ColumnDef[] {
  return headers.map((h) => ({ field: h, header: h }));
}

/**
 * 列定义解析：接受多种输入形态，统一归一化为 ColumnDef[]。
 *   - ColumnDef[] 数组                → 直接返回（补全缺失 header）
 *   - JSON 字符串（数组或对象）      → 先 parse 再处理
 *   - 逗号分隔的字段名文本           → 每项生成 { field }
 *   - 逗号分隔的 "field:header" 对   → 解析为 { field, header }
 */
export function parseColumnDefs(input: unknown): ColumnDef[] {
  if (input == null) return [];

  // 已经是数组：对象项按 ColumnDef 全字段解析；字符串项兼容旧式
  // "field" / "field:header" / "field:header:type"（旧版 {columns:["x"],rows:[...]} 的形态）
  if (Array.isArray(input)) {
    const defs = input
      .map((item): ColumnDef | null => {
        if (item == null) return null;
        if (typeof item === "string") {
          const parts = item.split(":").map((s) => s.trim());
          const field = parts[0];
          if (!field) return null;
          return {
            field,
            header: parts[1] || field,
            type: normalizeColumnType(parts[2]),
          };
        }
        if (typeof item !== "object") return null;
        const rec = item as Record<string, unknown>;
        return {
          field: String(rec.field ?? ""),
          header: rec.header != null ? String(rec.header) : undefined,
          type: normalizeColumnType(rec.type),
          width: rec.width != null ? String(rec.width) : undefined,
          align: normalizeColumnAlign(rec.align),
          format: rec.format != null ? String(rec.format) : undefined,
          sortable: rec.sortable === true,
          visible: rec.visible !== false,
          options: parseColumnOptions(rec.options),
          editable: typeof rec.editable === "boolean" ? rec.editable : undefined,
        };
      })
      .filter((d): d is ColumnDef => d != null && d.field !== "")
      // 补全缺失的 header（用 field 兜底）
      .map((d) => ({ ...d, header: d.header || d.field }));
    return defs;
  }

  // 字符串：先尝试 JSON parse
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        return parseColumnDefs(parsed);
      } catch {
        /* 落到按行/逗号解析 */
      }
    }
    // 逗号分隔的字段名：支持 "field" 或 "field:header" 或 "field:header:type"
    return trimmed
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((segment) => {
        const parts = segment.split(":").map((s) => s.trim());
        const field = parts[0];
        const header = parts[1] || field;
        const type = normalizeColumnType(parts[2]);
        return { field, header, type };
      });
  }

  return [];
}

function normalizeColumnType(v: unknown): ColumnDef["type"] | undefined {
  const s = String(v ?? "").toLowerCase();
  const allowed = new Set<ColumnDef["type"]>(["text", "number", "date", "boolean", "status", "link", "image", "select"]);
  return allowed.has(s as ColumnDef["type"]) ? (s as ColumnDef["type"]) : undefined;
}

/** select 列候选值归一：数组逐项 String；字符串按逗号切分；其余 undefined */
function parseColumnOptions(input: unknown): string[] | undefined {
  if (Array.isArray(input)) {
    const out = input.map((v) => String(v)).filter((s) => s.trim() !== "");
    return out.length > 0 ? out : undefined;
  }
  if (typeof input === "string") {
    const out = input.split(",").map((s) => s.trim()).filter(Boolean);
    return out.length > 0 ? out : undefined;
  }
  return undefined;
}

function normalizeColumnAlign(v: unknown): ColumnDef["align"] | undefined {
  const s = String(v ?? "").toLowerCase();
  if (s === "left" || s === "center" || s === "right") return s;
  return undefined;
}

/** 从对象数组的样本数据推断列定义（接口数据首条记录驱动） */
export function inferColumnDefs(sample: Record<string, unknown> | null): ColumnDef[] {
  if (!sample || typeof sample !== "object") return [];
  return Object.keys(sample).map((field) => {
    const val = sample[field];
    let type: ColumnDef["type"] = "text";
    if (typeof val === "boolean") type = "boolean";
    else if (typeof val === "number") type = "number";
    else if (typeof val === "string") {
      // 简单启发式：URL 识别为 link，图片路径识别为 image，ISO 日期识别为 date
      const lower = val.toLowerCase();
      if (/^https?:\/\//.test(val) || /^\//.test(val)) {
        if (/\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(lower)) type = "image";
        else type = "link";
      } else if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
        type = "date";
      }
    }
    // 启发式对齐：数字右对齐，其余左对齐
    const align: ColumnDef["align"] = type === "number" ? "right" : "left";
    return { field, header: field, type, align };
  });
}

/**
 * 合并面板列定义与 API 推断的列定义。
 *
 * 策略（panel 优先）：
 *   - API 有、面板也有同一 field → 面板的 header / type / align / width / format /
 *     sortable / visible 覆盖 API 推断，保留 API 的 field
 *   - API 有、面板没有 → 保留 API 推断（新增字段自动出现）
 *   - 面板有、API 没有 → 保留面板定义（可能显示空列，让用户有机会配置即将上线的字段）
 *
 * 这样用户可以在面板上微调列标题、宽度、对齐、显隐等，而不必手动列出所有字段。
 */
export function mergeColumnDefs(apiColumns: ColumnDef[], panelColumns: ColumnDef[]): ColumnDef[] {
  const panelMap = new Map(panelColumns.map((c) => [c.field, c]));
  const apiFields = new Set(apiColumns.map((c) => c.field));

  // API 列用面板属性覆盖
  const merged = apiColumns.map((apiCol) => {
    const panelCol = panelMap.get(apiCol.field);
    if (!panelCol) return apiCol;
    return {
      ...apiCol,
      header: panelCol.header ?? apiCol.header,
      type: panelCol.type ?? apiCol.type,
      align: panelCol.align ?? apiCol.align,
      width: panelCol.width ?? apiCol.width,
      format: panelCol.format ?? apiCol.format,
      sortable: panelCol.sortable ?? apiCol.sortable,
      visible: panelCol.visible !== undefined ? panelCol.visible : (apiCol.visible ?? true),
      options: panelCol.options ?? apiCol.options,
      editable: panelCol.editable ?? apiCol.editable,
    };
  });

  // 面板有但 API 没有的列追加到末尾
  const extraPanelColumns = panelColumns.filter((c) => !apiFields.has(c.field));
  return [...merged, ...extraPanelColumns];
}

/** 数据行：旧版是 string[][]，新版支持对象数组 */
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
function visibleColumnDefs(defs: ColumnDef[]): ColumnDef[] {
  return defs.filter((c) => c.visible !== false);
}

/** 数据量上限保护：防止超大输入导致内存/性能问题 */
const MAX_TABLE_ROWS = 10000;

/** 列定义优先的列标题列表 */
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
export type SortOrder = "asc" | "desc" | "none";

/** 搜索过滤：按关键词匹配任意列（忽略大小写，布尔/数值/文本多态） */
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

export interface ResolveTableOptions {
  /** 组件 config */
  config: Record<string, unknown>;
  /** 接口/静态数据已经取到的值（编辑区来自 useApiDataFetch，发布端为 null） */
  fetched?: unknown;
  /** 是否处于接口模式（接口模式下编译期不渲染占位行，等数据到达） */
  isApi?: boolean;
}

/** 面板 data 字段归一：数组直接使用，JSON 字符串 parse 后使用，其余返回空数组 */
function parseTableDataRows(input: unknown): TableRow[] {
  if (Array.isArray(input)) return input as TableRow[];
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed as TableRow[];
      } catch {
        /* 不是合法 JSON，按无数据处理 */
      }
    }
  }
  return [];
}

/**
 * 新版统一表格模型（TableDataEditor 产出）归一：
 *   - `{ columns: ColumnDef[], rows: Record<string, unknown>[] }` → 直接返回
 *   - 以上形态的 JSON 字符串 → parse 后返回
 * 无法识别时返回 null（调用方决定回退策略）。
 */
export function parseTableDataModel(input: unknown): { columns: ColumnDef[]; data: TableRow[] } | null {
  let parsed: unknown = input;
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return null;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.columns)) return null;
  const columns = parseColumnDefs(obj.columns);
  const data = Array.isArray(obj.rows) ? (obj.rows as TableRow[]).slice(0, MAX_TABLE_ROWS) : [];
  if (columns.length === 0 && data.length === 0) return null;
  return { columns, data };
}

/**
 * 表格数据的最终取值口径：
 *   1. 接口模式 → 只认接口数据（数据到达前为空表，避免闪现占位行）
 *   2. 显式 staticData → 优先按归一规则解析，识别失败再回退 tableData/旧字段
 *   3. 新版统一字段 tableData → 列定义 + 数据行同一模型（TableDataEditor 产出）
 *   4. 否则 → 兼容字段 columnDefs + data（新版；data 缺列定义时自动推断）
 *   5. 否则 → 兼容字段 headers/rows（旧版）
 */
export function resolveTableData(o: ResolveTableOptions): TableModel {
  const { config, fetched, isApi } = o;
  if (isApi) {
    const apiModel = normalizeTablePayload(fetched);
    if (!apiModel) return { columns: [], data: [] };

    // 统一 API 数据为 { columns, data } 形态
    let apiColumns = apiModel.columns ?? [];
    let apiData = apiModel.data ?? [];

    // API 返回旧版 { columns, rows } → columns 已解析，rows 转成 data
    if (apiData.length === 0 && apiModel.rows && apiModel.rows.length > 0) {
      const headers = apiColumns.map((c) => c.header || c.field);
      if (headers.length > 0) {
        apiData = rowsToData(apiModel.rows, headers);
      }
    }

    // API 返回旧版纯 { headers, rows }（无 columns）
    if (apiColumns.length === 0 && apiModel.headers && apiModel.rows) {
      apiColumns = headersToColumnDefs(apiModel.headers);
      apiData = rowsToData(apiModel.rows, apiModel.headers);
    }

    // 合并面板列定义覆盖（用户可微调 header / type / align / width / sortable / visible）
    let panelColumns: ColumnDef[] = [];
    if (config.tableData != null) {
      const unified = parseTableDataModel(config.tableData);
      if (unified) panelColumns = unified.columns;
    }
    if (panelColumns.length === 0) {
      panelColumns = parseColumnDefs(config.columnDefs);
    }
    if (panelColumns.length > 0 && apiColumns.length > 0) {
      return { columns: mergeColumnDefs(apiColumns, panelColumns), data: apiData };
    }
    if (apiColumns.length > 0) {
      return { columns: apiColumns, data: apiData };
    }
    return { columns: [], data: [] };
  }

  const hasStatic = config.staticData != null && config.staticData !== "";
  if (hasStatic) {
    const model = normalizeTablePayload(fetched ?? config.staticData);
    if (model) return model;
  }

  // 新版统一配置优先：表格编辑器产出 { columns, rows }，行/列同属一张表
  if (config.tableData != null) {
    const unified = parseTableDataModel(config.tableData);
    if (unified) return { columns: unified.columns, data: unified.data };
  }

  // 兼容配置：面板 data 可能是数组或 JSON 字符串（textarea）
  const columnDefs = parseColumnDefs(config.columnDefs);
  const data = parseTableDataRows(config.data);
  if (columnDefs.length > 0 || data.length > 0) {
    const columns = columnDefs.length > 0 ? columnDefs : inferColumnDefs(data[0] ?? null);
    return { columns, data };
  }

  // 旧版兼容
  return {
    headers: parseTableHeaders(config.headers),
    rows: parseTableRows(config.rows),
  };
}

/**
 * CSV 解析：把 CSV 文本解析为二维字符串数组。
 * 支持引号包裹字段、字段内逗号/换行、双引号转义（""）、CRLF/LF 换行。
 * 这是表格编辑器「导入 CSV」的纯函数口径，单独抽出便于两端/测试复用。
 */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; continue; }
        inQuotes = false; continue;
      }
      field += ch; continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ",") { row.push(field); field = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  // 去掉末尾因结尾换行产生的空行
  const last = rows[rows.length - 1];
  if (last && last.length === 1 && last[0] === "") rows.pop();
  return rows;
}

/**
 * 表格模型 → CSV 文本（首行为列标题，按 CSV 规则转义）。
 * 自包含：csvEscape 内联为局部函数，便于 codegen 以 `toString()` 内联进发布端运行时
 * （与 computeVirtualRange / formatCellDisplay / mergeColumnDefs 同一范式，杜绝双份实现漂移）。
 */
export function tableModelToCSV(model: { columns: ColumnDef[]; rows: TableRow[] }): string {
  const csvEscape = (v: unknown): string => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const header = model.columns.map((c) => csvEscape(c.header || c.field));
  const lines = model.rows.map((r) => model.columns.map((c) => csvEscape(r[c.field])));
  return [header, ...lines].map((r) => r.join(",")).join("\n");
}

/** 从 CSV 字符串推断单列类型（输入为原始字符串，需自行识别 number/boolean/date） */
function inferCsvColumnType(values: string[]): ColumnDef["type"] {
  const nonEmpty = values.map((v) => v.trim()).filter((v) => v !== "");
  if (nonEmpty.length === 0) return "text";
  if (nonEmpty.every((v) => v === "true" || v === "false")) return "boolean";
  if (nonEmpty.every((v) => /^-?\d+(\.\d+)?$/.test(v))) return "number";
  if (nonEmpty.every((v) => /^\d{4}-\d{2}-\d{2}/.test(v))) return "date";
  return "text";
}

/**
 * CSV 文本 → 表格模型（编辑器「导入 CSV」的唯一口径）。
 * - hasHeader=true：首行作为列标题（空/重复时回退 colN，字段名去重）。
 * - 列类型按首条数据从字符串推断（number/boolean/date/text），数字列右对齐。
 * - 导入会整体替换现有列与数据（编辑器在调用处注明）。
 */
export function csvToTableModel(text: string, hasHeader = true): { columns: ColumnDef[]; rows: TableRow[] } {
  const matrix = parseCSV(text);
  if (matrix.length === 0) return { columns: [], rows: [] };
  let headers: string[];
  let dataRows: string[][];
  if (hasHeader) {
    headers = matrix[0].map((h, i) => h.trim() || `col${i + 1}`);
    dataRows = matrix.slice(1);
  } else {
    const cnt = matrix[0]?.length ?? 0;
    headers = Array.from({ length: cnt }, (_, i) => `col${i + 1}`);
    dataRows = matrix;
  }
  // 字段名去重（header 可能为空或重复）
  const seen = new Map<string, number>();
  const fields = headers.map((h) => {
    const base = h.trim() || "col";
    const k = seen.get(base) ?? 0;
    seen.set(base, k + 1);
    return k === 0 ? base : `${base}_${k}`;
  });
  // 按每列首条非空数据推断类型
  const colValues: string[][] = fields.map(() => []);
  dataRows.forEach((cells) => {
    cells.forEach((v, i) => { if (fields[i] != null) colValues[i].push(v); });
  });
  const columns: ColumnDef[] = fields.map((f, i) => {
    const type = inferCsvColumnType(colValues[i] ?? []);
    return {
      field: f,
      header: headers[i] || f,
      type,
      align: type === "number" ? "right" : "left",
      sortable: true,
      visible: true,
    };
  });
  const rows: TableRow[] = dataRows.map((cells) => {
    const rec: TableRow = {};
    fields.forEach((f, i) => { rec[f] = cells[i] ?? ""; });
    return rec;
  });
  return { columns, rows };
}

/* ══════════════════════════════════════════════
 * 2. 描述列表（descriptions）
 * ══════════════════════════════════════════════ */

export interface DescriptionItem {
  label: string;
  value: string;
}

/** 未配置时的占位内容（两端同一份，勿在渲染器/codegen 里再写一份） */
export const DEFAULT_DESCRIPTION_ITEMS: DescriptionItem[] = [
  { label: "产品名称", value: "WebCraft 编辑器" },
  { label: "版本", value: "v0.7.0" },
  { label: "技术栈", value: "React + Tauri" },
  { label: "许可", value: "MIT" },
];

/**
 * 静态配置文本 → 描述项。支持三种写法（与面板 help 一致）：
 *   - JSON 数组 `[{"label":"a","value":"b"}]`
 *   - 每行 `标签: 值`（中英文冒号皆可）
 *   - 每行仅标签
 * 无有效配置时返回空数组（由调用方决定是否落默认值）。
 */
export function parseDescriptionItems(input: unknown): DescriptionItem[] {
  if (Array.isArray(input)) {
    return normalizeDescriptionPayload(input, (i) => `字段 ${i + 1}`);
  }
  if (typeof input !== "string") return [];

  const trimmed = input.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return normalizeDescriptionPayload(parsed, (i) => `字段 ${i + 1}`);
    } catch {
      /* 落到按行解析 */
    }
  }

  const lines = trimmed.split("\n").filter((l) => l.trim());
  return lines.map((line) => {
    const half = line.indexOf(":");
    const full = line.indexOf("：");
    const idx = half > 0 ? half : full;
    if (idx > 0) {
      return { label: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
    }
    return { label: line.trim(), value: "" };
  });
}

/**
 * 接口/静态数据 → 描述项。
 *   - 数组 → 每项取 label|name|key + value|text
 *   - 对象 → 逐字段展开为 `字段名 / 值`（嵌套对象跳过）
 * `fallbackLabel` 让两端对"数组里缺 label 的项"使用同一命名规则。
 */
export function normalizeDescriptionPayload(
  data: unknown,
  fallbackLabel?: (index: number) => string,
): DescriptionItem[] {
  const fb = fallbackLabel ?? (() => "");
  if (Array.isArray(data)) {
    const out: DescriptionItem[] = [];
    data.forEach((item, i) => {
      if (!item || typeof item !== "object") return;
      const rec = item as Record<string, unknown>;
      const label = rec.label ?? rec.name ?? rec.key ?? fb(i);
      const value = rec.value ?? rec.text ?? "";
      const row = { label: String(label ?? ""), value: String(value ?? "") };
      if (row.label || row.value) out.push(row);
    });
    return out;
  }
  if (data && typeof data === "object") {
    return Object.entries(data as Record<string, unknown>)
      .filter(([k]) => k.trim() !== "")
      .filter(([, v]) => typeof v !== "object" || v === null)
      .map(([k, v]) => ({ label: k, value: String(v ?? "") }));
  }
  return [];
}

/**
 * 描述列表数据的最终取值口径。
 * 「接口模式且已拿到数据」优先；否则静态数据；再否则内容组 items；全空则落默认占位。
 */
export function resolveDescriptionItems(o: {
  config: Record<string, unknown>;
  fetched?: unknown;
}): DescriptionItem[] {
  const { config, fetched } = o;
  const isApi = String(config.dataMode ?? "static") === "api";

  if (isApi) {
    const fromApi = normalizeDescriptionPayload(fetched);
    if (fromApi.length > 0) return fromApi;
  } else if (config.staticData != null && config.staticData !== "") {
    let parsed: unknown = config.staticData;
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        /* 非 JSON，按文本解析 */
      }
    }
    const fromStatic =
      typeof parsed === "string"
        ? parseDescriptionItems(parsed)
        : normalizeDescriptionPayload(parsed ?? undefined);
    if (fromStatic.length > 0) return fromStatic;
  }

  const fromItems = parseDescriptionItems(config.items);
  if (fromItems.length > 0) return fromItems;
  return isApi ? [] : DEFAULT_DESCRIPTION_ITEMS;
}

/** 水平布局下补齐到"列数 × 2"的整数倍，保证网格完整（两端同一份） */
export function padDescriptionItems(items: DescriptionItem[], columns: number): DescriptionItem[] {
  const cols = posInt(columns, 1);
  const padded = [...items];
  while (padded.length % cols !== 0) padded.push({ label: "", value: "" });
  return padded;
}

/* ══════════════════════════════════════════════
 * 3. 树形控件（tree）
 * ══════════════════════════════════════════════ */

export interface TreeNodeModel {
  label: string;
  value?: string;
  /** 可选自定义图标（Material 名 / 自定义图标 id），供图标管线消费 */
  icon?: string;
  disabled?: boolean;
  children?: TreeNodeModel[];
}

/** 未配置时的占位树（两端同一份，勿再各写一份） */
export const DEFAULT_TREE_DATA: TreeNodeModel[] = [
  {
    label: "src",
    children: [
      {
        label: "editor",
        children: [
          { label: "renderers", children: [{ label: "TreeRenderer.tsx" }] },
          { label: "registry.ts" },
        ],
      },
      {
        label: "codegen",
        children: [
          { label: "components", children: [{ label: "tree.ts" }] },
          { label: "store" },
        ],
      },
      { label: "store" },
    ],
  },
  {
    label: "public",
    children: [{ label: "index.html" }],
  },
];

/** 是否递归包含任何带 children 的节点（用于"是否显示展开箭头"这类判断） */
export function hasBranch(nodes: TreeNodeModel[]): boolean {
  return nodes.some((n) => !!(n.children && n.children.length > 0));
}

/** 静态 JSON 文本 → 树节点；解析失败返回空数组 */
export function parseTreeNodes(input: unknown): TreeNodeModel[] {
  if (Array.isArray(input)) return normalizeTreePayload(input);
  if (typeof input !== "string") return [];
  const trimmed = input.trim();
  if (!trimmed.startsWith("[")) return [];
  try {
    return normalizeTreePayload(JSON.parse(trimmed));
  } catch {
    return [];
  }
}

/**
 * 任意树数据 → 规范节点树。
 * 标签别名 label|title|text|name；子节点键 children|nodes|items。
 * 无标签的节点被丢弃（与旧双端实现一致）。
 */
export function normalizeTreePayload(data: unknown): TreeNodeModel[] {
  if (!Array.isArray(data)) return [];
  const map = (raw: unknown): TreeNodeModel | null => {
    if (raw == null) return null;
    if (typeof raw === "string" || typeof raw === "number") {
      return { label: String(raw) };
    }
    if (typeof raw !== "object") return null;
    const rec = raw as Record<string, unknown>;
    const label = rec.label ?? rec.title ?? rec.text ?? rec.name;
    if (label == null || String(label) === "") return null;
    const node: TreeNodeModel = { label: String(label) };
    if (rec.value != null) node.value = String(rec.value);
    if (rec.icon != null) node.icon = String(rec.icon);
    if (rec.disabled != null) node.disabled = Boolean(rec.disabled);
    const kids = rec.children ?? rec.nodes ?? rec.items;
    if (Array.isArray(kids)) {
      const mapped = kids.map(map).filter((n): n is TreeNodeModel => n != null);
      if (mapped.length) node.children = mapped;
    }
    return node;
  };
  return data.map(map).filter((n): n is TreeNodeModel => n != null);
}

/**
 * 树数据的最终取值口径。
 * 接口模式 → 只认接口数据（无数据则空树）；静态模式 → staticData 优先，其次内容组 data，
 * 全空则落默认占位树。
 */
export function resolveTreeData(o: {
  config: Record<string, unknown>;
  fetched?: unknown;
}): TreeNodeModel[] {
  const { config, fetched } = o;
  const isApi = String(config.dataMode ?? "static") === "api";

  if (isApi) return normalizeTreePayload(fetched);

  if (config.staticData != null && config.staticData !== "") {
    let parsed: unknown = config.staticData;
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        parsed = null;
      }
    }
    const fromStatic = normalizeTreePayload(parsed);
    if (fromStatic.length > 0) return fromStatic;
  }

  const fromContent = parseTreeNodes(config.data);
  if (fromContent.length > 0) return fromContent;
  return DEFAULT_TREE_DATA;
}

/** 节点路径键（根为 "0"，子为 "0-2"）→ 默认展开集合；与两端渲染时使用的键完全一致 */
export function collectBranchKeys(nodes: TreeNodeModel[], prefix = ""): string[] {
  const keys: string[] = [];
  nodes.forEach((node, i) => {
    const key = `${prefix}${i}`;
    if (node.children && node.children.length > 0) {
      keys.push(key);
      // 子节点的键是「父键 + '-' + 索引」，与渲染器的 renderNode(child, `${key}-${i}`) 同口径
      keys.push(...collectBranchKeys(node.children, `${key}-`));
    }
  });
  return keys;
}

/** 按"默认展开层级"取应展开的键；level <= 0 表示不展开，>= 99 视为全部展开 */
export function collectKeysByLevel(
  nodes: TreeNodeModel[],
  expandLevel: number,
  prefix = "",
  depth = 1,
): string[] {
  const keys: string[] = [];
  if (expandLevel <= 0) return keys;
  nodes.forEach((node, i) => {
    const key = `${prefix}${i}`;
    if (node.children && node.children.length > 0 && depth <= expandLevel) {
      keys.push(key);
      keys.push(...collectKeysByLevel(node.children, expandLevel, `${key}-`, depth + 1));
    }
  });
  return keys;
}

/** 树节点总数（用于面板展示/空态判断） */
export function countTreeNodes(nodes: TreeNodeModel[]): number {
  return nodes.reduce((acc, n) => acc + 1 + (n.children ? countTreeNodes(n.children) : 0), 0);
}

/* ══════════════════════════════════════════════
 * 4. 分页（pagination）
 * ══════════════════════════════════════════════ */

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
export const EDITABLE_CELL_TYPES = ["text", "number", "date", "boolean", "select"] as const;

/** 该列是否可编辑：类型在集合内且未被显式声明只读（editable !== false） */
export function isCellEditable(col: ColumnDef): boolean {
  var t = String(col.type ?? "text");
  return (t === "text" || t === "number" || t === "date" || t === "boolean" || t === "select") && col.editable !== false;
}

/** 编辑控件的初始值（字符串形态）：date 取 YYYY-MM-DD 前缀，boolean 映射是/否 */
export function initialEditValue(raw: unknown, col: ColumnDef): string {
  if (raw == null) return "";
  if (col.type === "date") {
    const s = String(raw);
    return s.length >= 10 ? s.slice(0, 10) : s;
  }
  if (col.type === "boolean") {
    return raw === true || raw === "true" || raw === 1 ? "是" : "否";
  }
  return String(raw);
}

/**
 * 编辑提交值解析（两端同源）：number 非法输入保持原字符串（诚实不吞），
 * boolean 是/true/1 → true，其余按字符串。
 */
export function parseCellEditValue(col: ColumnDef, input: unknown): unknown {
  const v = String(input == null ? "" : input);
  if (col.type === "number") {
    if (v.trim() !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return v;
  }
  if (col.type === "boolean") {
    return v === "是" || v === "true" || v === "1";
  }
  return v;
}

/**
 * 行的搜索文本（与 filterTableRows 的匹配口径一致的纯文本表示）。
 * 自包含，可被 codegen 以 toString() 内联进编辑脚本（提交后同步 data-search-text）。
 */
export function tableRowSearchText(row: TableRow, columns: ColumnDef[]): string {
  return columns
    .map((col) => {
      const raw = row[col.field];
      if (raw == null) return "";
      if (col.type === "boolean") {
        const on = raw === true || raw === "true" || raw === 1;
        return on ? "是" : "否";
      }
      return String(raw);
    })
    .join(" ")
    .toLowerCase();
}

/**
 * 多态单元格 HTML（发布端唯一渲染口径，取代 codegen 内的手写 renderCellCodegen /
 * 运行时 renderCell 双份实现）。引用 formatCellDisplay —— 内联点须先声明该标识符
 * （同 computeVirtualRange 引用 VIRTUAL_OVERSCAN 的既有范式）。
 * 转义口径与 codegen escapeHTML 完全一致（含单引号 &#039;）。
 */
export function renderCellHtml(row: TableRow, col: ColumnDef): string {
  const esc = (s: unknown): string =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  const safeUrl = (u: string): string | null => {
    try {
      const p = new URL(u, "http://localhost").protocol;
      return p === "http:" || p === "https:" || p === "data:" ? u : null;
    } catch (e) {
      return null;
    }
  };
  const raw = row[col.field];
  if (raw == null) return "";
  const val = String(raw);
  if (col.type === "boolean") {
    const on = raw === true || raw === "true" || raw === 1;
    const color = on ? "#4CAF50" : "#F44336";
    return '<span style="display:inline-flex;align-items:center;gap:4px;color:' + color + ';font-size:inherit"><span style="width:8px;height:8px;border-radius:50%;background-color:' + color + ';display:inline-block"></span>' + (on ? "是" : "否") + "</span>";
  }
  if (col.type === "status" && val) {
    const dotColor = val === "error" ? "#F44336" : val === "warning" ? "#FF9800" : "#4CAF50";
    return '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:4px;font-size:0.85em;background-color:rgba(255,255,255,0.08);color:rgba(255,255,255,0.9)"><span style="width:6px;height:6px;border-radius:50%;background-color:' + dotColor + ';display:inline-block"></span>' + esc(val) + "</span>";
  }
  if (col.type === "link" && val) {
    const href = safeUrl(val) != null ? safeUrl(val) as string : "#unsafe";
    return '<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer" style="color:#2196F3;text-decoration:none;font-size:inherit">' + esc(val) + "</a>";
  }
  if (col.type === "image" && val) {
    const src = safeUrl(val) != null ? safeUrl(val) as string : "";
    if (!src) return "";
    return '<img src="' + esc(src) + '" alt="' + esc(col.header || col.field) + '" style="max-width:48px;max-height:32px;object-fit:contain;border-radius:2px;display:block" />';
  }
  return esc(formatCellDisplay(row, col));
}

/**
 * 单元格写回请求（发布端编辑脚本专用，自包含）。
 * 请求体：{ [idField]: 行主键值, [field]: 新值 }（idField 缺失或行无该字段时只发字段值）。
 * 取数基建口径与 dataLoaderScript 完全同源：__WC_API_BASE 拼接、__WC_DEFAULT_HEADERS、
 * 认证三态（null = 跟随 __WC_AUTH_ENABLED）、__WC_TOKEN_* 四件套。
 * 站点静态模式（__WC_SITE_MODE === "static"）不发请求，视为本地生效（乐观值保留）。
 * 返回 Promise<boolean>：true = 写回成功或无需写回；false = 失败（调用方回滚）。
 */
export function tableCellWriteBack(o: {
  url: string;
  method: string;
  idField: string;
  row: TableRow;
  field: string;
  value: unknown;
  authEnabled: boolean | null;
}): Promise<boolean> {
  const w = (typeof window !== "undefined" ? window : {}) as unknown as Record<string, unknown>;
  if (w.__WC_SITE_MODE === "static") return Promise.resolve(true);
  let full = String(o.url ?? "");
  const base = typeof w.__WC_API_BASE === "string" ? w.__WC_API_BASE : "";
  if (full && base && !/^https?:\/\//i.test(full)) {
    full = base.replace(/\/+$/, "") + (full.charAt(0) === "/" ? full : "/" + full);
  }
  if (!full) return Promise.resolve(true);
  const headers: Record<string, string> = {};
  const dh = (w.__WC_DEFAULT_HEADERS && typeof w.__WC_DEFAULT_HEADERS === "object" ? w.__WC_DEFAULT_HEADERS : {}) as Record<string, string>;
  for (const k in dh) headers[k] = dh[k];
  if (headers["Content-Type"] === undefined) headers["Content-Type"] = "application/json";
  const useAuth = o.authEnabled === null ? (w.__WC_AUTH_ENABLED ? true : false) : o.authEnabled === true;
  if (useAuth) {
    const storage = typeof w.__WC_TOKEN_STORAGE === "string" ? w.__WC_TOKEN_STORAGE : "localStorage";
    const key = typeof w.__WC_TOKEN_KEY === "string" ? w.__WC_TOKEN_KEY : "auth_token";
    const hdr = typeof w.__WC_TOKEN_HEADER === "string" ? w.__WC_TOKEN_HEADER : "Authorization";
    const prefix = typeof w.__WC_TOKEN_PREFIX === "string" ? w.__WC_TOKEN_PREFIX : "Bearer ";
    let token: string | null = null;
    try {
      if (storage === "localStorage") token = window.localStorage.getItem(key);
      else if (storage === "sessionStorage") token = window.sessionStorage.getItem(key);
      else if (storage === "memory") {
        const cache = (w.__webcraft_memory_cache ?? {}) as Record<string, string>;
        token = cache[key] != null ? cache[key] : null;
      }
    } catch (e) {
      token = null;
    }
    if (token) headers[hdr] = prefix + token;
  }
  const body: Record<string, unknown> = {};
  if (o.idField && o.row[o.idField] != null) body[o.idField] = o.row[o.idField];
  body[o.field] = o.value;
  return fetch(full, {
    method: o.method || "PUT",
    headers: headers,
    body: JSON.stringify(body),
  })
    .then((res) => res.ok)
    .catch(() => false);
}

/**
 * 发布端双击编辑控制器（静态 bake 模式与接口/虚拟运行时共用同一份实现）。
 * 自包含（引用 isCellEditable/initialEditValue/parseCellEditValue —— 内联点须先声明）。
 * 交互：双击可编辑单元格 → 原位编辑控件（布尔/下拉为 select，其余为 input）→
 * 失焦/回车提交、Esc 取消；提交 = 乐观更新行对象 + 重渲染该单元格 +
 * 同步行搜索文本 + onEdit 回调（派发 cell-edit 事件）+ 可选写回（失败回滚重渲染）。
 * 定位契约：td 带 data-col-index（可见列序号）、tr 带 data-row-index
 * （getRows() 返回与该序号对应的行数组）。
 */
export function attachTableCellEditing(
  root: HTMLElement,
  opts: {
    enabled: boolean;
    getColumns: () => ColumnDef[];
    getRows: () => TableRow[];
    renderCellHtml: (row: TableRow, col: ColumnDef) => string;
    searchTextOf: ((row: TableRow, cols: ColumnDef[]) => string) | null;
    writeBack: ((row: TableRow, field: string, value: unknown, done: (ok: boolean) => void) => void) | null;
    onEdit: ((row: TableRow, field: string, value: unknown) => void) | null;
  },
): void {
  if (!root || !opts || !opts.enabled) return;
  root.addEventListener("dblclick", function (e) {
    const t = e.target as HTMLElement | null;
    if (!t || !t.closest) return;
    const td = t.closest("td") as HTMLElement | null;
    if (!td || td.getAttribute("data-col-index") == null) return;
    if (td.getAttribute("data-editing") != null) return;
    const tr = td.closest("tr") as HTMLElement | null;
    if (!tr || tr.getAttribute("data-row-index") == null) return;
    const ci = Number(td.getAttribute("data-col-index"));
    const ri = Number(tr.getAttribute("data-row-index"));
    const col = opts.getColumns()[ci];
    const row = opts.getRows()[ri];
    if (!col || !row) return;
    if (!isCellEditable(col)) return;
    const raw = row[col.field];
    const inputStyle = "width:100%;box-sizing:border-box;height:24px;font:inherit;color:inherit;background-color:rgba(255,255,255,0.06);border:1px solid rgba(33,150,243,0.6);border-radius:3px;padding:0 4px;outline:none";
    let finished = false;
    const commit = (inputVal: unknown) => {
      if (finished) return;
      finished = true;
      td.removeAttribute("data-editing");
      const parsed = parseCellEditValue(col, inputVal);
      const prev = row[col.field];
      const same = parsed === prev || String(parsed) === String(prev);
      if (same) {
        td.innerHTML = opts.renderCellHtml(row, col);
        return;
      }
      row[col.field] = parsed;
      const syncSearch = () => {
        if (tr.getAttribute("data-search-text") != null && opts.searchTextOf) {
          tr.setAttribute("data-search-text", opts.searchTextOf(row, opts.getColumns()));
        }
      };
      td.innerHTML = opts.renderCellHtml(row, col);
      syncSearch();
      if (opts.onEdit) opts.onEdit(row, col.field, parsed);
      if (opts.writeBack) {
        opts.writeBack(row, col.field, parsed, (ok) => {
          if (!ok) {
            row[col.field] = prev;
            td.innerHTML = opts.renderCellHtml(row, col);
            syncSearch();
          }
        });
      }
    };
    const cancel = () => {
      if (finished) return;
      finished = true;
      td.removeAttribute("data-editing");
      td.innerHTML = opts.renderCellHtml(row, col);
    };
    let editor: HTMLInputElement | HTMLSelectElement;
    if (col.type === "boolean") {
      const sel = document.createElement("select");
      sel.setAttribute("style", inputStyle);
      const labels = ["是", "否"];
      const cur = initialEditValue(raw, col);
      for (let i = 0; i < labels.length; i++) {
        const opt = document.createElement("option");
        opt.value = labels[i];
        opt.textContent = labels[i];
        if (labels[i] === cur) opt.selected = true;
        sel.appendChild(opt);
      }
      editor = sel;
    } else if (col.type === "select") {
      const sel = document.createElement("select");
      sel.setAttribute("style", inputStyle);
      const list = Array.isArray(col.options) ? col.options.map(String) : [];
      const cur2 = raw == null ? "" : String(raw);
      if (cur2 !== "" && list.indexOf(cur2) < 0) list.unshift(cur2);
      for (let j = 0; j < list.length; j++) {
        const opt2 = document.createElement("option");
        opt2.value = list[j];
        opt2.textContent = list[j];
        if (list[j] === cur2) opt2.selected = true;
        sel.appendChild(opt2);
      }
      editor = sel;
    } else {
      const inp = document.createElement("input");
      inp.type = col.type === "number" ? "number" : col.type === "date" ? "date" : "text";
      inp.setAttribute("style", inputStyle);
      inp.value = initialEditValue(raw, col);
      editor = inp;
    }
    editor.addEventListener("keydown", (ev) => {
      const ke = ev as KeyboardEvent;
      if (ke.key === "Enter") {
        ke.preventDefault();
        commit(editor.value);
      } else if (ke.key === "Escape") {
        cancel();
      }
    });
    if (editor.tagName === "SELECT") {
      editor.addEventListener("change", () => {
        commit(editor.value);
      });
    }
    editor.addEventListener("blur", () => {
      commit(editor.value);
    });
    td.innerHTML = "";
    td.appendChild(editor);
    try {
      editor.focus();
    } catch (err) {
      /* 聚焦失败不阻断编辑 */
    }
  });
}

/* ══════════════════════════════════════════════
 * 5. 日历（calendar）
 * ══════════════════════════════════════════════ */

export const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"] as const;
export const MONTH_LABELS = [
  "一月", "二月", "三月", "四月", "五月", "六月",
  "七月", "八月", "九月", "十月", "十一月", "十二月",
] as const;

export interface CalendarMark {
  /** YYYY-MM-DD */
  date: string;
  label?: string;
  color?: string;
}

/** YYYY-MM-DD（本地时区，避免 toISOString 的 UTC 偏移） */
export function toDateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 解析面板上的默认日期；非法/留空时回落到今天 */
export function parseDateValue(input: unknown, now = new Date()): { year: number; month: number; day: number } {
  if (typeof input === "string" && input.trim()) {
    const parts = input.trim().split("-");
    if (parts.length >= 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return { year: y, month: m, day: d };
    }
  }
  return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * 月视图网格：null 表示空白补齐格。
 * weekStartsOn: 0=周日起始，1=周一起始。
 */
export function buildMonthGrid(
  year: number,
  monthIndex: number,
  weekStartsOn: number,
): (number | null)[] {
  const firstDow = new Date(year, monthIndex, 1).getDay();
  const offset = weekStartsOn === 1 ? (firstDow + 6) % 7 : firstDow;
  const cells: (number | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth(year, monthIndex); d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** 周标题栏文本（weekStartsOn=1 时把"日"挪到末尾） */
export function weekdayLabels(weekStartsOn: number): string[] {
  const base = [...WEEKDAY_LABELS];
  return weekStartsOn === 1 ? [...base.slice(1), base[0]] : base;
}

/** 网格中第 i 列是否为周末列（随起始日变化） */
export function isWeekendColumn(index: number, weekStartsOn: number): boolean {
  return weekStartsOn === 1 ? index === 5 || index === 6 : index === 0 || index === 6;
}

/**
 * 接口/静态数据 → 日历标记（date 决定落在哪一格）。
 * 支持 `[{date,label,color}]`；对象形态 `{"2026-09-20": "发布会"}` 也识别。
 */
export function normalizeCalendarMarks(data: unknown): CalendarMark[] {
  if (data == null) return [];
  let parsed: unknown = data;
  if (typeof parsed === "string") {
    const trimmed = parsed.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }
  if (Array.isArray(parsed)) {
    const out: CalendarMark[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const date = rec.date ?? rec.day ?? rec.value;
      if (date == null || String(date) === "") continue;
      out.push({
        date: String(date),
        label: rec.label != null ? String(rec.label) : rec.title != null ? String(rec.title) : "",
        color: rec.color != null ? String(rec.color) : "",
      });
    }
    return out;
  }
  if (typeof parsed === "object") {
    return Object.entries(parsed as Record<string, unknown>)
      .filter(([k]) => !!k.trim())
      .map(([k, v]) => ({ date: k, label: v == null ? "" : String(v), color: "" }));
  }
  return [];
}

/** 标记按日期建索引，渲染时 O(1) 取用 */
export function indexCalendarMarks(marks: CalendarMark[]): Map<string, CalendarMark[]> {
  const map = new Map<string, CalendarMark[]>();
  for (const m of marks) {
    const list = map.get(m.date);
    if (list) list.push(m);
    else map.set(m.date, [m]);
  }
  return map;
}

/** 日历数据的最终取值口径：接口模式认接口，静态模式认 staticData，否则内容组 marks */
export function resolveCalendarMarks(o: {
  config: Record<string, unknown>;
  fetched?: unknown;
}): CalendarMark[] {
  const { config, fetched } = o;
  const isApi = String(config.dataMode ?? "static") === "api";
  if (isApi) return normalizeCalendarMarks(fetched);
  if (config.staticData != null && config.staticData !== "") {
    const fromStatic = normalizeCalendarMarks(config.staticData);
    if (fromStatic.length > 0) return fromStatic;
  }
  return normalizeCalendarMarks(config.marks);
}
