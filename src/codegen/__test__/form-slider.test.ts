import { describe, test, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import { FormSliderRenderer } from "../../editor/renderers/FormSliderRenderer";
import {
  resolveSliderStyle,
  sliderLabelRowCss,
  sliderLabelCss,
  sliderValueCss,
  sliderRowCss,
  sliderEndpointCss,
  sliderBubbleCss,
  sliderValueText,
  sliderThumbLeft,
  sliderTicksOf,
  sliderTickLayerCss,
  sliderTickCss,
  SLIDER_SIZES,
  SLIDER_BUBBLE_RESERVE,
} from "../../editor/data/sliderStyle";
import { cssText } from "../../editor/data/cssDecls";

initBuiltinCodegens();

/**
 * 滑块的双端一致性 + 属性栏能力锁。
 *
 * 为什么需要：滑块由多部件组成（标签行 / 轨道 / 填充条 / 滑块 / 端点数值 / 数值气泡）。
 * 此前编辑区渲染器自己写样式、自己抄了一份 `SLIDER_SIZES`，发布端另有一份 —— 两端一致靠人眼。
 * 现在两端都只读 `editor/data/sliderStyle.ts`，本用例把「产物里的声明」与「那一份声明」逐项比对。
 */

function sliderComp(config: Record<string, unknown>): SceneComponent {
  return {
    id: "sl1",
    type: "form-slider",
    name: "Slider",
    transform: createDefaultTransform({ x: 0, y: 0, width: 280, height: 56 }),
    layerId: "l1",
    zIndex: 0,
    locked: false,
    visible: true,
    config,
    children: [],
    parentId: null,
  };
}

const ctx = { pageScripts: [], pageStyles: [] } as never;
const render = (config: Record<string, unknown>): string => getCodegen("form-slider")!(sliderComp(config), ctx);

function decls(style: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const d of style.split(";")) {
    const i = d.indexOf(":");
    if (i < 0) continue;
    map[d.slice(0, i).trim()] = d.slice(i + 1).trim();
  }
  return map;
}

/** 取产物中某个 `attr style="…"` 元素的声明表（span / div 通用） */
function declsOf(html: string, attr: string): Record<string, string> {
  return decls((html.match(new RegExp(`<(?:span|div) ${attr} style="([^"]*)"`)) || [])[1] ?? "");
}
/** 取产物里第一个标签行容器（两端对齐的 flex 行）的声明表 */
function labelRowDecls(html: string): Record<string, string> {
  return decls((html.match(/<div style="(display:flex;justify-content:space-between[^"]*)"/) || [])[1] ?? "");
}

function renderEditor(config: Record<string, unknown>): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToStaticMarkup(createElement(FormSliderRenderer as any, { config, componentId: "s1" } as any));
}

describe("form-slider：编辑区 ↔ 发布端逐部件同源", () => {
  test("标签行容器声明 = sliderLabelRowCss()", () => {
    expect(labelRowDecls(render({ label: "音量" }))).toEqual(decls(cssText(sliderLabelRowCss())));
  });

  test("标签文字声明 = sliderLabelCss(resolveSliderStyle(cfg))", () => {
    const cfg = { label: "音量", labelColor: "#123456", labelFontSize: 16, fontWeight: "bold" };
    const s = resolveSliderStyle(cfg);
    expect(declsOf(render(cfg), "data-slider-label")).toEqual(decls(cssText(sliderLabelCss(s))));
  });

  test("数值回显声明与文本 = sliderValueCss / sliderValueText（含单位）", () => {
    const cfg = { label: "音量", value: 30, valueSuffix: "%", accentColor: "#ff5722" };
    const s = resolveSliderStyle(cfg);
    const html = render(cfg);
    expect(declsOf(html, "data-slider-value")).toEqual(decls(cssText(sliderValueCss(s))));
    expect(html).toContain(">30%</span>");
    expect(sliderValueText(s)).toBe("30%");
  });

  test("轨道行容器声明 = sliderRowCss（含气泡预留与禁用态透明度）", () => {
    for (const cfg of [{ label: "x" }, { label: "x", valueBubble: true }, { label: "x", disabled: true }]) {
      const s = resolveSliderStyle(cfg);
      const html = render(cfg);
      const row = decls((html.match(/<div style="(position:relative;box-sizing:border-box;[^"]*)"/) || [])[1] ?? "");
      expect(row, JSON.stringify(cfg)).toEqual(decls(cssText(sliderRowCss(s))));
    }
  });

  test("端点数值声明 = sliderEndpointCss()，且默认不输出", () => {
    const off = render({ label: "x" });
    expect(off).not.toContain("data-slider-endpoints");
    const on = render({ label: "x", min: 10, max: 90, showMinMax: true });
    expect(on).toContain("data-slider-endpoints");
    expect(on).toContain("><span>10</span><span>90</span></span>");
    expect(declsOf(on, "data-slider-endpoints")).toEqual(decls(cssText(sliderEndpointCss())));
  });

  test("气泡声明与位置 = sliderBubbleCss(s)，位置取百分比公式", () => {
    const cfg = { label: "x", min: 0, max: 200, value: 50, valueBubble: true };
    const s = resolveSliderStyle(cfg);
    expect(s.pct).toBe(25);
    const html = render(cfg);
    expect(declsOf(html, "data-slider-bubble")).toEqual(decls(cssText(sliderBubbleCss(s))));
    expect(html).toContain(">50</span>");
  });

  test("滑块左偏移与脚本用同一表达式 sliderThumbLeft", () => {
    const cfg = { label: "x", min: 0, max: 200, value: 50, size: "large" };
    const s = resolveSliderStyle(cfg);
    const html = render(cfg);
    expect(html).toContain(`left:${sliderThumbLeft(s.pct, s.size.thumb)}`);
    // 交互脚本里的位移公式必须与初始渲染一致（否则拖动后滑块会跳位）
    expect(html).toContain(`'calc('+p+'% - ${s.size.thumb / 2}px)'`);
  });

  test("拖动时同步四处：填充条 / 滑块 / 标签行数值 / 数值气泡", () => {
    const html = render({ label: "x", valueBubble: true, showValue: true });
    const handler = (html.match(/oninput="([^"]*)"/) || [])[1] ?? "";
    for (const sel of ["[data-slider-track]", "[data-slider-thumb]", "[data-slider-bubble]", "[data-slider-value]"]) {
      expect(handler, `拖动脚本没有同步 ${sel}`).toContain(sel);
    }
    // 气泡既有位移也有文本更新
    expect(handler).toMatch(/bo\.style\.left=p\+'%'/);
    expect(handler).toMatch(/bo\.textContent=txt/);
  });

  test("值后缀带引号/尖括号也不会破坏 oninput 属性（P0 回归锁）", () => {
    // 实测血案：JSON.stringify("%") 产出带双引号的 "%%"，直接拼进 oninput="…" 会让属性提前闭合
    // → 处理器被截断成 `var txt=this.value+`（语法错误，整个 handler 失效）＋ 页面多出
    //   `%";var`、`lb` 两个垃圾属性，拖动滑块时填充条/滑块/数值全都不动。
    for (const suffix of ["%", '"', "'", "<b>", 'a"b']) {
      const html = render({ label: "x", valueSuffix: suffix, valueBubble: true });
      const m = html.match(/oninput="([^"]*)"/);
      expect(m, `后缀 ${suffix} 让 oninput 属性丢失`).toBeTruthy();
      const handler = m![1];
      // 属性值内不得出现裸双引号；且整段处理器必须完整（含最后的数值回显同步）
      expect(handler).not.toContain('"');
      expect(handler).toContain("[data-slider-value]");
      expect(handler.startsWith("var p=")).toBe(true);
    }
    // 属性里剩余的裸双引号数量必须为 0：只有 oninput="…" 的一对
    const out = render({ label: "x", valueSuffix: "%" });
    expect((out.match(/oninput="/g) ?? []).length).toBe(1);
    expect(out).not.toMatch(/%";var/);
  });

  test("尺寸档只有一份（编辑区渲染器与发布端共读 SLIDER_SIZES）", () => {
    for (const key of ["small", "medium", "large"]) {
      const s = resolveSliderStyle({ size: key });
      expect(s.size).toEqual(SLIDER_SIZES[key]);
      expect(render({ label: "x", size: key })).toContain(`height:${SLIDER_SIZES[key].track}px`);
    }
  });

  test("编辑区结构：标签行 / 轨道行 / 气泡 / 端点数值 各自带钩子", () => {
    const html = renderEditor({ label: "音量", value: 30, valueSuffix: "%", showMinMax: true, valueBubble: true });
    expect(html).toContain('data-wc-slider-value="1"');
    expect(html).toContain("30%");
    expect(html).toContain('data-wc-slider-bubble="1"');
    expect(html).toContain('data-wc-slider-endpoints="1"');
    // 关闭时两条可选部件都不出现
    const plain = renderEditor({ label: "音量" });
    expect(plain).not.toContain('data-wc-slider-bubble="1"');
    expect(plain).not.toContain('data-wc-slider-endpoints="1"');
  });

  test("气泡预留高度是个常量而非各处硬编码（两端同值）", () => {
    expect(SLIDER_BUBBLE_RESERVE).toBeGreaterThan(0);
    const s = resolveSliderStyle({ size: "medium", valueBubble: true });
    const row = decls(cssText(sliderRowCss(s)));
    expect(row.height).toBe(`${SLIDER_SIZES.medium.row + SLIDER_BUBBLE_RESERVE}px`);
    expect(row["padding-top"]).toBe(`${SLIDER_BUBBLE_RESERVE}px`);
    expect(row["box-sizing"]).toBe("border-box");
    // 关闭气泡时不应留出空白
    const off = decls(cssText(sliderRowCss(resolveSliderStyle({ size: "medium" }))));
    expect(off.height).toBe(`${SLIDER_SIZES.medium.row}px`);
    expect(off["padding-top"]).toBeUndefined();
  });
});

describe("form-slider：取值收敛（越界一律夹紧，两端同值）", () => {
  test("默认值越界被夹到区间内", () => {
    expect(resolveSliderStyle({ min: 0, max: 10, value: 999 }).value).toBe(10);
    expect(resolveSliderStyle({ min: 0, max: 10, value: -5 }).value).toBe(0);
    expect(resolveSliderStyle({ min: 0, max: 10, value: "abc" }).value).toBe(0);
    expect(render({ min: 0, max: 10, value: 999 })).toContain('value="10"');
  });

  test("max 不大于 min 时回退 min+100（与历史行为逐字一致）", () => {
    const s = resolveSliderStyle({ min: 20, max: 10 });
    expect(s.max).toBe(120);
    expect(s.pct).toBe(30);
  });
});

describe("form-slider：面板控件必须能改变产物（假能力回归锁）", () => {
  const CASES: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
    ["label", { label: "甲" }, { label: "乙" }],
    ["min", { min: 0 }, { min: 5 }],
    ["max", { max: 100 }, { max: 200 }],
    ["step", { step: 1 }, { step: 5 }],
    ["value", { value: 10 }, { value: 60 }],
    ["showValue", { showValue: true }, { showValue: false }],
    ["valueSuffix", { valueSuffix: "" }, { valueSuffix: "%" }],
    ["valueBubble", { valueBubble: false }, { valueBubble: true }],
    ["showMinMax", { showMinMax: false }, { showMinMax: true }],
    ["helperText", { helperText: "" }, { helperText: "拖动调节" }],
    ["size", { size: "small" }, { size: "large" }],
    ["textColor", { textColor: "#111111" }, { textColor: "#eeeeee" }],
    ["accentColor", { accentColor: "#111111" }, { accentColor: "#00ff00" }],
    ["fontSize", { fontSize: 12 }, { fontSize: 20 }],
    ["fontWeight", { fontWeight: "normal" }, { fontWeight: "bold" }],
    ["labelColor", { labelColor: "" }, { labelColor: "#ff0000" }],
    ["labelFontSize", { labelFontSize: 0 }, { labelFontSize: 20 }],
    ["disabled", { disabled: false }, { disabled: true }],
    // 本轮（#9）新增：刻度标记四件套
    ["showTicks", { showTicks: false }, { showTicks: true }],
    ["tickCount", { showTicks: true, tickCount: 3 }, { showTicks: true, tickCount: 9 }],
    ["tickSize", { showTicks: true, tickSize: 6 }, { showTicks: true, tickSize: 18 }],
    ["tickColor", { showTicks: true, tickColor: "" }, { showTicks: true, tickColor: "#ff0000" }],
  ];

  for (const [key, a, b] of CASES) {
    test(`${key} 改了产物就变`, () => {
      expect(render(a), `${key} 是假控件：两个取值产物完全相同`).not.toBe(render(b));
    });
  }
});

/**
 * 滑块「刻度标记」（本轮 #9 新增能力）。
 *
 * 位置口径与填充条 / 滑块 / 数值气泡**完全一致**（同一百分比原点），
 * 故拖动时不会与刻度错位；两端共用 `sliderTicksOf` 生成同一组百分比。
 */
describe("form-slider：刻度标记", () => {
  const cfg = { label: "音量", min: 0, max: 100, value: 50, showTicks: true, tickCount: 5, tickSize: 10, tickColor: "#ff0000" };

  test("未开启时不输出刻度层（默认态零回归）", () => {
    const out = render({ label: "音量", min: 0, max: 100, value: 50 });
    expect(out).not.toContain("data-slider-ticks");
  });

  test("开启后按 tickCount 等距绘制，落在首尾 0% / 100%", () => {
    const out = render(cfg);
    const spans = out.match(/<span style="[^"]*position:absolute[^"]*"><\/span>/g) ?? [];
    expect(spans.length).toBe(5);
    // 首刻度 left:0%、末刻度 left:100%（与轨道两端重合）
    expect(out).toContain(`left:0%`);
    expect(out).toContain(`left:100%`);
    expect(out).toContain(`left:25%`);
    expect(out).toContain(`left:75%`);
    // 几何：2px 宽 + tickSize 高 + 居中偏移（-1px / -tickSize/2）
    const tick = sliderTickCss(resolveSliderStyle(cfg), 25);
    expect(cssText(tick)).toBe("position:absolute;left:25%;top:50%;width:2px;height:10px;margin-left:-1px;margin-top:-5px;border-radius:1px;background:#ff0000;opacity:0.45");
  });

  test("刻度层不吃指针事件（下层是隐形的原生 range）", () => {
    const layer = cssText(sliderTickLayerCss(resolveSliderStyle(cfg)));
    expect(layer).toContain("pointer-events:none");
    expect(layer).toContain("position:absolute");
    // 与轨道同一水平基准：left/right 铺满、top:50%
    expect(layer).toContain("left:0");
    expect(layer).toContain("right:0");
    expect(layer).toContain("top:50%");
  });

  test("tickColor 留空时跟随滑块强调色（单一来源）", () => {
    const s = resolveSliderStyle({ ...cfg, tickColor: "", accentColor: "#00ff00" });
    expect(cssText(sliderTickCss(s, 50))).toContain("background:#00ff00");
  });

  test("取值收敛：tickCount 夹在 2~21，tickSize 越界回默认 8", () => {
    expect(resolveSliderStyle({ showTicks: true, tickCount: 1 }).tickCount).toBe(2);
    expect(resolveSliderStyle({ showTicks: true, tickCount: 99 }).tickCount).toBe(21);
    expect(resolveSliderStyle({ showTicks: true, tickCount: 7.6 }).tickCount).toBe(8);
    expect(resolveSliderStyle({ showTicks: true, tickSize: 2 }).tickSize).toBe(8);
    expect(resolveSliderStyle({ showTicks: true, tickSize: 99 }).tickSize).toBe(8);
    expect(resolveSliderStyle({ showTicks: true, tickSize: 12 }).tickSize).toBe(12);
  });

  test("百分比序列：两端必为 0 与 100，且等距（与填充条/气泡同一原点）", () => {
    const seq = sliderTicksOf(resolveSliderStyle({ ...cfg, tickCount: 5 }));
    expect(seq).toEqual([0, 25, 50, 75, 100]);
    const seq2 = sliderTicksOf(resolveSliderStyle({ ...cfg, tickCount: 3 }));
    expect(seq2).toEqual([0, 50, 100]);
  });

  test("编辑区渲染器同样读唯一口径（两端同源）", () => {
    const html = renderEditor(cfg);
    expect(html).toContain("data-wc-slider-ticks");
    const n = (html.match(/data-wc-slider-tick=/g) ?? []).length;
    expect(n).toBe(5);
  });
});
