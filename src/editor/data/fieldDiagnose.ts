/**
 * 属性面板的「类型级」内建诊断（零依赖纯函数）。
 *
 * 与 `ConfigField.diagnose` 的分工：
 *   - `ConfigField.diagnose` 是**字段级**的，由组件 schema 逐个声明 —— 精度高、覆盖率低
 *     （全仓此前只有 8 处，约占 444 个字段的 1.8%）。
 *   - 本文件是**类型级**的：由面板在渲染某个 `type` 时统一调用，一次覆盖该类型下的全部字段
 *     （color 83 个 / number 109 个）。
 * 两者可以同时出现，互不冲突：SchemaFieldRow 先渲染 schema 诊断，类型级诊断挂在控件正下方。
 *
 * 铁律：**只在异常时说话**。正常态一律返回 null，面板不渲染任何东西 ——
 * 否则 100 多个字段每行挂一条「正常」，面板会被噪音淹没（比不给诊断更糟）。
 */

import { parseColor } from "./colorValue";

export interface FieldDiag {
  level: "ok" | "warn" | "error" | "info";
  text: string;
  detail?: string;
}

/** 数值显示：去掉浮点尾巴，避免 “0.30000000000000004” 这类噪音 */
function num(v: number): string {
  return String(Math.round(v * 1e6) / 1e6);
}

/**
 * color 类型：非法颜色值 / 含透明度。
 *
 * **宁可漏报也不误报**：实测本仓 618 个 color 字段的默认值里，有 39 个是 `transparent` /
 * `none` / `red` / `gray` 这类**合法但不是单色字面量**的写法（`none`、命名色 `parseColor` 并不支持）。
 * 若「解析不了就报错」，这 39 个正确配置会全部被标成错误 —— 比不给诊断更糟。
 * 故只在「本来就写成 # / rgb() 形式、却解析不出来」时才判错（那一定是拼错了）。
 *
 * - 形如 `#12345` / `#gggggg` → error
 * - alpha < 1 → info（面板取色器只认 #rrggbb，改色会丢透明度；实测默认值里 180 处命中，必须说出来）
 * - 空值 / 命名色 / 渐变 / transparent 等 → 静默（未设置由 defaultValue 兜底，其余无法可靠判定）
 */
export function diagnoseColorValue(input: unknown, label = "颜色"): FieldDiag | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  const c = parseColor(raw);
  if (c) {
    if (c.a < 1) {
      return {
        level: "info",
        text: `${label}含透明度（alpha ${num(c.a)}）；左侧取色器只认 #rrggbb，用取色器改色会丢掉透明度`,
      };
    }
    return null;
  }
  if (!/^(#|rgba?\()/i.test(raw)) return null;
  return {
    level: "error",
    text: `${label}的值「${raw}」不是合法颜色，预览里这条颜色声明会失效`,
    detail: "支持 #rgb / #rrggbb / #rrggbbaa / rgb() / rgba()。",
  };
}

/**
 * number 类型：越界。
 *
 * `value` 越界时**必须说**：面板的 number 输入在 blur 时会做 `Math.min(max, Math.max(min, v))` 夹取
 * （见 EditorPropertyPanel 的 number 分支），也就是说用户敲进去的 999 会在离开输入框时被悄悄改成 100。
 * 夹取本身是对的，但「被改过」这件事不能被藏起来。
 *
 * 边界：
 * - 值不是有限数 → 不报（可能是空值中间态，交给字段自己的 required 校验）
 * - 只声明了 min 或只声明了 max → 只校验声明的那一侧
 */
export function diagnoseNumberValue(
  input: unknown,
  min?: number,
  max?: number,
  label = "数值",
): FieldDiag | null {
  if (input === "" || input == null) return null;
  const v = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(v)) return null;
  if (typeof max === "number" && v > max) {
    return { level: "warn", text: `${label}当前为 ${num(v)}，超出上限 ${num(max)}；离开输入框会被夹取为 ${num(max)}` };
  }
  if (typeof min === "number" && v < min) {
    return { level: "warn", text: `${label}当前为 ${num(v)}，低于下限 ${num(min)}；离开输入框会被夹取为 ${num(min)}` };
  }
  return null;
}

/**
 * select 类型（dynamicOptions 分支）：候选由组件自身计算，当前算不出任何候选。
 *
 * 这里刻意**不是**「一算不出就报警」：候选为空是合法状态（比如内容面板还没配置面板），
 * 那种情况下字段本来就没意义，保持安静才是对的。
 * 真正不可接受的是「字段已经有值、却既看不到也改不了」—— 那等于面板对一个生效中的配置失明。
 * 所以只在 `value` 非空时才出声。
 */
export function diagnoseDynamicOptionsEmpty(
  value: unknown,
  label = "该字段",
  hasValueHint = true,
): FieldDiag | null {
  const v = value == null ? "" : String(value).trim();
  if (!hasValueHint || !v) return null;
  return {
    level: "info",
    text: `「${label}」当前没有可用候选项，但它已有值「${v}」—— 候选由组件自身配置推导（数据源 / 内容设置），在面板里无法修改`,
  };
}
