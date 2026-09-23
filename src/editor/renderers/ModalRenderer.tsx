import { useState, useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import ViewQuiltIcon from "@mui/icons-material/ViewQuilt";
import type { ComponentRendererProps } from "../../types/editor";

/** 弹出框数据结构 */
interface ModalPane {
  id: string;
  name: string;
  title: string;
  content: string;
  bgColor?: string | null;
}

/** 表单字段结构 */
interface FormField {
  name: string;
  label: string;
  type: string; // text | password | email | number | textarea | select | checkbox | switch | slider | date | time | file
  placeholder?: string;
  required?: boolean;
  options?: string[];
  /** 动态数据绑定（预留，不写死） — 格式: { source: "dataSourceId", field: "fieldName" } */
  dataBinding?: { source: string; field: string } | null;
}

/** 默认弹出框（无配置时展示占位） */
const DEFAULT_MODALS: ModalPane[] = [
  { id: "modal-1", name: "弹出框 1", title: "弹出标题", content: "这里是弹出框内容，可以放置说明文字、表单或提示信息。", bgColor: null },
];

const DEFAULT_FORM_FIELDS: FormField[] = [
  { name: "username", label: "用户名", type: "text", placeholder: "请输入用户名", required: true },
];

/** 解析 formFields JSON */
function parseFormFields(raw: string): FormField[] {
  const trimmed = String(raw).trim();
  if (!trimmed.startsWith("[")) return DEFAULT_FORM_FIELDS;
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_FORM_FIELDS;
      return parsed
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
  } catch {
    return DEFAULT_FORM_FIELDS;
  }
}

/** 按钮基础样式（预览/发布用内联 style 字符串） */
function buttonStyleStr(bgColor: string): string {
  return [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "padding:8px 20px",
    "border-radius:6px",
    "font-size:13px",
    "font-weight:500",
    "cursor:pointer",
    "border:none",
    "white-space:nowrap",
    `background:${bgColor}`,
    "color:#fff",
    "transition:opacity 0.15s",
  ].join(";");
}

export function ModalRenderer({ config, mode }: ComponentRendererProps) {
  // —— 解析弹出框列表 ——
  const modalsRaw = (config.modals as string) ?? "";
  const modals = useMemo<ModalPane[]>(() => {
    const trimmed = String(modalsRaw).trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          const list = parsed
            .map((m: Record<string, unknown>) => ({
              id: String(m.id ?? ""),
              name: String(m.name ?? ""),
              title: String(m.title ?? ""),
              content: String(m.content ?? ""),
              bgColor: m.bgColor !== undefined ? String(m.bgColor) : null,
            }))
            .filter((m: ModalPane) => m.id);
          if (list.length > 0) return list;
        }
      } catch { /* fall through */ }
    }
    return DEFAULT_MODALS;
  }, [modalsRaw]);

  // —— 功能类型 ——
  const modalStyle = (config.modalStyle as string) ?? "info";
  // —— 按钮配置 ——
  const okText = (config.okText as string) ?? "确定";
  const cancelText = (config.cancelText as string) ?? "取消";
  const okButtonColor = (config.okButtonColor as string) ?? "#4f9eff";
  const cancelButtonColor = (config.cancelButtonColor as string) ?? "#666666";
  // —— 表单字段（仅 form） ——
  const formFields = useMemo(() => parseFormFields((config.formFields as string) ?? ""), [config.formFields]);

  // 编辑模式下默认展示第一个 modal 的预览
  const [previewId, setPreviewId] = useState<string>(modals[0]?.id ?? "");
  const currentPreviewId = modals.some((m) => m.id === previewId) ? previewId : modals[0]?.id ?? "";

  // —— 样式参数 ——
  const modalWidth = (config.modalWidth as number) ?? 480;
  const modalMaxHeight = (config.modalMaxHeight as number) ?? 80;
  const overlayColor = (config.overlayColor as string) ?? "rgba(0,0,0,0.6)";
  const overlayBlur = (config.overlayBlur as boolean) ?? false;
  const overlayBlurAmount = (config.overlayBlurAmount as number) ?? 4;
  const showCloseButton = (config.showCloseButton as boolean) ?? true;
  const animationEnabled = (config.animationEnabled as boolean) ?? true;

  const containerBg = (config.containerBg as string) ?? "rgba(40,40,60,0.95)";
  const containerColor = (config.containerColor as string) ?? "#ffffff";
  const titleColor = (config.titleColor as string) ?? "#ffffff";
  const titleFontSize = (config.titleFontSize as number) ?? 18;
  const contentColor = (config.contentColor as string) ?? "rgba(255,255,255,0.85)";
  const contentFontSize = (config.contentFontSize as number) ?? 14;
  const contentLineHeight = (config.contentLineHeight as number) ?? 1.6;
  const borderRadius = (config.borderRadius as number) ?? 12;
  const paddingX = (config.paddingX as number) ?? 24;
  const paddingY = (config.paddingY as number) ?? 24;

  const borderEnabled = (config.borderEnabled as boolean) ?? false;
  const borderColor = (config.borderColor as string) ?? "rgba(255,255,255,0.12)";
  const borderWidth = (config.borderWidth as number) ?? 1;
  const borderStyle = (config.borderStyle as string) ?? "solid";

  const shadowEnabled = (config.shadowEnabled as boolean) ?? true;
  const shadowBlur = (config.shadowBlur as number) ?? 40;
  const shadowColor = (config.shadowColor as string) ?? "rgba(0,0,0,0.5)";

  const finalShadow = shadowEnabled ? `0 0 ${shadowBlur}px ${shadowColor}` : "none";
  const finalBorder = borderEnabled ? `${borderWidth}px ${borderStyle} ${borderColor}` : "none";

  // —— 类型标签 ——
  const styleLabel = modalStyle === "confirm" ? "确认框" : modalStyle === "form" ? "表单框" : "信息框";

  // ========================================================
  //  编辑模式 — 紧凑占位符（不展示完整预览卡片）
  // ========================================================
  if (mode === "edit") {
    const [showPreview, setShowPreview] = useState(false);
    const previewModal = modals.find((m) => m.id === currentPreviewId) ?? modals[0];

    // 占位符模式：虚线框 + 图标 + 类型标签
    if (!showPreview || !previewModal) {
      return (
        <Box
          onDoubleClick={(e) => { e.stopPropagation(); setShowPreview(true); }}
          sx={{
            width: "100%", height: "100%",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 0.75, cursor: "pointer",
            border: "2px dashed rgba(79,158,255,0.35)",
            borderRadius: "8px",
            bgcolor: "rgba(79,158,255,0.04)",
            transition: "all 0.2s",
            "&:hover": { borderColor: "primary.main", bgcolor: "rgba(79,158,255,0.08)" },
          }}
        >
          <ViewQuiltIcon sx={{ fontSize: 32, color: "rgba(79,158,255,0.5)" }} />
          <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
            <Box sx={{ px: 1, py: 0.25, fontSize: 10, fontWeight: 600, color: "primary.main", bgcolor: "rgba(79,158,255,0.1)", borderRadius: "4px", whiteSpace: "nowrap" }}>
              {styleLabel}
            </Box>
            {modals.length > 1 && (
              <Box sx={{ fontSize: 10, color: "text.secondary" }}>
                {modals.length} 个弹出框
              </Box>
            )}
          </Box>
          <Typography sx={{ fontSize: 11, color: "text.disabled", fontStyle: "italic" }}>
            双击查看预览 · 预览/发布时由链接或按钮触发弹出
          </Typography>
        </Box>
      );
    }

    // 点击后的预览模式
    const modalBg = previewModal.bgColor || containerBg;
    return (
      <Box sx={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, overflow: "auto", padding: "8px" }}>
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", justifyContent: "center", alignItems: "center" }}>
          <Box sx={{ px: 1, py: 0.25, fontSize: 10, fontWeight: 600, color: "primary.main", bgcolor: "rgba(79,158,255,0.1)", borderRadius: "4px", whiteSpace: "nowrap" }}>
            {styleLabel}
          </Box>
          {modals.length > 1 && modals.map((m) => (
            <Box key={m.id} onClick={(e) => { e.stopPropagation(); setPreviewId(m.id); }}
              sx={{ px: 1, py: 0.25, fontSize: 11, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", borderRadius: "4px",
                color: m.id === currentPreviewId ? "#fff" : "text.secondary",
                backgroundColor: m.id === currentPreviewId ? "primary.main" : "transparent",
                "&:hover": { backgroundColor: "action.hover" }, transition: "all 0.2s" }}>
              {m.name || m.id}
            </Box>
          ))}
          <Box onClick={(e) => { e.stopPropagation(); setShowPreview(false); }}
            sx={{ px: 1, py: 0.25, fontSize: 11, cursor: "pointer", userSelect: "none", borderRadius: "4px",
              color: "text.secondary", "&:hover": { backgroundColor: "action.hover" } }}>
            ✕ 收起
          </Box>
        </Box>

        <Box data-modal-id={previewModal.id}
          sx={{ width: `${Math.min(modalWidth, 600)}px`, maxWidth: "100%", maxHeight: `${modalMaxHeight}%`,
            backgroundColor: modalBg, color: containerColor, borderRadius: `${borderRadius}px`, border: finalBorder,
            boxShadow: finalShadow, padding: `${paddingY}px ${paddingX}px`, display: "flex", flexDirection: "column", gap: 1.5, overflow: "auto" }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <Typography sx={{ fontSize: `${titleFontSize}px`, fontWeight: 600, color: titleColor }}>
              {previewModal.title || "(无标题)"}
            </Typography>
            {showCloseButton && (
              <IconButton size="small" sx={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }}>
                <CloseIcon sx={{ fontSize: 18 }} />
              </IconButton>
            )}
          </Box>

          {modalStyle === "form" ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, flex: 1, overflowY: "auto" }}>
              {formFields.map((field) => (
                <Box key={field.name} sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                  <Typography sx={{ fontSize: 12.5, color: contentColor, fontWeight: 500 }}>
                    {field.label || field.name}{field.required ? " *" : ""}
                  </Typography>
                  {field.type === "textarea" ? (
                    <Box sx={{ height: 48, border: "1px solid rgba(255,255,255,0.15)", borderRadius: "4px", bgcolor: "rgba(255,255,255,0.03)" }} />
                  ) : field.type === "select" ? (
                    <Box sx={{ height: 32, border: "1px solid rgba(255,255,255,0.15)", borderRadius: "4px", bgcolor: "rgba(255,255,255,0.03)", display: "flex", alignItems: "center", px: 1 }}>
                      <Typography sx={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{field.placeholder || "选择..."}</Typography>
                    </Box>
                  ) : field.type === "checkbox" ? (
                    <Box sx={{ width: 18, height: 18, border: "1px solid rgba(255,255,255,0.3)", borderRadius: "3px" }} />
                  ) : (
                    <Box sx={{ height: 32, border: "1px solid rgba(255,255,255,0.15)", borderRadius: "4px", bgcolor: "rgba(255,255,255,0.03)" }} />
                  )}
                </Box>
              ))}
            </Box>
          ) : (
            <Box sx={{ color: contentColor, fontSize: `${contentFontSize}px`, lineHeight: contentLineHeight, overflowY: "auto", flex: 1 }}>
              {previewModal.content || "(空内容)"}
            </Box>
          )}

          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, flexShrink: 0, pt: 0.5 }}>
            {modalStyle !== "info" && (
              <Box sx={{ px: 2, py: 0.75, fontSize: 13, fontWeight: 500, borderRadius: "6px", cursor: "pointer", bgcolor: cancelButtonColor, color: "#fff", whiteSpace: "nowrap" }}>
                {cancelText}
              </Box>
            )}
            <Box sx={{ px: 2, py: 0.75, fontSize: 13, fontWeight: 500, borderRadius: "6px", cursor: "pointer", bgcolor: okButtonColor, color: "#fff", whiteSpace: "nowrap" }}>
              {modalStyle === "form" ? "提交" : okText}
            </Box>
          </Box>
        </Box>
      </Box>
    );
  }

  // ========================================================
  //  预览/发布模式 — 默认隐藏，点击触发，跟随组件位置弹出
  // ========================================================
  return (
    <>
      {modals.map((modal) => {
        const modalBg = modal.bgColor || containerBg;
        // 遮罩层：fixed 覆盖视口，只做背景遮罩
        const overlayStyle: React.CSSProperties = {
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          display: "none", zIndex: 10000,
          backgroundColor: overlayColor,
          ...(overlayBlur ? { backdropFilter: `blur(${overlayBlurAmount}px)` } : {}),
        };
        // 内容框：absolute 相对于组件包装 div（已在组件 x,y 位置）
        const contentStyle: React.CSSProperties = {
          position: "absolute", top: 0, left: 0,
          width: `${modalWidth}px`, maxWidth: "90vw", maxHeight: `${modalMaxHeight}vh`,
          backgroundColor: modalBg, color: containerColor, borderRadius: `${borderRadius}px`,
          border: finalBorder, boxShadow: finalShadow, padding: `${paddingY}px ${paddingX}px`,
          display: "none", flexDirection: "column", gap: "8px", overflow: "auto",
          zIndex: 10001,
          opacity: 0, transform: "translateY(-20px) scale(0.95)",
          transition: animationEnabled ? "opacity 0.2s ease, transform 0.2s ease" : "none",
        };

        // —— 表单字段 HTML（form 类型） ——
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

        // —— 内容区 HTML ——
        const bodyHTML = modalStyle === "form"
          ? `<div style="flex:1;overflow-y:auto">${formFieldsHTML}</div>`
          : `<div style="color:${contentColor};font-size:${contentFontSize}px;line-height:${contentLineHeight};overflow-y:auto;flex:1">${escapeHTML(modal.content || "(空内容)")}</div>`;

        // —— 按钮区 HTML ——
        const cancelButton = modalStyle !== "info"
          ? `<button data-modal-close data-modal-action="cancel" style="${buttonStyleStr(cancelButtonColor)}">${escapeHTML(cancelText)}</button>`
          : "";
        const okButtonLabel = modalStyle === "form" ? "提交" : okText;
        const okAction = modalStyle === "form" ? "submit" : "ok";
        const okButton = `<button data-modal-close data-modal-action="${okAction}" style="${buttonStyleStr(okButtonColor)}">${escapeHTML(okButtonLabel)}</button>`;
        const buttonsHTML = `<div style="display:flex;justify-content:flex-end;gap:8px;flex-shrink:0;padding-top:4px">${cancelButton}${okButton}</div>`;

        // —— 标题栏 ——
        const closeHTML = showCloseButton
          ? `<div data-modal-close style="cursor:pointer;color:rgba(255,255,255,0.5);flex-shrink:0;padding:4px;border-radius:4px;display:flex;align-items:center" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></div>`
          : "";
        const titleHTML = `<div style="display:flex;align-items:center;justify-content:space-between;flex-shrink:0"><span style="font-size:${titleFontSize}px;font-weight:600;color:${titleColor}">${escapeHTML(modal.title || "(无标题)")}</span>${closeHTML}</div>`;

        // —— 结构：overlay（遮罩）和 content（内容框）为兄弟节点 ——
        // content 用 absolute 定位到组件包装 div 的位置（即组件在画布上的位置）
        return (
          <Box key={modal.id} data-modal-id={modal.id} data-modal-open="false" data-modal-style={modalStyle} style={{ display: "contents" }}>
            {/* 遮罩层 — fixed 覆盖视口 */}
            <Box data-modal-overlay style={overlayStyle} />
            {/* 内容框 — absolute 相对于组件包装 div 定位 */}
            <Box data-modal-content style={contentStyle} dangerouslySetInnerHTML={{ __html: titleHTML + bodyHTML + buttonsHTML }} />
          </Box>
        );
      })}
    </>
  );
}

/** HTML 转义 */
function escapeHTML(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
