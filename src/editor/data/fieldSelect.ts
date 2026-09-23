import type { ConfigField } from "../../types/editor";

/**
 * select 字段的「选项值 ↔ 配置值」映射口径（唯一一份）
 *
 * ── 为什么需要它 ──
 * 属性面板此前把 `option.value` 一律 `String()` 后交给 MUI `<MenuItem value>`，
 * `onChange` 再把 `e.target.value` 原样写回 config。对字符串选项无害，但配置值
 * 一旦不是字符串就会被**改写成字符串**：
 *
 *   - `{ value: false }` → 存 `"false"`（非空字符串 = **真值**）
 *   - `{ value: null }`  → 存 `"null"`（同样是真值）
 *
 * 后果是同一份 config 在「编辑区」与「发布端」被解释成不同结果，因为两端判真值的方式不同：
 *   - 编辑区 `roseType ? linearMap(...) : r`    → `"false"` 真值 → 画成玫瑰图
 *   - 发布端 `roseType === "radius" || "area"` → 普通饼图
 *   实测 echart-pie：把「玫瑰图」选成「关闭」后，画布是玫瑰图、发布产物是普通饼图。
 *
 * 这里统一两件事：
 *   1. **显示**：把配置值映射成与 `<MenuItem value>` 逐字相同的字符串（DOM 只认字符串）；
 *   2. **写回**：命中的选项回传它声明的**原始值**（boolean / null / number 原样保留）。
 * 未命中（自由输入、历史脏值）时原样透传，绝不吞掉用户输入。
 */

/**
 * 两个配置值是否视为同一个选项。
 *
 * 判定规则（顺序即优先级）：
 *   1. 严格相等 → 同选项；
 *   2. 两侧都为「空」（null / undefined）→ 同选项（配置里这两种写法语义相同）；
 *   3. 否则按 `String()` 比较 —— 因为 `<MenuItem value>` 只能携带字符串，
 *      `false` 在 DOM 上就是 `"false"`、`null` 就是 `"null"`，回传时必须能找回原选项。
 *      （正是这一步让 `"false"` 与布尔 `false` 归一，从而修掉"编辑区当真值、发布端不认"的分叉。）
 */
export function sameOptionValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const aNil = a === null || a === undefined;
  const bNil = b === null || b === undefined;
  if (aNil && bNil) return true;
  return String(a) === String(b);
}

/** 选项列表的归一形态（普通 options 与 dynamicOptions 共用） */
type OptionList = Array<{ label: string; value: unknown }>;

function optionsOf(field: ConfigField, dynamicOptions?: OptionList): OptionList {
  return dynamicOptions ?? (field.options as OptionList | undefined) ?? [];
}

/**
 * 面板显示值：返回应当赋给 `<TextField select value=...>` 的字符串。
 *
 * - 命中选项 → 该选项 `String(value)`（与 MenuItem 逐字一致，MUI 才能高亮选中项）
 * - 未命中但有值 → `String(value)`（历史脏值/自由输入，至少如实显示）
 * - 无值 → `String(field.defaultValue)`（字段声明了默认值时应显示默认，而不是空白）
 */
export function selectDisplayValue(
  field: ConfigField,
  value: unknown,
  dynamicOptions?: OptionList,
): string {
  const opts = optionsOf(field, dynamicOptions);
  const raw = value !== undefined ? value : field.defaultValue;
  if (raw === undefined) return "";
  const hit = opts.find((o) => sameOptionValue(o.value, raw));
  return String(hit ? hit.value : raw);
}

/**
 * 写回值：把面板回传的字符串解析成配置里应当保存的**原始值**。
 *
 * 命中选项 → `opt.value`（原始类型）。注意对字符串选项而言这与输入完全相同，
 * 因此本函数对现有全字符串选项的字段是**零行为变化**。
 */
export function resolveSelectValue(
  field: ConfigField,
  rawInput: unknown,
  dynamicOptions?: OptionList,
): unknown {
  const opts = optionsOf(field, dynamicOptions);
  const hit = opts.find((o) => sameOptionValue(o.value, rawInput));
  return hit ? hit.value : rawInput;
}

/* ──────────────────────────────────────────────
 * 三态布尔：`null / undefined` = 跟随上层，`true / false` = 显式开关
 * ────────────────────────────────────────────── */

/**
 * 解析「跟随全局」型三态配置值。
 *
 * 历史数据里同一个字段可能出现过 `null` / `undefined` / 字符串 `"null"` / `"true"` /
 * `"false"`（最后三种正是上文那段 String() 往返留下的），这里一次性收敛：
 *   - `undefined | null | "null"`            → `null`（跟随）
 *   - `true | "true" | 1 | "1"`              → `true`
 *   - 其它（含 `false | "false" | 0 | ""`）  → `false`
 */
export function readTriState(raw: unknown): boolean | null {
  if (raw === undefined || raw === null) return null;
  if (raw === true || raw === "true" || raw === 1 || raw === "1") return true;
  if (raw === false || raw === "false" || raw === 0 || raw === "0" || raw === "") return false;
  if (raw === "null") return null;
  return Boolean(raw);
}
