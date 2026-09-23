/**
 * Edge Conductor 默认配置
 *
 * 这些硬编码是过渡方案 — 后续应由后端 discovery API 驱动。
 * 集中放在此文件，便于后续统一替换为 API 数据源。
 */

import type { DeviceCategory, ProductTag, ProductDefinition, DeviceVariant, SensorSubType } from "../types/device";

// ─── 产品编码 → 前端组件编码 ─────────────────────────────────

export const DEFAULT_PRODUCT_CODE_MAPPING: Record<number, string> = {
  18: "FY002-MainController",
  18001: "FY002-SubController-Spray",
  18010: "FY002-Sensor-Wind",
  18011: "FY002-Sensor-WindPress",
  18012: "FY002-Sensor-CH4",
  18013: "FY002-Sensor-CO",
  18014: "FY002-Sensor-Temp",
  18015: "FY002-Sensor-Dust",
  18020: "FY002-Alarm-CoalCutterPosition",
  18021: "FY002-Alarm-FrameMovement",
  18022: "FY002-Alarm-FrameDrop",
  18023: "FY002-Alarm-TopCoal",
  18024: "FY002-Alarm-Smoke",
  18025: "FY002-Alarm-Temperature",
  18026: "FY002-Alarm-Infrared",
  18027: "FY002-Alarm-Touch",
  18028: "FY002-Alarm-Vibration",
  18029: "FY002-Alarm-Dust",
  18030: "FY002-Alarm-CO",
  18031: "FY002-Alarm-Flame",
  // ─── 清洗煤壁传感器（协议 spraySensorTypeRules:738-742，sensorType=15）───
  //   独立实现，不归入 alarmSensors 位域（协议未为其分配 bitPosition）
  18035: "FY002-Alarm-CleanWall",
  // ─── 流量计（协议 otherDeviceTypeRules:675-680，命令码 0x0626）───
  //   独立设备类型（非传感器），实时字段：instantFlow / totalFlow
  18040: "FY002-FlowMeter",
  // ─── 压力泵（协议 otherDeviceTypeRules:679-684，命令码 0x0627）───
  //   独立设备类型（非传感器），实时字段：startStatus（0=停止 1=运行）
  18041: "FY002-Pump",
};

// ─── 产品编码 → 产品名称 ─────────────────────────────────────

export const PRODUCT_NAMES: Record<number, string> = {
  18: "喷雾集控器",
  18001: "喷雾分控器",
  18010: "风速传感器",
  18011: "风压传感器",
  18012: "CH4传感器",
  18013: "CO传感器",
  18014: "温度传感器",
  18015: "粉尘传感器",
  18020: "割煤机位置传感器",
  18021: "移架传感器",
  18022: "落架传感器",
  18023: "放顶煤传感器",
  18024: "烟雾传感器",
  18025: "温度报警传感器",
  18026: "红外传感器",
  18027: "触控传感器",
  18028: "振动传感器",
  18029: "粉尘报警传感器",
  18030: "CO报警传感器",
  18031: "火焰传感器",
  18035: "清洗煤壁传感器",
  18040: "流量计",
  18041: "压力泵",
};

// ─── 传感器单位 ──────────────────────────────────────────────

export const NUMERIC_SENSOR_UNITS: Record<string, string> = {
  "FY002-Sensor-Wind": "m/s",
  "FY002-Sensor-WindPress": "Pa",
  "FY002-Sensor-CH4": "%LEL",
  "FY002-Sensor-CO": "ppm",
  "FY002-Sensor-Temp": "℃",
  "FY002-Sensor-Dust": "mg/m³",
};

// ─── 传感器子类型 ────────────────────────────────────────────

export const NUMERIC_SENSOR_SUB_TYPES: Record<string, SensorSubType> = {
  "FY002-Sensor-Wind": "wind_speed",
  "FY002-Sensor-WindPress": "wind_pressure",
  "FY002-Sensor-CH4": "ch4",
  "FY002-Sensor-CO": "co",
  "FY002-Sensor-Temp": "temperature",
  "FY002-Sensor-Dust": "dust",
};

// ─── 分类图标 ────────────────────────────────────────────────

export function getCategoryIcon(category: DeviceCategory, productCode?: string): string {
  if (productCode === "FY002-Sensor-CH4") return "text:CH₄";
  if (productCode === "FY002-Sensor-CO") return "text:CO";
  if (productCode === "FY002-Sensor-Temp") return "thermostat";
  if (productCode === "FY002-Sensor-Dust") return "grain";
  if (productCode === "FY002-Sensor-Wind") return "air";
  if (productCode === "FY002-Sensor-WindPress") return "speed";
  // ─── 独立设备图标（不复用传感器通用图标） ───
  if (productCode === "FY002-Alarm-CleanWall") return "cleaning_services";
  if (productCode === "FY002-FlowMeter") return "water";
  if (productCode === "FY002-Pump") return "precision_manufacturing";
  switch (category) {
    case "main": return "settings_input_antenna";
    case "sub": return "water_drop";
    case "sensor": return "sensors";
    default: return "inventory_2";
  }
}

// ─── 默认 Tags（按分类） ─────────────────────────────────────

function isAlarmProduct(productCode: string): boolean {
  return productCode.includes("-Alarm-");
}

export function generateDefaultTags(category: DeviceCategory, productCode: string): ProductTag[] {
  const common: ProductTag[] = [
    { id: "online", name: "在线状态", dataType: "boolean" },
    { id: "ip", name: "IP地址", dataType: "string" },
    { id: "mac", name: "MAC地址", dataType: "string" },
    { id: "lastHeartbeat", name: "最后心跳", dataType: "string" },
  ];

  switch (category) {
    case "main":
      return [
        ...common,
        // 协议 0x0619 喷雾控制，后端 WS 推送键名 spray.xxx
        { id: "spray.frontSpray", name: "前喷雾", dataType: "boolean" as const, writable: true, commandCode: "0619" },
        { id: "spray.rearSpray", name: "后喷雾", dataType: "boolean" as const, writable: true, commandCode: "0619" },
        { id: "spray.dustRemoval", name: "除尘", dataType: "boolean" as const, writable: true, commandCode: "0619" },
        { id: "spray.fan", name: "风机", dataType: "boolean" as const, writable: true, commandCode: "0619" },
        { id: "spray.waterPump", name: "水泵", dataType: "boolean" as const, writable: true, commandCode: "0619" },
      ];
    case "sub":
      return [
        { id: "online", name: "在线状态", dataType: "boolean" },
        // ─── 分控器没有独立 IP/MAC/心跳，通过集控器无线通信 ───
        { id: "alarm", name: "报警/故障", dataType: "boolean" },
        // ─── 喷洒状态（controllerState 位域，后端通过 WS tag_values 推送） ───
        { id: "state.frontSpray", name: "前喷", dataType: "boolean" as const, writable: true, commandCode: "0619" },
        { id: "state.rearSpray", name: "后喷", dataType: "boolean" as const, writable: true, commandCode: "0619" },
        { id: "state.cleaning", name: "清洗", dataType: "boolean" as const, writable: true, commandCode: "0619" },
        { id: "state.batteryWarning", name: "电池预警", dataType: "boolean" as const },
        { id: "state.frontForceSpray", name: "前强喷", dataType: "boolean" as const, writable: true, commandCode: "0619" },
        { id: "state.rearForceSpray", name: "后强喷", dataType: "boolean" as const, writable: true, commandCode: "0619" },
        { id: "state.frontCleaning", name: "前清洗", dataType: "boolean" as const, writable: true, commandCode: "0619" },
        // ─── 配置字段（0x060a 协议，后端 HTTP API 暴露后可用） ───
        { id: "config.repeater", name: "中继器数", dataType: "number" as const },
        { id: "config.routeInterval", name: "路由间隔", dataType: "number" as const, unit: "s" },
        // config.alias 移除 writable：当前无结构化命令通道可写别名（0x060a 未在 command API 暴露），
        // 保留 writable 会让 writeTag 走 MQTT 假实现（消息不到达设备）。
        { id: "config.alias", name: "别名", dataType: "string" as const },
      ];
    case "sensor":
      // ─── 清洗煤壁传感器（18035）：独立实现，不归入 alarmSensors 位域 ───
      //   协议来源：spraySensorTypeRules（sensorType=15，0x0614 喷雾参数设置）
      //   协议未为其在 alarmSensors 位域中分配 bitPosition，因此不暴露 alarm/batteryWarning 等位域 tag
      //   实时状态通过 0x061e 的 clean 字段（utf8 字符串，清洗支架列表）间接体现
      if (productCode === "FY002-Alarm-CleanWall") {
        return [
          { id: "online", name: "在线状态", dataType: "boolean" },
          // 清洗触发状态：后端通过 0x061e clean 字段解析后推送
          { id: "cleanTrigger", name: "清洗触发", dataType: "boolean" },
        ];
      }
      if (isAlarmProduct(productCode)) {
        return [
          { id: "online", name: "在线状态", dataType: "boolean" },
          // ─── 报警传感器绑定在分控器上，无独立 IP/MAC/心跳 ───
          { id: "alarm", name: "触发状态", dataType: "boolean" },
          { id: "batteryWarning", name: "电池预警", dataType: "boolean" },
          // ─── 协议位域字段（字段解析规则.json） ───
          //   alarmSensorInfo（:376-469）：该报警传感器是否已注册（后端固定推 true）
          //   sensorStatusCode（:532-588）：2 byte 位域，bit0=未设置 bit1=读配置错误
          //                                 bit2=写配置错误 bit3=未连接设备 bit4=断网
          //                                 bit5=超预设置 bit6=超量程
          //   后端推送策略（data_processor.rs:462-464）：分控器通讯正常=0x00，故障=0x08
          { id: "alarmSensorInfo", name: "告警注册", dataType: "boolean" },
          { id: "sensorStatusCode", name: "状态码", dataType: "number" },
          // ─── 喷雾参数（0x0614 协议）由分控器统一管理，报警传感器不持有该 tag ───
        ];
      }
      // ─── 数值型频率传感器（粉尘 18015 / 风速 18010 / 风压 18011 / CH4 18012 / CO 18013 / 温度 18014）───
      // 协议依据：2.4.4-FY002 通讯协议 6.7.11（0x061e 实时状态返回） / 字段解析规则.json
      //   协议第 5.2 节：本机IP / 本机mac 仅在 TCP 帧头出现，且只有"集控器（main）"作为 TCP 发起方持有；
      //                 分控器（sub）/ 传感器（sensor）通过集控器无线/有线通信，没有自己的 IP/MAC。
      //   协议 6.4：心跳（0x0127）由集控器 arm 每 15s 发送，分控器 / 传感器没有独立心跳协议。
      //   ⇒ 因此不再向数值型传感器注入 ip / mac / lastHeartbeat 这 3 个永远为 NULL 的字段。
      // 后端 WS 推送的 tag 键名（来自 data_processor.rs:671-683）：
      //   sensorFrequency（4 byte，单位 Hz）
      //   sensorValue（4 byte，单位见 NUMERIC_SENSOR_UNITS）
      //   sensorStatusCode（2 byte 位域，已推送：bit0=未设置 bit1=读配置错误 bit2=写配置错误
      //                     bit3=未连接设备 bit4=断网 bit5=超预设置 bit6=超量程）
      // online 不作为 tag 暴露：已有内置字段 __builtin_onlineStatus__ 覆盖，
      // 避免属性面板中"在线状态"在内置字段和数据字段中重复出现。
      return [
        { id: "sensorValue", name: "当前值", dataType: "number", unit: NUMERIC_SENSOR_UNITS[productCode] },
        { id: "sensorFrequency", name: "频率", dataType: "number", unit: "Hz" },
        { id: "sensorStatusCode", name: "状态码", dataType: "number" },
      ];
    case "auxiliary":
      // ─── 流量计（18040，命令码 0x0626）：独立设备类型（非传感器） ───
      //   协议字段：instantFlow（4字节 uint，瞬时流量）
      //             totalFlow（4字节 uint，累计流量）
      if (productCode === "FY002-FlowMeter") {
        return [
          { id: "online", name: "在线状态", dataType: "boolean" },
          { id: "instantFlow", name: "瞬时流量", dataType: "number", unit: "L/min" },
          { id: "totalFlow", name: "累计流量", dataType: "number", unit: "L" },
        ];
      }
      // ─── 压力泵（18041，命令码 0x0627）：独立设备类型（非传感器） ───
      //   协议字段：startStatus（1字节 uint，启动状态：0=停止 1=运行）
      if (productCode === "FY002-Pump") {
        return [
          { id: "online", name: "在线状态", dataType: "boolean" },
          { id: "startStatus", name: "启动状态", dataType: "number", enumValues: { 0: "停止", 1: "运行" } },
        ];
      }
      return common;
    default:
      return common;
  }
}

// ─── 默认 Variants（按分类） ─────────────────────────────────

export function generateDefaultVariants(category: DeviceCategory, _productCode?: string): DeviceVariant[] {
  switch (category) {
    case "main":
      return [
        { id: "control-panel", name: "控制面板", defaultSize: { width: 360, height: 266 }, suitableFor: ["free"] },
        { id: "pin", name: "标记", defaultSize: { width: 40, height: 40 }, suitableFor: ["cad", "map"] },
      ];
    case "sub":
      return [
        { id: "pin", name: "标记", defaultSize: { width: 36, height: 36 }, suitableFor: ["cad", "map"] },
        { id: "card", name: "卡片", defaultSize: { width: 328, height: 148 }, suitableFor: ["free"] },
      ];
    case "sensor":
      // 2026-06-20：所有传感器统一只有"标记"和"卡片"两个视觉变体（与协议规定的传感器类型对齐）
      return [
        { id: "pin", name: "标记", defaultSize: { width: 32, height: 32 }, suitableFor: ["cad", "map"] },
        { id: "card", name: "卡片", defaultSize: { width: 200, height: 120 }, suitableFor: ["free"] },
      ];
    case "auxiliary":
      // 流量计 / 压力泵：独立设备类型（非传感器），标记 + 卡片两种变体
      return [
        { id: "pin", name: "标记", defaultSize: { width: 36, height: 36 }, suitableFor: ["cad", "map"] },
        { id: "card", name: "卡片", defaultSize: { width: 220, height: 130 }, suitableFor: ["free"] },
      ];
    default:
      return [
        { id: "pin", name: "标记", defaultSize: { width: 32, height: 32 }, suitableFor: ["cad", "map"] },
        { id: "card", name: "卡片", defaultSize: { width: 200, height: 120 }, suitableFor: ["free"] },
      ];
  }
}

// ─── 静态产品定义（用于组件静态注册，不依赖 deviceStore） ──────

/** 从硬编码数据生成所有 ProductDefinition，供 registry.ts 静态注册使用 */
export function generateStaticProductDefinitions(): ProductDefinition[] {
  const entries: Array<{ code: string; name: string; category: DeviceCategory }> = [
    { code: "FY002-MainController", name: "喷雾集控器", category: "main" },
    { code: "FY002-SubController-Spray", name: "喷雾分控器", category: "sub" },
    { code: "FY002-Sensor-Wind", name: "风速传感器", category: "sensor" },
    { code: "FY002-Sensor-WindPress", name: "风压传感器", category: "sensor" },
    { code: "FY002-Sensor-CH4", name: "CH4传感器", category: "sensor" },
    { code: "FY002-Sensor-CO", name: "CO传感器", category: "sensor" },
    { code: "FY002-Sensor-Temp", name: "温度传感器", category: "sensor" },
    { code: "FY002-Sensor-Dust", name: "粉尘传感器", category: "sensor" },
    { code: "FY002-Alarm-CoalCutterPosition", name: "割煤机位置传感器", category: "sensor" },
    { code: "FY002-Alarm-FrameMovement", name: "移架传感器", category: "sensor" },
    { code: "FY002-Alarm-FrameDrop", name: "落架传感器", category: "sensor" },
    { code: "FY002-Alarm-TopCoal", name: "放顶煤传感器", category: "sensor" },
    { code: "FY002-Alarm-Smoke", name: "烟雾传感器", category: "sensor" },
    { code: "FY002-Alarm-Temperature", name: "温度报警传感器", category: "sensor" },
    { code: "FY002-Alarm-Infrared", name: "红外传感器", category: "sensor" },
    { code: "FY002-Alarm-Touch", name: "触控传感器", category: "sensor" },
    { code: "FY002-Alarm-Vibration", name: "振动传感器", category: "sensor" },
    { code: "FY002-Alarm-Dust", name: "粉尘报警传感器", category: "sensor" },
    { code: "FY002-Alarm-CO", name: "CO报警传感器", category: "sensor" },
    { code: "FY002-Alarm-Flame", name: "火焰传感器", category: "sensor" },
    // ─── 独立设备（不复用现有分类逻辑，非传感器） ───
    { code: "FY002-Alarm-CleanWall", name: "清洗煤壁传感器", category: "sensor" },
    { code: "FY002-FlowMeter", name: "流量计", category: "auxiliary" },
    { code: "FY002-Pump", name: "压力泵", category: "auxiliary" },
  ];

  return entries.map(({ code, name, category }) => ({
    productCode: code,
    productName: name,
    category,
    sensorSubType: NUMERIC_SENSOR_SUB_TYPES[code],
    icon: getCategoryIcon(category, code),
    tags: generateDefaultTags(category, code),
    variants: generateDefaultVariants(category, code),
    defaultVariant: category === "main"
      ? "control-panel"
      : category === "sub"
        ? "card"
        : category === "sensor"
          ? "control-panel"
          : "pin",
    source: "static",
  }));
}
