import { useId } from "react";

export interface TitleFrameConfig {
  stroke: string;
  strokeWidth: number;
  fillColor: string;
  fillOpacity: number;
  glowColor: string;
  glowEnabled: boolean;
  opacity: number;
}

export function getTitleFrameConfig(config: Record<string, unknown>): TitleFrameConfig {
  return {
    // 兼容旧字段名：wingColor → stroke
    stroke: (config.stroke as string) || (config.wingColor as string) || "#2196F3",
    strokeWidth: (config.strokeWidth as number) ?? 2,
    fillColor: (config.fillColor as string) || "rgba(33, 150, 243, 0.05)",
    fillOpacity: (config.fillOpacity as number) ?? 1,
    // 兼容旧字段：lineEffectColor → glowColor
    glowColor: (config.glowColor as string) || (config.lineEffectColor as string) || "#2196F3",
    glowEnabled: (config.glowEnabled as boolean) ?? false,
    opacity: (config.opacity as number) ?? 1,
  };
}

export function useFrameUid(): string {
  return useId().replace(/:/g, "");
}
