import React from "react";
import { useDatavSizeRef } from "../datavRenderSize";

export interface BaseProps {
  color1: string;
  color2: string;
  backgroundColor?: string;
  strokeWidth?: number;
  reverse?: boolean;
  dur?: number;
  editorScale?: number;
}

/**
 * 容器尺寸 = 「发布端注入的尺寸」优先，否则用 ResizeObserver 实测。
 * 两边共用同一个尺寸变量 → 同一段几何代码；发布端因此能得到与编辑区逐字一致的 SVG。
 */
export function useElementSize(): [
  React.RefObject<HTMLDivElement>,
  { width: number; height: number }
] {
  const [ref, size] = useDatavSizeRef<HTMLDivElement>();
  return [ref as React.RefObject<HTMLDivElement>, size];
}

export function withAlpha(hex: string, alpha: number): string {
  if (!hex) return `rgba(0,0,0,${alpha})`;
  const m = /^#?([a-fA-F0-9]{6})$/.exec(hex.trim());
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  const r = (v >> 16) & 0xff;
  const g = (v >> 8) & 0xff;
  const b = v & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}
