import { describe, it, expect, beforeAll } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { generateHTML } from "../engine";
import { registerBasicComponents } from "../../editor/registerBasicComponents";
import { componentRegistry } from "../../editor/registryCore";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import type { SceneDSL } from "../../types/scene";

/**
 * 音频组件（media 组）动态数据接入 + 媒体族外观口径收口的契约锁。
 *
 * 背景（本轮补齐的真实缺口）：媒体组三件套里图片与视频都能接动态资源，
 * 音频只认面板里填死的地址 —— 「数据模式 / 接口地址 / 认证开关 / 全局数据源绑定」整段缺失，
 * 于是"认证 / 非认证两种接入方式"在音频上根本不存在。本轮补齐后三者同构。
 *
 * 同时把音频自带的一份样式字面量收进 `resolveMediaStyle`（媒体族唯一口径）：
 * 圆角 / 边框 / 阴影 / 底色 / 透明度 / 空态配色与图片视频逐项同口径，
 * 默认值刻意取"改动前的观感"（空态透明底 + 副标题色文字）→ 历史产物零回归。
 */

initBuiltinCodegens();
beforeAll(() => registerBasicComponents());

const ctx = { pageScripts: [] as string[], pageStyles: [] as string[] } as never;

function comp(config: Record<string, unknown>): SceneComponent {
  return {
    id: "aud1",
    type: "audio",
    name: "音频",
    transform: createDefaultTransform({ x: 0, y: 0, width: 360, height: 68 }),
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
  const fn = getCodegen("audio");
  expect(fn, "缺少 audio 的 codegen").toBeTruthy();
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

const base = () => ({ ...((componentRegistry.get("audio")!.defaultConfig ?? {}) as Record<string, unknown>) });

describe("audio：属性栏数据源能力（与图片/视频同构）", () => {
  it("暴露与其他动态数据组件一致的字段集（含认证三态与全局数据源）", () => {
    const keys = (componentRegistry.get("audio")?.configSchema ?? []).map((f) => f.key);
    for (const k of [
      "dataSourceId", "dataMode", "apiUrl", "apiPath", "apiMethod",
      "apiBody", "apiHeaders", "apiInterval", "apiDataPath", "authEnabled",
      "apiSrcField", "apiCoverField",
    ]) {
      expect(keys, `audio 缺少数据源字段 ${k}`).toContain(k);
    }
  });

  it("接口模式下隐藏静态「音频源/封面」，静态模式下隐藏接口字段（不出现两个打架的入口）", () => {
    const schema = componentRegistry.get("audio")!.configSchema!;
    const source = schema.find((f) => f.key === "source")!;
    expect(source.hidden?.({ dataMode: "api" })).toBe(true);
    expect(source.hidden?.({ dataMode: "static" })).toBe(false);
    const cover = schema.find((f) => f.key === "cover")!;
    expect(cover.hidden?.({ dataMode: "api" })).toBe(true);
    expect(cover.hidden?.({ dataMode: "static" })).toBe(false);

    const apiUrl = schema.find((f) => f.key === "apiUrl")!;
    expect(apiUrl.hidden?.({ dataMode: "static" })).toBe(true);
    expect(apiUrl.hidden?.({ dataMode: "api" })).toBe(false);
  });

  it("新增的媒体族外观字段齐全，且边框样式只在有边框时出现", () => {
    const schema = componentRegistry.get("audio")!.configSchema!;
    for (const k of ["boxShadow", "emptyBg", "emptyColor", "borderStyle"]) {
      expect(schema.map((f) => f.key), `audio 缺少样式字段 ${k}`).toContain(k);
    }
    const bs = schema.find((f) => f.key === "borderStyle")!;
    expect(bs.hidden?.({ borderWidth: 0 })).toBe(true);
    expect(bs.hidden?.({ borderWidth: 2 })).toBe(false);
  });
});

describe("audio：接口取音频（认证 / 非认证）", () => {
  it("静态模式产物不含取数脚本（历史行为零回归）", () => {
    const html = render({ ...base(), source: "https://cdn.example.com/a.mp3", cover: "/c.jpg" });
    expect(html).toContain("cdn.example.com/a.mp3");
    expect(html).toContain('src="/c.jpg"');
    expect(html).not.toContain("fetch(");
  });

  it("接口模式：产物带取数骨架、地址、字段映射，空态默认显示", () => {
    const html = render({
      ...base(),
      dataMode: "api",
      apiUrl: "https://api.example.com/audio.json",
      apiMethod: "GET",
      apiDataPath: "data",
      apiSrcField: "data.audio.url",
      apiCoverField: "data.audio.cover",
      apiInterval: 10,
    });
    expect(html).toContain("api.example.com/audio.json");
    expect(html).toContain("fetch(");
    expect(html).toContain("data.audio.url");
    expect(html).toContain("data.audio.cover");
    expect(html).toContain("var apiInterval = 10;");
    // 接口模式下 audio 元素已渲染（src 由脚本写入），空态先显示、数据到达后隐藏
    expect(html).toMatch(/id="aud-[a-z0-9]+a"/);
    expect(html).toMatch(/id="aud-[a-z0-9]+e"[^>]*display:flex/);
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

  it("接口未配置时不产生 fetch（避免空接口把页面刷爆）", () => {
    const html = render({ ...base(), dataMode: "api" });
    expect(html).not.toContain("fetch(");
  });
});

describe("audio：全局数据源绑定（引擎层合并）", () => {
  it("绑定的全局 API 源覆盖组件自带取数配置", () => {
    const scene = makeScene(
      { source: "", dataSourceId: "ds_a", dataMode: "static", apiUrl: "https://self.example.com/old" },
      [{
        id: "ds_a",
        name: "音频源",
        dataMode: "api",
        apiUrl: "https://global.example.com/audio",
        apiMethod: "GET",
        apiDataPath: "data.audio",
        apiInterval: 3,
      } as never],
    );
    const html = generateHTML(scene, { framework: "static-html", preview: true })[0]!.html;
    expect(html).toContain("global.example.com/audio");
    expect(html).not.toContain("self.example.com/old");
  });
});

describe("audio：媒体族样式口径（resolveMediaStyle）", () => {
  it("圆角按面板值 × 10 输出（与图片/视频同一口径）", () => {
    const html = render({ ...base(), borderRadius: 4, source: "/a.mp3" });
    expect(html).toContain("border-radius:40px");
  });

  it("阴影 / 边框样式 / 空态配色都能改变产物（不是假控件）", () => {
    const b = base();
    const plain = render({ ...b, source: "/a.mp3" });
    expect(render({ ...b, source: "/a.mp3", boxShadow: "0 8px 24px rgba(0,0,0,.25)" })).not.toBe(plain);
    expect(render({ ...b, source: "/a.mp3", borderWidth: 2, borderStyle: "dashed" })).toContain("border:2px dashed");
    const empty = render({ ...b, source: "" });
    expect(empty).toContain("未设置音频");
    const emptyStyled = render({ ...b, source: "", emptyBg: "#123456", emptyColor: "#abcdef" });
    expect(emptyStyled).toContain("background:#123456");
    expect(emptyStyled).toContain("color:#abcdef");
  });

  it("默认外观与媒体族统一空态 token 一致（白底 + 深灰文字，不再透明底）", () => {
    const html = render({ ...base(), source: "/a.mp3" });
    // 空态底色白 #ffffff、文字色深灰 #555555 —— 与图片/视频/iframe 同口径（mediaStyle.ts 统一 token）
    const empty = render({ ...base(), source: "" });
    expect(empty).toContain("background:#ffffff");
    expect(empty).toContain("color:#555555");
    expect(html).not.toContain("box-shadow");
  });
});
