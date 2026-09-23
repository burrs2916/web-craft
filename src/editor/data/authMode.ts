import type { ConfigField } from "../../types/editor";
import { readTriState } from "./fieldSelect";

/**
 * 「是否注入认证 Token」的唯一口径
 *
 * ── 为什么是三态而不是开关 ──
 * 站点级 `apiConfig.authEnabled` 决定默认行为，组件级这个字段表达的是**意图**：
 *   - `null`（跟随站点全局）→ 站点开就带 Token、站点关就不带，组件不必关心
 *   - `true`  → 强制注入（即使站点全局关着）
 *   - `false` → 明确不注入（即使站点全局开着，例如公开接口）
 * 用两态 toggle 表达不了第一种：toggle 缺省渲染成 OFF，用户看到"关闭"，
 * 而代码把 `undefined` 解释为"跟随全局" —— 站点全局开启时**面板在骗人**。
 * 此前多个组件只能靠 `defaultConfig.authEnabled = false` 硬写兜底，正是为了绕开这个表达缺口。
 *
 * 本文件把选项、帮助文字与解析函数收成一份；`dataSourceFields.apiFields()`、
 * `dataConfigMixin.DATA_CONFIG_SCHEMA` 以及各注册文件里的内联字段全部读它，杜绝漂移。
 */

/** 三态选项：值必须是 boolean / null，**不能是字符串** */
export const AUTH_ENABLED_OPTIONS: Array<{ label: string; value: boolean | null }> = [
  { label: "跟随站点全局", value: null },
  { label: "强制注入 Token", value: true },
  { label: "不注入 Token", value: false },
];

export const AUTH_ENABLED_HELP =
  "跟随站点全局：站点开启认证就带 Token，否则不带；强制注入：即使站点全局关闭也带上；不注入：公开接口，明确不带";

/**
 * 三态字段工厂：各组件只需给出自己的显隐条件（个别组件用不同的 label/分组）。
 *
 * `key` 可覆盖默认的 `authEnabled`：数据感知族（骨架屏/加载动画/空态占位）用
 * `bindAuthEnabled` 区分「探测配置」与内容数据源，语义相同（同一份选项与解析函数），
 * 只是落在不同的配置键上。
 */
export function authEnabledField(opts: {
  key?: string;
  hidden?: (c: Record<string, unknown>) => boolean;
  label?: string;
  help?: string;
  group?: string;
} = {}): ConfigField {
  return {
    key: opts.key ?? "authEnabled",
    label: opts.label ?? "认证注入",
    type: "select",
    group: opts.group ?? "数据源",
    options: AUTH_ENABLED_OPTIONS,
    // 关键：显式声明默认值，面板才能把「未设置」如实显示成「跟随站点全局」
    defaultValue: null,
    help: opts.help ?? AUTH_ENABLED_HELP,
    hidden: opts.hidden,
  };
}

/**
 * 解析组件级三态值 —— 编辑区所有消费点唯一入口。
 *
 * 历史配置里可能残留字符串（面板早期把选项值 String() 后写回，见 fieldSelect.ts 注释），
 * 统一在这里收敛，避免"编辑区当真值、发布端当真值"这类两端不一致。
 */
export function readAuthEnabled(raw: unknown): boolean | null {
  return readTriState(raw);
}
