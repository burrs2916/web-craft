/**
 * 回归测试：多脚本拼接进同一 <script> 块时必须以分号结尾。
 *
 * 历史缺陷：navbar/sidebar 等组件的内联 IIFE 被框架组装函数提取后用
 * join("\n") 直接拼接，"})()\n(function(){" 被 ASI 解析为链式调用，
 * 抛出 "is not a function" TypeError。static-html 与 vue/react/angular
 * 四条组装路径都必须防御此问题。
 */
import { describe, it, expect } from "vitest";
import { generateHTML } from "./engine";
import type { SceneDSL } from "../types/scene";
import type { SceneComponent } from "../types/editor";

function comp(id: string, type: string, x: number, y: number, w: number, h: number): SceneComponent {
  return {
    id,
    type,
    name: id,
    transform: { x, y, width: w, height: h, rotation: 0, scale: { x: 1, y: 1 } },
    layerId: "layer-1",
    zIndex: 1,
    locked: false,
    visible: true,
    config: {
      menuItems: JSON.stringify([
        { label: "首页", children: [{ label: "子项一" }] },
        { label: "产品" },
      ]),
    },
  };
}

const scene: SceneDSL = {
  id: "test-scene",
  name: "Test",
  activeViewId: "view-1",
  views: [
    {
      id: "view-1",
      name: "Home",
      components: [
        comp("nav-1", "navbar-horizontal", 0, 0, 1200, 64),
        comp("side-1", "sidebar-menu", 0, 64, 240, 600),
      ],
      layers: [{ id: "layer-1", name: "Layer 1", order: 0, visible: true, opacity: 1 }],
      canvasConfig: {
        width: 1200,
        height: 800,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
      },
    },
  ],
} as unknown as SceneDSL;

describe("脚本拼接分号防护", () => {
  for (const fw of ["static-html", "vue", "react", "angular"] as const) {
    it(`${fw} 预览 HTML 中相邻 IIFE 拼接必须带分号`, () => {
      const pages = generateHTML(scene, { framework: fw, preview: true });
      const html = pages[0].html;
      // 两个组件脚本都必须存在（防止脚本丢失导致空输出假通过）
      expect(html).toContain("__wcNavbarInit");
      expect(html).toContain("__wcSidebarInit");
      // 危险模式：IIFE 结尾 })() 后紧跟 ( —— 会被 ASI 解析为链式调用
      expect(
        html,
        `${fw} 输出中存在 })() 后紧跟 (function 的无分号拼接`,
      ).not.toMatch(/\}\)\(\)\s*\(function\s*\(/);
    });
  }
});

describe("侧边栏/导航栏箭头初始方向", () => {
  it("子菜单默认收起时箭头初始为收起方向，不随激活项展开", () => {
    const html = generateHTML(scene, { framework: "static-html", preview: true })[0].html;
    // sidebar：左侧有子菜单的项，箭头初始是收起方向 class="wc-arrow"（无 expanded）
    expect(html).toContain('class="wc-arrow"');
    // navbar：箭头初始是收起方向 class="wc-navbar-arrow"（无 expanded）
    expect(html).toContain('class="wc-navbar-arrow"');
    // 不能出现激活项驱动的初始展开箭头（子菜单实际是收起的，方向必须一致）
    expect(html).not.toContain('class="wc-arrow wc-arrow-expanded"');
    expect(html).not.toContain('wc-navbar-arrow wc-navbar-arrow-expanded');
  });
});
