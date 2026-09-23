import { describe, test, expect } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import { resolveMediaStyle } from "../../editor/data/mediaStyle";
import { SHAPE_RADIUS } from "../../editor/data/fieldStyle";

initBuiltinCodegens();

const ctx = { pageScripts: [] } as never;

function comp(type: string, config: Record<string, unknown>, name = type): SceneComponent {
  return {
    id: "m1",
    type,
    name,
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

const renderImg = (config: Record<string, unknown>, name = "图片") => getCodegen("image")!(comp("image", config, name), ctx);
const renderVid = (config: Record<string, unknown>) => getCodegen("video")!(comp("video", config), ctx);
const renderAud = (config: Record<string, unknown>) => getCodegen("audio")!(comp("audio", config), ctx);

const imgTag = (out: string) => (out.match(/<img[^>]*>/) || [])[0] || "";
const videoTag = (out: string) => (out.match(/<video[^>]*>/) || [])[0] || "";

describe("resolveMediaStyle：媒体组唯一取值口径", () => {
  test("圆角走与表单族同一口径：面板值 × 主题 shape.borderRadius", () => {
    expect(resolveMediaStyle({ borderRadius: 4 }).radiusCss).toBe(`${4 * SHAPE_RADIUS}px`);
    expect(resolveMediaStyle({}).radiusCss).toBe("0px");
    // 负数/非法值回退 0，不产生非法 CSS
    expect(resolveMediaStyle({ borderRadius: -3 }).radiusCss).toBe("0px");
    expect(resolveMediaStyle({ borderRadius: "abc" }).radiusCss).toBe("0px");
  });

  test("填充模式白名单归一（非法值回退 cover）", () => {
    expect(resolveMediaStyle({ fit: "contain" }).fit).toBe("contain");
    expect(resolveMediaStyle({ fit: "scale-down" }).fit).toBe("scale-down");
    expect(resolveMediaStyle({ fit: "weird" }).fit).toBe("cover");
    expect(resolveMediaStyle({}, { fit: "contain" }).fit).toBe("contain");
    // video 兼容 objectFit 旧字段名
    expect(resolveMediaStyle({ objectFit: "fill" }).fit).toBe("fill");
  });

  test("边框/阴影：未配置时输出空串（不产生 `border:` 这样的残缺声明）", () => {
    const none = resolveMediaStyle({});
    expect(none.borderCss).toBe("");
    expect(none.boxShadow).toBe("");
    const some = resolveMediaStyle({ borderWidth: 2, borderColor: "#f00", borderStyle: "dashed", boxShadow: "0 2px 4px #000" });
    expect(some.borderCss).toBe("2px dashed #f00");
    expect(some.boxShadow).toBe("0 2px 4px #000");
  });

  test("不透明度夹在 0~1；悬浮放大倍数不小于 1", () => {
    expect(resolveMediaStyle({ opacity: 2 }).opacity).toBe(1);
    expect(resolveMediaStyle({ opacity: -1 }).opacity).toBe(0);
    expect(resolveMediaStyle({ opacity: 0.5 }).opacity).toBe(0.5);
    expect(resolveMediaStyle({ hoverScale: 0.2 }).hoverScale).toBe(1);
    // 旧布尔字段 hoverZoom → 1.05
    expect(resolveMediaStyle({ hoverZoom: true }).hoverScale).toBe(1.05);
  });
});

describe("image codegen：内容 / 链接 / 空态 / 样式", () => {
  test("替代文字：显式 alt 优先，缺省回退组件名（不输出空 alt）", () => {
    expect(imgTag(renderImg({ source: "/a.png", alt: "首页横幅" }))).toContain('alt="首页横幅"');
    expect(imgTag(renderImg({ source: "/a.png" }, "英雄图"))).toContain('alt="英雄图"');
  });

  test("填充模式与对齐位置下发到内容层", () => {
    const out = renderImg({ source: "/a.png", fit: "contain", objectPosition: "left top" });
    expect(out).toContain("object-fit:contain");
    expect(out).toContain("object-position:left top");
  });

  test("懒加载开关决定 loading 属性", () => {
    expect(imgTag(renderImg({ source: "/a.png", lazyLoading: true }))).toContain('loading="lazy"');
    expect(imgTag(renderImg({ source: "/a.png" }))).not.toContain("loading=");
  });

  test("跳转链接包装：新窗口补 rel=noopener noreferrer", () => {
    const blank = renderImg({ source: "/a.png", link: "https://x.com", linkTarget: "_blank" });
    expect(blank).toContain('<a href="https://x.com" target="_blank"');
    expect(blank).toContain('rel="noopener noreferrer"');
    const self = renderImg({ source: "/a.png", link: "/detail" });
    expect(self).toContain('<a href="/detail" target="_self"');
    expect(self).not.toContain("noopener");
    // 无链接时不做包装
    expect(renderImg({ source: "/a.png" })).not.toContain("<a ");
  });

  test("空态：静态无资源时显示，有资源时隐藏；两者都带加载失败兜底", () => {
    const empty = renderImg({});
    expect(empty).toContain("未设置图片");
    expect(empty).toContain("display:flex");
    expect(empty).not.toContain("<img");
    const withSrc = renderImg({ source: "/a.png" });
    expect(withSrc).toMatch(/class="img-[a-z0-9]+-empty"[^>]*display:none/);
    expect(withSrc).toContain("addEventListener('error'");
  });

  test("题注：可配置文案/字号/文字色/背景，且不拦截指针", () => {
    const out = renderImg({ source: "/a.png", caption: "图 1 首页", captionFontSize: 15, captionColor: "#123456" });
    expect(out).toContain("图 1 首页");
    expect(out).toContain("font-size:15px");
    expect(out).toContain("#123456");
    expect(out).toContain("pointer-events:none");
    expect(renderImg({ source: "/a.png" })).not.toMatch(/-cap"/);
  });

  test("圆角/边框/阴影/底色/透明度作用在容器上", () => {
    const out = renderImg({
      source: "/a.png", borderRadius: 3, bgColor: "#fafafa",
      borderWidth: 2, borderColor: "#00ff00", boxShadow: "0 4px 8px #000",
    });
    expect(out).toContain(`border-radius:${3 * SHAPE_RADIUS}px`);
    expect(out).toContain("background:#fafafa");
    expect(out).toContain("border:2px solid #00ff00");
    expect(out).toContain("box-shadow:0 4px 8px #000");
  });

  test("悬浮放大由类规则给出（不写 inline transform，避免压死状态规则）", () => {
    const out = renderImg({ source: "/a.png", hoverScale: 1.08, hoverDuration: 0.5 });
    const tag = imgTag(out);
    expect(tag).not.toContain("transform:scale");
    expect(out).toMatch(/:hover \.img-[a-z0-9]+-img\{transform:scale\(1\.08\)\}/);
    expect(out).toContain("transform 0.5s");
    // 关闭时不输出任何放大规则
    expect(renderImg({ source: "/a.png", hoverScale: 1 })).not.toContain("scale(");
  });
});

describe("image codegen：动态取图（认证 / 非认证）", () => {
  const apiCfg = {
    dataMode: "api",
    apiUrl: "https://api.example.com/cover",
    apiSrcField: "data.cover",
    authEnabled: false,
  };

  test("接口模式接入统一取数骨架并写入 img.src", () => {
    const out = renderImg(apiCfg);
    expect(out).toContain("fetch(");
    expect(out).toContain("var f=\"data.cover\"");
    // 未取到数据前不渲染静态 src（避免先闪一张破图）
    expect(imgTag(out)).not.toContain("src=");
    expect(out).toContain("display:flex");
  });

  test("认证开关三态透传：true 注入 Token / false 不注入 / 未设跟随全局", () => {
    expect(renderImg({ ...apiCfg, authEnabled: true })).toContain("var authEnabled = true");
    expect(renderImg(apiCfg)).toContain("var authEnabled = false");
    const unset = renderImg({ dataMode: "api", apiUrl: "https://api.example.com/cover" });
    expect(unset).toContain("var authEnabled = null");
    expect(unset).toContain("__WC_AUTH_ENABLED");
  });

  test("字段留空时依次尝试通用图片字段名", () => {
    const out = renderImg({ dataMode: "api", apiUrl: "https://x/y" });
    expect(out).toContain("['url','src','image','imageUrl','path']");
  });

  test("静态模式不受接口配置影响（静态与接口互斥）", () => {
    const out = renderImg({ source: "/a.png", dataMode: "static", apiUrl: "https://x/y" });
    expect(imgTag(out)).toContain('src="/a.png"');
    expect(out).not.toContain("fetch(");
  });
});

describe("video codegen：播放属性 / 样式 / 空态", () => {
  test("自动播放必然静音（浏览器策略下非静音自动播放会被拦，两端一致兜底）", () => {
    const auto = videoTag(renderVid({ source: "/v.mp4", autoplay: true }));
    expect(auto).toContain("autoplay");
    expect(auto).toContain("muted");
    const noAuto = videoTag(renderVid({ source: "/v.mp4" }));
    expect(noAuto).not.toContain("autoplay");
    expect(noAuto).not.toContain("muted");
  });

  test("controls 默认开启，可关闭；loop/playsinline/preload 随配置", () => {
    expect(videoTag(renderVid({ source: "/v.mp4" }))).toContain("controls");
    expect(videoTag(renderVid({ source: "/v.mp4", controls: false }))).not.toContain("controls");
    expect(videoTag(renderVid({ source: "/v.mp4", loop: true }))).toContain("loop");
    expect(videoTag(renderVid({ source: "/v.mp4" }))).toContain("playsinline");
    expect(videoTag(renderVid({ source: "/v.mp4", preload: "auto" }))).toContain('preload="auto"');
    // 非法 preload 回退 metadata
    expect(videoTag(renderVid({ source: "/v.mp4", preload: "weird" }))).toContain('preload="metadata"');
  });

  test("封面图与填充模式下发", () => {
    const out = renderVid({ source: "/v.mp4", poster: "/p.jpg", fit: "cover" });
    expect(videoTag(out)).toContain('poster="/p.jpg"');
    expect(out).toContain("object-fit:cover");
  });

  test("起播时间/音量/倍速：默认值不注入脚本，配置后才输出", () => {
    expect(renderVid({ source: "/v.mp4" })).not.toContain("playbackRate");
    const out = renderVid({ source: "/v.mp4", startTime: 5, volume: 2, playbackRate: 1.5 });
    expect(out).toContain("v.currentTime=5");
    expect(out).toContain("v.volume=1");      // 音量夹到 1 以内
    expect(out).toContain("v.playbackRate=1.5");
  });

  test("无资源时输出空态且不渲染 video 元素", () => {
    const out = renderVid({});
    expect(out).toContain("未设置视频");
    expect(out).not.toContain("<video");
    expect(out).toContain("display:flex");
  });

  test("题注与圆角/边框/阴影", () => {
    const out = renderVid({ source: "/v.mp4", caption: "演示视频", borderRadius: 2, borderWidth: 3, borderColor: "#123" });
    expect(out).toContain("演示视频");
    expect(out).toContain(`border-radius:${2 * SHAPE_RADIUS}px`);
    expect(out).toContain("border:3px solid #123");
  });
});

describe("audio codegen：内容 / 播放 / 空态", () => {
  test("标题副标题与图标/封面二选一", () => {
    const withIcon = renderAud({ source: "/a.mp3", title: "播客", subtitle: "第 1 期" });
    expect(withIcon).toContain("播客");
    expect(withIcon).toContain("第 1 期");
    expect(withIcon).toContain("<svg");
    const withCover = renderAud({ source: "/a.mp3", cover: "/c.jpg" });
    expect(withCover).toContain('src="/c.jpg"');
    expect(withCover).not.toContain("<svg");
  });

  test("无音源时输出空态占位而不是一个不可用的空控件", () => {
    const out = renderAud({});
    expect(out).toContain("未设置音频");
    expect(out).not.toContain("<audio");
  });

  test("自动播放静音兜底 + 圆角同口径", () => {
    const out = renderAud({ source: "/a.mp3", autoplay: true, borderRadius: 6 });
    const tag = (out.match(/<audio[^>]*>/) || [])[0] || "";
    expect(tag).toContain("autoplay");
    expect(tag).toContain("muted");
    expect(out).toContain(`border-radius:${6 * SHAPE_RADIUS}px`);
  });

  test("对齐可配（内容在拖动框内的水平位置）", () => {
    expect(renderAud({ align: "center" })).toContain("justify-content:center");
    expect(renderAud({ align: "right" })).toContain("justify-content:flex-end");
    expect(renderAud({})).toContain("justify-content:flex-start");
  });

  test("div 开闭平衡", () => {
    for (const cfg of [
      { source: "/a.mp3", title: "T", subtitle: "S" },
      {},
      { source: "/a.mp3", cover: "/c.jpg" },
    ]) {
      const body = renderAud(cfg).replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
      const opens = (body.match(/<div\b/g) ?? []).length;
      const closes = (body.match(/<\/div>/g) ?? []).length;
      expect(opens).toBe(closes);
      expect(opens).toBeGreaterThan(0);
    }
  });
});
