import { describe, test, expect } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../../codegen/components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import {
  ICON_FIT,
  ICON_BUTTON_FIT,
  ICON_LIST_FIT,
  resolveIconStyle,
  resolveIconListStyle,
  resolveIconButtonStyle,
  iconFaceCss,
  iconRotCss,
  iconInnerCss,
  iconOuterCss,
  iconStageCss,
  iconListBodyCss,
  iconListItemCss,
  iconListItemBg,
  iconButtonCss,
  iconButtonBg,
  iconButtonRules,
  iconListRules,
  scaleInnerCss,
} from "../../editor/data/iconStyle";
import { cssText } from "../../editor/data/cssDecls";
import { scaleInnerBaseCss } from "../../editor/data/scaleFit";
import { MATERIAL_ICON_PATHS } from "../../codegen/materialIcons";
import { generateHTML } from "../../codegen/engine";
import type { SceneDSL } from "../../types/scene";

initBuiltinCodegens();

/** 组件注册是全局单例：整个文件只注册一次，避免重复注册刷屏告警 */
let registryPromise: Promise<typeof import("../../editor/registry")> | null = null;
function ensureRegistered() {
  if (!registryPromise) {
    registryPromise = import("../../editor/registry").then((m) => {
      m.registerBuiltinComponents();
      return m;
    });
  }
  return registryPromise;
}

/**
 * 图标组件组（icon / icon-list / icon-button）的**契约锁**。
 *
 * 锁三件事：
 * 1. **双端同源**：codegen 产物里的每一层 style 必须等于 `editor/data/iconStyle.ts`
 *    对应构建函数的 `cssText(...)`。任何一侧再写死字面量（默认值、推导规则、圆角倍数）
 *    都会立刻让本用例失败 —— 这正是历史上「两端各写一份、慢慢漂移」的病根。
 * 2. **状态纪律**：`hoverScale` / `spin` 这类**状态/动画属性绝不能进 inline**
 *    （inline 恒胜过非 !important 的类规则，写进去状态就永远翻不动），
 *    必须由 `.{uid}-rot:hover` / `.{uid}-spin` 类规则承载。
 * 3. **认证三态**：`authEnabled` 必须原样透传（`null` 不能压成 `false`），
 *    否则「未配置」在发布端会变成「明确禁用」，与编辑区 `useApiDataFetch` 分叉。
 */
function comp(type: string, config: Record<string, unknown>): SceneComponent {
  return {
    id: "c1",
    type,
    name: type,
    transform: createDefaultTransform({ x: 0, y: 0, width: 200, height: 80 }),
    layerId: "l1",
    zIndex: 0,
    locked: false,
    visible: true,
    config,
    children: [],
    parentId: null,
  };
}

const ctx = { pageScripts: [], iconData: {} } as never;

const render = (type: string, config: Record<string, unknown>): string =>
  getCodegen(type)!(comp(type, config), ctx);

/** 取产物里 uid（`ic-xxxxxxx` / `icl-xxxxxxx` / `icb-xxxxxxx` 前缀） */
const uidOf = (html: string, prefix: string): string => {
  const m = html.match(new RegExp(`${prefix}-[a-z0-9]+`));
  expect(m, `产物里找不到 ${prefix}- 前缀的 uid`).not.toBeNull();
  return m![0];
};

/** 取元素 style 属性里的**声明名**集合（避免 `transition:background-color` 这类假阳性） */
function inlineDecls(styleAttr: string): string[] {
  return styleAttr
    .split(";")
    .filter(Boolean)
    .map((d) => d.slice(0, d.indexOf(":")).trim())
    .filter(Boolean);
}

/** 取元素 style 属性（无则空串） */
function styleOfTag(tag: string): string {
  return (tag.match(/style="([^"]*)"/) || [])[1] ?? "";
}

describe("图标组：双端同源（codegen 产物 = iconStyle 的构建函数）", () => {
  test("icon 静态：容器/舞台/内层/旋转层/面色层逐层等于共享构建函数", () => {
    const config = {
      icon: "material:star",
      size: 40,
      label: "收藏",
      color: "#ffcc00",
      bgColor: "#222222",
      padding: 6,
      borderRadius: 3,
      borderWidth: 2,
      borderColor: "#888888",
      shadow: true,
      opacity: 0.8,
      gap: 10,
      labelSize: 15,
      labelColor: "#dddddd",
    };
    const html = render("icon", config);
    const s = resolveIconStyle(config, { size: 32, layout: "horizontal" });

    expect(html).toContain(cssText(iconOuterCss()));
    expect(html).toContain(cssText(iconStageCss(s.align)));
    expect(html).toContain(cssText(iconInnerCss(s)));
    expect(html).toContain(cssText(iconRotCss(s)));
    expect(html).toContain(cssText(iconFaceCss(s)));
  });

  test("icon 静态：圆角是「面板值 × 主题圆角基数」而不是字面像素", () => {
    const html = render("icon", { icon: "material:star", borderRadius: 3 });
    // SHAPE_RADIUS = 10 → 3 应当输出 30px
    expect(html).toContain("border-radius:30px");
    expect(html).not.toContain("border-radius:3px");
  });

  test("icon 静态：颜色留空时面色层跟随文字色（inherit），不留空时用配置色", () => {
    expect(render("icon", { icon: "material:star" })).toContain("color:inherit");
    expect(render("icon", { icon: "material:star", color: "#123456" })).toContain("color:#123456");
  });

  test("icon 静态：图标走编译期内联 SVG（不依赖在线字体）", () => {
    const html = render("icon", { icon: "material:star", size: 40 });
    expect(html).toContain("<svg viewBox=\"0 0 24 24\"");
    expect(html).toContain("width:40px;height:40px");
    expect(html).toContain("fill:currentColor");
  });

  test("icon 静态：空图标引用落默认图标 widgets（永不空白）", () => {
    const html = render("icon", { icon: "" });
    expect(html).toContain(MATERIAL_ICON_PATHS.widgets);
  });

  test("icon-list 静态：条目容器与条目样式等于共享构建函数", () => {
    const config = {
      items: "star|收藏\nsettings|设置",
      layout: "horizontal",
      columns: 2,
      iconSize: 22,
      labelSize: 14,
      itemPadding: 8,
      itemRadius: 2,
      itemBorderWidth: 1,
      gap: 12,
    };
    const html = render("icon-list", config);
    const s = resolveIconListStyle(config);

    expect(html).toContain(cssText(iconListBodyCss(s)));
    expect(html).toContain(cssText(iconListItemCss(s)));
    expect(html).toContain("收藏");
    expect(html).toContain("设置");
    // 列数 2 → grid 两列
    expect(html).toContain("grid-template-columns:repeat(2, minmax(0, 1fr))");
  });

  test("icon-button 静态：按钮样式等于共享构建函数，且三种形态底色正确", () => {
    const solid = resolveIconButtonStyle({ variant: "solid", color: "#2196F3" });
    expect(iconButtonBg(solid)).toBe("#2196F3");

    const outline = resolveIconButtonStyle({ variant: "outline", color: "#2196F3", textColor: "" });
    expect(iconButtonBg(outline)).toBe("transparent");
    const outlineCss = cssText(iconButtonCss(outline));
    expect(outlineCss).toContain("border:1px solid #2196F3");
    // 描边形态文字色留空 → 跟随主题色（不是白字）
    expect(outlineCss).toContain("color:#2196F3");

    const text = resolveIconButtonStyle({ variant: "text", color: "#ff0000", textColor: "" });
    expect(iconButtonBg(text)).toBe("transparent");
    const textCss = cssText(iconButtonCss(text));
    expect(textCss).toContain("color:#ff0000");
    expect(textCss).not.toContain("border:");

    const html = render("icon-button", { icon: "material:add", text: "新建", variant: "solid" });
    expect(html).toContain(cssText(iconButtonCss(solid)));
    expect(html).toContain(cssText(scaleInnerBaseCss()));
    expect(html).toContain(cssText(scaleInnerCss()));
    // 底色由类规则承载，绝不进 inline
    expect(html).toContain(`background-color:${iconButtonBg(solid)}`);
    expect(html).toContain("新建");
  });

  test("icon-button：有链接时渲染 <a>，禁用时不渲染链接且带 aria-disabled", () => {
    const linked = render("icon-button", { icon: "material:add", href: "https://a.example.com", linkTarget: "_blank" });
    expect(linked).toContain("<a data-icon-button=\"1\"");
    expect(linked).toContain("href=\"https://a.example.com\"");
    expect(linked).toContain("target=\"_blank\"");

    const disabled = render("icon-button", { icon: "material:add", disabled: true, href: "https://a.example.com" });
    expect(disabled).not.toContain("<a data-icon-button");
    expect(disabled).toContain("aria-disabled=\"true\"");
    // 禁用态：cursor 走静态声明，不产生任何悬浮规则
    expect(cssText(iconButtonCss(resolveIconButtonStyle({ disabled: true })))).toContain("cursor:not-allowed");
    expect(disabled).not.toMatch(/-[a-z0-9]+:hover/);
  });
});

describe("图标组：状态切换属性只能由类规则承载", () => {
  const cases: Array<[string, string, Record<string, unknown>]> = [
    ["icon", "悬浮放大", { icon: "material:star", hoverScale: 1.2 }],
    ["icon", "持续旋转", { icon: "material:sync", spin: true, spinDuration: 1.5 }],
    ["icon", "旋转+翻转+悬浮", { icon: "material:code", rotate: 90, flipH: true, hoverScale: 1.1 }],
    ["icon-list", "悬浮底色", { items: "star|A", hoverBgColor: "#333333", itemBgColor: "#111111" }],
    ["icon-button", "悬浮放大", { icon: "material:add", text: "Go", hoverScale: 1.15 }],
  ];

  for (const [type, label, config] of cases) {
    test(`${type}（${label}）：无 .style.状态属性 = 赋值`, () => {
      const html = render(type, config);
      for (const attr of ["background", "backgroundColor", "color", "display", "opacity", "border", "fontWeight"]) {
        expect(new RegExp(`\\.style\\.${attr}\\s*=`).test(html), `发现内联状态写入 ${attr}`).toBe(false);
      }
    });
  }

  test("icon 悬浮放大：类规则里是「静态 transform + scale」，inline 里没有 scale", () => {
    const html = render("icon", { icon: "material:star", hoverScale: 1.2 });
    const uid = uidOf(html, "ic");
    expect(html).toContain(`.${uid}-rot:hover{transform:scale(1.2)}`);
    // inline 里绝不能出现放大倍数（否则类规则永远压不动）
    expect(/style="[^"]*scale\(1\.2\)/.test(html)).toBe(false);
  });

  test("icon 旋转+悬浮：静态 transform 与悬浮 transform 成对进类规则层", () => {
    const html = render("icon", { icon: "material:star", rotate: 90, hoverScale: 1.5 });
    const uid = uidOf(html, "ic");
    expect(html).toContain(`.${uid}-rot{transform:rotate(90deg)}`);
    expect(html).toContain(`.${uid}-rot:hover{transform:rotate(90deg) scale(1.5)}`);
    // 静态 transform 不进 inline —— 否则悬浮规则永远压不动
    const rotTag = (html.match(/<span data-icon-rot="1"[^>]*>/) || [])[0] ?? "";
    expect(inlineDecls(styleOfTag(rotTag))).not.toContain("transform");
  });

  test("icon 持续旋转：keyframes + 类规则，不写 inline animation", () => {
    const html = render("icon", { icon: "material:sync", spin: true, spinDuration: 3 });
    const uid = uidOf(html, "ic");
    expect(html).toContain(`@keyframes ${uid}-spin`);
    expect(html).toContain(`.${uid}-spin{animation:${uid}-spin 3s linear infinite}`);
    expect(html).toContain("${uid}-spin".replace("${uid}", uid));
    expect(/style="[^"]*animation:/.test(html)).toBe(false);
  });

  test("icon-list：静态底色恒走类规则；悬浮底色只在与静态底色不同时才输出", () => {
    const same = render("icon-list", { items: "star|A", itemBgColor: "#111111", hoverBgColor: "#111111" });
    const uidSame = uidOf(same, "icl");
    expect(same).toContain(`.${uidSame}-it{background-color:#111111}`);
    expect(same).not.toContain(`.${uidSame}-it:hover{background-color`);

    const diff = render("icon-list", { items: "star|A", itemBgColor: "#111111", hoverBgColor: "#222222" });
    const uid = uidOf(diff, "icl");
    expect(diff).toContain(`.${uid}-it{background-color:#111111}`);
    expect(diff).toContain(`.${uid}-it:hover{background-color:#222222}`);
  });

  test("icon-list：条目 inline 里没有底色声明（否则 :hover 永远压不动）", () => {
    const html = render("icon-list", { items: "star|A", itemBgColor: "#111111" });
    const tag = (html.match(/<span data-icon-list-item="1"[^>]*>/) || [])[0] ?? "";
    expect(tag).not.toBe("");
    expect(inlineDecls(styleOfTag(tag))).not.toContain("background-color");
    expect(inlineDecls(cssText(iconListItemCss(resolveIconListStyle({ itemBgColor: "#111111" }))))).not.toContain("background-color");
    expect(iconListItemBg(resolveIconListStyle({ itemBgColor: "#111111" }))).toBe("#111111");
  });

  test("icon-button 悬浮：类规则承载底色与放大", () => {
    const html = render("icon-button", { icon: "material:add", text: "Go", hoverScale: 1.15, hoverBgColor: "#000000" });
    const uid = uidOf(html, "icb");
    expect(html).toContain(`.${uid}:hover{background-color:#000000}`);
    expect(html).toContain(`.${uid}:hover{transform:scale(1.15)}`);
    expect(/style="[^"]*scale\(1\.15\)/.test(html)).toBe(false);
  });
});

describe("图标组：随拖动框等比缩放（两端同一公式与同一基准）", () => {
  test("默认开启：产物含统一缩放骨架与脚本，基准与共享常量一致", () => {
    for (const [type, spec] of [
      ["icon", ICON_FIT],
      ["icon-list", ICON_LIST_FIT],
      ["icon-button", ICON_BUTTON_FIT],
    ] as const) {
      const html = render(type, {});
      expect(html, `${type} 缺少缩放骨架`).toMatch(/-st" style="width:100%;height:100%/);
      expect(html, `${type} 缺少缩放内层`).toMatch(/-in"/);
      expect(html, `${type} 缺少缩放脚本`).toContain("scale('+f+')");
      expect(html, `${type} 基准未与共享常量对齐`).toContain(`var RW=${spec.refW},RH=${spec.refH},MIN=${spec.min},MAX=${spec.max};`);
    }
  });

  test("关闭等比缩放：不产出骨架与脚本，但仍保留静态舞台（对齐口径不变）", () => {
    for (const type of ["icon", "icon-list", "icon-button"]) {
      const html = render(type, { scaleFit: false });
      expect(html).not.toContain("scale('+f+')");
      expect(html).not.toMatch(/-st"/);
      // 舞台与内层仍是共享构建函数的产物（对齐/自然尺寸口径不因关闭缩放而漂移）
      const alignStyle = type === "icon"
        ? iconStageCss(resolveIconStyle({}).align)
        : type === "icon-list"
          ? iconStageCss(resolveIconListStyle({}).align)
          : iconStageCss(resolveIconButtonStyle({}).align);
      expect(html).toContain(cssText(alignStyle));
      expect(html).toContain(cssText(scaleInnerBaseCss()));
      expect(html).toMatch(new RegExp(`class="(?:ic|icl|icb)-[a-z0-9]+-in"`));
    }
  });

  test("对齐口径：水平对齐改变舞台与内层的摆法", () => {
    const right = render("icon", { icon: "material:star", align: "right" });
    expect(right).toContain("justify-content:flex-end");
    const center = render("icon", { icon: "material:star", align: "center" });
    expect(center).toContain("justify-content:center");
  });

  test("缩放脚本把 fit 挂到舞台元素上（接口数据到达后可重新适配）", () => {
    expect(render("icon", {})).toContain("st.__wcFit=fit");
  });
});

describe("图标组：动态数据接入（认证 / 非认证两种方式都可用）", () => {
  const apiCases: Array<[string, Record<string, unknown>]> = [
    ["icon", { icon: "material:star", dataMode: "api", apiUrl: "https://api.example.com/icon" }],
    ["icon-list", { items: "star|A", dataMode: "api", apiUrl: "https://api.example.com/list" }],
    ["icon-button", { icon: "material:add", text: "Go", dataMode: "api", apiUrl: "https://api.example.com/btn" }],
  ];

  for (const [type, config] of apiCases) {
    test(`${type}：接口模式挂上统一取数骨架与运行时重建入口`, () => {
      const html = render(type, config);
      expect(html).toContain("__WC_TOKEN");
      expect(html).toContain("https://api.example.com");
      // 运行时图标渲染器（与编译期 renderMenuIcon 对齐）
      expect(html).toContain("function renderIcon(icon, size)");
      // 首屏先用编译期内容打底，避免闪空
      expect(html).toContain("data-icon");
    });
  }

  test("authEnabled 三态原样透传：未配置 → null（不是 false）", () => {
    const none = render("icon", { icon: "material:star", dataMode: "api", apiUrl: "https://x/y" });
    expect(none).toContain("__WC_AUTH_ENABLED");
    expect(/__WC_AUTH_ENABLED\s*\|\|\s*false/.test(none)).toBe(true);
    // 不能出现「把 null 压成 false 后写死」的骨架
    expect(none).not.toMatch(/__WC_AUTH_ENABLED\s*=\s*false\s*;/);

    const on = render("icon", { icon: "material:star", dataMode: "api", apiUrl: "https://x/y", authEnabled: true });
    expect(on).toContain("__WC_AUTH_ENABLED");
    const off = render("icon", { icon: "material:star", dataMode: "api", apiUrl: "https://x/y", authEnabled: false });
    expect(off).toContain("__WC_AUTH_ENABLED");
  });

  test("全局数据源绑定：绑定全局静态源后渲染全局源数据（与认证组件组同一套引擎合并）", () => {
    const scene: SceneDSL = {
      id: "s1",
      name: "Site",
      status: "draft",
      tags: [],
      metadata: {},
      createdAt: 0,
      updatedAt: 0,
      dataSources: [
        {
          id: "ds_icon",
          name: "图标源",
          dataMode: "static",
          staticData: [{ icon: "star", label: "全局项甲" }],
        },
      ] as never,
      canvasConfig: { width: 800, height: 600, background: { type: "color", color: "#fff" } } as never,
      views: [
        {
          id: "v1",
          name: "Home",
          layers: [],
          components: [comp("icon-list", { items: "star|旧条目", dataSourceId: "ds_icon" })],
        },
      ],
    };
    const html = generateHTML(scene, { framework: "static-html", preview: true })[0]!.html;
    expect(html).toContain("全局项甲");
    expect(html).not.toContain("旧条目");
  });

  test("静态模式不产生任何取数脚本（非认证接入方式：纯静态）", () => {
    const html = render("icon", { icon: "material:star" });
    expect(html).not.toContain("__WC_TOKEN");
    expect(html).not.toContain("__wcIcon_");
  });
});

describe("图标组：注册与属性栏完整性", () => {
  test("三个组件都已注册 codegen", () => {
    expect(getCodegen("icon")).toBeTruthy();
    expect(getCodegen("icon-list")).toBeTruthy();
    expect(getCodegen("icon-button")).toBeTruthy();
  });

  test("分类接入四处齐备（否则组件在面板里根本不出现）", async () => {
    const { CATEGORY_LABELS } = await import("../../types/editor");
    const { BUILTIN_CATEGORY_IDS } = await import("../../types/component");
    expect(CATEGORY_LABELS.ccat_icon).toBe("图标组件");
    expect(BUILTIN_CATEGORY_IDS.has("ccat_icon")).toBe(true);

    const { componentRegistry } = await ensureRegistered();
    const defs = componentRegistry.getByCategory("ccat_icon");
    expect(defs.map((d) => d.type).sort()).toEqual(["icon", "icon-button", "icon-list"]);
  });

  test("属性栏：三组件的字段都按分组组织，且都带数据源共享字段（认证三态）", async () => {
    const { componentRegistry } = await ensureRegistered();
    for (const type of ["icon", "icon-list", "icon-button"]) {
      const def = componentRegistry.get(type)!;
      const fields = def.configSchema ?? [];
      const groups = new Set(fields.map((f) => f.group).filter(Boolean));
      expect(groups.size, `${type} 属性栏分组过少`).toBeGreaterThanOrEqual(4);
      for (const key of ["dataMode", "authEnabled", "apiUrl", "dataSourceId", "scaleFit"]) {
        expect(fields.some((f) => f.key === key), `${type} 缺属性 ${key}`).toBe(true);
      }
      // 动态数据 + 认证联动 + 随框缩放三件事都要在属性栏里可配
      expect(def.defaultConfig?.scaleFit).toBe(true);
    }
  });
});

/**
 * 精确的「hover 规则被 inline 压死」检测（真实浏览器实测暴露过的 bug）。
 *
 * 判据：产物里存在 `.X:hover{ prop:… }` 时，**带 class X 的那个元素**不得在 inline
 * style 里声明同一个 prop —— inline 恒胜过任何非 `!important` 的类规则。
 *
 * 与「无 .style.状态属性 = 赋值」的区别：那条只防 JS 直接改 inline；
 * 这条防的是**编译期就把状态属性写进 inline**（曾真实发生：条目/按钮底色写进 inline，
 * 发布后 hover 完全不亮）。
 */
function hoverInlineConflicts(html: string): string[] {
  const conflicts: string[] = [];
  for (const m of html.matchAll(/\.([a-zA-Z0-9_-]+):hover\{([^}]*)\}/g)) {
    const cls = m[1];
    const props = inlineDecls(m[2]);
    const tagRe = new RegExp(`<[a-z]+\\b[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>`, "g");
    for (const tag of html.match(tagRe) ?? []) {
      const inlineProps = inlineDecls(styleOfTag(tag));
      for (const p of props) {
        if (inlineProps.includes(p)) conflicts.push(`${cls}:hover -> ${p}`);
      }
    }
  }
  return conflicts;
}

describe("图标组：hover 规则不得被 inline 压死（真实浏览器实测暴露的 bug）", () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["icon", { icon: "material:star", hoverScale: 1.2, rotate: 30 }],
    ["icon", { icon: "material:sync", spin: true, hoverScale: 1.3 }],
    ["icon-list", { items: "star|A\nsettings|B", itemBgColor: "#111111", hoverBgColor: "#333333" }],
    ["icon-button", { icon: "material:add", text: "Go", hoverScale: 1.15, hoverBgColor: "#123456" }],
    ["icon-button", { icon: "material:add", text: "Go", variant: "solid", color: "#2196F3" }],
    ["icon-button", { icon: "material:add", text: "Go", variant: "outline", color: "#2196F3" }],
    ["icon", { icon: "material:star", hoverScale: 1.2, dataMode: "api", apiUrl: "https://x/y" }],
    ["icon-list", { items: "star|A", dataMode: "api", apiUrl: "https://x/y", hoverBgColor: "#333333" }],
  ];

  for (const [type, config] of cases) {
    test(`${type}：${JSON.stringify(config).slice(0, 60)}… 无 hover/inline 冲突`, () => {
      const conflicts = hoverInlineConflicts(render(type, config));
      expect(conflicts, `hover 规则被 inline 声明压死：${conflicts.join(", ")}`).toEqual([]);
    });
  }

  test("回归：按钮底色与条目底色绝不进 inline（曾经的写法）", () => {
    const btn = render("icon-button", { icon: "material:add", variant: "solid", color: "#2196F3" });
    const btnTag = (btn.match(/<div data-icon-button="1"[^>]*>/) || [])[0] ?? "";
    expect(btnTag, "未找到按钮元素").not.toBe("");
    expect(inlineDecls(styleOfTag(btnTag)), "按钮底色不得写进 inline").not.toContain("background-color");
  });

  test("回归：iconStyle 的条目/按钮样式构建函数本身不含底色声明", () => {
    expect(inlineDecls(cssText(iconListItemCss(resolveIconListStyle({}))))).not.toContain("background-color");
    expect(inlineDecls(cssText(iconButtonCss(resolveIconButtonStyle({}))))).not.toContain("background-color");
    // 底色只经由这两条类规则给出
    expect(iconListRules("u", resolveIconListStyle({}))).toContain("background-color");
    expect(iconButtonRules("u", resolveIconButtonStyle({}))).toContain("background-color");
  });

  test("回归：rotate/flip 的静态 transform 不得进 inline（曾让悬浮放大彻底失效）", () => {
    const html = render("icon", { icon: "material:star", rotate: 30, flipH: true, hoverScale: 1.4 });
    const uid = uidOf(html, "ic");
    const rotTag = (html.match(/<span data-icon-rot="1"[^>]*>/) || [])[0] ?? "";
    expect(rotTag).not.toBe("");
    expect(inlineDecls(styleOfTag(rotTag)), "静态 transform 不得写进 inline").not.toContain("transform");
    // 静态与悬浮成对出现在类规则层
    expect(html).toContain(`.${uid}-rot{transform:rotate(30deg) scale(-1, 1)}`);
    expect(html).toContain(`.${uid}-rot:hover{transform:rotate(30deg) scale(-1, 1) scale(1.4)}`);
  });
});
