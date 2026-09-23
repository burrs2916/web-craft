import pkg from "../../package.json";

/** 应用基础信息（关于 / 帮助页复用，避免命名漂移） */
export const APP_NAME = "EdgeView 空间数据可视化系统";
export const APP_SHORT_NAME = "EdgeView";
export const APP_VERSION = pkg.version;
export const APP_DESCRIPTION =
  "面向矿山喷雾降尘场景的实时空间数据可视化与设备监控桌面平台";

/** 技术架构（关于页展示） */
export const APP_TECH: string[] = [
  "Tauri 2（桌面外壳 / 跨平台）",
  "React 18 + TypeScript",
  "MUI（Material UI）组件库",
  "Three.js / WebGL（CAD 与 3D 渲染）",
  "ECharts（图表与趋势）",
  "Zustand（状态管理）",
];

/** 核心能力（关于页展示） */
export const APP_CAPABILITIES: string[] = [
  "实时态势监控（告警 / 通信概览 / 粉尘浓度）",
  "CAD / 瓦片 / 蓝图地图浏览与预览",
  "场景组态与发布管理",
  "数据源管理（HTTP / 设备适配器）",
  "告警中心（实时告警确认与归档）",
  "系统日志（操作 / 事件 / 系统 / 传感器）",
  "历史事件（报警触发 / 解除全量归档）",
  "组件库与图库管理",
];
