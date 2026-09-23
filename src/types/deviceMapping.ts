/**
 * 设备映射类型定义
 *
 * 连接 设备产品 → 组件 → 数据绑定 三者的桥梁。
 * 映射是产品级别的（同类型设备共享），不是设备级别的。
 *
 * 架构定位：
 * - DeviceMapping 定义了"某类产品用什么组件渲染、Tag 如何映射到组件属性"
 * - 拖拽设备到画布时，读取其 ProductDefinition 上的 mapping 创建组件实例 + 绑定规则
 * - 运行时通过 DataBindingEngine 驱动组件属性更新
 */

/** Tag → 组件属性 的绑定映射 */
export interface TagBinding {
  id: string;
  /** 产品 Tag ID（如 "value" / "state.frontSpray"） */
  tagId: string;
  /** 目标组件属性名（如 "value" / "label" / "color"） */
  componentProperty: string;
  /** 可选：值变换 */
  transform?: TagBindingTransform;
}

/** 值变换配置 */
export interface TagBindingTransform {
  type: "threshold" | "map" | "expression";
  config: Record<string, unknown>;
}

/** 阈值变换：根据阈值区间映射为不同值（常用于颜色） */
export interface ThresholdTransform extends TagBindingTransform {
  type: "threshold";
  config: {
    /** 阈值列表，从小到大排列 */
    thresholds: Array<{
      value: number;
      result: string;
    }>;
    /** 低于最小阈值的默认值 */
    defaultResult: string;
  };
}

/** 枚举映射：将枚举值映射为显示文本或颜色 */
export interface MapTransform extends TagBindingTransform {
  type: "map";
  config: {
    mappings: Record<string, string>;
    defaultResult?: string;
  };
}

/** 组件事件 → Tag 写入 的控制映射 */
export interface ControlBinding {
  id: string;
  /** 组件事件名（如 "onToggle" / "onClick"） */
  event: string;
  /** 目标 Tag ID（必须是 writable） */
  tagId: string;
  /** 写入值模板（如 "true" / "false" / "{event.value}"） */
  valueTemplate: string;
}

/** 设备↔组件↔数据 的映射配置 */
export interface DeviceMapping {
  id: string;
  /** 关联的产品定义 code（同产品共享映射模板） */
  productCode: string;
  /** 渲染用的组件类型（如 "datav-gauge" / "datav-border-1"） */
  componentType: string;
  /** 选择的变体 ID */
  variantId?: string;
  /** 默认尺寸 */
  defaultSize: { width: number; height: number };
  /** Tag → 组件属性 的绑定映射 */
  tagBindings: TagBinding[];
  /** 组件事件 → Tag 写入 的控制映射 */
  controlBindings: ControlBinding[];
}

/** 创建默认映射 */
export function createDefaultDeviceMapping(productCode: string): DeviceMapping {
  return {
    id: `mapping_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    productCode,
    componentType: "",
    defaultSize: { width: 200, height: 200 },
    tagBindings: [],
    controlBindings: [],
  };
}

/** 创建默认 Tag 绑定 */
export function createDefaultTagBinding(): TagBinding {
  return {
    id: `tb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    tagId: "",
    componentProperty: "",
  };
}

/** 创建默认控制绑定 */
export function createDefaultControlBinding(): ControlBinding {
  return {
    id: `cb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    event: "",
    tagId: "",
    valueTemplate: "",
  };
}
