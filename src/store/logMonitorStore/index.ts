/**
 * logMonitorStore — 日志监控视图专用 store
 *
 * 与 `logQueryStore` **并行存在**，互不影响：
 * - `logQueryStore` 保留供其它潜在业务使用（零回归）。
 * - 本 store 仅服务于"日志监控" 6 个视图组件（LogFilterPanel + 4 tables + 趋势图）。
 *
 * 设计差异（vs logQueryStore）：
 * 1. 新增 `scopeMode: "scene" | "global"` —— 默认 scene（隔离是产品诉求，global 是逃生口）。
 * 2. 新增 `sceneDeviceIds: string[]` + `setSceneDeviceIds()` —— 由 `subscribeLogMonitorToScene()`
 *    监听 sceneStore.activeSceneId 变化自动灌入（无需 6 组件各自 useEffect）。
 * 3. 所有 query* actions 自动根据 scopeMode + sceneDeviceIds 派生 `LogScope` 发给
 *    logMonitorApi（使用 selectedDeviceIds 多值字段——支持分控器多选过滤日志）。
 *
 * 不破坏既有：
 * - 不修改 logQueryStore（保留）。
 * - 不修改任何 6 渲染器外的渲染器（见 Task #78 一次性 swap）。
 *
 * 按职责拆分到本目录：
 * - `types.ts`            类型镜像与 state 形状
 * - `defaults.ts`         默认时间窗 / 分页 / 空结果常量
 * - `scope.ts`            LogScope 派生（deriveScope / buildQueryScope / isSceneBound）
 * - `store.ts`            useLogMonitorStore 本体
 * - `reportMarkdown.ts`   分析洞察报告 → Markdown
 * - `sceneSubscription.ts` 场景设备池自动同步订阅
 */
export type { LogTab, TimeRange, QueryResult, LogQueryParams } from "./types";
export { deriveScope, buildQueryScope, isSceneBound } from "./scope";
export { useLogMonitorStore } from "./store";
export { subscribeLogMonitorToScene } from "./sceneSubscription";