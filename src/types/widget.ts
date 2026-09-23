export type WidgetFamily = "widget" | "spatial" | "canvas" | "monitor";

export type WidgetType =
  | "metric"
  | "chart-line"
  | "chart-bar"
  | "chart-pie"
  | "chart-gauge"
  | "table"
  | "text"
  | "map"
  | "cad"
  | "blueprint"
  | "globe"
  | "scene"
  | "dashboard"
  | "alert"
  | "log"
  | "event-timeline";

export type WidgetFamilyMap = {
  widget: WidgetType[];
  spatial: WidgetType[];
  canvas: WidgetType[];
  monitor: WidgetType[];
};

export const WIDGET_FAMILY_MEMBERS: WidgetFamilyMap = {
  widget: ["metric", "chart-line", "chart-bar", "chart-pie", "chart-gauge", "table", "text"],
  spatial: ["map", "cad", "blueprint", "globe"],
  canvas: ["scene", "dashboard"],
  monitor: ["alert", "log", "event-timeline"],
};

export function getWidgetFamily(type: WidgetType): WidgetFamily | null {
  for (const [family, members] of Object.entries(WIDGET_FAMILY_MEMBERS)) {
    if (members.includes(type)) return family as WidgetFamily;
  }
  return null;
}

export const WIDGET_TYPE_LABELS: Record<WidgetType, string> = {
  metric: "指标卡片",
  "chart-line": "折线图",
  "chart-bar": "柱状图",
  "chart-pie": "饼图",
  "chart-gauge": "仪表盘",
  table: "数据表格",
  text: "文本标注",
  map: "地图视图",
  cad: "工程图纸",
  blueprint: "平面蓝图",
  globe: "三维地球",
  scene: "场景画布",
  dashboard: "仪表盘画布",
  alert: "告警面板",
  log: "日志查看器",
  "event-timeline": "事件时间线",
};

export interface BaseWidgetProps {
  id: string;
  title?: string;
  dataSourceId?: string;
  dataBinding?: UnifiedBinding;
  refreshInterval?: number;
  visible?: boolean;
  style?: React.CSSProperties;
  className?: string;
  onInteract?: InteractionHandler;
}

export interface UnifiedBinding {
  id: string;
  sourceId: string;
  metricPath: string;
  transform?: TransformChain;
  refreshInterval?: number;
  fallback?: unknown;
}

export interface TransformChain {
  steps: TransformStep[];
}

export interface TransformStep {
  type: "map" | "filter" | "aggregate" | "format" | "custom";
  expression?: string;
  function?: string;
  params?: Record<string, unknown>;
}

export interface InteractionEvent {
  type: "click" | "hover" | "select" | "deselect" | "range-select";
  sourceId: string;
  data?: unknown;
  timestamp: number;
}

export type InteractionHandler = (event: InteractionEvent) => void;

export type DataStatus = "idle" | "loading" | "success" | "error" | "stale";

export interface WidgetDataResult<T = unknown> {
  data: T | null;
  status: DataStatus;
  error: string | null;
  lastUpdated: string | null;
  refresh: () => Promise<void>;
}

export function createDefaultBinding(partial?: Partial<UnifiedBinding>): UnifiedBinding {
  return {
    id: `bind_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    sourceId: "",
    metricPath: "",
    ...partial,
  };
}
