import { SHAPE_RADIUS } from "../../../editor/data/fieldStyle";
import { getCodegen } from "../../components";
import { escapeHTML } from "../../layout";
import type { SceneComponent } from "../../../types/editor";
import type { CodegenContext } from "../../types";



/**
 * 编辑区表单控件由 MUI（v9）渲染，以下真值来自对编辑区实测（headless 量取）：
 * - 主题 shape.borderRadius=10：sx 传“数字”圆角会 ×10（input/textarea/select/容器/date/time/number/file），
 *   统一由 `resolveFieldStyle().radiusCss`（面板值 × SHAPE_RADIUS）复刻，全表单族同一口径。
 * - 字体栈固定 Inter/SF Pro（不受画布字体影响），发布端必须显式钉住（MUI_FONT 来自 fieldStyle）。
 * - 暗色主题派生色：聚焦标签 #60A5FA、已填标签 #94A3B8、星号 #FF7B72（均在 fieldChrome 内定义）
 *   本文件不再自带这些字面量，避免与共享外壳出现两份取值。
 * - sx 间距数字按 spacing 单位(×8px)换算：iconGap:8 实际渲染 64px。
 */

/** 编辑区 sx 数字圆角 → ×shape.borderRadius(10) */
export function sxRadius(v: unknown, fallback = 4): string {
  const n = Number(v);
  return `${(Number.isFinite(n) && n >= 0 ? n : fallback) * SHAPE_RADIUS}px`;
}



export const CB_OFF = "M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z";

export const CB_ON = "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-8.7 16l-6-6 1.4-1.4 4.6 4.6 6.6-6.6L19 10l-8.7 9z";

/** MUI IndeterminateCheckBox 图标（实心方块 + 横线） */
export const CB_IND = "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2z";

export const RB_OFF = "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z";

export const RB_ON = "M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z";

export const ICON_ARROW_DROP = "M7 10l5 5 5-5z";

export const ICON_CLOSE = "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z";


/** MUI 图标 SVG 复刻（evenodd：填充 checkbox 的对勾镂空/单选的中心点） */
export function svgIcon(path: string, size: number, color: string, cls = ""): string {
  return `<svg${cls ? ` class="${cls}"` : ""} viewBox="0 0 24 24" width="${size}" height="${size}" fill="${color}" aria-hidden="true" style="display:block"><path fill-rule="evenodd" d="${path}"/></svg>`;
}


/**
 * 靠 CSS 类规则切换显隐的图标（勾选/未勾选、选中/未选中）。
 * **绝不能带 inline display**：svgIcon 的 `style="display:block"` 优先级高于任何非 !important
 * 的样式表声明，会压掉 `.ic-on{display:none}` → 两个图标同时可见、点击无视觉变化
 * （表现得像"复选框/单选坏了"，实际是 CSS 级联被 inline 压制）。
 * 图标容器本身是 flex，svg 会被 blockify，不需要 display:block。
 */
export function toggleIcon(path: string, size: number, color: string, cls: string): string {
  return `<svg class="${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="${color}" aria-hidden="true"><path fill-rule="evenodd" d="${path}"/></svg>`;
}


/**
 * 生成表单容器内的子控件（发布端）。
 * 对齐画布 EditorCanvasComponent：子控件以“绝对定位叠加”渲染在容器之上，
 * 位置/尺寸取子组件自身 transform（x/y 为相对容器设计盒的坐标），
 * 与 grid/columns/box/auth-guard 等容器走同一 generateChildHTML 语义。
 * borderInset：编辑区子控件以容器外缘为原点，发布端 absolute 原点是 form 的
 * padding box（边框内缩 1px），需减去边框宽度补偿，保证像素级对齐。
 */
export function formChildCellHTML(child: SceneComponent, ctx: CodegenContext, borderInset = 0): string {
  const codegenFn = getCodegen(child.type);
  if (!codegenFn) return "";
  const tf = child.transform ?? { x: 0, y: 0, width: 200, height: 40, rotation: 0, scale: { x: 1, y: 1 } };
  const x = Math.round(Number(tf.x ?? 0)) - borderInset;
  const y = Math.round(Number(tf.y ?? 0)) - borderInset;
  const w = Math.round(Number(tf.width ?? 200));
  const h = Math.round(Number(tf.height ?? 40));
  const inner = codegenFn(child, ctx);
  const posStyles = [`left:${x}px`, `top:${y}px`, `width:${w}px`, `height:${h}px`];
  const rotation = Number(tf.rotation ?? 0);
  if (rotation) posStyles.push(`transform:rotate(${rotation}deg)`);
  if (child.zIndex) posStyles.push(`z-index:${child.zIndex}`);
  if (child.visible === false) posStyles.push("display:none");
  return `<div data-component-id="${child.id}" data-component-type="${child.type}" data-form-field="1" style="position:absolute;${posStyles.join(";")};pointer-events:auto">${inner}</div>`;
}


/** 生成表单控件 name="..." 属性：优先 fieldName，否则按 label 生成（中英文/数字保留，空白符号转 _）。 */
// 导出：基础开关（switch）合并表单能力后共用同一命名口径，禁止第二份实现
export function fieldNameAttr(c: Record<string, unknown>, fallback?: string): string {
  const raw = String(c.fieldName ?? "").trim() || String(c.label ?? "").trim() || fallback || "field";
  const slug = raw
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_\-]/gu, "_")
    .replace(/^_+|_+$/g, "") || "field";
  return `name="${escapeHTML(slug)}"`;
}
