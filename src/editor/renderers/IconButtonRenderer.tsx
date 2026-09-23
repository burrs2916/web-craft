import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { useApiDataFetch } from "../hooks/useApiDataFetch";
import { useBoxSize } from "../hooks/useBoxSize";
import { resolveIcon } from "../plugins/IconResolver";
import { fitFactor, scaleInnerBaseCss } from "../data/scaleFit";
import { readAuthEnabled } from "../data/authMode";
import {
  ICON_BUTTON_FIT,
  DEFAULT_ICON_NAME,
  normalizeIconItems,
  normalizeIconRef,
  resolveIconButtonStyle,
  iconButtonOuterCss,
  iconStageCss,
  scaleInnerCss,
  iconButtonCss,
  iconButtonBg,
} from "../data/iconStyle";

/**
 * 图标按钮（icon-button）编辑区渲染器 —— 与发布端 `codegen/components/iconButton.ts` 结构同构。
 *
 * DOM：容器 → 缩放舞台 → 缩放内层 → 按钮本体（`<a>` 或 `<div>`）
 * 「内层」这一层是必须的：发布端 `scaleFitScript` 把 `scale(f)` 写进内层的 **inline** transform，
 * 而悬浮放大的 transform 只能由类规则给 —— inline 恒胜过类规则，同层就永远压不动。
 *
 * 形态（variant）：实心 = 主题色底 + 白字；描边 = 透明底 + 主题色描边与文字；文字 = 纯文字。
 * 悬浮底色由类规则承载（发布端 `.{uid}:hover`、编辑区 `&:hover`），不在 inline 里写死。
 */
export function IconButtonRenderer({ config, mode, width, height }: ComponentRendererProps) {
  const isPreview = mode === "preview";
  const s = resolveIconButtonStyle(config);
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
  const apiItems = isApi ? normalizeIconItems(fetched) : [];
  const iconRef = apiItems.length > 0 ? normalizeIconRef(apiItems[0].icon) : normalizeIconRef(config.icon);
  const text = (apiItems.length > 0 ? apiItems[0].label : "") || String(config.text ?? "");

  const box = useBoxSize({ w: typeof width === "number" ? width : 0, h: typeof height === "number" ? height : 0 });
  const factor = scaleFit ? fitFactor(box.w, box.h, ICON_BUTTON_FIT) : 1;

  const isLink = !!s.href && !s.disabled;

  const content = (
    <>
      {resolveIcon(iconRef, DEFAULT_ICON_NAME, s.iconSize)}
      {text ? <Box component="span" sx={{ lineHeight: 1 }}>{text}</Box> : null}
    </>
  );

  return (
    <Box ref={box.ref} data-icon-button-outer="1" sx={iconButtonOuterCss()}>
      <Box sx={iconStageCss(s.align)}>
        <Box
          data-icon-button-inner="1"
          sx={{
            ...scaleInnerBaseCss(),
            ...scaleInnerCss(),
            ...(scaleFit ? { transform: `scale(${factor})` } : {}),
          }}
        >
          <Box
            component={isLink ? "a" : "div"}
            {...(isLink ? { href: s.href, target: s.linkTarget } : {})}
            data-icon-button="1"
            data-disabled={s.disabled ? "1" : undefined}
            onClick={(e: React.MouseEvent) => {
              if (isLink) e.preventDefault();
            }}
            sx={{
              ...iconButtonCss(s),
              // 底色是悬浮态的切换目标 —— 在 MUI sx 里它是**类规则**（不是 inline），
              // 所以下面的 `&:hover` 能正常覆盖它，与发布端 `.{uid}:hover` 行为一致。
              backgroundColor: iconButtonBg(s),
              // 图标颜色留空 → 跟随按钮文字色
              "& svg": { color: s.iconColor || "inherit" },
              "& > span": { color: s.iconColor || "inherit" },
              ...(isPreview && !s.disabled
                ? {
                    "&:hover": {
                      backgroundColor: s.hoverBgColor,
                      ...(s.hoverScale > 1 ? { transform: `scale(${s.hoverScale})` } : {}),
                    },
                  }
                : {}),
            }}
          >
            {content}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
