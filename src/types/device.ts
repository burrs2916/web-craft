/**
 * 设备组态类型定义
 *
 * 架构定位：设备是组态系统的一等公民，与组件体系平行。
 * - DeviceInstance：具体设备实例（如 "分控器#001"）
 * - ProductDefinition：产品定义（如 "喷雾分控器" 类型模板）
 * - ProductTag：产品的测点/Tag 定义
 * - DeviceCategory：设备分类枚举
 */

/** 设备大类 */
export type DeviceCategory = "main" | "sub" | "sensor" | "auxiliary";

export const DEVICE_CATEGORY_LABELS: Record<DeviceCategory, string> = {
  main: "集控器",
  sub: "分控器",
  sensor: "传感器",
  auxiliary: "辅助设备",
};

/** 传感器子类型 */
export type SensorSubType = "wind_speed" | "wind_pressure" | "ch4" | "co" | "temperature" | "dust" | "unknown";

export const SENSOR_SUBTYPE_LABELS: Record<SensorSubType, string> = {
  wind_speed: "风速",
  wind_pressure: "风压",
  ch4: "甲烷",
  co: "一氧化碳",
  temperature: "温度",
  dust: "粉尘",
  unknown: "未知",
};

/** 报警传感器子类型（-Alarm- 系列产品细分，与协议 bitPosition 对应） */
export type AlarmSubType = "generic" | "touch" | "infrared" | "smoke" | "flame" | "vibration";

/** 红外对射传感器专属扩展信息（当前协议未传，预留接口） */
export interface InfraredExtraInfo {
  /** 对射距离档位（m），如 5/10/20/40 */
  range?: number;
  /** 信号强度（dBm），0 ~ -100，越大越强 */
  signalStrength?: number;
  /** 光束遮挡时长（ms），触发时携带 */
  beamBlockDuration?: number;
  /** 灵敏度档位：1=低 2=中 3=高 */
  sensitivity?: 1 | 2 | 3;
}

/** 产品 Tag 定义：描述一个设备类型有哪些可绑定的测点/属性 */
export interface ProductTag {
  id: string;
  name: string;
  dataType: "number" | "boolean" | "string" | "enum" | "bitfield";
  unit?: string;
  writable?: boolean;
  enumValues?: Record<string | number, string>;
  description?: string;
  /**
   * 可选：写该 tag 时使用的结构化协议命令码（4 位 16 进制，见 deviceCommands.ts）。
   * 有值 → 走 provider.sendCommand（结构化回执）；无值 → 走 writeTag（MQTT 通道）。
   */
  commandCode?: string;
}

/** Variant 视觉变体：同一产品可有多种呈现 */
export interface DeviceVariant {
  /** 变体 ID，如 "pin" / "card" / "control-panel" */
  id: string;
  /** 显示名 */
  name: string;
  /** 默认尺寸 */
  defaultSize: { width: number; height: number };
  /** 最小尺寸 */
  minSize?: { width: number; height: number };
  /** 适用场景：放到 CAD/地图/自由画布/列表 */
  suitableFor?: Array<"cad" | "map" | "free" | "list">;
  /** 变体描述 */
  description?: string;
}

/** 产品定义：设备类型的元描述（从协议反推，安装时静态定义） */
export interface ProductDefinition {
  productCode: string;
  productName: string;
  category: DeviceCategory;
  sensorSubType?: SensorSubType;
  icon: string;
  tags: ProductTag[];
  /** 视觉变体（一台设备可有多种呈现） */
  variants?: DeviceVariant[];
  /** 默认变体 ID */
  defaultVariant?: string;
  /** 默认 Faceplate 模板 ID（ComponentGroup） */
  defaultFaceplateTemplateId?: string;
  /** 该产品定义的来源描述 */
  source?: string;
  /** === 增强：后端 discovery 透传字段（不破坏） === */
  description?: string;
  deviceCount?: number;
  onlineCount?: number;
  protocolInstanceCode?: string;
}

/** 设备实例：一个具体的设备 */
export interface DeviceInstance {
  deviceId: string;
  productCode: string;
  productName: string;
  category: DeviceCategory;
  sensorSubType?: SensorSubType;
  parentDeviceId?: string;
  online: boolean;
  metadata: Record<string, unknown>;
  /** 数据源引用：该设备的数据从哪个 DataSource + 路径来 */
  dataSource?: {
    dataSourceId: string;
    pathTemplate: string;
  };
}

/** 设备变更事件 */
export interface DeviceChangeEvent {
  // "device_status" = edge-conductor WebSocket 推送的实时状态
  // "status_changed" = 通用状态变更
  type: "added" | "removed" | "updated" | "status_changed" | "device_status";
  deviceId: string;
  online?: boolean;
  lastHeartbeat?: string;
  connectionId?: string;
  /** 报警态（后端已在推送） */
  alarm?: boolean;
  /** 故障态（后端已在推送） */
  fault?: boolean;
  /** 故障/报警原因描述（后端已在推送） */
  faultReason?: string;
  /** 实时测点值：{ [tagId]: value }，前端会写入 device.metadata.realtime */
  tagValues?: Record<string, unknown>;
  /** 后端推送的原始 status 字段（"online"/"offline"/"fault"） */
  status?: string;
  /** 设备层级信息（后端build_device_message会推送） */
  parentDeviceId?: string;
  parentProductCode?: string;
  originalDeviceId?: string;
  deviceType?: string;
  deviceCategory?: string;
  deviceTypeRaw?: string;
  productCode?: number;
}
