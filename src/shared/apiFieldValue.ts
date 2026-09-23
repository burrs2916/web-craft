/**
 * 接口响应 → 目标字段值 的**唯一取值口径**。
 *
 * 为什么收口：`apiSrcField` / `apiPosterField` / `apiTextField` 这类「从响应里取一个值」
 * 的逻辑曾在各渲染器里各写一份（表单标签、图片、视频…），语义已经开始分叉——
 * 视频版「字段取空会回退通用字段名」，图片版「字段一旦配置就只用它」。
 * 同一条取数骨架不该有两套取值规则，故收成这里的纯函数。
 *
 * 取值规则（与发布端注入的运行期脚本 `pickField` **逐字对应**，改一处必须改两处）：
 *   1. `raw` 是原始值（string/number/boolean）→ 直接转字符串
 *   2. `raw` 是对象：显式字段优先（支持 `a.b.c` 点号路径）；取到真值即返回
 *   3. 显式字段未取到 → 依次尝试 `fallbackKeys`（也支持点号路径）
 *   4. 都没有 → 空串（由调用方决定显示空态还是回落静态值）
 *
 * `onlyField`：显式字段配置后**不**回退通用字段名（图片渲染器的历史语义，保持零回归用）。
 */
export function digApiField(
  raw: unknown,
  field: string,
  fallbackKeys: string[],
  opts: { onlyField?: boolean } = {},
): string {
  if (raw == null) return "";
  if (typeof raw !== "object") return String(raw);
  const read = (path: string): unknown =>
    path
      .split(".")
      .reduce<unknown>(
        (acc, k) => (acc == null || typeof acc !== "object" ? undefined : (acc as Record<string, unknown>)[k]),
        raw,
      );
  if (field) {
    const v = read(field);
    if (v !== undefined && v !== null && v !== "") return String(v);
    if (opts.onlyField) return "";
  }
  for (const k of fallbackKeys) {
    const v = read(k);
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return "";
}
