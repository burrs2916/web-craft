import { describe, it, expect } from "vitest";
import { buildApiUrl } from "../../editor/hooks/useApiDataFetch";
import { generateHTML } from "../engine";
import { initBuiltinCodegens } from "../components";
import type { SceneDSL } from "../../types/scene";
import type { SceneComponent } from "../../types/editor";
import { createDefaultTransform } from "../../types/editor";

initBuiltinCodegens();

/**
 * URL 拼接契约 —— 编辑端 useApiDataFetch.buildApiUrl 与发布端 codegen `__wc_buildUrl` 必须保持一致：
 *   1. apiUrl 为完整的 http(s) URL → 直接使用（忽略 baseUrl）
 *   2. apiUrl 为非 http 的路径 → 与 baseUrl 拼接（baseUrl 为空则原样返回）
 *   3. apiPath 有值 → 与 baseUrl 拼接（baseUrl 为空则原样返回）
 *   4. apiUrl 与 apiPath 均为空 → 返回 baseUrl 本身（未配置则为空串）
 * 任何单侧改动导致漂移，都会让预览与发布取数地址不一致，本测试用于锁死该契约。
 */

describe("buildApiUrl（编辑端）", () => {
  it("完整 http URL 直连，忽略 baseUrl", () => {
    expect(buildApiUrl("https://api.x.com/items", "", "https://base.com/")).toBe("https://api.x.com/items");
  });

  it("相对 apiUrl 与 baseUrl 拼接，处理斜杠", () => {
    expect(buildApiUrl("metrics/cpu", "", "https://base.com/")).toBe("https://base.com/metrics/cpu");
    expect(buildApiUrl("/metrics/cpu", "", "https://base.com")).toBe("https://base.com/metrics/cpu");
  });

  it("apiUrl 相对、baseUrl 为空 → 原样返回 apiUrl", () => {
    expect(buildApiUrl("metrics/cpu", "", "")).toBe("metrics/cpu");
    expect(buildApiUrl("metrics/cpu", "", undefined as unknown as string)).toBe("metrics/cpu");
  });

  it("apiUrl 为空时用 apiPath 与 baseUrl 拼接", () => {
    expect(buildApiUrl("", "items/list", "https://base.com")).toBe("https://base.com/items/list");
  });

  it("apiUrl 为空、baseUrl 为空 → 返回空串", () => {
    expect(buildApiUrl("", "", "")).toBe("");
  });

  it("apiUrl 与 apiPath 均为空 → 返回 baseUrl 本身", () => {
    expect(buildApiUrl("", "", "https://base.com")).toBe("https://base.com");
  });
});

describe("发布端代码生成 URL（与编辑端一致）", () => {
  function makeListComp(overrides: Partial<SceneComponent>): SceneComponent {
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

  function render(config: Record<string, unknown>, apiConfig?: SceneDSL["apiConfig"]) {
    const comp = makeListComp({ config: { dataMode: "api", ...config }, bindings: [{ id: "b1", sourceId: "s1", field: "", targetProperty: "value", type: "value" }] });
    const scene: SceneDSL = {
      id: "s1",
      name: "Site",
      status: "draft",
      tags: [],
      metadata: {},
      createdAt: 0,
      updatedAt: 0,
      apiConfig,
      views: [{ id: "v1", name: "Home", layers: [], components: [comp] }],
      canvasConfig: { width: 800, height: 600, background: { type: "color", color: "#fff" } } as never,
    };
    return generateHTML(scene, { framework: "static-html", preview: true })[0]!.html;
  }

  it("完整 http URL 直连，不拼接 baseUrl", () => {
    const html = render({ apiUrl: "https://api.x.com/items" }, { baseUrl: "https://base.com/", defaultHeaders: {}, timeout: 10000, authEnabled: false });
    expect(html).toContain("https://api.x.com/items");
    expect(html).not.toContain("https://base.com/https://api.x.com");
  });

  it("相对 apiUrl 与全局 baseUrl 拼接", () => {
    const html = render({ apiUrl: "metrics/cpu" }, { baseUrl: "https://base.com/", defaultHeaders: {}, timeout: 10000, authEnabled: false });
    // 拼接在运行时 __wc_buildUrl 完成：原始 HTML 内嵌 baseUrl 常量，并把 apiUrl 作为路径传入 buildUrl
    expect(html).toContain('__wc_buildUrl("metrics/cpu", "")');
    expect(html).toContain('"https://base.com/"');
  });

  it("apiUrl 相对、无 baseUrl → 原样输出（不报错、不走拼接）", () => {
    const html = render({ apiUrl: "metrics/cpu" }, { baseUrl: "", defaultHeaders: {}, timeout: 10000, authEnabled: false });
    expect(html).toContain("metrics/cpu");
  });

  it("apiUrl 为空用 apiPath 与 baseUrl 拼接", () => {
    const html = render({ apiPath: "items/list" }, { baseUrl: "https://base.com", defaultHeaders: {}, timeout: 10000, authEnabled: false });
    // apiUrl 为空 → apiPath 作为路径传入 buildUrl，运行时与 baseUrl 拼接
    expect(html).toContain('__wc_buildUrl("", "items/list")');
    expect(html).toContain('"https://base.com"');
  });
});