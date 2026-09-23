import { describe, test, expect } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import { resolveLabelStyle, labelTextCss, labelInnerCss } from "../../editor/data/labelStyle";
import { LABEL_FIT, scaleStageCss } from "../../editor/data/scaleFit";
import { cssText } from "../../editor/data/cssDecls";
import { SHAPE_RADIUS } from "../../editor/data/fieldStyle";

initBuiltinCodegens();

function lbl(config: Record<string, unknown>): SceneComponent {
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
const render = (config: Record<string, unknown>): string => getCodegen("form-label")!(lbl(config), ctx);

/** 把 `a:1;b:2` 解析成声明表 */
function decls(style: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const decl of style.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    map[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
  }
  return map;
}

/** 文字 span（带 font-size 的那个）的声明表 */
function css(out: string): Record<string, string> {
  const style = (out.match(/<span style="([^"]*font-size:[^"]*)"/) || [])[1] ?? "";
  return decls(style);
}

/** 缩放舞台的声明表（`.uid-st`） */
function stageCss(out: string): Record<string, string> {
  const style = (out.match(/<div class="flb-[a-z0-9]+-st" style="([^"]*)"/) || [])[1] ?? "";
  return decls(style);
}

describe("form-label codegen：语义 / 三端一致 / 必填星号", () => {
  test("文字用 <span> 而非 <label>（无 for、无可关联控件时 <label> 会误导辅助技术）", () => {
    const out = render({ text: "姓名" });
    // 文字节点单独包一层 span：接口数据到达时只替换它的 textContent
    expect(out).toMatch(/<span style="[^"]*font-size:[^"]*"><span id="flb-[a-z0-9]+v">姓名<\/span>/);
    expect(out).not.toMatch(/<label[\s>]/);
  });

  test("三层缩放骨架：外形 → 舞台 → 内层（与编辑区逐层同构）", () => {
    const out = render({ text: "姓名" });
    expect(out).toMatch(/^<div id="flb-[a-z0-9]+" style="width:100%;height:100%;min-width:0;min-height:0;font-family:[^"]*box-sizing:border-box">/);
    expect(out).toMatch(/<div class="flb-[a-z0-9]+-st" style="[^"]*">/);
    expect(out).toMatch(/<div class="flb-[a-z0-9]+-in" style="[^"]*">/);
    // 内层声明 = scaleInnerBaseCss + labelInnerCss（同一份口径）
    expect(out).toContain(cssText(labelInnerCss(resolveLabelStyle({ text: "姓名" }))));
    // 挂上缩放脚本（含 fitFactor 的同一套公式常量）
    expect(out).toContain(`var RW=${LABEL_FIT.refW},RH=${LABEL_FIT.refH}`);
  });

  test("关闭等比缩放时不挂脚本，但仍产出同结构的舞台/内层", () => {
    const out = render({ text: "姓名", scaleFit: false });
    expect(out).toContain("-st");
    expect(out).toContain("-in");
    expect(out).not.toContain("__wcFit");
  });

  test("不输出冗余 text-align（flex 容器里只有 justify-content 生效）", () => {
    for (const align of ["left", "center", "right"]) {
      expect(render({ text: "姓名", align })).not.toContain("text-align");
    }
  });

  test("对齐映射到 flex 主轴（left/center/right）", () => {
    expect(stageCss(render({ text: "x", align: "left" }))["justify-content"]).toBe("flex-start");
    expect(stageCss(render({ text: "x", align: "center" }))["justify-content"]).toBe("center");
    expect(stageCss(render({ text: "x", align: "right" }))["justify-content"]).toBe("flex-end");
    // 非法值回退到舞台默认摆放（STAGE_ALIGN_DEFAULT = center，本仓库既定观感）
    expect(stageCss(render({ text: "x", align: "middle" }))["justify-content"]).toBe("center");
  });

  test("垂直对齐映射到 align-items，默认居中", () => {
    expect(stageCss(render({ text: "x" }))["align-items"]).toBe("center");
    expect(stageCss(render({ text: "x", vAlign: "top" }))["align-items"]).toBe("flex-start");
    expect(stageCss(render({ text: "x", vAlign: "bottom" }))["align-items"]).toBe("flex-end");
    expect(stageCss(render({ text: "x", vAlign: "middle" }))["align-items"]).toBe("center");
    // 舞台声明恒等于 scaleStageCss 的产物（两端唯一来源）
    expect(stageCss(render({ text: "x", align: "right", vAlign: "bottom" })))
      .toEqual(decls(cssText(scaleStageCss("right", "bottom"))));
  });

  test("默认行高 1.4375（对齐 MUI FormLabel 约定）且可覆盖", () => {
    expect(css(render({ text: "姓名" }))["line-height"]).toBe("1.4375");
    expect(css(render({ text: "姓名", lineHeight: 1.2 }))["line-height"]).toBe("1.2");
    // 非法/非正数回退默认（不再出现 0 行高把文字压没）
    expect(css(render({ text: "姓名", lineHeight: 0 }))["line-height"]).toBe("1.4375");
  });

  test("字间距默认不输出；>0 才输出 px", () => {
    expect(render({ text: "姓名" })).not.toContain("letter-spacing");
    expect(render({ text: "姓名", letterSpacing: 0 })).not.toContain("letter-spacing");
    expect(css(render({ text: "姓名", letterSpacing: 1.5 }))["letter-spacing"]).toBe("1.5px");
  });

  test("文字为空串时保持为空（不被回填默认文案）", () => {
    const out = render({ text: "" });
    expect(out).toMatch(/<span style="[^"]*font-size:[^"]*"><span id="flb-[a-z0-9]+v"><\/span><\/span>/);
    expect(out).not.toContain(">标签</span>");
  });

  test("未配置文字时回退默认文案", () => {
    expect(render({})).toContain(">标签</span>");
  });

  test("必填星号为独立 span，默认红色且颜色可配", () => {
    const on = render({ text: "姓名", required: true });
    expect(on).toContain('<span style="color:#f44336;margin-left:2px">*</span>');
    expect(render({ text: "姓名", required: true, errorColor: "#ff0000" })).toContain(
      '<span style="color:#ff0000;margin-left:2px">*</span>',
    );
    expect(render({ text: "姓名" })).not.toContain("*");
    // required 非严格 true 不生效（避免 "false" 字符串被当成开启）
    expect(render({ text: "姓名", required: "true" })).not.toContain("*");
  });

  test("文字色 / 字号 / 字重透传（含 500 档）", () => {
    const m = css(render({ text: "x", textColor: "#123456", fontSize: 18, fontWeight: "500" }));
    expect(m["color"]).toBe("#123456");
    expect(m["font-size"]).toBe("18px");
    expect(m["font-weight"]).toBe("500");
    expect(css(render({ text: "x" }))["font-weight"]).toBe("normal");
  });

  test("文字声明恒等于 labelTextCss(resolveLabelStyle(cfg))（两端唯一来源）", () => {
    const cfg = { text: "手机号", textColor: "#123456", fontSize: 17, fontWeight: "bold", lineHeight: 1.2, letterSpacing: 2 };
    expect(css(render(cfg))).toEqual(decls(cssText(labelTextCss(resolveLabelStyle(cfg)))));
  });

  test("文字被 HTML 转义（不产生可执行标记）", () => {
    const out = render({ text: '<img src=x onerror=alert(1)>' });
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });

  test("span/div 开闭平衡（含必填星号与缩放骨架嵌套）", () => {
    for (const cfg of [{ text: "姓名" }, { text: "姓名", required: true }, { text: "" }, { text: "x", scaleFit: false }]) {
      const out = render(cfg);
      expect((out.match(/<span\b/g) ?? []).length).toBe((out.match(/<\/span>/g) ?? []).length);
      expect((out.match(/<div\b/g) ?? []).length).toBe((out.match(/<\/div>/g) ?? []).length);
    }
  });
});

describe("form-label 外观层（底色 / 内边距 / 圆角 / 不透明度）", () => {
  test("外观声明只出现在缩放内层（才会随拖动框等比缩放）", () => {
    const out = render({ text: "账号信息", bgColor: "#ffeeaa", paddingX: 8, paddingY: 4, borderRadius: 1 });
    const inner = (out.match(/<div class="flb-[a-z0-9]+-in" style="([^"]*)"/) || [])[1] ?? "";
    expect(inner).toContain("background-color:#ffeeaa");
    expect(inner).toContain("padding-left:8px");
    expect(inner).toContain("padding-right:8px");
    expect(inner).toContain("padding-top:4px");
    expect(inner).toContain("padding-bottom:4px");
    // 圆角走表单族口径：面板档位 × SHAPE_RADIUS
    expect(inner).toContain(`border-radius:${SHAPE_RADIUS}px`);
    // 外层不应重复这些声明（否则两份字面量迟早漂移）
    const outer = (out.match(/^<div id="flb-[a-z0-9]+" style="([^"]*)"/) || [])[1] ?? "";
    expect(outer).not.toContain("background-color");
    expect(outer).not.toContain("border-radius");
  });

  test("默认外观零输出（不产生视觉回归）", () => {
    const inner = (render({ text: "姓名" }).match(/<div class="flb-[a-z0-9]+-in" style="([^"]*)"/) || [])[1] ?? "";
    expect(inner).not.toContain("background-color");
    expect(inner).not.toContain("padding");
    expect(inner).not.toContain("border-radius");
    expect(inner).not.toContain("opacity");
  });

  test("不透明度 0 是合法值（不得被 `|| 兜底` 吃掉）", () => {
    const zero = render({ text: "姓名", opacity: 0 });
    expect(zero).toContain("opacity:0");
    // 越界夹紧
    expect(render({ text: "姓名", opacity: 5 })).not.toContain("opacity:");
  });

  test("文字装饰：none 不输出声明，其余按枚举输出", () => {
    expect(render({ text: "姓名", textDecoration: "none" })).not.toContain("text-decoration");
    expect(render({ text: "姓名", textDecoration: "underline" })).toContain("text-decoration:underline");
    expect(render({ text: "姓名", textDecoration: "line-through" })).toContain("text-decoration:line-through");
    // 非法值回退 none
    expect(render({ text: "姓名", textDecoration: "blink" })).not.toContain("text-decoration");
  });

  test("后缀文字排在必填星号之前，且默认不输出", () => {
    const out = render({ text: "邮箱", suffix: "：", required: true });
    expect(out).toMatch(/邮箱<\/span><span>：<\/span><span style="color:#f44336/);
    expect(render({ text: "邮箱" })).not.toMatch(/<span><\/span>/);
  });

  test("后缀与文字同样被 HTML 转义", () => {
    const out = render({ text: "x", suffix: "<b>" });
    expect(out).toContain("&lt;b&gt;");
    expect(out).not.toContain("<b>");
  });
});

describe("form-label 动态文案（认证 / 非认证两种接入）", () => {
  test("静态模式产物不含取数脚本（历史行为零回归）", () => {
    const out = render({ text: "姓名" });
    expect(out).not.toContain("doFetch");
    expect(out).not.toContain("XMLHttpRequest");
  });

  test("接口模式：产物带取数骨架、取值字段与首屏静态占位", () => {
    const out = render({
      text: "占位",
      dataMode: "api",
      apiUrl: "https://api.example.com/me",
      apiDataPath: "data",
      apiTextField: "profile.nickname",
      authEnabled: false,
      apiInterval: 5,
    });
    expect(out).toContain("doFetch()");
    expect(out).toContain("apiInterval = 5");
    // 取值字段进脚本、点号路径按段拆分
    expect(out).toContain('"profile.nickname"');
    expect(out).toContain("split('.')");
    // 首屏保留静态文案（数据到达前不留空白），取不到值也不清空
    expect(out).toMatch(/<span id="flb-[a-z0-9]+v">占位<\/span>/);
    expect(out).toContain("if(v&&out)v.textContent=out;");
  });

  test("认证三态原样透传：null 跟随全局 / true 注入 / false 不注入", () => {
    const scriptOf = (authEnabled: unknown) =>
      render({ text: "x", dataMode: "api", apiUrl: "https://a.example.com/x", authEnabled });
    // 脚本里 authEnabled 变量的字面量必须与配置同态：null 才会走 window.__WC_AUTH_ENABLED
    expect(scriptOf(null)).toContain("var authEnabled = null;");
    expect(scriptOf(true)).toContain("var authEnabled = true;");
    expect(scriptOf(false)).toContain("var authEnabled = false;");
    // 缺省（历史数据）必须解析成「跟随全局」，不能被压成 false
    expect(scriptOf(undefined)).toContain("var authEnabled = null;");
    // 跟随全局时靠全局常量兜底（认证组件组写回的站点级认证态）
    expect(scriptOf(null)).toContain("__WC_AUTH_ENABLED");
  });

  test("只配了 dataMode 但没有地址时不产脚本（避免空请求）", () => {
    const out = render({ text: "x", dataMode: "api" });
    expect(out).not.toContain("doFetch");
  });
});

describe("form-label：面板控件必须能改变产物（假能力回归锁）", () => {
  /** 每个面板字段给两个不同取值，产物必须不同 */
  const CASES: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
    ["text", { text: "甲" }, { text: "乙" }],
    ["suffix", { text: "x" }, { text: "x", suffix: "：" }],
    ["required", { text: "x" }, { text: "x", required: true }],
    ["errorColor", { text: "x", required: true }, { text: "x", required: true, errorColor: "#0000ff" }],
    ["textColor", { text: "x" }, { text: "x", textColor: "#ff0000" }],
    ["fontSize", { text: "x" }, { text: "x", fontSize: 22 }],
    ["fontWeight", { text: "x" }, { text: "x", fontWeight: "bold" }],
    ["lineHeight", { text: "x" }, { text: "x", lineHeight: 2 }],
    ["letterSpacing", { text: "x" }, { text: "x", letterSpacing: 3 }],
    ["textDecoration", { text: "x" }, { text: "x", textDecoration: "underline" }],
    ["align", { text: "x" }, { text: "x", align: "left" }],
    ["vAlign", { text: "x" }, { text: "x", vAlign: "top" }],
    ["scaleFit", { text: "x", scaleFit: true }, { text: "x", scaleFit: false }],
    ["bgColor", { text: "x" }, { text: "x", bgColor: "#123456" }],
    ["paddingX", { text: "x", bgColor: "#123456" }, { text: "x", bgColor: "#123456", paddingX: 6 }],
    ["paddingY", { text: "x", bgColor: "#123456" }, { text: "x", bgColor: "#123456", paddingY: 6 }],
    ["borderRadius", { text: "x", bgColor: "#123456" }, { text: "x", bgColor: "#123456", borderRadius: 2 }],
    ["opacity", { text: "x" }, { text: "x", opacity: 0.4 }],
    [
      "apiTextField",
      { text: "x", dataMode: "api", apiUrl: "https://a.example.com/x", apiTextField: "a" },
      { text: "x", dataMode: "api", apiUrl: "https://a.example.com/x", apiTextField: "b" },
    ],
    [
      "authEnabled",
      { text: "x", dataMode: "api", apiUrl: "https://a.example.com/x", authEnabled: true },
      { text: "x", dataMode: "api", apiUrl: "https://a.example.com/x", authEnabled: false },
    ],
  ];

  for (const [key, a, b] of CASES) {
    test(`${key} 改了产物就变`, () => {
      expect(render(a), `${key} 是假控件：两个取值产物完全相同`).not.toBe(render(b));
    });
  }
});
