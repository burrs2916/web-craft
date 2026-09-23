import { describe, test, expect } from "vitest";
import { MATERIAL_ICON_PATHS, MATERIAL_FALLBACK_PATH, renderMaterialPathSvg } from "../materialIcons";

// 之前发布端字典缺失、会变圆点的代表性图标（来自 ICON_CATEGORIES）
const PREV_MISSING = [
  "category", "extension", "dashboard", "layers",
  "bar_chart", "insert_chart", "pie_chart", "show_chart", "timeline",
  "bubble_chart", "scatter_plot", "donut_large", "stacked_bar_chart", "waterfall_chart", "table_chart",
  "map", "architecture", "wallpaper", "public", "view_in_ar",
  "text_fields", "image", "crop_square", "videocam", "music_note", "palette", "timer",
];

describe("发布端图标字典 MATERIAL_ICON_PATHS：与编辑器同源且完整", () => {
  test("之前缺失的图标现已提供真实几何（不再是圆点兜底）", () => {
    for (const name of PREV_MISSING) {
      expect(MATERIAL_ICON_PATHS[name], `${name} 应在字典中`).toBeTruthy();
      // 不能是兜底圆点
      expect(MATERIAL_ICON_PATHS[name]).not.toBe(MATERIAL_FALLBACK_PATH);
      const svg = renderMaterialPathSvg(name, 20);
      expect(svg, `${name} 应渲染出 svg`).toContain("<svg");
      expect(svg, `${name} 应是真实几何而非圆点`).not.toContain(MATERIAL_FALLBACK_PATH);
    }
  });

  test("多形状图标（如 bubble_chart 用 circle）几何完整保留", () => {
    const bubble = renderMaterialPathSvg("bubble_chart", 20);
    expect(bubble).toContain("<circle");
    expect(bubble).not.toContain(MATERIAL_FALLBACK_PATH);
  });

  test("未命中名称回退到圆点兜底且不空白", () => {
    const svg = renderMaterialPathSvg("definitely_not_an_icon_xyz", 20);
    expect(svg).toContain(MATERIAL_FALLBACK_PATH);
    expect(svg).toContain("<svg");
  });

  test("几何均为 24x24 且 currentColor 跟随文字色", () => {
    const svg = renderMaterialPathSvg("folder", 24);
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain("fill:currentColor");
  });
});
