/**
 * logDecoder — 日志监控视图「协议语义翻译层」
 *
 * 把 GreptimeDB 里存储的原始字段翻译成「巷道里发生了什么」的可读中文，
 * 让日志从"一堆看不懂的码"变成"设备运行状态反馈"。
 *
 * 翻译真源（守铁律②：必须协议能采集到才显示）：
 * - 命令码 → 中文指令名：rustpro/edge-conductor/doc/协议相关/命令码映射.json
 * - 事件/动作语义：协议.txt + 设备事件常见类型（online/offline/fault/alarm）
 *
 * 设计：纯前端翻译，不改后端契约；命令码存为 "0619"（无 0x 前缀，见
 * edge-conductor/common/src/models/log_models.rs:97 注释），也兼容 "0x0619"。
 */

// ─────────────────────────────────────────────────────────────────────────────
// 命令码 → 中文指令名（完整映射，来自 命令码映射.json）
// ─────────────────────────────────────────────────────────────────────────────
const COMMAND_CODE_NAMES: Record<string, string> = {
  "0030": "设备注册",
  "0031": "设备注销",
  "0032": "注册注销响应",
  "0035": "推送应用软件升级",
  "0036": "推送Kernel升级",
  "0037": "推送文件系统升级",
  "0038": "推送系统文件升级",
  "0060": "推送图片资源",
  "0061": "系统升级返回结果",
  "0122": "索要日期时间",
  "0123": "推送日期时间",
  "0124": "系统版本获取",
  "0125": "系统版本上传",
  "0126": "服务器回复心跳",
  "0127": "设备发送心跳",
  "0280": "系统版本返回",
  "0605": "获取所有设置信息",
  "0606": "获取集控器基本信息",
  "0607": "集控器基本信息设置",
  "0608": "集控器基本信息设置返回",
  "0609": "获取所有分控器信息",
  "060a": "分控器设置信息",
  "060b": "分控器设置信息返回",
  "060e": "获取传感器设置",
  "060f": "添加传感器",
  "0610": "添加传感器返回",
  "0611": "删除传感器",
  "0612": "删除传感器返回",
  "0613": "获取喷雾参数",
  "0614": "传感器喷雾参数设置",
  "0615": "传感器喷雾参数设置返回",
  "0616": "获取工作时间段",
  "0617": "工作时间段设置",
  "0618": "定时回馈",
  "0619": "喷洒控制",
  "061a": "喷洒控制返回",
  "061b": "循环喷洒设置",
  "061c": "循环喷洒设置返回",
  "061d": "实时状态",
  "061e": "返回实时状态",
  "061f": "实时状态补充",
  "0620": "获取分控器工作时间段",
  "0621": "分控器工作时间段设置",
  "0622": "分控器定时回馈",
  "0623": "栈桥循环标志",
  "0624": "栈桥循环参数",
  "0625": "栈桥定时",
  "0626": "流量数据",
  "0627": "压力泵数据上传",
  "0628": "喷洒控制2",
  "0629": "喷洒控制2返回",
  "062a": "粉尘联动",
  "062b": "清除设置",
  "062c": "温度联动",
  "062d": "CO联动",
  "062e": "廊桥运行模式",
  "062f": "皮带状态",
};

// ─────────────────────────────────────────────────────────────────────────────
// 操作动作 → 中文（operation_logs.action 字段）
// ─────────────────────────────────────────────────────────────────────────────
const ACTION_LABELS: Record<string, string> = {
  forceSpray: "强喷",
  forceStop: "强停",
  autoMode: "自动模式",
  manualMode: "手动模式",
  cycleSpray: "循环喷",
  stopCycle: "停循环",
  fetch: "查询",
  set: "设置",
  clear: "清除",
  dry_run: "试运行",
  trigger: "触发",
  reset: "复位",
  start: "启动",
  stop: "停止",
};

// ─────────────────────────────────────────────────────────────────────────────
// 设备事件类型 → 中文（device_events.event_type）
// ─────────────────────────────────────────────────────────────────────────────
const EVENT_TYPE_LABELS: Record<string, string> = {
  online: "设备上线",
  offline: "设备离线",
  fault: "设备故障",
  alarm: "告警",
  alarmClear: "告警解除",
  dust: "粉尘超限",
  waterLow: "水压低",
  commLost: "通信中断",
  commRecover: "通信恢复",
  spray: "喷雾动作",
  linkage: "联动触发",
  configChanged: "配置变更",
};

// ─────────────────────────────────────────────────────────────────────────────
// 结果 → 中文标签（与表格 getResultLabel 保持一致，集中管理）
// ─────────────────────────────────────────────────────────────────────────────
export function resultLabel(result?: string): string {
  const r = String(result ?? "").toLowerCase();
  if (r === "ok" || r === "success" || r === "0") return "成功";
  if (r === "fail" || r === "error" || r === "failed") return "失败";
  if (r === "partial") return "部分成功";
  return result || "-";
}

/** 结果是否为异常（用于高亮置顶） */
export function isResultFailure(result?: string): boolean {
  const r = String(result ?? "").toLowerCase();
  return r === "fail" || r === "error" || r === "failed";
}

// ─────────────────────────────────────────────────────────────────────────────
// 归一化命令码：去掉 0x 前缀、统一小写 4 位
// ─────────────────────────────────────────────────────────────────────────────
function normalizeCommandCode(code?: string): string {
  if (!code) return "";
  let s = code.trim().toLowerCase();
  if (s.startsWith("0x")) s = s.slice(2);
  return s;
}

/**
 * 命令码 → 中文指令名（带回退）。
 * 返回 `{ name, code }`，表格可显示「喷洒控制 (0x0619)」。
 */
export function decodeCommandCode(code?: string): { name: string; raw: string } {
  const raw = code ?? "";
  const norm = normalizeCommandCode(raw);
  const name = COMMAND_CODE_NAMES[norm] ?? (raw ? `未知指令(${raw})` : "-");
  return { name, raw: norm ? `0x${norm}` : "" };
}

/** 操作动作 → 中文（未知则原样返回） */
export function decodeAction(action?: string): string {
  if (!action) return "-";
  return ACTION_LABELS[action] ?? action;
}

/** 设备事件类型 → 中文（未知则原样返回） */
export function decodeEventType(type?: string): string {
  if (!type) return "-";
  return EVENT_TYPE_LABELS[type] ?? type;
}

/** 解析 target_mains / target_subs（JSON array 字符串）为可读设备角色列表 */
export function decodeTargetList(
  jsonStr?: string | null,
): string {
  if (!jsonStr) return "-";
  try {
    const arr = JSON.parse(jsonStr);
    if (Array.isArray(arr) && arr.length > 0) {
      return arr.join("、");
    }
    return "-";
  } catch {
    return jsonStr;
  }
}
