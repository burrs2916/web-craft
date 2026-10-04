import {
  ScanBorder12,
  PolylineBorder13,
  DotMatrixDeco1,
  ScanLineDeco2,
  FlickerDotsDeco3,
  GradientBorderDeco4,
  PolylineDeco5,
  BarJumpingDeco6,
} from "../../renderers/datavScalable";

type DataVComp = React.ComponentType<any>;

export const BORDER_MAP: Record<string, DataVComp> = {
  "12": ScanBorder12,
  "13": PolylineBorder13,
};

export const DECO_MAP: Record<string, DataVComp> = {
  "1": DotMatrixDeco1, "2": ScanLineDeco2, "3": FlickerDotsDeco3,
  "4": GradientBorderDeco4, "5": PolylineDeco5, "6": BarJumpingDeco6,
};

export const BORDER_DEFAULTS: Record<string, [string, string]> = {
  "1": ["#4fd2dd", "#235fa7"], "2": ["#fff", "rgba(255,255,255,0.6)"],
  "3": ["#2862b7", "#2862b7"], "4": ["red", "rgba(0,0,255,0.8)"],
  "5": ["rgba(255,255,255,0.35)", "rgba(255,255,255,0.20)"],
  "6": ["rgba(255,255,255,0.35)", "gray"],
  "7": ["rgba(128,128,128,0.3)", "rgba(128,128,128,0.5)"],
  "8": ["#235fa7", "#4fd2dd"], "9": ["#11eefd", "#0078d2"],
  "10": ["#1d48c4", "#d3e1f8"], "11": ["#e1b86c", "#8c5c00"],
  "12": ["#2e6099", "#7ce7fd"], "13": ["#6586ec", "#2cf7fe"],
};

export const DECO_DEFAULTS: Record<string, [string, string]> = {
  "1": ["#fff", "#0de7c2"], "2": ["#3faacb", "#fff"],
  "3": ["#7acaec", "transparent"], "4": ["rgba(255,255,255,0.3)", "rgba(255,255,255,0.3)"],
  "5": ["#3f96a5", "#3f96a5"], "6": ["#7acaec", "#7acaec"],
  "7": ["#1dc1f5", "#1dc1f5"], "8": ["#3f96a5", "#3f96a5"],
  "9": ["rgba(3,166,224,0.8)", "rgba(3,166,224,0.5)"],
  "10": ["#00c2ff", "rgba(0,194,255,0.3)"], "11": ["#1a98fc", "#2cf7fe"],
  "12": ["#2783ce", "#2cf7fe"],
};

export const SVG_THUMB_TYPES = new Set(["text", "image", "shape"]);

export function parseDataVType(type: string): { kind: "border" | "decoration"; idx: string } | null {
  const borderMatch = type.match(/^datav-border-(\d+)$/);
  if (borderMatch) return { kind: "border", idx: borderMatch[1] };
  const decoMatch = type.match(/^datav-decoration-(\d+)$/);
  if (decoMatch) return { kind: "decoration", idx: decoMatch[1] };
  return null;
}