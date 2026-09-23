import { describe, test, expect } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";

initBuiltinCodegens();

function taComp(config: Record<string, unknown>): SceneComponent {
  return {
    id: "ft1",
    type: "form-textarea",
    name: "Textarea",
    transform: createDefaultTransform({ x: 100, y: 100, width: 280, height: 120 }),
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

function uidOf(out: string): string {
  return (out.match(/class="(fta-[a-z0-9]+)"/) || [])[1] || "";
}

describe("form-textarea codegen：内置悬浮标签徽章（与 form-input 同方案）", () => {
  test("内置悬浮标签渲染为带背景徽章 fta-flabel（底色盖线、文字不穿边框）", () => {
    const out = getCodegen("form-textarea")!(taComp({ label: "留言", labelPlacement: "inside" }), ctx);
    const uid = uidOf(out);
    expect(uid).toBeTruthy();
    // 悬浮标签必须带 fta-flabel class（与编辑器徽章一致）
    expect(out).toContain(`class="fta-flabel"`);
    // 徽章必须是带背景的实色块（盖住边框线段形成干净缺口），不能遗漏 background
    const flabel = (out.match(/<label class="fta-flabel"[^>]*>/) || [])[0];
    expect(flabel).toBeTruthy();
    expect(flabel).toContain("background:");
    expect(flabel).toContain("border-radius:");
    expect(flabel).toContain("font-size:");
    // 决不能出现旧的 scale(.75) 缩放悬浮标签写法
    expect(flabel).not.toContain("scale");
    expect(out).not.toContain("<legend>");
    // 上浮规则由样式表驱动，不能写 inline top 盖死（否则重叠根因复发）
    expect(flabel).not.toContain("top:16px");
    // 样式表基规则存在：上浮到边框线、占位常驻可见
    expect(out).toContain(`${uid} .fta-flabel{`);
    expect(out).toContain("top:0;transform:translateY(-50%)");
    expect(out).toContain(`textarea:not(:placeholder-shown) ~ .fta-flabel`);
  });

  test("占位提示常驻（不再用 placeholder=' ' 隐藏）", () => {
    const out = getCodegen("form-textarea")!(taComp({ label: "留言", labelPlacement: "inside", placeholder: "请输入留言内容" }), ctx);
    // 真实占位常驻，供 :placeholder-shown 机制使用
    expect(out).toContain('placeholder="请输入留言内容"');
    expect(out).not.toContain('placeholder=" "');
    // 占位常驻样式
    expect(out).toContain("textarea::placeholder");
  });

  test("预填值时仍输出值体（浮标靠 :placeholder-shown 上浮，无需 inline）", () => {
    const out = getCodegen("form-textarea")!(taComp({ label: "留言", labelPlacement: "inside", value: "已填内容" }), ctx);
    expect(out).toContain(">已填内容</textarea>");
    expect(out).toContain('placeholder=" "');
    // 有值时 :placeholder-shown 不命中 → 标签上浮，不会与文字重叠
    const flabel = (out.match(/<label class="fta-flabel"[^>]*>/) || [])[0];
    expect(flabel).not.toContain("top:16px");
  });

  test("标签背景色 / 圆角 / 字号 可调（徽章三件套）", () => {
    const out = getCodegen("form-textarea")!(taComp({
      label: "留言", labelPlacement: "inside",
      labelBgColor: "#1976d2", labelRadius: 8, labelFontSize: 16,
    }), ctx);
    const flabel = (out.match(/<label class="fta-flabel"[^>]*>/) || [])[0];
    expect(flabel).toContain("background:#1976d2");
    expect(flabel).toContain("border-radius:8px");
    expect(flabel).toContain("font-size:16px");
    // 样式表基规则同样带自定义圆角/字号
    expect(out).toContain("translateY(-50%)");
  });

  test("标签背景色留空时跟随输入框背景色（无缝缺口）", () => {
    const out = getCodegen("form-textarea")!(taComp({
      label: "留言", labelPlacement: "inside",
      bgColor: "#fff7e6", labelBgColor: "",
    }), ctx);
    const flabel = (out.match(/<label class="fta-flabel"[^>]*>/) || [])[0];
    expect(flabel).toContain("background:#fff7e6");
  });

  test("帮助文字常驻渲染（校验出错时让位错误提示）", () => {
    const out = getCodegen("form-textarea")!(taComp({
      label: "留言", labelPlacement: "inside", helperText: "最多 200 字",
    }), ctx);
    expect(out).toContain("最多 200 字");
    // helper 行存在且初始可见（无校验规则时）
    expect(out).toContain(`id="fta-`);
    expect(out).toContain("margin-top:3px");
  });

  test("顶部标签（外部上方）正常渲染且不参与浮标", () => {
    const out = getCodegen("form-textarea")!(taComp({ label: "留言", labelPlacement: "top", labelColor: "#ff0000", labelFontSize: 18, labelGap: 8 }), ctx);
    expect(out).toContain("留言");
    // 顶部模式不应出现浮标标签元素（只有外部上方标签）；颜色/字号/间距独立可控
    expect(out).not.toContain('<label class="fta-flabel"');
    expect(out).toContain("color:#ff0000");
    expect(out).toContain("font-size:18px");
    expect(out).toContain("margin-bottom:8px");
  });
});
