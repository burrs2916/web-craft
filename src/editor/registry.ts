export { componentRegistry } from "./registryCore";

import { componentRegistry } from "./registryCore";
import { registerBasicComponents } from "./registerBasicComponents";
import { registerLayoutComponents } from "./registerLayoutComponents";
import { registerFormComponents } from "./registerFormComponents";
import { registerDecorationComponents } from "./registerDecorationComponents";
import { registerChartComponents } from "./registerChartComponents";
import { registerTableComponents } from "./registerTableComponents";
import { registerIconComponents } from "./registerIconComponents";
import { registerAuthComponents } from "./registerAuthComponents";
import { registerEmbedComponents } from "./registerEmbedComponents";
import logger from "../utils/logger";

/**
 * 注册内置组件（网站编辑器）
 * - 基础组件（文本/图片/形状/视频/指标）
 * - 布局组件（容器/栅格/分栏/导航栏/间距/卡片）
 * - 表单组件（按钮/输入框/文本域/下拉选择/复选框/单选组/标签）
 * - 形状组件（基础形状）
 * - 图表组件（ECharts）
 * - 表格组件（表格/数据网格）
 * - 认证组件（登录/注册/OAuth/SSO/API Key/路由守卫）
 * - 外部嵌入组件（iframe 网页嵌入）
 */
export function registerBuiltinComponents(): void {
  logger.info("Registry", "registerBuiltinComponents START", {
    beforeCount: componentRegistry.getAll().length,
  });
  registerBasicComponents();
  registerLayoutComponents();
  registerFormComponents();
  registerDecorationComponents();
  registerChartComponents();
  registerTableComponents();
  registerIconComponents();
  registerAuthComponents();
  registerEmbedComponents();
  logger.info("Registry", "registerBuiltinComponents END", {
    finalCount: componentRegistry.getAll().length,
  });
}
