import type { ComponentCodegenFn } from "../../types";
import { buildModalSwitcherScript } from "../../../editor/utils/modalSwitcher";
import { escapeHTML } from "../../layout";

export const modalCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;

  // —— 解析弹出框列表 ——
  const modalsRaw = String(c.modals ?? "");
  let modals: { id: string; name: string; title: string; content: string; bgColor?: string | null }[] = [];
  const trimmed = modalsRaw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        modals = parsed.map((m: Record<string, unknown>) => ({
          id: String(m.id ?? ""),
          name: String(m.name ?? ""),
          title: String(m.title ?? ""),
          content: String(m.content ?? ""),
          bgColor: m.bgColor !== undefined ? String(m.bgColor) : null,
        })).filter((m: { id: string }) => m.id);
      }
    } catch {
      // fall through
    }
  }
  if (modals.length === 0) {
    modals = [{ id: "modal-1", name: "弹出框 1", title: "弹出标题", content: "这里是弹出框内容。" }];
  }

  // —— 功能类型与按钮配置 ——
  const modalStyle = String(c.modalStyle ?? "info");
  const okText = String(c.okText ?? "确定");
  const cancelText = String(c.cancelText ?? "取消");
  const okButtonColor = String(c.okButtonColor ?? "#4f9eff");
  const cancelButtonColor = String(c.cancelButtonColor ?? "#666666");

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
  const modalWidth = Number(c.modalWidth ?? 480);
  const modalMaxHeight = Number(c.modalMaxHeight ?? 80);
  const overlayColor = String(c.overlayColor ?? "rgba(0,0,0,0.6)");
  const overlayBlur = c.overlayBlur === true;
  const overlayBlurAmount = Number(c.overlayBlurAmount ?? 4);
  const showCloseButton = c.showCloseButton !== false;
  const animationEnabled = c.animationEnabled !== false;
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

  // —— 按钮基础样式生成器 ——
  const btnStyle = (bgColor: string) => [
    "display:inline-flex", "align-items:center", "justify-content:center",
    "padding:8px 20px", "border-radius:6px", "font-size:13px", "font-weight:500",
    "cursor:pointer", "border:none", "white-space:nowrap",
    `background:${bgColor}`, "color:#fff", "transition:opacity 0.15s",
  ].join(";");

  // —— 表单字段 HTML 生成器（仅 form） ——
  const formFieldsHTML = modalStyle === "form"
    ? formFields.map((field) => {
        const labelHTML = `<label style="font-size:12.5px;font-weight:500;color:${contentColor};margin-bottom:4px;display:block">${escapeHTML(field.label || field.name)}${field.required ? ' <span style="color:#f44">*</span>' : ""}</label>`;
        let inputHTML = "";
        if (field.type === "textarea") {
          inputHTML = `<textarea name="${escapeHTML(field.name)}" data-modal-field placeholder="${escapeHTML(field.placeholder ?? "")}" style="width:100%;min-height:60px;padding:8px 10px;border-radius:4px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.03);color:${containerColor};font-size:13px;resize:vertical;box-sizing:border-box"></textarea>`;
        } else if (field.type === "select") {
          const opts = (field.options ?? []).map((o) => `<option value="${escapeHTML(o)}">${escapeHTML(o)}</option>`).join("");
          inputHTML = `<select name="${escapeHTML(field.name)}" data-modal-field style="width:100%;height:34px;padding:0 10px;border-radius:4px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.03);color:${containerColor};font-size:13px;box-sizing:border-box"><option value="" disabled selected>${escapeHTML(field.placeholder ?? "选择...")}</option>${opts}</select>`;
        } else if (field.type === "checkbox") {
          inputHTML = `<input type="checkbox" name="${escapeHTML(field.name)}" data-modal-field style="width:16px;height:16px;cursor:pointer" />`;
        } else {
          inputHTML = `<input type="${escapeHTML(field.type)}" name="${escapeHTML(field.name)}" data-modal-field placeholder="${escapeHTML(field.placeholder ?? "")}" style="width:100%;height:34px;padding:0 10px;border-radius:4px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.03);color:${containerColor};font-size:13px;box-sizing:border-box" />`;
        }
        return `<div style="display:flex;flex-direction:column;margin-bottom:12px">${labelHTML}${inputHTML}</div>`;
      }).join("")
    : "";

  // —— 按钮区 HTML 生成器 ——
  const cancelButtonHTML = modalStyle !== "info"
    ? `<button data-modal-close data-modal-action="cancel" style="${btnStyle(cancelButtonColor)}">${escapeHTML(cancelText)}</button>`
    : "";
  const okButtonLabel = modalStyle === "form" ? "提交" : okText;
  const okAction = modalStyle === "form" ? "submit" : "ok";
  const okButtonHTML = `<button data-modal-close data-modal-action="${okAction}" style="${btnStyle(okButtonColor)}">${escapeHTML(okButtonLabel)}</button>`;
  const buttonsHTML = `<div style="display:flex;justify-content:flex-end;gap:8px;flex-shrink:0;padding-top:4px">${cancelButtonHTML}${okButtonHTML}</div>`;

  // —— 生成每个 modal 的 HTML（默认隐藏，由 JS 控制） ——
  // DOM 结构：overlay（遮罩）和 content（内容框）为兄弟节点
  // content 用 absolute 定位到组件包装 div 的位置（即组件在画布上的坐标）
  const modalsHTML = modals.map((modal) => {
    const modalBg = modal.bgColor || containerBg;

    // 遮罩层：fixed 覆盖视口
    const overlayStyles: string[] = [
      "position: fixed",
      "top: 0", "left: 0", "right: 0", "bottom: 0",
      "display: none",
      "z-index: 10000",
      `background: ${overlayColor}`,
    ];
    if (overlayBlur) overlayStyles.push(`backdrop-filter: blur(${overlayBlurAmount}px)`);

    // 内容框：absolute 相对于组件包装 div 定位（跟决组件画布位置弹出）
    const contentStyles: string[] = [
      "position: absolute",
      "top: 0", "left: 0",
      `width: ${modalWidth}px`,
      "max-width: 90vw",
      `max-height: ${modalMaxHeight}vh`,
      `background: ${modalBg}`,
      `color: ${containerColor}`,
      `border-radius: ${borderRadius}px`,
      `padding: ${paddingY}px ${paddingX}px`,
      "display: none",
      "flex-direction: column",
      "gap: 8px",
      "overflow: auto",
      "z-index: 10001",
      "opacity: 0",
      "transform: translateY(-20px) scale(0.95)",
    ];
    if (borderEnabled) contentStyles.push(`border: ${borderWidth}px ${borderStyle} ${borderColor}`);
    if (shadowEnabled) contentStyles.push(`box-shadow: 0 0 ${shadowBlur}px ${shadowColor}`);
    if (animationEnabled) contentStyles.push("transition: opacity 0.2s ease, transform 0.2s ease");

    // 标题栏
    const closeHTML = showCloseButton
      ? `<div data-modal-close style="cursor:pointer;color:rgba(255,255,255,0.5);flex-shrink:0;padding:4px;border-radius:4px;display:flex;align-items:center" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></div>`
      : "";
    const titleHTML = `<div style="display:flex;align-items:center;justify-content:space-between;flex-shrink:0"><span style="font-size:${titleFontSize}px;font-weight:600;color:${titleColor}">${escapeHTML(modal.title || "(无标题)")}</span>${closeHTML}</div>`;

    // 内容区：form 类型渲染表单字段，info/confirm 渲染文本内容
    const bodyHTML = modalStyle === "form"
      ? `<div style="flex:1;overflow-y:auto">${formFieldsHTML}</div>`
      : `<div style="color:${contentColor};font-size:${contentFontSize}px;line-height:${contentLineHeight};overflow-y:auto;flex:1">${escapeHTML(modal.content || "(空内容)")}</div>`;

    // 结构：overlay 和 content 为兄弟节点
    return `<div data-modal-id="${escapeHTML(modal.id)}" data-modal-open="false" data-modal-style="${escapeHTML(modalStyle)}" style="display:contents"><div data-modal-overlay style="${overlayStyles.join("; ")}"></div><div data-modal-content style="${contentStyles.join("; ")}">${titleHTML}${bodyHTML}${buttonsHTML}</div></div>`;
  }).join("\n");

  // —— 注入 modal 交互脚本（每页只注入一次） ——
  const hasModalScript = ctx.pageScripts.some((s) => s.includes("__wcModalInit"));
  if (!hasModalScript) {
    ctx.pageScripts.push(buildModalSwitcherScript());
  }

  return modalsHTML;
};

