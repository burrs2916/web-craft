import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ComponentRendererProps } from "../../types/editor";
import { useApiDataFetch } from "../hooks/useApiDataFetch";
import { readAuthEnabled } from "../data/authMode";

interface TimelineItem {
  title: string;
  content: string;
  timestamp: string;
  color: string;
}

const DEFAULT_ITEMS: TimelineItem[] = [
  { title: "事件一", content: "这是事件一的内容描述。", timestamp: "2024-01-01", color: "" },
  { title: "事件二", content: "这是事件二的内容描述。", timestamp: "2024-03-15", color: "" },
  { title: "事件三", content: "这是事件三的内容描述。", timestamp: "2024-06-30", color: "" },
];

function parseItems(input: unknown): TimelineItem[] {
  if (Array.isArray(input) && input.length > 0) {
    return input.map((item, i) => ({
      title: String((item as Record<string, unknown>)?.title ?? (item as Record<string, unknown>)?.label ?? `事件 ${i + 1}`),
      content: String((item as Record<string, unknown>)?.content ?? (item as Record<string, unknown>)?.desc ?? ""),
      timestamp: String((item as Record<string, unknown>)?.timestamp ?? (item as Record<string, unknown>)?.time ?? (item as Record<string, unknown>)?.date ?? ""),
      color: String((item as Record<string, unknown>)?.color ?? ""),
    }));
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item: Record<string, unknown>, i: number) => ({
            title: String(item?.title ?? item?.label ?? `事件 ${i + 1}`),
            content: String(item?.content ?? item?.desc ?? ""),
            timestamp: String(item?.timestamp ?? item?.time ?? item?.date ?? ""),
            color: String(item?.color ?? ""),
          }));
        }
        if (Array.isArray(parsed) && parsed.length === 0) {
          return [{ title: "事件 1", content: "", timestamp: "", color: "" }];
        }
      } catch {
        // fall through
      }
    }
    const lines = trimmed.split("\n").map((s) => s.trim()).filter(Boolean);
    if (lines.length > 0) {
      return lines.map((title) => ({ title, content: "", timestamp: "", color: "" }));
    }
  }
  return [...DEFAULT_ITEMS];
}

/** 从 API / staticData 响应中解包 时间线条目数组（与 codegen mount 对齐） */
function extractItems(input: unknown): TimelineItem[] {
  if (input == null) return [];
  if (Array.isArray(input) || typeof input === "string") {
    return parseItems(input);
  }
  if (typeof input === "object") {
    const obj = input as Record<string, unknown>;
    const raw = Array.isArray(obj.items) ? obj.items
      : Array.isArray(obj.list) ? obj.list
      : Array.isArray(obj.data) ? obj.data
      : Array.isArray(obj.timeline) ? obj.timeline
      : (typeof obj.data === "string" ? obj.data : null);
    if (raw != null) return parseItems(raw);
    // 单字段解包兜底：形如 {records:[...]} 等
    for (const key of Object.keys(obj)) {
      if (Array.isArray(obj[key]) && obj[key].length > 0) return parseItems(obj[key]);
    }
  }
  return [];
}

export function TimelineRenderer({ config }: ComponentRendererProps) {
  // ── 数据获取（与 steps/list 数据源接入保持一致） ──
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

  const isThumb = config._thumbnail === true;
  const sourceItems = parseItems(config.items);
  const items: TimelineItem[] = (isApi || hasExplicitStaticData)
    ? (extractItems(fetchedData).length > 0 ? extractItems(fetchedData) : sourceItems)
    : sourceItems;

  const mode = (config.mode as string) ?? "left";
  const dotSize = isThumb ? 7 : ((config.dotSize as number) ?? 12);
  const lineColor = (config.lineColor as string) || "rgba(255,255,255,0.15)";
  const dotColor = (config.dotColor as string) || "#FF9800";
  const titleColor = (config.titleColor as string) || "rgba(255,255,255,0.85)";
  const titleFontSize = (config.titleFontSize as number) ?? 14;
  const contentColor = (config.contentColor as string) || "rgba(255,255,255,0.6)";
  const contentFontSize = (config.contentFontSize as number) ?? 13;
  const timestampColor = (config.timestampColor as string) || "rgba(255,255,255,0.35)";
  const timestampFontSize = (config.timestampFontSize as number) ?? 12;
  const itemGap = isThumb ? 6 : ((config.itemGap as number) ?? 20);
  const paddingX = isThumb ? 4 : ((config.paddingX as number) ?? 16);
  // 上下边距极度收紧，首末紧贴边框，便于拖动定位
  const paddingY = isThumb ? 2 : 4;

  const isRight = mode === "right";
  const isAlternate = mode === "alternate";

  // 缩略图：仅渲染前 3 个圆点的紧凑示意图，水平/垂直居中
  if (isThumb) {
    const thumbItems = items.slice(0, 3);
    return (
      <Box
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
          padding: `${paddingY}px ${paddingX}px`,
        }}
      >
        {thumbItems.map((item, i) => (
          <Box key={i} sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <Box sx={{ width: `${dotSize}px`, height: `${dotSize}px`, borderRadius: "50%", backgroundColor: item.color || dotColor, flexShrink: 0 }} />
            {i < thumbItems.length - 1 && (
              <Box sx={{ width: "2px", flex: "1 1 0", minHeight: "8px", minWidth: 0, backgroundColor: lineColor }} />
            )}
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        overflowY: "auto",
        boxSizing: "border-box",
      }}
    >
      {/* 内容少于框高时：中间行拉伸（竖线填满），首点贴顶、末点贴底 → 上下边距接近 0；
          内容超出框高时：min-height:100% 保证从顶可滚，末行自然排布 */}
      <Box
        sx={{
          minHeight: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          padding: `${paddingY}px ${paddingX}px`,
          boxSizing: "border-box",
        }}
      >
        {items.map((item, i) => {
        const itemDotColor = item.color || dotColor;
        const isLeftSide = isAlternate ? i % 2 === 0 : !isRight;
        const hasNext = i < items.length - 1;

        // 行间距通过内容列 paddingBottom 产生，圆点列连接线 flex:1 无缝延伸到下一点，避免"线断开"
        return (
          <Box
            key={i}
            sx={{
              // 纵向：非末行拉伸撑满（竖线随之填满），末行自然高度贴底
              flex: hasNext ? "1 1 0" : "0 0 auto",
              minWidth: 0,
              display: "flex",
              flexDirection: isRight ? "row-reverse" : "row",
              alignItems: "stretch",
              gap: "12px",
              justifyContent: isAlternate ? (isLeftSide ? "flex-start" : "flex-end") : "center",
            }}
          >
            {/* Dot + line column（连接线贴住圆点底并连续延伸） */}
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                flexShrink: 0,
                minWidth: `${dotSize}px`,
              }}
            >
              <Box
                sx={{
                  width: `${dotSize}px`,
                  height: `${dotSize}px`,
                  borderRadius: "50%",
                  backgroundColor: itemDotColor,
                  border: `2px solid ${itemDotColor}`,
                  flexShrink: 0,
                  zIndex: 2,
                  boxSizing: "border-box",
                }}
              />
              {hasNext && (
                <Box
                  sx={{
                    width: "2px",
                    flex: "1 1 0",
                    minHeight: "12px",
                    backgroundColor: lineColor,
                  }}
                />
              )}
            </Box>

            {/* Content（paddingBottom 提供行间距，供连接线连续贯穿） */}
            <Box
              sx={{
                // 非交替模式：内容列固定统一宽度，整块（竖线+文字）水平居中、左右对称、竖线垂直
                flex: isAlternate ? 1 : "0 0 62%",
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                paddingBottom: hasNext ? `${itemGap}px` : 0,
                ...(isAlternate && isLeftSide ? { textAlign: "right", alignItems: "flex-end" } : {}),
              }}
            >
              {item.timestamp && (
                <Typography sx={{ color: timestampColor, fontSize: `${timestampFontSize}px`, lineHeight: 1.3 }}>
                  {item.timestamp}
                </Typography>
              )}
              {item.title && (
                <Typography sx={{ color: titleColor, fontSize: `${titleFontSize}px`, fontWeight: 600, lineHeight: 1.4 }}>
                  {item.title}
                </Typography>
              )}
              {item.content && (
                <Typography sx={{ color: contentColor, fontSize: `${contentFontSize}px`, lineHeight: 1.5 }}>
                  {item.content}
                </Typography>
              )}
            </Box>
          </Box>
        );
        })}
      </Box>
    </Box>
  );
}