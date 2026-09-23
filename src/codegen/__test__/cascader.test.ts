import { describe, test, expect } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import { parseCascaderApiOptions } from "../../editor/data/cascaderOptions";
import fs from "node:fs";
import path from "node:path";

initBuiltinCodegens();

function casComp(config: Record<string, unknown>): SceneComponent {
  return {
    id: "cas1",
    type: "form-cascader",
    name: "Cascader",
    transform: createDefaultTransform({ x: 0, y: 0, width: 280, height: 56 }),
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

const render = (config: Record<string, unknown>): string => getCodegen("form-cascader")!(casComp(config), ctx);

function hiddenInput(out: string): string {
  return (out.match(/<input type="hidden"[^>]*>/) || [])[0] || "";
}

const TREE = JSON.stringify([
  { label: "浙江", value: "zj", children: [{ label: "杭州", value: "hz", children: [{ label: "西湖区", value: "xh" }] }] },
]);

describe("form-cascader codegen：表单提交接入", () => {
  test("输出隐藏 input 承载选中值，使其参与表单提交（旧实现完全漏掉该字段）", () => {
    const out = render({ label: "地区", options: TREE, value: "zj/hz/xh" });
    const inp = hiddenInput(out);
    expect(inp).toBeTruthy();
    expect(inp).toContain('type="hidden"');
    // 隐藏 input 必须带 id（实时校验脚本靠它定位）
    expect(inp).toContain('id="cas-');
  });

  test("字段名 fieldName 决定提交 key；缺省回退标签（清洗为标识符）；再回退 cascader", () => {
    expect(hiddenInput(render({ fieldName: "region", label: "所在地区", options: TREE }))).toContain('name="region"');
    expect(hiddenInput(render({ label: "所在地区", options: TREE }))).toContain('name="所在地区"');
    expect(hiddenInput(render({ options: TREE }))).toContain('name="cascader"');
    // 带空格/标点的标签被清洗为合法标识符（连续非法字符折叠为 _，首尾 _ 去掉）
    expect(hiddenInput(render({ label: "收货 地址(省)", options: TREE }))).toContain('name="收货_地址_省"');
  });

  test("提交值三口径：末级值 / 取值路径 / 显示名路径", () => {
    const base = { label: "地区", options: TREE, value: "zj/hz/xh" };
    expect(hiddenInput(render({ ...base, submitMode: "leaf" }))).toContain('value="xh"');
    expect(hiddenInput(render({ ...base, submitMode: "path" }))).toContain('value="zj / hz / xh"');
    expect(hiddenInput(render({ ...base, submitMode: "labelPath" }))).toContain('value="浙江 / 杭州 / 西湖区"');
    // 缺省 = 末级值
    expect(hiddenInput(render(base))).toContain('value="xh"');
  });

  test("自定义分隔符同时作用于显示文案与路径提交值", () => {
    const out = render({ label: "地区", options: TREE, value: "zj/hz/xh", separator: ">", submitMode: "path" });
    // 属性/文本上下文一律 HTML 转义（浏览器读回即 > ），两端同口径
    expect(hiddenInput(out)).toContain('value="zj&gt;hz&gt;xh"');
    expect(out).toContain("浙江&gt;杭州&gt;西湖区");
  });
});

describe("form-cascader codegen：选项解析（与编辑区同一解析器）", () => {
  test("JSON 树解析出多级面板数据并内联进运行时", () => {
    const out = render({ label: "地区", options: TREE });
    expect(out).toContain('"label":"浙江"');
    expect(out).toContain('"children"');
  });

  test("逐行缩进文本也能建树（行首两个空格表示下一级）", () => {
    const out = render({ label: "地区", options: "浙江|zj\n  杭州|hz\n    西湖区|xh\n江苏|js" });
    expect(out).toContain('"label":"浙江"');
    expect(out).toContain('"label":"江苏"');
    // 江苏不缩进 → 根级；杭州是浙江的子级
    expect(out.indexOf('"label":"浙江"')).toBeLessThan(out.indexOf('"label":"杭州"'));
  });

  test("留空使用内置示例树（拖进来即可见效果）", () => {
    expect(render({ label: "地区" })).toContain("浙江");
  });

  test("默认选中路径支持 JSON 数组与斜杠路径两种写法", () => {
    const t = { label: "地区", options: TREE };
    expect(render({ ...t, value: '["zj","hz","xh"]' })).toContain("浙江 / 杭州 / 西湖区");
    expect(render({ ...t, value: "zj/hz/xh" })).toContain("浙江 / 杭州 / 西湖区");
  });

  test("关闭「显示完整路径」后只显示末级名称", () => {
    const out = render({ label: "地区", options: TREE, value: "zj/hz/xh", showPath: false });
    expect(out).toContain(">西湖区<");
    expect(out).not.toContain("浙江 / 杭州 / 西湖区");
  });
});

describe("form-cascader codegen：校验 / 帮助文字 / 标签口径", () => {
  test("必填时挂 data-vrules + 输出 .fc-err 并绑定实时校验", () => {
    const out = render({ label: "地区", options: TREE, required: true });
    expect(out).toContain(" data-vrules='");
    expect(out).toContain('class="fc-err"');
    expect(out).toContain("此项为必填项");
    expect(out).toContain("__WCVALIDATE");
  });

  test("未设必填与额外校验时不产生空规则容器", () => {
    const out = render({ label: "地区", options: TREE });
    expect(out).not.toContain("data-vrules");
    expect(out).not.toContain("fc-err");
    expect(out).not.toContain("__WCVALIDATE");
  });

  test("自定义错误提示与错误颜色随规则下发", () => {
    const out = render({ label: "地区", options: TREE, required: true, validateMessage: "请选择地区", errorColor: "#ff0000" });
    expect(out).toContain("请选择地区");
    expect(out).toContain("#ff0000");
  });

  test("必填在标签后追加星号", () => {
    expect(render({ label: "地区", options: TREE, required: true })).toContain("地区 *");
    expect(render({ label: "地区", options: TREE })).not.toContain("地区 *");
  });

  test("帮助文字常驻；有校验规则时初始隐藏并带让位脚本", () => {
    const plain = render({ label: "地区", options: TREE, helperText: "选择到区县一级" });
    const uid = (plain.match(/id="(cas-[a-z0-9]+)t"/) || [])[1] || "";
    expect(plain).toContain("选择到区县一级");
    expect(plain).toContain(`id="${uid}h"`);
    expect(plain).toContain("fc-help");
    const withRules = render({ label: "地区", options: TREE, helperText: "选择到区县一级", required: true });
    expect(withRules).toContain("display:none");
  });

  test("标签位置三态：内置悬浮 / 外部上方 / 无标签", () => {
    const inside = render({ label: "地区", options: TREE, labelPlacement: "inside" });
    const top = render({ label: "地区", options: TREE, labelPlacement: "top" });
    const none = render({ label: "地区", options: TREE, labelPlacement: "none" });
    expect(inside).toContain("translateY(-50%)");
    expect(top).toContain("flex-direction:column");
    // 无标签：不渲染可见 label（label 文案仍可能作为提交字段名的兜底出现，故只看标签元素）
    expect(none).not.toContain("<label");
    expect(inside).toContain("<label");
  });

  test("圆角走统一口径（面板值 × 主题 shape.borderRadius=10）", () => {
    expect(render({ label: "地区", options: TREE, borderRadius: 4 })).toContain("border-radius:40px");
    expect(render({ label: "地区", options: TREE, borderRadius: 8 })).toContain("border-radius:80px");
  });
});

describe("form-cascader codegen：数据接入（认证 / 非认证）", () => {
  const apiCfg = {
    label: "地区",
    dataMode: "api",
    apiUrl: "https://api.example.com/regions",
    authEnabled: false,
  };

  test("接口模式接入统一取数骨架，并回调替换选项树", () => {
    const out = render(apiCfg);
    expect(out).toContain("apiUrl");
    expect(out).toContain("fetch(");
    // 数据到达后换树
    expect(out).toContain("__wcCasOpts_");
  });

  test("认证开关下发音符串：「注入认证 Token」开启时运行时按 token 拼 Authorization", () => {
    const noAuth = render({ ...apiCfg, authEnabled: false });
    const withAuth = render({ ...apiCfg, authEnabled: true });
    expect(noAuth).toContain("var authEnabled = false");
    expect(withAuth).toContain("var authEnabled = true");
    // 非认证接入：不读取本地 token
    expect(noAuth).toContain("Authorization");
  });

  test("未显式配置时 authEnabled 为 null → 跟随全局认证态（非认证站点不发 token）", () => {
    const out = render({ label: "地区", dataMode: "api", apiUrl: "https://api.example.com/regions" });
    expect(out).toContain("var authEnabled = null");
    expect(out).toContain("__WC_AUTH_ENABLED");
  });

  test("接口模式不再输出静态选项树（静态与接口互斥）", () => {
    const out = render({ ...apiCfg, options: TREE });
    expect(out).not.toContain('"label":"浙江"');
  });

  test("字段名映射随配置下发（code/name/sub）", () => {
    const out = render({
      ...apiCfg,
      apiValueField: "code",
      apiLabelField: "name",
      apiChildrenField: "sub",
    });
    expect(out).toContain('var vf="code",lf="name",cf="sub"');
  });
});

describe("form-cascader codegen：结构完整性", () => {
  test("div 开闭平衡（含帮助文字与校验元素叠置）", () => {
    for (const cfg of [
      { label: "地区", options: TREE },
      { label: "地区", options: TREE, required: true, helperText: "选择到区县" },
      { label: "地区", options: TREE, clearable: true, labelPlacement: "top", submitMode: "path" },
    ]) {
      const body = render(cfg)
        .replace(/<script[\s\S]*?<\/script>/g, "")
        .replace(/<style[\s\S]*?<\/style>/g, "");
      const opens = (body.match(/<div\b/g) ?? []).length;
      const closes = (body.match(/<\/div>/g) ?? []).length;
      expect(opens).toBe(closes);
      expect(opens).toBeGreaterThan(0);
    }
  });

  test("一键清空开关关闭时不输出清空按钮", () => {
    // 只看清空按钮元素本身：类名样式规则与脚本引用恒存在（供运行时挂载），不能作为判据
    expect(render({ label: "地区", options: TREE, clearable: true, value: "zj" })).toMatch(/<span class="cas-clr"/);
    expect(render({ label: "地区", options: TREE, value: "zj" })).not.toMatch(/<span class="cas-clr"/);
    // 且禁用时即便开启也不输出（无法清空的按钮没有意义）
    expect(render({ label: "地区", options: TREE, clearable: true, value: "zj", disabled: true })).not.toMatch(/<span class="cas-clr"/);
  });

  test("禁用时不响应交互（不绑定打开面板的监听）", () => {
    const out = render({ label: "地区", options: TREE, disabled: true });
    expect(out).toContain("if(!disabled){");
    expect(out).toContain("not-allowed");
  });
});

/* ──────────────────────────────────────────────
 * 第 28 轮：P0 两端漂移 / 脚本逃逸；P1 键盘与 ARIA；P2 状态规则 / 交互 / 缩放
 * ────────────────────────────────────────────── */
describe("form-cascader codegen：第 28 轮回归锁（口径同源 / 脚本安全）", () => {
  const apiCfg = { label: "地区", dataMode: "api", apiUrl: "https://x.example/t" };

  /** 复刻产物里的响应解包（Array.isArray(data)?data:(data.items|list|children|data)||[]） */
  const unwrap = (d: unknown) =>
    Array.isArray(d)
      ? d
      : ((d as Record<string, unknown>)?.items ??
          (d as Record<string, unknown>)?.list ??
          (d as Record<string, unknown>)?.children ??
          (d as Record<string, unknown>)?.data ??
          []);

  test("P0-1：接口响应归一内联口径函数源码，与编辑区逐项一致（不再自写 __norm）", () => {
    const out = render({ ...apiCfg, apiValueField: "code", apiLabelField: "name" });
    // 旧实现自写 `__norm`（闭包引用外层 vf/lf/cf 且漏空项过滤）→ 同一响应两端选项数不同
    expect(out).not.toContain("__norm");
    expect(out).toContain("var __treeOf=");
    const src = (out.match(/var __treeOf=([\s\S]*?);\nvar src/) || [])[1] || "";
    expect(src, "内联口径未抽取到").toBeTruthy();
    // 自包含：能脱模块求值
    const fn = new Function("return " + src)() as (
      a: unknown,
      vf?: string,
      lf?: string,
      cf?: string,
    ) => Array<{ value: string; label: string }>;
    // 含空项过滤：旧实现会多出一行全空「幽灵选项」
    const raw = { items: [{ code: "a", name: "甲" }, { code: "", name: "" }] };
    const api = parseCascaderApiOptions(raw, { valueField: "code", labelField: "name" });
    expect(api.length).toBe(1);
    expect(fn(unwrap(raw), "code", "name", "children")).toEqual(api);
    // toString 内联不变量：源码不得含反引号或 `${`（会与包裹它的模板字符串互噬），
    // 且必须能 `new Function` 求值 —— 压缩产物里同样成立（已用 esbuild --minify 实测）
    expect(src).not.toContain("`");
    expect(src).not.toContain("${");
    expect(() => new Function("return " + src)()).not.toThrow();
  });

  test("P0-2：选项/占位符/分隔符里的 </script> 被转义，脚本不被提前闭合", () => {
    const evil = JSON.stringify([{ label: "</script><img src=x onerror=alert(1)>", value: "a" }]);
    const out = render({ label: "地区", options: evil });
    expect((out.match(/<\/script>/gi) ?? []).length, "脚本被提前闭合").toBe(1);
    expect(out).toContain("\\u003c");
    // 占位符与分隔符同样走 JSON 转义（否则是第二条逃逸路径）
    for (const cfg of [
      { label: "地区", options: TREE, placeholder: "</script>" },
      { label: "地区", options: TREE, separator: "</script>" },
    ]) {
      expect((render(cfg).match(/<\/script>/gi) ?? []).length).toBe(1);
    }
  });
});

describe("form-cascader codegen：第 28 轮回归锁（键盘 / ARIA / 状态规则）", () => {
  test("P1-1/P1-2：combobox + listbox/option 模式，方向键 / Home / End 全可用", () => {
    const out = render({ label: "地区", options: TREE });
    expect(out).toContain('role="combobox"');
    expect(out).toContain('aria-haspopup="listbox"');
    expect(out).toContain("aria-activedescendant");
    expect(out).toContain("setAttribute('role','listbox')");
    expect(out).toContain("setAttribute('role','option')");
    expect(out).toContain("aria-selected");
    for (const k of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"]) {
      expect(out, `缺键位 ${k}`).toContain(k);
    }
  });

  test("P1-3：开合状态成对 —— build 置 true + aria-controls，close 必须复位", () => {
    const out = render({ label: "地区", options: TREE });
    expect(out).toContain("setAttribute('aria-expanded','true')");
    expect(out).toContain("setAttribute('aria-controls',panel.id)");
    // 关闭时若不复位，辅助技术会永久认为面板处于展开态（谎报）
    expect(out).toMatch(/aria-expanded','false'/);
    expect(out).toContain("removeAttribute('aria-controls')");
    expect(out).toContain("removeAttribute('aria-activedescendant')");
  });

  test("P1-4：清空键透明度只由类规则给（inline 会永久压死 :hover）", () => {
    const out = render({ label: "地区", options: TREE, clearable: true, value: "zj" });
    const tag = (out.match(/<span class="cas-clr"[^>]*>/) || [])[0] || "";
    expect(tag).toBeTruthy();
    expect(tag).not.toMatch(/opacity/);
    expect(out).toContain(".cas-clr{opacity:.55");
    expect(out).toContain(".cas-clr:hover{opacity:.9");
    // display 由脚本切换、无类规则竞争 → 仍可 inline（回归锁：别顺手挪走）
    expect(tag).toContain("display:");
  });

  test("P2-2/P2-3：触发器有 focus-visible 环；选项悬浮展开下级（与编辑区同交互）", () => {
    const out = render({ label: "地区", options: TREE });
    expect(out).toContain(":focus-visible{outline:2px solid");
    expect(out).toContain("it.onmouseenter=");
  });

  test("P2-5：isApi 判定含 dataSourceId（与编辑区同判定，不再擅自回退示例树）", () => {
    const out = render({ label: "地区", dataMode: "api", dataSourceId: "ds1" });
    expect(out).toContain("__wcCasOpts_");
    expect(out).not.toContain('"label":"浙江"');
  });
});

describe("form-cascader codegen：第 28 轮回归锁（文字随框缩放 / 面板契约）", () => {
  test("P2-4：scaleFit 关闭=历史字号，开启=字号 × factor（不碰几何）", () => {
    const realRandom = Math.random;
    Math.random = () => 0.42;
    try {
      const base = { label: "地区", options: TREE, fontSize: 14 };
      const compAt = (w: number, h: number, cfg: Record<string, unknown>) =>
        getCodegen("form-cascader")!(
          { ...casComp(cfg), transform: createDefaultTransform({ x: 0, y: 0, width: w, height: h }) } as never,
          ctx,
        );
      // 默认框（280×56）与 2 倍框，开关关 → 字号恒 14（零回归）
      expect(compAt(280, 56, base)).toContain("font-size:14px");
      expect(compAt(560, 112, base)).toContain("font-size:14px");
      // 开启后 2 倍框 → 28（280×56 基准）
      expect(compAt(560, 112, { ...base, scaleFit: true })).toContain("font-size:28px");
      // 1 倍框开启 → 仍 14
      expect(compAt(280, 56, { ...base, scaleFit: true })).toContain("font-size:14px");
    } finally {
      Math.random = realRandom;
    }
  });

  test("两端缩放口径同源，且编辑区渲染器已接 fieldScaleFactor", () => {
    const readSrc = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), "utf8");
    for (const rel of ["../../editor/renderers/CascaderRenderer.tsx", "../components/cascader.ts"]) {
      const src = readSrc(rel);
      expect(src, `${rel} 未接 fieldScaleFactor`).toContain("fieldScaleFactor(");
      // 不许自带基准字面量（基准只在 FIELD_FITS）
      expect(src).not.toMatch(/refW:\s*280/);
    }
    expect(readSrc("../../editor/renderers/CascaderRenderer.tsx")).toMatch(/\*\s*fitF/);
  });

  test("编辑区渲染器：预览态键控与 ARIA（预览 ≠ 发布的历史缺口）", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../editor/renderers/CascaderRenderer.tsx"), "utf8");
    // 预览态键位与发布端同集合
    for (const k of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"]) {
      expect(src, `编辑区缺键位 ${k}`).toContain(k);
    }
    expect(src).toContain("role=\"option\"");
    expect(src).toContain("aria-selected");
    expect(src).toContain("aria-activedescendant");
    expect(src).toContain("focus-visible");
  });
});
