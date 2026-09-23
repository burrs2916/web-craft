import { describe, it, expect, beforeAll } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { generateHTML } from "../engine";
import { registerBasicComponents } from "../../editor/registerBasicComponents";
import { componentRegistry } from "../../editor/registryCore";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import type { SceneDSL } from "../../types/scene";

/**
 * 视频组件（media 组）动态数据接入契约锁。
 *
 * 背景：媒体组三件套里，图片与音频都有「数据模式 / 接口地址 / 认证开关 / 全局数据源绑定」，
 * 唯独视频只能填死地址 —— 属性栏缺一整段「认证 / 非认证」接入能力。本轮补齐后三者同构：
 *   - 静态模式：面板里的「视频源 / 封面图」直接生效（历史行为不变）
 *   - 接口模式：统一取数骨架拉取，`apiSrcField` 取视频地址、`apiPosterField` 取封面
 *   - 认证：`authEnabled` 三态（true 注入 / false 明确不注入 / null 跟随站点全局认证态）
 *   - 全局数据源：绑定后由引擎层合并，组件自带取数配置被覆盖（与其他组件同一套语义）
 */

initBuiltinCodegens();
beforeAll(() => registerBasicComponents());

const ctx = { pageScripts: [] as string[], pageStyles: [] as string[] } as never;

function comp(config: Record<string, unknown>): SceneComponent {
  return {
    id: "vid1",
    type: "video",
    name: "视频",
    transform: createDefaultTransform({ x: 0, y: 0, width: 400, height: 300 }),
    layerId: "l1",
    zIndex: 0,
    locked: false,
    visible: true,
    config,
    children: [],
    parentId: null,
  };
}

function render(config: Record<string, unknown>): string {
  const fn = getCodegen("video");
  expect(fn, "缺少 video 的 codegen").toBeTruthy();
  return fn!(comp(config), ctx) ?? "";
}

function makeScene(config: Record<string, unknown>, sources: SceneDSL["dataSources"] = []): SceneDSL {
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
    views: [{ id: "v1", name: "Home", layers: [], components: [comp(config)] }],
  };
}

describe("video：属性栏数据源能力", () => {
  it("暴露与其他动态数据组件一致的字段集（含认证三态与全局数据源）", () => {
    const keys = (componentRegistry.get("video")?.configSchema ?? []).map((f) => f.key);
    for (const k of [
      "dataSourceId", "dataMode", "apiUrl", "apiPath", "apiMethod",
      "apiBody", "apiHeaders", "apiInterval", "apiDataPath", "authEnabled",
      "apiSrcField", "apiPosterField",
    ]) {
      expect(keys, `video 缺少数据源字段 ${k}`).toContain(k);
    }
  });

  it("接口模式下隐藏静态「视频源」，静态模式下隐藏接口字段（不出现两个打架的入口）", () => {
    const schema = componentRegistry.get("video")!.configSchema!;
    const source = schema.find((f) => f.key === "source")!;
    expect(source.hidden?.({ dataMode: "api" })).toBe(true);
    expect(source.hidden?.({ dataMode: "static" })).toBe(false);

    const apiUrl = schema.find((f) => f.key === "apiUrl")!;
    expect(apiUrl.hidden?.({ dataMode: "static" })).toBe(true);
    expect(apiUrl.hidden?.({ dataMode: "api" })).toBe(false);
  });
});

describe("video：接口取视频（认证 / 非认证）", () => {
  /* 注册发生在 beforeAll，故默认值必须在用例内取（describe 体在收集期就执行） */
  const base = () => (componentRegistry.get("video")!.defaultConfig ?? {}) as Record<string, unknown>;

  it("静态模式产物不含取数脚本（历史行为零回归）", () => {
    const html = render({ ...base(), source: "https://cdn.example.com/a.mp4", poster: "/p.jpg" });
    expect(html).toContain("cdn.example.com/a.mp4");
    expect(html).toContain('poster="/p.jpg"');
    expect(html).not.toContain("fetch(");
  });

  it("接口模式：产物带取数骨架、地址、字段映射，空态默认显示", () => {
    const html = render({
      ...base(),
      dataMode: "api",
      apiUrl: "https://api.example.com/video.json",
      apiMethod: "GET",
      apiDataPath: "data",
      apiSrcField: "data.video.url",
      apiPosterField: "data.video.cover",
      apiInterval: 10,
    });
    expect(html).toContain("api.example.com/video.json");
    expect(html).toContain("fetch(");
    expect(html).toContain("data.video.url");
    expect(html).toContain("data.video.cover");
    expect(html).toContain("var apiInterval = 10;");
    // 接口模式下先展示空态，数据到达后由脚本切换
    expect(html).toMatch(/id="vid-[a-z0-9]+e"[^>]*display:flex/);
  });

  it("认证三态：true 注入 / false 明确不注入 / 未配置跟随站点全局", () => {
    const withAuth = (authEnabled: unknown) =>
      render({ ...base(), dataMode: "api", apiUrl: "https://api.example.com/x", authEnabled });

    expect(withAuth(true)).toContain("var authEnabled = true;");
    expect(withAuth(false)).toContain("var authEnabled = false;");
    expect(withAuth(undefined)).toContain("var authEnabled = null;");
    // null 分支必须回落到站点全局开关，而不是被压成"明确禁用"
    expect(withAuth(undefined)).toContain("window.__WC_AUTH_ENABLED");
  });
});

describe("video：全局数据源绑定（引擎层合并）", () => {
  it("绑定的全局 API 源覆盖组件自带取数配置", () => {
    const scene = makeScene(
      { source: "", dataSourceId: "ds_v", dataMode: "static", apiUrl: "https://self.example.com/old" },
      [{
        id: "ds_v",
        name: "视频源",
        dataMode: "api",
        apiUrl: "https://global.example.com/video",
        apiMethod: "GET",
        apiDataPath: "data.video",
        apiInterval: 3,
      } as never],
    );
    const html = generateHTML(scene, { framework: "static-html", preview: true })[0]!.html;
    expect(html).toContain("global.example.com/video");
    expect(html).not.toContain("self.example.com/old");
  });
});
