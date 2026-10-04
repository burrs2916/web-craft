// ═══════════════════════════════════════════════════════════════════
// 常量默认值
// ═══════════════════════════════════════════════════════════════════

export const recentTimeRange = (hours: number) => {
  const now = new Date();
  const from = new Date(now.getTime() - hours * 60 * 60 * 1000);
  return { from: from.toISOString(), to: now.toISOString() };
};

export const DEFAULT_TIME_RANGE = recentTimeRange(24);
export const DEFAULT_PAGE_SIZE = 20;

// 与 legacy logQueryStore 对齐：`{ data: [], total: 0 }` 由 spread 推断为 `{ data: never[], total: number }`，
// never[] 可赋给任意 T[]，故对所有 4 类 QueryResult<T> 都兼容。
export const EMPTY_RESULT = { data: [], total: 0 };