import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import type { ComponentRendererProps } from "../../types/editor";
import { fieldScaleFactor } from "../data/scaleFit";

/**
 * 与发布端 codegen/__WCVALIDATE 同规则的校验（仅读 config，不依赖 DOM）。
 * 返回错误文案，'' 表示通过。非空时才做格式/区间校验，必填空值返回必填错误。
 */
function validateInput(cfg: Record<string, unknown>, rawValue: string): string {
  const value = rawValue.trim();
  const required = cfg.required === true;
  const vtype = String(cfg.validateType ?? "none");
  const regex = String(cfg.validateRegex ?? "").trim();
  const msg = String(cfg.validateMessage ?? "").trim();
  if (required && value === "") return msg || "此项为必填项";
  if (value === "") return "";
  if (vtype === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return msg || "请输入有效的邮箱地址";
  if (vtype === "phone" && !/^1[3-9]\d{9}$/.test(value)) return msg || "请输入有效的手机号码";
  if (vtype === "number") {
    if (!/^-?\d+(\.\d+)?$/.test(value)) return msg || "请输入有效数字";
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      const n = parseFloat(value);
      const toNum = (v: unknown): number | null =>
        v === undefined || v === null || v === "" ? null : Number(v);
      const min = toNum(cfg.validateMin);
      const max = toNum(cfg.validateMax);
      if (min !== null && n < min) return msg || `数值不能小于 ${min}`;
      if (max !== null && n > max) return msg || `数值不能大于 ${max}`;
    }
  }
  if (vtype === "regex" && regex && !new RegExp(regex).test(value)) return msg || "输入格式不正确";
  return "";
}

export function FormInputRenderer({ config, mode, width, height }: ComponentRendererProps) {
  // 字段型「文字随框缩放」：factor 与发布端同源（props 尺寸 = transform 尺寸，编译期同款计算），
  // 开关关闭 / 尺寸未传时恒为 1，零回归。
  const fitF = fieldScaleFactor("form-input", width ?? 0, height ?? 0, config.scaleFit === true);
  const label = (config.label as string) || "";
  const placeholder = (config.placeholder as string) || "";
  const defaultValue = (config.value as string) || "";
  const inputType = (config.inputType as string) || "text";
  const labelPlacement = (config.labelPlacement as string) || "inside";
  const required = (config.required as boolean) ?? false;
  const disabled = (config.disabled as boolean) ?? false;
  const readonly = (config.readonly as boolean) ?? false;
  const clearable = (config.clearable as boolean) ?? false;
  const maxLength = (config.maxLength as number) ?? 0;
  const showCount = (config.showCount as boolean) ?? false;
  const bgColor = (config.bgColor as string) || "#ffffff";
  const textColor = (config.textColor as string) || "#333333";
  const borderColor = (config.borderColor as string) || "#d0d0d8";
  const borderWidth = (config.borderWidth as number) ?? 1;
  const focusBorderColor = (config.focusBorderColor as string) || "#1976d2";
  const borderRadius = (config.borderRadius as number) ?? 4;
  const fontSize = ((config.fontSize as number) || 14) * fitF;
  const fontWeight = (config.fontWeight as string) || "normal";
  const labelColor = (config.labelColor as string) || "";
  const labelFontSize = ((config.labelFontSize as number) || (config.fontSize as number) || 14) * fitF;
  const labelBgColor = (config.labelBgColor as string) || "";
  const labelBgColorCss = labelBgColor || bgColor;
  const labelRadius = Number(config.labelRadius) >= 0 ? Number(config.labelRadius) : 4;
  const labelGap = (config.labelGap as number) ?? 4;
  const helperText = (config.helperText as string) || "";
  const prefixText = (config.prefixText as string) || "";
  const suffixText = (config.suffixText as string) || "";
  const paddingX = (config.paddingX as number) ?? 14;
  const align = (config.align as "left" | "center" | "right") || "left";
  const autocomplete = (config.autocomplete as string) || "";
  const isEdit = mode === "edit";
  const showInsideLabel = labelPlacement === "inside";

  const [val, setVal] = useState(defaultValue);
  const [touched, setTouched] = useState(false);
  // 编辑面板改“默认值”时同步画布，使配置变更在画布即时可见
  useEffect(() => { setVal(defaultValue); }, [defaultValue]);
  const interactive = !isEdit && !disabled;
  // 仅“真实禁用”才压淡（与发布端 input:disabled 一致）；编辑态不压淡，保证颜色与发布端一致
  const fadeDisabled = disabled;
  const errColor = (config.errorColor as string) || "#f44336";
  // 实时校验：与发布端规则一致；非空格式错误即时显示，必填空值在失焦/输入后才提示
  const error = useMemo(() => validateInput(config, val), [config, val]);
  const showError = !!error && (touched || val !== "");
  const clearBtn = clearable && val && interactive ? (
    <IconButton
      size="small"
      onClick={() => setVal("")}
      sx={{ p: 0.25, color: "text.disabled", "&:hover": { color: "text.secondary" } }}
      aria-label="清空"
    >
      <CloseIcon sx={{ fontSize: 14 }} />
    </IconButton>
  ) : undefined;
  const count = showCount ? (
    <Typography variant="caption" sx={{ fontSize: 11, color: "text.secondary", alignSelf: "flex-end", mt: 0.25 }}>
      {val.length}{maxLength > 0 ? ` / ${maxLength}` : ""}
    </Typography>
  ) : undefined;

  const prefixNode = prefixText ? (
    <InputAdornment position="start" sx={{ color: "inherit", opacity: 0.75 }}>
      {prefixText}
    </InputAdornment>
  ) : undefined;
  const suffixNode = suffixText ? (
    <InputAdornment position="end" sx={{ color: "inherit", opacity: 0.75 }}>
      {suffixText}
    </InputAdornment>
  ) : undefined;
  const startAdornment = prefixText ? prefixNode : undefined;
  const endAdornment = (
    <>
      {suffixNode}
      {clearBtn}
    </>
  );

  const topLabel = labelPlacement === "top" && label && (
    <Typography
      component="label"
      sx={{
        fontSize: labelFontSize,
        lineHeight: 1.2,
        color: labelColor || textColor,
        marginBottom: `${labelGap}px`,
        display: "block",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        userSelect: "none",
      }}
    >
      {required ? `${label} *` : label}
    </Typography>
  );

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: showInsideLabel ? "center" : "flex-start",
      }}
    >
      {topLabel}
      <Box sx={{ position: "relative", flex: 1, width: "100%", display: "flex", flexDirection: "column" }}>
        <TextField
          placeholder={placeholder}
          value={val}
          type={inputType}
          required={required}
          disabled={disabled || isEdit}
          error={showError}
          helperText={showError ? error : (helperText || undefined)}
          onChange={(e) => {
            const v = e.target.value;
            setTouched(true);
            if (maxLength > 0 && v.length > maxLength) return;
            setVal(v);
          }}
          onBlur={() => setTouched(true)}
          slotProps={{
            input: {
              readOnly: readonly,
              style: { textAlign: align },
              inputProps: { maxLength: maxLength > 0 ? maxLength : undefined, autoComplete: autocomplete || undefined },
              startAdornment,
              endAdornment,
            },
            formHelperText: {
              sx: { color: showError ? errColor : (labelColor || "#8a8f98"), fontSize: 12, marginTop: "3px", lineHeight: 1.4 },
            },
          }}
          sx={{
            // 输入框填满设计盒高度，与发布端 height:100% 严格一致；悬浮标签由下方自定义徽章绘制（对齐发布端 fc-flabel）
            flex: 1,
            width: "100%",
            "& .MuiOutlinedInput-root": {
              backgroundColor: bgColor,
              borderRadius,
              fontSize,
              fontWeight,
              color: textColor,
              height: "100%",
              paddingLeft: `${paddingX}px`,
              paddingRight: `${paddingX}px`,
              "& fieldset": { borderColor: showError ? errColor : borderColor, borderWidth, borderRadius },
              "&.Mui-focused fieldset": { borderColor: showError ? errColor : focusBorderColor, borderWidth },
              ...(fadeDisabled
                ? { "&.Mui-disabled": { backgroundColor: bgColor, opacity: 0.6 } }
                : {}),
            },
            "& .MuiOutlinedInput-root.Mui-error fieldset": { borderColor: errColor },
          }}
          fullWidth
          size="small"
        />
        {showInsideLabel && label && (
          <label
            style={{
              position: "absolute",
              left: `${paddingX}px`,
              top: 0,
              transform: "translateY(-50%)",
              fontSize: labelFontSize,
              lineHeight: 1.2,
              color: labelColor || textColor,
              background: labelBgColorCss,
              borderRadius: labelRadius,
              padding: "0 4px",
              zIndex: 2,
              pointerEvents: "none",
              whiteSpace: "nowrap",
              userSelect: "none",
            }}
          >
            {required ? `${label} *` : label}
          </label>
        )}
      </Box>
      {count}
    </Box>
  );
}