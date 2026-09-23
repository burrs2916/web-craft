/**
 * useBindVisibility — 数据感知显隐共享 Hook
 *
 * 骨架屏 / 加载动画 / 空态占位共用：组件内容不渲染数据，而是轮询探测一个接口，
 * 据此决定自身显示/隐藏。取数统一走 useApiDataFetch（URL 拼接 / 全局默认请求头 /
 * 认证注入 / POST 请求体 / 轮询规则与所有数据组件一致）。
 *
 * 两种模式：
 *   - "loaded"：接口成功返回即隐藏（骨架屏 / 加载动画的"加载中显示"语义）
 *   - "empty" ：按判空规则决定显隐（空态占位的"无数据时显示"语义）
 *
 * 配置字段（bind* 前缀）：visibilityMode(always|api)、bindUrl、bindMethod、
 * bindHeaders、bindBody、bindInterval、bindDataPath、bindAuthEnabled、
 * emptyWhen、showWhenEmpty、hideOnError
 */

import { useApiDataFetch } from "./useApiDataFetch";
import { readAuthEnabled } from "../data/authMode";

/** 判空规则：与发布端 bindVisibilityScript 中的 isEmpty 严格一致 */
export function resolveEmpty(val: unknown, mode: string): boolean {
  if (mode === "emptyArray") return Array.isArray(val) && val.length === 0;
  if (mode === "zero") return Number(val) === 0;
  if (mode === "falsy") return !val;
  if (val === undefined || val === null || val === "") return true;
  if (Array.isArray(val)) return val.length === 0;
  if (typeof val === "object") return Object.keys(val as object).length === 0;
  return false;
}

export type BindVisibilityMode = "loaded" | "empty";

/**
 * 返回当前是否应显示本组件。
 * 编辑态（isEdit）或非接口驱动时恒为 true。
 */
export function useBindVisibility(
  config: Record<string, unknown>,
  isEdit: boolean,
  mode: BindVisibilityMode,
): boolean {
  const visibilityMode = String(config.visibilityMode ?? "always");
  const bindUrl = String(config.bindUrl ?? "");
  const active = !isEdit && visibilityMode === "api" && bindUrl !== "";

  const { data, error } = useApiDataFetch<unknown>({
    dataMode: active ? "api" : "static",
    staticData: null,
    apiUrl: bindUrl,
    apiMethod: (String(config.bindMethod ?? "GET") || "GET") as "GET" | "POST",
    apiHeaders: config.bindHeaders,
    apiBody: config.bindBody,
    apiInterval: (config.bindInterval as number) ?? 0,
    apiDataPath: String(config.bindDataPath ?? ""),
    // 三态透传（null = 跟随站点全局）—— 与内容数据源同一入口，勿压成布尔
    authEnabled: readAuthEnabled(config.bindAuthEnabled),
  });

  if (!active) return true;

  // 请求失败（网络错误 / 非 2xx / 解析失败）→ 按 hideOnError 决定
  // （loaded 模式默认失败继续显示，empty 模式默认失败隐藏）
  if (error != null) {
    const fallback = mode === "empty";
    return !(config.hideOnError as boolean ?? fallback);
  }

  if (mode === "loaded") {
    // 尚未响应（首次加载中）→ 显示；成功返回（含空对象/空数组）→ 隐藏
    return data == null;
  }

  // empty 模式：首次加载中显示占位；数据到达后按判空规则
  if (data == null) return true;
  const isEmpty = resolveEmpty(data, String(config.emptyWhen ?? "emptyValue"));
  return isEmpty === ((config.showWhenEmpty as boolean) ?? true);
}
