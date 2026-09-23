import { describe, test, expect, beforeAll } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { DATAV_DECOR_TYPES } from "../components/datavDecor";
import { DECORATION_SHAPE_KINDS } from "../components/decoration";
import { registerDecorationComponents } from "../../editor/registerDecorationComponents";
import { componentRegistry } from "../../editor/registryCore";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import { decorSupportsGradient } from "../../editor/data/decorationShape";

/**
 * 装饰组件组「属性栏 ↔ 产物」一致性契约锁（本轮新增的渐变填充 / 轮廓阴影）。
 *
 * 守住三件事：
 *  1. 面板上出现的每个新控件，都必须真的能改变发布产物（假能力一次都不许有）；
 *  2. 渐变/阴影的取值口径只有一份（`decorationShape`），编辑区与发布端同源；
 *  3. datav 族走自己的 color1/color2 配色模型，不得被塞进本片段。
 */

initBuiltinCodegens();
beforeAll(() => registerDecorationComponents());

const ctx = { pageScripts: [] as string[], pageStyles: [] as string[] } as never;

function comp(type: string, config: Record<string, unknown>, w = 200, h = 150): SceneComponent {
  return {
    id: "dec1",
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

/** 面板字段名集合 */
function keysOf(type: string): string[] {
  return (componentRegistry.get(type)?.configSchema ?? []).map((f) => f.key);
}

describe("装饰组：渐变填充", () => {
  const gradientKinds = DECORATION_SHAPE_KINDS.filter((k) => decorSupportsGradient(k));

  test("面板给渐变的是「默认就有可见填充」的形状，且与渲染端能力表一致", () => {
    expect(gradientKinds.length).toBeGreaterThanOrEqual(8);
    for (const k of DECORATION_SHAPE_KINDS) {
      const keys = keysOf(k);
      expect(keys.includes("gradientEnabled"), `${k} 的渐变能力与 decorSupportsGradient 不一致`)
        .toBe(decorSupportsGradient(k));
    }
  });

  test("开启渐变后产物出现 linearGradient，且与纯色填充的产物不同", () => {
    for (const k of gradientKinds) {
      const def = componentRegistry.get(k)!;
      const base = def.defaultConfig as Record<string, unknown>;
      const plain = render(k, base);
      const graded = render(k, {
        ...base,
        gradientEnabled: true,
        gradientFrom: "#112233",
        gradientTo: "#445566",
        gradientDirection: "to-right",
      });
      expect(graded, `${k} 打开渐变后产物没变（假控件）`).not.toBe(plain);
      expect(graded).toContain("<linearGradient");
      expect(graded).toContain("#112233");
      expect(graded).toContain("#445566");
      // 渐变生效即不再使用纯色填充
      expect(graded).not.toContain("fill=\"rgba(33, 150, 243, 0.3)\"");
    }
  });

  test("径向渐变走 radialGradient，方向映射只此一份", () => {
    for (const k of gradientKinds) {
      const def = componentRegistry.get(k)!;
      const html = render(k, {
        ...(def.defaultConfig as Record<string, unknown>),
        gradientEnabled: true,
        gradientDirection: "radial",
      });
      expect(html, `${k} 的径向渐变未生效`).toContain("<radialGradient");
    }
  });

  test("开渐变时隐藏纯色填充控件（不留「改了没反应」的入口）", () => {
    for (const k of gradientKinds) {
      const fill = (componentRegistry.get(k)!.configSchema ?? []).find((f) => f.key === "fill");
      expect(fill, `${k} 缺少填充色字段`).toBeTruthy();
      expect(fill!.hidden?.({ gradientEnabled: true }), `${k} 开渐变后仍显示填充色`).toBe(true);
      expect(fill!.hidden?.({ gradientEnabled: false }), `${k} 关渐变后填充色被误隐藏`).toBe(false);
    }
    // 不支持渐变的形状（如圆环）永远显示自己的填充色
    const ringFill = (componentRegistry.get("decoration-ring")!.configSchema ?? []).find((f) => f.key === "fill");
    expect(ringFill!.hidden?.({ gradientEnabled: true }) ?? false).toBe(false);
  });

  test("关掉渐变即回到纯色填充（默认值不产生任何视觉变化）", () => {
    const base = componentRegistry.get("decoration-rect")!.defaultConfig as Record<string, unknown>;
    const off = render("decoration-rect", { ...base, gradientEnabled: false });
    const legacy = render("decoration-rect", {
      fill: base.fill, stroke: base.stroke, strokeWidth: base.strokeWidth,
      borderStyle: base.borderStyle, borderRadius: base.borderRadius, opacity: base.opacity,
    });
    // 历史配置（根本没有 gradient 键）与新配置（gradientEnabled=false）必须逐字一致
    expect(off).toBe(legacy);
  });
});

describe("装饰组：轮廓阴影", () => {
  test("20 个原生装饰都有阴影控件，且每一档都能改变产物", () => {
    const shadows: Record<string, string> = {
      soft: "drop-shadow(0 2px 4px rgba(0,0,0,0.18))",
      medium: "drop-shadow(0 4px 10px rgba(0,0,0,0.28))",
      strong: "drop-shadow(0 8px 20px rgba(0,0,0,0.38))",
    };
    for (const k of DECORATION_SHAPE_KINDS) {
      expect(keysOf(k).includes("shadow"), `${k} 缺少阴影控件`).toBe(true);
      const base = componentRegistry.get(k)!.defaultConfig as Record<string, unknown>;
      const none = render(k, { ...base, shadow: "none" });
      for (const [level, filter] of Object.entries(shadows)) {
        const html = render(k, { ...base, shadow: level });
        expect(html, `${k} 的阴影档位 ${level} 未生效`).not.toBe(none);
        expect(html, `${k} 的阴影档位 ${level} 不是约定的 drop-shadow`).toContain(filter);
      }
    }
  });

  test("阴影关（none / 未配置）时产物不含 filter，与历史产物逐字一致", () => {
    const base = componentRegistry.get("decoration-circle")!.defaultConfig as Record<string, unknown>;
    const none = render("decoration-circle", { ...base, shadow: "none" });
    const absent = render("decoration-circle", base);
    expect(none).toBe(absent);
    expect(none).not.toContain("filter:");
  });

  test("datav 族不被塞入渐变与阴影（它们有自己的 color1/color2 模型）", () => {
    for (const t of DATAV_DECOR_TYPES) {
      const keys = keysOf(t);
      expect(keys.includes("gradientEnabled"), `${t} 不应出现渐变填充`).toBe(false);
      expect(keys.includes("shadow"), `${t} 不应出现本组阴影控件`).toBe(false);
    }
  });
});
