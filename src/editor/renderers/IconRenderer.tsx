import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { useApiDataFetch } from "../hooks/useApiDataFetch";
import { useBoxSize } from "../hooks/useBoxSize";
import { resolveIcon } from "../plugins/IconResolver";
import { fitFactor, scaleInnerBaseCss } from "../data/scaleFit";
import { readAuthEnabled } from "../data/authMode";
import {
  ICON_FIT,
  DEFAULT_ICON_NAME,
  normalizeIconItems,
  normalizeIconRef,
  resolveIconStyle,
  iconOuterCss,
  iconStageCss,
  iconInnerCss,
  iconRotCss,
  iconFaceCss,
  iconLabelCss,
  iconStaticTransform,
  iconHoverTransform,
} from "../data/iconStyle";

/**
 * 单图标（icon）编辑区渲染器 —— 与发布端 `codegen/components/icon.ts` 结构同构。
 *
 * DOM：容器 → 缩放舞台 → 缩放内层 →〔旋转变换层 → 图标面色层〕+〔说明文字〕
 * 中间多出的「舞台 / 内层」两层是「随拖动框等比缩放」的载体：舞台负责实测尺寸与对齐，
 * 内层保持自然尺寸只被 transform 缩放（不触发重排，拖动框连续改尺寸也不掉帧）。
 * 发布端 `scaleFitStage` 生成同样的两层，两端系数共用 `fitFactor`。
 *
 * 状态纪律：静态旋转/翻转写在旋转变换层（恒定值）；**悬浮放大与持续旋转只由类规则承载**
 * （编辑区用 sx 的 `&:hover` 派生规则，发布端用 `.{uid}-rot:hover`），绝不写 inline。
 */
export function IconRenderer({ config, mode, width, height }: ComponentRendererProps) {
  const isPreview = mode === "preview";
  const s = resolveIconStyle(config, { size: 32, layout: "horizontal" });
  const scaleFit = config.scaleFit !== false;

  // ── 接口动态图标（与发布端同一套取数骨架 + 认证三态 + 全局数据源绑定） ──
  const dataMode = (config.dataMode as string) || "static";
  const isApi = dataMode === "api";
  const { data: fetched } = useApiDataFetch<unknown>({
    dataMode: isApi ? "api" : "static",
    staticData: config.staticData != null && config.staticData !== "" ? config.staticData : undefined,
    apiPath: (config.apiPath as string) || "",
    apiUrl: (config.apiUrl as string) || "",
    apiMethod: ((config.apiMethod as string) || "GET") as "GET" | "POST",
    apiBody: config.apiBody,
    apiHeaders: config.apiHeaders,
    apiInterval: (config.apiInterval as number) ?? 0,
    apiDataPath: (config.apiDataPath as string) || "",
    authEnabled: readAuthEnabled(config.authEnabled),
    dataSourceId: (config.dataSourceId as string) || "",
  });
  const apiItems = isApi ? normalizeIconItems(fetched) : [];
  const iconRef = apiItems.length > 0 ? normalizeIconRef(apiItems[0].icon) : normalizeIconRef(config.icon);
  const labelFromApi = apiItems.length > 0 ? (apiItems[0].label ?? "") : "";
  const label = labelFromApi || String(config.label ?? "");

  // ── 随拖动框等比缩放（与发布端 scaleFitScript 同一公式） ──
  const box = useBoxSize({ w: typeof width === "number" ? width : 0, h: typeof height === "number" ? height : 0 });
  const factor = scaleFit ? fitFactor(box.w, box.h, ICON_FIT) : 1;

  // 静态/悬浮 transform 都取自 iconStyle 的同一对函数（发布端类规则读同一对取值）
  const staticTf = iconStaticTransform(s);
  const hoverTf = iconHoverTransform(s);

  const face = (
    <Box
      component="span"
      data-icon-face="1"
      sx={{
        ...iconFaceCss(s),
        ...(s.spin
          ? {
              animation: `wcIconSpin ${s.spinDuration}s linear infinite`,
              "@keyframes wcIconSpin": {
                from: { transform: "rotate(0deg)" },
                to: { transform: "rotate(360deg)" },
              },
            }
          : {}),
      }}
    >
      {resolveIcon(iconRef, DEFAULT_ICON_NAME, s.size)}
    </Box>
  );

  const rot = (
    <Box
      component="span"
      data-icon-rot="1"
      sx={{
        ...iconRotCss(s),
        // 静态 rotate/flip 与悬浮放大**同处类规则层**（MUI sx 编译成类规则，不是 inline），
        // 所以 `&:hover` 的高特异性可以正常覆盖它 —— 与发布端 `.{uid}-rot` / `.{uid}-rot:hover`
        // 这对类规则完全等价。若把静态 transform 写进 inline，悬浮放大将永远失效。
        ...(staticTf ? { transform: staticTf } : {}),
        ...(s.hoverScale > 1 && isPreview ? { "&:hover": { transform: hoverTf } } : {}),
      }}
    >
      {face}
    </Box>
  );

  return (
    <Box ref={box.ref} data-icon-outer="1" sx={{ ...iconOuterCss(), /* 配了跳转链接时提示可点击（发布端包装为 <a>） */ ...(s.href ? { cursor: "pointer" } : null) }}>
      <Box sx={iconStageCss(s.align)}>
        <Box
          data-icon-inner="1"
          sx={{
            ...scaleInnerBaseCss(),
            ...iconInnerCss(s),
            ...(scaleFit ? { transform: `scale(${factor})` } : {}),
          }}
        >
          {rot}
          {label ? (
            <Box component="span" data-icon-label="1" sx={iconLabelCss(s)}>
              {label}
            </Box>
          ) : null}
        </Box>
      </Box>
    </Box>
  );
}
