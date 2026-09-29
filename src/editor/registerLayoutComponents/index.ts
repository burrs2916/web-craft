import { registerContainer } from "./container";
import { registerGrid } from "./grid";
import { registerColumns } from "./columns";
import { registerNavbarHorizontal, registerSidebarMenu } from "./navbar";
import { registerTabs } from "./tabs";
import { registerSpace } from "./space";
import { registerCard } from "./card";
import { registerContentPanel, registerContentModal, registerContentDrawer } from "./content";
import { registerAccordion } from "./accordion";
import { registerCarousel } from "./carousel";
import { registerList } from "./list";
import { registerSteps, registerStepsVertical } from "./steps";
import { registerTimeline } from "./timeline";
import { registerBreadcrumb } from "./breadcrumb";
import { registerPageHeader } from "./pageHeader";
import { registerDivider, registerDividerVertical } from "./divider";
import { registerAlert, registerTooltip } from "./feedback";

/**
 * 注册布局组件（网站编辑器）
 * - Container 容器、Grid 栅格、Columns 分栏、Navbar 导航栏、Space 间距、Card 卡片
 * - Container/Grid/Columns 当前为可视化骨架（画出布局结构），嵌套拖入待渲染层支持后补
 */
export function registerLayoutComponents(): void {
  registerContainer();
  registerGrid();
  registerColumns();
  registerNavbarHorizontal();
  registerSidebarMenu();
  registerTabs();
  registerSpace();
  registerCard();
  registerContentPanel();
  registerContentModal();
  registerContentDrawer();
  registerAccordion();
  registerCarousel();
  registerList();
  registerSteps();
  registerStepsVertical();
  registerTimeline();
  registerBreadcrumb();
  registerPageHeader();
  registerDivider();
  registerDividerVertical();
  registerAlert();
  registerTooltip();
}
