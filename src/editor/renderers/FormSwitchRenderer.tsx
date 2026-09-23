import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Switch from "@mui/material/Switch";
import type { ComponentRendererProps } from "../../types/editor";
import { MUI_FONT } from "../data/fieldStyle";
import { validateChoiceField } from "../data/fieldValidate";
import { useBoxSize } from "../hooks/useBoxSize";
import { fitFactor, scaleStageCss, scaleInnerBaseCss, SWITCH_FIT, stageAlignOf, stageVAlignOf } from "../data/scaleFit";
import {
  resolveToggleShell,
  toggleShellCss,
  toggleLabelTextCss,
  resolveSwitchSkin,
} from "../data/toggleStyle";

/**
 * 开关（编辑区画布）
 *
 * 与 FormCheckboxRenderer 同范式：
 * - **受控**：`defaultChecked` 属非受控属性，面板改「默认开启」不会重挂载 → 画布不更新；
 *   这里用 useState + useEffect 同步，配置变更在画布即时可见。
 * - **校验**：开关取值只有「开 / 关」，格式类规则永不成立，故仅做必填判定，
 *   与面板 `choiceValidationSchema`（只暴露错误提示 + 错误颜色）及发布端 `__WCVALIDATE` 同源。
 * - **几何对齐发布端**：尺寸档与发布端同一份数值。
 *
 * ── 三层缩放骨架（本轮新增） ──
 * 外形(实测) → 缩放舞台(100%·按 align/vAlign 摆放) → 缩放内层(自然尺寸·transform:scale)，
 * 与图标族/标签/复选框/评分同一结构；系数与发布端共用 `fitFactor` + `SWITCH_FIT`。
 */
export function FormSwitchRenderer({ config, mode, width, height }: ComponentRendererProps) {
  const label = (config.label as string) ?? "";
  const defaultChecked = (config.checked as boolean) ?? false;
  const disabled = (config.disabled as boolean) ?? false;
  const textColor = (config.textColor as string) || "#333333";
  const accentColor = (config.accentColor as string) || "#1976d2";
  const fontSize = (config.fontSize as number) || 14;
  const size = (config.size as string) || "medium";
  const labelPlacement = (config.labelPlacement as string) || "right";
  const required = config.required === true;
  const helperText = (config.helperText as string) ?? "";
  const errColor = (config.errorColor as string) || "#f44336";
  const isEdit = mode === "edit";

  // 舞台摆放与发布端同源（此前写死 "left"，与发布端的 center 分叉）
  const align = stageAlignOf(config as Record<string, unknown>);
  const vAlign = stageVAlignOf(config as Record<string, unknown>);
  const scaleFit = config.scaleFit !== false;

  const [checked, setChecked] = useState(defaultChecked);
  const [touched, setTouched] = useState(false);
  // 面板改「默认开启」时同步画布
  useEffect(() => { setChecked(defaultChecked); }, [defaultChecked]);

  // 必填未开启：交互/失焦后才提示（与复选框、输入框的 showError 策略一致）
  const error = validateChoiceField(config, checked);
  const showError = !!error && touched;
  const hint = showError ? error : helperText;
  const leftLabel = labelPlacement === "left";
  const small = size === "small";

  const box = useBoxSize({
    w: typeof width === "number" ? width : 0,
    h: typeof height === "number" ? height : 0,
  });
  const factor = scaleFit ? fitFactor(box.w, box.h, SWITCH_FIT) : 1;
  // 外观层 / 轨道配色读唯一口径 toggleStyle.ts（发布端同源，禁止在此另写默认值）
  const shell = resolveToggleShell(config);
  const skin = resolveSwitchSkin(config);
  const labelWeight = toggleLabelTextCss(shell).fontWeight;

  return (
    <Box
      ref={box.ref}
      data-wc-switch-outer="1"
      sx={{
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        fontFamily: MUI_FONT,
      }}
    >
      <Box data-wc-switch-stage="1" sx={scaleStageCss(align, vAlign)}>
        <Box
          data-wc-switch-inner="1"
          sx={{
            ...scaleInnerBaseCss(),
            // 外观层挂在缩放内层 → 随拖动框等比缩放（与发布端 innerStyle 同一份声明）
            ...toggleShellCss(shell),
            ...(scaleFit ? { transform: `scale(${factor})` } : null),
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
          }}
        >
          <Box
            component="label"
            sx={{
              display: "flex",
              alignItems: "center",
              // 标签在左：整行换向并靠左收拢（与发布端 row-reverse + justify-content:flex-end 等价）
              flexDirection: leftLabel ? "row-reverse" : "row",
              justifyContent: leftLabel ? "flex-end" : "flex-start",
              cursor: disabled ? "not-allowed" : "pointer",
              userSelect: "none",
            }}
          >
            <Switch
              checked={checked}
              disabled={disabled || isEdit}
              size={small ? "small" : "medium"}
              onChange={(e) => { setTouched(true); setChecked(e.target.checked); }}
              onBlur={() => setTouched(true)}
              sx={{
                // 关闭态轨道/滑块配色与开启态轨道透明度：与发布端类规则同一批取值
                "& .MuiSwitch-switchBase.Mui-checked": { color: accentColor },
                "& .MuiSwitch-switchBase + .MuiSwitch-track": {
                  backgroundColor: skin.trackOffColor,
                  opacity: skin.trackOffOpacity,
                },
                "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                  backgroundColor: accentColor,
                  opacity: skin.trackOnOpacity,
                },
                "& .MuiSwitch-thumb": { backgroundColor: checked ? accentColor : skin.thumbOffColor },
              }}
            />
            {label && (
              <Box
                component="span"
                sx={{
                  fontSize: `${fontSize}px`,
                  lineHeight: 1.5,
                  fontWeight: labelWeight,
                  color: showError ? errColor : textColor,
                  whiteSpace: "nowrap",
                }}
              >
                {label}
                {required ? " *" : ""}
              </Box>
            )}
          </Box>

          {hint ? (
            <Box
              component="span"
              sx={{
                fontSize: "12px",
                lineHeight: 1.4,
                marginTop: "3px",
                color: showError ? errColor : "#8a8f98",
                userSelect: "none",
              }}
            >
              {hint}
            </Box>
          ) : null}
        </Box>
      </Box>
    </Box>
  );
}
