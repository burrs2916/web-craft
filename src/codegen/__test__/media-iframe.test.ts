import { describe, it, expect, beforeAll } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { registerBasicComponents } from "../../editor/registerBasicComponents";
import { componentRegistry } from "../../editor/registryCore";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import { SHAPE_RADIUS } from "../../editor/data/fieldStyle";

/**
 * 网页嵌入（iframe）组件（media 组第四成员）契约锁。
 *
 * 结构与图片/视频/音频完全同构：注册 + 编辑区渲染器 + 发布端 codegen 三方
 * 共享 `resolveMediaStyle`（媒体族唯一口径）与统一取数骨架（dataLoaderScript），
 * 空态 / 题注 / 悬浮放大 / 圆角×10 口径逐项与三件套对齐。
 *
 * iframe 特有约束分两条：
 * 1. sandbox / allow 只在配置了才输出（空的 sandbox 属性 = 全限制沙箱，误带会锁死嵌入页）；
 * 2. 空态只在「无地址」时显示 —— 跨域嵌入加载失败没有可靠事件，两端都不做失败探测。
 */

initBuiltinCodegens();
beforeAll(() => registerBasicComponents());

const ctx = { pageScripts: [] as string[], pageStyles: [] as string[] } as never;

function comp(config: Record<string, unknown>): SceneComponent {
  return {
    id: "ifr1",
    type: "iframe",
    name: "网页嵌入",
    transform: createDefaultTransform({ x: 0, y: 0, width: 480, height: 320 }),
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
  const fn = getCodegen("iframe");
  expect(fn, "缺少 iframe 的 codegen").toBeTruthy();
  return fn!(comp(config), ctx) ?? "";
}

const base = () => ({ ...((componentRegistry.get("iframe")!.defaultConfig ?? {}) as Record<string, unknown>) });

const iframeTag = (out: string) => (out.match(/<iframe[^>]*>/) || [])[0] || "";

describe("iframe：属性栏能力（媒体组同构）", () => {
  it("暴露与三件套一致的数据源字段集（含认证三态与全局数据源）", () => {
    const keys = (componentRegistry.get("iframe")?.configSchema ?? []).map((f) => f.key);
    for (const k of [
      "dataSourceId", "dataMode", "apiUrl", "apiPath", "apiMethod",
      "apiBody", "apiHeaders", "apiInterval", "apiDataPath", "authEnabled",
      "apiSrcField",
    ]) {
      expect(keys, `iframe 缺少数据源字段 ${k}`).toContain(k);
    }
  });

  it("静态「嵌入地址」与接口字段互斥（不出现两个打架的入口）", () => {
    const schema = componentRegistry.get("iframe")!.configSchema!;
    const src = schema.find((f) => f.key === "src")!;
    expect(src.hidden?.({ dataMode: "api" })).toBe(true);
    expect(src.hidden?.({ dataMode: "static" })).toBe(false);
    const apiUrl = schema.find((f) => f.key === "apiUrl")!;
    expect(apiUrl.hidden?.({ dataMode: "static" })).toBe(true);
    expect(apiUrl.hidden?.({ dataMode: "api" })).toBe(false);
  });
});

describe("iframe codegen：静态嵌入", () => {
  it("地址与无障碍标题透传；空 title 回退『嵌入式内容』", () => {
    const out = render({ ...base(), src: "/embed/form", title: "报名表单" });
    expect(iframeTag(out)).toContain('src="/embed/form"');
    expect(iframeTag(out)).toContain('title="报名表单"');
    const fallback = render({ ...base(), src: "/embed/form" });
    expect(iframeTag(fallback)).toContain('title="嵌入式内容"');
  });

  it("空态：无地址时显示且不渲染 iframe 元素；有地址时隐藏", () => {
    const empty = render({ ...base() });
    expect(empty).toContain("未设置嵌入地址");
    expect(empty).toContain("display:flex");
    expect(empty).not.toContain("<iframe");
    // 空态层骨架屏与图片/视频同构（虚线框 + 45° 斜纹）
    expect(empty).toMatch(/dashed rgba\(0,0,0,0\.12\)/);
    expect(empty).toContain("repeating-linear-gradient(45deg");
    const withSrc = render({ ...base(), src: "/embed/x" });
    expect(withSrc).toMatch(/class="ifr-[a-z0-9]+-empty"[^>]*display:none/);
    expect(withSrc).toContain("<iframe");
  });

  it("sandbox / allow 只在配置时输出，空值不带空属性（空 sandbox 属性 = 全限制沙箱）", () => {
    const plain = render({ ...base(), src: "/embed/x" });
    expect(iframeTag(plain)).not.toContain("sandbox");
    expect(iframeTag(plain)).not.toContain(" allow=");
    const locked = render({ ...base(), src: "/embed/x", sandbox: "allow-scripts allow-same-origin", allow: "clipboard-write" });
    expect(iframeTag(locked)).toContain('sandbox="allow-scripts allow-same-origin"');
    expect(iframeTag(locked)).toContain('allow="clipboard-write"');
  });

  it("全屏 / 加载方式 / 来源标识：按配置透传，referrerpolicy 默认值不赘写", () => {
    const full = render({ ...base(), src: "/embed/x", allowFullscreen: true, loading: "eager" });
    expect(iframeTag(full)).toContain("allowfullscreen");
    expect(iframeTag(full)).toContain('loading="eager"');
    const plain = render({ ...base(), src: "/embed/x" });
    expect(iframeTag(plain)).toContain('loading="lazy"');
    expect(iframeTag(plain)).not.toContain("referrerpolicy");
    const hidden = render({ ...base(), src: "/embed/x", referrerPolicy: "no-referrer" });
    expect(iframeTag(hidden)).toContain('referrerpolicy="no-referrer"');
  });

  it("圆角/边框/阴影/底色/透明度作用在容器（与三件套同一口径，面板值 × SHAPE_RADIUS）", () => {
    const out = render({
      ...base(), src: "/embed/x", borderRadius: 3, bgColor: "#fafafa",
      borderWidth: 2, borderColor: "#00ff00", boxShadow: "0 4px 8px #000",
    });
    expect(out).toContain(`border-radius:${3 * SHAPE_RADIUS}px`);
    expect(out).toContain("background:#fafafa");
    expect(out).toContain("border:2px solid #00ff00");
    expect(out).toContain("box-shadow:0 4px 8px #000");
  });

  it("悬浮放大由类规则给出（不写 inline transform），关闭时不输出", () => {
    const out = render({ ...base(), src: "/embed/x", hoverScale: 1.08, hoverDuration: 0.5 });
    expect(iframeTag(out)).not.toContain("transform:scale");
    expect(out).toMatch(/:hover \.ifr-[a-z0-9]+-img\{transform:scale\(1\.08\)\}/);
    expect(out).toContain("transform 0.5s");
    expect(render({ ...base(), src: "/embed/x", hoverScale: 1 })).not.toContain("scale(");
  });

  it("题注可配置且不拦截指针", () => {
    const out = render({ ...base(), src: "/embed/x", caption: "订阅表单", captionFontSize: 15 });
    expect(out).toContain("订阅表单");
    expect(out).toContain("font-size:15px");
    expect(out).toContain("pointer-events:none");
    expect(render({ ...base(), src: "/embed/x" })).not.toMatch(/-cap"/);
  });

  it("div 开闭平衡", () => {
    for (const cfg of [
      { ...base(), src: "/embed/x", caption: "C" },
      { ...base() },
      { ...base(), src: "/embed/x", sandbox: "allow-scripts", allowFullscreen: true },
    ]) {
      const body = render(cfg).replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
      const opens = (body.match(/<div\b/g) ?? []).length;
      const closes = (body.match(/<\/div>/g) ?? []).length;
      expect(opens).toBe(closes);
      expect(opens).toBeGreaterThan(0);
    }
  });
});

describe("iframe codegen：接口动态地址（认证 / 非认证）", () => {
  const apiCfg = () => ({
    ...base(),
    dataMode: "api",
    apiUrl: "https://api.example.com/embed",
    apiSrcField: "data.url",
    authEnabled: false,
  });

  it("静态模式产物不含取数脚本", () => {
    const html = render({ ...base(), src: "/embed/form" });
    expect(html).toContain("/embed/form");
    expect(html).not.toContain("fetch(");
  });

  it("接口模式：取数骨架 + 字段映射，iframe 不预写静态 src（避免先闪一个错误页）", () => {
    const html = render(apiCfg());
    expect(html).toContain("api.example.com/embed");
    expect(html).toContain("fetch(");
    expect(html).toContain('var f="data.url"');
    expect(iframeTag(html)).not.toContain("src=");
    // 数据到达前空态先显示，取到后由脚本隐藏
    expect(html).toMatch(/id="ifr-[a-z0-9]+e"[^>]*display:flex/);
    expect(html).toContain("fr.src=src");
  });

  it("字段留空时依次尝试通用地址字段名", () => {
    const html = render({ ...base(), dataMode: "api", apiUrl: "https://x/y" });
    expect(html).toContain("['url','src','iframe','embed','path']");
  });

  it("认证三态：true 注入 / false 不注入 / 未设跟随全局", () => {
    expect(render({ ...apiCfg(), authEnabled: true })).toContain("var authEnabled = true;");
    expect(render(apiCfg())).toContain("var authEnabled = false;");
    const unset = render({ ...base(), dataMode: "api", apiUrl: "https://x/y", authEnabled: undefined });
    expect(unset).toContain("var authEnabled = null;");
    expect(unset).toContain("window.__WC_AUTH_ENABLED");
  });

  it("接口未配置地址时不产生 fetch（避免空接口）", () => {
    const html = render({ ...base(), dataMode: "api" });
    expect(html).not.toContain("fetch(");
  });
});