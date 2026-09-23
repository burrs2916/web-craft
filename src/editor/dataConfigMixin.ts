/**
 * 数据配置 Mixin — **显式声明**才生效的通用数据接入协议
 *
 * 设计目标：
 *   1. 想用通用数据源分组的组件在注册时写 `dataConfigMixin: true`，即可获得这组字段
 *   2. 支持 "静态数据" 和 "API 动态数据" 两种模式
 *   3. API 模式下可一键启用认证注入（复用 websiteAuthStore 的 token）
 *   4. Editor 运行时和 Codegen 发布产物共用同一套字段语义
 *
 * ⚠️ 为什么不再是"自动注入"：
 *   历史上注册表按"类目前缀 + 跳过名单"自动注入本分组，结果 32 个组件里 29 个
 *   **改了这组字段产物毫无变化**（属性栏出现 9~10 条死控件）。判断某组件是否真的消费
 *   这组字段没有可靠的静态依据，所以改为显式声明：不声明 = 一个字段都不注入。
 *   自持数据字段的组件（表格/列表/图表/图标/表单选项型/媒体图片音频等）都走自己的
 *   `dataSourceSchemaFields*` 或自有 schema，不需要本分组。
 *
 * 字段说明：
 *   - dataMode:        "static" = 静态数据 | "api" = API 动态拉取
 *   - staticData:      静态模式下的数据值（JSON / 文本 / 数字）
 *   - apiPath:          API 路径，如 "/dashboard/stats"，运行时与全局 baseUrl 拼接
 *   - apiUrl:           完整 URL（以 http:// 或 https:// 开头时跳过 baseUrl 拼接），优先级高于 apiPath
 *   - apiMethod:        GET | POST
 *   - apiBody:          POST 请求体（JSON）
 *   - apiHeaders:       组件级额外 headers（会与全局默认 headers 合并）
 *   - apiInterval:      轮询间隔（秒），0 = 只拉取一次
 *   - apiDataPath:      响应取值路径，如 "data.metrics.cpu"，用点号分隔
 *   - authEnabled:      是否注入认证 header，null = 跟随全局 apiConfig.authEnabled
 */

import type { ConfigField } from "../types/editor";
import { authEnabledField } from "./data/authMode";

/* ──────────────────────────────────────────────
 * 默认值 — 合并进每个组件的 defaultConfig
 * ────────────────────────────────────────────── */
export const DATA_CONFIG_DEFAULTS: Record<string, unknown> = {
  dataMode: "static",        // 默认静态模式，不影响现有组件行为
  staticData: "",             // 静态数据默认空字符串
  apiPath: "",                // API 路径
  apiUrl: "",                 // 完整 URL（高级用户）
  apiMethod: "GET",           // 请求方法
  apiBody: "",                // POST 请求体
  apiHeaders: "",             // 额外 headers（JSON 字符串）
  apiInterval: 0,             // 轮询间隔（秒），0 = 只拉一次
  apiDataPath: "",            // 响应取值路径
  authEnabled: null,          // null = 跟随全局配置
};

/* ──────────────────────────────────────────────
 * 属性面板 Schema — 合并进每个组件的 configSchema
 * ────────────────────────────────────────────── */
export const DATA_CONFIG_SCHEMA: ConfigField[] = [
  // ── 数据源分组标题 ──
  {
    key: "__dataGroupTitle",
    label: "数据源",
    type: "group",
    group: "数据源",
  },

  // ── 数据模式切换 ──
  {
    key: "dataMode",
    label: "数据模式",
    type: "select",
    group: "数据源",
    options: [
      { label: "静态数据", value: "static" },
      { label: "API 动态数据", value: "api" },
    ],
    help: "静态模式使用固定数据；API 模式从服务端动态拉取数据",
  },

  // ── 静态数据输入（仅 static 模式显示） ──
  {
    key: "staticData",
    label: "静态数据",
    type: "json-data",
    group: "数据源",
    placeholder: "输入静态数据（JSON / 文本 / 数字）",
    hidden: (config) => config.dataMode !== "static",
  },

  // ── API 路径（仅 api 模式显示） ──
  {
    key: "apiPath",
    label: "API 路径",
    type: "text",
    group: "数据源",
    placeholder: "如 /dashboard/stats",
    help: "与全局 Base URL 拼接。填写完整 URL（http 开头）时跳过拼接",
    hidden: (config) => config.dataMode !== "api",
  },

  // ── 完整 URL（可选，高级用户） ──
  {
    key: "apiUrl",
    label: "完整 URL（覆盖 Base URL）",
    type: "text",
    group: "数据源",
    placeholder: "https://api.example.com/v1/stats",
    help: "填写后忽略全局 Base URL 和 API 路径，直接使用此 URL",
    hidden: (config) => config.dataMode !== "api",
  },

  // ── 请求方法 ──
  {
    key: "apiMethod",
    label: "请求方法",
    type: "select",
    group: "数据源",
    options: [
      { label: "GET", value: "GET" },
      { label: "POST", value: "POST" },
    ],
    hidden: (config) => config.dataMode !== "api",
  },

  // ── POST 请求体 ──
  {
    key: "apiBody",
    label: "请求体（JSON）",
    type: "json",
    group: "数据源",
    placeholder: '{"key": "value"}',
    help: "POST 请求时发送的 JSON 数据",
    hidden: (config) => config.dataMode !== "api" || config.apiMethod !== "POST",
  },

  // ── 轮询间隔 ──
  {
    key: "apiInterval",
    label: "轮询间隔（秒）",
    type: "number",
    group: "数据源",
    min: 0,
    step: 1,
    help: "0 = 只拉取一次；>0 = 每隔指定秒数自动刷新数据",
    hidden: (config) => config.dataMode !== "api",
  },

  // ── 响应取值路径 ──
  {
    key: "apiDataPath",
    label: "数据取值路径",
    type: "text",
    group: "数据源",
    placeholder: "如 data.metrics.cpu",
    help: "从 API 响应 JSON 中按点号路径提取目标值，留空则使用完整响应",
    hidden: (config) => config.dataMode !== "api",
  },

  // ── 额外 Headers ──
  {
    key: "apiHeaders",
    label: "额外请求头（JSON）",
    type: "json",
    group: "数据源",
    placeholder: '{"X-Custom-Header": "value"}',
    help: "组件级额外 headers，与全局默认 headers 合并",
    hidden: (config) => config.dataMode !== "api",
  },

  // ── 认证注入（三态：跟随全局 / 强制注入 / 明确不注入）──
  // 口径唯一来源：data/authMode.ts（选项与帮助文字不得在此重复手写，否则必然漂移）
  authEnabledField({ hidden: (config) => config.dataMode !== "api" }),
];

/* ──────────────────────────────────────────────
 * 数据配置字段名集合 — 用于运行时判断某 key 是否属于数据配置
 * ────────────────────────────────────────────── */
export const DATA_CONFIG_KEYS = Object.keys(DATA_CONFIG_DEFAULTS);

/**
 * 从组件 config 中提取有效的数据配置（过滤掉空值和 __dataGroupTitle）
 */
export function extractDataConfig(config: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of DATA_CONFIG_KEYS) {
    if (key in config) {
      result[key] = config[key];
    }
  }
  return result;
}
