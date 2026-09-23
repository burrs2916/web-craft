/**
 * 响应式 CSS 生成器
 *
 * 从 SceneComponent[] 的 responsiveOverrides 生成 @media 查询 CSS。
 * 基础样式（desktop）由组件的内联样式承担，这里只生成 tablet/mobile 的覆盖。
 */

import type { SceneComponent, BreakpointId, Transform } from "../../types/editor";
import { getBreakpointConfig } from "../../types/editor";

/**
 * 生成单个组件在指定断点下的 CSS 规则（仅包含与 base 不同的属性）。
 */
function componentRule(comp: SceneComponent, bp: BreakpointId): string | null {
  if (bp === "desktop") return null;
  const override = comp.responsiveOverrides?.[bp];
  if (!override?.transform) return null;

  const t: Transform = { ...comp.transform, ...override.transform };
  const lines: string[] = [];

  // transform: translate + rotate
  const hasXY = override.transform.x !== undefined || override.transform.y !== undefined;
  const hasRot = override.transform.rotation !== undefined;
  if (hasXY || hasRot) {
    lines.push(`    transform: translate(${t.x}px, ${t.y}px) rotate(${t.rotation}deg);`);
  }
  if (override.transform.width !== undefined) {
    lines.push(`    width: ${t.width}px;`);
  }
  if (override.transform.height !== undefined) {
    lines.push(`    height: ${t.height}px;`);
  }

  // style 覆盖
  if (override.style) {
    for (const [key, val] of Object.entries(override.style)) {
      const cssKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();
      lines.push(`    ${cssKey}: ${typeof val === "number" ? val + "px" : val};`);
    }
  }

  if (lines.length === 0) return null;
  return `  [data-comp-id="${comp.id}"] {\n${lines.join("\n")}\n  }`;
}

/**
 * 为所有组件生成响应式 @media 查询 CSS。
 *
 * 输出结构：
 *   @media (max-width: 1023px) { ... tablet 覆盖 ... }
 *   @media (max-width: 767px)  { ... mobile 覆盖 ... }
 *
 * 只包含有 responsiveOverrides 的组件，无覆盖的组件不会出现在 CSS 中。
 */
export function generateResponsiveCSS(components: SceneComponent[]): string {
  const sections: string[] = [];

  for (const bp of ["tablet", "mobile"] as const) {
    const hasOverride = components.some((c) => c.responsiveOverrides?.[bp]?.transform || c.responsiveOverrides?.[bp]?.style);
    if (!hasOverride) continue;

    const config = getBreakpointConfig(bp);
    const maxWidth = config.maxWidth;
    if (maxWidth === undefined) continue;

    const rules = components
      .map((c) => componentRule(c, bp))
      .filter((r): r is string => r !== null);

    if (rules.length === 0) continue;

    sections.push(`@media (max-width: ${maxWidth}px) {\n${rules.join("\n")}\n}`);
  }

  return sections.join("\n\n");
}

/**
 * 将 CSS 注入到预览容器的 <style> 标签中。
 * 在预览模式下调用，使组件在浏览器宽度变化时自动响应断点。
 */
export function injectResponsiveCSS(container: HTMLElement | null, css: string): void {
  if (!container) return;
  const STYLE_ID = "responsive-breakpoint-css";

  let styleEl = container.querySelector(`#${STYLE_ID}`) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = STYLE_ID;
    container.appendChild(styleEl);
  }
  styleEl.textContent = css;
}

/**
 * 移除预览容器中的响应式 CSS。
 */
export function removeResponsiveCSS(container: HTMLElement | null): void {
  if (!container) return;
  const styleEl = container.querySelector("#responsive-breakpoint-css");
  if (styleEl) styleEl.remove();
}
