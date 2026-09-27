import { describe, it, expect, beforeAll } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { registerBasicComponents } from "../../editor/registerBasicComponents";
import { componentRegistry } from "../../editor/registryCore";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import { SHAPE_RADIUS } from "../../editor/data/fieldStyle";

/**
 * 图片（image）组件契约锁 —— 补媒体组 media-iframe / media-video-data /
 * media-audio-data 各自持有、唯独 image 缺失的「注册定义 + 属性栏 schema」层。
 *
 * 发布端产物行为（alt 回退 / fit / 懒加载 / 链接 / 空态与失败兜底 / 题注 /
 * 圆角边框阴影 / 悬浮放大 / 动态取图 / 认证三态 / 字段回退 / 静态互斥）
 * 已由 media.test.ts 全量覆盖，本文件不重复断言，只锁两层：
 * 1. 注册与属性栏：defaultConfig 关键字段、capabilities、数据源字段集、互斥显隐；
 * 2. 空态文案三处同步：defaultConfig / 编辑区渲染器默认 / 发布端默认同读「未设置图片」。
 */

initBuiltinCodegens();
beforeAll(() => registerBasicComponents());

const ctx = { pageScripts: [] as string[], pageStyles: [] as string[] } as never;

function comp(config: Record<string, unknown>): SceneComponent {
  return {
    id: "img1",
    type: "image",
    name: "图片",
    transform: createDefaultTransform({ x: 0, y: 0, width: 300, height: 200 }),
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
  const fn = getCodegen("image");
  expect(fn, "缺少 image 的 codegen").toBeTruthy();
  return fn!(comp(config), ctx) ?? "";
}

const base = () => ({ ...((componentRegistry.get("image")!.defaultConfig ?? {}) as Record<string, unknown>) });

describe("image：注册定义（媒体组同构）", () => {
  it("注册为 image 类型；画像字段与 iframe/video/audio 同构可旋转", () => {
    const def = componentRegistry.get("image")!;
    expect(def.type).toBe("image");
    expect(def.version).toBe("2.0.0");
    expect(def.defaultConfig?.emptyText).toBe("未设置图片");
    expect(def.capabilities?.rotatable).toBe(true);
    expect(def.capabilities?.resizable).toBe(true);
  });

  it("defaultConfig 覆盖内容/链接/数据源/样式四组关键字段", () => {
    const cfg = base();
    for (const k of [
      // 内容
      "source", "alt", "caption", "fit", "objectPosition", "lazyLoading", "emptyText", "emptyBg", "emptyColor",
      // 链接
      "link", "linkTarget",
      // 数据源
      "dataSourceId", "dataMode", "apiUrl", "apiMethod", "apiInterval", "apiDataPath", "authEnabled", "apiSrcField",
      // 样式
      "bgColor", "borderWidth", "borderColor", "borderRadius", "boxShadow", "opacity", "hoverScale", "hoverDuration",
    ]) {
      expect(cfg, `image defaultConfig 缺少字段 ${k}`).toHaveProperty(k);
    }
  });

  it("样式口径走媒体组唯一 resolveMediaStyle（圆角面板值 × SHAPE_RADIUS）", () => {
    // 口径归属已由 media.test.ts 的 resolveMediaStyle 用例锁定：
    // image 的 codegen 容器样式来自同一函数，此处只需确认产物确实经该口径输出
    const out = render({ ...base(), source: "/a.png", borderRadius: 3 });
    expect(out).toContain(`border-radius:${3 * SHAPE_RADIUS}px`);
  });
});

describe("image：属性栏能力（媒体组同构）", () => {
  it("暴露与三件套一致的数据源字段集（含认证三态与全局数据源）", () => {
    const keys = (componentRegistry.get("image")?.configSchema ?? []).map((f) => f.key);
    for (const k of [
      "dataSourceId", "dataMode", "apiUrl", "apiPath", "apiMethod",
      "apiBody", "apiHeaders", "apiInterval", "apiDataPath", "authEnabled",
      "apiSrcField",
    ]) {
      expect(keys, `image 缺少数据源字段 ${k}`).toContain(k);
    }
  });

  it("静态「图片地址」与接口字段互斥（不出现两个打架的入口）", () => {
    const schema = componentRegistry.get("image")!.configSchema!;
    const src = schema.find((f) => f.key === "source")!;
    expect(src.hidden?.({ dataMode: "api" })).toBe(true);
    expect(src.hidden?.({ dataMode: "static" })).toBe(false);
    const apiUrl = schema.find((f) => f.key === "apiUrl")!;
    expect(apiUrl.hidden?.({ dataMode: "static" })).toBe(true);
    expect(apiUrl.hidden?.({ dataMode: "api" })).toBe(false);
  });

  it("内容/样式字段可配置：空态文案、懒加载、链接目标、悬浮放大", () => {
    const schema = componentRegistry.get("image")!.configSchema!;
    for (const k of ["emptyText", "lazyLoading", "link", "linkTarget", "hoverScale", "hoverDuration"]) {
      expect(schema.some((f) => f.key === k), `image 属性栏缺少字段 ${k}`).toBe(true);
    }
  });
});

describe("image：空态文案三处同步", () => {
  it("defaultConfig 与发布端 codegen 默认都是『未设置图片』", () => {
    expect(componentRegistry.get("image")!.defaultConfig?.emptyText).toBe("未设置图片");
    const out = render({ ...base(), source: "" });
    expect(out).toContain("未设置图片");
    // 有静态资源时发布端才挂失败兜底（缺省无图时没有 img 元素可挂事件）
    const withBroken = render({ ...base(), source: "/broken.png" });
    expect(withBroken).toContain("未设置图片");
    expect(withBroken).toContain("addEventListener('error'");
    expect(withBroken).toMatch(/img-[a-z0-9]+-empty"[^>]*display:none/);
  });

  it("显式配置空态文案时两端都跟随配置", () => {
    const out = render({ ...base(), source: "", emptyText: "图片加载中" });
    expect(out).toContain("图片加载中");
    expect(out).not.toContain("未设置图片");
  });
});