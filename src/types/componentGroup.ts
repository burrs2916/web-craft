/**
 * 组件组（ComponentGroup）类型定义
 *
 * 用途：组件组 = Faceplate 模板，将多个场景组件组合为一个可复用的"设备面板"。
 * 实例化时，组内组件的 `{device}` 占位符会被替换为该设备 ID。
 *
 * V1：数据模型先行，UI 只做内联卡片
 * V2：模板编排 + 占位符替换
 * V3：跨场景全局模板库 + 条件模板
 */
export interface ComponentGroup {
  id: string;
  name: string;
  /** 组内组件 ID 列表（引用 SceneComponent） */
  componentIds: string[];
  /** 关联设备模板（指定该模板适用于哪种产品） */
  deviceBinding?: {
    productCode?: string;
    deviceId?: string;
  };
  layout?: "free" | "vertical" | "horizontal" | "grid";
  description?: string;
}

/** V2 阶段：组件绑定的 Tag 占位符解析规则 */
export interface TagBindingPlaceholder {
  /** 模板变量名，如 "device" */
  variable: string;
  /** 模板路径，如 "{device}.temperature" */
  pattern: string;
  /** 运行时替换为实际的 tag 路径 */
  resolvedTagPath?: string;
}