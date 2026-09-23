/**
 * 颜色口径单测（`editor/data/colorValue.ts`）。
 *
 * 这份口径是级联弹出框「悬浮 / 已选 / 光标」三态可区分的基础：
 * 悬浮与光标要浅色底（`withAlpha`），已选要在 accent 底上取可读前景色（`contrastTextOn`）。
 * 三者都被两端共用，故单独锁死。
 */
import { describe, test, expect } from "vitest";
import { parseColor, withAlpha, contrastTextOn, relativeLuminance } from "../data/colorValue";

describe("parseColor：解析各种颜色写法", () => {
  test("3 位 / 6 位 hex 展开为同值", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("#ffffff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("#1976d2")).toEqual({ r: 25, g: 118, b: 210, a: 1 });
  });

  test("4 位 / 8 位 hex 带 alpha", () => {
    const c4 = parseColor("#fff8")!;
    expect(c4.r).toBe(255);
    expect(c4.a).toBeCloseTo(136 / 255, 5);
    const c8 = parseColor("#1976d280")!;
    expect(c8.b).toBe(210);
    expect(c8.a).toBeCloseTo(128 / 255, 5);
  });

  test("rgb() / rgba()：逗号、空格、百分号都吃", () => {
    expect(parseColor("rgb(1, 2, 3)")).toEqual({ r: 1, g: 2, b: 3, a: 1 });
    expect(parseColor("rgba(1,2,3,0.5)")).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
    expect(parseColor("rgb(100%, 0%, 0%)")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor("rgba(0 0 0 / 50%)")!.a).toBeCloseTo(0.5, 5);
  });

  test("非法值一律返回 null，绝不猜一个颜色", () => {
    for (const bad of ["#12345", "#gggggg", "#", "transparent", "none", "red", "", "  ", "#1976d2x"]) {
      expect(parseColor(bad), bad).toBeNull();
    }
    expect(parseColor(null)).toBeNull();
    expect(parseColor(undefined)).toBeNull();
  });
});

describe("withAlpha：混入透明度", () => {
  test("常规混入", () => {
    expect(withAlpha("#1976d2", 0.1)).toBe("rgba(25, 118, 210, 0.1)");
    expect(withAlpha("#fff", 0.5)).toBe("rgba(255, 255, 255, 0.5)");
  });

  test("原色自带 alpha 时按乘法叠加（不会被二次混入吃掉）", () => {
    // #00000080 → a=128/255≈0.502，再乘 0.5 ≈ 0.251
    expect(withAlpha("#00000080", 0.5)).toBe("rgba(0, 0, 0, 0.251)");
  });

  test("alpha 越界夹取到 [0,1]", () => {
    expect(withAlpha("#1976d2", 2)).toBe("rgba(25, 118, 210, 1)");
    expect(withAlpha("#1976d2", -1)).toBe("rgba(25, 118, 210, 0)");
  });

  test("解析失败或 alpha 非法 → 原样返回输入（不静默替换颜色）", () => {
    expect(withAlpha("transparent", 0.5)).toBe("transparent");
    expect(withAlpha("#1976d2", Number.NaN)).toBe("#1976d2");
  });
});

describe("contrastTextOn：在给定底色上取可读前景色", () => {
  test("品牌色沿用白字（白字对比度 >= 3:1 就不翻黑）", () => {
    expect(contrastTextOn("#1976d2")).toBe("#ffffff");
    expect(contrastTextOn("#000000")).toBe("#ffffff");
  });

  test("浅色 accent 必须翻深色 —— 这正是旧实现白字只有 1.6:1 的场景", () => {
    expect(contrastTextOn("#ffc107")).toBe("rgba(0,0,0,.87)");
    expect(contrastTextOn("#ffffff")).toBe("rgba(0,0,0,.87)");
    // 中灰白字只有 2.7:1，同样要翻
    expect(contrastTextOn("#9e9e9e")).toBe("rgba(0,0,0,.87)");
  });

  test("底色无法解析 → 退回白字（与历史表现一致）", () => {
    expect(contrastTextOn("transparent")).toBe("#ffffff");
    expect(contrastTextOn("")).toBe("#ffffff");
  });

  test("相对亮度：黑 0 / 白 1 / 单调", () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0, a: 1 })).toBeCloseTo(0, 6);
    expect(relativeLuminance({ r: 255, g: 255, b: 255, a: 1 })).toBeCloseTo(1, 6);
    const mid = relativeLuminance({ r: 128, g: 128, b: 128, a: 1 });
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});
