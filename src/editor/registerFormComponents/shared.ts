import type { ConfigField } from "../../types/editor";
import { TOGGLE_FONT_WEIGHT_DEFAULT, TOGGLE_FONT_WEIGHT_OPTIONS, TOGGLE_RADIUS_DEFAULT } from "../data/toggleStyle";

/** 接口字段显隐：未绑定全局源且处于 API 模式才暴露（与 isLocalApiHidden 同源语义） */
export const isLocalApiHiddenLocal = (c: Record<string, unknown>) =>
  Boolean(c.dataSourceId) || (c.dataMode ?? "static") !== "api";

/** 可校验表单控件的共享校验配置片段（必填独立，这里是额外校验规则） */
export const validationSchema: ConfigField[] = [
  { key: "validateType", label: "额外校验", type: "select", group: "校验", options: [
    { label: "无", value: "none" },
    { label: "邮箱", value: "email" },
    { label: "手机号", value: "phone" },
    { label: "数字", value: "number" },
    { label: "自定义正则", value: "regex" },
  ], help: "在必填之外附加格式校验，提交时统一拦截并提示" },
  { key: "validateMin", label: "数值下限", type: "number", group: "校验", placeholder: "如 0",
    help: "数字类型的取值下限（含等值）；留空不限制", hidden: (c) => (c.validateType ?? "none") !== "number" },
  { key: "validateMax", label: "数值上限", type: "number", group: "校验", placeholder: "如 100",
    help: "数字类型的取值上限（含等值）；留空不限制", hidden: (c) => (c.validateType ?? "none") !== "number" },
  { key: "validateRegex", label: "正则表达式", type: "text", group: "校验", hidden: (c) => (c.validateType ?? "none") !== "regex", placeholder: "如 ^[a-z]{3,}$" },
  { key: "validateMessage", label: "错误提示", type: "text", group: "校验", placeholder: "留空使用默认提示", help: "优先级高于规则默认文案" },
  { key: "errorColor", label: "错误颜色", type: "color", group: "校验",
    help: "校验失败时边框与提示文字的颜色，默认红色" },
];

/**
 * 选项型/开关型控件的校验片段（复选框、单选组共用）：这类控件取值只能是固定枚举
 * （复选框为 勾选/未勾选，单选组为预设的选项提交值），邮箱/手机号/数字/正则等格式类规则
 * 对枚举值毫无意义且极易配出"必然失败"的表单，故从共享 validationSchema 中只取
 * 「错误提示」与「错误颜色」，保持校验文案/配色的单一来源。
 */
export const choiceValidationSchema: ConfigField[] = validationSchema.filter(
  (f) => f.key === "validateMessage" || f.key === "errorColor",
);

// 基础开关（switch）合并表单能力后共用同一校验片段，禁止第二份实现

/**
 * 「居中 + 随拖动框等比缩放」的共享面板片段（本仓库全组件族的横切能力）。
 *
 * 拆成三个独立字段而不是一个数组：`align` 在部分组件里本来就有（沿用既有 key，
 * 不能出现两个同 key 的字段），按组件挑选组合即可，字面量仍只此一份。
 * 取值口径与 `editor/data/scaleFit.ts`（scaleStageCss / fitFactor）严格对应：
 * align → justifyContent，vAlign → alignItems，scaleFit → 是否挂缩放系数。
 */
export const scaleFitField: ConfigField = {
  key: "scaleFit",
  label: "随拖动框等比缩放",
  type: "toggle",
  group: "布局",
  help: "开：内容按设计基准等比放大/缩小并居中（保持比例、不拉伸变形），拖动框连续改变尺寸时实时跟随；"
    + "关：始终按原始尺寸显示",
};

/**
 * 字段型控件的「文字随框缩放」开关 —— 与上面的 transform 缩放是两种机制：
 * 字段层铺满拖动框、边框环随框走（几何已自动「随框」），缺的是**排版密度**——
 * 框放大后字号不动，4K 大屏上「框大字小」。开启后字号（含派生的图标宽、行高）
 * 按「框相对注册表 defaultSize 的倍率」编译期等比缩放；不碰几何、默认关（零回归）。
 */
export const fieldScaleFitField: ConfigField = {
  key: "scaleFit",
  label: "文字随框缩放",
  type: "toggle",
  group: "布局",
  help: "开：字号随拖动框相对默认尺寸的倍率等比缩放（框放大一倍、文字也放大一倍，适配大屏）；"
    + "关：字号固定",
};

export const hAlignField: ConfigField = {
  key: "align",
  label: "水平对齐",
  type: "select",
  group: "布局",
  options: [
    { label: "左对齐", value: "left" },
    { label: "居中", value: "center" },
    { label: "右对齐", value: "right" },
  ],
  help: "内容（自然尺寸）在拖动框内的水平位置",
};

export const vAlignField: ConfigField = {
  key: "vAlign",
  label: "垂直对齐",
  type: "select",
  group: "布局",
  options: [
    { label: "顶部", value: "top" },
    { label: "居中", value: "center" },
    { label: "底部", value: "bottom" },
  ],
  help: "内容（自然尺寸）在拖动框内的垂直位置；默认居中",
};

/** 选项型控件的接口字段映射（与 form-select 同一套语义） */
export const choiceApiMappingFields: ConfigField[] = [
  { key: "apiValueField", label: "选项值字段", type: "text", group: "数据源", hidden: isLocalApiHiddenLocal,
    placeholder: "如 id", help: "接口返回对象的取值字段作为提交值；留空依次回退 id → value" },
  { key: "apiLabelField", label: "选项显示字段", type: "text", group: "数据源", hidden: isLocalApiHiddenLocal,
    placeholder: "如 name", help: "接口返回对象的显示字段作为选项文字；留空依次回退 name → label → text → 值" },
];

/**
 * 开关 / 复选框共用的「外观层 + 标签排版」字段组。
 *
 * 外观层（底色/边框/圆角/内边距/不透明度）刻意挂在**缩放内层**，才能随拖动框一起等比缩放；
 * 取值口径唯一来源 `editor/data/toggleStyle.ts`（编辑区渲染器与发布端 codegen 同源），
 * 此处只负责把口径里的默认值与选项搬进面板 —— 面板里不得再写第二份默认值。
 */
export const toggleAppearanceSchemaFields: ConfigField[] = [
  { key: "bgColor", label: "底色", type: "color", group: "外观",
    help: "留空为透明；底色挂在缩放内层，会随拖动框一起放大缩小" },
  { key: "borderColor", label: "边框色", type: "color", group: "外观",
    help: "留空无边框；配合下方圆角使用" },
  { key: "borderWidth", label: "边框粗细", type: "number", min: 0, max: 12, group: "外观",
    hidden: (c) => !c.borderColor },
  { key: "borderRadius", label: "圆角", type: "number", min: 0, max: 24, group: "外观",
    defaultValue: TOGGLE_RADIUS_DEFAULT,
    help: "面板值 × 10 = 实际像素（与表单组其它控件同一口径）；需设置底色或边框后才可见" },
  { key: "paddingX", label: "左右内边距", type: "number", min: 0, max: 80, group: "外观" },
  { key: "paddingY", label: "上下内边距", type: "number", min: 0, max: 80, group: "外观" },
  { key: "opacity", label: "不透明度", type: "slider", min: 0, max: 1, step: 0.05, group: "外观",
    defaultValue: 1 },
  { key: "fontWeight", label: "标签字重", type: "select", group: "样式",
    options: TOGGLE_FONT_WEIGHT_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
    defaultValue: TOGGLE_FONT_WEIGHT_DEFAULT },
];
