import { describe, test, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { initBuiltinCodegens, getCodegen } from "../../codegen/components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import { FormLabelRenderer } from "../renderers/FormLabelRenderer";
import { resolveLabelStyle, labelTextCss, labelInnerCss } from "../data/labelStyle";
import { SHAPE_RADIUS } from "../data/fieldStyle";
import { scaleStageCss, LABEL_FIT, fitFactor } from "../data/scaleFit";
import { cssText } from "../data/cssDecls";

initBuiltinCodegens();

/**
 * 「编辑区所见 = 发布所得」的**逐值**对照锁。
 *
 * 表单标签曾真实出现漂移：编辑区走 MUI Typography body1（行高 1.5 / 字间距 0.15px），
 * 发布端写死 1.4375。现在两端都只读 `resolveLabelStyle` 的**声明构建函数**
 * （`labelTextCss` / `labelInnerCss` / `scaleStageCss`），本用例把「渲染器展开进 sx 的对象」
 * 与「codegen 产物里的 style 声明」逐项比对，任何一侧再写死字面量都会被抓住。
 *
 * 渲染器自本轮起使用 hooks（`useBoxSize` 实测拖动框尺寸），不能再当纯函数直接调用，
 * 故改走 `react-dom/server` 渲染后按结构断言（`sx` 由 Emotion 在 SSR 期不下发，
 * 因此动态样式一律改比对上面那几个声明构建函数的返回值 —— 它们就是两端共用的那一份）。
 */
function labelComp(config: Record<string, unknown>): SceneComponent {
  return {
    id: "lbl1",
    type: "form-label",
    name: "Label",
    transform: createDefaultTransform({ x: 0, y: 0, width: 120, height: 24 }),
    layerId: "l1",
    zIndex: 0,
    locked: false,
    visible: true,
    config,
    children: [],
    parentId: null,
  };
}

const ctx = { pageScripts: [] } as never;

function decls(style: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const decl of style.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    map[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
  }
  return map;
}

/** codegen 产物里文字 span 的声明表 */
function renderCss(config: Record<string, unknown>): Record<string, string> {
  const out = getCodegen("form-label")!(labelComp(config), ctx);
  return decls((out.match(/<span style="([^"]*font-size:[^"]*)"/) || [])[1] ?? "");
}

/** codegen 产物里缩放舞台的声明表 */
function stageCss(config: Record<string, unknown>): Record<string, string> {
  const out = getCodegen("form-label")!(labelComp(config), ctx);
  return decls((out.match(/<div class="flb-[a-z0-9]+-st" style="([^"]*)"/) || [])[1] ?? "");
}

function renderHTML(config: Record<string, unknown>): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToStaticMarkup(createElement(FormLabelRenderer as any, { config, componentId: "c1" } as any));
}

const CASES: Array<[string, Record<string, unknown>]> = [
  ["缺省配置", {}],
  ["清空文字 + 必填", { text: "", required: true }],
  ["自定义色/字号/字重 + 居中", { text: "邮箱", textColor: "#123456", fontSize: 18, fontWeight: "500", align: "center" }],
  ["紧行高 + 字间距 + 右对齐 + 星号变色", {
    text: "手机号", lineHeight: 1.2, letterSpacing: 1.5, align: "right", required: true, errorColor: "#ff0000",
  }],
  ["垂直底部对齐", { text: "合计", vAlign: "bottom" }],
  // 本轮新增：外观层 / 文字装饰 / 后缀
  ["胶囊标签（底色 + 内边距 + 圆角）", {
    text: "账号信息", bgColor: "#ffeeaa", paddingX: 8, paddingY: 4, borderRadius: 2,
  }],
  ["文字下划线 + 半透明", { text: "查看详情", textDecoration: "underline", opacity: 0.6 }],
  ["后缀 + 外观 + 必填组合", {
    text: "邮箱", suffix: "：", required: true, bgColor: "#e3f2fd", paddingX: 6, paddingY: 2, borderRadius: 1, vAlign: "top",
  }],
];

describe("form-label：编辑区 ↔ 发布端逐值一致", () => {
  for (const [name, config] of CASES) {
    test(name, () => {
      const s = resolveLabelStyle(config);
      // 文字声明：codegen 产物 == 两端共用的 labelTextCss（渲染器 sx 也展开的是这一份）
      expect(renderCss(config)).toEqual(decls(cssText(labelTextCss(s))));
      // 舞台声明：codegen 产物 == scaleStageCss(align, vAlign)（渲染器 stage 的 sx 同源）
      expect(stageCss(config)).toEqual(decls(cssText(scaleStageCss(s.align, s.vAlign))));
      // 内层声明（自然尺寸 + 外观层）：同一份
      expect(getCodegen("form-label")!(labelComp(config), ctx)).toContain(cssText(labelInnerCss(s)));
    });
  }

  test("渲染器结构：外形 → 舞台 → 内层 → 文字 span（与 codegen 同构）", () => {
    const html = renderHTML({ text: "邮箱" });
    expect(html).toContain('data-wc-label-outer="1"');
    expect(html).toContain('data-wc-label-stage="1"');
    expect(html).toContain('data-wc-label-inner="1"');
    expect(html).toContain("邮箱</span>");
  });

  test("必填星号：颜色两端同源", () => {
    const config = { text: "姓名", required: true, errorColor: "#00ff00" };
    const html = renderHTML(config);
    // 星号用 React 内联 style（SSR 会如实下发）
    expect(html).toContain('style="color:#00ff00;margin-left:2px"');
    expect(html).toContain(">*</span>");
    // codegen 侧同一配置产出同一颜色；容器文字色不受星号色影响
    expect(renderCss(config)["color"]).toBe("#333333");
    const out = getCodegen("form-label")!(labelComp(config), ctx);
    expect(out).toContain('<span style="color:#00ff00;margin-left:2px">*</span>');
  });

  test("文字清空时渲染器不写回默认文案（P0 回归锁）", () => {
    const html = renderHTML({ text: "" });
    // 内层 span 内除可选星号外为空
    expect(html).not.toContain("标签");
    expect(html).toMatch(/data-wc-label-inner="1"[^>]*>.*?<span[^>]*><\/span>/);
  });

  test("渲染器不依赖 MUI 排版预设（用 span，行高/字间距不会被 body1 覆盖）", () => {
    const html = renderHTML({ text: "标签" });
    expect(html).toContain("标签</span>");
    // 行高/字间距由 labelTextCss 唯一给出（两份都不再继承 body1）
    expect(labelTextCss(resolveLabelStyle({ text: "标签" })).lineHeight).toBe("1.4375");
    expect(labelTextCss(resolveLabelStyle({ text: "标签" })).letterSpacing).toBeUndefined();
  });

  test("缩放系数：两端读同一份 fitFactor + LABEL_FIT", () => {
    // 设计基准尺寸 → 1 倍；高一倍 → 2 倍（等比取小）；关闭时恒 1
    expect(fitFactor(LABEL_FIT.refW, LABEL_FIT.refH, LABEL_FIT)).toBe(1);
    expect(fitFactor(LABEL_FIT.refW * 2, LABEL_FIT.refH * 2, LABEL_FIT)).toBe(2);
    expect(fitFactor(0, 0, LABEL_FIT)).toBe(1);
  });

  test("后缀文字两端同构：都排在必填星号之前，且默认不输出", () => {
    const cfg = { text: "邮箱", suffix: "：", required: true };
    expect(renderHTML(cfg)).toMatch(
      /data-wc-label-text="1">邮箱<\/span><span data-wc-label-suffix="1">：<\/span>/,
    );
    expect(getCodegen("form-label")!(labelComp(cfg), ctx)).toMatch(/邮箱<\/span><span>：<\/span>/);
    // 未配置后缀时两端都不产出空节点
    expect(renderHTML({ text: "邮箱" })).not.toContain("data-wc-label-suffix");
    expect(getCodegen("form-label")!(labelComp({ text: "邮箱" }), ctx)).not.toMatch(/<span><\/span>/);
  });

  test("文字节点单独包一层：接口取数只替换这一层（不会连带抹掉后缀与星号）", () => {
    expect(renderHTML({ text: "邮箱" })).toContain('data-wc-label-text="1"');
    expect(getCodegen("form-label")!(labelComp({ text: "邮箱" }), ctx)).toMatch(
      /<span id="flb-[a-z0-9]+v">邮箱<\/span>/,
    );
  });

  test("外观层：两端都只读 labelInnerCss(s)，圆角走表单族 ×SHAPE_RADIUS 口径", () => {
    const s = resolveLabelStyle({ text: "x", bgColor: "#ffeeaa", paddingX: 8, paddingY: 4, borderRadius: 2, opacity: 0.5 });
    const inner = labelInnerCss(s);
    expect(inner.backgroundColor).toBe("#ffeeaa");
    expect(inner.paddingLeft).toBe("8px");
    expect(inner.paddingTop).toBe("4px");
    expect(inner.borderRadius).toBe(`${2 * SHAPE_RADIUS}px`);
    expect(inner.opacity).toBe("0.5");
    // 产物必须逐字等于同一份声明（任何一侧另写字面量都会被这里抓住）
    expect(getCodegen("form-label")!(labelComp({ text: "x", bgColor: "#ffeeaa", paddingX: 8, paddingY: 4, borderRadius: 2, opacity: 0.5 }), ctx)).toContain(
      cssText(inner),
    );
  });

  test("外观层挂在缩放内层上（不能被外层截住从而不随框缩放）", () => {
    const cfg = { text: "x", bgColor: "#ffeeaa", paddingX: 8 };
    const out = getCodegen("form-label")!(labelComp(cfg), ctx);
    const outer = (out.match(/^<div id="flb-[a-z0-9]+" style="([^"]*)"/) || [])[1] ?? "";
    expect(outer).not.toContain("background-color");
    const inner = (out.match(/<div class="flb-[a-z0-9]+-in" style="([^"]*)"/) || [])[1] ?? "";
    expect(inner).toContain("background-color:#ffeeaa");
  });
});
