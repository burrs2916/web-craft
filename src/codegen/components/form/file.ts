import { resolveFieldStyle } from "../../../editor/data/fieldStyle";
import { ffZoneIconSvg, ffZoneRadius, fileFieldScript } from "../../../editor/data/fileField";
import { fieldScaleFactor } from "../../../editor/data/scaleFit";
import { EASE, fieldShellHTML, validationHTML } from "../../fieldChrome";
import { escapeHTML } from "../../layout";
import type { ComponentCodegenFn } from "../../types";
import { fieldNameAttr } from "./shared";



/**
 * form-file 组件 → HTML（对齐编辑区 FormFileRenderer：虚线拖放区 + 文件列表 + 限制提示）
 *
 * - **真正可拖拽且可靠回填**：drop 时过 `ffPickFiles` 口径（accept/multiple/数量/大小），
 *   再用 `new DataTransfer()` 重建 FileList 写回 input —— 旧写法 `i.files=e.dataTransfer.files`
 *   直接赋值在 WKWebView/Safari（预览窗口引擎）不可靠且失败被静默吞。
 * - **两条路径同口径**：原生弹窗只认 accept，大小/数量限制由 change 监听再过滤一次。
 * - 文件列表：逐条显示文件名 + 大小 + 单个删除（× 重建 FileList）；拒绝的文件给红字提示。
 * - **键盘可达**：input 用视觉隐藏（clip）而非 display:none，可 Tab 聚焦、Enter/Space
 *   触发原生选择；`:focus-within` 高亮拖放区（状态规则走 CSS，不写 inline）。
 * - 过滤/回填/格式化/提示文案全部来自 `editor/data/fileField.ts`（两端同源，toString 内联）。
 */
export const formFileCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;
  const fitF = fieldScaleFactor("form-file", component.transform.width, component.transform.height, c.scaleFit === true);
  // 标签口径：form-file 是大块面拖放区，「外部上方」会把框压到盒底、内容离顶边过远
  // （用户实测反馈）。非 "none" 一律归一为悬浮徽章（骑在虚线框上沿，与表单族 fc-flabel 同款），
  // 虚线框占满整个组件盒，图标+文字相对四边真正居中。旧存档的 "top" 同样归一。
  const placement = String(c.labelPlacement ?? "top") === "none" ? "none" : "inside";
  const s0 = resolveFieldStyle({ ...c, labelPlacement: placement }, { bgColor: "#f5f5f5", radius: 8 });
  const s = { ...s0, fontSize: s0.fontSize * fitF, labelFontSize: s0.labelFontSize * fitF };
  const va = validationHTML(c);
  const uid = "ff-" + Math.random().toString(36).slice(2, 9);
  const acceptAttr = c.accept ? ` accept="${escapeHTML(String(c.accept))}"` : "";
  const multipleAttr = c.multiple ? " multiple" : "";
  const accept = String(c.accept ?? "");
  const multiple = c.multiple === true;
  const maxCount = Math.max(0, Math.floor(Number(c.maxCount) || 0));
  const maxFileSizeMB = Math.max(0, Number(c.maxFileSize) || 0);
  const errColor = String(c.errorColor ?? "").trim() || "#f44336";
  const placeholder = s.placeholder || "点击或拖拽文件到此处";
  const zonePad = 12;
  const fileFont = Math.max(11, s.fontSize - 2);
  // 拖放区是大块面：圆角按像素生效并封顶 24（不吃输入条的 ×10 口径，8→80px 会变胶囊/按钮观感）
  const zoneRadius = ffZoneRadius(c.borderRadius);
  const itemRadius = Math.min(zoneRadius, 6);

  const zoneStyles = [
    "flex:1", "min-height:0", "min-width:0", "position:relative",
    "display:flex", "flex-direction:column", "align-items:center", "justify-content:center", "gap:6px",
    `border:1px dashed ${s.borderColor}`, `border-radius:${zoneRadius}px`, `background:${s.bgColor}`,
    `cursor:${s.disabled ? "not-allowed" : "pointer"}`, "box-sizing:border-box",
    `padding:${zonePad}px`, `transition:border-color .2s ${EASE},background .2s ${EASE}`,
  ];

  // 视觉隐藏（clip）而非 display:none：保留焦点能力 → Tab 可达、Enter/Space 原生选择
  const hiddenInput =
    "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;" +
    "clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0";

  let control = `<label class="fzone" style="${zoneStyles.join(";")}">`;
  control += `<input class="fc-ctl" type="file" id="${uid}" ${fieldNameAttr(c, "file")} style="${hiddenInput}"${acceptAttr}${multipleAttr}${s.required ? " required" : ""}${s.disabled ? " disabled" : ""} tabindex="${s.disabled ? -1 : 0}" />`;
  control += ffZoneIconSvg(Math.round(s.fontSize * 1.6), s.disabled ? s.borderColor : s.textColor);
  control += `<span style="min-width:64px;font-size:${s.fontSize}px;color:${s.textColor};opacity:.75;font-weight:500;line-height:1.75;text-align:center;user-select:none">${escapeHTML(placeholder)}</span>`;
  control += `</label>`;
  control += `<div class="ff-list" id="${uid}l" style="flex:0 1 auto;min-height:0;max-height:60%;overflow-y:auto;margin-top:4px;display:flex;flex-direction:column;gap:2px"></div>`;
  control += `<div class="ff-err" id="${uid}e" style="display:none;color:${errColor};font-size:12px;line-height:1.4;margin-top:3px;user-select:none"></div>`;

  const itemCss =
    `.${uid} .ff-item{display:flex;align-items:center;gap:6px;min-width:0;padding:2px 6px;` +
    `background:${s.bgColor};border:1px solid ${s.borderColor};border-radius:${itemRadius}px;` +
    `font-size:${fileFont}px;color:${s.textColor};line-height:1.5}` +
    `.${uid} .ff-file{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}` +
    `.${uid} .ff-size{flex-shrink:0;opacity:.6;font-size:11px}` +
    `.${uid} .ff-del{flex-shrink:0;width:18px;height:18px;line-height:16px;text-align:center;padding:0;` +
    `border:none;background:transparent;color:${s.textColor};opacity:.55;cursor:pointer;font-size:14px;border-radius:50%}` +
    `.${uid} .ff-del:hover{opacity:1;background:rgba(0,0,0,.08)}` +
    `.${uid} .ff-del:focus-visible{outline:1px solid ${s.focusBorderColor}}`;

  const extraCss =
    `.${uid} .fzone:hover{border-color:${s.disabled ? s.borderColor : s.focusBorderColor}}` +
    `.${uid} .fzone:focus-within{border-color:${s.disabled ? s.borderColor : s.focusBorderColor}}` +
    `.${uid} .fzone.fdrag{border-color:${s.focusBorderColor};background:${s.bgColor};box-shadow:inset 0 0 0 2px ${s.focusBorderColor}}` +
    `.${uid}.has-val .fzone{border-style:solid}` +
    itemCss;

  return (
    fieldShellHTML({ uid, s, va, ctx, control, extraCss, ring: false, fieldStyle: "flex-direction:column;" }) +
    fileFieldScript(uid, { accept, multiple, maxCount, maxFileSizeMB })
  );
};
