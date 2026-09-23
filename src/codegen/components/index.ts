import type { ComponentCodegenFn } from "../types";
import { textCodegen } from "./text";
import { shapeCodegen, metricCodegen } from "./basic";
import { imageCodegen, videoCodegen, audioCodegen } from "./media";
import {
  containerCodegen,
  gridCodegen,
  columnsCodegen,
  navbarCodegen,
  navbarHorizontalCodegen,
  sidebarMenuCodegen,
  tabsCodegen,
  spaceCodegen,
  cardCodegen,
  contentPanelCodegen,
  modalCodegen,
  drawerCodegen,
} from "./layout";
import {
  formButtonCodegen,
  formInputCodegen,
  formTextareaCodegen,
  formSelectCodegen,
  formCheckboxCodegen,
  formRadioCodegen,
  formLabelCodegen,
  formSwitchCodegen,
  formSliderCodegen,
  formDateCodegen,
  formTimeCodegen,
  formFileCodegen,
  formNumberCodegen,
  formContainerCodegen,
} from "./form";
import { tableCodegen } from "./table";
import { accordionCodegen } from "./accordion";
import { carouselCodegen } from "./carousel";
import { listCodegen } from "./list";
import { stepsCodegen } from "./steps";
import { timelineCodegen } from "./timeline";
import { breadcrumbCodegen } from "./breadcrumb";
import { pageHeaderCodegen } from "./pageHeader";
import { avatarCodegen } from "./avatar";
import { emptyStateCodegen } from "./emptyState";
import { skeletonCodegen } from "./skeleton";
import { backtopCodegen } from "./backtop";
import { segmentedCodegen } from "./segmented";
import { dividerCodegen } from "./divider";
import { tagCodegen } from "./tag";
import { progressCodegen } from "./progress";
import { switchCodegen } from "./switch";
import { alertCodegen } from "./alert";
import { paginationCodegen } from "./pagination";
import { tooltipCodegen } from "./tooltip";
import { badgeCodegen } from "./badge";
import { spinCodegen } from "./spin";
import { rateCodegen } from "./rate";
import { cascaderCodegen } from "./cascader";
import { calendarCodegen } from "./calendar";
import { descriptionsCodegen } from "./descriptions";
import { treeCodegen } from "./tree";
import { iconCodegen } from "./icon";
import { iconListCodegen } from "./iconList";
import { iconButtonCodegen } from "./iconButton";
import {
  loginFormCodegen,
  authGuardCodegen,
  userProfileCodegen,
  logoutButtonCodegen,
  oauthButtonCodegen,
  registerFormCodegen,
  ssoButtonCodegen,
  apiKeyConfigCodegen,
} from "./auth";
import { echartsCodegen } from "./echarts";
import { decorationShapeCodegen, DECORATION_SHAPE_KINDS } from "./decoration";
import { datavDecorCodegen, DATAV_DECOR_TYPES } from "./datavDecor";

/**
 * 组件类型 → codegen 函数注册表
 *
 * P0 组件（20 个）：
 *   text, image, shape, video, metric,
 *   container, grid, columns, navbar, navbar-horizontal, sidebar-menu, space, card, content-panel,
 *   form-button, form-input, form-textarea, form-select,
 *   form-checkbox, form-radio, form-label
 */
const registry: Record<string, ComponentCodegenFn> = {};

export function registerCodegen(type: string, fn: ComponentCodegenFn): void {
  registry[type] = fn;
}

export function getCodegen(type: string): ComponentCodegenFn | undefined {
  return registry[type];
}

export function getRegisteredTypes(): string[] {
  return Object.keys(registry);
}

export function isSupported(type: string): boolean {
  return type in registry;
}

/** 初始化所有内置组件 codegen */
export function initBuiltinCodegens(): void {
  registerCodegen("text", textCodegen);
  registerCodegen("image", imageCodegen);
  registerCodegen("shape", shapeCodegen);
  registerCodegen("video", videoCodegen);
  registerCodegen("audio", audioCodegen);
  registerCodegen("metric", metricCodegen);
  registerCodegen("container", containerCodegen);
  registerCodegen("grid", gridCodegen);
  registerCodegen("columns", columnsCodegen);
  registerCodegen("navbar", navbarCodegen);
  registerCodegen("navbar-horizontal", navbarHorizontalCodegen);
  registerCodegen("sidebar-menu", sidebarMenuCodegen);
  registerCodegen("tabs", tabsCodegen);
  registerCodegen("space", spaceCodegen);
  registerCodegen("card", cardCodegen);
  registerCodegen("content-panel", contentPanelCodegen);
  registerCodegen("content-modal", modalCodegen);
  registerCodegen("content-drawer", drawerCodegen);
  registerCodegen("form-button", formButtonCodegen);
  registerCodegen("form-container", formContainerCodegen);
  registerCodegen("form-input", formInputCodegen);
  registerCodegen("form-textarea", formTextareaCodegen);
  registerCodegen("form-select", formSelectCodegen);
  registerCodegen("form-checkbox", formCheckboxCodegen);
  registerCodegen("form-radio", formRadioCodegen);
  registerCodegen("form-label", formLabelCodegen);
  registerCodegen("form-switch", formSwitchCodegen);
  registerCodegen("form-slider", formSliderCodegen);
  registerCodegen("form-date", formDateCodegen);
  registerCodegen("form-time", formTimeCodegen);
  registerCodegen("form-file", formFileCodegen);
  registerCodegen("form-number", formNumberCodegen);
  registerCodegen("table", tableCodegen);
  registerCodegen("accordion", accordionCodegen);
  registerCodegen("carousel", carouselCodegen);
  registerCodegen("list", listCodegen);
  registerCodegen("steps", stepsCodegen);
  registerCodegen("steps-vertical", stepsCodegen);
  registerCodegen("timeline", timelineCodegen);
  registerCodegen("breadcrumb", breadcrumbCodegen);
  registerCodegen("page-header", pageHeaderCodegen);
  registerCodegen("avatar", avatarCodegen);
  registerCodegen("empty-state", emptyStateCodegen);
  registerCodegen("skeleton", skeletonCodegen);
  registerCodegen("backtop", backtopCodegen);
  registerCodegen("form-segmented", segmentedCodegen);
  registerCodegen("divider", dividerCodegen);
  registerCodegen("divider-vertical", dividerCodegen);
  registerCodegen("tag", tagCodegen);
  registerCodegen("progress", progressCodegen);
  registerCodegen("switch", switchCodegen);
  registerCodegen("alert", alertCodegen);
  registerCodegen("pagination", paginationCodegen);
  registerCodegen("tooltip", tooltipCodegen);
  registerCodegen("badge", badgeCodegen);
  registerCodegen("spin", spinCodegen);
  registerCodegen("form-rate", rateCodegen);
  registerCodegen("form-cascader", cascaderCodegen);
  registerCodegen("calendar", calendarCodegen);
  registerCodegen("descriptions", descriptionsCodegen);
  registerCodegen("tree", treeCodegen);
  // ─── 图标组件 ───
  registerCodegen("icon", iconCodegen);
  registerCodegen("icon-list", iconListCodegen);
  registerCodegen("icon-button", iconButtonCodegen);
  // ─── 认证组件 ───
  registerCodegen("auth-login-form", loginFormCodegen);
  registerCodegen("auth-guard", authGuardCodegen);
  registerCodegen("auth-user-profile", userProfileCodegen);
  registerCodegen("auth-logout-button", logoutButtonCodegen);
  registerCodegen("auth-oauth-button", oauthButtonCodegen);
  registerCodegen("auth-register-form", registerFormCodegen);
  registerCodegen("auth-sso-button", ssoButtonCodegen);
  registerCodegen("auth-api-key-config", apiKeyConfigCodegen);
  // ─── ECharts 图表组件（27 个类型共用运行时） ───
  registerCodegen("echart-bar", echartsCodegen);
  registerCodegen("echart-line-stacked", echartsCodegen);
  registerCodegen("echart-line-polar", echartsCodegen);
  registerCodegen("echart-line-dataset", echartsCodegen);
  registerCodegen("echart-line-sparkline", echartsCodegen);
  registerCodegen("echart-pie", echartsCodegen);
  registerCodegen("echart-scatter", echartsCodegen);
  registerCodegen("echart-radar", echartsCodegen);
  registerCodegen("echart-gauge-basic", echartsCodegen);
  registerCodegen("echart-gauge-progress", echartsCodegen);
  registerCodegen("echart-gauge-percent", echartsCodegen);
  registerCodegen("echart-heatmap", echartsCodegen);
  registerCodegen("echart-treemap", echartsCodegen);
  registerCodegen("echart-sunburst", echartsCodegen);
  registerCodegen("echart-boxplot", echartsCodegen);
  registerCodegen("echart-candlestick", echartsCodegen);
  registerCodegen("echart-funnel", echartsCodegen);
  registerCodegen("echart-sankey", echartsCodegen);
  registerCodegen("echart-graph", echartsCodegen);
  registerCodegen("echart-tree", echartsCodegen);
  registerCodegen("echart-themeriver", echartsCodegen);
  registerCodegen("echart-parallel", echartsCodegen);
  registerCodegen("echart-map", echartsCodegen);
  registerCodegen("echart-lines", echartsCodegen);
  registerCodegen("echart-effectscatter", echartsCodegen);
  registerCodegen("echart-pictorialbar", echartsCodegen);
  registerCodegen("echart-custom", echartsCodegen);
  // ─── 原生装饰形状（几何口径见 editor/data/decorationShape.ts，两端共用） ───
  for (const kind of DECORATION_SHAPE_KINDS) {
    registerCodegen(kind, decorationShapeCodegen);
  }
  // ─── datav 装饰族 25 个（边框 13 + 装饰 12）：复用编辑区组件做静态渲染，
  //     几何/配色/动画与编辑区同源（见 codegen/components/datavDecor.ts） ───
  for (const type of DATAV_DECOR_TYPES) {
    registerCodegen(type, datavDecorCodegen);
  }
}
