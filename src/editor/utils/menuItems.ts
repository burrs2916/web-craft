/**
 * 菜单项共享数据模型
 *
 * 编辑器(MenuItemsEditor)、渲染器(Sidebar/Navbar)、codegen 三方共用，
 * 保证同一份数据在编辑、预览、发布三个环节行为一致。
 *
 * 存储格式：组件 config.menuItems 仍为字符串（JSON 数组），
 * 向后兼容旧格式：纯文本行（每行一个菜单项，2 空格缩进表示子级）与旧 JSON（含 href/disabled）。
 */

export type MenuLinkType = "none" | "page" | "url" | "pane" | "anchor" | "modal" | "drawer";

export interface MenuItem {
  label: string;
  icon?: string;
  /** 链接类型：无 / 站内页面 / 外部链接 / 内容面板 / 锚点滚动 / 弹出框 */
  linkType?: MenuLinkType;
  /** 链接目标：page = 视图 id；url = 完整 URL；pane = 面板 id；anchor = 元素 id */
  href?: string;
  /** url 类型：新窗口打开 */
  newTab?: boolean;
  /** 逐项文字颜色（覆盖全局 menuColor），不设则用全局色 */
  color?: string;
  disabled?: boolean;
  children?: MenuItem[];

  // —— 数据能力增强 ——

  /** 徽标文字（如 "3"、"New"、"99+"），为空不显示 */
  badge?: string;
  /** 徽标文字色 */
  badgeColor?: string;
  /** 徽标背景色 */
  badgeBg?: string;
  /** 快捷键提示（如 "Ctrl+K"），显示在菜单项右侧 */
  shortcut?: string;
  /** 禁用时的提示文案（tooltip） */
  description?: string;
  /** 是否为分组分隔符（渲染为分割线而非可点击项） */
  isDivider?: boolean;
  /** 分组标题（isDivider 为 true 时显示为带标题的分隔条，为空则纯分割线） */
  groupTitle?: string;

  // —— 样式能力扩展 ——

  /** 逐项字体大小（覆盖全局 menuFontSize） */
  fontSize?: number;
  /** 逐项图标颜色（覆盖全局 menuColor，仅影响图标） */
  iconColor?: string;
  /** 逐项间距（覆盖全局 menuGap，仅影响该项） */
  gap?: number;
  /** 逐项 hover 背景色（覆盖全局 itemActiveBg） */
  hoverBg?: string;
}

function normalizeItem(raw: unknown): MenuItem {
  if (typeof raw === "string") return { label: raw.trim() };
  if (!raw || typeof raw !== "object") return { label: "" };
  const obj = raw as Record<string, unknown>;
  const linkType = obj.linkType === "page" || obj.linkType === "url" || obj.linkType === "pane" || obj.linkType === "anchor" || obj.linkType === "modal" || obj.linkType === "drawer" ? obj.linkType
    : obj.href ? (String(obj.href).startsWith("#") ? "anchor" : "url")
    : "none";
  return {
    label: String(obj.label ?? "").trim() || "未命名",
    icon: obj.icon ? String(obj.icon) : undefined,
    linkType,
    href: obj.href != null ? String(obj.href) : undefined,
    newTab: obj.newTab === true,
    color: obj.color != null && obj.color !== "" ? String(obj.color) : undefined,
    disabled: obj.disabled === true,
    children: Array.isArray(obj.children) ? obj.children.map(normalizeItem) : undefined,
    badge: obj.badge != null && obj.badge !== "" ? String(obj.badge) : undefined,
    badgeColor: obj.badgeColor != null && obj.badgeColor !== "" ? String(obj.badgeColor) : undefined,
    badgeBg: obj.badgeBg != null && obj.badgeBg !== "" ? String(obj.badgeBg) : undefined,
    shortcut: obj.shortcut != null && obj.shortcut !== "" ? String(obj.shortcut) : undefined,
    description: obj.description != null && obj.description !== "" ? String(obj.description) : undefined,
    isDivider: obj.isDivider === true,
    groupTitle: obj.groupTitle != null && obj.groupTitle !== "" ? String(obj.groupTitle) : undefined,
    fontSize: obj.fontSize != null ? Number(obj.fontSize) : undefined,
    iconColor: obj.iconColor != null && obj.iconColor !== "" ? String(obj.iconColor) : undefined,
    gap: obj.gap != null ? Number(obj.gap) : undefined,
    hoverBg: obj.hoverBg != null && obj.hoverBg !== "" ? String(obj.hoverBg) : undefined,
  };
}

/**
 * 解析 config.menuItems 为菜单项数组。
 * 兼容三种输入：JSON 字符串、纯文本行（缩进表示层级）、已是数组的对象。
 */
export function parseMenuItems(raw: unknown): MenuItem[] {
  // 已是数组（理论不会出现，防御）
  if (Array.isArray(raw)) return raw.map(normalizeItem);

  const text = String(raw ?? "").trim();
  if (!text) return [];

  // JSON 数组
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map(normalizeItem);
    } catch {
      // fall through 到文本行解析
    }
  }

  // 纯文本行：每行一个菜单项，前导空格（每 2 格）表示子级
  const lines = text.split("\n").map((s) => s.replace(/\s+$/, "")).filter((s) => s.trim());
  const root: MenuItem[] = [];
  // 栈：[item, depth]，用于按缩进挂到父项
  const stack: { item: MenuItem; depth: number }[] = [];
  for (const line of lines) {
    const indent = line.length - line.trimStart().length;
    const depth = Math.floor(indent / 2);
    const item = normalizeItem(line.trim());
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop();
    if (stack.length === 0) {
      root.push(item);
    } else {
      const parent = stack[stack.length - 1].item;
      if (!parent.children) parent.children = [];
      parent.children.push(item);
    }
    stack.push({ item, depth });
  }
  return root;
}

/** 序列化为存储格式（JSON 字符串） */
export function serializeMenuItems(items: MenuItem[]): string {
  return JSON.stringify(items, (_k, v) => (v === undefined ? undefined : v), 2);
}

/** 视图名称 → URL 友好文件名（与 codegen/engine.ts slugify 保持一致） */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "") || "page";
}

export interface PageRef {
  id: string;
  name: string;
}

/**
 * 站内页面链接 → 发布后的 HTML 文件名。
 * 与 codegen engine 的页面命名规则一致：首页 index.html，其余 slug(name).html。
 */
export function pageHref(viewId: string, pages: PageRef[]): string {
  const idx = pages.findIndex((p) => p.id === viewId);
  if (idx < 0) return "#";
  return idx === 0 ? "index.html" : `${slugify(pages[idx].name)}.html`;
}

/** 菜单项最终 href（链接类型 + 页面表解析）；无链接返回 null */
export function resolveHref(item: MenuItem, pages?: PageRef[]): string | null {
  if (item.disabled) return null;
  if (item.linkType === "url") return item.href || null;
  if (item.linkType === "pane" && item.href) {
    return `#pane-${item.href}`;
  }
  if (item.linkType === "anchor" && item.href) {
    return `#${item.href}`;
  }
  if (item.linkType === "page" && item.href) {
    return pages && pages.length > 0 ? pageHref(item.href, pages) : null;
  }
  return null;
}

/** 链接类型显示名 */
export const LINK_TYPE_LABELS: Record<MenuLinkType, string> = {
  none: "无链接",
  page: "站内页面",
  url: "外部链接",
  pane: "内容面板",
  anchor: "锚点滚动",
  modal: "弹出框",
  drawer: "抽屉",
};
