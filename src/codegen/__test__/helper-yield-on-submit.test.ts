import { describe, test, expect } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";

initBuiltinCodegens();

/** 全部支持 helperText 的表单控件（共享同一份让位机制） */
const HOST_TYPES = ["form-input", "form-textarea", "form-select", "form-checkbox", "form-radio"];

function comp(type: string, config: Record<string, unknown>): SceneComponent {
  return {
    id: "h1",
    type,
    name: type,
    transform: createDefaultTransform({ x: 0, y: 0, width: 300, height: 60 }),
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
  const ctx = { pageScripts: [] } as unknown as { pageScripts: string[] };
  const html = getCodegen(type)!(comp(type, config), ctx as never);
  // 把注入的运行时脚本一并返回，便于断言收口逻辑
  return html + "\n<!--SCRIPTS-->\n" + ctx.pageScripts.join("\n");
}

describe("helper 让位：错误提示与帮助文字不得叠字", () => {
  test("五个控件的帮助文字都带 fc-help 类（供校验运行时收口定位）", () => {
    for (const type of HOST_TYPES) {
      const out = render(type, { label: "字段", helperText: "辅助说明", required: true });
      expect(out, type).toContain('class="fc-help"');
    }
  });

  test("校验运行时在写入错误后同步帮助文字显隐", () => {
    // 触发运行时注入（必填才会注入）
    const out = render("form-radio", {
      label: "性别",
      items: [{ label: "男", value: "male" }],
      required: true,
      helperText: "用于统计",
    });
    const validator = out.split("<!--SCRIPTS-->")[1] ?? "";
    expect(validator).toContain("__WCVALIDATE");
    // 收口点：按错误文案有无切换 .fc-help 的 display
    expect(validator).toContain("querySelector('.fc-help')");
    expect(validator).toContain("'none':'block'");
  });

  test("未设校验规则时不注入运行时（帮助文字常驻显示）", () => {
    const ctx = { pageScripts: [] } as unknown as { pageScripts: string[] };
    const html = getCodegen("form-radio")!(
      comp("form-radio", { label: "性别", items: [{ label: "男", value: "male" }], helperText: "用于统计" }),
      ctx as never,
    );
    expect(ctx.pageScripts.join("")).not.toContain("__WCVALIDATE");
    // 无规则 → 初值即显示，无需让位
    expect(html).toContain("display:block");
  });

  test("有校验规则时帮助文字初值隐藏（避免提交前一闪而成常驻）", () => {
    const out = render("form-radio", {
      label: "性别",
      items: [{ label: "男", value: "male" }],
      required: true,
      helperText: "用于统计",
    });
    const helperTag = (out.match(/<span class="fc-help"[^>]*>/) || [])[0] ?? "";
    expect(helperTag).toBeTruthy();
    expect(helperTag).toContain("display:none");
  });
});
