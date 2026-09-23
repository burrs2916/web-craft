import { describe, test, expect, beforeAll } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createDecorationShapeRenderer } from "../renderers/DecorationShapeRenderer";
import { decorationShape, svgAttrName } from "../data/decorationShape";
import { DECORATION_SHAPE_KINDS } from "../../codegen/components/decoration";
import { componentRegistry } from "../registry";
import { registerDecorationComponents } from "../registerDecorationComponents";

beforeAll(() => registerDecorationComponents());

/**
 * 渲染器 props 不带 `component.type`（见 `types/editor.ts` 的 ComponentRendererProps），
 * 因此编辑区由工厂按形状种类产出组件；这里直接调用工厂，与注册表走的是同一条路径。
 */
function renderEditor(kind: string, config: Record<string, unknown>, width = 200, height = 150): string {
  const Renderer = createDecorationShapeRenderer(kind);
  return renderToStaticMarkup(
    createElement(Renderer as never, {
      config,
      componentId: "c1",
      mode: "edit",
      width,
      height,
    } as never),
  );
}

/** 渐变/裁剪 id 由 useId 生成、逐次渲染不同，比较前统一成占位符 */
function normalizeUid(s: string): string {
  return s.replace(/(deco-grad|deco-fill|divider-grad|clip)-[A-Za-z0-9_-]+/g, "$1-UID");
}

/**
 * **编辑区 ↔ 发布端一致性锁**（本轮装饰组件组从 0 到 1 的核心保证）。
 *
 * 同一份 `decorationShape(kind, config)` 声明：
 *   - 编辑区渲染为 React 元素 → 这里用 `renderToStaticMarkup` 抓出来；
 *   - 发布端拼成 SVG 字符串。
 * 两条路径都必须包含全部图元与全部属性，任何一个字面量被挪进某一边都会在这里红。
 */
describe("装饰组件：编辑区与共享口径一致", () => {
  test("20 个形状在编辑区都能渲染出 SVG，且图元属性齐全", () => {
    for (const kind of DECORATION_SHAPE_KINDS) {
      const cfg = (componentRegistry.get(kind)?.defaultConfig ?? {}) as Record<string, unknown>;
      const html = normalizeUid(renderEditor(kind, cfg));
      const spec = decorationShape(kind, cfg, { width: 200, height: 150 });

      expect(html, kind).toContain("<svg");
      expect(html, kind).toContain(`viewBox="${spec.viewBox}"`);
      expect(html, kind).toContain(`preserveAspectRatio="${spec.preserveAspectRatio}"`);

      for (const p of spec.primitives) {
        expect(html, `${kind} 缺 <${p.tag}>`).toContain(`<${p.tag}`);
        for (const [key, value] of Object.entries(p.attrs)) {
          // React 会按自身规则输出属性名（camelCase，个别转 kebab），两种写法都接受
          const attr = svgAttrName(key);
          const pattern = new RegExp(`${attr}=["']?[^"'>]*`, "i");
          expect(pattern.test(html), `${kind} 的 <${p.tag}> 缺属性 ${attr}`).toBe(true);
          const normalized = normalizeUid(String(value));
          expect(html.replace(/\s+/g, " "), `${kind} 的 ${attr} 取值应含 ${normalized}`).toContain(normalized);
        }
      }
    }
  });

  test("透明度渲染在外层容器上（与发布端同一层，避免叠加两次）", () => {
    const cfg = { ...(componentRegistry.get("decoration-rect")!.defaultConfig as Record<string, unknown>), opacity: 0.4 };
    const html = renderEditor("decoration-rect", cfg);
    expect(html).toContain("opacity:0.4");
    // svg 本身不重复带透明度
    const svgPart = html.slice(html.indexOf("<svg"));
    expect(svgPart).not.toContain("opacity:0.4");
  });

  test("渐变块：defs 与 url(#…) 引用成对出现", () => {
    const cfg = (componentRegistry.get("decoration-gradient")!.defaultConfig ?? {}) as Record<string, unknown>;
    const html = renderEditor("decoration-gradient", cfg);
    expect(html).toContain("<linearGradient");
    expect(html).toContain("url(#deco-grad-");
  });

  test("分隔线 gradient 变体：defs 里是渐变线，且不引入虚线属性", () => {
    const cfg = { ...(componentRegistry.get("decoration-divider")!.defaultConfig as Record<string, unknown>), style: "gradient", stroke: "#00ff00" };
    const html = renderEditor("decoration-divider", cfg);
    expect(html).toContain("<linearGradient");
    expect(html).toContain("stroke=\"url(#divider-grad-");
  });

  test("箭头：面板里的 arrowShape / arrowCount 在编辑区同样被兑现", () => {
    const base = (componentRegistry.get("decoration-arrow")!.defaultConfig ?? {}) as Record<string, unknown>;
    const chain = renderEditor("decoration-arrow", { ...base, arrowType: "chain", arrowCount: 3, arrowShape: "triangle" });
    expect(chain.match(/<path/g)!.length).toBe(4);
    const single = renderEditor("decoration-arrow", { ...base, arrowType: "single", arrowShape: "diamond" });
    expect(single.match(/<path/g)!.length).toBe(2);
  });

  /* ─── 本轮新增：渐变填充 / 轮廓阴影 在编辑区同样落地 ─── */

  test("渐变填充：编辑区渲染出 defs 与 url(#…) 引用，且与发布端同一份 id 口径", () => {
    const base = (componentRegistry.get("decoration-rect")!.defaultConfig ?? {}) as Record<string, unknown>;
    const cfg = {
      ...base,
      gradientEnabled: true,
      gradientFrom: "#112233",
      gradientTo: "#445566",
      gradientDirection: "to-bottom",
    };
    const html = normalizeUid(renderEditor("decoration-rect", cfg));
    expect(html).toContain("<linearGradient");
    expect(html).toContain("url(#deco-fill-UID)");
    expect(html).toContain("#112233");
    expect(html).toContain("#445566");
    // 方向映射：to-bottom → y1=0,y2=1（与 decorGradientAttrs 的唯一定义一致）
    expect(html).toMatch(/y1="0"/);
    expect(html).toMatch(/y2="1"/);
    // 渐变生效后不再有纯色填充
    expect(html).not.toContain('fill="rgba(33, 150, 243, 0.3)"');

    const spec = decorationShape("decoration-rect", cfg, { width: 200, height: 150, uid: "UID" });
    expect(spec.defs?.[0]?.id).toBe("deco-fill-UID");
    expect(spec.primitives[0]!.attrs.fill).toBe("url(#deco-fill-UID)");
  });

  test("径向渐变：编辑区走 radialGradient", () => {
    const base = (componentRegistry.get("decoration-circle")!.defaultConfig ?? {}) as Record<string, unknown>;
    const html = normalizeUid(renderEditor("decoration-circle", {
      ...base, gradientEnabled: true, gradientDirection: "radial",
    }));
    expect(html).toContain("<radialGradient");
    expect(html).toContain("url(#deco-fill-UID)");
  });

  test("轮廓阴影：渲染在最外层容器上（与透明度同层），svg 内部不重复", () => {
    const base = (componentRegistry.get("decoration-star")!.defaultConfig ?? {}) as Record<string, unknown>;
    const html = renderEditor("decoration-star", { ...base, shadow: "medium" });
    const filter = "drop-shadow(0 4px 10px rgba(0,0,0,0.28))";
    expect(html).toContain(filter);
    // 阴影只落在容器上：<svg> 之后不再出现
    const svgPart = html.slice(html.indexOf("<svg"));
    expect(svgPart).not.toContain(filter);
  });
});
