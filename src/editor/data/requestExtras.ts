/**
 * 请求扩展字段（自定义请求头 / 请求体）的**唯一编码口径**。
 *
 * 为什么必须收成一处：这两个键在 codegen 里曾出现**三套互相冲突的写法**——
 *   ① 裸 `String(v ?? "")`（约 23 处）→ 传对象得到 "[object Object]"，
 *      发布端 `JSON.parse` 失败后**静默丢弃**（`catch(e){}` 吞错）；
 *   ② `JSON.stringify(v ?? {})`（breadcrumb:97）→ 传**字符串**会被二次编码，运行时 parse 出的是字符串本身，
 *      落到 `for (var k in extra)` 上会逐字符展开成垃圾请求头；
 *   ③ `typeof v === "string" ? v : JSON.stringify(v ?? {})`（media / cascader / form 局部）→ 唯一正确的一支。
 *
 * 发布端契约（`codegen/dataLoader.ts:60-61`）已把形状钉死为 **JSON 文本**：
 *   `var apiHeadersRaw = JSON.stringify(o.apiHeaders ?? "")` + 运行时 `JSON.parse(apiHeadersRaw)`。
 * 故本项目口径 = **一律产出 JSON 文本**：字符串原样透传（兼容历史场景），对象/数组 JSON 化，空值给 ""。
 *
 * 注意（写入口径 vs 读侧容错是两件事）：编辑区 `useApiDataFetch` 与发布端 `scaffold/data.ts`
 * 都按 string|object 双形状容错，所以**历史数据**不必迁移；但**任何写入口只能写本口径的产物**，
 * 否则就会出现「预览正常、发布静默丢头」的分叉——这正是把口径收到这里的原因。
 */

/** 写侧：任意形状 → 规范 JSON 文本；`""` 表示未配置。 */
export function jsonTextField(v: unknown): string {
  if (v == null || v === "") return "";
  // 已是文本：原样透传（勿二次编码——breadcrumb 曾在此处踩坑）
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return "";
    }
  }
  // number / boolean / 其他标量：文本化（JSON.parse 后不产生键值对，等价于未配置）
  return String(v);
}

/** 读侧：任意形状 → 键值对，供行式编辑器回显；不可解析（含数组/标量）时返回 `{}`。 */
export function jsonObjectOf(v: unknown): Record<string, string> {
  if (v == null || v === "") return {};
  let obj: unknown = v;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return {};
    try {
      obj = JSON.parse(t);
    } catch {
      // 历史非法文本：回显为空，由 jsonTextError 负责告知用户
      return {};
    }
  }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(obj as Record<string, unknown>)) {
    // 值一律文本化：发布端只为 `for (var k in extra)` 取字符串
    out[k] = typeof val === "string" ? val : String(val ?? "");
  }
  return out;
}

/** 写侧（行式）：键值对 → 规范 JSON 文本；空键丢弃，全空则 `""`（表示未配置而非 `"{}"`）。 */
export function jsonTextOfRows(rows: Array<{ key: string; value: string }>): string {
  const obj: Record<string, string> = {};
  for (const r of rows) {
    const k = r.key.trim();
    if (k) obj[k] = r.value;
  }
  return Object.keys(obj).length === 0 ? "" : JSON.stringify(obj);
}

/**
 * 校验：JSON 文本合法（含空）返回 `null`，否则返回可展示的错误文案。
 * 为什么必须有这道校验：发布端 `JSON.parse` 失败后被 `catch(e){}` **静默吞掉**，
 * 面板若放行非法文本，用户会以为"配好了"而实际请求头/体被丢弃 —— 又是一个"面板骗人"。
 */
export function jsonTextError(v: unknown): string | null {
  if (v == null || v === "" || typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  try {
    JSON.parse(t);
    return null;
  } catch {
    return "JSON 格式无效，发布端会忽略该配置";
  }
}
