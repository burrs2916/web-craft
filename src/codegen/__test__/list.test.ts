import { describe, test, expect } from "vitest";
import { listCodegen } from "../components/list";
import type { SceneDSL } from "../../types/scene";
import type { SceneComponent } from "../../types/editor";
import type { CodegenContext } from "../types";
import { DEFAULT_CANVAS_CONFIG } from "../../store/editorStore";
import { createDefaultTransform } from "../../types/editor";

const baseComponent = (over: Partial<SceneComponent> = {}): SceneComponent => ({
  id: "c1",
  type: "list",
  name: "List",
  transform: createDefaultTransform({ x: 0, y: 0, width: 300, height: 240 }),
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
  id: "list-test",
  name: "List Test",
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

describe("listCodegen 数据源回归", () => {
  test("静态模式：渲染 items（文本/副标题/徽章/图标），不注入 API loader", () => {
    const scene = makeScene([
      baseComponent({
        config: {
          dataMode: "static",
          items: [
            { text: "苹果", subtext: "每日一个", icon: "star", avatarUrl: "", badge: "水果" },
            { text: "香蕉", subtext: "", icon: "", avatarUrl: "", badge: "" },
          ],
        },
      }),
    ]);
    const html = listCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
    expect(html).toContain(">苹果<");
    expect(html).toContain(">每日一个<");
    expect(html).toContain(">水果<");
    expect(html).toContain(">香蕉<");
    // 静态图标走编译期 material path SVG（star）
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("getNestedValue");
    expect(html).not.toContain("doFetch");
  });

  test("staticData 非空时优先渲染 staticData，空则回退 items", () => {
    const primary = makeScene([
      baseComponent({
        config: {
          dataMode: "static",
          items: [{ text: "FROM_ITEMS", subtext: "", icon: "", avatarUrl: "", badge: "" }],
          staticData: JSON.stringify([{ text: "FROM_STATIC", subtext: "", icon: "", avatarUrl: "", badge: "" }]),
        },
      }),
    ]);
    const primaryHtml = listCodegen(primary.views![0]!.components[0]!, makeCtx(primary));
    expect(primaryHtml).toContain(">FROM_STATIC<");
    expect(primaryHtml).not.toContain(">FROM_ITEMS<");

    const fallback = makeScene([
      baseComponent({
        config: {
          dataMode: "static",
          items: [{ text: "FROM_ITEMS", subtext: "", icon: "", avatarUrl: "", badge: "" }],
          staticData: "",
        },
      }),
    ]);
    const fallbackHtml = listCodegen(fallback.views![0]!.components[0]!, makeCtx(fallback));
    expect(fallbackHtml).toContain(">FROM_ITEMS<");
  });

  test("title 字段回退为文本（与编辑器 parseItems 对齐）", () => {
    const scene = makeScene([
      baseComponent({
        config: {
          dataMode: "static",
          items: [{ title: "仅标题项", desc: "来自 desc 的副标题" }],
        },
      }),
    ]);
    const html = listCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
    expect(html).toContain(">仅标题项<");
    expect(html).toContain(">来自 desc 的副标题<");
  });

  test("API 模式：dataLoaderScript 骨架 + mount 暴露 + 运行时图标渲染 + 首屏占位保留", () => {
    const scene = makeScene([
      baseComponent({
        config: {
          dataMode: "api",
          apiUrl: "https://api.example.com/notes",
          apiMethod: "GET",
          apiInterval: 5,
          apiDataPath: "data.list",
          items: [{ text: "占位项", subtext: "", icon: "", avatarUrl: "", badge: "" }],
        },
      }),
    ]);
    const html = listCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
    // 统一取数骨架（URL 拼接 / 认证 / dataPath / 轮询全部由 dataLoaderScript 提供）
    expect(html).toContain("getNestedValue");
    expect(html).toContain("doFetch");
    expect(html).toContain("setInterval(doFetch, apiInterval * 1000)");
    // 运行时 mount 暴露给 loader 回调（数据到达后重建列表项）
    expect(html).toContain('window["__wcLst_');
    // 运行时图标渲染：内嵌 material path 表 + renderIcon（图标不再渲染成名字文本）
    expect(html).toContain("function renderIcon");
    expect(html).toContain("iconPaths");
    // 接口模式下不渲染编译期本地占位条目（数据由接口驱动填充）
    expect(html).not.toContain(">占位项<");
  });

  test("API 模式运行时 buildItemHTML 含图标分支（修复运行时丢图标缺陷）", () => {
    const scene = makeScene([
      baseComponent({
        config: {
          dataMode: "api",
          apiUrl: "https://api.example.com/notes",
          items: [{ text: "占位", subtext: "", icon: "", avatarUrl: "", badge: "" }],
        },
      }),
    ]);
    const html = listCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
    // 运行时模板里 icon 分支调用 renderIcon（此前运行时只有 avatarUrl 分支）
    expect(html).toMatch(/item\.icon\)[^;]*;/);
    expect(html).toContain("renderIcon(item.icon, iconSize)");
  });
});
