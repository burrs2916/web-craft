import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { fieldScaleFactor } from "../data/scaleFit";
import { useApiDataFetch } from "../hooks/useApiDataFetch";
import { useEditorStore } from "../../store/editorStore";
import { resolveEffectiveDataConfig } from "../../shared/resolveDataConfig";
import { parseOptionItems, parseApiOptionItems } from "../data/optionItems";
import { resolveIcon } from "../plugins";
import { readAuthEnabled } from "../data/authMode";

// 与发布端 formSelectCodegen 的 :focus-within .fc-sel-flabel 同源聚焦标签色
const FOCUS_LABEL_COLOR = "#60A5FA";

/**
 * 与发布端 __WCVALIDATE 同规则的校验（仅读 config，不依赖 DOM）。
 * 返回错误文案，'' 表示通过。非空时才做格式/区间校验，必填空值返回必填错误。
 * 与 FormInputRenderer/FormTextareaRenderer 编辑器校验同源，保证三控件编辑区反馈一致。
 */
function validateSelect(cfg: Record<string, unknown>, rawValue: string): string {
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
    const n = parseFloat(value);
    const toNum = (v: unknown): number | null =>
      v === undefined || v === null || v === "" ? null : Number(v);
    const min = toNum(cfg.validateMin);
    const max = toNum(cfg.validateMax);
    if (min !== null && n < min) return msg || `数值不能小于 ${min}`;
    if (max !== null && n > max) return msg || `数值不能大于 ${max}`;
  }
  if (vtype === "regex" && regex && !new RegExp(regex).test(value)) return msg || "输入格式不正确";
  return "";
}

/**
 * 编辑区下拉选择。
 *
 * 为什么不用原生 <select> / MUI Select：
 * 画布组件包裹层 overflow:hidden（EditorCanvasComponent）会把"组件内"弹出层裁掉；
 * 而原生 select / MUI Portal 下拉弹层在带 transform:scale 缩放的画布里会错位
 * （锚点坐标未按缩放换算）。故自绘触发器 + Portal 弹层：
 * Portal 逃出 overflow:hidden 的包裹层，按触发器 getBoundingClientRect（已含缩放）
 * 用 position:fixed 定位，弹层紧贴触发器底边（下沿），且不随画布裁剪。
 *
 * 视觉与发布端 formSelectCodegen 同构（同几何/同箭头/同徽章），保证编辑区=发布预览。
 */
export function FormSelectRenderer({ config, mode, width, height }: ComponentRendererProps) {
  // 字段型「文字随框缩放」：factor 与发布端同源（编译期同款计算），关闭/尺寸未传恒为 1，零回归。
  const fitF = fieldScaleFactor("form-select", width ?? 0, height ?? 0, config.scaleFit === true);
  const label = (config.label as string) || "";
  const placeholder = String(config.placeholder ?? "").trim();
  const labelPlacement = String(config.labelPlacement ?? "inside");
  const selectedIndex = Number(config.selectedIndex ?? 0) || 0;
  const required = (config.required as boolean) ?? false;
  const disabled = (config.disabled as boolean) ?? false;
  const clearable = (config.clearable as boolean) ?? false;
  const helperText = String(config.helperText ?? "").trim();

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
  const labelColorCss = labelColor || textColor;
  const errColor = (config.errorColor as string) || "#f44336";

  const isEdit = mode === "edit";
  const isDisabled = disabled || isEdit;

  // 动态 API 选项（编辑器画布预览，复用统一 useApiDataFetch）。
  // 与发布端 codegen 同源：先解析全局数据源绑定覆盖，再判定是否为接口模式，避免预览/发布漂移。
  const dataSources = useEditorStore((s) => s.dataSources);
  const dsId = String(config.dataSourceId ?? "");
  const boundSource = dsId ? dataSources.find((d) => d.id === dsId) : undefined;
  const effApi = resolveEffectiveDataConfig(config, boundSource);
  const dataMode = String(effApi.dataMode ?? "static");
  const isApi = dataMode === "api" && (dsId || String(effApi.apiUrl ?? "") || String(effApi.apiPath ?? ""));
  const apiValueField = String(effApi.apiValueField ?? "");
  const apiLabelField = String(effApi.apiLabelField ?? "");
  const authEnabledCfg = readAuthEnabled(config.authEnabled);
  const { data: apiRaw } = useApiDataFetch({
    dataMode: isApi ? "api" : "static",
    apiUrl: String(effApi.apiUrl ?? ""),
    apiPath: String(effApi.apiPath ?? ""),
    apiMethod: (String(effApi.apiMethod ?? "GET") as "GET" | "POST"),
    apiBody: effApi.apiBody,
    apiHeaders: effApi.apiHeaders,
    apiInterval: Number(effApi.apiInterval ?? 0) || 0,
    apiDataPath: String(effApi.apiDataPath ?? ""),
    authEnabled: authEnabledCfg,
    dataSourceId: dsId,
  });
  // 接口响应 → 选项（字段映射与发布端 dataLoader renderBody 内联逻辑同源）
  const apiOptions = useMemo(
    () => (isApi ? parseApiOptionItems(apiRaw, { valueField: apiValueField, labelField: apiLabelField }) : []),
    [isApi, apiRaw, apiValueField, apiLabelField],
  );

  // 静态选项：兼容新 items 数组与旧 options 文本（自动迁移）
  const parsed = parseOptionItems(config.items ?? config.options);
  const sourceOptions = isApi ? apiOptions : parsed;
  const showEmpty = !!placeholder || clearable;
  const effective = showEmpty
    ? [{ label: placeholder || "", value: "" }, ...sourceOptions]
    : sourceOptions;
  let defaultIdx = showEmpty ? (selectedIndex > 0 ? selectedIndex : 0) : selectedIndex;
  defaultIdx = Math.max(0, Math.min(defaultIdx, effective.length - 1));
  const derivedValue = effective[defaultIdx]?.value ?? "";
  const [value, setValue] = useState(derivedValue);
  const [touched, setTouched] = useState(false);
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(defaultIdx);
  const [popup, setPopup] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // 配置驱动的默认选项变化时（改 items/options / selectedIndex / placeholder / clearable）重新同步预览选择
  useEffect(() => {
    setValue(derivedValue);
  }, [derivedValue]);

  // 实时校验：与发布端 __WCVALIDATE 同规则；非空格式错误即时显示，必填空值在失焦/选择后才提示
  const error = useMemo(() => validateSelect(config, value), [config, value]);
  const showError = !!error && (touched || value !== "");

  const showLabel = labelPlacement !== "none" && !!label;
  const topLabel = showLabel && labelPlacement === "top";
  const insideLabel = showLabel && labelPlacement === "inside";

  // 与发布端同源几何：自然高 37.125px、padding 8.5/32(56)/14、line-height 20.125、圆角 ×shape(10)
  const padRight = clearable ? 56 : 32;
  const ctrlH = "37.125px";
  const radiusCss = `${(Number(borderRadius) >= 0 ? Number(borderRadius) : 4) * 10}px`;
  const ringColor = showError ? errColor : (focused ? focusBorderColor : borderColor);
  const labelShownColor = showError ? errColor : (focused ? FOCUS_LABEL_COLOR : labelColorCss);
  const ease = "cubic-bezier(0, 0, 0.2, 1)";

  const selectedOpt = effective.find((o) => o.value === value) ?? (showEmpty ? effective[0] : undefined);
  const displayLabel = selectedOpt ? selectedOpt.label : "";
  const displayIcon = selectedOpt?.icon;

  // 打开时按触发器屏幕坐标定位 Portal 弹层（已含画布 transform 缩放），紧贴底边
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const maxHeight = Math.max(80, Math.min(240, window.innerHeight - rect.bottom - 8));
    setPopup({ top: rect.bottom, left: rect.left, width: rect.width, maxHeight });
    const close = () => setOpen(false);
    // 画布平移/缩放、窗口变化都会让 fixed 坐标失效，直接关闭避免错位
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  // 点击组件外部关闭弹层
  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      // 点击触发器（containerRef 内）或弹层（popupRef 内）都不关闭；其余外部点击关闭
      if (containerRef.current && containerRef.current.contains(t)) return;
      if (popupRef.current && popupRef.current.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  const choose = (idx: number) => {
    const opt = effective[idx];
    if (!opt) return;
    setValue(opt.value);
    setTouched(true);
    setOpen(false);
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (isDisabled) return;
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx(Math.max(0, effective.findIndex((o) => o.value === value)));
        setOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(effective.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActiveIdx(0); }
    else if (e.key === "End") { e.preventDefault(); setActiveIdx(effective.length - 1); }
    else if (e.key === "Enter") { e.preventDefault(); choose(activeIdx); }
  };

  // Portal 弹层：逃出 overflow:hidden 包裹层，按触发器屏幕坐标固定定位，紧贴底边（下沿）
  const popupEl =
    open && popup && !isDisabled
      ? createPortal(
          <Box
            ref={popupRef}
            role="listbox"
            onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
            sx={{
              position: "fixed",
              // 显式 px 字符串：绕过定制版 MUI sx 对数字 top/left/width 的 px 处理不确定性，
              // 确保 position:fixed 锚点精准（getBoundingClientRect 已含画布缩放，视口坐标直用）
              top: `${popup.top}px`,
              left: `${popup.left}px`,
              width: `${popup.width}px`,
              maxHeight: `${popup.maxHeight}px`,
              overflowY: "auto",
              backgroundColor: "#ffffff",
              boxSizing: "border-box",
              border: "1px solid " + borderColor,
              borderRadius: radiusCss,
              boxShadow: "0 6px 20px rgba(0,0,0,.16)",
              paddingTop: "4px",
              paddingBottom: "4px",
              zIndex: 2147483000,
            }}
          >
            {effective.map((opt, i) => {
              const selected = opt.value === value;
              const active = i === activeIdx;
              const bg = selected
                ? "rgba(25,118,210,.10)"
                : active
                ? "rgba(0,0,0,.05)"
                : "transparent";
              return (
                <Box
                  key={opt.value + "_" + i}
                  role="option"
                  aria-selected={selected}
                  onClick={() => choose(i)}
                  onMouseEnter={() => setActiveIdx(i)}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    height: "34px",
                    px: "14px",
                    fontSize: fontSize,
                    fontWeight: fontWeight,
                    color: textColor,
                    cursor: "pointer",
                    backgroundColor: bg,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", overflow: "hidden", minWidth: 0 }}>
                    {opt.icon && (
                      <span style={{ display: "inline-flex", alignItems: "center", marginRight: "8px", flexShrink: 0 }}>
                        {resolveIcon(opt.icon, undefined, 16)}
                      </span>
                    )}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{opt.label}</span>
                  </span>
                  {selected && (
                    <Box
                      component="span"
                      sx={{ display: "flex", ml: "8px", flexShrink: 0, color: focusBorderColor }}
                    >
                      ✓
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>,
          document.body
        )
      : null;

  return (
    <Box
      ref={containerRef}
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: topLabel ? "flex-start" : "center",
        boxSizing: "border-box",
        // 打开弹层时抬升自身层叠，确保 Portal 之上的触发器层级不被遮挡
        position: "relative",
        zIndex: open ? 1300 : "auto",
      }}
    >
      {topLabel && (
        <Box
          component="label"
          sx={{
            fontSize: labelFontSize,
            lineHeight: 1.2,
            color: labelColorCss,
            mb: `${labelGap}px`,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            flexShrink: 0,
            userSelect: "none",
          }}
        >
          {required ? `${label} *` : label}
        </Box>
      )}
      {/* 控件容器 = 发布端 data-ring 环层：box-shadow inset 画边框，聚焦/错误改色不挤压文字 */}
      <Box
        sx={{
          position: "relative",
          width: "100%",
          height: ctrlH,
          flexShrink: 0,
          boxSizing: "border-box",
          borderRadius: radiusCss,
          backgroundColor: bgColor,
          boxShadow: `inset 0 0 0 ${borderWidth}px ${ringColor}`,
          transition: `box-shadow .2s ${ease}`,
          // 仅"真实禁用"才压淡（与发布端一致）；编辑态不压淡，保证颜色与发布端一致
          ...(disabled ? { opacity: 0.6 } : {}),
        }}
      >
        {/* 触发器：替代原生 select，外观与发布端同源；点击展开 Portal 弹层 */}
        <Box
          ref={triggerRef}
          role="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-disabled={isDisabled}
          tabIndex={isDisabled ? -1 : 0}
          onClick={() => {
            if (isDisabled) return;
            setActiveIdx(Math.max(0, effective.findIndex((o) => o.value === value)));
            setOpen((o) => !o);
          }}
          onKeyDown={onTriggerKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setTouched(true);
          }}
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            padding: `0 ${padRight}px 0 14px`,
            cursor: isDisabled ? "not-allowed" : "pointer",
            color: textColor,
            fontSize: fontSize,
            fontWeight: fontWeight,
            lineHeight: "20.125px",
            userSelect: "none",
            fontFamily: "inherit",
            outline: "none",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", overflow: "hidden", minWidth: 0, whiteSpace: "nowrap" }}>
            {displayIcon && (
              <span style={{ display: "inline-flex", alignItems: "center", marginRight: "6px", flexShrink: 0 }}>
                {resolveIcon(displayIcon, undefined, 16)}
              </span>
            )}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{displayLabel}</span>
          </span>
        </Box>
        {/* 下拉箭头：跟随文字色，right:7 与发布端一致；展开时旋转 180° */}
        <svg
          viewBox="0 0 24 24"
          width={24}
          height={24}
          aria-hidden="true"
          style={{
            position: "absolute",
            right: 7,
            top: "50%",
            transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`,
            transition: `transform .2s ${ease}`,
            pointerEvents: "none",
            display: "block",
            fill: textColor,
          }}
        >
          <path d="M7 10l5 5 5-5z" />
        </svg>
        {/* 一键清空：已选择且非禁用时显示（箭头左侧，padding-right 已预留空间） */}
        {clearable && value !== "" && !isDisabled && (
          <Box
            onClick={(e) => {
              e.stopPropagation();
              setValue("");
              setTouched(true);
            }}
            sx={{
              position: "absolute",
              right: "32px",
              top: "50%",
              transform: "translateY(-50%)",
              cursor: "pointer",
              color: textColor,
              opacity: 0.7,
              zIndex: 2,
              display: "flex",
              alignItems: "center",
              userSelect: "none",
            }}
          >
            <svg viewBox="0 0 24 24" width={14} height={14} style={{ display: "block", fill: "currentColor" }} aria-hidden="true">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </Box>
        )}
        {/* 内置悬浮标签：左上角徽章（背景/圆角/字号可调），底色盖住边框线段形成干净缺口（与发布端 fc-sel-flabel 同款，上沿） */}
        {insideLabel && label && (
          <label
            style={{
              position: "absolute",
              left: "14px",
              top: 0,
              transform: "translateY(-50%)",
              fontSize: labelFontSize,
              lineHeight: 1.2,
              color: labelShownColor,
              background: labelBgColorCss,
              borderRadius: labelRadius,
              padding: "0 4px",
              zIndex: 2,
              pointerEvents: "none",
              whiteSpace: "nowrap",
              userSelect: "none",
              transition: `color .2s ${ease}`,
            }}
          >
            {required ? `${label} *` : label}
          </label>
        )}
      </Box>
      {/* 错误提示 / 帮助文字：控件下方，校验出错时错误让位显示（与发布端 errEl/helperLine 一致） */}
      {(showError || helperText) && (
        <Box
          sx={{
            fontSize: "12px",
            lineHeight: 1.4,
            marginTop: "3px",
            flexShrink: 0,
            userSelect: "none",
            color: showError ? errColor : (labelColor || "#8a8f98"),
          }}
        >
          {showError ? error : helperText}
        </Box>
      )}
      {popupEl}
    </Box>
  );
}
