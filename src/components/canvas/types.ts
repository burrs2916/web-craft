import type { BaseWidgetProps } from "../../types/widget";
import type { SceneDSL, SceneLayer, SceneBinding } from "../../types/scene";

export interface SceneCanvasProps extends BaseWidgetProps {
  scene: SceneDSL;
  onSceneChange?: (scene: SceneDSL) => void;
  onLayerAdd?: (layer: SceneLayer) => void;
  onLayerUpdate?: (id: string, updates: Partial<SceneLayer>) => void;
  onLayerRemove?: (id: string) => void;
  onLayerReorder?: (fromIndex: number, toIndex: number) => void;
  onBindingAdd?: (binding: SceneBinding) => void;
  onBindingRemove?: (id: string) => void;
  editable?: boolean;
}

export interface DashboardCanvasProps extends BaseWidgetProps {
  layout: DashboardLayoutItem[];
  widgets: DashboardWidgetConfig[];
  onLayoutChange?: (layout: DashboardLayoutItem[]) => void;
  onWidgetAdd?: (widget: DashboardWidgetConfig) => void;
  onWidgetRemove?: (id: string) => void;
  onWidgetUpdate?: (id: string, updates: Partial<DashboardWidgetConfig>) => void;
  editable?: boolean;
}

export interface DashboardLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardWidgetConfig {
  id: string;
  type: string;
  title?: string;
  dataSourceId?: string;
  binding?: {
    sourceId: string;
    metricName: string;
    transform?: string;
  };
  config: Record<string, unknown>;
  layout: DashboardLayoutItem;
}
