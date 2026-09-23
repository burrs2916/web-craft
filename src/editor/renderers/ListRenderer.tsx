import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ComponentRendererProps } from "../../types/editor";
import { resolveIcon } from "../plugins/IconResolver";
import { useApiDataFetch } from "../hooks/useApiDataFetch";
import { readAuthEnabled } from "../data/authMode";

interface ListItem {
  text: string;
  subtext: string;
  icon: string;
  avatarUrl: string;
  badge: string;
}

const DEFAULT_ITEMS: ListItem[] = [
  { text: "列表项一", subtext: "", icon: "star", avatarUrl: "", badge: "" },
  { text: "列表项二", subtext: "", icon: "info", avatarUrl: "", badge: "" },
  { text: "列表项三", subtext: "", icon: "check_circle", avatarUrl: "", badge: "" },
];

function parseItems(input: unknown): ListItem[] {
  if (Array.isArray(input) && input.length > 0) {
    return input.map((item, i) => ({
      text: String((item as Record<string, unknown>)?.text ?? (item as Record<string, unknown>)?.title ?? `列表项 ${i + 1}`),
      subtext: String((item as Record<string, unknown>)?.subtext ?? (item as Record<string, unknown>)?.desc ?? ""),
      icon: String((item as Record<string, unknown>)?.icon ?? ""),
      avatarUrl: String((item as Record<string, unknown>)?.avatarUrl ?? (item as Record<string, unknown>)?.avatar ?? ""),
      badge: String((item as Record<string, unknown>)?.badge ?? ""),
    }));
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item: Record<string, unknown>, i: number) => ({
            text: String(item?.text ?? item?.title ?? `列表项 ${i + 1}`),
            subtext: String(item?.subtext ?? item?.desc ?? ""),
            icon: String(item?.icon ?? ""),
            avatarUrl: String(item?.avatarUrl ?? item?.avatar ?? ""),
            badge: String(item?.badge ?? ""),
          }));
        }
        if (Array.isArray(parsed) && parsed.length === 0) {
          return [{ text: "列表项 1", subtext: "", icon: "", avatarUrl: "", badge: "" }];
        }
      } catch {
        // fall through
      }
    }
    // Plain text: one item per line
    const lines = trimmed.split("\n").map((s) => s.trim()).filter(Boolean);
    if (lines.length > 0) {
      return lines.map((text) => ({ text, subtext: "", icon: "", avatarUrl: "", badge: "" }));
    }
  }
  return [...DEFAULT_ITEMS];
}

export function ListRenderer({ config }: ComponentRendererProps) {
  // ── 数据获取 ──
  const dataMode = (config.dataMode as string) || "static";
  const hasExplicitStaticData = config.staticData != null && config.staticData !== "";

  const { data: fetchedData, error: apiError } = useApiDataFetch<unknown>({
    dataMode: dataMode === "api" ? "api" : "static",
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

  // ── 解析列表项 ──
  let items: ListItem[];
  if (dataMode === "api") {
    items = parseItems(fetchedData);
  } else if (hasExplicitStaticData) {
    items = parseItems(fetchedData);
  } else {
    items = parseItems(config.items);
  }

  const layout = (config.layout as string) ?? "vertical";
  const showDivider = (config.showDivider as boolean) ?? true;
  const showIcon = (config.showIcon as boolean) ?? true;
  const itemHeight = (config.itemHeight as number) ?? 48;
  const textColor = (config.textColor as string) ?? "rgba(255,255,255,0.85)";
  const textFontSize = (config.textFontSize as number) ?? 14;
  const textFontWeight = (config.textFontWeight as string) ?? "normal";
  const subtextColor = (config.subtextColor as string) ?? "rgba(255,255,255,0.45)";
  const subtextFontSize = (config.subtextFontSize as number) ?? 12;
  const dividerColor = (config.dividerColor as string) ?? "rgba(255,255,255,0.08)";
  const bgColor = (config.bgColor as string) ?? "transparent";
  const itemBgColor = (config.itemBgColor as string) ?? "transparent";
  const itemHoverColor = (config.itemHoverColor as string) ?? "rgba(255,255,255,0.04)";
  const badgeColor = (config.badgeColor as string) ?? "#FF9800";
  const badgeBgColor = (config.badgeBgColor as string) ?? "rgba(255,152,0,0.15)";
  const borderEnabled = (config.borderEnabled as boolean) ?? false;
  const borderColor = (config.borderColor as string) ?? "rgba(255,255,255,0.1)";
  const borderWidth = (config.borderWidth as number) ?? 1;
  const borderRadius = (config.borderRadius as number) ?? 6;
  const paddingX = (config.paddingX as number) ?? 0;
  const paddingY = (config.paddingY as number) ?? 0;
  const gap = (config.gap as number) ?? 0;
  const iconSize = (config.iconSize as number) ?? 20;
  const avatarSize = (config.avatarSize as number) ?? 36;

  const isHorizontal = layout === "horizontal";

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        overflow: "auto",
        backgroundColor: bgColor,
        borderRadius: `${borderRadius}px`,
        border: borderEnabled ? `${borderWidth}px solid ${borderColor}` : "none",
        padding: `${paddingY}px ${paddingX}px`,
        boxSizing: "border-box",
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: isHorizontal ? "row" : "column",
          gap: `${gap}px`,
          ...(isHorizontal ? { height: "100%" } : {}),
        }}
      >
        {items.map((item, i) => {
          const hasIcon = showIcon && (item.icon || item.avatarUrl);
          const resolvedIcon = hasIcon && item.icon ? resolveIcon(item.icon) : null;
          const showDiv = showDivider && i < items.length - 1;

          return (
            <Box
              key={i}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                minHeight: `${itemHeight}px`,
                padding: "0 12px",
                backgroundColor: itemBgColor,
                borderRadius: showDivider ? 0 : "4px",
                flexShrink: 0,
                ...(isHorizontal ? { flex: "0 0 auto" } : {}),
                cursor: "default",
                transition: "background-color 0.15s",
                position: "relative",
                "&:hover": { backgroundColor: itemHoverColor },
                ...(showDiv && !isHorizontal ? {
                  borderBottom: `1px solid ${dividerColor}`,
                } : {}),
                ...(showDiv && isHorizontal ? {
                  borderRight: `1px solid ${dividerColor}`,
                } : {}),
              }}
            >
              {/* Icon or Avatar */}
              {hasIcon && item.avatarUrl && (
                <Box
                  component="img"
                  src={item.avatarUrl}
                  alt=""
                  sx={{
                    width: `${avatarSize}px`,
                    height: `${avatarSize}px`,
                    borderRadius: "50%",
                    objectFit: "cover",
                    flexShrink: 0,
                  }}
                />
              )}
              {hasIcon && !item.avatarUrl && resolvedIcon && (
                <Box
                  sx={{
                    width: `${iconSize}px`,
                    height: `${iconSize}px`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: textColor,
                    flexShrink: 0,
                    "& svg": { fontSize: `${iconSize}px` },
                  }}
                >
                  {resolvedIcon}
                </Box>
              )}

              {/* Text content */}
              <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
                <Typography
                  sx={{
                    color: textColor,
                    fontSize: `${textFontSize}px`,
                    fontWeight: textFontWeight,
                    lineHeight: 1.4,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.text}
                </Typography>
                {item.subtext && (
                  <Typography
                    sx={{
                      color: subtextColor,
                      fontSize: `${subtextFontSize}px`,
                      lineHeight: 1.3,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.subtext}
                  </Typography>
                )}
              </Box>

              {/* Badge */}
              {item.badge && (
                <Box
                  sx={{
                    color: badgeColor,
                    backgroundColor: badgeBgColor,
                    fontSize: "11px",
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: "10px",
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.badge}
                </Box>
              )}
            </Box>
          );
        })}
       </Box>
      {/* API 错误 / 加载中提示 */}
      {dataMode === "api" && apiError && (
        <Box sx={{ color: "#F44336", fontSize: 11, p: 1, textAlign: "center" }}>
          {apiError}
        </Box>
      )}
      {dataMode === "api" && !apiError && items.length === 0 && (
        <Box sx={{ color: "rgba(255,255,255,0.3)", fontSize: 11, p: 1, textAlign: "center" }}>
          加载中...
        </Box>
      )}
    </Box>
  );
}
