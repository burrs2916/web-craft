import { describe, test, expect, beforeAll } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import { componentRegistry } from "../../editor/registry";
import { registerDecorationComponents } from "../../editor/registerDecorationComponents";
import { DATAV_DECOR_TYPES, DATAV_STROKE_RULES, datavStrokeKey, parseDatavType } from "../../editor/data/datavDecor";
import { datavRenderSizeOf } from "../components/datavDecor";

initBuiltinCodegens();

let borderCfg: Record<string, unknown> = {};
let decoCfg: Record<string, unknown> = {};

beforeAll(() => {
  registerDecorationComponents();
  borderCfg = componentRegistry.get("datav-border-1")!.defaultConfig as Record<string, unknown>;
  decoCfg = componentRegistry.get("datav-decoration-2")!.defaultConfig as Record<string, unknown>;
});

function comp(type: string, config: Record<string, unknown>, w = 400, h = 300): SceneComponent {
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

function makeCtx() {
  return { pageStyles: [] as string[], pageScripts: [] as string[], preview: false } as never;
}

function render(type: string, config: Record<string, unknown>, w?: number, h?: number) {
  const fn = getCodegen(type);
  expect(fn, `缺少 ${type} 的 codegen`).toBeTruthy();
  const ctx = makeCtx();
  const html = fn!(comp(type, config, w, h), ctx);
  return { html, ctx: ctx as unknown as { pageStyles: string[] } };
}

describe("datav 装饰族：发布端覆盖（0 → 1 的回归锁）", () => {
  /**
   * 本轮修复的核心缺陷：25 个 datav 组件（13 边框 + 12 装饰）此前在 codegen 注册表里
   * **一个都没有** → 发布产物是空 div。本用例保证「组件注册表里出现的每一个 datav-*
   * 都有发布端实现」——以后有人加组件却忘了注册 codegen，这里立刻红。
   */
  test("注册表中的每个 datav-* 都有 codegen（且清单双向一致）", () => {
    const fromRegistry = (componentRegistry.getAll() as Array<{ type: string; category: string }>)
      .filter((c) => c.category === "ccat_decoration" && c.type.startsWith("datav-"))
      .map((c) => c.type);
    expect(fromRegistry.length).toBe(25);

    const missing = fromRegistry.filter((t) => !getCodegen(t));
    expect(missing).toEqual([]);
    // 清单里不能有注册表里不存在的类型
    const regSet = new Set(fromRegistry);
    expect(DATAV_DECOR_TYPES.filter((t) => !regSet.has(t))).toEqual([]);
    expect(new Set(DATAV_DECOR_TYPES).size).toBe(25);
  });

  test("25 个 datav 组件全部产出非空 svg，不再是占位块 / 空 div", () => {
    for (const type of DATAV_DECOR_TYPES) {
      const cfg = componentRegistry.get(type)!.defaultConfig as Record<string, unknown>;
      const { html } = render(type, cfg, 400, 300);
      expect(html.length, `${type} 产出为空`).toBeGreaterThan(50);
      expect(html, `${type} 未产出 svg`).toContain("<svg");
      expect(html, `${type} 走了占位分支`).not.toContain("data-unsupported");
      expect(html, `${type} 未产出容器`).toContain("<div");
      // 不允许把 ResizeObserver 时代的默认 400×300 当成交付尺寸写死（除非确实没传尺寸）
      expect(parseDatavType(type)).not.toBeNull();
    }
  });

  test("容器 id 可确定且与注入 CSS 的选择器一致", () => {
    const { html, ctx } = render("datav-border-1", borderCfg, 400, 300);
    expect(html).toContain('id="datvc1"');
    expect(ctx.pageStyles.some((s) => s.includes("#datvc1"))).toBe(true);
    expect(ctx.pageStyles.some((s) => s.includes("pointer-events:none"))).toBe(true);
  });

  test("静态渲染尺寸来自 transform（不再依赖浏览器测量）", () => {
    const { html } = render("datav-decoration-2", decoCfg, 800, 40);
    expect(html).toContain('width="800"');
    expect(html).toContain('height="40"');
    expect(html).toContain('viewBox="0 0 800 40"');
  });

  test("尺寸缺失时回退到元数据默认尺寸，绝不产出 0 尺寸", () => {
    const c = comp("datav-decoration-12", componentRegistry.get("datav-decoration-12")!.defaultConfig as Record<string, unknown>);
    (c.transform as { width: number }).width = 0;
    (c.transform as { height: number }).height = 0;
    const size = datavRenderSizeOf(c);
    expect(size).toEqual({ width: 200, height: 200 });
  });

  test("动画关键帧推进页面样式表，且不会重复注入", () => {
    const fn = getCodegen("datav-border-8")!;
    const ctx = makeCtx() as unknown as { pageStyles: string[] };
    fn(comp("datav-border-8", borderCfg, 400, 300), ctx as never);
    fn(comp("datav-border-8", borderCfg, 400, 300), ctx as never);
    const keyframeBlocks = ctx.pageStyles.filter((s) => s.includes("@keyframes deco-pulse"));
    expect(keyframeBlocks.length).toBe(1);
  });

  test("线条粗细倍率在发布端被翻译成 stroke-width 覆盖规则", () => {
    // 边框 3（渐变线段边框）有静态线宽 3 / 1，倍率 2 → 6px / 2px
    const cfg = { ...componentRegistry.get("datav-border-3")!.defaultConfig, strokeWidth: 2 } as Record<string, unknown>;
    const { ctx } = render("datav-border-3", cfg, 400, 300);
    const css = ctx.pageStyles.join("\n");
    expect(css).toContain("stroke-width:6px!important");
    expect(css).toContain("stroke-width:2px!important");
  });

  test("配色来自面板 config（主/副色都进入产物）", () => {
    const cfg = { ...borderCfg, color1: "#123456", color2: "#abcdef" } as Record<string, unknown>;
    const { html } = render("datav-border-1", cfg, 400, 300);
    expect(html.toLowerCase()).toContain("#123456");
    expect(html.toLowerCase()).toContain("#abcdef");
  });

  test("SMIL 动画（<animate>）保留在静态产物中", () => {
    // 扫描线装饰用 SMIL 驱动，静态 HTML 里必须原样保留
    const { html } = render("datav-decoration-2", decoCfg, 400, 6);
    expect(html).toContain("<animate");
    expect(html).toContain("repeatCount");
  });

  test("12 个装饰 + 13 个边框的元数据 key 与 type 完全对应", () => {
    for (const type of DATAV_DECOR_TYPES) {
      const parsed = parseDatavType(type)!;
      const def = componentRegistry.get(type);
      expect(def, `${type} 未注册`).toBeTruthy();
      expect(def!.defaultConfig.datavKind).toBe(parsed.kind);
      expect(def!.defaultConfig.datavIndex).toBe(parsed.idx);
    }
  });
});

/**
 * 契约：属性栏里出现的控件不得说谎。
 *
 * 上一版 `DATAV_STROKE_RULES` 是手写死表，组件重写后选择器全部失效 →
 * 「线条粗细」成为 deco-11 上完全没反应的假控件（渲染器/发布端/面板三方无人察觉）。
 * 这里逐组件实测：**面板显示了「线条粗细」，就必须真的能改变产物（标记或样式）**。
 */
describe("datav 属性栏契约：线条粗细必须真实生效", () => {
  function renderWith(type: string, sw: number) {
    const cfg = { ...(componentRegistry.get(type)!.defaultConfig as Record<string, unknown>), strokeWidth: sw };
    const fn = getCodegen(type)!;
    const ctx = makeCtx() as unknown as { pageStyles: string[] };
    const html = fn(comp(type, cfg, 400, 300), ctx as never);
    return { html, css: ctx.pageStyles.join("\n") };
  }

  test("面板暴露了「线条粗细」的组件，改动它必须改变产物", () => {
    const broken: string[] = [];
    for (const type of DATAV_DECOR_TYPES) {
      const def = componentRegistry.get(type)!;
      const hasControl = (def.configSchema ?? []).some((s) => (s as { key: string }).key === "strokeWidth");
      if (!hasControl) continue;
      const a = renderWith(type, 1);
      const b = renderWith(type, 3);
      if (a.html === b.html && a.css === b.css) broken.push(type);
    }
    expect(broken, `以下组件的「线条粗细」面板控件不会改变产物（假能力）：${broken.join(", ")}`).toEqual([]);
  });

  test("静态线宽表与真实产物严格一致（组件改了 SVG 却忘改表 → 这里红）", () => {
    const mismatches: string[] = [];
    for (const type of DATAV_DECOR_TYPES) {
      const parsed = parseDatavType(type)!;
      const key = datavStrokeKey(parsed.kind, parsed.idx);
      const rules = DATAV_STROKE_RULES[key] ?? [];
      // 只统计「不随 strokeWidth 变化的静态线宽字面量」
      const collect = (sw: number) => {
        const { html } = renderWith(type, sw);
        const set = new Map<string, number>();
        for (const m of html.matchAll(/<([a-zA-Z]+)\b([^>]*)>/g)) {
          const w = /\bstroke-width="([^"]+)"/.exec(m[2]);
          if (!w) continue;
          const s = /\bstroke="([^"]+)"/.exec(m[2]);
          if (!s || s[1] === "none" || s[1] === "transparent") continue;
          const k = `${m[1]}|${w[1]}`;
          set.set(k, (set.get(k) || 0) + 1);
        }
        return set;
      };
      const a = collect(1);
      const b = collect(3);
      const expected = [...a.entries()]
        .filter(([k, n]) => b.get(k) === n)
        .map(([k]) => k)
        .sort();
      const actual = rules.map((r) => r.selector).sort() &&
        [...new Set(rules.map((r) => `${/^([a-zA-Z]+)/.exec(r.selector)![1]}|${/([0-9.]+)/.exec(r.selector)![1]}`))].sort();
      if (JSON.stringify(expected) !== JSON.stringify(actual)) {
        mismatches.push(`${type}: 产物=${JSON.stringify(expected)} 表=${JSON.stringify(actual)}`);
      }
    }
    expect(mismatches, `静态线宽表已过期：\n${mismatches.join("\n")}`).toEqual([]);
  });
});
