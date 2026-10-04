/**
 * Tauri IPC 服务聚合出口。按领域拆分为独立模块，统一从此处导出，
 * 对外保持与拆分前一致的公共 API（类型 / 常量 / *Api 命名空间）。
 */
export * from "./types";
export * from "./constants";
export { authApi } from "./authApi";
export { iconsApi } from "./iconsApi";
export { settingsApi } from "./settingsApi";
export { dashboardApi } from "./dashboardApi";
export { datasourceApi } from "./datasourceApi";
export { databaseApi } from "./databaseApi";
export { mqttApi } from "./mqttApi";
export { metricApi } from "./metricApi";
export { alertApi } from "./alertApi";
export { systemApi } from "./systemApi";
export { sceneApi } from "./sceneApi";