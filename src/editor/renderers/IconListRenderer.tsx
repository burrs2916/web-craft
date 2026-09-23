import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { useApiDataFetch } from "../hooks/useApiDataFetch";
import { useBoxSize } from "../hooks/useBoxSize";
import { resolveIcon } from "../plugins/IconResolver";
import { fitFactor, scaleInnerBaseCss } from "../data/scaleFit";
import { readAuthEnabled } from "../data/authMode";
import {
  ICON_LIST_FIT,
  DEFAULT_ICON_NAME,
  resolveIconListStyle,
  resolveIconItems,
  iconListOuterCss,
  iconStageCss,
  iconListInnerCss,
  iconListBodyCss,
  iconListItemCss,
  iconListItemBg,
  iconListLabelCss,
} from "../data/iconStyle";

/**
 * 图标列表（icon-list）编辑区渲染器 —— 与发布端 `codegen/components/iconList.ts` 结构同构。
 *
 * 条目数据三种来源（与其它选项型组件同一优先级）：接口 > 静态数据 > 「条目数据」文本 > 默认占位。
 * 解析统一走 `editor/data/iconStyle.ts` 的 `resolveIconItems`，两端只读这一份。
 *
 * 状态纪律：条目悬浮底色由类规则承载（发布端 `.{uid}-it:hover`、编辑区 `&:hover`），
 * 条目底色是**静态**值所以可以进 inline —— 两者不冲突。
 */
export function IconListRenderer({ config, mode, width, height }: ComponentRendererProps) {
  const isPreview = mode === "preview";
  const s = resolveIconListStyle(config);
  const scaleFit = config.scaleFit !== false;

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
  const items = resolveIconItems({ config, fetched: isApi ? fetched : undefined });

  const box = useBoxSize({ w: typeof width === "number" ? width : 0, h: typeof height === "number" ? height : 0 });
  const factor = scaleFit ? fitFactor(box.w, box.h, ICON_LIST_FIT) : 1;

  return (
    <Box ref={box.ref} data-icon-list-outer="1" sx={iconListOuterCss()}>
      <Box sx={iconStageCss(s.align)}>
        <Box
          data-icon-list-inner="1"
          sx={{
            ...scaleInnerBaseCss(),
            ...iconListInnerCss(),
            ...(scaleFit ? { transform: `scale(${factor})` } : {}),
          }}
        >
          <Box data-icon-list-body="1" sx={iconListBodyCss(s)}>
            {items.map((item, i) => (
              <Box
                key={`${item.label}-${i}`}
                component="span"
                data-icon-list-item="1"
                sx={{
                  ...iconListItemCss(s),
                  // 底色是悬浮态的切换目标 —— 在 MUI sx 里它是**类规则**（不是 inline），
                  // 所以下面的 `&:hover` 能正常覆盖它，与发布端 `.{uid}-it:hover` 行为一致。
                  backgroundColor: iconListItemBg(s),
                  ...(isPreview ? { "&:hover": { backgroundColor: s.hoverBgColor } } : {}),
                }}
              >
                <Box
                  component="span"
                  sx={{ display: "inline-flex", color: s.iconColor || "inherit", lineHeight: 0 }}
                >
                  {resolveIcon(item.icon, DEFAULT_ICON_NAME, s.iconSize)}
                </Box>
                {item.label ? (
                  <Box component="span" sx={iconListLabelCss(s)}>
                    {item.label}
                  </Box>
                ) : null}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
