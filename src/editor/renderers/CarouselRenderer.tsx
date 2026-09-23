import { useState, useEffect, useCallback, useRef } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import type { ComponentRendererProps } from "../../types/editor";
import { resolveIcon } from "../plugins/IconResolver";
import { useApiDataFetch } from "../hooks/useApiDataFetch";

interface CarouselSlide {
  title: string;
  description: string;
  imageUrl: string;
  bgColor: string;
  icon?: string;
}

const DEFAULT_SLIDES: CarouselSlide[] = [
  { title: "轮播一", description: "这是第一张幻灯片的内容描述。", imageUrl: "", bgColor: "rgba(255,152,0,0.15)", icon: "auto_awesome" },
  { title: "轮播二", description: "这是第二张幻灯片的内容描述。", imageUrl: "", bgColor: "rgba(33,150,243,0.15)", icon: "speed" },
  { title: "轮播三", description: "这是第三张幻灯片的内容描述。", imageUrl: "", bgColor: "rgba(76,175,80,0.15)", icon: "whatshot" },
];

function parseSlides(input: unknown): CarouselSlide[] {
  if (Array.isArray(input) && input.length > 0) {
    return input.map((item, i) => ({
      title: String((item as Record<string, unknown>)?.title ?? `轮播 ${i + 1}`),
      description: String((item as Record<string, unknown>)?.description ?? ""),
      imageUrl: String((item as Record<string, unknown>)?.imageUrl ?? (item as Record<string, unknown>)?.image ?? ""),
      bgColor: String((item as Record<string, unknown>)?.bgColor ?? (item as Record<string, unknown>)?.bg ?? ""),
      icon: String((item as Record<string, unknown>)?.icon ?? "") || undefined,
    }));
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item: Record<string, unknown>, i: number) => ({
            title: String(item?.title ?? `轮播 ${i + 1}`),
            description: String(item?.description ?? ""),
            imageUrl: String(item?.imageUrl ?? item?.image ?? ""),
            bgColor: String(item?.bgColor ?? item?.bg ?? ""),
            icon: String(item?.icon ?? "") || undefined,
          }));
        }
        if (Array.isArray(parsed) && parsed.length === 0) {
          return [{ title: "轮播 1", description: "", imageUrl: "", bgColor: "" }];
        }
      } catch {
        // fall through
      }
    }
  }
  return [...DEFAULT_SLIDES];
}

/**
 * 将 API 响应归一化为 slides 数组，字段约定与发布端 codegen `buildSlide` 保持一致：
 *   - 支持数组 / {slides|items|list} / 单对象
 *   - 项字段：title, description, imageUrl(或 image), bgColor(或 bg), icon
 */
function normalizeSlidesFromData(data: unknown): CarouselSlide[] {
  if (data == null) return [];
  let list: unknown = Array.isArray(data)
    ? data
    : (data as Record<string, unknown>)?.slides ??
      (data as Record<string, unknown>)?.items ??
      (data as Record<string, unknown>)?.list;
  if (list == null) list = [data];
  if (!Array.isArray(list)) list = [list];
  return (list as unknown[])
    .filter(Boolean)
    .map((item, i) => ({
      title: String((item as Record<string, unknown>)?.title ?? ""),
      description: String((item as Record<string, unknown>)?.description ?? ""),
      imageUrl: String((item as Record<string, unknown>)?.imageUrl ?? (item as Record<string, unknown>)?.image ?? ""),
      bgColor: String((item as Record<string, unknown>)?.bgColor ?? (item as Record<string, unknown>)?.bg ?? ""),
      icon: String((item as Record<string, unknown>)?.icon ?? "") || undefined,
      ...((item as Record<string, unknown>)?.title == null && { title: `轮播 ${i + 1}` }),
    }));
}

export function CarouselRenderer({ config, mode }: ComponentRendererProps) {
  const isPreview = mode === "preview";
  // 静态内容：统一 staticData 字段优先（与 list 一致），空则回退自有 slides
  const hasExplicitStaticData = config.staticData != null && config.staticData !== "";
  const slides = parseSlides(hasExplicitStaticData ? config.staticData : config.slides);

  // ── 统一数据源协议：API 动态取数（仅预览模式拉取） ──
  const apiUrl = String(config.apiUrl ?? "");
  const apiPath = String(config.apiPath ?? "");
  const isApi = String(config.dataMode ?? "static") === "api" && (apiUrl !== "" || apiPath !== "");
  const { data: apiData } = useApiDataFetch<unknown>({
    dataMode: isPreview && isApi ? "api" : "static",
    staticData: null,
    apiUrl,
    apiPath,
    apiMethod: (String(config.apiMethod ?? "GET") || "GET") as "GET" | "POST",
    apiHeaders: config.apiHeaders,
    apiBody: config.apiBody,
    apiDataPath: String(config.apiDataPath ?? ""),
    apiInterval: (config.apiInterval as number) ?? 0,
    authEnabled: config.authEnabled === undefined ? null : config.authEnabled === true,
  });

  // 渲染用数据：API 数据优先，空则回退静态 slides
  const apiSlides = isPreview ? normalizeSlidesFromData(apiData) : [];
  const srcSlides = apiSlides.length > 0 ? apiSlides : slides;

  const autoplay = (config.autoplay as boolean) ?? true;
  const interval = (config.interval as number) ?? 4000;
  const showArrows = (config.showArrows as boolean) ?? true;
  const showDots = (config.showDots as boolean) ?? true;
  const transition = (config.transition as string) ?? "slide";
  const arrowColor = (config.arrowColor as string) ?? "rgba(255,255,255,0.8)";
  const dotColor = (config.dotColor as string) ?? "rgba(255,255,255,0.3)";
  const dotActiveColor = (config.dotActiveColor as string) ?? "#ffffff";
  const titleColor = (config.titleColor as string) ?? "#ffffff";
  const titleFontSize = (config.titleFontSize as number) ?? 22;
  const descColor = (config.descColor as string) ?? "rgba(255,255,255,0.7)";
  const descFontSize = (config.descFontSize as number) ?? 14;
  const borderRadius = (config.borderRadius as number) ?? 8;
  const objectFit = (config.objectFit as string) ?? "cover";

  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const slideCount = srcSlides.length;
  const safeCurrent = Math.min(current, Math.max(0, slideCount - 1));

  const goNext = useCallback(() => {
    setCurrent((prev) => (prev + 1) % slideCount);
  }, [slideCount]);

  const goPrev = useCallback(() => {
    setCurrent((prev) => (prev - 1 + slideCount) % slideCount);
  }, [slideCount]);

  const goTo = useCallback((index: number) => {
    setCurrent(index);
  }, []);

  // Autoplay（悬停暂停，与 codegen 生成 HTML 的行为对齐）
  useEffect(() => {
    if (!isPreview || !autoplay || slideCount <= 1 || paused) return;
    timerRef.current = setInterval(goNext, interval);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPreview, autoplay, interval, slideCount, goNext, paused]);

  if (slideCount === 0) return null;

  return (
    <Box
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      sx={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        borderRadius: `${borderRadius}px`,
        bgcolor: "rgba(0,0,0,0.2)",
      }}
    >
      {/* Slides container */}
      <Box
        sx={{
          width: "100%",
          height: "100%",
          position: "relative",
        }}
      >
        {srcSlides.map((slide, i) => {
          const isActive = i === safeCurrent;
          const slideBg = slide.bgColor || "rgba(255,255,255,0.05)";

          return (
            <Box
              key={i}
              sx={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "24px",
                boxSizing: "border-box",
                backgroundImage: slide.imageUrl ? `url(${slide.imageUrl})` : undefined,
                backgroundSize: slide.imageUrl ? objectFit === "cover" ? "cover" : "contain" : undefined,
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
                backgroundColor: slideBg,
                opacity: transition === "fade" ? (isActive ? 1 : 0) : 1,
                transform:
                  transition === "slide"
                    ? `translateX(${(i - safeCurrent) * 100}%)`
                    : "translateX(0)",
                transition:
                  transition === "fade"
                    ? "opacity 0.4s ease"
                    : "transform 0.35s ease",
                pointerEvents: isActive ? "auto" : "none",
                zIndex: isActive ? 2 : 1,
              }}
            >
              {slide.icon && (
                <Box
                  sx={{
                    color: titleColor,
                    marginBottom: slide.title ? "10px" : 0,
                    filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.35))",
                    display: "flex",
                  }}
                >
                  {resolveIcon(slide.icon, "widgets", Math.round(titleFontSize * 1.45))}
                </Box>
              )}
              {slide.title && (
                <Typography
                  sx={{
                    color: titleColor,
                    fontSize: `${titleFontSize}px`,
                    fontWeight: 600,
                    textAlign: "center",
                    marginBottom: slide.description ? "8px" : 0,
                    textShadow: "0 1px 4px rgba(0,0,0,0.3)",
                    ...(slide.imageUrl ? {
                      backgroundColor: "rgba(0,0,0,0.4)",
                      padding: "4px 12px",
                      borderRadius: "4px",
                    } : {}),
                  }}
                >
                  {slide.title}
                </Typography>
              )}
              {slide.description && (
                <Typography
                  sx={{
                    color: descColor,
                    fontSize: `${descFontSize}px`,
                    textAlign: "center",
                    maxWidth: "80%",
                    lineHeight: 1.5,
                    textShadow: "0 1px 4px rgba(0,0,0,0.3)",
                    ...(slide.imageUrl ? {
                      backgroundColor: "rgba(0,0,0,0.35)",
                      padding: "4px 10px",
                      borderRadius: "4px",
                    } : {}),
                  }}
                >
                  {slide.description}
                </Typography>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Arrows */}
      {showArrows && slideCount > 1 && (
        <>
          <Box
            onClick={(e) => { e.stopPropagation(); if (isPreview) goPrev(); }}
            sx={{
              position: "absolute",
              left: 8,
              top: "50%",
              transform: "translateY(-50%)",
              width: 36,
              height: 36,
              display: "grid",
              placeItems: "center",
              borderRadius: "50%",
              backgroundColor: "rgba(0,0,0,0.3)",
              cursor: isPreview ? "pointer" : "default",
              zIndex: 10,
              color: arrowColor,
              transition: "background-color 0.2s",
              "&:hover": isPreview ? { backgroundColor: "rgba(0,0,0,0.5)" } : {},
            }}
          >
            <ChevronLeftIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box
            onClick={(e) => { e.stopPropagation(); if (isPreview) goNext(); }}
            sx={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              width: 36,
              height: 36,
              display: "grid",
              placeItems: "center",
              borderRadius: "50%",
              backgroundColor: "rgba(0,0,0,0.3)",
              cursor: isPreview ? "pointer" : "default",
              zIndex: 10,
              color: arrowColor,
              transition: "background-color 0.2s",
              "&:hover": isPreview ? { backgroundColor: "rgba(0,0,0,0.5)" } : {},
            }}
          >
            <ChevronRightIcon sx={{ fontSize: 22 }} />
          </Box>
        </>
      )}

      {/* Dots */}
      {showDots && slideCount > 1 && (
        <Box
            sx={{
              position: "absolute",
              bottom: 10,
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              gap: "6px",
              zIndex: 10,
            }}
          >
            {srcSlides.map((_, i) => (
            <Box
              key={i}
              onClick={(e) => { e.stopPropagation(); if (isPreview) goTo(i); }}
              sx={{
                width: i === safeCurrent ? 20 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: i === safeCurrent ? dotActiveColor : dotColor,
                cursor: isPreview ? "pointer" : "default",
                transition: "all 0.25s ease",
              }}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
