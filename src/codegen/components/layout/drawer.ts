import type { ComponentCodegenFn } from "../../types";
import { buildDrawerSwitcherScript } from "../../../editor/utils/drawerSwitcher";
import { escapeHTML } from "../../layout";

/**
 * content-drawer 组件 codegen
 *
 * 与 modalCodegen 类似，但抽屉从四个边（top/bottom/left/right）滑动出现。
 * DOM 结构：overlay（fixed 遮罩）+ content（fixed 按方向定位）为兄弟节点。
 * 交互脚本使用 drawerSwitcher（data-drawer-* 属性），与 modalSwitcher 独立。
 */
export const drawerCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;

  // —— 解析抽屉列表 ——
  const drawersRaw = String(c.modals ?? "");
  let drawers: { id: string; name: string; title: string; content: string; bgColor?: string | null }[] = [];
  const trimmed = drawersRaw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        drawers = parsed.map((m: Record<string, unknown>) => ({
          id: String(m.id ?? ""),
          name: String(m.name ?? ""),
          title: String(m.title ?? ""),
          content: String(m.content ?? ""),
          bgColor: m.bgColor !== undefined ? String(m.bgColor) : null,
        })).filter((m: { id: string }) => m.id);
      }
    } catch { /* fall through */ }
  }
  if (drawers.length === 0) {
    drawers = [{ id: "drawer-1", name: "抽屉 1", title: "抽屉标题", content: "这里是抽屉内容。" }];
  }

  // —— 功能类型与按钮配置 ——
  const modalStyle = String(c.modalStyle ?? "info");
  const okText = String(c.okText ?? "确定");
  const cancelText = String(c.cancelText ?? "取消");
  const okButtonColor = String(c.okButtonColor ?? "#4f9eff");
  const cancelButtonColor = String(c.cancelButtonColor ?? "#666666");

  // —— 抽屉方向与尺寸 ——
  const direction = String(c.direction ?? "right");
  const drawerWidth = Number(c.drawerWidth ?? 380);
  const drawerHeight = Number(c.drawerHeight ?? 400);

  // —— 解析表单字段（仅 form 类型） ——
  const formFieldsRaw = String(c.formFields ?? "");
  let formFields: { name: string; label: string; type: string; placeholder?: string; required?: boolean; options?: string[]; dataBinding?: { source: string; field: string } | null }[] = [];
  const ffTrimmed = formFieldsRaw.trim();
  if (ffTrimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(ffTrimmed);
      if (Array.isArray(parsed)) {
        formFields = parsed
          .filter((f: Record<string, unknown>) => f && typeof f.name === "string")
          .map((f: Record<string, unknown>) => ({
            name: String(f.name ?? ""),
            label: String(f.label ?? ""),
            type: String(f.type ?? "text"),
            placeholder: f.placeholder ? String(f.placeholder) : undefined,
            required: f.required === true,
            options: Array.isArray(f.options) ? f.options.map(String) : undefined,
            dataBinding: f.dataBinding && typeof f.dataBinding === "object"
              ? { source: String((f.dataBinding as Record<string, unknown>).source ?? ""), field: String((f.dataBinding as Record<string, unknown>).field ?? "") }
              : null,
          }));
      }
    } catch { /* skip */ }
  }
  if (formFields.length === 0 && modalStyle === "form") {
    formFields = [{ name: "field1", label: "字段 1", type: "text", placeholder: "请输入", required: false }];
  }

  // —— 样式参数 ——
  const overlayColor = String(c.overlayColor ?? "rgba(0,0,0,0.6)");
  const overlayBlur = c.overlayBlur === true;
  const overlayBlurAmount = Number(c.overlayBlurAmount ?? 4);
  const showCloseButton = c.showCloseButton !== false;
  const animationEnabled = c.animationEnabled !== false;
  const animationDuration = Number(c.animationDuration ?? 300);
  const containerBg = String(c.containerBg ?? "rgba(40,40,60,0.95)");
  const containerColor = String(c.containerColor ?? "#ffffff");
  const titleColor = String(c.titleColor ?? "#ffffff");
  const titleFontSize = Number(c.titleFontSize ?? 18);
  const contentColor = String(c.contentColor ?? "rgba(255,255,255,0.85)");
  const contentFontSize = Number(c.contentFontSize ?? 14);
  const contentLineHeight = Number(c.contentLineHeight ?? 1.6);
  const borderRadius = Number(c.borderRadius ?? 12);
  const paddingX = Number(c.paddingX ?? 24);
  const paddingY = Number(c.paddingY ?? 24);
  const borderEnabled = c.borderEnabled === true;
  const borderColor = String(c.borderColor ?? "rgba(255,255,255,0.12)");
  const borderWidth = Number(c.borderWidth ?? 1);
  const borderStyle = String(c.borderStyle ?? "solid");
  const shadowEnabled = c.shadowEnabled !== false;
  const shadowBlur = Number(c.shadowBlur ?? 40);
  const shadowColor = String(c.shadowColor ?? "rgba(0,0,0,0.5)");

  // —— 按钮基础样式 ——
  const btnStyle = (bgColor: string) => [
    "display:inline-flex", "align-items:center", "justify-content:center",
    "padding:8px 20px", "border-radius:6px", "font-size:13px", "font-weight:500",
    "cursor:pointer", "border:none", "white-space:nowrap",
    `background:${bgColor}`, "color:#fff", "transition:opacity 0.15s",
  ].join(";");

  // —— 方向定位/动画计算 ——
  const dur = animationEnabled ? `${animationDuration}ms` : "0ms";
  const transitionStr = `transform ${dur} ease`;

  // 按方向生成 content 定位样式
  function getDirectionPosition(dir: string): { posStyles: string[]; initialTransform: string } {
    const posStyles: string[] = [];
    let initialTransform = "";
    switch (dir) {
      case "left":
        posStyles.push("top: 0", "left: 0", `width: ${drawerWidth}px`, "max-width: 100vw", "height: 100%");
        initialTransform = "translateX(-100%)";
        break;
      case "top":
        posStyles.push("top: 0", "left: 0", "right: 0", "width: 100%", `height: ${drawerHeight}px`, "max-height: 100vh");
        initialTransform = "translateY(-100%)";
        break;
      case "bottom":
        posStyles.push("bottom: 0", "left: 0", "right: 0", "width: 100%", `height: ${drawerHeight}px`, "max-height: 100vh");
        initialTransform = "translateY(100%)";
        break;
      default: // right
        posStyles.push("top: 0", "right: 0", `width: ${drawerWidth}px`, "max-width: 100vw", "height: 100%");
        initialTransform = "translateX(100%)";
        break;
    }
    return { posStyles, initialTransform };
  }

  // 按方向计算圆角（只在与内容区相接的边保留 0）
  function getDirectionBorderRadius(dir: string): string {
    switch (dir) {
      case "left": return `0 ${borderRadius}px ${borderRadius}px 0`;
      case "top": return `0 0 ${borderRadius}px ${borderRadius}px`;
      case "bottom": return `${borderRadius}px ${borderRadius}px 0 0`;
      default: return `${borderRadius}px 0 0 ${borderRadius}px`;
    }
  }

  // —— 表单字段 HTML ——
  const formFieldsHTML = modalStyle === "form"
    ? formFields.map((field) => {
        const labelHTML = `<label style="font-size:12.5px;font-weight:500;color:${contentColor};margin-bottom:4px;display:block">${escapeHTML(field.label || field.name)}${field.required ? ' <span style="color:#f44">*</span>' : ""}</label>`;
        let inputHTML = "";
        if (field.type === "textarea") {
          inputHTML = `<textarea name="${escapeHTML(field.name)}" data-drawer-field placeholder="${escapeHTML(field.placeholder ?? "")}" style="width:100%;min-height:60px;padding:8px 10px;border-radius:4px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.03);color:${containerColor};font-size:13px;resize:vertical;box-sizing:border-box"></textarea>`;
        } else if (field.type === "select") {
          const opts = (field.options ?? []).map((o) => `<option value="${escapeHTML(o)}">${escapeHTML(o)}</option>`).join("");
          inputHTML = `<select name="${escapeHTML(field.name)}" data-drawer-field style="width:100%;height:34px;padding:0 10px;border-radius:4px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.03);color:${containerColor};font-size:13px;box-sizing:border-box"><option value="" disabled selected>${escapeHTML(field.placeholder ?? "选择...")}</option>${opts}</select>`;
        } else if (field.type === "checkbox") {
          inputHTML = `<input type="checkbox" name="${escapeHTML(field.name)}" data-drawer-field style="width:16px;height:16px;cursor:pointer" />`;
        } else {
          inputHTML = `<input type="${escapeHTML(field.type)}" name="${escapeHTML(field.name)}" data-drawer-field placeholder="${escapeHTML(field.placeholder ?? "")}" style="width:100%;height:34px;padding:0 10px;border-radius:4px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.03);color:${containerColor};font-size:13px;box-sizing:border-box" />`;
        }
        return `<div style="display:flex;flex-direction:column;margin-bottom:12px">${labelHTML}${inputHTML}</div>`;
      }).join("")
    : "";

  // —— 按钮区 HTML ——
  const cancelButtonHTML = modalStyle !== "info"
    ? `<button data-drawer-close data-drawer-action="cancel" style="${btnStyle(cancelButtonColor)}">${escapeHTML(cancelText)}</button>`
    : "";
  const okButtonLabel = modalStyle === "form" ? "提交" : okText;
  const okAction = modalStyle === "form" ? "submit" : "ok";
  const okButtonHTML = `<button data-drawer-close data-drawer-action="${okAction}" style="${btnStyle(okButtonColor)}">${escapeHTML(okButtonLabel)}</button>`;
  const buttonsHTML = `<div style="display:flex;justify-content:flex-end;gap:8px;flex-shrink:0;padding-top:4px">${cancelButtonHTML}${okButtonHTML}</div>`;

  // —— 生成每个 drawer 的 HTML ——
  const dirBorderRadius = getDirectionBorderRadius(direction);
  const { posStyles, initialTransform } = getDirectionPosition(direction);

  const drawersHTML = drawers.map((drawer) => {
    const drawerBg = drawer.bgColor || containerBg;

    // 遮罩层
    const overlayStyles: string[] = [
      "position: fixed", "top: 0", "left: 0", "right: 0", "bottom: 0",
      "display: none", "z-index: 10000",
      `background: ${overlayColor}`,
    ];
    if (overlayBlur) overlayStyles.push(`backdrop-filter: blur(${overlayBlurAmount}px)`);

    // 内容框
    const contentStyles: string[] = [
      "position: fixed",
      ...posStyles,
      `background: ${drawerBg}`,
      `color: ${containerColor}`,
      `border-radius: ${dirBorderRadius}`,
      `padding: ${paddingY}px ${paddingX}px`,
      "display: none", "flex-direction: column", "gap: 8px", "overflow: auto",
      "z-index: 10001",
      `transform: ${initialTransform}`,
    ];
    if (borderEnabled) contentStyles.push(`border: ${borderWidth}px ${borderStyle} ${borderColor}`);
    if (shadowEnabled) contentStyles.push(`box-shadow: 0 0 ${shadowBlur}px ${shadowColor}`);
    if (animationEnabled) contentStyles.push(`transition: ${transitionStr}`);

    // 标题栏
    const closeHTML = showCloseButton
      ? `<div data-drawer-close style="cursor:pointer;color:rgba(255,255,255,0.5);flex-shrink:0;padding:4px;border-radius:4px;display:flex;align-items:center" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></div>`
      : "";
    const titleHTML = `<div style="display:flex;align-items:center;justify-content:space-between;flex-shrink:0"><span style="font-size:${titleFontSize}px;font-weight:600;color:${titleColor}">${escapeHTML(drawer.title || "(无标题)")}</span>${closeHTML}</div>`;

    // 内容区
    const bodyHTML = modalStyle === "form"
      ? `<div style="flex:1;overflow-y:auto">${formFieldsHTML}</div>`
      : `<div style="color:${contentColor};font-size:${contentFontSize}px;line-height:${contentLineHeight};overflow-y:auto;flex:1">${escapeHTML(drawer.content || "(空内容)")}</div>`;

    return `<div data-drawer-id="${escapeHTML(drawer.id)}" data-drawer-open="false" data-drawer-style="${escapeHTML(modalStyle)}" data-drawer-direction="${escapeHTML(direction)}" style="display:contents"><div data-drawer-overlay style="${overlayStyles.join("; ")}"></div><div data-drawer-content style="${contentStyles.join("; ")}">${titleHTML}${bodyHTML}${buttonsHTML}</div></div>`;
  }).join("\n");

  // —— 注入 drawer 交互脚本（每页只注入一次） ——
  const hasDrawerScript = ctx.pageScripts.some((s) => s.includes("__wcDrawerInit"));
  if (!hasDrawerScript) {
    ctx.pageScripts.push(buildDrawerSwitcherScript());
  }

  return drawersHTML;
};
