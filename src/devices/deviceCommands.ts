/**
 * deviceCommands — 设备协议命令码常量表
 *
 * 对齐 edge-conductor 结构化命令 API：POST /api/devices/:id/command
 * 契约来源：
 *   - edge-conductor/api/src/handlers/http/device/command.rs（命令分发）
 *   - docs/协议相关/命令码映射.json（协议字段定义）
 *
 * 前端下发命令时以此表为唯一命令码来源，避免硬编码散落各处。
 */

/** 命令参数字段定义 */
export interface CommandParamField {
  key: string;
  label: string;
  type: "uint" | "float" | "array";
  required: boolean;
}

/** 命令码定义 */
export interface DeviceCommandDef {
  /** 4 位 16 进制命令码 */
  code: string;
  /** 命令名称 */
  name: string;
  /** 是否需要业务参数 */
  hasParams: boolean;
  /** 参数字段（仅 hasParams=true 时有意义） */
  params?: CommandParamField[];
  /** 说明 */
  description: string;
}

/**
 * 边缘端 command.rs 已实现分发的命令码。
 * 仅这些命令能被 sendCommand 下发到设备。
 */
export const DEVICE_COMMANDS = {
  /** 060e 获取传感器设置（无参） */
  FETCH_SENSOR_SETTINGS: "060e",
  /** 060f 添加传感器 */
  ADD_SENSOR: "060f",
  /** 0611 删除传感器 */
  DELETE_SENSOR: "0611",
  /** 0613 获取喷雾参数（无参） */
  FETCH_SPRAY_PARAMS: "0613",
  /** 0614 设置喷雾参数 */
  SET_SPRAY_PARAMS: "0614",
  /** 0616 获取工作时间（无参） */
  FETCH_WORK_TIME: "0616",
  /** 0617 设置工作时间 */
  SET_WORK_TIME: "0617",
  /** 0619 喷雾控制 */
  SET_SPRAY_CONTROL: "0619",
  /** 061b 循环喷雾设置 */
  SET_CYCLE_SPRAY: "061b",
  /** 061d 主动获取设备实时状态（无参，触发设备返回 0x061e） */
  FETCH_REAL_TIME_STATUS: "061d",
  /** 0620 获取分控器工作时间（position 指定分控器） */
  FETCH_SUB_WORK_TIME: "0620",
  /** 0621 设置分控器工作时间（position + slots） */
  SET_SUB_WORK_TIME: "0621",
  /** 0623 栈桥循环标志（cycleFlag: 1=开始, 0=结束） */
  SET_CYCLE_FLAG: "0623",
  /** 0624 栈桥循环参数 */
  SET_CYCLE_PARAMS: "0624",
  /** 0625 栈桥定时 */
  SET_BRIDGE_TIMER: "0625",
  /** 0628 喷洒控制2 */
  SET_SPRAY_CONTROL_V2: "0628",
  /** 062a 粉尘联动 */
  SET_DUST_LINKAGE: "062a",
  /** 062b 清除设置（无参） */
  CLEAR_SETTINGS: "062b",
  /** 062c 温度联动 */
  SET_TEMPERATURE_LINKAGE: "062c",
  /** 062d CO联动 */
  SET_CO_LINKAGE: "062d",
  /** 062e 廊桥运行模式 */
  SET_BRIDGE_MODE: "062e",
} as const;

export type DeviceCommandCode = (typeof DEVICE_COMMANDS)[keyof typeof DEVICE_COMMANDS];

/** 命令码 → 定义（与 command.rs dispatch 分支一一对应） */
export const DEVICE_COMMAND_DEFS: Record<string, DeviceCommandDef> = {
  "060e": {
    code: "060e",
    name: "获取传感器设置",
    hasParams: false,
    description: "向设备请求当前传感器配置",
  },
  "060f": {
    code: "060f",
    name: "添加传感器",
    hasParams: true,
    params: [
      { key: "sensorType", label: "传感器类型", type: "uint", required: true },
      { key: "sensorId", label: "传感器 ID", type: "uint", required: true },
      { key: "sensorAlias", label: "别名", type: "uint", required: false },
      { key: "minRange", label: "量程下限", type: "float", required: true },
      { key: "maxRange", label: "量程上限", type: "float", required: true },
      { key: "alarmLow", label: "低报警", type: "float", required: true },
      { key: "alarmHigh", label: "高报警", type: "float", required: true },
      { key: "calibrationZero", label: "零点校准", type: "float", required: true },
    ],
    description: "添加一个传感器并设置量程/报警阈值",
  },
  "0611": {
    code: "0611",
    name: "删除传感器",
    hasParams: true,
    params: [{ key: "sensorIds", label: "传感器 ID 列表", type: "array", required: true }],
    description: "按 ID 批量删除传感器",
  },
  "0613": {
    code: "0613",
    name: "获取喷雾参数",
    hasParams: false,
    description: "向设备请求当前喷雾参数",
  },
  "0614": {
    code: "0614",
    name: "设置喷雾参数",
    hasParams: true,
    params: [
      { key: "sensorType", label: "传感器类型", type: "uint", required: true },
      { key: "sprayPosition", label: "喷雾位置", type: "uint", required: true },
      { key: "windDirection", label: "风向", type: "uint", required: true },
      { key: "waterCurtainInterval", label: "水幕间隔", type: "uint", required: true },
      { key: "waterCurtainCount", label: "水幕次数", type: "uint", required: true },
      { key: "sprayDelayTime", label: "喷雾延时", type: "uint", required: true },
    ],
    description: "设置传感器触发的喷雾参数",
  },
  "0616": {
    code: "0616",
    name: "获取工作时间",
    hasParams: false,
    description: "向设备请求当前工作时间段",
  },
  "0617": {
    code: "0617",
    name: "设置工作时间",
    hasParams: true,
    params: [{ key: "slots", label: "时间段列表", type: "array", required: true }],
    description: "设置工作时间段（slots: {enabled,startMinute,endMinute}[]）",
  },
  "0619": {
    code: "0619",
    name: "喷雾控制",
    hasParams: true,
    params: [
      { key: "controlMode", label: "控制模式", type: "uint", required: true },
      { key: "controlWord", label: "控制字", type: "uint", required: true },
      { key: "controlPosition", label: "控制位置", type: "uint", required: true },
      { key: "controllerIds", label: "分控器 ID 列表", type: "array", required: true },
    ],
    description: "手动喷雾控制（开/关/指定分控器）",
  },
  "061b": {
    code: "061b",
    name: "循环喷雾设置",
    hasParams: true,
    params: [
      { key: "continuousCurtainCount", label: "连续水幕次数", type: "uint", required: true },
      { key: "sprayDurationSecs", label: "喷雾时长(秒)", type: "uint", required: true },
      { key: "stopDurationSecs", label: "停止时长(秒)", type: "uint", required: true },
    ],
    description: "设置循环喷雾的时长与间隔",
  },
  "061d": {
    code: "061d",
    name: "获取实时状态",
    hasParams: false,
    description: "主动请求设备返回实时状态（0x061e），含传感器数据、分控器状态、报警信息",
  },
  "0620": {
    code: "0620",
    name: "获取分控器工作时间",
    hasParams: true,
    params: [{ key: "position", label: "分控器位置", type: "uint", required: true }],
    description: "获取指定分控器的当前工作时间段（position: 分控器编号）",
  },
  "0621": {
    code: "0621",
    name: "设置分控器工作时间",
    hasParams: true,
    params: [
      { key: "position", label: "分控器位置", type: "uint", required: true },
      { key: "slots", label: "时间段列表", type: "array", required: true },
    ],
    description: "设置指定分控器的工作时间段",
  },
  "0623": {
    code: "0623",
    name: "栈桥循环标志",
    hasParams: true,
    params: [{ key: "cycleFlag", label: "循环标志(1=开始,0=结束)", type: "uint", required: true }],
    description: "控制栈桥循环的启停",
  },
  "0624": {
    code: "0624",
    name: "栈桥循环参数",
    hasParams: true,
    params: [
      { key: "continuousCurtainCount", label: "连续水幕次数", type: "uint", required: true },
      { key: "cycleCount", label: "循环次数", type: "uint", required: true },
      { key: "sprayDurationSecs", label: "喷雾时长(秒)", type: "uint", required: true },
      { key: "stopDurationSecs", label: "停止时长(秒)", type: "uint", required: true },
    ],
    description: "设置栈桥循环的水幕次数、循环次数和时长",
  },
  "0625": {
    code: "0625",
    name: "栈桥定时",
    hasParams: true,
    params: [
      { key: "startHour", label: "开始时", type: "uint", required: true },
      { key: "startMinute", label: "开始分", type: "uint", required: true },
      { key: "interval", label: "间隔", type: "uint", required: true },
    ],
    description: "设置栈桥定时的启动时间和间隔",
  },
  "0628": {
    code: "0628",
    name: "喷洒控制2",
    hasParams: true,
    params: [
      { key: "controlWord", label: "控制字", type: "uint", required: true },
      { key: "controlPosition", label: "控制位置", type: "uint", required: true },
      { key: "controllerIds", label: "分控器 ID 列表", type: "array", required: true },
    ],
    description: "新版喷洒控制（无 controlMode，其余同 0619）",
  },
  "062a": {
    code: "062a",
    name: "粉尘联动",
    hasParams: true,
    params: [{ key: "items", label: "联动数据", type: "array", required: true }],
    description: "粉尘传感器联动配置",
  },
  "062b": {
    code: "062b",
    name: "清除设置",
    hasParams: false,
    description: "清除设备所有设置",
  },
  "062c": {
    code: "062c",
    name: "温度联动",
    hasParams: true,
    params: [{ key: "items", label: "联动数据", type: "array", required: true }],
    description: "温度传感器联动配置",
  },
  "062d": {
    code: "062d",
    name: "CO联动",
    hasParams: true,
    params: [{ key: "items", label: "联动数据", type: "array", required: true }],
    description: "CO传感器联动配置",
  },
  "062e": {
    code: "062e",
    name: "廊桥运行模式",
    hasParams: true,
    params: [{ key: "mode", label: "运行模式", type: "uint", required: true }],
    description: "设置廊桥运行模式",
  },
};

/** 校验命令码是否被边缘端支持 */
export function isSupportedCommand(code: string): boolean {
  return code.toLowerCase() in DEVICE_COMMAND_DEFS;
}

// ═══════════════════════════════════════════════════════════════
// 协议文档 schema 源（命令码映射.json）
// 作为唯一协议契约源，与 DEVICE_COMMAND_DEFS 交叉验证。
// 后端协议调整时更新 JSON，前端启动时自动检测不一致。
// ═══════════════════════════════════════════════════════════════

import protocolSchema from "../../docs/协议相关/命令码映射.json";

interface ProtocolField {
  name: string;
  length?: number | string;
  offset?: number | string;
  encoding?: string;
  type?: string;
}

interface ProtocolCommandSchema {
  name: string;
  direction: string;
  dataSchema?: {
    type: string;
    fields?: ProtocolField[];
  };
  description: string;
}

const protocolCommands = protocolSchema as Record<string, ProtocolCommandSchema>;

/**
 * 从协议文档获取命令的字段列表（权威 schema 源）。
 * 返回 undefined 表示协议文档中无此命令码。
 */
export function getProtocolCommandFields(code: string): ProtocolField[] | undefined {
  const def = protocolCommands[code.toLowerCase()];
  return def?.dataSchema?.fields;
}

/**
 * 交叉验证 DEVICE_COMMAND_DEFS 与协议文档的一致性（DEV 模式下启动时调用一次）。
 * 检测：前端支持的命令码在协议文档中是否存在、字段名是否匹配。
 */
export function validateCommandDefsAgainstProtocol(): void {
  if (!import.meta.env.DEV) return;
  for (const [code, def] of Object.entries(DEVICE_COMMAND_DEFS)) {
    const proto = protocolCommands[code];
    if (!proto) {
      console.warn(`[deviceCommands] 命令码 ${code}(${def.name}) 在协议文档中未找到，可能已过期`);
      continue;
    }
    if (def.hasParams && def.params) {
      const protoFieldNames = (proto.dataSchema?.fields ?? []).map((f) => f.name);
      for (const p of def.params) {
        if (!protoFieldNames.includes(p.key)) {
          console.warn(
            `[deviceCommands] 命令 ${code}(${def.name}) 参数 "${p.key}" 在协议文档字段中未找到，` +
            `协议字段: [${protoFieldNames.join(", ")}]`,
          );
        }
      }
    }
  }
}

/**
 * 将 UI 层的 tag 写入（tagId + value）翻译为边缘端 command API 期望的结构化 params。
 *
 * 0619 喷雾控制参数映射（依据 字段解析规则.json）：
 *   controlMode:    0=退出强喷 / 1=强喷控制（tag 名含 "force" → 1，否则按 value 决定开关）
 *   controlWord:    0=不喷 / 1=喷（value boolean → 0/1）
 *   controlPosition: 0=前喷 / 1=后喷 / 2=前后喷（按 tagId 中的 front/rear 推断）
 *   controllerIds:  分控器自身 ID（操作分控器时）；空数组=广播（操作集控器时）
 *
 * 其余命令码：直接透传 { tagId, value }，由调用方按需构造。
 *
 * @param context 设备上下文：用于判断当前操作的设备是集控器还是分控器，
 *                分控器时把自身 ID 填入 controllerIds，命令应由调用方路由给 parentDeviceId。
 */
export interface CommandBuildContext {
  deviceId: string;
  category?: string;
  parentDeviceId?: string;
}

export function buildCommandParams(
  commandCode: string,
  tagId: string,
  value: unknown,
  context?: CommandBuildContext,
): Record<string, unknown> {
  const code = commandCode.toLowerCase();
  if (code === DEVICE_COMMANDS.SET_SPRAY_CONTROL) {
    const isOn = value === true || value === 1 || value === "1";
    const isForce = /force/i.test(tagId);
    let controlPosition = 2; // 默认前后喷
    if (/front/i.test(tagId)) controlPosition = 0;
    else if (/rear/i.test(tagId)) controlPosition = 1;
    // 分控器：把自身 ID 填入 controllerIds；集控器：空数组=广播所有分控器
    const isSubController = context?.category === "sub" && !!context.parentDeviceId;
    const controllerIds = isSubController ? [context!.deviceId] : [];
    // controlMode 语义（字段解析规则.json）：
    //   0=退出强喷控制（普通喷雾/关闭强喷），1=强喷控制（开启强喷）
    //   - 普通喷雾 tag：controlMode 固定 0，只靠 controlWord 开关
    //   - 强喷 tag：开→controlMode=1（进入强喷），关→controlMode=0（退出强喷）
    const controlMode = isForce ? (isOn ? 1 : 0) : 0;
    return {
      controlMode,
      controlWord: isOn ? 1 : 0,
      controlPosition,
      controllerIds,
    };
  }
  // 默认透传
  return { tagId, value };
}

/**
 * 解析 0619 命令的实际下发目标设备 ID。
 * - 集控器：直接返回自身 deviceId
 * - 分控器：返回 parentDeviceId（0619 是集控器命令，分控器自身无法接收）
 */
export function resolveCommandTargetDevice(context: CommandBuildContext): string {
  if (context.category === "sub" && context.parentDeviceId) {
    return context.parentDeviceId;
  }
  return context.deviceId;
}
