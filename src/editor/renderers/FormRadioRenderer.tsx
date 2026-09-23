import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import type { ComponentRendererProps } from "../../types/editor";
import { resolveIcon } from "../plugins";
import { MUI_FONT } from "../data/fieldStyle";
import { useBoxSize } from "../hooks/useBoxSize";
import { useFormChoiceOptions } from "../hooks/useFormChoiceOptions";
import { fitFactor, scaleStageCss, scaleInnerBaseCss, RADIO_FIT, stageAlignOf, stageVAlignOf } from "../data/scaleFit";

/**
 * 单选组（编辑区画布）
 *
 * - 选项：静态走 items 条目（显示名/提交值/图标，兼容旧 options 文本），接口模式由响应驱动；
 *   两种模式共用 `useFormChoiceOptions`（与发布端 dataLoader + parseApiOptionItems 同源），
 *   使「编辑区所见 = 发布所得」，含认证/非认证两种接入方式（authEnabled 三态原样透传）。
 * - 受控渲染：RadioGroup 的 `defaultValue` 属非受控，配置改「默认选中索引」不会重挂载 → 画布不更新；
 *   这里用 useState + useEffect 同步（与 FormInputRenderer/FormCheckboxRenderer 同范式）
 * - 校验：仅必填有意义（取值为预设枚举），规则与发布端 __WCVALIDATE 同源
 *
 * ── 三层缩放骨架（本轮新增） ──
 * 外形(实测) → 缩放舞台(100%·按 align/vAlign 摆放) → 缩放内层(自然尺寸·transform:scale)，
 * 与图标族/标签/复选框/开关/评分同一结构；系数与发布端共用 `fitFactor` + `RADIO_FIT`。
 * 组标签用 `<label>`（与发布端同元素语义：发布端 __WCVALIDATE 出错时要 querySelector('label') 染色）。
 */
export function FormRadioRenderer({ config, mode, width, height }: ComponentRendererProps) {
  const label = (config.label as string) ?? "";
  const selectedIndex = Number(config.selectedIndex ?? 0) || 0;
  const disabled = (config.disabled as boolean) ?? false;
  const textColor = (config.textColor as string) || "#333333";
  const accentColor = (config.accentColor as string) || "#1976d2";
  const fontSize = (config.fontSize as number) || 14;
  const direction = (config.direction as string) || "vertical";
  const labelPlacement = (config.labelPlacement as string) || "top";
  const size = (config.size as string) || "small";
  const required = config.required === true;
  const helperText = (config.helperText as string) ?? "";
  const errColor = (config.errorColor as string) || "#f44336";
  const isEdit = mode === "edit";

  // 舞台摆放与发布端同源（此前写死 "left"，与发布端的 center 分叉）
  const align = stageAlignOf(config as Record<string, unknown>);
  const vAlign = stageVAlignOf(config as Record<string, unknown>);
  const scaleFit = config.scaleFit !== false;

  // 选项：静态 items / 接口响应（含认证三态 + 全局数据源绑定）统一口径
  const { items } = useFormChoiceOptions(config as Record<string, unknown>);

  const defaultValue = items[selectedIndex]?.value ?? "";
  const [value, setValue] = useState(defaultValue);
  const [touched, setTouched] = useState(false);
  // 编辑面板改「默认选中索引」/ 接口数据到达时同步画布，使变更即时可见
  useEffect(() => { setValue(defaultValue); }, [defaultValue]);

  // 必填空值错误：交互/失焦后才提示（与 form-input/form-checkbox 编辑器策略一致）
  const error = required && !value ? (String(config.validateMessage ?? "").trim() || "此项为必填项") : "";
  const showError = !!error && touched;
  const hint = showError ? error : helperText;
  const hintColor = showError ? errColor : "#8a8f98";
  const topLabel = labelPlacement !== "left";

  const box = useBoxSize({
    w: typeof width === "number" ? width : 0,
    h: typeof height === "number" ? height : 0,
  });
  const factor = scaleFit ? fitFactor(box.w, box.h, RADIO_FIT) : 1;

  const labelNode = label ? (
    <Box
      component="label"
      sx={{
        color: textColor,
        fontSize,
        lineHeight: 1.4375,
        marginBottom: topLabel ? "4px" : 0,
        marginRight: topLabel ? 0 : "12px",
        flexShrink: 0,
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
    >
      {required ? `${label} *` : label}
    </Box>
  ) : null;

  return (
    <Box
      ref={box.ref}
      data-wc-radio-outer="1"
      sx={{
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        fontFamily: MUI_FONT,
      }}
    >
      <Box data-wc-radio-stage="1" sx={scaleStageCss(align, vAlign)}>
        <Box
          data-wc-radio-inner="1"
          sx={{
            ...scaleInnerBaseCss(),
            ...(scaleFit ? { transform: `scale(${factor})` } : null),
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
          }}
        >
          <Box
            sx={{
              display: "flex",
              flexDirection: topLabel ? "column" : "row",
              alignItems: topLabel ? "stretch" : "flex-start",
            }}
          >
            {labelNode}
            <RadioGroup
              value={value}
              onChange={(e) => { setTouched(true); setValue(e.target.value); }}
              sx={{
                flexDirection: direction === "horizontal" ? "row" : "column",
                gap: direction === "horizontal" ? 1 : 0.25,
              }}
            >
              {items.map((item, i) => (
                <FormControlLabel
                  key={`${item.value}-${i}`}
                  value={item.value}
                  control={
                    <Radio
                      disabled={disabled || isEdit}
                      size={size === "medium" ? "medium" : "small"}
                      sx={{
                        color: showError ? errColor : accentColor,
                        "&.Mui-checked": { color: showError ? errColor : accentColor },
                      }}
                    />
                  }
                  label={
                    item.icon ? (
                      <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        {resolveIcon(item.icon, undefined, 16)}
                        <span>{item.label}</span>
                      </Box>
                    ) : (
                      item.label
                    )
                  }
                  sx={{
                    margin: 0,
                    "& .MuiFormControlLabel-label": {
                      color: showError ? errColor : textColor,
                      fontSize,
                      whiteSpace: "nowrap",
                    },
                  }}
                />
              ))}
            </RadioGroup>
          </Box>
          {hint ? (
            <Box
              component="span"
              sx={{ fontSize: 12, lineHeight: 1.4, mt: "3px", color: hintColor, userSelect: "none" }}
            >
              {hint}
            </Box>
          ) : null}
        </Box>
      </Box>
    </Box>
  );
}
