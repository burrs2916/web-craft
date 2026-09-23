import type { ConfigField } from "../types/editor";
import { authEnabledField } from "./data/authMode";

/* ──────────────────────────────────────────────
 * 显隐条件（多字段共享，避免重复手写）
 * ────────────────────────────────────────────── */

/** 是否绑定了某个全局数据源（绑定后隐藏本组件自带数据配置） */
const isBoundToGlobal = (c: Record<string, unknown>) => Boolean(c.dataSourceId);

/** 本地 API 字段是否隐藏：绑定全局源，或当前非 API 模式 */
const isLocalApiHidden = (c: Record<string, unknown>) =>
  isBoundToGlobal(c) || (c.dataMode ?? "static") !== "api";

/** 静态数据字段是否隐藏：绑定全局源，或当前非静态模式 */
const isLocalStaticHidden = (c: Record<string, unknown>) =>
  isBoundToGlobal(c) || (c.dataMode ?? "static") !== "static";

/* ──────────────────────────────────────────────
 * 公共字段
 * ────────────────────────────────────────────── */

/** 全局数据源绑定字段（组件通过它绑定场景级数据源，绑定后忽略自带数据） */
const globalDataSourceField: ConfigField = {
  key: "dataSourceId",
  label: "全局数据源",
  type: "global-datasource",
  group: "数据源",
  help: "绑定后本组件数据来自该全局数据源，忽略下方自带静态/接口配置",
};

/** 数据模式字段（绑定全局源后隐藏） */
const dataModeField: ConfigField = {
  key: "dataMode",
  label: "数据模式",
  type: "select",
  group: "数据源",
  options: [
    { label: "静态数据", value: "static" },
    { label: "接口读取", value: "api" },
  ],
  hidden: isBoundToGlobal,
};

/**
 * 接口取数字段组（apiUrl/apiPath/apiMethod/apiDataPath/apiHeaders/apiBody/apiInterval/authEnabled）。
 * 供"展示数据型"与"条目型"组件复用；每个字段仅在未绑定全局源且处于 API 模式时暴露。
 */
function apiFields(hidden: (c: Record<string, unknown>) => boolean): ConfigField[] {
  return [
    {
      key: "apiUrl",
      label: "API 地址",
      type: "text",
      group: "数据源",
      hidden,
      placeholder: "https://api.example.com/metrics",
      help: "完整地址直连；相对路径自动拼接全局 baseUrl",
    },
    {
      key: "apiPath",
      label: "接口路径",
      type: "text",
      group: "数据源",
      hidden,
      placeholder: "metrics/summary",
      help: "与全局 baseUrl 拼接；填写完整 API 地址时可留空",
    },
    {
      key: "apiMethod",
      label: "请求方式",
      type: "select",
      group: "数据源",
      hidden,
      options: [
        { label: "GET", value: "GET" },
        { label: "POST", value: "POST" },
      ],
    },
    {
      key: "apiDataPath",
      label: "数据路径",
      type: "text",
      group: "数据源",
      hidden,
      placeholder: "data.list 或 items",
      help: "从接口响应取值，支持点路径",
    },
    {
      key: "apiHeaders",
      label: "请求头",
      type: "map-editor",
      group: "数据源",
      hidden,
      placeholder: "Header 名",
    },
    {
      key: "apiBody",
      label: "请求体",
      type: "map-editor",
      group: "数据源",
      hidden,
      placeholder: "字段名",
    },
    {
      key: "apiInterval",
      label: "轮询间隔(秒)",
      type: "number",
      min: 0,
      group: "数据源",
      hidden,
      help: "0 表示仅加载一次，大于 0 则周期性刷新",
    },
    // 认证接入三态：跟随站点全局 / 强制注入 / 明确不注入（口径见 data/authMode.ts）
    authEnabledField({ hidden }),
  ];
}

/**
 * 共享的数据源字段组：静态/接口两种模式，与 useApiDataFetch 运行时能力对应。
 * 供表格/列表/树等"展示数据型"组件复用，避免各组件重复维护。
 * 使用：在组件 configSchema 里展开 ...dataSourceSchemaFields
 */
export const dataSourceSchemaFields: ConfigField[] = [
  globalDataSourceField,
  dataModeField,
  {
    key: "staticData",
    label: "静态数据",
    type: "json-data",
    group: "数据源",
    hidden: isLocalStaticHidden,
  },
  ...apiFields(isLocalApiHidden),
];

/**
 * 条目型组件（面包屑/步骤条/时间线等）的数据源字段组：
 * 结构与 dataSourceSchemaFields 一致，但移除「静态数据」泛化表格入口——
 * 这类组件的内容由 itemFields 专用编辑器（如 面包屑项）承载，不再暴露 staticData，
 * 避免与内容组形成两个互相打架的数据入口。同时支持绑定全局数据源：
 * 当绑定全局静态源时，以该源的静态数据驱动条目。
 * 静态数据即"内容组条目"，接口读取时仍走 api* 与认证，语义与复用的 useApiDataFetch 一致。
 */
export const dataSourceSchemaFieldsNoStatic: ConfigField[] = [
  globalDataSourceField,
  dataModeField,
  ...apiFields(isLocalApiHidden),
];

/**
 * 共享的"数据感知显隐"基础字段：组件内容不渲染数据，而是轮询探测一个接口，
 * 据此决定自身显示/隐藏（骨架屏 / 加载动画 / 空态占位）。
 * bind* 前缀区分"探测配置"与内容数据源；URL/请求头/认证/请求体规则与统一取数骨架一致。
 */
const bindVisibilityBaseFields: ConfigField[] = [
  {
    key: "visibilityMode",
    label: "显隐模式",
    type: "select",
    group: "数据感知",
    options: [
      { label: "始终显示", value: "always" },
      { label: "接口驱动", value: "api" },
    ],
    help: "接口驱动：轮询下方接口，按结果自动显示/隐藏本组件",
  },
  {
    key: "bindUrl",
    label: "探测接口地址",
    type: "text",
    group: "数据感知",
    hidden: (c) => (c.visibilityMode ?? "always") !== "api",
    placeholder: "https://api.example.com/status",
    help: "完整地址直连；相对路径自动拼接全局 baseUrl",
  },
  {
    key: "bindMethod",
    label: "请求方式",
    type: "select",
    group: "数据感知",
    hidden: (c) => (c.visibilityMode ?? "always") !== "api",
    options: [
      { label: "GET", value: "GET" },
      { label: "POST", value: "POST" },
    ],
  },
  {
    key: "bindHeaders",
    label: "请求头(JSON)",
    type: "text",
    group: "数据感知",
    hidden: (c) => (c.visibilityMode ?? "always") !== "api",
    placeholder: '{"X-Org":"demo"}',
  },
  {
    key: "bindBody",
    label: "请求体(JSON)",
    type: "text",
    group: "数据感知",
    hidden: (c) => (c.visibilityMode ?? "always") !== "api",
    placeholder: '{"id":1}',
  },
  {
    key: "bindInterval",
    label: "轮询间隔(秒)",
    type: "number",
    min: 0,
    group: "数据感知",
    hidden: (c) => (c.visibilityMode ?? "always") !== "api",
    help: "0 = 仅探测一次，大于 0 则周期性刷新显隐状态",
  },
  // 认证接入三态（与内容数据源同一份选项与解析函数，见 data/authMode.ts）：
  // 此前这里是两态 toggle，缺省渲染成 OFF，而运行时把 `undefined` 当"不带 Token" ——
  // 面板无法表达"跟随站点全局"这一最常用意图，站点全局开启时两边观感还会相反。
  authEnabledField({
    key: "bindAuthEnabled",
    group: "数据感知",
    hidden: (c) => (c.visibilityMode ?? "always") !== "api",
    help: "与内容数据源同一口径：跟随站点全局 / 强制注入 / 公开接口明确不带",
  }),
];

/** 加载感知显隐（骨架屏 / 加载动画）：接口成功返回即隐藏 */
export const bindVisibilitySchemaFields: ConfigField[] = [
  ...bindVisibilityBaseFields,
  {
    key: "hideOnError",
    label: "请求失败隐藏",
    type: "toggle",
    group: "数据感知",
    defaultValue: false,
    help: "开：探测失败时隐藏本组件；关：失败时继续显示",
    hidden: (c) => (c.visibilityMode ?? "always") !== "api",
  },
];

/** 空态感知显隐（空态占位）：按判空规则决定显示/隐藏 */
export const bindEmptyStateSchemaFields: ConfigField[] = [
  ...bindVisibilityBaseFields,
  {
    key: "bindDataPath",
    label: "数据路径",
    type: "text",
    group: "数据感知",
    hidden: (c) => (c.visibilityMode ?? "always") !== "api",
    placeholder: "data.list",
    help: "从接口响应取值用于判空，支持点路径；留空用整个响应",
  },
  {
    key: "emptyWhen",
    label: "判空规则",
    type: "select",
    group: "数据感知",
    hidden: (c) => (c.visibilityMode ?? "always") !== "api",
    options: [
      { label: "空值/空对象", value: "emptyValue" },
      { label: "空数组", value: "emptyArray" },
      { label: "等于 0", value: "zero" },
      { label: "为假值", value: "falsy" },
    ],
  },
  {
    key: "showWhenEmpty",
    label: "空值显示",
    type: "toggle",
    group: "数据感知",
    defaultValue: true,
    help: "开：返回值算空则显示占位；关：算空则隐藏",
    hidden: (c) => (c.visibilityMode ?? "always") !== "api",
  },
  {
    key: "hideOnError",
    label: "请求失败隐藏",
    type: "toggle",
    group: "数据感知",
    defaultValue: true,
    help: "开：探测失败时隐藏占位；关：失败时继续显示",
    hidden: (c) => (c.visibilityMode ?? "always") !== "api",
  },
];