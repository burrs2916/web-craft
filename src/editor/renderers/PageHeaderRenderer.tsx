import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ComponentRendererProps } from "../../types/editor";
import { resolveIcon } from "../plugins/IconResolver";
import { useApiDataFetch } from "../hooks/useApiDataFetch";
import { readAuthEnabled } from "../data/authMode";

/** 支持点路径（a.b.c）与数组下标（list[0].name）取值 */
function deepGet(source: unknown, path: string | undefined): unknown {
  if (!path) return undefined;
  const keys = String(path).split(".").map((s) => s.trim()).filter(Boolean);
  let cur: unknown = source;
  for (const k of keys) {
    if (cur == null) return undefined;
    const arrMatch = k.match(/^(\w+)\[(\d+)\]$/);
    if (arrMatch && Array.isArray(cur)) {
      cur = cur[Number(arrMatch[2])];
    } else if (typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[k];
    } else {
      return undefined;
    }
  }
  return cur;
}

function toText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

export function PageHeaderRenderer({ config }: ComponentRendererProps) {
  // ── 数据获取（与 steps/timeline/breadcrumb 数据源接入保持一致） ──
  const dataMode = (config.dataMode as string) || "static";
  const hasExplicitStaticData = config.staticData != null && config.staticData !== "";
  const isApi = dataMode === "api" && (String(config.apiUrl ?? "") || String(config.apiPath ?? ""));

  const { data: fetchedData } = useApiDataFetch<unknown>({
    dataMode: isApi ? "api" : "static",
    staticData: hasExplicitStaticData ? config.staticData : undefined,
    apiPath: (config.apiPath as string) || "",
    apiUrl: (config.apiUrl as string) || "",
    apiMethod: ((config.apiMethod as string) || "GET") as "GET" | "POST",
    apiBody: config.apiBody,
    apiHeaders: config.apiHeaders,
    apiInterval: (config.apiInterval as number) ?? 0,
    apiDataPath: (config.apiDataPath as string) || "",
    authEnabled: readAuthEnabled(config.authEnabled),
  });

  const titleField = (config.titleField as string) || "title";
  const subtitleField = (config.subtitleField as string) || "subtitle";
  const useFetched = isApi || hasExplicitStaticData;
  const fetchedTitle = useFetched
    ? deepGet(fetchedData, titleField)
    : undefined;
  const fetchedSubtitle = useFetched
    ? deepGet(fetchedData, subtitleField)
    : undefined;

  const isThumb = config._thumbnail === true;
  const title = toText(fetchedTitle ?? config.title ?? "") || "页面标题";
  const subtitle = toText(fetchedSubtitle ?? config.subtitle ?? "");
  const backText = (config.backText as string) || "返回";
  const showBack = (config.showBack as boolean) ?? true;
  const backIcon = (config.backIcon as string) || "material:arrow_back";
  const backAction = (config.backAction as string) || "back";

  const titleColor = (config.titleColor as string) || "#ffffff";
  const titleFontSize = isThumb ? 13 : ((config.titleFontSize as number) ?? 24);
  const titleFontWeight = (config.titleFontWeight as string) ?? "bold";
  const subtitleColor = (config.subtitleColor as string) || "rgba(255,255,255,0.5)";
  const subtitleFontSize = isThumb ? 11 : ((config.subtitleFontSize as number) ?? 14);
  const backColor = (config.backColor as string) || "rgba(255,255,255,0.5)";
  const backFontSize = isThumb ? 11 : ((config.backFontSize as number) ?? 13);
  const iconColor = (config.iconColor as string) || "rgba(255,255,255,0.5)";
  const iconSize = isThumb ? 14 : ((config.iconSize as number) ?? 18);

  const bgColor = (config.bgColor as string) || "transparent";
  const paddingX = isThumb ? 4 : ((config.paddingX as number) ?? 24);
  const paddingY = isThumb ? 3 : ((config.paddingY as number) ?? 20);
  const borderRadius = isThumb ? 3 : ((config.borderRadius as number) ?? 0);
  const borderEnabled = isThumb ? false : ((config.borderEnabled as boolean) ?? false);
  const borderColor = (config.borderColor as string) || "rgba(255,255,255,0.1)";
  const borderWidth = (config.borderWidth as number) ?? 1;

  const layout = (config.layout as string) ?? "vertical";
  const align = (config.align as string) ?? "left";
  const gap = (config.gap as number) ?? 8;

  const isHorizontal = layout === "horizontal";
  const resolvedBackIcon = showBack ? resolveIcon(backIcon, "arrow_back", iconSize) : null;

  const backClickable = backAction !== "none";
  const backCursor = backClickable ? "pointer" : "default";

  // 横排时主副标题基线对齐；竖排时副标题自然衔接
  const contentColAlign =
    !isHorizontal
      ? "flex-start"
      : align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
  const textAlign = !isHorizontal ? align : undefined;

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        backgroundColor: bgColor,
        borderRadius: `${borderRadius}px`,
        border: borderEnabled ? `${borderWidth}px solid ${borderColor}` : "none",
        padding: `${paddingY}px ${paddingX}px`,
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {showBack && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            marginBottom: isHorizontal ? 0 : "12px",
            ...(isHorizontal ? { marginRight: "16px" } : {}),
            color: backColor,
            cursor: backCursor,
            flexShrink: 0,
            "&:hover": backClickable ? { opacity: 0.8 } : {},
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", color: iconColor, "& svg": { fontSize: `${iconSize}px` } }}>
            {resolvedBackIcon}
          </Box>
          <Typography sx={{ color: backColor, fontSize: `${backFontSize}px`, userSelect: "none" }}>
            {backText}
          </Typography>
        </Box>
      )}

      <Box
        sx={{
          display: "flex",
          flexDirection: isHorizontal ? "row" : "column",
          alignItems: isHorizontal ? "baseline" : contentColAlign,
          justifyContent: isHorizontal ? contentColAlign : "flex-start",
          gap: `${gap}px`,
          flex: 1,
          minHeight: 0,
          textAlign: textAlign as any,
          alignSelf: "stretch",
        }}
      >
        <Typography
          component="span"
          sx={{
            color: titleColor,
            fontSize: `${titleFontSize}px`,
            fontWeight: titleFontWeight,
            lineHeight: 1.3,
            flexShrink: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography
            component="span"
            sx={{
              color: subtitleColor,
              fontSize: `${subtitleFontSize}px`,
              lineHeight: 1.4,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              ...(isHorizontal ? {} : { marginTop: "2px" }),
            }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>
    </Box>
  );
}