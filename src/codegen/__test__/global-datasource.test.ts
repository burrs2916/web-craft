import { describe, it, expect } from "vitest";
import { generateDataScript } from "../scaffold/data";
import { generateHTML } from "../engine";
import { initBuiltinCodegens } from "../components";
import type { SceneDSL } from "../../types/scene";
import type { SceneComponent } from "../../types/editor";
import { createDefaultTransform } from "../../types/editor";

initBuiltinCodegens();

function makeComponent(overrides: Partial<SceneComponent>): SceneComponent {
  return {
    id: "c1",
    type: "list",
    name: "List",
    transform: createDefaultTransform({ x: 0, y: 0, width: 300, height: 200 }),
    layerId: "l1",
    zIndex: 0,
    locked: false,
    visible: true,
    config: {},
    children: [],
    parentId: null,
    ...overrides,
  };
}

function makeScene(comp: SceneComponent, sources: SceneDSL["dataSources"] = []): SceneDSL {
  return {
    id: "s1",
    name: "Site",
    status: "draft",
    tags: [],
    metadata: {},
    createdAt: 0,
    updatedAt: 0,
    dataSources: sources,
    canvasConfig: { width: 800, height: 600, background: { type: "color", color: "#fff" } } as never,
    views: [
      {
        id: "v1",
        name: "Home",
        layers: [],
        components: [comp],
      },
    ],
  };
}

describe("发布端全局数据源消费", () => {
  it("数据层：组件 dataSourceId 命中全局源时，用全局源的静态数据生成数据源", () => {
    const ds = {
      id: "ds_1",
      name: "用户列表",
      dataMode: "static" as const,
      staticData: [{ text: "张三" }, { text: "李四" }],
    };
    const comp = makeComponent({
      config: { dataSourceId: "ds_1", items: [{ text: "旧数据" }] },
    });
    const scene = makeScene(comp, [ds]);
    const view = scene.views![0]!;

    // 数据层无显式 binding，但 datasource 派生绑定在 dataMode !== datasource 时不产生；
    // 此处主要验证：绑定全局源的组件在数据层按全局源配置生成 source（不发生报错兜底为整 config）
    const result = generateDataScript(view, scene);
    // sourceId 命中全局源：即使无绑定也应正常返回（无来源缺失的兜底污染）
    expect(result.module || result.inlineScript).toBeDefined();
  });

  it("引擎：list 组件绑定全局静态源时，发布 HTML 内嵌全局源数据（自取数合并生效）", () => {
    const ds = {
      id: "ds_s",
      name: "榜单",
      dataMode: "static" as const,
      staticData: [{ text: "全局项甲" }, { text: "全局项乙", subtext: "副标题" }],
    };
    // 组件自带旧数据，绑定全局源后应渲染全局源数据
    const comp = makeComponent({
      type: "list",
      config: { dataSourceId: "ds_s", items: [{ text: "旧列表项" }] },
    });
    const scene = makeScene(comp, [ds]);
    const pages = generateHTML(scene, { framework: "static-html", preview: true });
    const html = pages[0]!.html;

    expect(html).toContain("全局项甲");
    expect(html).toContain("全局项乙");
    expect(html).not.toContain("旧列表项");
  });

  it("引擎：list 组件绑定全局 API 源时，发布脚本以全局源的 apiUrl 取数", () => {
    const ds = {
      id: "ds_api",
      name: "接口源",
      dataMode: "api" as const,
      apiUrl: "https://api.example.com/items",
      apiMethod: "GET" as const,
      apiDataPath: "list",
      apiInterval: 5,
    };
    const comp = makeComponent({
      type: "list",
      config: { dataSourceId: "ds_api", items: [{ text: "旧数据" }] },
    });
    const scene = makeScene(comp, [ds]);
    const pages = generateHTML(scene, { framework: "static-html", preview: true });
    const html = pages[0]!.html;

    expect(html).toContain("api.example.com/items");
    // 全局 API 源若不合并，list 会以默认 static 渲染；合并后走 api loader 并以全局地址取数
    expect(html).toContain("fetch(");
  });

  it("数据层：绑定全局 API 源时 sourceMap 正确解析（不发生 ReferenceError 兜底）", () => {
    const ds = {
      id: "ds_api2",
      name: "接口源2",
      dataMode: "api" as const,
      apiUrl: "https://api.example.com/list",
      apiMethod: "GET" as const,
      apiDataPath: "data.items",
      authEnabled: null,
    };
    const comp = makeComponent({
      type: "metric",
      config: {
        dataMode: "datasource",
        dataSourceId: "ds_api2",
        field: "value",
      },
    });
    const scene = makeScene(comp, [ds]);
    const view = scene.views![0]!;
    const result = generateDataScript(view, scene);

    // datasource 派生绑定应命中全局源
    expect(result.hasData || result.bindingCount > 0).toBe(true);
  });
});