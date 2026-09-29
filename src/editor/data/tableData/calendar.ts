/**
 * 日历：星期/月标签、日期解析、月网格与标记归一。
 * 从 tableData.ts 迁出，仅做代码搬迁。
 */

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
