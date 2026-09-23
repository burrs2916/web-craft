import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import type { ComponentRendererProps } from "../../types/editor";
import { MUI_FONT } from "../data/fieldStyle";
import { useBoxSize } from "../hooks/useBoxSize";
import { fitFactor, scaleStageCss, scaleInnerBaseCss, CHECKBOX_FIT, stageAlignOf, stageVAlignOf } from "../data/scaleFit";
import {
  resolveToggleShell,
  toggleShellCss,
  toggleLabelTextCss,
  resolveCheckboxUncheckedColor,
} from "../data/toggleStyle";

/**
 * 复选框（编辑区画布）
 *
 * 受控渲染：`defaultChecked` 属非受控属性，配置改「默认勾选」不会重挂载 → 画布不更新；
 * 这里改为 useState + useEffect 同步，与 FormInputRenderer 的受控范式一致（配置变更画布即时可见）。
 * 校验：复选框取值只有「勾选 / 未勾选」，仅必填判定有意义，规则与发布端 __WCVALIDATE 同源。
 *
 * ── 三层缩放骨架（本轮新增，与图标族/标签同构） ──
 * 外形(实测) → 缩放舞台(100%·按 align/vAlign 摆放) → 缩放内层(自然尺寸·transform:scale)。
 * 内容尺寸由文字与控件本身决定，不随拖动框拉伸失真，只等比放大缩小；系数与发布端共用
 * `fitFactor` + `CHECKBOX_FIT`（`codegen/shared/scaleSkeleton.ts` 生成同样的两层）。
 */
export function FormCheckboxRenderer({ config, mode, width, height }: ComponentRendererProps) {
  const label = (config.label as string) ?? "";
  const defaultChecked = (config.checked as boolean) ?? false;
  const disabled = (config.disabled as boolean) ?? false;
  const textColor = (config.textColor as string) || "#333333";
  const accentColor = (config.accentColor as string) || "#1976d2";
  const fontSize = (config.fontSize as number) || 14;
  const size = (config.size as string) || "medium";
  const labelPlacement = (config.labelPlacement as string) || "right";
  const required = config.required === true;
  const indeterminate = config.indeterminate === true;
  const helperText = (config.helperText as string) ?? "";
  const errColor = (config.errorColor as string) || "#f44336";
  const isEdit = mode === "edit";

  // 舞台摆放与发布端同源（此前写死 "left"，与发布端的 center 分叉）
  const align = stageAlignOf(config as Record<string, unknown>);
  const vAlign = stageVAlignOf(config as Record<string, unknown>);
  const scaleFit = config.scaleFit !== false;

  const [checked, setChecked] = useState(defaultChecked);
  const [touched, setTouched] = useState(false);
  // 编辑面板改“默认勾选”时同步画布，使配置变更在画布即时可见
  useEffect(() => { setChecked(defaultChecked); }, [defaultChecked]);

  // 必填空值错误：交互/失焦后才提示（与 FormInputRenderer 的 showError 策略一致）
  const error = required && !checked ? (String(config.validateMessage ?? "").trim() || "此项为必填项") : "";
  const showError = !!error && touched;
  const hint = showError ? error : helperText;
  const hintColor = showError ? errColor : "#8a8f98";

  const box = useBoxSize({
    w: typeof width === "number" ? width : 0,
    h: typeof height === "number" ? height : 0,
  });
  const factor = scaleFit ? fitFactor(box.w, box.h, CHECKBOX_FIT) : 1;
  // 外壳 / 标签字重 / 未选中态颜色读唯一口径 toggleStyle.ts（发布端同源）
  const shell = resolveToggleShell(config);
  const labelWeight = toggleLabelTextCss(shell).fontWeight;
  const uncheckedColor = resolveCheckboxUncheckedColor(config, accentColor);

  return (
    <Box
      ref={box.ref}
      data-wc-checkbox-outer="1"
      sx={{
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        // 与发布端同一字体栈：文本宽度直接影响等比缩放基准
        fontFamily: MUI_FONT,
      }}
    >
      <Box data-wc-checkbox-stage="1" sx={scaleStageCss(align, vAlign)}>
        <Box
          data-wc-checkbox-inner="1"
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
          <FormControlLabel
            control={
              <Checkbox
                checked={checked}
                indeterminate={indeterminate}
                disabled={disabled || isEdit}
                size={size === "small" ? "small" : "medium"}
                onChange={(e) => { setTouched(true); setChecked(e.target.checked); }}
                onBlur={() => setTouched(true)}
                sx={{
                  // 未选中态用独立配色（默认跟随强调色），选中/半选恒用强调色
                  color: showError ? errColor : uncheckedColor,
                  "&.Mui-checked, &.MuiCheckbox-indeterminate": { color: showError ? errColor : accentColor },
                }}
              />
            }
            label={label ? (required ? `${label} *` : label) : ""}
            labelPlacement={labelPlacement === "left" ? "start" : "end"}
            sx={{
              margin: 0,
              "& .MuiFormControlLabel-label": {
                color: showError ? errColor : textColor,
                fontSize,
                lineHeight: 1.5,
                fontWeight: labelWeight,
                whiteSpace: "nowrap",
              },
            }}
          />
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
