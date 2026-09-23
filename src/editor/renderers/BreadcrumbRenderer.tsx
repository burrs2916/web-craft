import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import type { ComponentRendererProps } from "../../types/editor";
import { resolveIcon } from "../plugins/IconResolver";
import { useApiDataFetch } from "../hooks/useApiDataFetch";
import { readAuthEnabled } from "../data/authMode";
import {
  parseBreadcrumbItems,
  type BreadcrumbItem,
  type BreadcrumbMapping,
} from "../data/breadcrumbsData";

const DEFAULT_ITEMS: BreadcrumbItem[] = [
  { label: "首页", href: "", icon: "material:home" },
  { label: "分类", href: "", icon: "material:folder" },
  { label: "当前页", href: "", icon: "material:article" },
];

export function BreadcrumbRenderer({ config }: ComponentRendererProps) {
  // ── 数据获取（与 steps/timeline 数据源接入保持一致） ──
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

  // 响应字段映射（接口模式，用户可指定真名字段名）
  const mapping: BreadcrumbMapping = {
    labelField: (config.itemLabelField as string) || undefined,
    hrefField: (config.itemHrefField as string) || undefined,
    iconField: (config.itemIconField as string) || undefined,
  };

  const isThumb = config._thumbnail === true;
  const sourceItems = config.items
    ? (parseBreadcrumbItems(config.items, mapping).length > 0
      ? parseBreadcrumbItems(config.items, mapping)
      : DEFAULT_ITEMS)
    : DEFAULT_ITEMS;

  // 接口模式下：依据响应生成；空响应不回退静态，进入空态占位
  let isEmpty = false;
  let items: BreadcrumbItem[] = sourceItems;
  if (isApi || hasExplicitStaticData) {
    const fetched = parseBreadcrumbItems(fetchedData, mapping);
    if (fetched.length > 0) {
      items = fetched;
    } else if ((isApi || hasExplicitStaticData) && fetchedData != null) {
      isEmpty = true;
      items = [];
    }
  }

  const separator = (config.separator as string) ?? "chevron";
  const separatorText = (config.separatorText as string) ?? "/";
  const textColor = (config.textColor as string) || "rgba(255,255,255,0.6)";
  const activeColor = (config.activeColor as string) || "#ffffff";
  const fontSize = isThumb ? 11 : ((config.fontSize as number) ?? 14);
  const fontWeight = (config.fontWeight as string) ?? "normal";
  const iconColor = (config.iconColor as string) || "rgba(255,255,255,0.3)";
  const bgColor = (config.bgColor as string) || "transparent";
  const paddingX = isThumb ? 2 : ((config.paddingX as number) ?? 12);
  const paddingY = isThumb ? 2 : ((config.paddingY as number) ?? 8);
  const borderRadius = isThumb ? 4 : ((config.borderRadius as number) ?? 6);
  const borderEnabled = isThumb ? false : ((config.borderEnabled as boolean) ?? false);
  const borderColor = (config.borderColor as string) || "rgba(255,255,255,0.1)";
  const borderWidth = (config.borderWidth as number) ?? 1;

  const renderSeparator = () => {
    if (separator === "text") {
      return (
        <Typography
          component="span"
          sx={{ color: iconColor, fontSize: `${fontSize}px`, margin: "0 6px", userSelect: "none" }}
        >
          {separatorText}
        </Typography>
      );
    }
    return (
      <NavigateNextIcon
        sx={{ color: iconColor, fontSize: `${fontSize + 4}px`, margin: "0 2px", userSelect: "none" }}
      />
    );
  };

  const renderCrumb = (item: BreadcrumbItem, i: number, total: number) => {
    const isLast = i === total - 1;
    return (
      <Box
        key={i}
        sx={{ display: "flex", alignItems: "center", flexShrink: 0 }}
      >
        {item.icon && (
          <Box
            component="span"
            sx={{ display: "inline-flex", alignItems: "center", color: isLast ? activeColor : textColor, marginRight: "6px", flexShrink: 0 }}
          >
            {resolveIcon(item.icon, "widgets", Math.round(fontSize * 1.15))}
          </Box>
        )}
        <Typography
          component="span"
          sx={{
            color: isLast ? activeColor : textColor,
            fontSize: `${fontSize}px`,
            fontWeight: isLast ? "bold" : fontWeight,
            cursor: item.href ? "pointer" : "default",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            transition: "color 0.15s",
            "&:hover": !isLast && item.href ? { color: activeColor } : {},
          }}
        >
          {item.label}
        </Typography>
        {!isLast && renderSeparator()}
      </Box>
    );
  };

  const renderEmpty = () => (
    <Typography
      component="span"
      sx={{ color: iconColor, fontSize: `${fontSize}px`, fontStyle: "italic" }}
    >
      接口暂无数据
    </Typography>
  );

  // 缩略图：仅前 3 项紧凑示意图，内容靠左、垂直居中，避免截断
  if (isThumb) {
    const thumbItems = (items.length > 0 ? items : DEFAULT_ITEMS).slice(0, 3);
    return (
      <Box
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          overflow: "hidden",
          padding: `${paddingY}px ${paddingX}px`,
          boxSizing: "border-box",
        }}
      >
        {thumbItems.map((item, i) => renderCrumb(item, i, thumbItems.length))}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        backgroundColor: bgColor,
        borderRadius: `${borderRadius}px`,
        border: borderEnabled ? `${borderWidth}px solid ${borderColor}` : "none",
        padding: `${paddingY}px ${paddingX}px`,
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {isEmpty ? renderEmpty() : items.map((item, i) => renderCrumb(item, i, items.length))}
    </Box>
  );
}