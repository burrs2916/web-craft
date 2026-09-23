import { useEffect, useState, useRef, type ChangeEvent } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { fieldScaleFactor } from "../data/scaleFit";
import { installTimePickerPopup } from "../data/timePickerPopup";
import { installDatePickerPopup } from "../data/datePickerPopup";
import { MUI_FONT, colorSchemeOf, resolveFieldStyle } from "../data/fieldStyle";
import { validateFieldValue } from "../data/fieldValidate";
import { FieldShell } from "./fieldShell";
import { useApiDataFetch } from "../hooks/useApiDataFetch";
import { useDataSourceBinding } from "../../hooks/useDataSourceBinding";
import { readAuthEnabled } from "../data/authMode";

/** MUI 关闭图标 path（清空按钮，与发布端共用同一形状） */
const CLOSE_PATH =
  "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z";

/**
 * 日期 / 时间字段（编辑区画布，date 与 time 共用同一实现）
 *
 * 与发布端 `datetimeInputCodegen` 逐项同构：
 * - 结构：FieldShell（顶部标签或左上角悬浮徽章 + 边框环 + 提示文字）+ 原生 input。
 *   原实现用 MUI `TextField` + `InputLabel`：标签恒在框上方（无「内置悬浮」），
 *   边框颜色/粗细写死，且与发布端产物结构不同 → 画布与发布必然不一致。
 * - 原生 date/time **不支持 placeholder**，故用一层覆盖文字 + 有值隐藏来复刻占位提示。
 * - `color-scheme` 按背景明度推导，保证深色面板里日历/时钟图标可见。
 */
export function DateTimeField({
  config,
  mode,
  type,
  width,
  height,
  componentId,
}: ComponentRendererProps & { type: "date" | "time" }) {
  // 字段型「文字随框缩放」：date/time 共用本函数，factor 按各自 defaultSize 求值（与发布端同源）。
  const fitF = fieldScaleFactor(type === "date" ? "form-date" : "form-time",
    width ?? 0, height ?? 0, config.scaleFit === true);
  const s0 = resolveFieldStyle(config);
  const s = { ...s0, fontSize: s0.fontSize * fitF, labelFontSize: s0.labelFontSize * fitF };
  const isEdit = mode === "edit";
  const clearable = config.clearable === true && !s.disabled;
  const padX = 14;

  // ── 动态数据（与 slider/switch 同一套键与语义）：api 轮询 / 数据源绑定回读真实值，
  //    回不到明确值时回退静态默认值；动态模式接管后「默认今天」不再预填（与发布端 dtToday 同源）。──
  const dataMode = String(config.dataMode ?? "static");
  const dataSourceId = String(config.dataSourceId ?? "");
  const field = String(config.field ?? "");
  const apiUrl = String(config.apiUrl ?? "");
  const apiPath = String(config.apiPath ?? "");
  const isApi = dataMode === "api" && (apiUrl !== "" || apiPath !== "");
  const dynamic = isApi || field;
  // staticData 显式存在时优先（全局静态数据源驱动，与发布端 codegen 同口径）：不可解析则回退自带 value
  const rawStatic = config.staticData;
  const sdStr = (typeof rawStatic === "string" || typeof rawStatic === "number") ? String(rawStatic) : "";
  const staticV = sdStr !== "" ? sdStr : ((config.value as string) ?? "");
  const { componentData } = useDataSourceBinding(
    componentId,
    dataMode === "datasource" && dataSourceId ? [dataSourceId] : undefined,
  );
  const { data: fetchedData } = useApiDataFetch<string | number>({
    dataMode: dataMode === "api" ? "api" : "static",
    staticData: staticV,
    apiPath: "",
    apiUrl,
    apiMethod: ((config.apiMethod as string) || "GET") as "GET" | "POST",
    apiBody: config.apiBody,
    apiHeaders: config.apiHeaders,
    apiInterval: (config.apiInterval as number) ?? 0,
    apiDataPath: String(config.apiDataPath ?? ""),
    authEnabled: readAuthEnabled(config.authEnabled),
  });
  // 有效值：取数结果 > 静态默认值 > 默认今天(仅静态模式) > ""
  const effectiveValue = (() => {
    if (isApi && fetchedData != null && String(fetchedData) !== "") return String(fetchedData);
    if (dataMode === "datasource" && dataSourceId) {
      const bound = componentData[dataSourceId] as Record<string, unknown> | undefined;
      const v = field ? bound?.[field] : bound?.value;
      if (v != null && String(v) !== "") return String(v);
    }
    if (staticV) return staticV;
    if (type === "date" && config.defaultToToday === true && !dynamic) {
      const p = (n: number) => String(n).padStart(2, "0");
      const t = new Date();
      return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
    }
    return "";
  })();

  const [val, setVal] = useState(effectiveValue);
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);
  const focusedRef = useRef(false);
  // 自绘拾取弹层（与发布端内联的是**同一对函数**，见 editor/data/timePickerPopup.ts / datePickerPopup.ts）：
  // Tauri 应用内画布/预览窗口都是 WKWebView，date/time 都没有可用的原生拾取器。
  // 提交走原生 value setter + input 事件 → React onChange 正常接管受控值。
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const el = inputRef.current;
    if (!el || s.disabled || isEdit) return;
    return type === "time" ? installTimePickerPopup(el) : installDatePickerPopup(el);
  }, [type, s.disabled, isEdit]);
  // 面板改值 / 回读到达时同步画布；预览模式不抢用户正在编辑的值（与发布端 activeElement 守卫同语义）
  useEffect(() => {
    if (focusedRef.current) return;
    setVal(effectiveValue);
  }, [effectiveValue]);

  const error = validateFieldValue(config, val);
  const showError = !!error && (touched || val !== "");

  // 类型专属属性（date 区间 / time 步长），显式构造避免 Record<string,unknown> 展开进 JSX 报类型错
  const minD = type === "date" ? String(config.minDate ?? "").trim() || undefined : undefined;
  const maxD = type === "date" ? String(config.maxDate ?? "").trim() || undefined : undefined;
  const stepSec = (() => {
    if (type !== "time") return undefined;
    const stepMin = Number(config.stepMinutes);
    return Number.isFinite(stepMin) && stepMin > 0 ? Math.round(stepMin * 60) : undefined;
  })();

  return (
    <FieldShell s={s} focused={focused} hasValue={!!val} error={showError ? error : ""}>
      <Box
        component="input"
        ref={inputRef}
        type={type}
        value={val}
        required={s.required}
        disabled={s.disabled || isEdit}
        min={minD}
        max={maxD}
        step={stepSec}
        onFocus={() => { setFocused(true); focusedRef.current = true; }}
        onBlur={() => { setFocused(false); setTouched(true); focusedRef.current = false; }}
        onChange={(e: ChangeEvent<HTMLInputElement>) => { setTouched(true); setVal(e.target.value); }}
        sx={{
          flex: "1 1 auto",
          minWidth: 0,
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
          background: s.bgColor,
          color: s.textColor,
          border: "none",
          borderRadius: s.radiusCss,
          fontFamily: MUI_FONT,
          fontSize: `${s.fontSize}px`,
          fontWeight: s.fontWeight,
          lineHeight: 1.4375,
          padding: `0 ${padX + (clearable ? 22 : 0)}px 0 ${padX}px`,
          outline: "none",
          colorScheme: colorSchemeOf(s.bgColor),
          "&:disabled": { opacity: 0.6, cursor: "not-allowed" },
          "&::-webkit-calendar-picker-indicator": { display: "none" },
        }}
      />

      {s.placeholder && !val && (
        <Box
          component="span"
          sx={{
            position: "absolute",
            left: `${padX}px`,
            right: `${padX}px`,
            top: "50%",
            transform: "translateY(-50%)",
            pointerEvents: "none",
            userSelect: "none",
            fontSize: `${s.fontSize}px`,
            lineHeight: 1.4375,
            color: s.textColor,
            opacity: 0.5,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {s.placeholder}
        </Box>
      )}

      {clearable && !!val && (
        <Box
          component="span"
          role="button"
          aria-label="清空"
          onClick={() => { setVal(""); setTouched(true); }}
          sx={{
            position: "absolute",
            right: `${padX}px`,
            top: "50%",
            transform: "translateY(-50%)",
            cursor: "pointer",
            zIndex: 3,
            userSelect: "none",
            color: "rgba(120,130,150,0.8)",
            display: "flex",
            "&:hover": { color: "#94A3B8" },
          }}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path d={CLOSE_PATH} />
          </svg>
        </Box>
      )}
    </FieldShell>
  );
}
