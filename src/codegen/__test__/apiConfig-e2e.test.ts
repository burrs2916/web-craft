import { describe, it, expect } from "vitest";
import { generateHTML } from "../engine";
import { generateProjectScaffold } from "../scaffold";
import { initBuiltinCodegens } from "../components";
import { buildApiUrl } from "../../editor/hooks/useApiDataFetch";
import { useEditorStore, DEFAULT_CANVAS_CONFIG } from "../../store/editorStore";
import { createDefaultTransform } from "../../types/editor";
import type { SceneDSL } from "../../types/scene";
import type { SceneComponent } from "../../types/editor";

/**
 * 全局 API 配置面板端到端实测
 *
 * 链路：面板 UI（editorStore.setApiConfig）→ 编辑态拼接（buildApiUrl）
 *       → 场景持久化（scene.apiConfig）→ 发布产物（generateHTML / generateProjectScaffold）
 *       → 产物运行时拼接（__wc_buildUrl / buildFetchUrl）
 *
 * 验收核心：编辑态与发布产物的 URL 拼接规则完全一致（完整 URL 直连 /
 * 相对路径拼 baseUrl / 均空回退 baseUrl）。
 */

const BASE_URL = "https://api.example.com/v1";

function makeMetric(): SceneComponent {
  return {
    id: "c-metric",
    type: "metric",
    name: "指标卡",
    transform: createDefaultTransform({ x: 0, y: 0, width: 240, height: 120 }),
    layerId: "l1",
    zIndex: 0,
    locked: false,
    visible: true,
    config: {
      title: "访问量",
      value: "--",
      dataMode: "api",
      apiUrl: "metrics/summary",
      apiPath: "",
      apiMethod: "GET",
      apiDataPath: "data.value",
      apiInterval: 0,
      authEnabled: null,
      apiHeaders: "{}",
    },
    children: [],
    parentId: null,
  };
}

function makeScene(apiConfig?: Partial<NonNullable<SceneDSL["apiConfig"]>>): SceneDSL {
  return {
    id: "e2e-api-scene",
    name: "API 实测",
    status: "draft",
    tags: [],
    metadata: {},
    canvasConfig: { ...DEFAULT_CANVAS_CONFIG, width: 800, height: 600 },
    apiConfig: {
      baseUrl: BASE_URL,
      authEnabled: true,
      defaultHeaders: { "X-Tenant": "acme" },
      timeout: 8000,
      ...apiConfig,
    },
    views: [{
      id: "v1",
      name: "Home",
      components: [makeMetric()],
      layers: [],
      canvasConfig: { ...DEFAULT_CANVAS_CONFIG, width: 800, height: 600 },
    }],
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("端到端实测 1/3：编辑态面板链路（editorStore → buildApiUrl）", () => {
  it("面板提交 apiConfig 后 store 更新，buildApiUrl 由 store 值驱动拼接（4 规则）", () => {
    // 模拟面板 UI 提交（与 EditorApiConfigPanel 相同的 setApiConfig 调用）
    useEditorStore.getState().setApiConfig({
      baseUrl: BASE_URL,
      authEnabled: true,
      defaultHeaders: { "X-Tenant": "acme" },
      timeout: 8000,
    });
    const cfg = useEditorStore.getState().apiConfig;
    expect(cfg.baseUrl).toBe(BASE_URL);
    expect(cfg.authEnabled).toBe(true);
    expect(cfg.defaultHeaders).toEqual({ "X-Tenant": "acme" });
    expect(cfg.timeout).toBe(8000);

    // ① 相对 apiUrl → 拼 baseUrl（组件默认 metrics/summary）
    expect(buildApiUrl("metrics/summary", "", cfg.baseUrl)).toBe(`${BASE_URL}/metrics/summary`);
    // ② 完整 URL → 直连
    expect(buildApiUrl("https://cdn.other.com/x", "", cfg.baseUrl)).toBe("https://cdn.other.com/x");
    // ③ 空 apiUrl + apiPath → 拼 baseUrl
    expect(buildApiUrl("", "data", cfg.baseUrl)).toBe(`${BASE_URL}/data`);
    // ④ 均空 → 回退 baseUrl
    expect(buildApiUrl("", "", cfg.baseUrl)).toBe(BASE_URL);
  });

  it("面板连续编辑：defaultHeaders 深合并且不丢失其他字段", () => {
    // 模拟面板追加请求头（依赖上一用例已写入的 baseUrl + X-Tenant）
    useEditorStore.getState().setApiConfig({ defaultHeaders: { "X-Api-Key": "k1" } });
    const cfg = useEditorStore.getState().apiConfig;
    expect(cfg.defaultHeaders).toEqual({ "X-Tenant": "acme", "X-Api-Key": "k1" });
    expect(cfg.baseUrl).toBe(BASE_URL);
    expect(cfg.authEnabled).toBe(true);
  });

  it("面板清空基地址后：相对路径原样返回、均空返回空串", () => {
    useEditorStore.getState().setApiConfig({ baseUrl: "" });
    const cfg = useEditorStore.getState().apiConfig;
    expect(buildApiUrl("metrics/summary", "", cfg.baseUrl)).toBe("metrics/summary");
    expect(buildApiUrl("", "", cfg.baseUrl)).toBe("");
  });
});

describe("端到端实测 2/3：发布产物 codegen", () => {
  it("static-html 页面注入全局配置，组件脚本含拼接逻辑", () => {
    initBuiltinCodegens();
    const pages = generateHTML(makeScene(), { framework: "static-html", preview: true });
    const html = pages[0].html;

    // head 注入（来自 scene.apiConfig → generateGlobalConfigScript）
    expect(html).toContain(`window.__WC_API_BASE = ${JSON.stringify(BASE_URL)};`);
    expect(html).toContain("window.__WC_AUTH_ENABLED = true;");
    expect(html).toContain('window.__WC_DEFAULT_HEADERS = {"X-Tenant":"acme"};');
    expect(html).toContain("window.__WC_TIMEOUT = 8000;");

    // 组件 API 轮询脚本（metric dataMode=api → buildFetchUrl）
    expect(html).toContain('var apiUrl = "metrics/summary";');
    expect(html).toContain("function buildFetchUrl()");
  });

  it("react 发布工程 index.html 注入全局配置", () => {
    initBuiltinCodegens();
    const files = generateProjectScaffold(makeScene(), "react", {});
    const index = files.find((f) => f.path === "index.html");
    expect(index).toBeTruthy();
    expect(index!.content).toContain(`window.__WC_API_BASE = ${JSON.stringify(BASE_URL)};`);
    expect(index!.content).toContain("window.__WC_AUTH_ENABLED = true;");
    expect(index!.content).toContain("window.__WC_TIMEOUT = 8000;");
  });
});

describe("端到端实测 3/3：编辑态 buildApiUrl ↔ 发布产物运行时交叉一致", () => {
  it("提取产物 buildFetchUrl 实执行，四类输入与编辑端结果一致", () => {
    initBuiltinCodegens();
    const html = generateHTML(makeScene(), { framework: "static-html", preview: true })[0].html;

    // 提取发布产物中 metric 组件内联的 buildFetchUrl 函数体
    const m = html.match(/function buildFetchUrl\(\) \{[\s\S]*?\n  \}/);
    expect(m).toBeTruthy();
    const fnBody = m![0];

    // 用发布产物函数体构造可执行函数（window/apiUrl/apiPath 作用域注入）
    const factory = new Function(
      "window",
      "apiUrl",
      "apiPath",
      `${fnBody}\nreturn buildFetchUrl;`,
    ) as (win: Record<string, unknown>, apiUrl: string, apiPath: string) => () => string;

    const run = (apiUrl: string, apiPath: string) =>
      factory({ __WC_API_BASE: BASE_URL }, apiUrl, apiPath)();

    // ① 相对路径拼接
    expect(run("metrics/summary", "")).toBe(buildApiUrl("metrics/summary", "", BASE_URL));
    // ② 完整 URL 直连
    expect(run("https://cdn.other.com/x", "")).toBe(buildApiUrl("https://cdn.other.com/x", "", BASE_URL));
    // ③ 空 apiUrl + apiPath
    expect(run("", "data")).toBe(buildApiUrl("", "data", BASE_URL));
    // ④ 均空 → baseUrl
    expect(run("", "")).toBe(buildApiUrl("", "", BASE_URL));
    // 额外：首尾斜杠归一化
    expect(run("/metrics/summary", "")).toBe(buildApiUrl("/metrics/summary", "", BASE_URL));
  });

  it("baseUrl 为空时：发布产物相对路径原样返回、均空返回空串，与编辑端一致", () => {
    initBuiltinCodegens();
    const html = generateHTML(makeScene(), { framework: "static-html", preview: true })[0].html;
    const m = html.match(/function buildFetchUrl\(\) \{[\s\S]*?\n  \}/);
    expect(m).toBeTruthy();
    const factory = new Function(
      "window",
      "apiUrl",
      "apiPath",
      `${m![0]}\nreturn buildFetchUrl;`,
    ) as (win: Record<string, unknown>, apiUrl: string, apiPath: string) => () => string;

    const run = (apiUrl: string, apiPath: string) =>
      factory({ __WC_API_BASE: "" }, apiUrl, apiPath)();

    expect(run("metrics/summary", "")).toBe(buildApiUrl("metrics/summary", "", ""));
    expect(run("", "")).toBe(buildApiUrl("", "", ""));
  });
});