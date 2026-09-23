import { describe, test, expect, beforeAll } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import {
  DECOR_BORDER_STYLE_OPTIONS,
  DECOR_LINE_STYLE_OPTIONS,
  DECOR_LINECAP_DEFAULTS,
  DECOR_LINEJOIN_DEFAULTS,
  decorBorderDash,
  decorLineCapOf,
  decorLineDash,
  decorLineJoinOf,
  decorStrokeDetailDefaults,
  decorSupportsLineCap,
  decorSupportsLineJoin,
} from "../../editor/data/decorationShape";
import { DECORATION_SHAPE_KINDS } from "../components/decoration";
import { decorStrokeDetailFields } from "../../editor/data/decorFields";
import { registerDecorationComponents } from "../../editor/registerDecorationComponents";
import { registerBasicComponents } from "../../editor/registerBasicComponents";
import { componentRegistry } from "../../editor/registryCore";

/**
 * 装饰组 / 形状组「描边细节（端点 · 转折）」与本轮线型口径收口的契约锁。
 *
 * 本文件锁四件事：
 *  1. **能力三方一致**：面板显示了哪个控件 ⇔ `decorSupportsLineCap/Join` 说支持 ⇔ 渲染端真的消费
 *     （几何里 `decorLineCapOf/decorLineJoinOf` 出现在该形状的图元上）。任何一环脱节都是假能力。
 *  2. **默认值零回归**：面板默认值必须**逐字等于**改动前硬编码在几何里的那个值
 *     ——`{...config, lineCap: 默认值}` 与「config 里没有 lineCap 键」产物必须完全相同。
 *  3. **换值真的会动**：每个受支持的形状，把端点/转折改一档，产物必须变化。
 *  4. **线型选项不撒谎**：面板给的每个 `borderStyle` / `lineStyle` 选项，几何都必须认识
 *     （历史缺陷：`resolveDecorStroke` 自带一张与 `decorBorderDash` 不同的节奏表 →
 *     给面板加「点划线」时只有圆环会动、其余形状静默变实线）。
 */

initBuiltinCodegens();
beforeAll(() => {
  registerDecorationComponents();
  registerBasicComponents();
});

const ctx = { pageStyles: [] as string[], pageScripts: [] as string[], preview: false } as never;

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

function render(type: string, config: Record<string, unknown>): string {
  const fn = getCodegen(type);
  expect(fn, `缺少 ${type} 的 codegen`).toBeTruthy();
  return fn!(comp(type, config), ctx) ?? "";
}

function defConfig(type: string): Record<string, unknown> {
  const def = componentRegistry.get(type);
  expect(def, `未注册 ${type}`).toBeTruthy();
  return { ...(def!.defaultConfig as Record<string, unknown>) };
}

function keysOf(type: string): string[] {
  return (componentRegistry.get(type)?.configSchema ?? []).map((f) => f.key);
}

const CAP_KINDS = DECORATION_SHAPE_KINDS.filter((k) => decorSupportsLineCap(k));
const JOIN_KINDS = DECORATION_SHAPE_KINDS.filter((k) => decorSupportsLineJoin(k));

describe("描边细节：能力三方一致", () => {
  test("面板控件 ⇔ decorationShape 能力表 ⇔ 形状清单 三者一致", () => {
    expect(CAP_KINDS.length).toBeGreaterThanOrEqual(6);
    expect(JOIN_KINDS.length).toBeGreaterThanOrEqual(7);
    for (const kind of DECORATION_SHAPE_KINDS) {
      const keys = keysOf(kind);
      expect(keys.includes("lineCap"), `${kind} 的端点控件与 decorSupportsLineCap 不一致`).toBe(
        decorSupportsLineCap(kind),
      );
      expect(keys.includes("lineJoin"), `${kind} 的转折控件与 decorSupportsLineJoin 不一致`).toBe(
        decorSupportsLineJoin(kind),
      );
      // decorStrokeDetailFields 是注册处唯一的片段来源，它自己也必须与能力表一致
      const fragKeys = decorStrokeDetailFields(kind).map((f) => f.key);
      expect(fragKeys).toEqual([
        ...(decorSupportsLineCap(kind) ? ["lineCap"] : []),
        ...(decorSupportsLineJoin(kind) ? ["lineJoin"] : []),
      ]);
    }
  });

  test("能力判据排除「改了画面不动」的形状（闭合实线图形 / 无拐角线条）", () => {
    for (const closed of ["decoration-rect", "decoration-circle", "decoration-ellipse"]) {
      expect(decorSupportsLineCap(closed), `${closed} 是闭合图形，端点样式不会改变画面`).toBe(false);
      expect(decorSupportsLineJoin(closed), `${closed} 没有拐角（圆角靠 borderRadius）`).toBe(false);
    }
    for (const noCorner of ["decoration-line", "decoration-divider", "decoration-wave", "decoration-dashed-box"]) {
      expect(decorSupportsLineJoin(noCorner), `${noCorner} 的描边路径上没有拐角`).toBe(false);
    }
  });

  test("面板 hidden 条件不会把控件藏掉（能力表为真即应显示）", () => {
    for (const kind of [...CAP_KINDS, ...JOIN_KINDS]) {
      const fields = (componentRegistry.get(kind)!.configSchema ?? []).filter(
        (f) => f.key === "lineCap" || f.key === "lineJoin",
      );
      for (const f of fields) {
        expect(f.hidden?.(defConfig(kind)) ?? false, `${kind}.${f.key} 被误隐藏`).toBe(false);
      }
      expect(fields.length).toBeGreaterThan(0);
    }
  });
});

describe("描边细节：默认值零回归", () => {
  test("默认值逐字等于改动前硬编码在几何里的值", () => {
    for (const kind of CAP_KINDS) {
      expect(DECOR_LINECAP_DEFAULTS[kind], `${kind} 缺少端点默认值`).toBeTruthy();
      const d = decorStrokeDetailDefaults(kind);
      expect(d.lineCap).toBe(DECOR_LINECAP_DEFAULTS[kind]);
    }
    for (const kind of JOIN_KINDS) {
      expect(DECOR_LINEJOIN_DEFAULTS[kind], `${kind} 缺少转折默认值`).toBeTruthy();
      expect(decorStrokeDetailDefaults(kind).lineJoin).toBe(DECOR_LINEJOIN_DEFAULTS[kind]);
    }
  });

  test("历史配置（没有 lineCap/lineJoin 键）与新面板默认值是同一份产物", () => {
    for (const kind of DECORATION_SHAPE_KINDS) {
      const base = defConfig(kind);
      // 模拟"面板默认值已被写入 config"
      const patched = { ...base, ...decorStrokeDetailDefaults(kind) };
      expect(render(kind, patched), `${kind} 的默认端点/转折与历史产物不一致`).toBe(render(kind, base));
    }
  });

  test("显式写入历史值也与不带键的产物一致", () => {
    for (const kind of CAP_KINDS) {
      const base = defConfig(kind);
      expect(render(kind, { ...base, lineCap: DECOR_LINECAP_DEFAULTS[kind] })).toBe(render(kind, base));
    }
    for (const kind of JOIN_KINDS) {
      const base = defConfig(kind);
      expect(render(kind, { ...base, lineJoin: DECOR_LINEJOIN_DEFAULTS[kind] })).toBe(render(kind, base));
    }
  });

  test("非法/空值回退到该形状的历史值，不落进 SVG 属性", () => {
    expect(decorLineCapOf({ lineCap: "nope" }, "decoration-line")).toBe("round");
    expect(decorLineCapOf({ lineCap: "" }, "decoration-dashed-box")).toBe("butt");
    expect(decorLineCapOf({}, "decoration-rect")).toBe("butt"); // 形状不支持 → SVG 缺省
    expect(decorLineJoinOf({ lineJoin: "nope" }, "decoration-star")).toBe("round");
    expect(decorLineJoinOf({}, "decoration-line")).toBe("miter");
  });
});

describe("描边细节：换值真的会改变产物", () => {
  test("每个支持端点样式的形状，三档端点产出三种产物", () => {
    for (const kind of CAP_KINDS) {
      const base = defConfig(kind);
      const outs = ["butt", "round", "square"].map((v) => render(kind, { ...base, lineCap: v }));
      expect(new Set(outs).size, `${kind} 的端点样式是假控件`).toBe(3);
      for (const [i, v] of ["butt", "round", "square"].entries()) {
        expect(outs[i], `${kind} 未输出 stroke-linecap=${v}`).toContain(`stroke-linecap="${v}"`);
      }
    }
  });

  test("每个支持转折样式的形状，三档转折产出三种产物", () => {
    for (const kind of JOIN_KINDS) {
      const base = defConfig(kind);
      const outs = ["miter", "round", "bevel"].map((v) => render(kind, { ...base, lineJoin: v }));
      expect(new Set(outs).size, `${kind} 的转折样式是假控件`).toBe(3);
      for (const [i, v] of ["miter", "round", "bevel"].entries()) {
        expect(outs[i], `${kind} 未输出 stroke-linejoin=${v}`).toContain(`stroke-linejoin="${v}"`);
      }
    }
  });
});

describe("线型选项与几何口径同源", () => {
  test("面板给的每个线型选项都被几何识别（不含「改了没反应」的档位）", () => {
    /* 判据：选项值两两产出**不同的**节奏。
       若某个档位几何不认识（如历史缺陷里 `resolveDecorStroke` 不认 dash-dot），
       它会静默回落到与「实线」相同的 `none` → 两者产出相同 → 本用例立刻红。 */
    /* `none` 不是节奏档位（它由 `hasStroke` 消费 → 整条描边不画），不参与两两比较。 */
    const dashOptions = DECOR_BORDER_STYLE_OPTIONS.filter((o) => o.value !== "none");
    const borderOut = dashOptions.map((o) => decorBorderDash(String(o.value)));
    expect(new Set(borderOut).size, `边框样式选项存在被几何忽略的档位：${borderOut.join(" | ")}`).toBe(
      dashOptions.length,
    );
    const lineOut = DECOR_LINE_STYLE_OPTIONS.map((o) => decorLineDash(String(o.value)));
    expect(new Set(lineOut).size, `线条样式选项存在被几何忽略的档位：${lineOut.join(" | ")}`).toBe(
      DECOR_LINE_STYLE_OPTIONS.length,
    );
    expect(decorBorderDash("dash-dot")).toBe("12 4 2 4");
    expect(decorLineDash("dash-dot")).toBe("12 4 2 4");
    // 「无边框」只允许出现在边框表里（线条没有"无"档：线本身就是描边）
    expect(DECOR_BORDER_STYLE_OPTIONS.map((o) => o.value)).toContain("none");
    expect(DECOR_LINE_STYLE_OPTIONS.map((o) => o.value)).not.toContain("none");
  });

  test("点划线在两端都落地（历史缺陷：只有圆环会动）", () => {
    for (const kind of ["decoration-rect", "decoration-ellipse", "decoration-triangle", "decoration-star"]) {
      const html = render(kind, { ...defConfig(kind), borderStyle: "dash-dot" });
      expect(html, `${kind} 的「点划线」没有生效`).toContain('stroke-dasharray="12 4 2 4"');
    }
    for (const kind of ["decoration-line", "decoration-arrow", "decoration-divider", "decoration-wave"]) {
      const html = render(kind, { ...defConfig(kind), lineStyle: "dash-dot" });
      expect(html, `${kind} 的「点划线」没有生效`).toContain('stroke-dasharray="12 4 2 4"');
    }
  });

  test("实线/虚线/点线的节奏与历史逐字一致", () => {
    expect(decorBorderDash("solid")).toBe("none");
    expect(decorBorderDash("dashed")).toBe("8 4");
    expect(decorBorderDash("dotted")).toBe("2 4");
    const solid = render("decoration-rect", { ...defConfig("decoration-rect"), borderStyle: "solid" });
    expect(solid).toContain('stroke-dasharray="none"');
    const dashed = render("decoration-rect", { ...defConfig("decoration-rect"), borderStyle: "dashed" });
    expect(dashed).toContain('stroke-dasharray="8 4"');
  });
});

describe("圆环「外环粗细」：解锁已存在但面板不可达的能力", () => {
  test("面板有该控件，且 >0 时真的多出一圈", () => {
    const keys = keysOf("decoration-ring");
    expect(keys).toContain("strokeWidth");
    const base = defConfig("decoration-ring");
    const off = render("decoration-ring", { ...base, strokeWidth: 0 });
    const on = render("decoration-ring", { ...base, strokeWidth: 6 });
    expect(on).not.toBe(off);
    expect((on.match(/<circle/g) ?? []).length).toBeGreaterThan((off.match(/<circle/g) ?? []).length);
    // 默认（0）与历史产物一致
    expect(off).toBe(render("decoration-ring", base));
  });
});

describe("形状组（shape）与装饰组共用同一套描边口径", () => {
  test("lineCap/lineJoin 面板存在，且按 shapeType 动态显隐", () => {
    const keys = keysOf("shape");
    expect(keys).toContain("lineCap");
    expect(keys).toContain("lineJoin");
    const lineCap = (componentRegistry.get("shape")!.configSchema ?? []).find((f) => f.key === "lineCap")!;
    const lineJoin = (componentRegistry.get("shape")!.configSchema ?? []).find((f) => f.key === "lineJoin")!;
    expect(lineCap.hidden?.({ shapeType: "line" })).toBe(false);
    expect(lineCap.hidden?.({ shapeType: "rect" })).toBe(true);
    expect(lineJoin.hidden?.({ shapeType: "polygon" })).toBe(false);
    expect(lineJoin.hidden?.({ shapeType: "line" })).toBe(true);
  });

  test("空串 = 跟随形状默认；显式值生效；两者产物不同", () => {
    const shapeBase = defConfig("shape");
    const auto = render("shape", { ...shapeBase, shapeType: "line", lineCap: "" });
    const round = render("shape", { ...shapeBase, shapeType: "line", lineCap: "round" });
    const square = render("shape", { ...shapeBase, shapeType: "line", lineCap: "square" });
    expect(auto).toBe(round); // 线条的历史默认就是 round
    expect(square).not.toBe(round);
    expect(square).toContain('stroke-linecap="square"');
    // 虚线框的历史默认是 butt（此前根本没写这个属性）
    const dashAuto = render("shape", { ...shapeBase, shapeType: "dashed-box", lineCap: "" });
    expect(dashAuto).toContain('stroke-linecap="butt"');
    const polygonJoin = render("shape", { ...shapeBase, shapeType: "polygon", lineJoin: "miter" });
    expect(polygonJoin).toContain('stroke-linejoin="miter"');
  });

  test("渐变方向 / 阴影选项取自装饰组同一张表（不再各写一份）", () => {
    const gd = (componentRegistry.get("shape")!.configSchema ?? []).find((f) => f.key === "gradientDirection")!;
    expect((gd.options ?? []).length).toBeGreaterThanOrEqual(7);
    const sh = (componentRegistry.get("shape")!.configSchema ?? []).find((f) => f.key === "shadow")!;
    expect(sh.options?.map((o) => o.value)).toEqual(["none", "soft", "medium", "strong"]);
  });
});
