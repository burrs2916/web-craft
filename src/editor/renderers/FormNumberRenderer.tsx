import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { fieldScaleFactor } from "../data/scaleFit";
import { MUI_FONT, resolveFieldStyle } from "../data/fieldStyle";
import { validateFieldValue } from "../data/fieldValidate";
import { fnFormat, fnClamp, fnEdge, FN_MINUS_PATH, FN_PLUS_PATH } from "../data/numberField";
import { FieldShell } from "./fieldShell";

/**
 * 数字步进（编辑区画布）
 *
 * 与发布端 `formNumberCodegen` 同构：
 * - 结构：FieldShell（悬浮徽章 + 边框环 + 提示文字）+ 步进行（加减按钮 + 居中数字输入）。
 *   原实现自绘边框且无标签位置概念 → 与发布端产物不同构。
 * - 步进按钮布局可配：两侧 / 右侧竖排。
 * - 小数位：0 = 整数（步进按整数显示），>0 按位四舍五入（fmt 与发布端 `fnFormat` 同源）。
 * - 取值与边界 min/max 收敛，越界输入在失焦时吸附。
 * - P0-1：隐藏原生数字 spinner（appearance:none），P1-2：按钮禁用态与发布端 `fnEdge` 同源（NaN→0）。
 */
export function FormNumberRenderer({ config, mode, width, height }: ComponentRendererProps) {
  // 字段型「文字随框缩放」：factor 与发布端同源（编译期同款计算），关闭/尺寸未传恒为 1，零回归。
  const fitF = fieldScaleFactor("form-number", width ?? 0, height ?? 0, config.scaleFit === true);
  const s0 = resolveFieldStyle(config);
  const s = { ...s0, fontSize: s0.fontSize * fitF, labelFontSize: s0.labelFontSize * fitF };
  const accent = (config.accentColor as string) || "#1976d2";
  const precision = Math.max(0, Math.min(10, Number(config.precision ?? 0) || 0));
  const placement = (config.buttonPlacement as string) === "right" ? "right" : "both";
  const min = config.min !== undefined && config.min !== "" ? Number(config.min) : null;
  const max = config.max !== undefined && config.max !== "" ? Number(config.max) : null;
  const step = config.step !== undefined && config.step !== "" ? Number(config.step) : 1;
  const isEdit = mode === "edit";
  const interactive = !isEdit && !s.disabled;

  const [val, setVal] = useState<string>(() => (config.value !== undefined ? fnFormat(config.value, precision) : ""));
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);
  // 面板改「默认值 / 小数位」时同步画布
  useEffect(() => {
    setVal(config.value !== undefined && config.value !== "" ? fnFormat(config.value, precision) : "");
  }, [config.value, precision]);

  const error = validateFieldValue(config, val);
  const showError = !!error && (touched || val !== "");

  const clamp = (n: number) => fnClamp(n, min, max);
  const bump = (delta: number) => {
    if (!interactive) return;
    const cur = Number(val);
    const base = Number.isFinite(cur) ? cur : 0;
    setTouched(true);
    setVal(fnFormat(clamp(base + delta * step), precision));
  };

  // P2：长按连击（pointer 优先；键盘 Enter/Space 也触发；与原生 click 不双发）
  const holdRef = useRef<number | null>(null);
  const stopHold = () => {
    if (holdRef.current !== null) {
      clearTimeout(holdRef.current);
      clearInterval(holdRef.current);
      holdRef.current = null;
    }
  };
  const startHold = (delta: number) => (_e: ReactPointerEvent) => {
    if (!interactive) return;
    if (holdRef.current !== null) return; // 防触摸 + 合成鼠标双发
    bump(delta);
    holdRef.current = window.setTimeout(() => {
      holdRef.current = window.setInterval(() => bump(delta), 150);
    }, 400);
  };
  const onKeyStep = (delta: number) => (e: ReactKeyboardEvent) => {
    if (!interactive) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); bump(delta); }
  };

  // P1-2：与发布端 fnEdge 同源（解析失败按 0 → 若 min=0 则 dec 禁用），消除 NaN 输入漂移
  const [decDisabled, incDisabled] = (() => {
    const e = fnEdge(val, min, max);
    return [!interactive || e[0], !interactive || e[1]] as const;
  })();
  const btnWidth = placement === "right" ? 32 : 36;
  const btnSx = {
    flexShrink: 0,
    width: `${btnWidth}px`,
    border: "none",
    background: accent,
    color: "#ffffff",
    cursor: interactive ? "pointer" : "default",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    userSelect: "none",
    "&:disabled": { opacity: 0.4, cursor: "default" },
  } as const;

  const icon = (path: string) => (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      <path d={path} />
    </svg>
  );

  // P0-1：隐藏原生数字 spinner（Safari/WKWebView 原生上下箭头与自绘按钮重叠）
  const inputHideSpinner = {
    WebkitAppearance: "none",
    MozAppearance: "textfield",
    "&::-webkit-inner-spin-button": { WebkitAppearance: "none", margin: 0 },
    "&::-webkit-outer-spin-button": { WebkitAppearance: "none", margin: 0 },
  } as const;

  return (
    <FieldShell s={s} focused={focused} hasValue={!!val} error={showError ? error : ""}>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          borderRadius: s.radiusCss,
          overflow: "hidden",
          boxSizing: "border-box",
          background: s.bgColor,
          // 编辑态：交互控件整体点击穿透到外层选中框（外层 <EditorCanvasComponent> 的
          // handleClick→onSelect）。裸禁用 <button> 在浏览器里会吃掉点击、不冒泡，
          // 导致整个数字步进组件在编辑区选不中；统一置 none 与禁用 <input> 的穿透行为对齐
          // （form-date/time 同款裸 input 可正常选中即证）。预览态恢复 auto 以正常交互。
          pointerEvents: isEdit ? "none" : "auto",
        }}
      >
        {placement === "both" && (
          <Box component="button" type="button" aria-label="减少" disabled={decDisabled}
            onPointerDown={startHold(-1)} onPointerUp={stopHold} onPointerLeave={stopHold} onPointerCancel={stopHold}
            onKeyDown={onKeyStep(-1)} sx={btnSx}>
            {icon(FN_MINUS_PATH)}
          </Box>
        )}

        <Box
          component="input"
          type="number"
          value={val}
          min={min ?? undefined}
          max={max ?? undefined}
          step={step}
          inputMode="decimal"
          disabled={s.disabled || isEdit}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setTouched(true);
            const n = Number(val);
            if (Number.isFinite(n) && val !== "") setVal(fnFormat(clamp(n), precision));
          }}
          onChange={(e: ChangeEvent<HTMLInputElement>) => { setTouched(true); setVal(e.target.value); }}
          sx={{
            flex: "1 1 auto",
            minWidth: 0,
            height: "100%",
            border: "none",
            outline: "none",
            textAlign: "center",
            background: s.bgColor,
            color: s.textColor,
            fontFamily: MUI_FONT,
            fontSize: `${s.fontSize}px`,
            fontWeight: s.fontWeight,
            padding: "0 12px",
            "&:disabled": { opacity: 0.6, cursor: "not-allowed" },
            ...inputHideSpinner,
          }}
        />

        {placement === "both" ? (
          <Box component="button" type="button" aria-label="增加" disabled={incDisabled}
            onPointerDown={startHold(1)} onPointerUp={stopHold} onPointerLeave={stopHold} onPointerCancel={stopHold}
            onKeyDown={onKeyStep(1)} sx={btnSx}>
            {icon(FN_PLUS_PATH)}
          </Box>
        ) : (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              flexShrink: 0,
              borderLeft: `${s.borderWidth}px solid ${s.borderColor}`,
            }}
          >
            <Box
              component="button"
              type="button"
              aria-label="增加"
              disabled={incDisabled}
              onPointerDown={startHold(1)} onPointerUp={stopHold} onPointerLeave={stopHold} onPointerCancel={stopHold}
              onKeyDown={onKeyStep(1)}
              sx={{ ...btnSx, height: "50%", borderBottom: "1px solid rgba(0,0,0,.12)" }}
            >
              {icon(FN_PLUS_PATH)}
            </Box>
            <Box
              component="button"
              type="button"
              aria-label="减少"
              disabled={decDisabled}
              onPointerDown={startHold(-1)} onPointerUp={stopHold} onPointerLeave={stopHold} onPointerCancel={stopHold}
              onKeyDown={onKeyStep(-1)}
              sx={{ ...btnSx, height: "50%" }}
            >
              {icon(FN_MINUS_PATH)}
            </Box>
          </Box>
        )}
      </Box>
    </FieldShell>
  );
}
