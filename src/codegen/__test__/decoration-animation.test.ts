import { describe, test, expect, beforeAll } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import { componentRegistry } from "../../editor/registry";
import { registerDecorationComponents } from "../../editor/registerDecorationComponents";
import {
  ANIMATION_DEFAULTS,
  buildDecorationContainerDecls,
  isDecorationAnimationIdle,
  toAnimationConfig,
} from "../../editor/renderers/decorationAnimation";

initBuiltinCodegens();

let rectCfg: Record<string, unknown> = {};

beforeAll(() => {
  registerDecorationComponents();
  rectCfg = componentRegistry.get("decoration-rect")!.defaultConfig as Record<string, unknown>;
});

function comp(config: Record<string, unknown>): SceneComponent {
  return {
    id: "c1",
    type: "decoration-rect",
    name: "rect",
    transform: createDefaultTransform({ x: 0, y: 0, width: 300, height: 200 }),
    layerId: "l1",
    zIndex: 0,
    locked: false,
    visible: true,
    config,
    children: [],
    parentId: null,
  };
}

function render(config: Record<string, unknown>) {
  const ctx = { pageStyles: [] as string[], pageScripts: [] as string[], preview: false };
  const html = getCodegen("decoration-rect")!(comp(config), ctx as never);
  return { html, css: ctx.pageStyles.join("\n") };
}

describe("装饰组：动画 / 线条特效的发布端一致性（本轮补齐的真实缺口）", () => {
  /**
   * 缺陷：`ANIMATION_SCHEMA` 的「动画」12 种与「线条特效」14 种此前只由编辑区
   * `DecorationWrapper` 实现，发布端 `codegen/components/decoration.ts` 没有任何对应逻辑
   * → 面板上改了动画，编辑区在动、正式站点一动不动。
   */
  test("动画=脉冲：容器声明与关键帧都进入产物", () => {
    const { html, css } = render({ ...rectCfg, animation: "pulse", animationDuration: 2000 });
    expect(html).toContain("deco-pulse 2000ms");
    expect(css).toContain("@keyframes deco-pulse");
  });

  test("动画=旋转：容器声明与关键帧都进入产物", () => {
    const { html, css } = render({ ...rectCfg, animation: "rotate", animationDuration: 3000 });
    expect(html).toContain("deco-rotate 3000ms");
    expect(css).toContain("@keyframes deco-rotate");
  });

  test("线条特效=光晕：容器 filter 进入产物", () => {
    const { html } = render({ ...rectCfg, lineEffect: "glow", lineEffectColor: "#00ff00", lineEffectIntensity: 6 });
    expect(html).toContain("drop-shadow");
    expect(html).toContain("0 0 6px");
  });

  test("线条特效=流光：产出描边克隆图元 + 关键帧（编辑区同一套规则）", () => {
    const { html, css } = render({
      ...rectCfg,
      stroke: "#00ff00",
      strokeWidth: 3,
      lineEffect: "flow",
      lineEffectColor: "#00aaff",
      lineEffectIntensity: 4,
    });
    expect(html).toContain('data-datav-effect-overlay="true"');
    // 克隆图元带上了特效描边（SVG 属性形式）+ 动画节奏 + 自定义属性
    expect(html).toContain('stroke-dasharray="12 6"');
    expect(html).toContain("animation-name:deco-dash-flow");
    expect(html).toContain("--dash-flow-step:-18");
    expect(css).toContain("@keyframes deco-dash-flow");
  });

  test("线条特效=霓虹：容器带 --neon-color 与两条关键帧动画", () => {
    const { html, css } = render({ ...rectCfg, lineEffect: "neon", lineEffectColor: "#ff00ff" });
    expect(html).toContain("--neon-color");
    expect(html).toContain("deco-neon-flicker");
    expect(html).toContain("deco-neon-glow");
    expect(css).toContain("@keyframes deco-neon-glow");
  });

  test("默认（无动画无特效）产物里不得出现任何动画痕迹 —— 零回归", () => {
    const { html, css } = render(rectCfg);
    expect(isDecorationAnimationIdle(toAnimationConfig(rectCfg))).toBe(true);
    expect(html).not.toContain("data-datav-effect-overlay");
    expect(html).not.toContain("animation:");
    expect(css).not.toContain("deco-pulse");
    expect(css).not.toContain("deco-dash-flow");
  });

  test("容器声明口径：样式属性来自同一份公共函数", () => {
    const decls = buildDecorationContainerDecls(toAnimationConfig({ ...rectCfg, animation: "breathe" }));
    expect(decls.width).toBe("100%");
    expect(decls.overflow).toBe("visible");
    expect(String(decls.animation)).toContain("deco-breathe");
    // 未开动画时不得凭空产生 animation
    expect(buildDecorationContainerDecls(toAnimationConfig(rectCfg)).animation).toBeUndefined();
  });

  test("ANIMATION_DEFAULTS 是「什么都不做」，保证老场景升级后画面不变", () => {
    expect(isDecorationAnimationIdle(ANIMATION_DEFAULTS)).toBe(true);
  });

  /**
   * 修掉的真实缺陷：`hexToRgb` 用 `parseInt(...) || 33` 兜底，导致**通道值为 0 的颜色**
   * 被兜底值覆盖 —— `#00ff00` 会变成 rgb(33,255,243)。特效颜色一直是错的，且两端一起错。
   */
  test("线条特效颜色：通道为 0 的颜色不得被兜底值污染", () => {
    const green = render({ ...rectCfg, lineEffect: "glow", lineEffectColor: "#00ff00", lineEffectIntensity: 4 });
    expect(green.html).toContain("rgba(0,255,0,0.8)");
    expect(green.html).not.toContain("rgba(33,255,243");

    const red = render({ ...rectCfg, lineEffect: "glow", lineEffectColor: "#ff0000", lineEffectIntensity: 4 });
    expect(red.html).toContain("rgba(255,0,0,0.8)");

    const black = render({ ...rectCfg, lineEffect: "glow", lineEffectColor: "#000000", lineEffectIntensity: 4 });
    expect(black.html).toContain("rgba(0,0,0,0.8)");
  });

  test("线条特效颜色非法时仍回退到默认色（不产出 NaN）", () => {
    const bad = render({ ...rectCfg, lineEffect: "glow", lineEffectColor: "" });
    expect(bad.html).toContain("rgba(33,150,243,0.8)");
    expect(bad.html).not.toContain("NaN");
  });
});
