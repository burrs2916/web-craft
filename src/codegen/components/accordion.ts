import type { ComponentCodegenFn, CodegenContext } from "../types";
import type { SceneComponent } from "../../types/editor";
import { escapeHTML } from "../layout";
import { renderMenuIcon } from "../iconPipeline";

interface AccordionItem {
  title: string;
  content: string;
  icon?: string;
  iconColor?: string;
}

const DEFAULT_ITEMS: AccordionItem[] = [
  { title: "面板一", content: "这是面板一的内容。", icon: "widgets" },
  { title: "面板二", content: "这是面板二的内容。", icon: "settings" },
  { title: "面板三", content: "这是面板三的内容。", icon: "info" },
];

function parseItems(input: unknown): AccordionItem[] {
  if (Array.isArray(input) && input.length > 0) {
    return input.map((item, i) => ({
      title: String((item as Record<string, unknown>)?.title ?? `面板 ${i + 1}`),
      content: String((item as Record<string, unknown>)?.content ?? ""),
      icon: String((item as Record<string, unknown>)?.icon ?? "") || undefined,
      iconColor: String((item as Record<string, unknown>)?.iconColor ?? "") || undefined,
    }));
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item: Record<string, unknown>, i: number) => ({
            title: String(item?.title ?? `面板 ${i + 1}`),
            content: String(item?.content ?? ""),
            icon: String(item?.icon ?? "") || undefined,
            iconColor: String(item?.iconColor ?? "") || undefined,
          }));
        }
        if (Array.isArray(parsed) && parsed.length === 0) {
          return [{ title: "面板 1", content: "" }];
        }
      } catch {
        // fall through
      }
    }
    const lines = trimmed.split("\n").map((s) => s.trim()).filter(Boolean);
    if (lines.length > 0) {
      return lines.map((title) => ({ title, content: "" }));
    }
  }
  return [...DEFAULT_ITEMS];
}

/**
 * accordion 组件 -> HTML
 * 配置：items(JSON), accordionMode, defaultExpandFirst,
 *       headerBgColor/headerColor/headerFontSize/headerFontWeight/headerHeight,
 *       contentBgColor/contentColor/contentFontSize/contentPadding,
 *       borderEnabled/borderColor/borderWidth/borderRadius, gap
 */
export const accordionCodegen: ComponentCodegenFn = (
  component: SceneComponent,
  ctx: CodegenContext,
) => {
  const c = component.config;

  const items = parseItems(c.items);
  const accordionMode = c.accordionMode !== false;
  const defaultExpandFirst = c.defaultExpandFirst !== false;
  const scaleFit = c.scaleFit !== false;

  const headerBgColor = String(c.headerBgColor ?? "rgba(255,255,255,0.06)");
  const headerColor = String(c.headerColor ?? "#e0e0e0");
  const headerFontSize = Number(c.headerFontSize ?? 14);
  const headerFontWeight = String(c.headerFontWeight ?? "medium");
  const headerHeight = Number(c.headerHeight ?? 44);
  const contentBgColor = String(c.contentBgColor ?? "rgba(0,0,0,0.15)");
  const contentColor = String(c.contentColor ?? "rgba(255,255,255,0.7)");
  const contentFontSize = Number(c.contentFontSize ?? 13);
  const contentPadding = Number(c.contentPadding ?? 12);
  const borderEnabled = c.borderEnabled !== false;
  const borderColor = String(c.borderColor ?? "rgba(255,255,255,0.1)");
  const borderWidth = Number(c.borderWidth ?? 1);
  const borderRadius = Number(c.borderRadius ?? 6);
  const gap = Number(c.gap ?? 8);
  const fontWeightCss = headerFontWeight === "medium" ? "500" : headerFontWeight;
  const itemIconSize = Number(c.itemIconSize ?? 16);

  // 随框等比缩放（基准 360×320），与编辑态渲染器一致
  const tf = component.transform ?? {};
  const bw = Number(tf.width) || 0;
  const bh = Number(tf.height) || 0;
  const fit = scaleFit && bw > 0 && bh > 0 ? Math.min(bw / 360, bh / 320) : 1;
  const factor = Math.min(Math.max(fit, 0.4), 4);
  const sHeight = Math.max(32, Math.round(headerHeight * factor));
  const sFontSize = Math.round(headerFontSize * factor);
  const sContentFontSize = Math.round(contentFontSize * factor);
  const sPadding = Math.round(contentPadding * factor);
  const sRadius = Math.round(borderRadius * factor);
  const sGap = Math.round(gap * factor);
  const sIcon = Math.max(12, Math.round(itemIconSize * factor));

  const borderCss = borderEnabled ? `${borderWidth}px solid ${borderColor}` : "none";

  // 过渡动画 CSS（每页注入一次，靠 data-wc-accordion 容器作用域区分实例）
  // 展开/收起用 grid-template-rows 0fr→1fr：动画精确贴合内容真实高度，
  // 替代 max-height:9999px hack（其可见动画只占总时长 ~1%，观感为瞬间跳变）
  if (!ctx.pageStyles.some((s) => s.includes("[data-wc-accordion]"))) {
    ctx.pageStyles.push(`[data-wc-accordion] .wc-acc-expander{display:grid;grid-template-rows:0fr;transition:grid-template-rows .3s cubic-bezier(.4,0,.2,1)}
[data-wc-accordion] .wc-acc-panel[data-open="true"]>.wc-acc-expander{grid-template-rows:1fr}
[data-wc-accordion] .wc-acc-squeezer{min-height:0;overflow:hidden;opacity:0;transition:opacity .3s ease}
[data-wc-accordion] .wc-acc-panel[data-open="true"]>.wc-acc-expander>.wc-acc-squeezer{opacity:1}
[data-wc-accordion] .wc-acc-icon{transition:transform .3s cubic-bezier(.4,0,.2,1)}
[data-wc-accordion] .wc-acc-panel[data-open="true"] .wc-acc-icon{transform:rotate(0deg)}
[data-wc-accordion] .wc-acc-panel:not([data-open="true"]) .wc-acc-icon{transform:rotate(-90deg)}
[data-wc-accordion] .wc-acc-header{transition:background-color .2s,filter .2s}
[data-wc-accordion] .wc-acc-header:hover{filter:brightness(1.12)}
@media (prefers-reduced-motion: reduce){[data-wc-accordion] .wc-acc-expander,[data-wc-accordion] .wc-acc-squeezer,[data-wc-accordion] .wc-acc-icon{transition:none}}`);
  }

  // 构建面板 HTML（class 固定为 wc-acc-*，靠 data-wc-accordion 容器作用域区分，无需随机 uid）
  let panelsHTML = "";
  items.forEach((item, i) => {
    const open = defaultExpandFirst && i === 0;
    const headerStyle = [
      "display:flex",
      "align-items:center",
      "justify-content:space-between",
      `height:${sHeight}px`,
      "padding:0 16px",
      `background:${headerBgColor}`,
      `color:${headerColor}`,
      `font-size:${sFontSize}px`,
      `font-weight:${fontWeightCss}`,
      "cursor:pointer",
      "user-select:none",
      "box-sizing:border-box",
    ].join(";");

    const squeezerStyle = [
      `background:${contentBgColor}`,
      `color:${contentColor}`,
      `font-size:${sContentFontSize}px`,
    ].join(";");

    const iconStyle = [
      "flex-shrink:0",
      `font-size:${sIcon}px`,
      `width:${sIcon}px`,
      `height:${sIcon}px`,
      "line-height:1",
    ].join(";");

    panelsHTML += `<div class="wc-acc-panel" data-index="${i}" data-open="${open}" style="border-radius:${sRadius}px;overflow:hidden;border:${borderCss};flex-shrink:0">`;
    panelsHTML += `<div class="wc-acc-header" data-index="${i}" role="button" aria-expanded="${open}" style="${headerStyle}">`;
    let iconHTML = "";
    if (item.icon) {
      const icon = renderMenuIcon(item.icon, sIcon, ctx);
      iconHTML += item.iconColor
        ? `<span style="display:inline-flex;align-items:center;color:${item.iconColor}">${icon}</span>`
        : icon;
    }
    panelsHTML += `<span style="display:inline-flex;align-items:center;gap:${Math.round(6 * factor)}px;min-width:0">${iconHTML}<span style="font-size:inherit;font-weight:inherit;line-height:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHTML(item.title)}</span></span>`;
    panelsHTML += `<svg class="wc-acc-icon" data-index="${i}" viewBox="0 0 24 24" fill="currentColor" style="${iconStyle}"><path d="M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z"/></svg>`;
    panelsHTML += `</div>`;
    panelsHTML += `<div class="wc-acc-expander"><div class="wc-acc-squeezer" style="${squeezerStyle}"><div style="padding:${sPadding}px;white-space:pre-wrap;word-break:break-word;line-height:1.6">${escapeHTML(item.content)}</div></div></div>`;
    panelsHTML += `</div>`;
  });

  // JS 脚本：只翻转 data-open，动画全部由 CSS 过渡驱动（文档级事件委托 + 容器作用域，跨视图去重）
  const script = `
<script>
(function(){
  if (window.__wcAccordionInit) return;
  window.__wcAccordionInit = true;
  document.addEventListener('click', function(e){
    var h = e.target.closest('.wc-acc-header');
    if (!h) return;
    var root = h.closest('[data-wc-accordion]');
    if (!root) return;
    var panel = h.closest('.wc-acc-panel');
    if (!panel) return;
    if (root.getAttribute('data-accordion-mode') !== 'false') {
      var panels = root.querySelectorAll('.wc-acc-panel');
      for (var j = 0; j < panels.length; j++) {
        if (panels[j] !== panel) {
          panels[j].setAttribute('data-open', 'false');
          var hs = panels[j].querySelector('.wc-acc-header');
          if (hs) hs.setAttribute('aria-expanded', 'false');
        }
      }
    }
    var open = panel.getAttribute('data-open') !== 'true';
    panel.setAttribute('data-open', open ? 'true' : 'false');
    h.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
})();
</script>`;

  const outerStyle = [
    "width:100%",
    "height:100%",
    "display:flex",
    "flex-direction:column",
    `gap:${sGap}px`,
    "overflow-y:auto",
    "box-sizing:border-box",
  ].join(";");

  return `<div data-wc-accordion data-accordion-mode="${accordionMode}" style="${outerStyle}">${panelsHTML}</div>${script}`;
};
