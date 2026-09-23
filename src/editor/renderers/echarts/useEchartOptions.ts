import { useMemo } from "react";
import { scaleFont } from "./echartsCore";
import type { ComponentRendererProps } from "../../../types/editor";


/**
 * 从组件 config 中提取 ECharts 通用配置
 * - 合并暗色主题
 * - 支持数据绑定模板变量
 * - 响应式字体缩放
 */
export function useEchartOptions(
  config: ComponentRendererProps["config"],
  baseOption: Record<string, unknown>,
  fontScale: number = 1,
) {
  const isDark = (config.theme as string) !== "light";
  const customOption = config.option as Record<string, unknown> | undefined;
  const backgroundColor = config.backgroundColor as string | undefined;
  const showTitle = config.showTitle as boolean;
  const titleText = config.title as string | undefined;

  return useMemo(() => {
    const merged: Record<string, unknown> = { ...baseOption };

    // 标题
    if (showTitle !== false && titleText) {
      merged.title = {
        text: titleText,
        left: "center",
        top: 8,
        textStyle: {
          color: isDark ? "#fff" : "#333",
          fontSize: scaleFont(14, fontScale),
          fontWeight: 600,
        },
        ...((merged.title as Record<string, unknown>) || {}),
      };
    }

    // Tooltip
    if (!merged.tooltip) {
      merged.tooltip = {
        trigger: "item",
        backgroundColor: isDark ? "rgba(20,30,50,0.9)" : "rgba(255,255,255,0.95)",
        borderColor: isDark ? "rgba(0,193,222,0.3)" : "#ddd",
        textStyle: { color: isDark ? "#fff" : "#333", fontSize: scaleFont(12, fontScale) },
      };
    }

    // 背景色
    if (backgroundColor) {
      merged.backgroundColor = backgroundColor;
    }

    // 用户自定义 option 覆盖（高级模式）
    if (customOption && typeof customOption === "object" && Object.keys(customOption).length > 0) {
      deepMerge(merged, customOption);
    }

    return merged;
  }, [baseOption, customOption, isDark, showTitle, titleText, backgroundColor, fontScale]);
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>) {
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      deepMerge(
        target[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>,
      );
    } else {
      target[key] = source[key];
    }
  }
}

/**
 * 传感器仪表盘预设配置 — 对标 sprayv2 工业配色
 * sprayv2 统一三色分段: #228b22(绿) → #48b(钢蓝) → #ff4500(红)
 * 各传感器 min/max 精确取自 sprayv2 show.js / showzc.js
 */
export const SENSOR_PRESETS: Record<string, {
  min: number; max: number; unit: string; colorStops: [number, string][];
}> = {
  windSpeed: {
    min: 0.4, max: 15, unit: "m/s",
    colorStops: [[0.2, "#228b22"], [0.8, "#48b"], [1, "#ff4500"]],
  },
  windPressure: {
    min: 30, max: 110, unit: "Pa",
    colorStops: [[0.2, "#228b22"], [0.8, "#48b"], [1, "#ff4500"]],
  },
  co: {
    min: 0, max: 100, unit: "ppm",
    colorStops: [[0.2, "#228b22"], [0.8, "#48b"], [1, "#ff4500"]],
  },
  ch4: {
    min: 0, max: 100, unit: "ppm",
    colorStops: [[0.2, "#228b22"], [0.8, "#48b"], [1, "#ff4500"]],
  },
  temperature: {
    min: 0, max: 100, unit: "°C",
    colorStops: [[0.2, "#228b22"], [0.8, "#48b"], [1, "#ff4500"]],
  },
  dust: {
    min: 0, max: 10, unit: "mg/m³",
    colorStops: [[0.2, "#228b22"], [0.8, "#48b"], [1, "#ff4500"]],
  },
  flowRate: {
    min: 0, max: 100, unit: "m³/h",
    colorStops: [[0.2, "#228b22"], [0.8, "#48b"], [1, "#ff4500"]],
  },
};
