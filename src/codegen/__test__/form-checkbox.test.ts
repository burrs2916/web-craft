import { describe, test, expect } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";

initBuiltinCodegens();

function cbComp(config: Record<string, unknown>): SceneComponent {
  return {
    id: "fcb1",
    type: "form-checkbox",
    name: "Checkbox",
    transform: createDefaultTransform({ x: 0, y: 0, width: 200, height: 32 }),
    layerId: "l1",
    zIndex: 0,
    locked: false,
    visible: true,
    config,
    children: [],
    parentId: null,
  };
}

// 校验场景会访问 ctx.pageScripts（ensureValidator 注入运行时），给一个最小可用 ctx
const ctx = { pageScripts: [] } as never;

const render = (config: Record<string, unknown>): string => getCodegen("form-checkbox")!(cbComp(config), ctx);

function uidOf(out: string): string {
  return (out.match(/class="(fcb-[a-z0-9]+)"/) || [])[1] || "";
}

function inputTag(out: string): string {
  return (out.match(/<input type="checkbox"[^>]*>/) || [])[0] || "";
}

describe("form-checkbox codegen：必填校验 / 帮助文字 / 布局 / 状态", () => {
  test("必填时根容器挂 data-vrules 并输出 .fc-err 与实时校验绑定", () => {
    const out = render({ label: "同意服务条款", required: true });
    const uid = uidOf(out);
    expect(uid).toBeTruthy();
    // 校验容器：data-vrules + 错误元素（运行时按 checkbox 取值 勾选='on' / 未勾选=''）
    expect(out).toContain(" data-vrules='");
    expect(out).toContain("此项为必填项");
    expect(out).toContain('class="fc-err"');
    expect(out).toContain("__WCVALIDATE");
    // 实时绑定在复选框自身（需 id 供脚本定位），change 触发
    expect(inputTag(out)).toContain(`id="${uid}"`);
    expect(out).toContain("addEventListener('change'");
    expect(out).toContain("addEventListener('change',v)");
  });

  test("未设必填时不输出校验属性与校验脚本（不产生空规则容器）", () => {
    const out = render({ label: "同意" });
    expect(out).not.toContain("data-vrules");
    expect(out).not.toContain("fc-err");
    expect(out).not.toContain("__WCVALIDATE");
  });

  test("自定义错误提示与错误颜色随规则下发", () => {
    const out = render({ label: "同意", required: true, validateMessage: "请先同意条款", errorColor: "#ff0000" });
    expect(out).toContain("请先同意条款");
    expect(out).toContain("errColor");
    expect(out).toContain("#ff0000");
    expect(out).toContain("color:#ff0000");
  });

  test("必填在标签后追加星号", () => {
    expect(render({ label: "同意", required: true })).toContain("同意 *");
    expect(render({ label: "同意" })).not.toContain("同意 *");
  });

  test("故意不输出原生 required（原生气泡会先于自定义错误提示拦截提交）", () => {
    const out = render({ label: "同意", required: true });
    expect(inputTag(out)).not.toContain("required");
  });

  test("字段名 fieldName 决定提交 key，缺省回退标签", () => {
    expect(inputTag(render({ fieldName: "agree", label: "同意服务条款" }))).toContain('name="agree"');
    expect(inputTag(render({ label: "同意服务条款" }))).toContain('name="同意服务条款"');
    expect(inputTag(render({}))).toContain('name="checkbox"');
  });

  test("帮助文字常驻；有校验规则时初始隐藏并带让位脚本", () => {
    const plain = render({ label: "同意", helperText: "请阅读并同意《服务条款》" });
    const uid = uidOf(plain);
    expect(plain).toContain("请阅读并同意《服务条款》");
    expect(plain).toContain(`id="${uid}h"`);
    expect(plain).toContain("display:block");
    // 必填时帮助文字先隐藏，出错显示、通过还原（复用 input/textarea 同源脚本）
    const withRules = render({ label: "同意", helperText: "请阅读条款", required: true });
    expect(withRules).toContain("display:none");
    expect(withRules).toContain(".fc-err");
  });

  test("标签位置：左侧用 row-reverse 换向", () => {
    expect(render({ label: "同意", labelPlacement: "left" })).toContain("flex-direction:row-reverse");
    expect(render({ label: "同意", labelPlacement: "right" })).not.toContain("flex-direction:row-reverse");
    expect(render({ label: "同意" })).not.toContain("flex-direction:row-reverse");
  });

  test("尺寸：小号 38px 盒 / 20px 图标，中号 42px 盒 / 24px 图标", () => {
    const small = render({ label: "同意", size: "small" });
    expect(small).toContain("width:38px;height:38px");
    expect(small).toContain('width="20" height="20"');
    const medium = render({ label: "同意", size: "medium" });
    expect(medium).toContain("width:42px;height:42px");
    expect(medium).toContain('width="24" height="24"');
    expect(render({ label: "同意" })).toContain("width:42px;height:42px");
  });

  test("半选状态渲染横线图标，且不再输出勾选/未勾选图标", () => {
    const out = render({ label: "全选", indeterminate: true });
    expect(out).toContain("m-2 10H7v-2h10v2z"); // CB_IND
    expect(out).not.toContain("m-8.7 16"); // CB_ON 对勾
    expect(out).not.toContain('class="ic-on"');
    expect(out).not.toContain('class="ic-off"');
    expect(out).not.toContain(".ic-on{");
  });

  test("包裹容器 div 开闭平衡（校验+帮助文字叠加后仍平衡）", () => {
    for (const cfg of [
      { label: "同意" },
      { label: "同意", required: true, helperText: "请阅读条款" },
      { label: "全选", indeterminate: true, required: true },
    ]) {
      const body = render(cfg).replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
      const opens = (body.match(/<div\b/g) ?? []).length;
      const closes = (body.match(/<\/div>/g) ?? []).length;
      expect(opens).toBe(closes);
      expect(opens).toBeGreaterThan(0);
    }
  });

  test("勾选/禁用状态与文字色：颜色走类规则（避免运行时清空内联色掉色）", () => {
    const out = render({ label: "同意", checked: true, disabled: true, textColor: "#123456" });
    const uid = uidOf(out);
    expect(inputTag(out)).toContain("checked");
    expect(inputTag(out)).toContain("disabled");
    expect(out).toContain(`.${uid}{color:#123456}`);
    // label 不写 inline color：运行时错误态会 label.style.color='' 还原，内联声明会被抹掉
    const labelTag = (out.match(/<label class="fcb-[a-z0-9]+" style="[^"]*"/) || [])[0];
    expect(labelTag).toBeTruthy();
    expect(labelTag).not.toContain("color:");
    expect(out).toContain("input:disabled ~ *{opacity:.38}");
  });
});
