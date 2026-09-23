import { useMemo, useRef, useEffect } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingFlatIcon from "@mui/icons-material/TrendingFlat";
import type { ComponentRendererProps } from "../../types/editor";
import { useApiDataFetch } from "../hooks/useApiDataFetch";
import { useDataSourceBinding } from "../../hooks/useDataSourceBinding";
import { buildMetricIconSvg } from "../utils/metricIcons";
import { readAuthEnabled } from "../data/authMode";

interface StatusRule {
  min?: number;
  max?: number;
  color?: string;
  label?: string;
}

export function MetricRenderer({ config, componentId }: ComponentRendererProps) {
  // ── 基础配置 ──
  const title = (config.title as string) || "指标名称";
  const subtitle = (config.subtitle as string) || "";
  const unit = (config.unit as string) || "";
  const prefix = (config.prefix as string) || "";
  const suffix = (config.suffix as string) || "";
  const showTrend = (config.showTrend as boolean) ?? true;
  const precision = (config.precision as number) ?? 1;
  const color = (config.color as string) || "#2196F3";
  const valueColor = (config.valueColor as string) || color;
  const titleColor = (config.titleColor as string) || "rgba(255,255,255,0.5)";
  const subtitleColor = (config.subtitleColor as string) || "rgba(255,255,255,0.35)";
  const unitColor = (config.unitColor as string) || "rgba(255,255,255,0.4)";
  const prefixColor = (config.prefixColor as string) || unitColor;
  const suffixColor = (config.suffixColor as string) || unitColor;
  const fontSize = (config.fontSize as number) || 28;
  const titleFontSize = (config.titleFontSize as number) || 11;
  const subtitleFontSize = (config.subtitleFontSize as number) || 10;
  const backgroundColor = (config.backgroundColor as string) || "rgba(0,0,0,0.2)";
  const borderRadius = (config.borderRadius as number) ?? 4;
  const padding = (config.padding as number) ?? 12;
  const statusRules = (config.statusRules as StatusRule[]) || [];
  const field = (config.field as string) || "";
  const icon = (config.icon as string) || "";
  const layout = (config.layout as string) || "vertical"; // vertical | horizontal

  // ── 统一数据获取 hook ──
  const dataMode = (config.dataMode as string) || "static";
  const dataSourceId = (config.dataSourceId as string) || "";
  // datasource 模式：订阅数据源缓存（无 provider 时 hook 安全返回空）
  const { componentData } = useDataSourceBinding(
    componentId,
    dataMode === "datasource" && dataSourceId ? [dataSourceId] : undefined,
  );
  // staticData 为空时回退到 config.value（向后兼容旧配置）
  const hasExplicitStaticData = config.staticData != null && config.staticData !== "";

  const { data: fetchedData, error: apiError } = useApiDataFetch<number | string>({
    dataMode: dataMode === "api" ? "api" : "static",
    staticData: hasExplicitStaticData ? config.staticData : config.value,
    apiPath: (config.apiPath as string) || "",
    apiUrl: (config.apiUrl as string) || "",
    apiMethod: ((config.apiMethod as string) || "GET") as "GET" | "POST",
    apiBody: config.apiBody,
    apiHeaders: config.apiHeaders,
    apiInterval: (config.apiInterval as number) ?? 0,
    apiDataPath: (config.apiDataPath as string) || "",
    authEnabled: readAuthEnabled(config.authEnabled),
  });

  // ── 数值计算 ──
  // datasource：从数据源订阅缓存取值；其余模式回退到 config.data（旧注入方式）
  const boundData = (dataMode === "datasource" && dataSourceId
    ? (componentData[dataSourceId] as Record<string, unknown>)
    : (config.data as Record<string, unknown>)
  ) || {};
  const rawValue =
    dataMode === "api"
      ? fetchedData ?? "--"
      : dataMode === "datasource"
        ? (field
            ? (boundData as Record<string, unknown>)[field]
            : boundData[dataSourceId] ?? config.value)
          ?? config.value
        : field
          ? boundData[field]
          : (fetchedData ?? config.value);
  const numericValue = typeof rawValue === "number" ? rawValue : parseFloat(String(rawValue ?? "--"));
  const isNumeric = !isNaN(numericValue);

  // ── 趋势追踪 ──
  // 仅动态数据模式（API 轮询 / 数据源绑定）展示趋势；静态模式值不变化，
  // 避免无关 re-render 产生虚假 flat 趋势
  const isDynamicData = dataMode === "api" || dataMode === "datasource";
  const prevValueRef = useRef<number | null>(null);
  const trend = useMemo(() => {
    if (!showTrend || !isNumeric || !isDynamicData) return "none";
    if (prevValueRef.current === null) return "none";
    if (numericValue > prevValueRef.current) return "up";
    if (numericValue < prevValueRef.current) return "down";
    return "flat";
  }, [showTrend, isNumeric, isDynamicData, numericValue]);

  useEffect(() => {
    if (isNumeric && isDynamicData) {
      prevValueRef.current = numericValue;
    }
  }, [isNumeric, isDynamicData, numericValue]);

  // ── 趋势百分比（同比/环比，保留正负号）──
  const trendPercent = useMemo(() => {
    if (!showTrend || !isNumeric || !isDynamicData || prevValueRef.current === null || prevValueRef.current === 0) return null;
    const diff = ((numericValue - prevValueRef.current) / Math.abs(prevValueRef.current)) * 100;
    const sign = diff >= 0 ? "+" : "-";
    return `${sign}${Math.abs(diff).toFixed(1)}`;
  }, [showTrend, isNumeric, isDynamicData, numericValue]);

  // 千分位格式化（与发布端 toLocaleString("en-US") 一致）
  const displayValue = useMemo(() => {
    if (!isNumeric) return String(rawValue ?? "--");
    return numericValue.toLocaleString("en-US", {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    });
  }, [isNumeric, rawValue, numericValue, precision]);

  // ── 状态规则匹配 ──
  const activeStatus = useMemo(() => {
    if (!isNumeric || statusRules.length === 0) return null;
    for (const rule of statusRules) {
      const minOk = rule.min === undefined || numericValue >= rule.min;
      const maxOk = rule.max === undefined || numericValue < rule.max;
      if (minOk && maxOk) return rule;
    }
    return null;
  }, [isNumeric, numericValue, statusRules]);

  const activeColor = activeStatus?.color || valueColor;
  const trendColor = trend === "up" ? "#4CAF50" : trend === "down" ? "#F44336" : "rgba(255,255,255,0.3)";
  const TrendIcon = trend === "up" ? TrendingUpIcon : trend === "down" ? TrendingDownIcon : TrendingFlatIcon;

  // ── 布局样式 ──
  const isHorizontal = layout === "horizontal";

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: isHorizontal ? "row" : "column",
        alignItems: isHorizontal ? "center" : "stretch",
        justifyContent: isHorizontal ? "space-between" : "center",
        p: `${padding / 8}px`,
        backgroundColor,
        borderRadius: `${borderRadius}px`,
        border: `1px solid ${activeColor}22`,
        position: "relative",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {/* 顶部强调条 */}
      <Box
        sx={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: `linear-gradient(90deg, ${activeColor}, ${activeColor}88)`,
          transition: "background 0.3s ease",
        }}
      />

      {/* 图标（Lucide 风格 SVG，未知图标名降级不渲染） */}
      {icon && buildMetricIconSvg(icon, fontSize * 0.7, activeColor) && (
        <Box
          component="span"
          sx={{
            mr: isHorizontal ? 1 : 0,
            mb: isHorizontal ? 0 : 0.5,
            opacity: 0.8,
            lineHeight: 1,
            display: "inline-flex",
            alignItems: "center",
          }}
          dangerouslySetInnerHTML={{ __html: buildMetricIconSvg(icon, fontSize * 0.7, activeColor) }}
        />
      )}

      {/* 标题 + 副标题 */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            color: titleColor,
            mb: subtitle ? 0.25 : 0.75,
            fontSize: titleFontSize,
            letterSpacing: 0.5,
            lineHeight: 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography
            sx={{
              color: subtitleColor,
              mb: 0.5,
              fontSize: subtitleFontSize,
              lineHeight: 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>

      {/* 数值行 */}
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.5, flexShrink: 0 }}>
        {prefix && (
          <Typography sx={{ color: prefixColor, fontSize: fontSize * 0.45, lineHeight: 1 }}>
            {prefix}
          </Typography>
        )}
        <Typography
          sx={{
            fontWeight: 700,
            color: activeColor,
            lineHeight: 1,
            fontSize,
            transition: "color 0.3s ease",
          }}
        >
          {displayValue}
        </Typography>
        {unit && (
          <Typography sx={{ color: unitColor, fontSize: fontSize * 0.4, lineHeight: 1 }}>
            {unit}
          </Typography>
        )}
        {suffix && (
          <Typography sx={{ color: suffixColor, fontSize: fontSize * 0.4, lineHeight: 1 }}>
            {suffix}
          </Typography>
        )}
      </Box>

      {/* 趋势 + 百分比 */}
      {showTrend && trend !== "none" && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, ml: 0.5, flexShrink: 0 }}>
          <TrendIcon sx={{ fontSize: fontSize * 0.5, color: trendColor }} />
          {trendPercent && (
            <Typography sx={{ color: trendColor, fontSize: titleFontSize, fontWeight: 600, lineHeight: 1 }}>
              {trendPercent}%
            </Typography>
          )}
        </Box>
      )}

      {/* 状态标签 */}
      {activeStatus?.label && (
        <Typography sx={{ color: activeColor, fontSize: 9, mt: 0.5, opacity: 0.7 }}>
          {activeStatus.label}
        </Typography>
      )}

      {/* API 错误提示 */}
      {apiError && dataMode === "api" && (
        <Typography sx={{ color: "#F44336", fontSize: 9, mt: 0.25, opacity: 0.6 }}>
          {apiError}
        </Typography>
      )}
      {/* 加载中提示 */}
      {dataMode === "api" && fetchedData == null && !apiError && (
        <Typography sx={{ color: "rgba(255,255,255,0.3)", fontSize: 9, mt: 0.25 }}>
          加载中...
        </Typography>
      )}
    </Box>
  );
}
