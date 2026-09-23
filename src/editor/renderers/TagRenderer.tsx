import { useState, useEffect, useRef } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ComponentRendererProps } from "../../types/editor";
import { resolveIcon } from "../plugins/IconResolver";
import { getWebsiteAuthState } from "../../store/websiteAuthStore";
import { TAG_SIZE_MAP, tagScale, resolveTagColors } from "./tagShared";

/** 嵌套路径取值 */
function getNested(obj: unknown, path: string): unknown {
  if (!obj || !path) return undefined;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const k of parts) {
    if (cur == null) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/** 判空规则（与发布端 isEmpty 语义一致） */
function resolveEmpty(val: unknown, mode: string): boolean {
  if (mode === "emptyArray") return Array.isArray(val) && val.length === 0;
  if (mode === "zero") return Number(val) === 0;
  if (mode === "falsy") return !val;
  if (val === undefined || val === null || val === "") return true;
  if (Array.isArray(val)) return val.length === 0;
  if (typeof val === "object") return Object.keys(val as object).length === 0;
  return false;
}

interface ValuePolicy { value?: unknown; preset?: string }

/** 值→预设映射：返回命中的预设名 */
function matchPolicy(val: unknown, policies: ValuePolicy[] | undefined): string | undefined {
  for (const item of policies ?? []) {
    const v = item?.value;
    if (v !== undefined && String(val) === String(v)) return String(item?.preset ?? "default");
  }
  return undefined;
}

interface ThresholdItem { threshold?: unknown; preset?: string }

/** 数值阈值判色：按阈值从高到低，返回首个「值≥阈值」命中的预设名 */
function matchThreshold(val: unknown, items: ThresholdItem[] | undefined): string | undefined {
  const n = Number(val);
  if (!isFinite(n)) return undefined;
  const sorted = (items ?? [])
    .filter((it) => it?.threshold !== undefined && it.threshold !== null && it.threshold !== "")
    .sort((a, b) => Number(b.threshold) - Number(a.threshold));
  for (const item of sorted) {
    if (n >= Number(item.threshold)) return String(item?.preset ?? "default");
  }
  return undefined;
}

export function TagRenderer({ config, mode, height }: ComponentRendererProps) {
  const isPreview = mode === "preview";
  const [closed, setClosed] = useState(false);

  // —— 静态配置 ——
  const text = (config.text as string) ?? "标签";
  const colorPreset = (config.colorPreset as string) ?? "default";
  const variant = (config.variant as string) ?? "light";
  const size = (config.size as string) ?? "medium";
  const closable = (config.closable as boolean) ?? false;
  const icon = (config.icon as string) ?? "";
  const iconSize = (config.iconSize as number) ?? 14;
  const customBg = (config.customBg as string) || "";
  const customColor = (config.customColor as string) || "";
  const customBorder = (config.customBorder as string) || "";
  const borderRadius = (config.borderRadius as number) ?? 4;
  const fontSize = (config.fontSize as number) ?? 0;
  const fontWeight = (config.fontWeight as string) ?? "normal";

  // —— 数据感知状态 ——
  const dataMode = (config.dataMode as string) ?? "static";
  const apiUrl = (config.apiUrl as string) || "";
  const apiMethod = (config.apiMethod as string) ?? "GET";
  const apiDataPath = (config.apiDataPath as string) || "";
  // 轮询间隔：canonical 键 apiInterval（与 metric/progress/API 面板一致）；旧键 bindInterval 兼容回退
  const bindInterval = (config.apiInterval as number) ?? (config.bindInterval as number) ?? 0;
  const authEnabled = (config.authEnabled as boolean) ?? false;
  const useValueAsText = (config.useValueAsText as boolean) ?? false;
  const emptyWhen = (config.emptyWhen as string) || "emptyValue";
  const showWhenEmpty = (config.showWhenEmpty as boolean) ?? true;
  const hideOnError = (config.hideOnError as boolean) ?? false;
  const showLoading = (config.showLoading as boolean) ?? true;
  const bindTimeout = (config.bindTimeout as number) ?? 0;
  const errorPreset = (config.errorPreset as string) ?? "error";
  const judgeMode = (config.judgeMode as string) ?? "exact";
  const valuePolicies = (config.valuePolicies as ValuePolicy[] | undefined) ?? [];
  const thresholds = (config.thresholds as ThresholdItem[] | undefined) ?? [];

  const [runtimePreset, setRuntimePreset] = useState<string | null>(null);
  const [runtimeText, setRuntimeText] = useState<string | null>(null);
  const [runtimeVisible, setRuntimeVisible] = useState<boolean | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const paintedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const isApiPublish = isPreview && dataMode === "api" && !!apiUrl;
  useEffect(() => {
    if (!isApiPublish) return;
    let cancelled = false;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    const run = async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      if (showLoading && !paintedRef.current) setRuntimeLoading(true);
      try {
        const headers: Record<string, string> =
          authEnabled
            ? getWebsiteAuthState().buildAuthHeaders()
            : {};
        const base = (window as unknown as Record<string, string>).__WC_API_BASE || "";
        const url = /^https?:\/\//i.test(apiUrl) ? apiUrl : base + apiUrl;
        if (bindTimeout > 0) timeoutTimer = setTimeout(() => controller.abort(), bindTimeout * 1000);
        const res = await fetch(url, {
          method: apiMethod,
          headers,
          body: apiMethod !== "GET" ? "{}" : undefined,
          signal: controller.signal,
        });
        const raw = await res.json().catch(() => res.text());
        const val = getNested(raw, apiDataPath) ?? raw;
        if (cancelled) return;
        paintedRef.current = true;
        setRuntimeLoading(false);
        const isEmpty = resolveEmpty(val, emptyWhen);
        if (isEmpty) {
          // 空值：按「空值显示」决定显隐，保留静态外观
          setRuntimeVisible(showWhenEmpty);
          setRuntimePreset(null);
          setRuntimeText(null);
          return;
        }
        setRuntimeVisible(true);
        const hit = judgeMode === "threshold" ? matchThreshold(val, thresholds) : matchPolicy(val, valuePolicies);
        setRuntimePreset(hit ?? null);
        if (useValueAsText) setRuntimeText(String(val));
      } catch {
        if (cancelled) return;
        paintedRef.current = true;
        setRuntimeLoading(false);
        if (hideOnError) setRuntimeVisible(false);
        else { setRuntimeVisible(true); setRuntimePreset(errorPreset); }
      }
    };
    run();
    const iv = bindInterval > 0 ? setInterval(run, bindInterval * 1000) : null;
    return () => {
      cancelled = true;
      abortRef.current?.abort();
      if (iv) clearInterval(iv);
      if (timeoutTimer) clearTimeout(timeoutTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isApiPublish, apiUrl, apiMethod, apiDataPath, bindInterval, authEnabled, useValueAsText, emptyWhen, showWhenEmpty, hideOnError, judgeMode, valuePolicies, thresholds, showLoading, bindTimeout, errorPreset]);

  // 兜底：未命中映射时，若用返回值当文字且接口已取到值，仍显示返回值
  const finalText = useValueAsText && runtimeText != null ? runtimeText : text;
  const appliedPreset = runtimePreset ?? colorPreset;
  const rc0 = resolveTagColors(appliedPreset, variant, customBg, customColor, customBorder);
  const rc = isPreview && dataMode === "api" && runtimeLoading
    ? (() => {
        const p = { bg: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)", border: "rgba(255,255,255,0.14)" };
        const bg = variant === "outlined" ? "transparent" : variant === "filled" ? p.border : p.bg;
        const borderStr = variant === "outlined" ? `1px solid ${p.border}` : "1px solid transparent";
        return { bgStyle: bg, borderStr, color: p.color };
      })()
    : rc0;

  if (closed) return null;
  if (isPreview && dataMode === "api" && runtimeVisible === false) return null;

  const dims = TAG_SIZE_MAP[size] ?? TAG_SIZE_MAP.medium;
  // 等比缩放：以画布槽位高度为基准，宽度按内容自然适配并居中
  const boxed = typeof height === "number" && Number.isFinite(height) && height > 0;
  const scale = tagScale(height);
  const finalFontSize = (fontSize || dims.fs) * scale;
  const gap = 4 * scale;
  const padX = dims.padX * scale;
  const padY = dims.padY * scale;
  const radius = borderRadius * scale;
  const iconSizePx = iconSize * scale;
  const closeDim = 16 * scale;
  const closeFs = 12 * scale;
  const resolvedIcon = icon ? resolveIcon(icon, undefined, iconSizePx) : null;

  const pill = (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: `${gap}px`,
        padding: `${padY}px ${padX}px`,
        backgroundColor: rc.bgStyle,
        border: rc.borderStr,
        borderRadius: `${radius}px`,
        color: rc.color,
        fontSize: `${finalFontSize}px`,
        fontWeight,
        whiteSpace: "nowrap",
        boxSizing: "border-box",
        userSelect: "none",
      }}
    >
      {resolvedIcon && (
        <Box sx={{ display: "flex", alignItems: "center", color: "inherit", "& svg": { fontSize: `${iconSizePx}px` } }}>
          {resolvedIcon}
        </Box>
      )}
      <Typography component="span" sx={{ fontSize: "inherit", fontWeight: "inherit", lineHeight: 1 }}>
        {finalText}
      </Typography>
      {closable && (
        <Box
          onClick={() => isPreview && setClosed(true)}
          sx={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: `${closeDim}px`, height: `${closeDim}px`, borderRadius: "50%",
            cursor: isPreview ? "pointer" : "default", ml: "2px",
            "&:hover": { backgroundColor: "rgba(255,255,255,0.15)" },
          }}
        >
          <Typography component="span" sx={{ fontSize: `${closeFs}px`, lineHeight: 1, color: "inherit", opacity: 0.7 }}>✕</Typography>
        </Box>
      )}
    </Box>
  );

  if (boxed) {
    return (
      <Box sx={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {pill}
      </Box>
    );
  }
  // 非 boxed 同样铺满拖动框并剧中，保证任意组件都随框缩放且内容居中
  return (
    <Box sx={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {pill}
    </Box>
  );
}