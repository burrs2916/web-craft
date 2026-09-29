import { resolveHref } from "../../../editor/utils/menuItems";
import type { MenuItem } from "../../../editor/utils/menuItems";

/**
 * 将颜色转为指定透明度的 rgba 格式。
 * 支持 #rgb / #rrggbb / rgb() / rgba() 格式。
 */
export function applyOpacity(color: string, opacity: number): string {
  const alpha = Math.max(0, Math.min(1, opacity / 100));

  // rgba 格式：替换 alpha 值
  if (color.startsWith("rgba(")) {
    return color.replace(/rgba\(\s*([^,]+,\s*[^,]+,\s*[^,]+)\s*,\s*[\d.]+\s*\)/, `rgba($1, ${alpha})`);
  }
  // rgb 格式：加 alpha
  if (color.startsWith("rgb(")) {
    return color.replace(/rgb\(\s*([^)]+)\s*\)/, `rgba($1, ${alpha})`);
  }
  // 十六进制 #rrggbb 或 #rgb
  if (color.startsWith("#")) {
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex.split("").map((c) => c + c).join("");
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  return color;
}

/**
 * 解析菜单项链接。
 * 预览模式：page 类型用 data-view-link 实现单页内视图切换（SPA 式）。
 * 发布模式：page 类型解析为对应 HTML 文件名。
 * pane 类型：预览和发布都用 data-pane-link 实现同视图内面板切换（不导航）。
 * anchor 类型：预览和发布都用 #id 锚点，配合 data-anchor 属性实现页内滚动。
 */
export function resolveMenuLink(
  item: MenuItem,
  pages: { id: string; name: string }[],
  preview: boolean,
): { href: string | null; extraAttrs: string } {
  if (item.disabled) return { href: null, extraAttrs: "" };
  if (item.linkType === "url") return { href: item.href || null, extraAttrs: "" };
  if (item.linkType === "pane" && item.href) {
    return { href: null, extraAttrs: ` data-pane-link="${item.href}"` };
  }
  if (item.linkType === "modal" && item.href) {
    return { href: null, extraAttrs: ` data-modal-link="${item.href}"` };
  }
  if (item.linkType === "drawer" && item.href) {
    return { href: null, extraAttrs: ` data-drawer-link="${item.href}"` };
  }
  if (item.linkType === "anchor" && item.href) {
    return { href: `#${item.href}`, extraAttrs: ` data-anchor="${item.href}"` };
  }
  if (item.linkType === "page" && item.href) {
    if (preview) {
      return { href: `#${item.href}`, extraAttrs: ` data-view-link="${item.href}"` };
    }
    const fileHref = resolveHref(item, pages);
    return { href: fileHref, extraAttrs: "" };
  }
  return { href: null, extraAttrs: "" };
}
