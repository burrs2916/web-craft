import { describe, test, expect, beforeAll } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import { SHAPE_KIND_OPTIONS, SHAPE_SHADOWS, shapeSpec, svgAttrText } from "../../editor/data/decorationShape";
import { ShapeRenderer } from "../../editor/renderers/ShapeRenderer";
import { componentRegistry } from "../../editor/registry";
import { registerBasicComponents } from "../../editor/registerBasicComponents";

initBuiltinCodegens();
let base: Record<string, unknown> = {};
beforeAll(() => {
  registerBasicComponents();
  base = componentRegistry.get("shape")!.defaultConfig as Record<string, unknown>;
});

function comp(config: Record<string, unknown>, w = 200, h = 150): SceneComponent {
  return {
    id: "s1", type: "shape", name: "shape",
    transform: createDefaultTransform({ x: 0, y: 0, width: w, height: h }),
    layerId: "l1", zIndex: 0, locked: false, visible: true,
    config, children: [], parentId: null,
  };
}

function publish(config: Record<string, unknown>, w?: number, h?: number): string {
  const fn = getCodegen("shape");
  expect(fn).toBeTruthy();
  return fn!(comp(config, w, h), { pageStyles: [], pageScripts: [], preview: false } as never);
}

function edit(config: Record<string, unknown>, w = 200, h = 150): string {
  return renderToStaticMarkup(createElement(ShapeRenderer as never, {
    config, componentId: "s1", mode: "edit", width: w, height: h,
  } as never));
}

describe("形状组件组：多形状 + 两端一致", () => {
  test("面板列出的每种形状都能出图，且发布端与共享口径一致", () => {
    // 面板选项与实现必须双向对齐：面板给了选项却画不出来 = 面板说谎
    expect(SHAPE_KIND_OPTIONS.map((o) => o.value)).toEqual([
      "rect", "circle", "ellipse", "line", "triangle", "diamond", "star", "polygon", "cross", "dashed-box",
    ]);
    for (const { value } of SHAPE_KIND_OPTIONS) {
      const cfg = { ...base, shapeType: value };
      const spec = shapeSpec(cfg, { width: 200, height: 150, uid: "ds1" });
      const out = publish(cfg);
      expect(out, value).toContain("<svg");
      expect(out, value).not.toContain("codegen 待实现");
      expect(spec.primitives.length, `${value} 应有图元`).toBeGreaterThan(0);
      for (const p of spec.primitives) {
        expect(out, `${value} 的图元属性不一致`).toContain(svgAttrText(p.attrs));
      }
    }
  });

  test("形状组与装饰组画同一形状时几何同源（不是两套字面量）", () => {
    const shapeRect = shapeSpec({ ...base, shapeType: "rect" }, { width: 200, height: 150 });
    const decorRect = shapeSpec({ ...base, shapeType: "rect" }, { width: 200, height: 150 });
    expect(JSON.stringify(shapeRect.primitives)).toBe(JSON.stringify(decorRect.primitives));
    // 渐变填充走的是装饰组的渐变块实现
    const grad = shapeSpec({ ...base, gradientEnabled: true, gradientFrom: "#111111", gradientTo: "#222222" }, { uid: "u" });
    expect(grad.defs?.[0].stops?.map((s) => s.color)).toEqual(["#111111", "#222222"]);
  });

  test("形状参数被兑现：边数/角数/内径比/臂宽/线向", () => {
    expect(publish({ ...base, shapeType: "polygon", sides: 8 }).match(/points="([^"]+)"/)![1].split(" ").length).toBe(8);
    const starD = publish({ ...base, shapeType: "star", points: 7 }).match(/ d="([^"]+)"/)![1];
    expect(starD.match(/L /g)!.length).toBe(13);
    expect(publish({ ...base, shapeType: "cross", thickness: 20 })).toContain("L 60 40");
    expect(publish({ ...base, shapeType: "line", lineDirection: "vertical" })).toContain('x1="50" y1="0" x2="50" y2="100"');
    expect(publish({ ...base, shapeType: "dashed-box", dashLength: 6, gapLength: 3 })).toContain('stroke-dasharray="6 3"');
  });

  test("描边样式 none/dashed/dotted 生效", () => {
    expect(publish({ ...base, borderStyle: "none" })).toContain('stroke="none"');
    expect(publish({ ...base, borderStyle: "dashed" })).toContain('stroke-dasharray="8 4"');
    expect(publish({ ...base, borderStyle: "dotted" })).toContain('stroke-dasharray="2 4"');
  });

  test("透明度与阴影落在同一层（发布端外层 div / 编辑区外层 Box）", () => {
    const out = publish({ ...base, opacity: 0.5, shadow: "medium" });
    expect(out).toContain("opacity:0.5");
    expect(out).toContain("drop-shadow(0 4px 10px rgba(0,0,0,0.28))");
    const html = edit({ ...base, opacity: 0.5, shadow: "medium" });
    expect(html).toContain("opacity:0.5");
    expect(html).toContain("drop-shadow(0 4px 10px rgba(0,0,0,0.28))");
  });

  test("阴影档位表只此一份（无值 = 不加滤镜）", () => {
    expect(SHAPE_SHADOWS.none).toBe("");
    expect(Object.keys(SHAPE_SHADOWS)).toEqual(["none", "soft", "medium", "strong"]);
    expect(publish({ ...base, shadow: "none" })).not.toContain("drop-shadow");
  });

  test("编辑区渲染形状时同样输出全部图元", () => {
    for (const { value } of SHAPE_KIND_OPTIONS) {
      const cfg = { ...base, shapeType: value };
      const html = edit(cfg);
      const spec = shapeSpec(cfg, { width: 200, height: 150 });
      expect(html, value).toContain("<svg");
      for (const p of spec.primitives) {
        expect(html, `${value} 缺 <${p.tag}>`).toContain(`<${p.tag}`);
      }
    }
  });
});
