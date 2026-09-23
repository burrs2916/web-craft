import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Switch from "@mui/material/Switch";
import type { ComponentRendererProps } from "../../types/editor";
import { MUI_FONT } from "../data/fieldStyle";
import { useBoxSize } from "../hooks/useBoxSize";
import {
  fitFactor, scaleStageCss, scaleInnerBaseCss, SWITCH_FIT, stageAlignOf, stageVAlignOf,
} from "../data/scaleFit";
import {
  resolveToggleShell, toggleShellCss, toggleLabelTextCss, resolveSwitchSkin,
} from "../data/toggleStyle";
import { useApiDataFetch } from "../hooks/useApiDataFetch";
import { readAuthEnabled } from "../data/authMode";
import { coerceSwitchState } from "../data/switchData";
import { validateChoiceField } from "../data/fieldValidate";

/**
 * 开关（基础组件 / 控制型）编辑区画布
 *
 * 与 form-switch 已合并（form-switch 面板隐藏，注册保留供旧场景）：本组件 = IoT
 * 「看状态 + 发命令」+ 可选表单提交——
 *   - interactive 开 = 可点击（发布端乐观翻转 + 派发 change 事件，事件面板可绑 callApi 下发命令）；
 *   - interactive 关 = 只读纯展示；disabled = 禁用态（灰显、不参与提交）；
 *   - dataMode = api 时轮询接口回读真实状态（coerceSwitchState 收敛任意响应），回读结果
 *     优先于本地乐观态 → 乐观翻转后下一次轮询自动校正；
 *   - fieldName 填写 = 参与表单容器提交（布尔值）；required 只在该场景下校验。
 *
 * 视觉与 form-switch 同一口径：MUI Switch + `toggleStyle.ts` 外壳/轨道配色 + 三层缩放骨架
 * （SWITCH_FIT），发布端 codegen/components/switch.ts 复刻同一几何与类规则。
 */
export function SwitchRenderer({ config, mode, width, height }: ComponentRendererProps) {
  const label = (config.label as string) ?? "";
  const defaultChecked = (config.checked as boolean) ?? false;
  const interactive = config.interactive !== false;
  const disabled = config.disabled === true;
  const required = config.required === true;
  const helperText = (config.helperText as string) ?? "";
  const errColor = (config.errorColor as string) || "#f44336";
  const onValue = ((config.onValue as string) ?? "").trim();
  const offValue = ((config.offValue as string) ?? "").trim();
  const textColor = (config.textColor as string) || "#333333";
  const accentColor = (config.accentColor as string) || "#1976d2";
  const fontSize = (config.fontSize as number) || 14;
  const size = (config.size as string) || "medium";
  const labelPlacement = (config.labelPlacement as string) || "right";
  const isEdit = mode === "edit";

  // ── 状态回读（progress 同款键与语义）──
  const dataMode = (config.dataMode as string) ?? "static";
  const { data: fetchedData } = useApiDataFetch<string | number | boolean>({
    dataMode: dataMode === "api" ? "api" : "static",
    staticData: null,
    apiPath: "",
    apiUrl: (config.apiUrl as string) || "",
    apiMethod: ((config.apiMethod as string) || "GET") as "GET" | "POST",
    apiBody: config.apiBody,
    apiHeaders: config.apiHeaders,
    apiInterval: (config.apiInterval as number) ?? 0,
    apiDataPath: (config.apiDataPath as string) || "",
    authEnabled: readAuthEnabled(config.authEnabled),
  });

  // 本地状态 = 乐观翻转载体；回读成功时显示回读值（轮询自动校正乐观态）
  const [on, setOn] = useState(defaultChecked);
  const [touched, setTouched] = useState(false);
  useEffect(() => { setOn(defaultChecked); }, [defaultChecked]);
  const readback = coerceSwitchState(fetchedData, onValue || undefined, offValue || undefined);
  const displayOn = readback !== null ? readback : on;

  // 必填未开启：交互/失焦后才提示（与表单开关的 showError 策略一致）
  const error = validateChoiceField(config, displayOn);
  const showError = !!error && touched;
  const hint = showError ? error : helperText;

  const canToggle = !isEdit && interactive && !disabled;
  const handleToggle = () => { if (canToggle) { setTouched(true); setOn((v) => !v); } };

  // 舞台摆放与发布端同源
  const align = stageAlignOf(config as Record<string, unknown>);
  const vAlign = stageVAlignOf(config as Record<string, unknown>);
  const scaleFit = config.scaleFit !== false;

  const box = useBoxSize({
    w: typeof width === "number" ? width : 0,
    h: typeof height === "number" ? height : 0,
  });
  const factor = scaleFit ? fitFactor(box.w, box.h, SWITCH_FIT) : 1;
  // 外观层 / 轨道配色读唯一口径 toggleStyle.ts（发布端同源，禁止在此另写默认值）
  const shell = resolveToggleShell(config);
  const skin = resolveSwitchSkin(config);
  const labelWeight = toggleLabelTextCss(shell).fontWeight;
  const leftLabel = labelPlacement === "left";
  const small = size === "small";

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
              flexDirection: leftLabel ? "row-reverse" : "row",
              justifyContent: leftLabel ? "flex-end" : "flex-start",
              cursor: canToggle ? "pointer" : "default",
              userSelect: "none",
            }}
          >
            <Switch
              checked={displayOn}
              disabled={!canToggle}
              size={small ? "small" : "medium"}
              onChange={handleToggle}
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
                "& .MuiSwitch-thumb": { backgroundColor: displayOn ? accentColor : skin.thumbOffColor },
                ...(disabled ? { opacity: 0.38 } : null),
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
