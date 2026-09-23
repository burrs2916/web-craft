/**
 * DeviceAdapter — 设备适配器类型定义
 *
 * 核心理念：
 * - DataSource 负责"管道 + 认证"（URL、Headers、Token 等）
 * - DeviceAdapter 只负责"解读规则"（API 路径、字段映射、分类映射）
 * - 用户在适配器中明确选择一个已配置的 DataSource
 *
 * 架构定位：
 * - DataSource：通用连接（HTTP/WS/MQTT/DB），负责收发原始数据 + 认证
 * - DeviceAdapter：知道如何把原始数据翻译成 DeviceInstance[] + ProductDefinition[]
 * - DeviceStore：消费 Adapter 提供的结构化设备数据
 */
import type { DeviceCategory } from "./device";
import { DEFAULT_PRODUCT_CODE_MAPPING } from "../devices/edgeConductorDefaults";

/** 适配器类型 */
export type DeviceAdapterType = "edge-conductor" | "generic-rest" | "generic-ws" | "custom";

/** API 路径映射 */
export interface ApiPathMapping {
  /** 设备列表路径 */
  deviceListPath: string;
  /** 设备发现路径（按产品聚合 + 协议 + MQTT 状态）；可选，未配置时默认 /api/devices/discovery */
  discoveryPath?: string;
}

/** 响应字段映射 */
export interface FieldMapping {
  deviceId: string;
  productCode: string;
  productName: string;
  deviceCategory: string;
  online: string;
  ip: string;
  mac: string;
  lastHeartbeat: string;
  parentDeviceId: string;
  parentProductCode: string;
}

/** device_category 值映射 */
export type CategoryMapping = Record<string, DeviceCategory>;

/** product_code (数字) → 产品定义 code 的映射 */
export type ProductCodeMapping = Record<number, string>;

/** 设备适配器配置 */
export interface DeviceAdapter {
  id: string;
  name: string;
  type: DeviceAdapterType;
  /** 是否启用 */
  enabled: boolean;

  /**
   * 关联的数据源 ID — 用户从数据源管理中已配置的数据源里选择
   * 认证、URL 等全部由 DataSource 承担，适配器只负责解读规则
   */
  dataSourceId: string;

  /** API 路径映射（相对于 DataSource URL） */
  apiMapping: ApiPathMapping;
  /** 响应字段映射 */
  fieldMapping: FieldMapping;
  /** device_category 值映射 */
  categoryMapping: CategoryMapping;
  /** product_code 数字 → 产品定义 code */
  productCodeMapping: ProductCodeMapping;

  /** 运行时状态（不持久化） */
  _runtime?: {
    lastFetchAt?: string;
    deviceCount?: number;
    error?: string;
  };
}

/** Edge Conductor 默认字段映射 */
export const EDGE_CONDUCTOR_DEFAULT_FIELD_MAPPING: FieldMapping = {
  deviceId: "device_id",
  productCode: "product_code",
  productName: "product_name",
  deviceCategory: "device_category",
  online: "online",
  ip: "ip",
  mac: "mac",
  lastHeartbeat: "last_heartbeat",
  parentDeviceId: "parent_device_id",
  parentProductCode: "parent_product_code",
};

/** Edge Conductor 默认 category 映射
 *  后端 discovery API 返回 frontendCategory 为 "main"/"sub"/"sensor"/"auxiliary",
 *  同时兼容旧版 "main_controller"/"sub_controller" 等格式
 */
export const EDGE_CONDUCTOR_DEFAULT_CATEGORY_MAPPING: CategoryMapping = {
  // 后端 discovery map_frontend_category 返回的值（已经是前端 category）
  main: "main",
  sub: "sub",
  sensor: "sensor",
  auxiliary: "auxiliary",
  // 旧版 / device_category 原始值
  main_controller: "main",
  sub_controller: "sub",
  collector: "sub",
};

/** Edge Conductor 默认 API 路径 */
export const EDGE_CONDUCTOR_DEFAULT_API_MAPPING: ApiPathMapping = {
  deviceListPath: "/api/devices",
};

/** 创建默认适配器 */
export function createDefaultDeviceAdapter(
  type: DeviceAdapterType = "edge-conductor",
  partial?: Partial<DeviceAdapter>,
): DeviceAdapter {
  return {
    id: `adapter_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: "",
    type,
    enabled: true,
    dataSourceId: "",
    apiMapping:
      type === "edge-conductor"
        ? { ...EDGE_CONDUCTOR_DEFAULT_API_MAPPING }
        : { deviceListPath: "/devices" },
    fieldMapping:
      type === "edge-conductor"
        ? { ...EDGE_CONDUCTOR_DEFAULT_FIELD_MAPPING }
        : {
            deviceId: "device_id",
            productCode: "product_code",
            productName: "product_name",
            deviceCategory: "device_category",
            online: "online",
            ip: "ip",
            mac: "mac",
            lastHeartbeat: "last_heartbeat",
            parentDeviceId: "parent_device_id",
            parentProductCode: "parent_product_code",
          },
    categoryMapping:
      type === "edge-conductor"
        ? { ...EDGE_CONDUCTOR_DEFAULT_CATEGORY_MAPPING }
        : {},
    productCodeMapping:
      type === "edge-conductor"
        ? { ...DEFAULT_PRODUCT_CODE_MAPPING }
        : {},
    ...partial,
  };
}
