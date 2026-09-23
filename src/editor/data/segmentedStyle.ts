/**
 * 分段控制器（form-segmented）的**唯一取值口径** —— 编辑区 `SegmentedRenderer` 与
 * 发布端 `codegen/components/segmented.ts` 共用。
 *
 * 为什么必须收口：
 * 1. `SEGMENTED_DEFAULT_ITEMS`（面板留空时的兜底示例段）与 `SEGMENTED_SIZE_MAP`
 *    （尺寸档位表）此前在两端**各写了一份**，靠注释维持一致 —— 正是本仓库反复踩过的
 *    "同批字面量写两处必漂移"。
 * 2. 取值归一 `segNormalizeValue` 同理：编辑区曾按 `String(c.value ?? "") || items[0]`
 *    回退（空串也回退首项），发布端按 `c.value ?? items[0]` 回退（空串不回退）——
 *    同一份 config 清空"默认选中值"后，编辑区高亮首项、发布端一段都不高亮却仍提交首项值。
 *    两端只读本函数后，"默认选中哪一项"在仓库里只有一个答案。
 */

export interface SegOptionItem {
  label: string;
  value: string;
  icon?: string;
}

/** 内置示例段（面板留空时兜底，保证拖进来即可见效果） */
export const SEGMENTED_DEFAULT_ITEMS: SegOptionItem[] = [
  { label: "选项一", value: "opt1", icon: "" },
  { label: "选项二", value: "opt2", icon: "" },
  { label: "选项三", value: "opt3", icon: "" },
];

/** 尺寸档位 → 段高 / 段内边距（与注册表 `size` 选项一一对应，勿另写一份） */
export const SEGMENTED_SIZE_MAP: Record<string, { height: number; padY: number; padX: number }> = {
  small: { height: 28, padY: 2, padX: 10 },
  medium: { height: 36, padY: 4, padX: 14 },
  large: { height: 44, padY: 6, padX: 18 },
};

/**
 * 取值归一：命中选项 → 该值；否则回退首项（无选项则空串）。
 *
 * 编辑区与发布端必须同源：面板清空"默认选中值"、或旧值失效（选项改名后残留）时，
 * 两端都要落到同一段高亮、并提交同一个值。
 */
export function segNormalizeValue(
  items: ReadonlyArray<{ value: string }>,
  raw: unknown,
): string {
  const r = raw === undefined || raw === null ? "" : String(raw);
  return items.some((it) => it.value === r) ? r : (items[0]?.value ?? "");
}

/**
 * 数值字段兜底：`undefined / null / ""` 与无法解析的值一律回落默认值。
 *
 * 注意**不能**写成 `Number(x) || fallback` —— 那会把合法的 `0`（如 `gap: 0` 无间距）
 * 当成假值吞成默认值。合法 0 必须保留（与面板 `min: 0` 声明一致）。
 */
export function segNum(raw: unknown, fallback: number): number {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
