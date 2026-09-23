import { describe, test, expect } from "vitest";
import { tableCodegen } from "../components/table";
import type { SceneDSL } from "../../types/scene";
import type { SceneComponent } from "../../types/editor";
import type { CodegenContext } from "../types";
import { DEFAULT_CANVAS_CONFIG } from "../../store/editorStore";
import { createDefaultTransform } from "../../types/editor";

const baseComponent = (over: Partial<SceneComponent> = {}): SceneComponent => ({
  id: "c1",
  type: "table",
  name: "Table",
  transform: createDefaultTransform({ x: 0, y: 0, width: 400, height: 260 }),
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
  id: "table-test",
  name: "Table Test",
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

describe("tableCodegen 数据源回归", () => {
  test("静态模式：渲染 headers/rows 表格，不注入 API loader", () => {
    const scene = makeScene([
      baseComponent({
        config: {
          dataMode: "static",
          headers: "名称, 数值",
          rows: "CPU, 63\n内存, 72",
        },
      }),
    ]);
    const html = tableCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
    expect(html).toContain("<th");
    expect(html).toContain(">名称<");
    expect(html).toContain(">数值<");
    expect(html).toContain(">CPU<");
    expect(html).toContain(">内存<");
    expect(html).not.toContain("doFetch");
    expect(html).not.toContain("getNestedValue");
  });

  test("staticData 对象数组优先：表头取自首行键名", () => {
    const scene = makeScene([
      baseComponent({
        config: {
          dataMode: "static",
          headers: "旧表头",
          rows: "旧行",
          staticData: JSON.stringify([
            { name: "节点A", load: "63" },
            { name: "节点B", load: "72" },
          ]),
        },
      }),
    ]);
    const html = tableCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
    expect(html).toContain(">name<");
    expect(html).toContain(">load<");
    expect(html).toContain(">节点A<");
    expect(html).not.toContain(">旧表头<");
  });

  test("API 模式：统一取数骨架 + mount 暴露 + 首屏静态占位保留", () => {
    const scene = makeScene([
      baseComponent({
        config: {
          dataMode: "api",
          apiUrl: "https://api.example.com/stats",
          apiMethod: "GET",
          apiInterval: 5,
          apiDataPath: "data.rows",
          headers: "名称, 数值",
          rows: "加载中, --",
        },
      }),
    ]);
    const html = tableCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
    expect(html).toContain("getNestedValue");
    expect(html).toContain("doFetch");
    expect(html).toContain("setInterval(doFetch, apiInterval * 1000)");
    expect(html).toContain('window["__wcTbl_');
    // 运行时重建逻辑保留在 uid 作用域的 mount 脚本
    // （2026-09-20：全局函数名从固定的 renderTable 改为 `__wcTbl_<uid>`，
    //  旧实现挂全局单例、同页两个表格实例会互相覆盖）
    expect(html).toContain("__wcTbl_");
    expect(html).toContain("data.__picked");
    // 接口模式下不渲染编译期本地占位行（数据由接口驱动填充）
    expect(html).not.toContain(">加载中<");
  });

  test("API 模式认证为布尔字面量（authEnabled 字符串比较 bug 已随骨架收敛消除）", () => {
    const scene = makeScene([
      baseComponent({
        config: {
          dataMode: "api",
          apiUrl: "https://api.example.com/stats",
          authEnabled: true,
        },
      }),
    ]);
    const html = tableCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
    expect(html).toContain("var authEnabled = true");
    expect(html).not.toContain('authEnabled === "true"');
  });

  test("API 模式 POST apiBody 透传到统一骨架", () => {
    const scene = makeScene([
      baseComponent({
        config: {
          dataMode: "api",
          apiUrl: "https://api.example.com/stats",
          apiMethod: "POST",
          apiBody: '{"range":"1h"}',
        },
      }),
    ]);
    const html = tableCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
    expect(html).toContain("var apiBodyRaw = ");
    // 请求体按原文 JSON 字符串发送（对象直传 fetch 会抛 TypeError），并自动补 Content-Type
    expect(html).toContain("body = apiBodyRaw");
    expect(html).toContain('headers["Content-Type"] = "application/json"');
  });
});
