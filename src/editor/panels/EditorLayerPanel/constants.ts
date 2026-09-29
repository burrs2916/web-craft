/** 图层面板使用的常量：图层色板与混合模式选项。 */

export const LAYER_COLORS = [
  "#2196F3", "#4CAF50", "#FF9800", "#9C27B0",
  "#F44336", "#00BCD4", "#E91E63", "#8BC34A",
];

export const BLEND_MODES = [
  { label: "正常", value: "normal" },
  { label: "正片叠底", value: "multiply" },
  { label: "滤色", value: "screen" },
  { label: "叠加", value: "overlay" },
  { label: "变暗", value: "darken" },
  { label: "变亮", value: "lighten" },
  { label: "颜色减淡", value: "color-dodge" },
  { label: "颜色加深", value: "color-burn" },
  { label: "强光", value: "hard-light" },
  { label: "柔光", value: "soft-light" },
  { label: "差值", value: "difference" },
  { label: "排除", value: "exclusion" },
];