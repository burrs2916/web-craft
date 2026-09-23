import { useMemo } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { resolveLabelStyle, labelTextCss, labelInnerCss } from "../data/labelStyle";
import { MUI_FONT } from "../data/fieldStyle";
import { useBoxSize } from "../hooks/useBoxSize";
import { fitFactor, scaleStageCss, scaleInnerBaseCss, LABEL_FIT } from "../data/scaleFit";
import { useApiDataFetch } from "../hooks/useApiDataFetch";
import { useEditorStore } from "../../store/editorStore";
import { resolveEffectiveDataConfig } from "../../shared/resolveDataConfig";
import { digApiField } from "../../shared/apiFieldValue";
import { readAuthEnabled } from "../data/authMode";

/**
 * 表单标签（编辑区画布）
 *
 * 样式口径**全部**来自 `resolveLabelStyle`（与发布端 codegen 同一份），渲染器内不写任何
 * 字面量——此前用 MUI `<Typography>`（默认 `body1`：行高 1.5 / 字间距 0.15px）而发布端写死
 * `1.4375`，导致编辑区与发布页渲染不一致。改用无排版预设的 `span`，两端同源。
 *
 * 文案为空串时保持为空（可被用户清空），不回退默认文案。
 *
 * ── 三层缩放骨架（与 icon 族 / 评分同一结构） ──
 * DOM：外形(实测尺寸) → 缩放舞台(100%·按 align/vAlign 摆放) → 缩放内层(自然尺寸·transform)
 * 中间两层是「居中显示 + 随拖动框等比缩放」的载体：舞台负责实测与摆放，内层保持自然尺寸
 * 只被 `transform: scale()` 缩放，不触发重排，拖动框连续改尺寸也不掉帧。
 * 发布端 `codegen/scaleFit.ts` 的 `scaleFitStage` / `scaleFitScript` 生成同样两层，
 * 缩放系数两端共用 `fitFactor` + `LABEL_FIT`，故"编辑区所见 = 发布所得"。
 *
 * ── 外观层（本轮新增）──
 * 背景色 / 内边距 / 圆角 / 不透明度挂在**缩放内层**（内容盒）上，因此会跟着内容一起
 * 随拖动框等比缩放；挂到外层就会出现「框放大、标签底色纹丝不动」的割裂观感。
 *
 * ── 动态文案（本轮新增）──
 * `dataMode=api` 时走统一 `useApiDataFetch`（与发布端 `dataLoaderScript` 是同一套取数骨架），
 * 按 `apiTextField` 从响应里取文字；数据到达前显示静态文案占位，与发布端首屏一致。
 * `authEnabled` 三态即「认证 / 非认证」两种接入方式的切换点（null = 跟随站点全局配置）。
 */
export function FormLabelRenderer({ config, width, height }: ComponentRendererProps) {
  const scaleFit = config.scaleFit !== false;

  // ── 数据源：绑定全局源时以全局源覆盖组件自带取数配置（与发布端同一函数） ──
  const dataSources = useEditorStore((st) => st.dataSources);
  const dsId = String(config.dataSourceId ?? "");
  const boundSource = dsId ? dataSources.find((d) => d.id === dsId) : undefined;
  const effApi = resolveEffectiveDataConfig(config, boundSource);
  const isApi =
    String(effApi.dataMode ?? "static") === "api" &&
    Boolean(dsId || String(effApi.apiUrl ?? "") || String(effApi.apiPath ?? ""));
  const authEnabledCfg = readAuthEnabled(config.authEnabled);

  const { data: apiRaw } = useApiDataFetch({
    dataMode: isApi ? "api" : "static",
    apiUrl: String(effApi.apiUrl ?? ""),
    apiPath: String(effApi.apiPath ?? ""),
    apiMethod: String(effApi.apiMethod ?? "GET") as "GET" | "POST",
    apiBody: effApi.apiBody,
    apiHeaders: effApi.apiHeaders,
    apiInterval: Number(effApi.apiInterval ?? 0) || 0,
    apiDataPath: String(effApi.apiDataPath ?? ""),
    authEnabled: authEnabledCfg,
    dataSourceId: dsId,
  });

  const apiTextField = String(effApi.apiTextField ?? config.apiTextField ?? "");
  const apiText = useMemo(
    () => (isApi && apiRaw != null ? digApiField(apiRaw, apiTextField, ["text", "label", "name", "value", "title"]) : ""),
    [isApi, apiRaw, apiTextField],
  );

  // 数据未到达时用静态文案占位（发布端首屏同样输出静态文案，脚本到达后替换）
  const s = useMemo(
    () => resolveLabelStyle(isApi && apiText ? { ...config, text: apiText } : config),
    [config, isApi, apiText],
  );

  // 实测外形尺寸 → 等比缩放（发布端脚本读的也是这一层，两端同源）
  const box = useBoxSize({
    w: typeof width === "number" ? width : 0,
    h: typeof height === "number" ? height : 0,
  });
  const factor = scaleFit ? fitFactor(box.w, box.h, LABEL_FIT) : 1;

  return (
    <Box
      ref={box.ref}
      data-wc-label-outer="1"
      sx={{
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        // 与发布端同一字体栈：文本宽度会直接影响等比缩放基准，字体分叉必然两端不一致
        fontFamily: MUI_FONT,
      }}
    >
      <Box data-wc-label-stage="1" sx={scaleStageCss(s.align, s.vAlign)}>
        <Box
          data-wc-label-inner="1"
          sx={{
            ...scaleInnerBaseCss(),
            ...labelInnerCss(s),
            ...(scaleFit ? { transform: `scale(${factor})` } : null),
          }}
        >
          {/* 声明取自 labelTextCss（与发布端同一份）；userSelect 仅编辑区需要（避免拖动时选中文字） */}
          <Box component="span" sx={{ ...labelTextCss(s), userSelect: "none" }}>
            <span data-wc-label-text="1">{s.text}</span>
            {s.suffix ? <span data-wc-label-suffix="1">{s.suffix}</span> : null}
            {s.required && <span style={{ color: s.errorColor, marginLeft: "2px" }}>*</span>}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
