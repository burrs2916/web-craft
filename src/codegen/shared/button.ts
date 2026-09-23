/**
 * 按钮（form-button）统一 HTML 生成器
 *
 * 编辑区实时渲染、预览、发布的真实按钮都走此函数，保证三端样式逐像素一致
 * （所见即所得），解决"编辑区用 MUI Button、发布用内联 HTML"两套样式体系差异。
 *
 * 两种尺寸模式（面板 `fullWidth` / `scaleFit` 决定，两者都不是摆设）：
 *   - **铺满模式**（fullWidth=true）：`width/height:100%` 填充外层容器，画布拖框即拉伸。
 *   - **自然尺寸模式**（默认）：按 `size` 取固定内距与高度、宽度由文字与图标决定，
 *     再由「舞台 + 缩放内层」两层包住 → 在拖动框内**居中显示**，并随框**等比缩放**。
 *
 * 为什么要有自然尺寸模式：铺满模式下按钮的形状完全由拖动框决定，`size`（小/中/大）
 * 与 `fullWidth` 实际上改变不了任何东西 —— 面板上摆着两个改了没反应的控件。
 */

import type { CodegenContext } from "../types";
import { renderMenuIcon } from "../iconPipeline";
import { cssText } from "../../editor/data/cssDecls";
import {
  scaleStageCss,
  scaleInnerBaseCss,
  type ScaleFitSpec,
} from "../../editor/data/scaleFit";

interface ButtonConfig {
  text?: string;
  variant?: "contained" | "outlined" | "text";
  size?: "small" | "medium" | "large";
  bgColor?: string;
  textColor?: string;
  fontSize?: number;
  fontWeight?: number;
  letterSpacing?: number;
  borderRadius?: number;
  borderColor?: string;
  borderWidth?: number;
  shadow?: "none" | "soft" | "medium";
  disabled?: boolean;
  fullWidth?: boolean;
  link?: string;
  linkTarget?: "_self" | "_blank";
  icon?: string;
  iconPosition?: "left" | "right";
  iconGap?: number;
  iconOnly?: boolean;
  [k: string]: unknown;
}

interface BuildButtonOptions {
  /** 编辑态：不跳转、不置灰、光标默认，避免点击触发链接/干扰画布 */
  edit?: boolean;
  /** 图标上下文：发布端传完整 CodegenContext，编辑端只需 iconData（自定义图标表），material/emoji 不传也内联渲染。 */
  ctx?: CodegenContext | { iconData?: Record<string, string> };
  /**
   * 自然尺寸模式：不铺满容器，改用 `size` 档位给高度与左右内距（宽度由内容决定）。
   * `fullWidth` 为真时本项自动失效（铺满优先）。
   */
  natural?: boolean;
}

/**
 * `size` 档位的几何（唯一口径）。
 *
 * 只控制**盒高与左右内距**，不控制字号 —— 字号另有 `fontSize` 面板字段，
 * 两者同时改字号会让用户分不清是谁在生效（也让"改了没反应"更难判断）。
 * 档位间距等比（32/38/44 高、12/16/22 内距），与 MUI Button 的视觉层级一致。
 */
export const BUTTON_SIZE_BOX: Record<"small" | "medium" | "large", { h: number; px: number }> = {
  small: { h: 32, px: 12 },
  medium: { h: 38, px: 16 },
  large: { h: 44, px: 22 },
};

/**
 * 「居中 + 随框等比缩放」的缩放基准 —— 恒等于注册表 `defaultSize`（120×40）。
 * 与表单组其他组件同一约定：`refW/refH` 不另写一份。
 */
export const BUTTON_FIT: ScaleFitSpec = { refW: 120, refH: 40, min: 0.4, max: 6 };

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escJs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

const SHADOWS: Record<string, string> = {
  none: "box-shadow: none",
  soft: "box-shadow: 0 1px 2px rgba(16,24,40,.12), 0 1px 3px rgba(16,24,40,.1)",
  medium: "box-shadow: 0 4px 6px -1px rgba(16,24,40,.1), 0 2px 12px rgba(16,24,40,.08)",
};

export function buildButtonHTML(c: ButtonConfig = {}, opts: BuildButtonOptions = {}): string {
  const edit = !!opts.edit;
  const variant = c.variant || "contained";
  const bg = c.bgColor || "#1976d2";
  const fg = c.textColor || (variant === "contained" ? "#ffffff" : bg);
  const fs = c.fontSize ?? 14;
  const fw = c.fontWeight ?? 500;
  const ls = c.letterSpacing ?? 0;
  const br = c.borderRadius ?? 4;
  const bw = c.borderWidth ?? 1;
  const shadow = SHADOWS[c.shadow ?? "none"] ?? SHADOWS.none;
  const disabled = !edit && !!c.disabled;
  const box = BUTTON_SIZE_BOX[(c.size as "small" | "medium" | "large") ?? "medium"] ?? BUTTON_SIZE_BOX.medium;

  const st: string[] = [
    // 铺满 vs 自然尺寸：自然尺寸模式下宽度与高度由内容与档位决定
    ...(opts.natural
      ? [`height: ${box.h}px`, `padding: 0 ${box.px}px`, "width: auto", "max-width: 100%"]
      : ["width: 100%", "height: 100%"]),
    "display: flex",
    "align-items: center",
    "justify-content: center",
    "box-sizing: border-box",
    "font-family: inherit",
    `font-size: ${fs}px`,
    `font-weight: ${fw}`,
    `letter-spacing: ${ls}px`,
    `border-radius: ${br}px`,
    "text-align: center",
    "overflow: hidden",
    "user-select: none",
    "cursor: " + (disabled ? "not-allowed" : edit ? "default" : "pointer"),
    shadow,
  ];

  if (variant === "contained") {
    st.push(`background: ${bg}`);
    st.push(`color: ${fg}`);
    st.push("border: none");
  } else if (variant === "outlined") {
    const bc = c.borderColor || bg;
    st.push("background: rgba(255,255,255,0)");
    st.push(`color: ${fg}`);
    st.push(`border: ${bw}px solid ${bc}`);
  } else {
    st.push("background: transparent");
    st.push(`color: ${fg}`);
    st.push("border: none");
    if (!opts.natural) st.push("padding: 0");
  }

  if (disabled) {
    st.push("opacity: .5");
    st.push("cursor: not-allowed");
  }

  const attrs: string[] = [];
  if (disabled) attrs.push("disabled");
  const link = !edit && c.link;
  if (link) {
    const tgt = c.linkTarget === "_blank" ? "_blank" : "_self";
    attrs.push(
      tgt === "_blank"
        ? `onclick="window.open('${escJs(link)}','_blank')"`
        : `onclick="window.location.href='${escJs(link)}'"`,
    );
  }
  const attrStr = attrs.length ? " " + attrs.join(" ") : "";
  const label = esc(String(c.text ?? "按钮"));

  // 图标渲染（复用发布端图标管线：material/emoji/custom/url 全部一致）
  let content = label;
  const icon = c.icon;
  if (icon) {
    const iconSize = c.iconSize && Number(c.iconSize) > 0 ? Number(c.iconSize) : fs;
    const iconHtml = renderMenuIcon(icon, iconSize, opts.ctx);
    if (iconHtml) {
      const iconSpan = `<span style="display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1">${iconHtml}</span>`;
      // 纯图标按钮：仅显示图标，隐藏文字
      if (c.iconOnly) {
        content = iconSpan;
      } else {
        const labelSpan = `<span style="line-height:1.2;min-width:0">${label}</span>`;
        const pos = c.iconPosition === "right" ? "right" : "left";
        const gap = c.iconGap != null && Number(c.iconGap) >= 0 ? Number(c.iconGap) : 6;
        content = `<span style="display:inline-flex;align-items:center;justify-content:center;gap:${gap}px;min-width:0">${
          pos === "right" ? labelSpan + iconSpan : iconSpan + labelSpan
        }</span>`;
      }
    }
  }
  return `<button style="${st.join("; ")}"${attrStr}>${content}</button>`;
}

/**
 * 「居中 + 随拖动框等比缩放」的舞台与内层。
 *
 * 编辑区与发布端共用本函数（只差 transform 的来源）：
 *   - 编辑区：`factor` 传实测系数，直接写进 `transform:scale(f)`，不要脚本；
 *   - 发布端：`factor` 传 null，先写 `scale(1)`，随后由 `scaleFitScript(uid, BUTTON_FIT)` 修正。
 * 舞台/内层的声明都取自 `editor/data/scaleFit.ts`，因此两端的这两层**逐字相同**。
 */
export function buttonFitStage(
  body: string,
  o: { uid?: string; align: string; vAlign: string; factor: number | null },
): string {
  const stageStyle = cssText(scaleStageCss(o.align, o.vAlign));
  const innerStyle = cssText({
    ...scaleInnerBaseCss(),
    transform: `scale(${o.factor ?? 1})`,
    display: "inline-flex",
    alignItems: "center",
  });
  const cls = (suffix: string) => (o.uid ? ` class="${o.uid}-${suffix}"` : "");
  return (
    `<div${cls("st")} style="${stageStyle}">` +
    `<div${cls("in")} style="${innerStyle}">${body}</div>` +
    `</div>`
  );
}

/**
 * form-button 的完整产物：外形（铺满设计盒）+ 舞台 + 内层 + 按钮本体。
 *
 * `fullWidth` 为真时退回铺满模式（无舞台/内层），与历史产物一致。
 */
export function buildButtonFitHTML(
  c: ButtonConfig = {},
  opts: BuildButtonOptions & { uid?: string; align?: string; vAlign?: string; factor?: number | null; scaleFit?: boolean } = {},
): string {
  const outerStyle = "width:100%;height:100%;min-width:0;min-height:0;box-sizing:border-box";
  // 铺满模式：退回历史实现（按钮自身铺满容器，无舞台/内层）
  if (c.fullWidth === true) {
    return `<div style="${outerStyle}">${buildButtonHTML(c, opts)}</div>`;
  }
  const body = buildButtonHTML(c, { ...opts, natural: true });
  // 关闭等比缩放时：仍走同一套舞台/内层（居中不变），系数恒 1，且不挂缩放脚本
  const factor = opts.scaleFit === false ? 1 : (opts.factor ?? null);
  return (
    `<div style="${outerStyle}">` +
    buttonFitStage(body, {
      uid: opts.uid,
      align: opts.align ?? "center",
      vAlign: opts.vAlign ?? "center",
      factor,
    }) +
    `</div>`
  );
}