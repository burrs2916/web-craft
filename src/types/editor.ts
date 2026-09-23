import type { ComponentType } from "react";

export type BackgroundType = "solid" | "gradient" | "image" | "video";
export type GradientDirection = "to-right" | "to-left" | "to-bottom" | "to-top" | "to-bottom-right" | "to-bottom-left" | "to-top-right" | "to-top-left" | "radial";
export type ImageFit = "cover" | "contain" | "fill" | "none";

export interface CanvasBackground {
  type: BackgroundType;
  color: string;
  gradient: {
    direction: GradientDirection;
    colors: [string, string];
  };
  imageUrl: string;
  imageFit: ImageFit;
  videoUrl: string;
  videoAutoplay: boolean;
  videoMuted: boolean;
  videoLoop: boolean;
}

export interface ComponentCapabilities {
  resizable: boolean;
  rotatable: boolean;
  draggable: boolean;
  connectable: boolean;
  embeddable: boolean;
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Transform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scale: { x: number; y: number };
}

export interface EventDefinition {
  id: string;
  name: string;
  description?: string;
}

export interface ActionDefinition {
  id: string;
  name: string;
  description?: string;
  disabled?: boolean;
  disabledReason?: string;
}

export type DataBindingType = "value" | "style" | "visibility" | "action";

export interface DataBinding {
  id: string;
  sourceId: string;
  field: string;
  targetProperty: string;
  transform?: string;
  type: DataBindingType;
}

/** 事件触发源类型 */
export type EventTriggerSource =
  | 'interaction'   // 用户交互（onClick/onDblClick/onMouseEnter/onMouseLeave）
  | 'data'          // 数据变化触发
  | 'threshold'     // 阈值越限触发
  | 'timer'          // 定时触发
  | 'state';        // 状态切换触发

/** 数据变化触发配置 */
export interface DataTriggerConfig {
  /** 监听的数据源 ID（关联 dataSourceStore） */
  dataSourceId?: string;
  /** 监听的组件 ID（取该组件的 config 数据） */
  componentId?: string;
  /** 监听的数据字段路径，如 "value" / "config.tag.value" */
  field?: string;
  /** 值变化时触发条件（可选，不填则任何变化都触发） */
  condition?: string;
}

/** 阈值触发配置 */
export interface ThresholdTriggerConfig {
  /** 数据源 ID */
  dataSourceId?: string;
  /** 组件 ID */
  componentId?: string;
  /** 监听字段 */
  field?: string;
  /** 比较运算符 */
  operator: '>' | '>=' | '<' | '<=' | '==' | '!=';
  /** 阈值 */
  threshold: number | string;
  /** 触发方向：rising（上升沿越限）/ falling（下降沿恢复）/ both */
  edge?: 'rising' | 'falling' | 'both';
}

/** 定时触发配置 */
export interface TimerTriggerConfig {
  /** 触发间隔（毫秒） */
  interval: number;
  /** 是否只触发一次 */
  once?: boolean;
  /** 延迟启动（毫秒） */
  delay?: number;
}

export interface EventBinding {
  id: string;
  sourceComponentId: string;
  sourceEvent: string;
  targetComponentId: string;
  targetAction: string;
  params?: Record<string, unknown>;
  condition?: string;
  /** ── 运行时控制 ── */
  /** 是否启用（默认 true） */
  enabled?: boolean;
  /** 节流间隔（ms），同一事件在间隔内只触发一次 */
  throttle?: number;
  /** 防抖延迟（ms），事件停止 N ms 后才触发 */
  debounce?: number;
  /** ── 触发源扩展 ── */
  /** 触发源类型（默认 'interaction'） */
  triggerSource?: EventTriggerSource;
  /** 数据变化触发配置（triggerSource='data' 时生效） */
  dataTrigger?: DataTriggerConfig;
  /** 阈值触发配置（triggerSource='threshold' 时生效） */
  thresholdTrigger?: ThresholdTriggerConfig;
  /** 定时触发配置（triggerSource='timer' 时生效） */
  timerTrigger?: TimerTriggerConfig;
}

export interface DataSchema {
  sourceType: "static" | "api" | "websocket" | "database";
  staticData?: unknown;
  apiConfig?: {
    url: string;
    method: "GET" | "POST";
    headers?: Record<string, string>;
    body?: unknown;
    refreshInterval?: number;
  };
  websocketConfig?: {
    url: string;
    protocols?: string[];
  };
  transform?: string;
}

export interface ComponentRendererProps {
  config: Record<string, unknown>;
  componentId: string;
  mode?: "preview" | "edit";
  width?: number;
  height?: number;
  onConfigChange?: (key: string, value: unknown) => void;
  contentInteractionActive?: boolean;
  onInteractionLockChange?: (locked: boolean) => void;
  spatialContext?: SpatialRendererContext;
  editorSelected?: boolean;
  /** 容器类组件（如 form-container）的真实子组件，用于让 renderer 感知子组件是否存在并相应隐藏占位/提示 */
  childComponents?: SceneComponent[];
}

export interface SpatialRendererContext {
  coordinateEngine: import("../editor/spatial/CoordinateEngine").CoordinateEngine;
  viewportSyncService: import("../editor/spatial/ViewportSyncService").ViewportSyncService;
  clock: { subscribe: (listener: (time: { elapsed: number; delta: number }) => void) => (() => void); setSpeed: (speed: number) => void; getTime: () => { elapsed: number; delta: number; tick: number; timestamp: number; isPaused: boolean; speed: number } };
  dataBridge: import("../datasource/orchestration/DataOrchestrator").ComponentDataBridge;
  crs: import("./spatial").CRSType;
}

export type RendererLoader = () => Promise<{ default: ComponentType<ComponentRendererProps> }>;

export interface RendererDescriptor {
  loader: RendererLoader;
  cached?: ComponentType<ComponentRendererProps>;
}

export interface PluginManifest {
  type: string;
  name: string;
  icon: string;
  description?: string;
  category: string;
  version: string;
  defaultSize: Size;
  defaultConfig: Record<string, unknown>;
  capabilities: ComponentCapabilities;
  configSchema?: ConfigField[];
  renderer: {
    entry: string;
    format: "module" | "umd" | "schema" | "builtin";
    lazy?: boolean;
  };
  events?: EventDefinition[];
  actions?: ActionDefinition[];
  dataSchema?: DataSchema;
  dependencies?: { name: string; version: string; global?: string }[];
  permissions?: string[];
  author?: string;
  homepage?: string;
  thumbnail?: string;
  builtIn?: boolean;
  enabled?: boolean;
}

export interface SceneComponent {
  id: string;
  type: string;
  name: string;

  transform: Transform;
  layerId: string;
  zIndex: number;
  locked: boolean;
  visible: boolean;

  config: Record<string, unknown>;
  style?: Record<string, unknown>;

  /** 响应式断点覆盖：tablet/mobile 断点下独立的 transform 和 style */
  responsiveOverrides?: Partial<Record<Exclude<BreakpointId, "desktop">, ResponsiveOverride>>;

  bindings?: DataBinding[];
  events?: EventBinding[];

  children?: string[];
  parentId?: string | null;
}

export interface ComponentChildTemplate {
  type: string;
  /** 覆盖 defaultConfig 的部分配置 */
  config?: Record<string, unknown>;
  /** 子组件高度（默认取该组件 defaultSize.height） */
  height?: number;
}

export interface ComponentDefinition {
  type: string;
  name: string;
  icon: string;
  description?: string;
  category: string;
  version: string;
  defaultSize: Size;
  minSize?: Size;
  defaultConfig: Record<string, unknown>;
  capabilities: ComponentCapabilities;
  configSchema?: ConfigField[];
  renderer: RendererDescriptor;
  events?: EventDefinition[];
  actions?: ActionDefinition[];
  dataSchema?: DataSchema;
  /**
   * 预置子组件模板：拖入本组件到此画布时，自动一并创建这些子组件挂到其下（整块拖入）。
   * 多用于表单容器等可嵌入组件，提供开箱即用的默认控件集。
   */
  defaultChildren?: ComponentChildTemplate[];
  builtIn?: boolean;
  enabled?: boolean;
  layerType?: 'spatial' | 'overlay' | 'widget';
  /**
   * 标记组件是"操作型"（强喷/强停/视频播放/定时控制等），
   * 即使没有 eventBindings 也要在预览/发布模式下保持交互能力。
   * 默认 false（纯展示型组件）。
   */
  requiresInteraction?: boolean;
  /**
   * 显式声明"本组件使用通用数据源分组"。
   *
   * 置 true 时注册表才会把 `dataConfigMixin` 的默认值与字段合并进本组件
   * （未声明的组件一个字段都不会被塞进去）。
   *
   * 为什么必须显式：此前是按"类目前缀 + 跳过名单"启发式注入，结果 29 个组件的属性栏
   * 出现整组（9~10 条）**改了产物毫无变化**的控件 —— 用户配了不生效，比没有更糟。
   * 现在组件想用通用数据源就自己声明；自持 dataMode/apiUrl 等字段的组件（表格/列表/
   * 图表/图标等）本来就不需要它。
   */
  dataConfigMixin?: boolean;
}

export interface ConfigField {
  key: string;
  label: string;
  type?: "number" | "text" | "select" | "color" | "toggle" | "slider" | "textarea" | "json" | "file" | "group" | "mapLibrary" | "datasource" | "datafield" | "deviceSelect" | "tagMultiSelect" | "dbTable" | "dbColumn" | "action" | "deviceMultiSelect" | "keyValueMapping" | "dataSourceInfo" | "menu-items" | "pane-editor" | "tab-editor" | "icon-picker" | "metric-icon-picker" | "json-data" | "map-editor" | "list-editor" | "cascader-options" | "api-field-picker" | "form-fields" | "global-datasource" | "button-action";
  /** menu-items 专用：是否允许子级菜单（侧边栏 true，水平导航 false） */
  nested?: boolean;
  defaultValue?: unknown;
  /**
   * deviceMultiSelect 专用：设备过滤条件
   * productCode：只显示指定产品码的设备（如只显示集控器）
   */
  deviceFilter?: { productCode?: string[] };
  /**
   * deviceMultiSelect 专用：最大可选数量（用于实现单选限制，如 maxSelectable: 1）
   */
  maxSelectable?: number;
  options?: { label: string; value: unknown }[];
  /**
   * 字段说明文字（显示在输入框下方）
   */
  help?: string;
  /**
   * 字段级实时诊断：返回则在下拉框下方渲染状态条（成功/提醒/错误），返回 null 不渲染。
   *
   * 用途：把「当前写法被解析成了什么」直接告诉用户，替掉静默降级/静默截断。
   * 典型：级联选择的「选项数据」写错 JSON、「默认选中路径」写错层级。
   * 回调必须是纯函数（每次渲染都会调用），不得有副作用。
   */
  diagnose?: (config: Record<string, unknown>) => {
    level: "ok" | "warn" | "error" | "info";
    text: string;
    detail?: string;
  } | null;
  /**
   * tagMultiSelect 专用：动态生成选项的回调（一般是当前设备的 ProductTag[]）
   * 返回 [{ label, value }, ...]；返回 undefined 时该字段不渲染
   */
  dynamicOptions?: (config: Record<string, unknown>) => Array<{ label: string; value: string }> | undefined;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  group?: string;
  /** dbColumn 专用：过滤字段类型（time=只显示时间类型，numeric=只显示数值类型） */
  columnFilter?: "time" | "numeric";
  /** select 专用：为 true 时渲染为可自由输入的 Autocomplete（combobox 模式） */
  editable?: boolean;
  /** 适用的图表类型列表（仅折线图等支持多类型的组件使用）。未指定则全部适用 */
  types?: string[];
  hidden?: (config: Record<string, unknown>) => boolean;
  fields?: ConfigField[];
  mapType?: "cad" | "tile" | "blueprint" | "globe" | "heatmap";
  /** action 字段专用：动作名（注册到 actionHandlers 的 key） */
  action?: string;
  /** action 字段专用：按钮文案（默认=label） */
  buttonLabel?: string;
  /** action 字段专用：点击后是否立即写回 config（用于触发"加载设备"等副作用） */
  writesConfig?: boolean;
  /** keyValueMapping 字段专用：键的标签（默认"键"） */
  keyLabel?: string;
  /** keyValueMapping 字段专用：值的标签（默认"值"） */
  valueLabel?: string;
  /** keyValueMapping 字段专用：值下拉选项（不填则 value 自由输入） */
  valueOptions?: Array<{ label: string; value: string }>;
  /** deviceMultiSelect 字段专用：列表显示列字段（deviceId / productName / kind / online） */
  displayColumns?: string[];
  /** text/number 等输入字段专用：只读，不可编辑 */
  readOnly?: boolean;
  /** list-editor 专用：每条记录的字段 schema（复用 ConfigField[]，仅支持 text/select/toggle） */
  itemFields?: ConfigField[];
  /** list-editor 专用：每条记录的标题字段 key（用于折叠面板摘要显示） */
  itemLabelKey?: string;
  /** list-editor 专用：添加按钮文案 */
  addItemLabel?: string;
  /** list-editor 专用：最大条目数（0 = 不限制） */
  maxItems?: number;
  /**
   * 旧字段名（自动迁移兼容）：当 config[key] 不存在时，从该字段取值并在属性面板中呈现，
   * 保证"面板所见 = 画布/发布所得"。用户一旦编辑即写回 key（旧字段自然失效）。
   * 典型：form-select 由 options 文本迁移到 items 数组。
   */
  legacyKey?: string;
  /** legacyKey 取值的转换（如旧文本 → 条目数组）；缺省原样返回 */
  legacyParse?: (raw: unknown) => unknown;
}

export interface LayerNode {
  id: string;
  name: string;
  type: "layer" | "group";
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode?: string;
  parentId: string | null;
  children: string[];
  order: number;
  expanded: boolean;
  color?: string;
  metadata?: Record<string, unknown>;
  isDefault?: boolean;
  isBackground?: boolean;
  background?: CanvasBackground;
}

export const CATEGORY_LABELS: Record<string, string> = {
  // ─── ccat_ 前缀（当前标准） ───
  ccat_basic: "基础组件",
  ccat_layout: "布局组件",
  ccat_form: "表单组件",
  ccat_auth: "认证组件",
  ccat_media: "媒体组件",
  ccat_table: "表格组件",
  ccat_chart: "图表组件",
  ccat_shape: "形状组件",
  ccat_decoration: "装饰组件",
  ccat_icon: "图标组件",
  // ─── 旧 key（向后兼容） ───
  basic: "基础组件",
  chart: "图表组件",
  "line-chart": "折线图",
  map: "地图组件",
  media: "媒体组件",
  decoration: "装饰组件",
  "decoration-title": "标题栏",
  table: "表格组件",
  custom: "自定义组件",
};

export interface ViewportState {
  scale: number;
  offset: { x: number; y: number };
}

export interface SelectionState {
  selectedIds: string[];
  hoveredId: string | null;
  isMultiSelect: boolean;
}

export interface HistoryEntry {
  id: string;
  timestamp: number;
  type: "add" | "update" | "delete" | "batch";
  before: SceneComponent[];
  after: SceneComponent[];
  layersBefore?: LayerNode[];
  layersAfter?: LayerNode[];
  canvasConfigBefore?: import("../store/editorStore").CanvasConfig;
  canvasConfigAfter?: import("../store/editorStore").CanvasConfig;
}

export function createDefaultTransform(override?: Partial<Transform>): Transform {
  return {
    x: override?.x ?? 0,
    y: override?.y ?? 0,
    width: override?.width ?? 200,
    height: override?.height ?? 150,
    rotation: override?.rotation ?? 0,
    scale: override?.scale ?? { x: 1, y: 1 },
  };
}

export function createDefaultSceneComponent(
  definition: ComponentDefinition,
  layerId: string,
  position?: Partial<Point>,
  parentId?: string | null,
): SceneComponent {
  return {
    id: `comp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    type: definition.type,
    name: definition.name,
    transform: createDefaultTransform({
      ...definition.defaultSize,
      ...position,
    }),
    layerId,
    zIndex: 0,
    locked: false,
    visible: true,
    config: JSON.parse(JSON.stringify(definition.defaultConfig)),
    parentId: parentId ?? null,
    children: [],
  };
}

export function createDefaultLayer(
  name?: string,
  type: "layer" | "group" = "layer",
  parentId: string | null = null,
  isDefault: boolean = false
): LayerNode {
  return {
    id: `layer_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    name: name || (type === "group" ? "新建分组" : "新建图层"),
    type,
    visible: true,
    locked: false,
    opacity: 1,
    parentId,
    children: [],
    order: 0,
    expanded: true,
    isDefault,
  };
}

export function flattenLayerTree(layers: LayerNode[]): LayerNode[] {
  const result: LayerNode[] = [];
  const map = new Map(layers.map((l) => [l.id, l]));
  const visited = new Set<string>();

  const walk = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const node = map.get(id);
    if (!node) return;
    result.push(node);
    const sortedChildren = node.children
      .map((cid) => map.get(cid))
      .filter((c): c is LayerNode => !!c)
      .sort((a, b) => a.order - b.order);
    for (const child of sortedChildren) {
      walk(child.id);
    }
  };

  // 根层判定：无父（null 或字段缺失 undefined）即视为根层。
  // 修复：部分视图图层对象缺 parentId 字段（如 view_log_monitor 的 layer_log_default），
  // 原 `=== null` 会因 undefined 将其排除，导致该层下组件从未进画布、视图整块空白。
  const roots = layers
    .filter((l) => l.parentId === null || l.parentId === undefined)
    .sort((a, b) => a.order - b.order);
  for (const root of roots) {
    walk(root.id);
  }

  return result;
}

export function getLayerDescendants(layers: LayerNode[], layerId: string): string[] {
  const ids: string[] = [layerId];
  const map = new Map(layers.map((l) => [l.id, l]));
  const node = map.get(layerId);
  if (!node) return ids;
  const walk = (children: string[]) => {
    for (const childId of children) {
      ids.push(childId);
      const child = map.get(childId);
      if (child) walk(child.children);
    }
  };
  walk(node.children);
  return ids;
}

// ─── 响应式断点系统 ──────────────────────────────────────────

export type BreakpointId = "desktop" | "tablet" | "mobile";

export interface ResponsiveOverride {
  /** 仅存储与 base (desktop) 不同的 transform 字段 */
  transform?: Partial<Transform>;
  /** 仅存储与 base style 不同的样式键 */
  style?: Record<string, unknown>;
}

export interface BreakpointConfig {
  id: BreakpointId;
  label: string;
  icon: string;
  /** 编辑器中切换到该断点时画布默认宽度 */
  canvasWidth: number;
  /** @media 查询的最小视口宽度 */
  minWidth: number;
  /** @media 查询的最大视口宽度（mobile = 767） */
  maxWidth?: number;
}

export const BREAKPOINTS: BreakpointConfig[] = [
  { id: "desktop", label: "桌面", icon: "desktop", canvasWidth: 1920, minWidth: 1024 },
  { id: "tablet", label: "平板", icon: "tablet", canvasWidth: 768, minWidth: 768, maxWidth: 1023 },
  { id: "mobile", label: "手机", icon: "phone", canvasWidth: 393, minWidth: 320, maxWidth: 767 },
];

export function getBreakpointConfig(id: BreakpointId): BreakpointConfig {
  return BREAKPOINTS.find((b) => b.id === id) ?? BREAKPOINTS[0];
}

/**
 * 获取组件在指定断点下的有效 transform（base + 覆盖合并）。
 * desktop 返回原始 transform；tablet/mobile 合并覆盖值。
 */
export function getEffectiveTransform(comp: SceneComponent, bp: BreakpointId): Transform {
  if (bp === "desktop") return comp.transform;
  const override = comp.responsiveOverrides?.[bp];
  return { ...comp.transform, ...override?.transform };
}

/**
 * 获取组件在指定断点下的有效 style（base + 覆盖合并）。
 */
export function getEffectiveStyle(comp: SceneComponent, bp: BreakpointId): Record<string, unknown> | undefined {
  if (bp === "desktop") return comp.style;
  const override = comp.responsiveOverrides?.[bp];
  if (!override?.style) return comp.style;
  return { ...comp.style, ...override.style };
}
