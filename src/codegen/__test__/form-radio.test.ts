import { describe, test, expect } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";

initBuiltinCodegens();

function radioComp(config: Record<string, unknown>): SceneComponent {
  return {
    id: "frd1",
    type: "form-radio",
    name: "Radio",
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

// 校验场景会访问 ctx.pageScripts（ensureValidator 注入运行时），给一个最小可用 ctx
const ctx = { pageScripts: [] } as never;

const render = (config: Record<string, unknown>): string => getCodegen("form-radio")!(radioComp(config), ctx);

/** 容器 id（前缀 frd-），供 liveValidateScript / helperScript 定位 */
function uidOf(out: string): string {
  return (out.match(/<div id="(frd-[a-z0-9]+)"/) || [])[1] || "";
}

function inputTags(out: string): string[] {
  return out.match(/<input type="radio"[^>]*>/g) ?? [];
}

const TWO: Array<{ label: string; value: string }> = [
  { label: "男", value: "male" },
  { label: "女", value: "female" },
];

describe("form-radio codegen：提交值 / 校验 / 布局 / 状态", () => {
  test("每个选项写入 value（修复提交值恒为浏览器默认 \"on\"）", () => {
    const out = render({ label: "性别", items: TWO });
    const tags = inputTags(out);
    expect(tags).toHaveLength(2);
    expect(tags[0]).toContain('value="male"');
    expect(tags[1]).toContain('value="female"');
    // 回归锁：漏写 value 时浏览器取默认 "on"，提交到接口的永远是 "on"
    expect(out).not.toContain('value="on"');
  });

  test("兼容旧 options 文本（每行「显示名|提交值」，与编辑区共用解析器）", () => {
    const out = render({ label: "性别", options: "男|male\n女|female" });
    const tags = inputTags(out);
    expect(tags[0]).toContain('value="male"');
    expect(tags[1]).toContain('value="female"');
    // 纯文本旧格式：显示名=提交值
    const plain = inputTags(render({ label: "性别", options: "男\n女" }));
    expect(plain[0]).toContain('value="男"');
    expect(plain[1]).toContain('value="女"');
  });

  test("必填时容器挂 data-vrules + .fc-err + 实时校验绑定（change 冒泡覆盖全组）", () => {
    const out = render({ label: "性别", required: true, items: TWO });
    const uid = uidOf(out);
    expect(uid).toBeTruthy();
    expect(out).toContain(" data-vrules='");
    expect(out).toContain("此项为必填项");
    expect(out).toContain('class="fc-err"');
    expect(out).toContain("__WCVALIDATE");
    expect(out).toContain(`id="${uid}"`);
    expect(out).toContain("addEventListener('change',v)");
  });

  test("未设必填时不输出校验属性与校验脚本", () => {
    const out = render({ label: "性别", items: TWO });
    expect(out).not.toContain("data-vrules");
    expect(out).not.toContain("fc-err");
    expect(out).not.toContain("__WCVALIDATE");
    // 故意不输出原生 required（原生气泡会先于自定义 .fc-err 拦截提交）
    for (const t of inputTags(out)) expect(t).not.toContain("required");
  });

  test("自定义错误提示与错误颜色随规则下发", () => {
    const out = render({ label: "性别", required: true, items: TWO, validateMessage: "请选择性别", errorColor: "#ff0000" });
    expect(out).toContain("请选择性别");
    expect(out).toContain("errColor");
    expect(out).toContain("color:#ff0000");
  });

  test("字段名 fieldName 决定提交 key：组内所有 radio 同名", () => {
    const named = inputTags(render({ fieldName: "gender", label: "性别", items: TWO }));
    for (const t of named) expect(t).toContain('name="gender"');
    // 缺省回退组标签，再回退 "radio"
    for (const t of inputTags(render({ label: "性别", items: TWO }))) expect(t).toContain('name="性别"');
    for (const t of inputTags(render({ items: TWO }))) expect(t).toContain('name="radio"');
  });

  test("默认选中索引 selectedIndex 命中对应项（越界不预选）", () => {
    const tags = inputTags(render({ label: "性别", items: TWO, selectedIndex: 1 }));
    expect(tags[0]).not.toContain("checked");
    expect(tags[1]).toContain("checked");
    const oob = inputTags(render({ label: "性别", items: TWO, selectedIndex: 9 }));
    for (const t of oob) expect(t).not.toContain("checked");
  });

  test("组标签用 <label>（运行时可错误态着色）且不写 inline color", () => {
    const out = render({ label: "性别", items: TWO, textColor: "#123456", required: true });
    const groupLabel = (out.match(/<label style="font-size:14px;line-height:1\.4375[^"]*"/) || [])[0];
    expect(groupLabel).toBeTruthy();
    // 运行时出错会 label.style.color=errColor；若颜色本就写成 inline 会被还原逻辑一并抹掉
    expect(groupLabel).not.toContain("color:");
    expect(out).toContain("性别 *");
    // 选项文字色走类规则
    expect(out).toContain(".fc-opt{color:#123456}");
  });

  test("排列方向与标签位置", () => {
    expect(render({ label: "性别", items: TWO, direction: "horizontal" })).toContain("flex-direction:row;gap:8px");
    expect(render({ label: "性别", items: TWO, direction: "vertical" })).toContain("flex-direction:column;gap:2px");
    // 标签在左：标签 + 选项组同行
    const left = render({ label: "性别", items: TWO, labelPlacement: "left" });
    expect(left).toContain("align-items:flex-start");
    expect(left).toContain("margin-right:12px");
    expect(render({ label: "性别", items: TWO, labelPlacement: "top" })).toContain("margin-bottom:4px");
  });

  test("尺寸：小号 38px 盒 / 20px 图标，中号 42px 盒 / 24px 图标", () => {
    const small = render({ label: "性别", items: TWO, size: "small" });
    expect(small).toContain("width:38px;height:38px");
    expect(small).toContain('width="20" height="20"');
    const medium = render({ label: "性别", items: TWO, size: "medium" });
    expect(medium).toContain("width:42px;height:42px");
    expect(medium).toContain('width="24" height="24"');
    // 单选组默认小号
    expect(render({ label: "性别", items: TWO })).toContain("width:38px;height:38px");
  });

  test("选项图标编译期内联 SVG（material 走本地 path）", () => {
    const out = render({
      label: "导航",
      items: [
        { label: "首页", value: "home", icon: "material:home" },
        { label: "我的", value: "me" },
      ],
    });
    expect(out).toContain("M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"); // home
    // 无图标的选项不产生额外图标
    expect(render({ label: "导航", items: TWO })).not.toContain("M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z");
  });

  test("选中态与文字色：图标显隐走类规则，图标不带 inline display", () => {
    const out = render({ label: "性别", items: TWO, textColor: "#123456" });
    const uid = uidOf(out);
    expect(out).toContain(`.${uid} .ic-on{display:none}`);
    expect(out).toContain(`.${uid} .ic-off{display:block}`);
    expect(out).toContain(`.${uid} input:checked ~ * .ic-on{display:block}`);
    expect(out).toContain(`.${uid} input:checked ~ * .ic-off{display:none}`);
    // 回归锁：图标若带 inline display 会压掉 .ic-on{display:none} → 两图标同时可见、点击无视觉变化
    const iconSvg = (out.match(/<svg class="ic-on"[^>]*>/) || [])[0];
    expect(iconSvg).toBeTruthy();
    expect(iconSvg).not.toContain("display");
  });

  test("禁用：逐项输出 disabled 且整体降透明度", () => {
    const out = render({ label: "性别", items: TWO, disabled: true });
    for (const t of inputTags(out)) {
      expect(t).toContain("disabled");
      expect(t).toContain("opacity:0");
    }
    expect(out).toContain("cursor:not-allowed");
    expect(out).toContain("input:disabled ~ *{opacity:.38}");
  });

  test("帮助文字常驻；有校验规则时初始隐藏并带让位脚本", () => {
    const plain = render({ label: "性别", items: TWO, helperText: "请选择你的性别" });
    const uid = uidOf(plain);
    expect(plain).toContain("请选择你的性别");
    expect(plain).toContain(`id="${uid}h"`);
    expect(plain).toContain("display:block");
    const withRules = render({ label: "性别", items: TWO, helperText: "请选择你的性别", required: true });
    expect(withRules).toContain("display:none");
    expect(withRules).toContain(".fc-err");
  });

  test("容器 div/label 开闭平衡（校验+帮助文字叠加后仍平衡）", () => {
    for (const cfg of [
      { label: "性别", items: TWO },
      { label: "性别", items: TWO, required: true, helperText: "请选择" },
      { items: TWO, direction: "horizontal", size: "medium", disabled: true },
    ]) {
      const body = render(cfg).replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
      const divOpen = (body.match(/<div\b/g) ?? []).length;
      const divClose = (body.match(/<\/div>/g) ?? []).length;
      expect(divOpen).toBe(divClose);
      const labOpen = (body.match(/<label\b/g) ?? []).length;
      const labClose = (body.match(/<\/label>/g) ?? []).length;
      expect(labOpen).toBe(labClose);
      expect(labOpen).toBeGreaterThan(0);
    }
  });
});
