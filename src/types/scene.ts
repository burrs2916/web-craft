import type { SceneComponent, LayerNode } from "./editor";

export type SceneStatus = "draft" | "published" | "archived";

export interface SceneCategory {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  sortOrder: number;
  parentId?: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SceneView {
  id: string;
  name: string;
  icon?: string;
  components: SceneComponent[];
  layers: LayerNode[];
  canvasConfig?: import("../store/editorStore").CanvasConfig;
  viewport?: import("../types/editor").ViewportState;
  eventBindings?: import("../types/editor").EventBinding[];
}

/**
 * 全局 API 配置 — 统一数据接入层的项目级配置
 *
 * 所有组件的 API 模式数据获取共用此配置：
 *   - baseUrl:       API 基地址，如 "https://api.example.com/v1"，组件的 apiPath 会与之拼接
 *   - authEnabled:   全局认证开关，组件 authEnabled 为 null 时跟随此值
 *   - defaultHeaders: 全局默认请求头，所有 API 请求自动携带
 *   - timeout:       请求超时（ms），默认 10000
 */
/** 全局自动加载反馈配置 — 发布端在页面存在进行中的网络请求时，自动显示全屏加载覆盖层 */
export interface SceneLoadingFeedback {
  enabled: boolean;
  /** 动画主色 */
  color?: string;
  /** 动画尺寸（px） */
  size?: number;
  /** 动画转速（秒/圈） */
  speed?: number;
  /** 圆环粗细（px） */
  strokeWidth?: number;
  /** 是否显示半透明遮罩 */
  masked?: boolean;
}

export interface SceneApiConfig {
  baseUrl: string;
  authEnabled: boolean;
  defaultHeaders?: Record<string, string>;
  timeout?: number;
  /** 站点运行模式：static=纯静态(离线内联数据)；dynamic=动态(依赖 API)；auto=按组件自动判定 */
  siteMode?: "static" | "dynamic" | "auto";
  /** 数据请求进行中自动显示的全屏加载覆盖层 */
  loadingFeedback?: SceneLoadingFeedback;
}

export function createDefaultApiConfig(): SceneApiConfig {
  return {
    baseUrl: "",
    authEnabled: false,
    defaultHeaders: {},
    timeout: 10000,
    siteMode: "auto",
    loadingFeedback: { enabled: true, color: "#0D9488", size: 36, speed: 1, strokeWidth: 4, masked: true },
  };
}

/**
 * 全局数据源 — 场景层统一定义的一处数据，多个组件通过 dataSourceId 绑定读取。
 * 字段与 useApiDataFetch 的 FetchConfig 兼容，静态/接口两种模式共用同一套拉取逻辑。
 */
export interface SceneDataSource {
  id: string;
  /** 展示名（供绑定下拉与面板展示） */
  name: string;
  dataMode: "static" | "api";
  /** 静态模式数据（编辑端由 StaticDataEditor 维护） */
  staticData?: unknown;
  /** 完整 URL（以 http 开头时跳过 baseUrl 拼接），优先级高于 apiPath */
  apiUrl?: string;
  /** 相对路径，与全局 baseUrl 拼接 */
  apiPath?: string;
  apiMethod?: "GET" | "POST";
  apiBody?: unknown;
  apiHeaders?: unknown;
  /** 响应取值路径，如 "data.metrics.cpu" */
  apiDataPath?: string;
  /** 轮询间隔（秒），0 = 只拉取一次 */
  apiInterval?: number;
  /** 认证：true=注入认证 header, false=不注入, null=跟随全局 */
  authEnabled?: boolean | null;
}

export function createDefaultDataSource(name = "数据源"): SceneDataSource {
  return {
    id: `ds_${Math.random().toString(36).slice(2, 8)}`,
    name,
    dataMode: "static",
    staticData: [],
    authEnabled: null,
  };
}

export interface SceneDSL {
  id: string;
  name: string;
  /** 全局数据源（id → source），绑定组件的发布端数据来源 */
  dataSources?: SceneDataSource[];
  description?: string;

  // IoT/GIS 遗留字段 — 全部可选，网站编辑器不使用
  coordinateSystem?: string;
  camera?: Record<string, any>;
  bounds?: unknown;
  layers?: SceneLayer[];
  bindings?: SceneBinding[];
  variables?: SceneVariable[];
  viewportSyncRules?: unknown[];
  layout?: unknown[];

  // 网站编辑器核心字段
  globalComponents?: SceneComponent[];
  views?: SceneView[];
  activeViewId?: string;

  editorComponents?: SceneComponent[];
  editorLayers?: LayerNode[];
  canvasConfig?: import("../store/editorStore").CanvasConfig;

  // ── 全局 API 配置 — 统一数据接入层的全局入口 ──
  apiConfig?: SceneApiConfig;

  categoryId?: string;
  tags: string[];
  thumbnail?: string;

  status: SceneStatus;
  publishedAt?: number;

  metadata: Record<string, unknown>;

  createdAt: number;
  updatedAt: number;
}

export interface SceneTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  preview?: string;
  defaults: Partial<SceneDSL>;
}

export const SCENE_TEMPLATES: SceneTemplate[] = [
  {
    id: "blank",
    name: "空白网站",
    description: "从零开始创建网站",
    icon: "note_add",
    defaults: {},
  },
  {
    id: "landing-page",
    name: "落地页",
    description: "单页落地页，适合产品展示、活动推广",
    icon: "web",
    defaults: {
      tags: ["landing", "营销"],
    },
  },
  {
    id: "blog",
    name: "博客网站",
    description: "文章列表 + 详情页结构",
    icon: "article",
    defaults: {
      tags: ["blog", "内容"],
    },
  },
  {
    id: "dashboard",
    name: "数据看板",
    description: "数据可视化看板，适合展示图表和指标",
    icon: "dashboard",
    defaults: {
      tags: ["dashboard", "数据"],
    },
  },
];

export function createDefaultScene(partial?: Partial<SceneDSL>): SceneDSL {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: `scene_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    name: "未命名网站",
    tags: [],
    status: "draft",
    metadata: {},
    apiConfig: createDefaultApiConfig(),
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function createSceneFromTemplate(template: SceneTemplate, partial?: Partial<SceneDSL>): SceneDSL {
  return createDefaultScene({
    ...template.defaults,
    name: template.name,
    ...partial,
  });
}

// ─── IoT/GIS 遗留类型存根（仅满足 dead code 导入，网站编辑器不使用） ───
export type SceneLayerType = string;
export type SpatialLayerType = string;
export type DataOverlayLayerType = string;
export type WidgetOverlayLayerType = string;

export interface SceneLayer {
  id: string;
  name: string;
  type: SceneLayerType;
  dimension: "2d" | "3d";
  source: Record<string, any>;
  visible: boolean;
  zIndex: number;
  opacity?: number;
  minZoom?: number;
  maxZoom?: number;
  style?: Record<string, any>;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface SceneBinding {
  id: string;
  sourceId: string;
  targetId: string;
  property: string;
  transform?: SceneTransformConfig;
  [key: string]: any;
}

export interface SceneVariable {
  id: string;
  name: string;
  type: string;
  value: any;
  [key: string]: any;
}

export interface SceneConfig {
  id: string;
  name: string;
  layers: SceneLayer[];
  bindings: SceneBinding[];
  variables: SceneVariable[];
  [key: string]: any;
}

export interface SceneTransformConfig {
  type: string;
  expression?: string;
  params?: Record<string, any>;
  [key: string]: any;
}

export function createDefaultSceneLayer(partial?: Partial<SceneLayer>): SceneLayer {
  return {
    id: `layer_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    name: "未命名图层",
    type: "geojson",
    dimension: "2d",
    source: {},
    visible: true,
    zIndex: 0,
    ...partial,
  };
}
