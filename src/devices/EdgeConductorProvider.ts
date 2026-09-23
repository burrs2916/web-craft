/**
 * EdgeConductorProvider — 对接 edge-conductor 后端的 DeviceProvider
 *
 * 通过 HTTP REST API 加载设备清单和产品定义，
 * 支持 WebSocket 实时数据订阅和结构化命令下发。
 */

import type { DeviceProvider, CommandResult } from "../types/deviceProvider";
import type { DeviceInstance, DeviceCategory, ProductDefinition, DeviceChangeEvent } from "../types/device";
import type { DeviceAdapter } from "../types/deviceAdapter";
import type { DataSource } from "../types/dataSource";
import {
  PRODUCT_NAMES,
  DEFAULT_PRODUCT_CODE_MAPPING,
  generateDefaultTags,
  generateDefaultVariants,
} from "./edgeConductorDefaults";
import { logger } from "../utils/logger";

// ─── 协议外设备黑名单 ─────────────────────────────────────────
// 协议层（FY002 2.4.4）只定义 main / sub_controller / sensor 三大类。
// "采集器"是早期产品定义错误（product_code 18002/18003），后端 edge-conductor
// 历史上可能仍返回此类设备；前端在解析阶段一律丢弃，避免污染设备面板。
// 同时也丢弃后端返回的、但不在 DEFAULT_PRODUCT_CODE_MAPPING 白名单中的未知产品。
const DEPRECATED_PRODUCT_CODES = new Set<number>([18002, 18003]);

// ─── 工具函数 ────────────────────────────────────────────────

function buildBaseUrl(ds: DataSource): string {
  return ds.connection.url.replace(/\/+$/, "");
}

function buildHeaders(ds: DataSource): Record<string, string> {
  const headers: Record<string, string> = {};
  ds.connection.headers
    .filter((h) => h.enabled && h.key)
    .forEach((h) => { headers[h.key] = h.value; });
  return headers;
}

// ─── EdgeConductorProvider ────────────────────────────────────

export class EdgeConductorProvider implements DeviceProvider {
  id: string;
  name: string;
  type = "rest" as const;

  private adapter: DeviceAdapter;
  private ds: DataSource;

  // 实时数据订阅
  private ws: WebSocket | null = null;
  private _destroyed = false;
  private dataSubs: Map<string, Set<(value: unknown) => void>> = new Map();
  private changeSubs: Set<(event: DeviceChangeEvent) => void> = new Set();

  constructor(adapter: DeviceAdapter, ds: DataSource) {
    this.adapter = adapter;
    this.ds = ds;
    this.id = `ec-${adapter.id}`;
    this.name = adapter.name || "Edge Conductor";
  }

  // ─── 设备加载 ──────────────────────────────────────────────

  async loadDevices(): Promise<DeviceInstance[]> {
    const baseUrl = buildBaseUrl(this.ds);
    const path = this.adapter.apiMapping.deviceListPath || "/api/devices";
    const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const headers = buildHeaders(this.ds);

    try {
      const resp = await fetch(url, { headers, signal: AbortSignal.timeout(this.ds.connection.timeout || 10000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      const data = await resp.json();

      const devices = Array.isArray(data) ? data : data.devices ?? data.data ?? [];
      const fm = this.adapter.fieldMapping;
      const cm = this.adapter.categoryMapping;
      const pm = this.adapter.productCodeMapping;

      // ─── 协议外设备过滤 ───
      // 1) 显式黑名单（历史误定义：18002/18003 无线/有线信号采集器）
      // 2) 不在 DEFAULT_PRODUCT_CODE_MAPPING 白名单中的未知产品码（防御性兜底）
      //    这里的白名单 = 前端认识的所有产品码（main / sub / sensor / 流量 / 压力泵 / 清洗煤壁）
      const allowedCodes = new Set<number>(Object.keys(DEFAULT_PRODUCT_CODE_MAPPING).map(Number));
      const filtered = devices.filter((raw: Record<string, unknown>) => {
        const code = Number(raw[fm.productCode] ?? NaN);
        if (Number.isNaN(code)) {
          logger.warn("EdgeConductorProvider", "Drop device with invalid productCode", { raw });
          return false;
        }
        if (DEPRECATED_PRODUCT_CODES.has(code)) {
          logger.warn("EdgeConductorProvider", "Drop deprecated collector device", { productCode: code });
          return false;
        }
        if (!allowedCodes.has(code)) {
          logger.warn("EdgeConductorProvider", "Drop unknown productCode (not in protocol whitelist)", { productCode: code });
          return false;
        }
        return true;
      });

      return filtered.map((raw: Record<string, unknown>) => {
        const productCodeRaw = String(raw[fm.productCode] ?? "");
        const productCode = pm[Number(productCodeRaw)] ?? productCodeRaw;
        const categoryRaw = String(raw[fm.deviceCategory] ?? "");
        const category: DeviceCategory = cm[categoryRaw] ?? (categoryRaw as DeviceCategory);

        const deviceName = String(raw[fm.productName] ?? PRODUCT_NAMES[Number(productCodeRaw)] ?? productCode);
        return {
          id: String(raw[fm.deviceId] ?? ""),
          deviceId: String(raw[fm.deviceId] ?? ""),
          name: deviceName,
          productName: deviceName,
          productCode,
          category,
          online: Boolean(raw[fm.online]),
          ip: raw[fm.ip] ? String(raw[fm.ip]) : undefined,
          mac: raw[fm.mac] ? String(raw[fm.mac]) : undefined,
          lastHeartbeat: raw[fm.lastHeartbeat] ? String(raw[fm.lastHeartbeat]) : undefined,
          parentDeviceId: raw[fm.parentDeviceId] ? String(raw[fm.parentDeviceId]) : undefined,
          parentProductCode: raw[fm.parentProductCode] ? String(raw[fm.parentProductCode]) : undefined,
          tags: generateDefaultTags(category, productCode),
          variants: generateDefaultVariants(category, productCode),
          currentVariant: category === "main" ? "control-panel" : category === "sub" ? "card" : "pin",
          metadata: raw,
        } as DeviceInstance;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("EdgeConductorProvider", "loadDevices failed", { error: msg });
      throw err;
    }
  }

  async loadProducts(): Promise<ProductDefinition[]> {
    // 产品定义从默认配置生成，不需要网络请求
    const { generateStaticProductDefinitions } = await import("./edgeConductorDefaults");
    return generateStaticProductDefinitions();
  }

  // ─── 测试连接 ──────────────────────────────────────────────

  async testConnection(): Promise<{ success: boolean; deviceCount?: number; error?: string }> {
    try {
      const devices = await this.loadDevices();
      return { success: true, deviceCount: devices.length };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ─── 实时数据订阅（WebSocket） ────────────────────────────

  subscribeData(deviceId: string, tagId: string, cb: (value: unknown) => void): () => void {
    const key = `${deviceId}::${tagId}`;
    if (!this.dataSubs.has(key)) {
      this.dataSubs.set(key, new Set());
    }
    this.dataSubs.get(key)!.add(cb);

    // 懒连接 WS
    this.ensureWebSocket();

    return () => {
      const subs = this.dataSubs.get(key);
      if (subs) {
        subs.delete(cb);
        if (subs.size === 0) this.dataSubs.delete(key);
      }
    };
  }

  subscribeChanges(cb: (event: DeviceChangeEvent) => void): () => void {
    this.changeSubs.add(cb);
    this.ensureWebSocket();
    return () => { this.changeSubs.delete(cb); };
  }

  private ensureWebSocket() {
    if (this.ws) return;

    const baseUrl = buildBaseUrl(this.ds);
    // ─── 使用后端实际提供的 WebSocket 端点（/ws/device/status）───
    // 与 gateway-console 保持一致，复用已有的设备状态推送通道
    const wsUrl = baseUrl.replace(/^http/, "ws") + "/ws/device/status";
    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          // ─── 消息格式（来自 edge-conductor device_status.rs）───
          // { type: "device_status", data: { device_id, online, tag_values, status, ... } }
          // 也可能直接是 { device_id, online, tag_values, ... }（无 type 包裹）
          const data = msg.data ?? msg;
          const deviceId = data.device_id ?? data.deviceId;
          const tagValues = data.tag_values ?? data.tagValues ?? {};

          // 🔍 诊断日志：记录所有带 tag_values 的 WebSocket 消息
          if (deviceId && Object.keys(tagValues).length > 0) {
            const dustTags = ["finalValue", "sensorValue", "sensorFrequency", "sensorStatusCode", "alarm"];
            const hasDustTag = dustTags.some(k => k in tagValues);

            // 🚨 [SMOKE_ALARM] 烟雾传感器(18024)独特日志标记
            const wsProductCode = data.product_code ?? data.productCode;
            if (Number(wsProductCode) === 18024 && tagValues.alarm !== undefined) {
              if (tagValues.alarm === true) {
                logger.warn("EdgeConductorProvider", "🚨 [SMOKE_ALARM_RECEIVED] 烟雾传感器触发告警!", {
                  deviceId,
                  productCode: wsProductCode,
                  alarm: tagValues.alarm,
                  batteryWarning: tagValues.batteryWarning,
                  online: data.online,
                });
              } else {
                console.info("🚨 [SMOKE_ALARM_NORMAL] 烟雾传感器状态正常(未触发)", {
                  deviceId,
                  productCode: wsProductCode,
                  alarm: tagValues.alarm,
                });
              }
            }

            logger.warn("EdgeConductorProvider", "WS 收到 tag_values", {
              deviceId,
              keys: Object.keys(tagValues),
              hasWorkTimeSlots: !!tagValues.workTimeSlots,
              hasDustTag,
              dustFields: hasDustTag ? dustTags.filter(k => k in tagValues).reduce((acc, k) => { acc[k] = tagValues[k]; return acc; }, {} as Record<string, unknown>) : undefined,
              msgType: msg.type,
              online: data.online,
              status: data.status,
              productCode: data.product_code ?? data.productCode,
              parentDeviceId: data.parent_device_id ?? data.parentDeviceId,
            });
          }

          // 解析 tag_values 中的每个字段，触发数据订阅回调
          if (deviceId && tagValues && typeof tagValues === "object") {
            for (const [tagId, value] of Object.entries(tagValues)) {
              const key = `${deviceId}::${tagId}`;
              const subs = this.dataSubs.get(key);
              if (subs) {
                subs.forEach((cb) => cb(value));
              }
            }
          }

          // ─── 构造标准 DeviceChangeEvent 并通知订阅者 ───
          // edge-conductor 推送的消息 type 通常是 "device_status"
          // 统一映射为 "device_status" 类型，deviceStore 会直接更新设备状态
          // 2026-07-13: 补充设备层级信息（parentDeviceId等），确保前端能识别设备隶属关系
          if (deviceId && (msg.type === "device_status" || msg.type === "device_change" || data.online !== undefined)) {
            const evt: DeviceChangeEvent = {
              type: "device_status",
              deviceId: String(deviceId),
              online: data.online !== undefined ? Boolean(data.online) : undefined,
              lastHeartbeat: data.last_heartbeat ?? data.lastHeartbeat,
              connectionId: data.connection_id ?? data.connectionId,
              alarm: data.alarm,
              fault: data.fault,
              faultReason: data.fault_reason ?? data.faultReason,
              status: data.status,
              tagValues: Object.keys(tagValues).length > 0 ? tagValues : undefined,
              // 设备层级信息（后端build_device_message会推送）
              parentDeviceId: data.parent_device_id ?? data.parentDeviceId,
              parentProductCode: data.parent_product_code ?? data.parentProductCode,
              originalDeviceId: data.original_device_id ?? data.originalDeviceId,
              deviceType: data.device_type ?? data.deviceType,
              deviceCategory: data.device_category ?? data.deviceCategory,
              deviceTypeRaw: data.device_type_raw ?? data.deviceTypeRaw,
              productCode: data.product_code ?? data.productCode,
            };
            this.changeSubs.forEach((cb) => cb(evt));
          }
        } catch {
          // 忽略非 JSON 消息
        }
      };
      this.ws.onopen = () => {
        logger.warn("EdgeConductorProvider", "WS 已连接", { wsUrl });
      };
      this.ws.onclose = (ev) => {
        this.ws = null;
        logger.warn("EdgeConductorProvider", "WS 已断开", { code: ev.code, reason: ev.reason });
        // 自动重连：3秒后尝试重新连接
        if (!this._destroyed) {
          setTimeout(() => {
            if (!this._destroyed && !this.ws) {
              logger.warn("EdgeConductorProvider", "WS 自动重连", { wsUrl });
              this.ensureWebSocket();
            }
          }, 3000);
        }
      };
      this.ws.onerror = () => {
        this.ws?.close();
        this.ws = null;
      };
    } catch (err) {
      logger.warn("EdgeConductorProvider", "WebSocket connect failed", { error: err, wsUrl });
    }
  }

  // ─── 控制命令 ──────────────────────────────────────────────

  async writeTag(deviceId: string, tagId: string, value: unknown): Promise<void> {
    const baseUrl = buildBaseUrl(this.ds);
    const url = `${baseUrl}/api/devices/${deviceId}/tags`;
    const headers = { ...buildHeaders(this.ds), "Content-Type": "application/json" };

    const resp = await fetch(url, {
      method: "PUT",
      headers,
      body: JSON.stringify({ tagId, value }),
    });
    if (!resp.ok) {
      throw new Error(`writeTag failed: HTTP ${resp.status}`);
    }
  }

  async sendCommand(
    deviceId: string,
    command: string,
    params?: Record<string, unknown>,
  ): Promise<CommandResult> {
    const baseUrl = buildBaseUrl(this.ds);
    const url = `${baseUrl}/api/devices/${deviceId}/command`;
    const headers = { ...buildHeaders(this.ds), "Content-Type": "application/json" };

    try {
      const resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ command, params }),
      });
      const data = await resp.json();

      return {
        success: data.code === 0,
        code: data.code ?? (resp.ok ? 0 : resp.status),
        msg: data.msg ?? data.message ?? "",
        commandCode: command,
        deviceId,
      };
    } catch (err) {
      return {
        success: false,
        code: 503,
        msg: err instanceof Error ? err.message : String(err),
        commandCode: command,
        deviceId,
      };
    }
  }

  // ─── 释放 ─────────────────────────────────────────────────

  destroy(): void {
    this._destroyed = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.dataSubs.clear();
    this.changeSubs.clear();
  }
}
