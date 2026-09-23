import { describe, test, expect } from "vitest";
import { echartsCodegen } from "../components/echarts";
import type { SceneDSL } from "../../types/scene";
import type { SceneComponent } from "../../types/editor";
import type { CodegenContext } from "../types";
import { DEFAULT_CANVAS_CONFIG } from "../../store/editorStore";
import { createDefaultTransform } from "../../types/editor";

/**
 * echarts 数据链路回归测试
 *  1. 认证布尔字面量（回归：独立骨架曾用 authEnabled === "true" 字符串比较布尔，
 *     导致 Token 永不注入）
 *  2. POST 请求体按原文发送 + 自动补 Content-Type（与统一骨架对齐）
 *  3. 取数骨架与 dataLoaderScript 同源（dataFetchParts）
 *  4. 静态模式 apiMode 门控不调度取数
 *  5. 生成 runtime 语法校验
 */

const mk = (type: string, config: Record<string, unknown>): { scene: SceneDSL; comp: SceneComponent } => {
  const comp: SceneComponent = {
    id: "c1", type, name: "C",
    transform: createDefaultTransform({ x: 0, y: 0, width: 400, height: 300 }),
    layerId: "l1", zIndex: 0, locked: false, visible: true,
    config, children: [], parentId: null,
  };
  const scene: SceneDSL = {
    id: "s", name: "S", status: "draft", tags: [], metadata: {},
    createdAt: 0, updatedAt: 0,
    canvasConfig: { ...DEFAULT_CANVAS_CONFIG, width: 1024, height: 768 },
    views: [{ id: "v1", name: "D", components: [comp], layers: [] }],
    apiConfig: { baseUrl: "", authEnabled: false, defaultHeaders: {}, timeout: 10000 },
  };
  return { scene, comp };
};

const mkCtx = (scene: SceneDSL): CodegenContext => ({
  view: scene.views![0]!, canvasConfig: scene.canvasConfig!, scene, preview: true,
  componentMap: new Map(scene.views![0]!.components.map((c) => [c.id, c])),
  childrenByParent: new Map(), pageStyles: [], pageScripts: [], externalDeps: [], iconData: {},
});

const run = (type: string, config: Record<string, unknown>): { html: string; runtime: string } => {
  const { scene, comp } = mk(type, config);
  const ctx = mkCtx(scene);
  const html = echartsCodegen(comp, ctx);
  const runtime = ctx.pageScripts.join("\n");
  return { html, runtime };
};

describe("echartsCodegen 统一取数骨架回归", () => {
  test("API 模式认证为布尔字面量（字符串比较 bug 已随骨架收敛消除）", () => {
    const { runtime } = run("echart-bar", {
      dataMode: "api",
      apiUrl: "https://api.example.com/stats",
      authEnabled: true,
    });
    expect(runtime).toContain("var authEnabled = true");
    expect(runtime).toContain("authEnabled === true");
    expect(runtime).not.toContain('authEnabled === "true"');
  });

  test("API POST 请求体按原文发送并自动补 Content-Type", () => {
    const { runtime } = run("echart-bar", {
      dataMode: "api",
      apiUrl: "https://api.example.com/stats",
      apiMethod: "POST",
      apiBody: '{"range":"1h"}',
    });
    expect(runtime).toContain("var apiBodyRaw = ");
    expect(runtime).toContain("body = apiBodyRaw");
    expect(runtime).toContain('headers["Content-Type"] = "application/json"');
  });

  test("取数骨架与 dataLoaderScript 同源（URL 拼接/全局默认头/取值路径/数据合并回调）", () => {
    const { runtime } = run("echart-line-stacked", {
      dataMode: "api",
      apiUrl: "https://api.example.com/series",
      apiDataPath: "data.series",
      apiInterval: 5,
    });
    // 共享骨架函数（与 dataLoader.ts 同一份生成源）
    expect(runtime).toContain("function buildFetchUrl()");
    expect(runtime).toContain("function buildFetchHeaders()");
    expect(runtime).toContain("window.__WC_DEFAULT_HEADERS");
    expect(runtime).toContain("function getNestedValue");
    // 轮询调度
    expect(runtime).toContain("setInterval(doFetch, apiInterval * 1000)");
    // 认证态联动：登录/登出后立即重取
    expect(runtime).toContain('addEventListener("auth-state-change"');
    // echarts 特有的数据合并回调注入
    expect(runtime).toContain("mergeChartData(data); render();");
  });

  test("静态模式不调度取数（apiMode 门控），URL 变量为空串", () => {
    const { runtime } = run("echart-pie", {
      dataMode: "static",
      values: [10, 20, 30],
    });
    expect(runtime).toContain('var apiUrl = ""');
    expect(runtime).toContain('var apiPath = ""');
    // 调度门控：scheduleFetch 内 apiMode 且配置地址才 doFetch
    expect(runtime).toContain("if (!apiMode || (!apiUrl && !apiPath)) return;");
  });

  test("staticData 预合并逻辑保留（api 返回数据再覆盖）", () => {
    const { runtime } = run("echart-gauge-basic", {
      dataMode: "static",
      value: 42,
      staticData: '{"value": 88}',
    });
    expect(runtime).toContain("var sd = cfg.staticData;");
    expect(runtime).toContain("mergeChartData(sd);");
  });

  test("生成 runtime 语法校验（new Function 仅解析，覆盖普通图表/仪表盘/地图）", () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ["echart-bar", { dataMode: "api", apiUrl: "https://x.example.com/stats", apiMethod: "POST", apiBody: '{"q":"cpu"}', apiInterval: 5, authEnabled: true }],
      ["echart-gauge-basic", { dataMode: "api", apiUrl: "https://x.example.com/value", apiDataPath: "data.value", apiInterval: 3 }],
      ["echart-map", { dataMode: "api", apiUrl: "https://x.example.com/geo", mapName: "china" }],
      ["echart-pie", { dataMode: "static", values: [1, 2, 3] }],
    ];
    for (const [type, config] of cases) {
      const { runtime } = run(type, config);
      expect(() => new Function(runtime), `${type} runtime 语法错误`).not.toThrow();
    }
  });
});
