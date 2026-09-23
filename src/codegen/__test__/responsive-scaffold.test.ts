import { describe, test, expect } from "vitest";
import { generateScaffoldResponsiveCSS } from "../scaffold/responsive";
import { generateProjectScaffold } from "../scaffold";
import { initBuiltinCodegens } from "../components";
import type { SceneDSL } from "../../types/scene";
import type { SceneComponent } from "../../types/editor";
import { createDefaultTransform } from "../../types/editor";
import { DEFAULT_CANVAS_CONFIG } from "../../store/editorStore";

initBuiltinCodegens();

/**
 * 脚手架级响应式断点契约：
 * 完整项目产物（static-html / react / vue / angular）须将组件 responsiveOverrides
 * 生成为 @media 查询 CSS（tablet ≤1023px、mobile ≤767px），并以 data-component-id
 * 命中脚手架 DOM；因组件包装 div 定位/样式均为内联样式，断点声明必须带 !important。
 */

const baseComp = (id: string, type = "text"): SceneComponent => ({
  id,
  type,
  name: id,
  transform: createDefaultTransform({ x: 100, y: 50, width: 400, height: 80 }),
  layerId: "l1",
  zIndex: 0,
  locked: false,
  visible: true,
  config: {},
  children: [],
  parentId: null,
});

describe("generateScaffoldResponsiveCSS：断点 CSS 生成", () => {
  test("tablet/mobile 断点使用 BREAKPOINTS maxWidth 生成 @media", () => {
    const comps = [
      {
        ...baseComp("c1"),
        responsiveOverrides: {
          tablet: { transform: { width: 320 } },
          mobile: { transform: { x: 10, y: 20, width: 200, height: 60 } },
        },
      },
    ];
    const css = generateScaffoldResponsiveCSS(comps);
    expect(css).toContain("@media (max-width: 1023px)");
    expect(css).toContain("@media (max-width: 767px)");
  });

  test("selector 使用脚手架 DOM 的 data-component-id（非预览版 data-comp-id）", () => {
    const comps = [
      { ...baseComp("c1"), responsiveOverrides: { mobile: { transform: { width: 200 } } } },
    ];
    const css = generateScaffoldResponsiveCSS(comps);
    expect(css).toContain('[data-component-id="c1"]');
    expect(css).not.toContain("data-comp-id");
  });

  test("定位字段输出 left/top（脚手架绝对定位），且声明带 !important 覆盖内联样式", () => {
    const comps = [
      { ...baseComp("c1"), responsiveOverrides: { mobile: { transform: { x: 10, y: 20 } } } },
    ];
    const css = generateScaffoldResponsiveCSS(comps);
    expect(css).toContain("left: 10px !important;");
    expect(css).toContain("top: 20px !important;");
    // 脚手架不使用 translate 定位（与预览版 semantics 不同）
    expect(css).not.toContain("translate(");
  });

  test("尺寸与 style 覆盖均输出 !important", () => {
    const comps = [
      {
        ...baseComp("c1"),
        responsiveOverrides: {
          mobile: {
            transform: { width: 200, height: 60 },
            style: { backgroundColor: "#000000", fontSize: 14 },
          },
        },
      },
    ];
    const css = generateScaffoldResponsiveCSS(comps);
    expect(css).toContain("width: 200px !important;");
    expect(css).toContain("height: 60px !important;");
    expect(css).toContain("background-color: #000000 !important;");
    expect(css).toContain("font-size: 14px !important;");
  });

  test("无 responsiveOverrides 时输出空字符串", () => {
    expect(generateScaffoldResponsiveCSS([baseComp("c1"), baseComp("c2")])).toBe("");
  });

  test("仅 base 与 override 相同的字段不重复输出（width 未覆盖时无 width 声明）", () => {
    const comps = [
      { ...baseComp("c1"), responsiveOverrides: { mobile: { transform: { x: 10 } } } },
    ];
    const css = generateScaffoldResponsiveCSS(comps);
    // 注意不能直接 not.toContain("width:")：@media (max-width: ...) 也含该子串，
    // 应断言"行首独立的 width 声明"不存在（未覆盖的字段不输出声明）
    expect(css).not.toMatch(/\n\s+width: /);
    expect(css).toContain("left: 10px !important;");
  });
});

describe("脚手架产物接入：四框架页面 CSS 含响应式断点", () => {
  const sceneWithOverrides: SceneDSL = {
    id: "rsp-scaffold",
    name: "Resp",
    status: "draft",
    tags: [],
    metadata: {},
    createdAt: 0,
    updatedAt: 0,
    canvasConfig: { ...DEFAULT_CANVAS_CONFIG, width: 800, height: 600 },
    views: [
      {
        id: "v1",
        name: "Home",
        layers: [],
        components: [
          {
            ...baseComp("c1"),
            responsiveOverrides: {
              tablet: { transform: { width: 320 }, style: { fontSize: 16 } },
              mobile: { transform: { x: 10, y: 20, width: 200, height: 60 } },
            },
          },
        ],
      },
    ],
  };

  const scenePlain: SceneDSL = {
    ...sceneWithOverrides,
    views: [{ ...sceneWithOverrides.views![0], components: [baseComp("c1")] }],
  };

  test.each([
    ["static-html", "assets/css/pages/home.css"],
    ["react", "src/styles/pages/Home.css"],
    ["vue", "src/styles/pages/Home.css"],
    ["angular", "src/app/pages/home/home.component.css"],
  ] as const)("%s 产物页面 CSS 含 data-component-id 响应式断点", (framework, cssPath) => {
    const files = generateProjectScaffold(sceneWithOverrides, framework, {});
    const css = files.find((f) => f.path === cssPath);
    expect(css).toBeDefined();
    expect(css!.content).toContain("@media (max-width: 1023px)");
    expect(css!.content).toContain("@media (max-width: 767px)");
    expect(css!.content).toContain('[data-component-id="c1"]');
    expect(css!.content).toContain("width: 200px !important;");
  });

  test.each(["static-html", "react", "vue", "angular"] as const)(
    "%s 无响应式覆盖时页面 CSS 不输出 @media 断点",
    (framework) => {
      const files = generateProjectScaffold(scenePlain, framework, {});
      const cssFiles = files.filter((f) => f.path.endsWith(".css") && /home/i.test(f.path));
      for (const css of cssFiles) {
        expect(css.content).not.toContain("@media (max-width:");
      }
    },
  );
});