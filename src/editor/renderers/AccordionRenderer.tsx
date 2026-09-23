import { useState, useEffect, useRef } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import type { ComponentRendererProps } from "../../types/editor";
import { resolveIcon } from "../plugins/IconResolver";

interface AccordionItem {
  title: string;
  content: string;
  icon?: string;
  iconColor?: string;
}

const DEFAULT_ITEMS: AccordionItem[] = [
  { title: "面板一", content: "这是面板一的内容。", icon: "widgets" },
  { title: "面板二", content: "这是面板二的内容。", icon: "settings" },
  { title: "面板三", content: "这是面板三的内容。", icon: "info" },
];

const FONT_WEIGHT_MAP: Record<string, number> = { normal: 400, medium: 500, bold: 700 };

/**
 * 解析 config.items -> AccordionItem[]
 * 支持 JSON 字符串数组、纯换行文本（每行一个面板标题，内容为空）
 */
function parseItems(input: unknown): AccordionItem[] {
  if (Array.isArray(input) && input.length > 0) {
    return input.map((item, i) => ({
      title: String((item as Record<string, unknown>)?.title ?? `面板 ${i + 1}`),
      content: String((item as Record<string, unknown>)?.content ?? ""),
      icon: String((item as Record<string, unknown>)?.icon ?? "") || undefined,
      iconColor: String((item as Record<string, unknown>)?.iconColor ?? "") || undefined,
    }));
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item: Record<string, unknown>, i: number) => ({
            title: String(item?.title ?? `面板 ${i + 1}`),
            content: String(item?.content ?? ""),
            icon: String(item?.icon ?? "") || undefined,
            iconColor: String(item?.iconColor ?? "") || undefined,
          }));
        }
        if (Array.isArray(parsed) && parsed.length === 0) {
          return [{ title: "面板 1", content: "" }];
        }
      } catch {
        // fall through
      }
    }
    const lines = trimmed.split("\n").map((s) => s.trim()).filter(Boolean);
    if (lines.length > 0) {
      return lines.map((title) => ({ title, content: "" }));
    }
  }
  return [...DEFAULT_ITEMS];
}

export function AccordionRenderer({ config, mode }: ComponentRendererProps) {
  const items = parseItems(config.items);

  const accordionMode = (config.accordionMode as boolean) ?? true;
  const defaultExpandFirst = (config.defaultExpandFirst as boolean) ?? true;
  const scaleFit = (config.scaleFit as boolean) ?? true;

  const headerBgColor = (config.headerBgColor as string) || "rgba(255,255,255,0.06)";
  const headerColor = (config.headerColor as string) || "#e0e0e0";
  const headerFontSize = (config.headerFontSize as number) ?? 14;
  const headerHeight = (config.headerHeight as number) ?? 44;
  const headerWeight = FONT_WEIGHT_MAP[String(config.headerFontWeight ?? "medium")] ?? 500;
  const contentBgColor = (config.contentBgColor as string) || "rgba(0,0,0,0.15)";
  const contentColor = (config.contentColor as string) || "rgba(255,255,255,0.7)";
  const contentFontSize = (config.contentFontSize as number) ?? 13;
  const contentPadding = (config.contentPadding as number) ?? 12;
  const borderEnabled = (config.borderEnabled as boolean) ?? true;
  const borderColor = (config.borderColor as string) || "rgba(255,255,255,0.1)";
  const borderWidth = (config.borderWidth as number) ?? 1;
  const borderRadius = (config.borderRadius as number) ?? 6;
  const gap = (config.gap as number) ?? 8;
  const itemIconSize = (config.itemIconSize as number) ?? 16;

  // 实时读取容器尺寸：随框等比缩放（基准 360×320）
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [boxSize, setBoxSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const update = () => setBoxSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fit =
    scaleFit && boxSize.w > 0 && boxSize.h > 0
      ? Math.min(boxSize.w / 360, boxSize.h / 320)
      : 1;
  const factor = Math.min(Math.max(fit, 0.4), 4);
  const hh = Math.max(32, Math.round(headerHeight * factor));
  const hfs = Math.round(headerFontSize * factor);
  const cfs = Math.round(contentFontSize * factor);
  const cpad = Math.round(contentPadding * factor);
  const rbr = Math.round(borderRadius * factor);
  const gapv = Math.round(gap * factor);
  const itemIconScaled = Math.max(12, Math.round(itemIconSize * factor));

  const isPreview = mode === "preview";
  const [expanded, setExpanded] = useState<Set<number>>(() => {
    if (defaultExpandFirst && items.length > 0) return new Set([0]);
    return new Set();
  });

  const toggle = (index: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (accordionMode) {
        if (next.has(index)) {
          next.clear();
        } else {
          next.clear();
          next.add(index);
        }
      } else {
        if (next.has(index)) {
          next.delete(index);
        } else {
          next.add(index);
        }
      }
      return next;
    });
  };

  // edit 模式下展示所有展开，方便编辑
  const isOpen = (index: number): boolean => {
    if (!isPreview) return true;
    return expanded.has(index);
  };

  return (
    <Box
      ref={rootRef}
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: `${gapv}px`,
        overflowY: "auto",
      }}
    >
      {items.map((item, i) => {
        const open = isOpen(i);
        return (
          <Box
            key={i}
            sx={{
              borderRadius: `${rbr}px`,
              overflow: "hidden",
              border: borderEnabled ? `${borderWidth}px solid ${borderColor}` : "none",
              flexShrink: 0,
            }}
          >
            {/* Header */}
            <Box
              onClick={() => isPreview && toggle(i)}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                height: `${hh}px`,
                padding: "0 16px",
                backgroundColor: headerBgColor,
                color: headerColor,
                fontSize: `${hfs}px`,
                fontWeight: headerWeight,
                cursor: isPreview ? "pointer" : "default",
                userSelect: "none",
                transition: "background-color 0.2s, filter 0.2s",
                "&:hover": isPreview ? { filter: "brightness(1.15)" } : {},
              }}
            >
              <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: `${Math.round(6 * factor)}px`, minWidth: 0 }}>
                {item.icon && (
                  <Box component="span" sx={{ display: "inline-flex", alignItems: "center", color: item.iconColor }}>
                    {resolveIcon(item.icon, undefined, itemIconScaled)}
                  </Box>
                )}
                <Typography
                  component="span"
                  sx={{ fontSize: "inherit", fontWeight: "inherit", lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {item.title}
                </Typography>
              </Box>
              <ExpandMoreIcon
                sx={{
                  fontSize: itemIconScaled,
                  transform: open ? "rotate(0deg)" : "rotate(-90deg)",
                  transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  flexShrink: 0,
                }}
              />
            </Box>
            {/* Content：grid-template-rows 0fr→1fr 过渡贴合内容真实高度 */}
            <Box
              sx={{
                display: "grid",
                gridTemplateRows: open ? "1fr" : "0fr",
                transition: "grid-template-rows 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            >
              <Box
                sx={{
                  minHeight: 0,
                  overflow: "hidden",
                  opacity: open ? 1 : 0,
                  transition: "opacity 0.3s ease",
                  backgroundColor: contentBgColor,
                  color: contentColor,
                  fontSize: `${cfs}px`,
                }}
              >
                <Typography
                  component="div"
                  sx={{ padding: `${cpad}px`, whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.6 }}
                >
                  {item.content}
                </Typography>
              </Box>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}