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

export interface TableModel {
  headers: string[];
  rows: string[][];
}

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
 * 接口/静态数据的**统一归一**：把任意响应形态转成 { headers, rows }。
 * 支持：
 *   - `[{a:1,b:2}, …]`           → 以首项的键为表头
 *   - `[["a","b"], …]`           → 无表头，纯行
 *   - `{columns:[…], rows:[…]}`  → 显式列 + 行
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
    if (parsed.length === 0) return { headers: [], rows: [] };
    const first = parsed[0];
    if (first && typeof first === "object" && !Array.isArray(first)) {
      const headers = Object.keys(first as Record<string, unknown>);
      const rows = (parsed as Record<string, unknown>[]).map((item) =>
        headers.map((k) => String(item?.[k] ?? "")),
      );
      return { headers, rows };
    }
    if (Array.isArray(first)) {
      return {
        headers: [],
        rows: (parsed as unknown[][]).map((r) => (Array.isArray(r) ? r.map(String) : [String(r)])),
      };
    }
    return null;
  }

  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.columns) && Array.isArray(obj.rows)) {
      return {
        headers: (obj.columns as unknown[]).map(String),
        rows: (obj.rows as unknown[][]).map((r) => (Array.isArray(r) ? r.map(String) : [String(r)])),
      };
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

/**
 * 表格数据的最终取值口径：
 *   1. 接口模式 → 只认接口数据（数据到达前为空表，避免闪现占位行）
 *   2. 显式 staticData → 优先按归一规则解析，识别失败再回退 headers/rows
 *   3. 否则 → 兼容字段 headers/rows
 */
export function resolveTableData(o: ResolveTableOptions): TableModel {
  const { config, fetched, isApi } = o;
  if (isApi) {
    const model = normalizeTablePayload(fetched);
    return model ?? { headers: [], rows: [] };
  }

  const hasStatic = config.staticData != null && config.staticData !== "";
  if (hasStatic) {
    const model = normalizeTablePayload(fetched ?? config.staticData);
    if (model) return model;
  }
  return {
    headers: parseTableHeaders(config.headers),
    rows: parseTableRows(config.rows),
  };
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
