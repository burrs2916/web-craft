import { describe, test, expect, beforeAll } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import { decorationShape, svgAttrText } from "../../editor/data/decorationShape";
import { DECORATION_SHAPE_KINDS } from "../components/decoration";
import { componentRegistry } from "../../editor/registry";
import { registerDecorationComponents } from "../../editor/registerDecorationComponents";

initBuiltinCodegens();
let rectCfg: Record<string, unknown> = {};
beforeAll(() => {
  registerDecorationComponents();
  rectCfg = componentRegistry.get("decoration-rect")!.defaultConfig as Record<string, unknown>;
});

function comp(type: string, config: Record<string, unknown>, w = 200, h = 150): SceneComponent {
  return {
    id: "c1",
    type,
    name: type,
    transform: createDefaultTransform({ x: 0, y: 0, width: w, height: h }),
    layerId: "l1",
    zIndex: 0,
    locked: false,
    visible: true,
    config,
    children: [],
    parentId: null,
  };
}

function render(type: string, config: Record<string, unknown>, w?: number, h?: number): string {
  const fn = getCodegen(type);
  expect(fn, `缺少 ${type} 的 codegen`).toBeTruthy();
  const ctx = { pageStyles: [], pageScripts: [], preview: false } as never;
  return fn!(comp(type, config, w, h), ctx);
}


describe("装饰组件组：发布端覆盖（0 → 1 的回归锁）", () => {
  /**
   * 这是本轮修复的核心缺陷：`ccat_decoration` 组此前在 codegen 注册表里**一个都没有**，
   * 发布产物是空 div、预览是「codegen 待实现」占位块。
   * 本用例保证「注册表里出现的每一个 decoration-* 形状都有发布端实现」——
   * 以后有人加形状却忘了注册 codegen，这里立刻红。
   */
  test("注册表中的每个 decoration-* 形状都有 codegen", () => {
    const shapes = (componentRegistry.getAll() as Array<{ type: string; category: string }>)
      .filter((c) => c.category === "ccat_decoration" && c.type.startsWith("decoration-"));
    expect(shapes.length).toBeGreaterThan(0);
    const missing = shapes.filter((c) => !getCodegen(c.type)).map((c) => c.type);
    expect(missing).toEqual([]);
    // 形状清单与注册表双向一致（防止清单里写了不存在的类型）
    const registered = new Set(shapes.map((c) => c.type));
    expect(DECORATION_SHAPE_KINDS.filter((k) => !registered.has(k))).toEqual([]);
  });

  test("每个形状都产出非空 svg，且不再是占位块", () => {
    for (const kind of DECORATION_SHAPE_KINDS) {
      const cfg = componentRegistry.get(kind)?.defaultConfig ?? rectCfg;
      const out = render(kind, cfg);
      expect(out, kind).toContain("<svg");
      expect(out, kind).toContain("</svg>");
      expect(out, kind).not.toContain("codegen 待实现");
      expect(out.replace(/\s/g, ""), kind).not.toBe("<divstyle=\"width:100%;height:100%\"></div>");
    }
  });

  test("发布端图元与共享口径逐字一致（不是各写一份）", () => {
    for (const kind of DECORATION_SHAPE_KINDS) {
      const cfg = componentRegistry.get(kind)?.defaultConfig ?? rectCfg;
      // uid 与 codegen 内部的 safeId(component.id) 同源：id 为 "c1" → "dc1"
      const spec = decorationShape(kind, cfg, { width: 200, height: 150, uid: "dc1" });
      const out = render(kind, cfg);
      for (const p of spec.primitives) {
        expect(out, `${kind} 缺图元 ${p.tag}`).toContain(`<${p.tag} `);
        expect(out, `${kind} 图元属性不一致`).toContain(svgAttrText(p.attrs));
      }
      expect(out).toContain(`viewBox="${spec.viewBox}"`);
      expect(out).toContain(`preserveAspectRatio="${spec.preserveAspectRatio}"`);
    }
  });
});

describe("装饰形状：几何口径", () => {
  test("矩形：描边占半宽、圆角按像素进 rx", () => {
    const out = render("decoration-rect", { fill: "#111111", stroke: "#222222", strokeWidth: 4, borderRadius: 8, opacity: 1 });
    expect(out).toContain('<rect x="2" y="2" width="96" height="96" rx="8" ry="8"');
    expect(out).toContain('stroke="#222222"');
    expect(out).toContain('vector-effect="non-scaling-stroke"');
  });

  test("矩形：borderStyle=none 与 strokeWidth=0 都不描边", () => {
    expect(render("decoration-rect", { ...rectCfg, borderStyle: "none" })).toContain('stroke="none"');
    expect(render("decoration-rect", { ...rectCfg, strokeWidth: 0 })).toContain('stroke="none"');
  });

  test("圆：保持长宽比（meet），半径扣掉半个描边", () => {
    const out = render("decoration-circle", { ...rectCfg, strokeWidth: 2 });
    expect(out).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(out).toContain('<circle cx="50" cy="50" r="49"');
  });

  test("椭圆：viewBox 用拖动框真实尺寸（保证椭圆不变形）", () => {
    const out = render("decoration-ellipse", { ...rectCfg, strokeWidth: 0 }, 300, 100);
    expect(out).toContain('viewBox="0 0 300 100"');
    expect(out).toContain('rx="150"');
    expect(out).toContain('ry="50"');
  });

  test("正多边形：顶点数 = sides", () => {
    const out = render("decoration-polygon", { ...rectCfg, sides: 5 });
    const m = out.match(/points="([^"]+)"/);
    expect(m).toBeTruthy();
    expect(m![1].split(" ").length).toBe(5);
  });

  test("星形：顶点数 = points * 2（内外交替）", () => {
    const out = render("decoration-star", { ...rectCfg, points: 6, innerRatio: 0.5 });
    const d = out.match(/ d="([^"]+)"/)![1];
    expect(d.match(/L /g)!.length).toBe(11);
    expect(d.endsWith("Z")).toBe(true);
  });

  test("圆环：strokeWidth > 0 时追加内环", () => {
    const one = render("decoration-ring", { ...rectCfg, ringWidth: 6, strokeWidth: 0 });
    expect(one.match(/<circle /g)!.length).toBe(1);
    const two = render("decoration-ring", { ...rectCfg, ringWidth: 6, strokeWidth: 2 });
    expect(two.match(/<circle /g)!.length).toBe(2);
  });

  test("分隔线：double 画两条、gradient 走渐变引用", () => {
    expect(render("decoration-divider", { ...rectCfg, style: "double" }).match(/<line /g)!.length).toBe(2);
    const grad = render("decoration-divider", { ...rectCfg, style: "gradient", stroke: "#ff0000" });
    expect(grad).toContain("<linearGradient");
    expect(grad).toContain('stroke="url(#divider-grad-');
  });

  test("网格/点阵：图元数量随间距变化", () => {
    const grid = render("decoration-grid", { ...rectCfg, spacing: 25 });
    // 25/50/75 各 3 条竖线 + 3 条横线
    expect(grid.match(/<line /g)!.length).toBe(6);
    const dots = render("decoration-dots-pattern", { ...rectCfg, spacing: 25, shape: "circle" });
    expect(dots.match(/<circle /g)!.length).toBe(3 * 3);
  });

  test("渐变块：静态用 defs+url，动画版注入关键帧与 clipPath", () => {
    const ctx = { pageStyles: [], pageScripts: [], preview: false } as never;
    const fn = getCodegen("decoration-gradient")!;
    const animated = fn(comp("decoration-gradient", { gradientFrom: "#000", gradientTo: "#fff", direction: "to-right", animated: true, speed: 1000 }), ctx);
    expect(animated).toContain("<clipPath");
    expect((ctx as { pageStyles: string[] }).pageStyles.join("")).toContain("deco-grad-shift");
    // 同页多个组件不重复注入
    fn(comp("decoration-gradient", { animated: true }), ctx);
    expect((ctx as { pageStyles: string[] }).pageStyles.filter((s) => s.includes("deco-grad-shift")).length).toBe(1);
  });

  test("角标：按 position 决定画几条折线", () => {
    expect(render("decoration-corner", { ...rectCfg, position: "all" }).match(/<path /g)!.length).toBe(4);
    expect(render("decoration-corner", { ...rectCfg, position: "top-left" }).match(/<path /g)!.length).toBe(1);
  });

  test("线条：方向决定坐标", () => {
    expect(render("decoration-line", { ...rectCfg, direction: "horizontal" })).toContain('x1="0" y1="50" x2="100" y2="50"');
    expect(render("decoration-line", { ...rectCfg, direction: "vertical" })).toContain('x1="50" y1="0" x2="50" y2="100"');
  });

  /**
   * 箭头：面板里的 `arrowShape` / `arrowCount` 此前**渲染器完全不读**（面板说谎）。
   * 现在两端都按面板渲染，这里把「面板 ↔ 产出」锁住。
   */
  test("箭头：arrowShape 与 arrowCount（连续型）都被兑现", () => {
    const tri = render("decoration-arrow", { ...rectCfg, arrowShape: "triangle", arrowType: "single" });
    expect(tri).not.toContain("rotate(");
    const dia = render("decoration-arrow", { ...rectCfg, arrowShape: "diamond", arrowType: "single" });
    expect(dia.match(/<path /g)!.length).toBe(2); // 线 + 一个箭头
    const chain = render("decoration-arrow", { ...rectCfg, arrowType: "chain", arrowCount: 4, arrowShape: "triangle" });
    expect(chain.match(/<path /g)!.length).toBe(5); // 线 + 4 个箭头
    const up = render("decoration-arrow", { ...rectCfg, direction: "up", arrowType: "single" });
    expect(up).toContain("rotate(-90 50 50)");
  });

  test("未知形状：返回空图元且不抛错，也不产出占位块", () => {
    expect(decorationShape("decoration-nope", {}).primitives).toEqual([]);
    expect(render("decoration-rect", {})).toContain("<svg");
  });
});

describe("装饰形状：透明度与自动贴合", () => {
  test("透明度进外层容器（与编辑区 Box 同一层）", () => {
    const out = render("decoration-rect", { ...rectCfg, opacity: 0.35 });
    expect(out).toContain('opacity:0.35');
  });

  test("自动贴合尺寸只用于线/箭头/分隔线/波浪，且口径稳定", () => {
    expect(decorationShape("decoration-line", { strokeWidth: 3, direction: "horizontal" }).autoFit).toEqual({ height: 7 });
    expect(decorationShape("decoration-line", { strokeWidth: 3, direction: "vertical" }).autoFit).toEqual({ width: 7 });
    expect(decorationShape("decoration-rect", {}).autoFit).toBeUndefined();
    expect(decorationShape("decoration-divider", { strokeWidth: 2, style: "double", gap: 3 }).autoFit).toEqual({ height: 11 });
    expect(decorationShape("decoration-wave", { amplitude: 10, strokeWidth: 2 }).autoFit).toEqual({ height: 26 });
  });
});
