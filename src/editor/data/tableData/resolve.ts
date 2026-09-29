/**
 * 表格数据解析与 CSV 互转：接口数据归一与唯一取值口径。
 * 从 tableData.ts 迁出，仅做代码搬迁。
 */
import { MAX_TABLE_ROWS, normalizeTablePayload, parseTableHeaders, parseTableRows, rowsToData } from './rows';
import { headersToColumnDefs, inferColumnDefs, mergeColumnDefs, parseColumnDefs } from './columns';
import type { TableModel, TableRow } from './rows';
import type { ColumnDef } from './columns';

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
