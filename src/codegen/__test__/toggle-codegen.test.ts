import { describe, test, expect } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import type { CodegenContext } from "../types";

initBuiltinCodegens();

/**
 * 「面板显示了这条控件，就必须能改变产物」—— 开关 / 复选框本轮新增字段的产物级锁。
 *
 * 做法：同一组件跑两个取值，比对 `html + pageStyles`。相同即判为假能力。
 * （这条模式沿用自 `decor-panel-capability.test.ts`，本轮把它套到表单族的
 *  外观层与配色字段上；`size`/`fullWidth` 两个历史假控件也是靠它暴露的。）
 */

function comp(type: string, config: Record<string, unknown>): SceneComponent {
  return {
    id: "c1",
    type,
    name: "X",
    transform: createDefaultTransform({ x: 0, y: 0, width: 200, height: 42 }),
    layerId: "l1",
    zIndex: 0,
    locked: false,
    visible: true,
    config,
    children: [],
    parentId: null,
  };
}

function render(type: string, config: Record<string, unknown>): string {
  const ctx = { pageScripts: [], pageStyles: [] } as unknown as CodegenContext;
  const html = getCodegen(type)!(comp(type, config) as never, ctx as never);
  return html + (ctx.pageScripts ?? []).join("") + (ctx.pageStyles ?? []).join("");
}

/** 该字段改动必须能改变产物 */
function expectAffectsOutput(type: string, base: Record<string, unknown>, field: string, a: unknown, b: unknown) {
  const one = render(type, { ...base, [field]: a });
  const two = render(type, { ...base, [field]: b });
  expect(one, `${type}.${field} 改了产物毫无变化（假控件）`).not.toBe(two);
}

describe.each([["form-switch"], ["form-checkbox"]])("%s 新增字段逐项改变产物", (type) => {
  const base = { label: "启用通知", textColor: "#333333", accentColor: "#1976d2" };

  test("外观层：底色 / 边框 / 圆角 / 内边距 / 不透明度", () => {
    expectAffectsOutput(type, base, "bgColor", "", "#ffeeaa");
    expectAffectsOutput(type, base, "borderColor", "", "#333333");
    expectAffectsOutput(type, { ...base, borderColor: "#333333" }, "borderWidth", 1, 4);
    expectAffectsOutput(type, base, "borderRadius", 0, 2);
    expectAffectsOutput(type, base, "paddingX", 0, 12);
    expectAffectsOutput(type, base, "paddingY", 0, 6);
    expectAffectsOutput(type, base, "opacity", 1, 0.5);
  });

  test("标签字重", () => {
    expectAffectsOutput(type, base, "fontWeight", 400, 700);
  });

  test("对齐与缩放（居中 + 随框等比缩放）", () => {
    expectAffectsOutput(type, base, "align", "center", "left");
    expectAffectsOutput(type, base, "vAlign", "center", "top");
    expectAffectsOutput(type, base, "scaleFit", true, false);
  });
});

describe("form-switch 轨道配色字段逐项改变产物", () => {
  const base = { label: "启用通知", accentColor: "#1976d2" };

  test("关闭态轨道色/透明度、开启态轨道透明度、关闭态滑块色", () => {
    expectAffectsOutput("form-switch", base, "trackOffColor", "#ffffff", "#111111");
    expectAffectsOutput("form-switch", base, "trackOffOpacity", 0.3, 0.8);
    expectAffectsOutput("form-switch", base, "trackOnOpacity", 0.5, 0.9);
    expectAffectsOutput("form-switch", base, "thumbOffColor", "#E0E0E0", "#333333");
  });
});

describe("form-checkbox 未选中态颜色改变产物", () => {
  test("uncheckedColor 影响未选中图标颜色", () => {
    const a = render("form-checkbox", { label: "同意", accentColor: "#1976d2" });
    const b = render("form-checkbox", { label: "同意", accentColor: "#1976d2", uncheckedColor: "#ff0000" });
    expect(a).not.toBe(b);
    expect(b).toContain("#ff0000");
  });
});

describe("外观层挂在缩放内层（随框缩放的前提）", () => {
  test.each([["form-switch"], ["form-checkbox"]])("%s 的底色声明落在 -in 内层而非外层", (type) => {
    const html = render(type, { label: "X", bgColor: "#ffeeaa", paddingX: 10, paddingY: 4, borderRadius: 2 });
    const inTag = html.match(/<div class="[^"]*-in" style="([^"]*)"/);
    expect(inTag, "找不到缩放内层").toBeTruthy();
    expect(inTag![1]).toContain("background:#ffeeaa");
    expect(inTag![1]).toContain("padding:4px 10px");
    expect(inTag![1]).toContain("border-radius:20px");
    // 最外层只负责铺满，不承载外观
    const outTag = html.match(/^<div style="([^"]*)"/);
    expect(outTag![1]).not.toContain("#ffeeaa");
  });
});
