/**
 * 脚手架级响应式 CSS 生成器
 *
 * 从 SceneComponent[] 的 responsiveOverrides 生成 @media 查询 CSS，
 * 供完整项目脚手架（static-html / react / vue / angular）的样式文件使用。
 *
 * 与编辑器预览版（src/editor/utils/responsiveCSS.ts）的关键差异：
 * 1. selector 使用脚手架 DOM 的 `data-component-id`（而非预览版 `data-comp-id`）；
 * 2. 定位字段输出 `left/top`（脚手架布局 transformToAbsoluteCSS 的绝对定位），
 *    而非预览版的 `translate()` —— 直接复用预览版规则无法命中脚手架布局；
 * 3. 所有声明追加 `!important`：组件包装 div 的布局/样式是内联样式，
 *    普通 CSS 规则优先级低于内联样式，不加 `!important` 断点覆盖不生效。
 *
 * 基础样式（desktop）由组件包装 div 的内联样式承担，这里只生成 tablet/mobile 覆盖。
 */

import type { BreakpointId, SceneComponent, Transform } from "../../types/editor";
import { getBreakpointConfig } from "../../types/editor";

/**
 * 生成单个组件在指定断点下的 CSS 规则（仅包含与 base 不同的属性）。
 * 全部声明带 !important，确保覆盖组件包装 div 的内联样式。
 */
function componentResponsiveRule(comp: SceneComponent, bp: BreakpointId): string | null {
  if (bp === "desktop") return null;
  const override = comp.responsiveOverrides?.[bp];
  if (!override) return null;

  const t: Transform = { ...comp.transform, ...override.transform };
  const lines: string[] = [];

  // 定位：left/top（脚手架绝对定位字段）
  if (override.transform?.x !== undefined || override.transform?.y !== undefined) {
    lines.push(`    left: ${t.x}px !important;`);
    lines.push(`    top: ${t.y}px !important;`);
  }

  // 旋转 / 缩放：与 transformToAbsoluteCSS 相同的 scale → rotate 组合顺序
  if (override.transform?.rotation !== undefined || override.transform?.scale !== undefined) {
    const tf: string[] = [];
    if (t.scale.x !== 1 || t.scale.y !== 1) {
      tf.push(`scale(${t.scale.x}, ${t.scale.y})`);
    }
    if (t.rotation !== 0) {
      tf.push(`rotate(${t.rotation}deg)`);
    }
    if (tf.length > 0) {
      lines.push(`    transform: ${tf.join(" ")} !important;`);
    }
  }

  // 尺寸
  if (override.transform?.width !== undefined) {
    lines.push(`    width: ${t.width}px !important;`);
  }
  if (override.transform?.height !== undefined) {
    lines.push(`    height: ${t.height}px !important;`);
  }

  // style 覆盖
  if (override.style) {
    for (const [key, val] of Object.entries(override.style)) {
      const cssKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();
      lines.push(`    ${cssKey}: ${typeof val === "number" ? val + "px" : val} !important;`);
    }
  }

  if (lines.length === 0) return null;
  return `  [data-component-id="${comp.id}"] {\n${lines.join("\n")}\n  }`;
}

/**
 * 为所有组件生成脚手架版响应式 @media 查询 CSS。
 *
 * 输出结构：
 *   @media (max-width: 1023px) { ... tablet 覆盖 ... }
 *   @media (max-width: 767px)  { ... mobile 覆盖 ... }
 *
 * 只包含有 responsiveOverrides 的组件，无覆盖的组件不会出现在 CSS 中。
 */
export function generateScaffoldResponsiveCSS(components: SceneComponent[]): string {
  const sections: string[] = [];

  for (const bp of ["tablet", "mobile"] as const) {
    const hasOverride = components.some((c) => c.responsiveOverrides?.[bp]);
    if (!hasOverride) continue;

    const config = getBreakpointConfig(bp);
    const maxWidth = config.maxWidth;
    if (maxWidth === undefined) continue;

    const rules = components
      .map((c) => componentResponsiveRule(c, bp))
      .filter((r): r is string => r !== null);

    if (rules.length === 0) continue;

    sections.push(`@media (max-width: ${maxWidth}px) {\n${rules.join("\n")}\n}`);
  }

  return sections.join("\n\n");
}