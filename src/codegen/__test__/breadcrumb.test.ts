import { describe, test, expect } from "vitest";
import { breadcrumbCodegen } from "../components/breadcrumb";
import type { SceneDSL } from "../../types/scene";
import type { SceneComponent } from "../../types/editor";
import type { CodegenContext } from "../types";
import { DEFAULT_CANVAS_CONFIG } from "../../store/editorStore";
import { createDefaultTransform } from "../../types/editor";

const baseComponent = (over: Partial<SceneComponent> = {}): SceneComponent => ({
  id: "c1",
  type: "breadcrumb",
  name: "Breadcrumb",
  transform: createDefaultTransform({ x: 0, y: 0, width: 400, height: 48 }),
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
  id: "bc-test",
  name: "Breadcrumb Test",
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

const run = (config: Record<string, unknown>): string => {
  const scene = makeScene([baseComponent({ config })]);
  return breadcrumbCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
};

describe("breadcrumbCodegen 数据源回归", () => {
  test("静态模式：渲染标签与 <a> 链接、箭头分隔符，不注入 loader", () => {
    const html = run({
      dataMode: "static",
      items: [
        { label: "首页", href: "/", icon: "home" },
        { label: "分类", href: "", icon: "" },
        { label: "当前页", href: "", icon: "" },
      ],
      separator: "chevron",
    });
    expect(html).toContain(">首页<");
    expect(html).toContain('href="/"');
    expect(html).toContain(">分类<");
    expect(html).toContain(">当前页<");
    // 3 项 → 2 个箭头分隔符
    const chevrons = html.match(/M9\.29 6\.71/g)?.length ?? 0;
    expect(chevrons).toBe(2);
    expect(html).not.toContain("doFetch");
    expect(html).not.toContain("getNestedValue");
  });

  test("文本分隔符渲染", () => {
    const html = run({
      dataMode: "static",
      items: [{ label: "a", href: "" }, { label: "b", href: "" }],
      separator: "text",
      separatorText: "/",
    });
    expect(html).toContain(">a<");
    expect(html).toContain(">b<");
    expect(html).toMatch(/>\/</);
  });

  test("无 href 的项渲染为 span 非链接", () => {
    const html = run({
      dataMode: "static",
      items: [{ label: "仅文本", href: "", icon: "" }],
      separator: "chevron",
    });
    expect(html).toContain(">仅文本<");
    expect(html).not.toMatch(/<a /);
  });

  test("newTab 开启时输出 target=_blank rel=noopener", () => {
    const html = run({
      dataMode: "static",
      items: [
        { label: "首页", href: "https://a.com", newTab: true },
        { label: "当前页", href: "", icon: "" },
      ],
      separator: "chevron",
    });
    expect(html).toContain('href="https://a.com" target="_blank" rel="noopener"');

    const openTab = run({
      dataMode: "static",
      items: [{ label: "首页", href: "/in", newTab: false }],
      separator: "chevron",
    });
    expect(openTab).toContain('href="/in" style');
    expect(openTab).not.toContain('target="_blank"');
  });

  test("api 模式：注入 uid 容器 + mount + dataLoader 取数骨架", () => {
    const html = run({
      dataMode: "api",
      apiUrl: "https://api.example.com/breadcrumbs",
      items: [{ label: "首页", href: "", icon: "" }],
      separator: "chevron",
    });
    expect(html).toContain('id="bc-');
    expect(html).toContain("-inner\"");
    expect(html).toContain("__wcBc_");
    expect(html).toContain("doFetch");
    expect(html).toContain("breadcrumbs");
    // apiPath 与 interval 配置透传
    expect(html).toContain("api.example.com");
  });

  test("响应解包：对象 {items|list|breadcrumbs} → 数组", () => {
    const html = run({
      dataMode: "api",
      apiPath: "x/breadcrumbs",
      items: [{ label: "首页", href: "", icon: "" }],
      separator: "chevron",
    });
    // mount 内需包含面包屑解包键
    expect(html).toContain("Array.isArray(data.breadcrumbs)");
    expect(html).toContain("Array.isArray(data.items)");
    expect(html).toContain("Array.isArray(data.list)");
  });
});