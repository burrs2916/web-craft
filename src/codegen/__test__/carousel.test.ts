import { describe, test, expect } from "vitest";
import { carouselCodegen } from "../components/carousel";
import type { SceneDSL } from "../../types/scene";
import type { SceneComponent } from "../../types/editor";
import type { CodegenContext } from "../types";
import { DEFAULT_CANVAS_CONFIG } from "../../store/editorStore";
import { createDefaultTransform } from "../../types/editor";

const baseComponent = (over: Partial<SceneComponent> = {}): SceneComponent => ({
  id: "c1",
  type: "carousel",
  name: "Carousel",
  transform: createDefaultTransform({ x: 0, y: 0, width: 600, height: 320 }),
  layerId: "l1",
  zIndex: 0,
  locked: false,
  visible: true,
  config: { dataMode: "static" },
  children: [],
  parentId: null,
  ...over,
});

const makeScene = (components: SceneComponent[]): SceneDSL => ({
  id: "carousel-test",
  name: "Carousel Test",
  status: "draft",
  tags: [],
  metadata: {},
  createdAt: 0,
  updatedAt: 0,
  canvasConfig: { ...DEFAULT_CANVAS_CONFIG, width: 1024, height: 768 },
  views: [{ id: "v1", name: "Dashboard", components, layers: [] }],
  apiConfig: { baseUrl: "", authEnabled: false, defaultHeaders: {}, timeout: 10000 },
});

const makeCtx = (scene: SceneDSL): CodegenContext => ({
  view: scene.views![0]!,
  canvasConfig: scene.canvasConfig!,
  scene,
  preview: true,
  componentMap: new Map(scene.views![0]!.components.map((c) => [c.id, c])),
  childrenByParent: new Map(),
  pageStyles: [],
  pageScripts: [],
  externalDeps: [],
  iconData: {},
});

describe("carouselCodegen 数据源回归", () => {
  test("静态模式：渲染出配置的 slides，不注入 API loader", () => {
    const scene = makeScene([
      baseComponent({
        config: {
          dataMode: "static",
          slides: JSON.stringify([
            { title: "A", description: "aa", imageUrl: "", bgColor: "", icon: "" },
            { title: "B", description: "bb", imageUrl: "", bgColor: "", icon: "" },
          ]),
        },
      }),
    ]);
    const html = carouselCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
    expect(html).toContain(">A<");
    expect(html).toContain(">B<");
    expect(html).not.toContain(">轮播一<");
    expect(html).not.toContain("getNestedValue");
    expect(html).not.toContain("doFetch");
  });

  test("staticData 非空时优先渲染 staticData，空则回退 slides", () => {
    const primary = makeScene([
      baseComponent({
        config: {
          dataMode: "static",
          slides: JSON.stringify([{ title: "SLIDE", description: "", imageUrl: "", bgColor: "", icon: "" }]),
          staticData: JSON.stringify([{ title: "FROM_STATIC_DATA", description: "", imageUrl: "", bgColor: "", icon: "" }]),
        },
      }),
    ]);
    const primaryHtml = carouselCodegen(primary.views![0]!.components[0]!, makeCtx(primary));
    expect(primaryHtml).toContain(">FROM_STATIC_DATA<");
    expect(primaryHtml).not.toContain(">SLIDE<");

    const fallback = makeScene([
      baseComponent({
        config: {
          dataMode: "static",
          slides: JSON.stringify([{ title: "SLIDE", description: "", imageUrl: "", bgColor: "", icon: "" }]),
          staticData: "",
        },
      }),
    ]);
    const fallbackHtml = carouselCodegen(fallback.views![0]!.components[0]!, makeCtx(fallback));
    expect(fallbackHtml).toContain(">SLIDE<");
  });

  test("API 模式：注入 dataLoaderScript 骨架 + 运行时 mount 重建 + 轮询", () => {
    const scene = makeScene([
      baseComponent({
        config: {
          slides: "",
          dataMode: "api",
          apiUrl: "https://api.example.com/banners",
          apiMethod: "GET",
          apiInterval: 5,
          apiDataPath: "data.items",
        },
      }),
    ]);
    const html = carouselCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
    // loader 骨架 + dataPath 提取 + 轮询
    expect(html).toContain("apiDataPath");
    expect(html).toContain("getNestedValue");
    expect(html).toContain("doFetch");
    expect(html).toContain("setInterval(doFetch, apiInterval * 1000)");
    // 运行时 mount 暴露给 loader 回调（数据到达后重建幻灯片）
    expect(html).toContain('window["__wcCrsl_');
    // 接口模式下不渲染编译期本地/默认幻灯片占位（数据由接口驱动填充）
    expect(html).not.toContain(">轮播一<");
    // 运行时图标经 renderIcon 渲染 SVG（修复图标名被当文本渲染的缺陷）
    expect(html).toContain("function renderIcon");
    expect(html).toContain("iconPaths");
    expect(html).toContain("renderIcon(String(it.icon), iconSize)");
  });

  test("箭头居中：编译期 display:grid 不被运行时显隐逻辑剥除", () => {
    const scene = makeScene([baseComponent()]);
    const html = carouselCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
    // 编译期箭头容器是 grid 居中，svg 绝对定位到圆心（双保险）
    expect(html).toContain("display:grid;place-items:center");
    expect(html).toMatch(/-next"[^>]*><svg[^>]*style="position:absolute;top:50%;left:50%;transform:translate\(-50%,-50%\)/);
    // 运行时显隐必须恢复原始 display 而非赋 ""（赋 "" 会从内联 style 删除 display，图标失去居中上下文）
    expect(html).toContain("prevBaseDisplay");
    expect(html).not.toContain(`? "" : "none"`);
  });

  test("interval 非法值兜底为 4000，避免 setInterval(NaN) 疯狂轮播", () => {
    const scene = makeScene([
      baseComponent({ config: { dataMode: "static", interval: "abc" } }),
    ]);
    const html = carouselCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
    expect(html).toContain("var interval = 4000");
    expect(html).not.toContain("var interval = NaN");
  });
});