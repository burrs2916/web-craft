import { Fragment, useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Slider from "@mui/material/Slider";
import type { ComponentRendererProps } from "../../types/editor";
import { MUI_FONT } from "../data/fieldStyle";
import { fieldScaleFactor } from "../data/scaleFit";
import { useApiDataFetch } from "../hooks/useApiDataFetch";
import { useDataSourceBinding } from "../../hooks/useDataSourceBinding";
import { readAuthEnabled } from "../data/authMode";
import { coerceProgressNumber } from "../data/progressData";
import {
  resolveSliderStyle,
  sliderLabelRowCss,
  sliderLabelCss,
  sliderValueCss,
  sliderRowCss,
  sliderEndpointCss,
  sliderBubbleCss,
  sliderValueText,
  sliderTicksOf,
  sliderTickLayerCss,
  sliderTickCss,
  sliderTickLabelCss,
  sliderTickLabelText,
  SLIDER_PRESS_TRANSITION,
  sliderPressCssOf,
} from "../data/sliderStyle";

/**
 * 滑块（编辑区画布）
 *
 * - **样式全部读 `resolveSliderStyle`**（与发布端 codegen 同一份）。旧实现自己在渲染器里
 *   写 `#333333` / `14` / `#8a8f98`，并另抄了一份 `SLIDER_SIZES`，与发布端的
 *   `resolveFieldStyle` + 尺寸表是两套来源——一致性只能靠人眼维持。现在两端只读一份。
 * - **受控**：原实现用 MUI 默认的非受控语义 + 局部 state，面板改「默认值」画布不刷新；
 *   这里改为 useState + useEffect 同步（与 FormInputRenderer / FormCheckboxRenderer 同范式）。
 * - 取值经 min/max 收敛（`resolveSliderStyle` 内完成），避免面板填入越界值时两端显示不同。
 * - 滑块取值恒为数值且区间已由 min/max 约束，故不提供必填/格式校验（会配出恒真或恒假的规则），
 *   与发布端一致。
 * - **动态数据**（第 12 轮，与 metric/progress/switch 同一套键与语义）：api 轮询/数据源绑定
 *   回读真实值（coerceProgressNumber 收敛，越界夹紧），回不到明确数值时回退静态默认值——
 *   滑块没有 "--" 语义，不能闪 0。
 * - **文字随框缩放**（第 12 轮，FIELD_FITS 纳入）：只乘 fontSize/labelFontSize，不碰几何。
 */
export function FormSliderRenderer({ config, mode, width, height, componentId }: ComponentRendererProps) {
  const s0 = resolveSliderStyle(config);
  const isEdit = mode === "edit";

  // ── 动态数据（与 metric/progress/switch 同一套键与语义）──
  const dataMode = (config.dataMode as string) ?? "static";
  const dataSourceId = (config.dataSourceId as string) ?? "";
  const field = (config.field as string) ?? "";
  const hasExplicitStaticData = config.staticData != null && config.staticData !== "";
  const { componentData } = useDataSourceBinding(
    componentId,
    dataMode === "datasource" && dataSourceId ? [dataSourceId] : undefined,
  );
  const { data: fetchedData } = useApiDataFetch<string | number>({
    dataMode: dataMode === "api" ? "api" : "static",
    staticData: hasExplicitStaticData ? config.staticData : s0.value,
    apiPath: "",
    apiUrl: (config.apiUrl as string) || "",
    apiMethod: ((config.apiMethod as string) || "GET") as "GET" | "POST",
    apiBody: config.apiBody,
    apiHeaders: config.apiHeaders,
    apiInterval: (config.apiInterval as number) ?? 0,
    apiDataPath: (config.apiDataPath as string) || "",
    authEnabled: readAuthEnabled(config.authEnabled),
  });

  // 有效值：取数结果经口径收敛（数字/数字串/对象 {value|percent|current}）并夹进 [min,max]；
  // 失败/空值/NaN 一律回退静态默认值 —— 滑块没有 "--" 语义，不能闪 0。
  // 按 step 量化与发布端 update 同口径（api 返回 72.5 而 step=1 时显示与提交值对齐）。
  const clamp = (n: number) => {
    let v = Math.min(s0.max, Math.max(s0.min, n));
    if (s0.step > 0) { v = s0.min + Math.round((v - s0.min) / s0.step) * s0.step; v = Number(v.toFixed(6)); }
    return v;
  };
  const effectiveValue = (() => {
    const n = coerceProgressNumber(fetchedData);
    if (n !== null) return clamp(n);
    if (dataMode === "datasource" && dataSourceId) {
      const bound = componentData[dataSourceId] as Record<string, unknown> | undefined;
      const v = field ? bound?.[field] : bound?.value;
      const dn = coerceProgressNumber(v);
      if (dn !== null) return clamp(dn);
    }
    return s0.value;
  })();

  const [value, setValue] = useState(effectiveValue);
  // 拖动竞态守卫：用户拖动中跳过回读（否则轮询把柄从手里拽走），松手后下一次轮询自动校正。
  // 与发布端 update 的 dragging 守卫同一语义（pointerdown 起、pointerup/onChangeCommitted 止）。
  const draggingRef = useRef(false);
  // 面板改「默认值 / 区间」或回读到达时同步画布
  useEffect(() => {
    if (draggingRef.current) return;
    setValue(effectiveValue);
  }, [effectiveValue]);

  // 字段型「文字随框缩放」：与发布端同源（props 尺寸 = transform 尺寸），关/未传恒 1 零回归
  const fitF = fieldScaleFactor(
    "form-slider",
    typeof width === "number" ? width : 0,
    typeof height === "number" ? height : 0,
    config.scaleFit === true,
  );
  const s = {
    ...s0,
    field: { ...s0.field, fontSize: s0.field.fontSize * fitF },
    labelFontSize: s0.labelFontSize * fitF,
  };

  const label = s.field.label;
  const pct = s.max > s.min ? ((value - s.min) / (s.max - s.min)) * 100 : 0;

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        fontFamily: MUI_FONT,
        fontSize: `${s.field.fontSize}px`,
        color: s.field.textColor,
      }}
    >
      {(label || s.showValue) && (
        <Box sx={sliderLabelRowCss()}>
          <Box component="span" data-wc-slider-label="1" sx={sliderLabelCss(s)}>
            {label}
            {s.field.required ? " *" : ""}
          </Box>
          {s.showValue && (
            <Box component="span" data-wc-slider-value="1" sx={sliderValueCss(s)}>
              {sliderValueText(s, value)}
            </Box>
          )}
        </Box>
      )}

      <Box sx={sliderRowCss(s)}>
        {/* 数值气泡：与填充条/滑块同一百分比位置，拖动时实时跟随 */}
        {s.valueBubble && (
          <Box component="span" data-wc-slider-bubble="1" sx={sliderBubbleCss(s, pct)}>
            {sliderValueText(s, value)}
          </Box>
        )}

        {/* 刻度层：绝对定位铺满轨道行，不吃指针事件（下层是 MUI 的滑块交互层）；
            数值标注（showTickLabels）与刻度同一百分比原点，挂在刻度线下方 */}
        {s.showTicks && (
          <Box data-wc-slider-ticks="1" sx={sliderTickLayerCss(s)}>
            {sliderTicksOf(s).map((p, i) => (
              <Fragment key={i}>
                <Box data-wc-slider-tick={String(i)} sx={sliderTickCss(s, p)} />
                {s.showTickLabels && (
                  <Box data-wc-slider-tick-label={String(i)} sx={sliderTickLabelCss(s, p)}>
                    {sliderTickLabelText(s, p)}
                  </Box>
                )}
              </Fragment>
            ))}
          </Box>
        )}

        <Slider
          value={value}
          min={s.min}
          max={s.max}
          step={s.step}
          disabled={s.field.disabled || isEdit}
          onChange={(_, v) => { if (!isEdit) setValue(v as number); }}
          onPointerDown={() => { draggingRef.current = true; }}
          onChangeCommitted={() => { draggingRef.current = false; }}
          sx={{
            color: s.accent,
            padding: "0",
            height: `${s.size.thumb}px`,
            "& .MuiSlider-rail": { height: `${s.size.track}px`, opacity: 0.38, backgroundColor: s.accent },
            "& .MuiSlider-track": { height: `${s.size.fill}px`, border: "none", backgroundColor: s.accent },
            "& .MuiSlider-thumb": {
              width: `${s.size.thumb}px`,
              height: `${s.size.thumb}px`,
              backgroundColor: s.accent,
              // 按压反馈与发布端同源同值（sliderStyle.ts#sliderPressCssOf + SLIDER_PRESS_TRANSITION）
              transition: SLIDER_PRESS_TRANSITION,
              "&:hover, &.Mui-focusVisible": { boxShadow: `0 0 0 6px ${s.accent}22` },
              "&:active, &.Mui-active": sliderPressCssOf(s),
            },
          }}
        />
      </Box>

      {s.showMinMax && (
        <Box component="span" data-wc-slider-endpoints="1" sx={sliderEndpointCss()}>
          <span>{s.min}</span>
          <span>{s.max}</span>
        </Box>
      )}

      {s.field.helperText ? (
        <Box
          component="span"
          sx={{
            fontSize: "12px",
            lineHeight: 1.4,
            marginTop: "3px",
            color: s.field.helperColor,
            userSelect: "none",
          }}
        >
          {s.field.helperText}
        </Box>
      ) : null}
    </Box>
  );
}
