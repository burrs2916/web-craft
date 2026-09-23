import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { fieldScaleFactor } from "../data/scaleFit";
import { resolveFieldStyle } from "../data/fieldStyle";
import { validateFieldValue } from "../data/fieldValidate";
import { ffPickFiles, ffFormatSize, ffRejectText, ffSetInputFiles, ffZoneRadius, ffZoneIconSvg } from "../data/fileField";
import { FieldShell } from "./fieldShell";

/**
 * 文件上传（编辑区画布）
 *
 * 与发布端 `formFileCodegen` 同构（过滤/回填/格式化/提示文案来自 `data/fileField.ts` 两端同源）：
 * - 结构：FieldShell（标签 + 校验/帮助文字）+ 虚线拖放区 + 文件列表 + 拒绝提示。
 *   拖放区自带虚线边框，故外壳传 `ring={false}`，避免「实线环 + 虚线框」双重描边。
 * - **两条路径同口径**：drop 与原生选择都过 `ffPickFiles`（accept/multiple/数量/大小）；
 *   回填用 `ffSetInputFiles`（DataTransfer 重建，WKWebView/Safari 可靠）。
 * - 文件列表逐条显示文件名 + 大小 + 单个删除（× 重建 FileList）。
 * - **键盘可达**：input 用视觉隐藏（clip）而非 display:none，可 Tab 聚焦、Enter/Space
 *   原生选择；聚焦/拖入高亮由 state 计算（画布层叠上下文不吃状态类规则）。
 */
export function FormFileRenderer({ config, mode, width, height }: ComponentRendererProps) {
  // 字段型「文字随框缩放」：factor 与发布端同源（编译期同款计算），关闭/尺寸未传恒为 1，零回归。
  const fitF = fieldScaleFactor("form-file", width ?? 0, height ?? 0, config.scaleFit === true);
  // 标签口径：非 "none" 一律悬浮徽章（骑框沿），框占满整盒 → 图标+文字相对四边居中（与发布端同源）
  const placement = String(config.labelPlacement ?? "top") === "none" ? "none" : "inside";
  const s0 = resolveFieldStyle({ ...config, labelPlacement: placement }, { bgColor: "#f5f5f5", radius: 8 });
  const s = { ...s0, fontSize: s0.fontSize * fitF, labelFontSize: s0.labelFontSize * fitF };
  const multiple = config.multiple === true;
  const accept = (config.accept as string) ?? "";
  const maxCount = Math.max(0, Math.floor(Number(config.maxCount) || 0));
  const maxFileSizeMB = Math.max(0, Number(config.maxFileSize) || 0);
  const placeholder = s.placeholder || "点击或拖拽文件到此处";
  const isEdit = mode === "edit";
  const interactive = !isEdit && !s.disabled;

  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [rejected, setRejected] = useState<{ name: string; reason: string }[]>([]);
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);

  // 面板改配置（如取消多选/改上限）时清空已选回显，避免画布残留与发布端不一致
  useEffect(() => { setFiles([]); setRejected([]); setTouched(false); }, [multiple, accept, maxCount, maxFileSizeMB]);

  const rejectText = ffRejectText(rejected);
  const validationError = validateFieldValue(config, files.length ? "file" : "");
  const showError = !!validationError && (touched || files.length > 0);
  const shellError = showError ? validationError : rejectText;

  const applyPicked = (list: File[] | null) => {
    const res = ffPickFiles(
      list as unknown as ({ length: number } & Record<number, File>) | null,
      accept, multiple, maxCount, maxFileSizeMB,
    );
    if (res.kept.length || res.rejected.length) {
      setFiles(res.kept);
      setRejected(res.rejected);
      setTouched(true);
      if (inputRef.current) ffSetInputFiles(inputRef.current, res.kept);
    }
  };

  const onDelete = (idx: number) => {
    const cur = files.slice();
    cur.splice(idx, 1);
    setFiles(cur);
    setRejected([]);
    if (inputRef.current) ffSetInputFiles(inputRef.current, cur);
  };

  const zoneBorder = shellError
    ? s.errorColor
    : dragging || focused
      ? s.focusBorderColor
      : s.borderColor;
  const fileFont = Math.max(11, s.fontSize - 2);
  // 拖放区是大块面：圆角按像素生效并封顶 24（与发布端 ffZoneRadius 同源，8→80px 会变胶囊/按钮观感）
  const zoneRadius = ffZoneRadius(config.borderRadius);
  const itemRadius = Math.min(zoneRadius, 6);
  const iconSize = Math.round(s.fontSize * 1.6);

  return (
    <FieldShell s={s} error={shellError} ring={false} fieldSx={{ display: "flex", flexDirection: "column" }}>
      <Box
        component="label"
        onDragEnter={(e: DragEvent) => { e.preventDefault(); if (interactive) setDragging(true); }}
        onDragOver={(e: DragEvent) => { e.preventDefault(); if (interactive) setDragging(true); }}
        onDragLeave={(e: DragEvent) => { e.preventDefault(); setDragging(false); }}
        onDrop={(e: DragEvent) => {
          e.preventDefault();
          setDragging(false);
          if (!interactive) return;
          const fs = e.dataTransfer?.files;
          applyPicked(fs ? Array.from(fs) : null);
        }}
        sx={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
          padding: "12px",
          border: `1px dashed ${zoneBorder}`,
          borderRadius: `${zoneRadius}px`,
          background: s.bgColor,
          boxSizing: "border-box",
          cursor: s.disabled ? "not-allowed" : "pointer",
          transition: "border-color 0.2s, box-shadow 0.2s",
          ...(dragging ? { boxShadow: `inset 0 0 0 2px ${s.focusBorderColor}` } : {}),
        }}
      >
        <Box
          component="input"
          ref={inputRef}
          type="file"
          accept={accept || undefined}
          multiple={multiple}
          disabled={s.disabled || isEdit}
          tabIndex={s.disabled || isEdit ? -1 : 0}
          onFocus={() => { if (interactive) setFocused(true); }}
          onBlur={() => setFocused(false)}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const fs = e.target.files;
            applyPicked(fs ? Array.from(fs) : null);
          }}
          // 视觉隐藏（clip）而非 display:none：保留焦点能力 → 键盘可达
          sx={{
            position: "absolute",
            width: "1px",
            height: "1px",
            margin: "-1px",
            padding: 0,
            overflow: "hidden",
            clip: "rect(0 0 0 0)",
            clipPath: "inset(50%)",
            whiteSpace: "nowrap",
            border: "none",
          }}
        />
        {/* 上传图标：与提示文字成组居中（发布端 ffZoneIconSvg 同一函数同一 SVG） */}
        <Box
          component="span"
          sx={{ display: "block", color: s.disabled ? s.borderColor : s.textColor, opacity: 0.75 }}
          dangerouslySetInnerHTML={{ __html: ffZoneIconSvg(iconSize, "currentColor") }}
        />
        <Box
          component="span"
          sx={{
            minWidth: "64px",
            fontSize: `${s.fontSize}px`,
            lineHeight: 1.75,
            fontWeight: 500,
            textAlign: "center",
            color: s.textColor,
            opacity: 0.75,
            userSelect: "none",
          }}
        >
          {placeholder}
        </Box>
      </Box>
      {files.length > 0 && (
        <Box
          sx={{
            flexShrink: 1,
            minHeight: 0,
            maxHeight: "60%",
            overflowY: "auto",
            marginTop: "4px",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
          }}
        >
          {files.map((f, idx) => (
            <Box
              key={`${idx}-${f.name}`}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                minWidth: 0,
                padding: "2px 6px",
                background: s.bgColor,
                border: `1px solid ${s.borderColor}`,
                borderRadius: `${itemRadius}px`,
                fontSize: `${fileFont}px`,
                color: s.textColor,
                lineHeight: 1.5,
              }}
            >
              <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {f.name}
              </Box>
              <Box component="span" sx={{ flexShrink: 0, opacity: 0.6, fontSize: "11px" }}>
                {ffFormatSize(f.size)}
              </Box>
              <Box
                component="button"
                type="button"
                aria-label={`移除 ${f.name}`}
                onClick={() => { if (interactive) onDelete(idx); }}
                sx={{
                  flexShrink: 0,
                  width: "18px",
                  height: "18px",
                  lineHeight: "16px",
                  textAlign: "center",
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  color: s.textColor,
                  opacity: 0.55,
                  cursor: s.disabled ? "not-allowed" : "pointer",
                  fontSize: "14px",
                  borderRadius: "50%",
                  "&:hover": interactive ? { opacity: 1, background: "rgba(0,0,0,.08)" } : {},
                }}
              >
                ×
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </FieldShell>
  );
}
