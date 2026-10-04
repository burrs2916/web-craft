import { GLOBAL_SCOPE, sceneScope, type LogScope } from "../../services/logMonitorApi";

// ═══════════════════════════════════════════════════════════════════
// 构造当前 scope：根据 scopeMode + sceneDeviceIds 计算 LogScope
// ═══════════════════════════════════════════════════════════════════

export function deriveScope(
  mode: "scene" | "global",
  sceneDeviceIds: string[],
): LogScope {
  if (mode === "global") return GLOBAL_SCOPE;
  // 严格消费主视图结果：scene 模式但主视图未绑定设备 → 发一个无效 ID 使后端 IN 过滤返回空，
  // 绝不回退为全矿查询（append_device_id_filter 空数组会 return = 全矿，必须避免）。
  if (sceneDeviceIds.length === 0) return sceneScope(["__NO_BINDING__"]);
  return sceneScope(sceneDeviceIds);
}

/**
 * 查询用作用域：多选设备画像优先。
 * 用户在日志筛选面板点选若干台分控器画像时（selectedDeviceIds 非空），把 scope 的
 * device_ids 收窄为这些设备（被选项必在 scene 子树 / 全矿范围内），实现"点哪几台按
 * 哪几台过滤日志（支持多选）"。未选设备时回退到 deriveScope（scene 子树或 global 全矿逃生口）。
 * 同时供图表组件复用（传入同样的字段），保证全视图一致跟随多选设备。
 */
export function buildQueryScope(opts: {
  selectedDeviceIds: string[];
  scopeMode: "scene" | "global";
  sceneDeviceIds: string[];
}): LogScope {
  if (opts.selectedDeviceIds.length > 0) {
    return sceneScope(opts.selectedDeviceIds);
  }
  return deriveScope(opts.scopeMode, opts.sceneDeviceIds);
}

/** 主视图是否已绑定数据源（sceneDeviceIds 非空） */
export function isSceneBound(sceneDeviceIds: string[]): boolean {
  return sceneDeviceIds.length > 0;
}