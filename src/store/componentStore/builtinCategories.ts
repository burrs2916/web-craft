import type { ComponentCategory } from "../../types/component";

/** 内置"基础组件"分类 — 纯前端注入 */
const BASIC_CATEGORY: ComponentCategory = {
  id: "ccat_basic",
  name: "基础组件",
  icon: "text_fields",
  color: "#90CAF9",
  sortOrder: 10,
  description: "文本、图片等基础元素",
  createdAt: 0,
  updatedAt: 0,
};

/** 内置"布局组件"分类 — 纯前端注入 */
const LAYOUT_CATEGORY: ComponentCategory = {
  id: "ccat_layout",
  name: "布局组件",
  icon: "view_quilt",
  color: "#A5D6A7",
  sortOrder: 15,
  description: "容器、栅格、导航栏等布局元素",
  createdAt: 0,
  updatedAt: 0,
};

/** 内置"表单组件"分类 — 纯前端注入 */
const FORM_CATEGORY: ComponentCategory = {
  id: "ccat_form",
  name: "表单组件",
  icon: "input",
  color: "#CE93D8",
  sortOrder: 20,
  description: "按钮、输入框、选择器等交互元素",
  createdAt: 0,
  updatedAt: 0,
};

/** 内置"认证组件"分类 — 纯前端注入 */
const AUTH_CATEGORY: ComponentCategory = {
  id: "ccat_auth",
  name: "认证组件",
  icon: "lock",
  color: "#FF7043",
  sortOrder: 25,
  description: "登录、注册、OAuth、SSO 等用户认证组件",
  createdAt: 0,
  updatedAt: 0,
};

/** 内置"媒体组件"分类 — 纯前端注入 */
const MEDIA_CATEGORY: ComponentCategory = {
  id: "ccat_media",
  name: "媒体组件",
  icon: "movie",
  color: "#FFD54F",
  sortOrder: 30,
  description: "图片、视频、音频等原生多媒体元素",
  createdAt: 0,
  updatedAt: 0,
};

/** 内置"外部嵌入"分类 — 纯前端注入 */
const EMBED_CATEGORY: ComponentCategory = {
  id: "ccat_embed",
  name: "外部嵌入",
  icon: "web",
  color: "#81D4FA",
  sortOrder: 35,
  description: "网页嵌入、第三方内容容器等非原生媒体嵌入组件",
  createdAt: 0,
  updatedAt: 0,
};

/** 内置"图表组件"分类 — 纯前端注入 */
const CHART_CATEGORY: ComponentCategory = {
  id: "ccat_chart",
  name: "图表组件",
  icon: "bar_chart",
  color: "#FFAB91",
  sortOrder: 40,
  description: "柱状图、饼图、折线图、仪表盘等数据可视化组件",
  createdAt: 0,
  updatedAt: 0,
};

/** 内置"形状组件"分类 — 纯前端注入 */
const SHAPE_CATEGORY: ComponentCategory = {
  id: "ccat_shape",
  name: "形状组件",
  icon: "category",
  color: "#80DEEA",
  sortOrder: 50,
  description: "矩形、圆形、线条、箭头等基础形状",
  createdAt: 0,
  updatedAt: 0,
};

/** 内置"表格组件"分类 — 纯前端注入 */
const TABLE_CATEGORY: ComponentCategory = {
  id: "ccat_table",
  name: "表格组件",
  icon: "table_chart",
  color: "#AED581",
  sortOrder: 35,
  description: "表格、数据网格等结构化数据展示组件",
  createdAt: 0,
  updatedAt: 0,
};

/** 内置"装饰组件"分类 — 纯前端注入 */
const DECORATION_CATEGORY: ComponentCategory = {
  id: "ccat_decoration",
  name: "装饰组件",
  icon: "auto_awesome",
  color: "#B39DDB",
  sortOrder: 45,
  description: "边框、分割线、渐变、图案等页面装饰元素",
  createdAt: 0,
  updatedAt: 0,
};

/** 内置"图标组件"分类 — 纯前端注入 */
const ICON_CATEGORY: ComponentCategory = {
  id: "ccat_icon",
  name: "图标组件",
  icon: "star",
  color: "#F48FB1",
  sortOrder: 47,
  description: "单图标、图标列表、图标按钮等图标元素",
  createdAt: 0,
  updatedAt: 0,
};

function ensureCategory(categories: ComponentCategory[], cat: ComponentCategory) {
  if (categories.some((c) => c.id === cat.id)) return;
  categories.push({ ...cat });
}

/** 注入全部内置分类（网站编辑器） */
export function ensureBuiltinCategories(categories: ComponentCategory[]) {
  ensureCategory(categories, BASIC_CATEGORY);
  ensureCategory(categories, LAYOUT_CATEGORY);
  ensureCategory(categories, FORM_CATEGORY);
  ensureCategory(categories, AUTH_CATEGORY);
  ensureCategory(categories, MEDIA_CATEGORY);
  ensureCategory(categories, EMBED_CATEGORY);
  ensureCategory(categories, TABLE_CATEGORY);
  ensureCategory(categories, CHART_CATEGORY);
  ensureCategory(categories, ICON_CATEGORY);
  ensureCategory(categories, DECORATION_CATEGORY);
  ensureCategory(categories, SHAPE_CATEGORY);
}