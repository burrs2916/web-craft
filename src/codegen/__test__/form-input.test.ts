import { describe, test, expect } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";

initBuiltinCodegens();

function inputComp(config: Record<string, unknown>): SceneComponent {
  return {
    id: "fi1",
    type: "form-input",
    name: "Input",
    transform: createDefaultTransform({ x: 100, y: 100, width: 280, height: 56 }),
    layerId: "l1",
    zIndex: 0,
    locked: false,
    visible: true,
    config,
    children: [],
    parentId: null,
  };
}

// 仅校验场景会访问 ctx.pageScripts，给一个最小可用 ctx 避免 undefined 崩溃
const ctx = { pageScripts: [] } as never;

function uidOf(out: string): string {
  return (out.match(/class="(fi-[a-z0-9]+)"/) || [])[1] || "";
}

describe("form-input codegen：悬浮标签/数字/帮助文字", () => {
  test("悬浮标签常驻边框左上角徽章（带背景盖住边框，无 legend 缺口）", () => {
    const out = getCodegen("form-input")!(inputComp({ label: "姓名", labelPlacement: "inside" }), ctx);
    const uid = uidOf(out);
    expect(uid).toBeTruthy();
    // 悬浮 <label> 为带背景徽章，底色盖住边框线段（避免文字被边框遮挡）；不写 inline top/transform
    const floatLabel = (out.match(/<label class="fc-flabel"[^>]*"/) || [])[0];
    expect(floatLabel).toBeTruthy();
    expect(floatLabel).not.toContain("top:50%");
    expect(floatLabel).not.toContain("translateY(-50%)");
    expect(floatLabel).toContain("background:");
    expect(floatLabel).toContain("border-radius:");
    // 边框走 fieldset 实线覆盖层（data-ring 供错误态），无 legend 缺口（由徽章背景盖线）
    expect(out).toContain("fc-outline");
    expect(out).toContain(`data-ring="1"`);
    expect(out).not.toContain("<legend");
    expect(out).toContain(`.${uid} .fc-flabel{color:`);
    expect(out).toContain("top:0;transform:translateY(-50%)");
    expect(out).toContain(`input:not(:placeholder-shown) ~ .fc-flabel`);
  });

  test("内置悬浮标签背景色/圆角/字号可调（徽章）", () => {
    const out = getCodegen("form-input")!(
      inputComp({ label: "姓名", labelPlacement: "inside", labelColor: "#ff0000", labelBgColor: "#fff3e0", labelRadius: 8, labelFontSize: 16 }),
      ctx,
    );
    const floatLabel = (out.match(/<label class="fc-flabel"[^>]*"/) || [])[0];
    expect(floatLabel).toContain("color:#ff0000");
    expect(floatLabel).toContain("background:#fff3e0");
    expect(floatLabel).toContain("border-radius:8px");
    expect(floatLabel).toContain("font-size:16px");
  });

  test("内置悬浮标签背景留空时跟随输入框背景色（无缝缺口）", () => {
    const out = getCodegen("form-input")!(inputComp({ label: "姓名", labelPlacement: "inside", bgColor: "#101010" }), ctx);
    const floatLabel = (out.match(/<label class="fc-flabel"[^>]*"/) || [])[0];
    expect(floatLabel).toContain("background:#101010");
  });

  test("内容文字字重（fontWeight）生效", () => {
    const out = getCodegen("form-input")!(inputComp({ label: "姓名", fontWeight: "bold" }), ctx);
    expect(out).toContain("font-weight: bold");
  });

  test("数字框使用原生 min/max/step，且不含浏览器忽略的 maxlength", () => {
    const out = getCodegen("form-input")!(
      inputComp({ label: "年龄", inputType: "number", validateType: "number", validateMin: 0, validateMax: 120, maxLength: 10 }),
      ctx,
    );
    expect(out).toContain('type="number"');
    expect(out).toContain('step="any"');
    expect(out).toContain('min="0"');
    expect(out).toContain('max="120"');
    expect(out).not.toContain("maxlength");
  });

  test("文本/邮箱框仍保留 maxlength 长度限制", () => {
    const out = getCodegen("form-input")!(inputComp({ label: "昵称", inputType: "text", maxLength: 20 }), ctx);
    expect(out).toContain('maxlength="20"');
  });

  test("帮助文字渲染为常驻说明（输入框下方）", () => {
    const out = getCodegen("form-input")!(inputComp({ label: "姓名", labelPlacement: "top", helperText: "请输入真实姓名" }), ctx);
    expect(out).toContain("请输入真实姓名");
    const uid = uidOf(out);
    expect(out).toContain(`id="${uid}h"`);
  });

  test("标签颜色/字号/间距（外部上方）独立可控", () => {
    const out = getCodegen("form-input")!(
      inputComp({ label: "姓名", labelPlacement: "top", labelColor: "#ff0000", labelFontSize: 18, labelGap: 8 }),
      ctx,
    );
    expect(out).toContain("color:#ff0000");
    expect(out).toContain("font-size:18px");
    expect(out).toContain("margin-bottom:8px");
  });

  test("悬浮标签颜色跟随 labelColor", () => {
    const out = getCodegen("form-input")!(inputComp({ label: "姓名", labelPlacement: "inside", labelColor: "#00ff00" }), ctx);
    const floatLabel = (out.match(/<label class="fc-flabel"[^>]*"/) || [])[0];
    expect(floatLabel).toContain("color:#00ff00");
  });

  test("前缀/后缀文本渲染为输入框两侧的固定文字", () => {
    const out = getCodegen("form-input")!(inputComp({ label: "金额", labelPlacement: "top", prefixText: "¥", suffixText: "元" }), ctx);
    expect(out).toContain(">¥</span>");
    expect(out).toContain(">元</span>");
  });

  test("水平内边距 paddingX 生效", () => {
    const out = getCodegen("form-input")!(inputComp({ label: "姓名", labelPlacement: "top", paddingX: 24 }), ctx);
    expect(out).toContain("padding: 0 24px 0 24px");
  });

  test("文字对齐 align 生效", () => {
    const out = getCodegen("form-input")!(inputComp({ label: "姓名", align: "center" }), ctx);
    expect(out).toContain("text-align: center");
  });

  test("自动填充 autocomplete 属性生效", () => {
    const out = getCodegen("form-input")!(inputComp({ label: "邮箱", inputType: "email", autocomplete: "email" }), ctx);
    expect(out).toContain('autocomplete="email"');
  });
});
