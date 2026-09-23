import { describe, test, expect } from "vitest";
import { generateProjectScaffold } from "../scaffold";
import { generateHTML } from "../engine";
import { initBuiltinCodegens } from "../components";
import type { SceneDSL } from "../../types/scene";
import { createDefaultTransform } from "../../types/editor";
import { DEFAULT_CANVAS_CONFIG } from "../../store/editorStore";

initBuiltinCodegens();

/**
 * 发布页面"等比铺满视口"适配契约：
 * 所有发布产物页面是固定像素画布（绝对定位组件无法流式重排），必须在浏览器端
 * 按 scale = 视口宽/设计宽 双向等比缩放（窄屏缩小、宽屏放大铺满），而非只在窄屏收窄。
 * 页面容器需带 data-design-width/height，并注入包含 scale 脚本的适配脚本。
 */
const scene: SceneDSL = {
  id: "rsp",
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
          id: "c1",
          type: "text",
          name: "Title",
          transform: createDefaultTransform({ x: 100, y: 50, width: 400, height: 80 }),
          layerId: "l1",
          zIndex: 0,
          locked: false,
          visible: true,
          config: { content: "Hello" },
          children: [],
          parentId: null,
        },
      ],
    },
  ],
};

function file(files: { path: string; content: string }[], name: string): string {
  const f = files.find((x) => x.path === name);
  if (!f) throw new Error(`missing file: ${name}`);
  return f.content;
}

function findContaining(files: { path: string; content: string }[], needle: string): string[] {
  return files.filter((x) => x.content.includes(needle)).map((x) => x.path);
}

describe("static-html 脚手架：宽屏放大铺满（不再只窄屏收窄）", () => {
  const files = generateProjectScaffold(scene, "static-html", {});
  const mainJs = file(files, "assets/js/main.js");
  const indexHtml = file(files, "index.html");

  test("main.js 含等比缩放 scale，且宽屏放大铺满、消除横向滚动", () => {
    expect(mainJs).toContain("scale('+s+')");
    expect(mainJs).toContain("var vw=window.innerWidth");
    // 宽度铺满：宽屏放大（scale=视口宽/设计宽，不封顶到 1），画布占满浏览器宽
    expect(mainJs).toContain("var s=vw/dw;");
    expect(mainJs).not.toContain("if(s>1){ s=1; }");
    // transform 不改排版宽度，需隐藏横向溢出以消左右滑动
    expect(mainJs).toContain("overflowX='hidden'");
    // 关键回归：不再用 if (designWidth > viewportWidth) 把宽屏排除在外
    expect(mainJs).not.toContain("designWidth > viewportWidth");
  });

  test("页面容器带 data-design-width/height，且不居中固定（margin 0）", () => {
    expect(indexHtml).toContain('data-design-width="800"');
    expect(indexHtml).toContain('data-design-height="600"');
    expect(indexHtml).not.toContain("margin: 0 auto");
  });
});

describe("engine 直出 HTML：同样等比铺满", () => {
  const pages = generateHTML(scene, { framework: "static-html", preview: true });
  const html = pages[0]!.html;

  test("HTML 内含 .page 容器与 data-design attrs", () => {
    expect(html).toContain("class=\"page\"");
    expect(html).toContain('data-design-width="800"');
    expect(html).toContain('data-design-height="600"');
  });

  test("HTML 内联等比缩放脚本（宽屏放大铺满 + 消横向滚动）", () => {
    expect(html).toContain("scale('+s+')");
    expect(html).toContain("var s=vw/dw;");
    expect(html).not.toContain("if(s>1){ s=1; }");
    expect(html).toContain("overflowX='hidden'");
    expect(html).not.toContain("designWidth > viewportWidth");
  });
});

describe("vue/react/angular 脚手架：注入适配脚本 + 页面容器属性", () => {
  for (const fw of ["vue", "react", "angular"] as const) {
    test(`${fw}：入口 HTML 注入等比缩放脚本`, () => {
      const files = generateProjectScaffold(scene, fw, {});
      const entry = fw === "angular"
        ? file(files, "src/index.html")
        : file(files, "index.html");
      expect(entry).toContain("scale('+s+')");
      expect(entry).toContain("var vw=window.innerWidth");
    });

    test(`${fw}：业务页面 .page 容器带 data-design-width/height`, () => {
      const files = generateProjectScaffold(scene, fw, {});
      const hits = findContaining(files, "data-design-width=\"800\"");
      expect(hits.length).toBeGreaterThan(0);
      const page = hits[0]!;
      expect(files.find((x) => x.path === page)!.content).toContain('data-design-height="600"');
    });
  }
});