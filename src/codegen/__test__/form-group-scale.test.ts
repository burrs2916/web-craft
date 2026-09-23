import { describe, test, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import { alignToFlex, cssText, vAlignToFlex } from "../../editor/data/cssDecls";
import {
  CHECKBOX_FIT, RADIO_FIT, SWITCH_FIT, SEGMENTED_FIT, LABEL_FIT, RATE_FIT,
  STAGE_ALIGN_DEFAULT, STAGE_VALIGN_DEFAULT,
  scaleStageCss, stageAlignOf, stageVAlignOf,
} from "../../editor/data/scaleFit";
import { componentRegistry } from "../../editor/registry";
import { registerFormComponents } from "../../editor/registerFormComponents";

initBuiltinCodegens();
beforeAll(() => registerFormComponents());

const ctx = { pageScripts: [] } as never;

function comp(type: string, config: Record<string, unknown>, w = 320, h = 120): SceneComponent {
  return {
    id: "c1",
    type,
    name: type,
    transform: createDefaultTransform({ x: 0, y: 0, width: w, height: h }),
    layerId: "l1",
    zIndex: 0,
    locked: false,
    visible: true,
    config,
    children: [],
    parentId: null,
  };
}

function render(type: string, config: Record<string, unknown>, w?: number, h?: number): string {
  const fn = getCodegen(type);
  expect(fn, `缺少 ${type} 的 codegen`).toBeTruthy();
  return fn!(comp(type, config, w, h), ctx);
}

function decls(style: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const d of style.split(";")) {
    const i = d.indexOf(":");
    if (i < 0) continue;
    map[d.slice(0, i).trim()] = d.slice(i + 1).trim();
  }
  return map;
}

/** 取产物里缩放舞台 `.X-st` 的声明表 */
function stage(out: string): Record<string, string> {
  const m = out.match(/<div class="[a-z]+-[a-z0-9]+-st" style="([^"]*)"/);
  return decls(m ? m[1] : "");
}

/**
 * 表单组件组「居中 + 随拖动框等比缩放」横切能力的**契约锁**。
 *
 * 这三条是用户明确点名的横切要求，此前整个表单组（除评分）都没有：
 *   1. 内容有自然尺寸的控件在拖动框内**居中显示**；
 *   2. 拖动框改尺寸时内容**等比放大/缩小**（不是拉伸变形）；
 *   3. **预览与发布完全一致** —— 两端读同一份 `fitFactor` + 同一份 spec + 同一份舞台声明。
 * 任何一侧退回固定尺寸、或把舞台声明写死，本用例都会失败。
 */
const FIT_CASES: Array<[string, Record<string, unknown>, number, number, number]> = [
  ["form-label", { text: "标签" }, LABEL_FIT.refW, LABEL_FIT.refH, LABEL_FIT.max],
  ["form-checkbox", { label: "同意" }, CHECKBOX_FIT.refW, CHECKBOX_FIT.refH, CHECKBOX_FIT.max],
  ["form-radio", { label: "性别" }, RADIO_FIT.refW, RADIO_FIT.refH, RADIO_FIT.max],
  ["form-switch", { label: "启用" }, SWITCH_FIT.refW, SWITCH_FIT.refH, SWITCH_FIT.max],
  ["form-segmented", { label: "" }, SEGMENTED_FIT.refW, SEGMENTED_FIT.refH, SEGMENTED_FIT.max],
  // 评分（本轮 #9 纳入）：此前它自写 alignMap + `?? "left"`、独立舞台，且 RATE_FIT(126×30)
  // 与注册表 defaultSize(220×40) 不符 —— 是表单组里唯一不满足本套契约的成员。
  ["form-rate", { label: "" }, RATE_FIT.refW, RATE_FIT.refH, RATE_FIT.max],
];

describe("表单组缩放骨架：三层结构 + 两端同源", () => {
  for (const [type, cfg, refW, refH] of FIT_CASES) {
    test(`${type}：外形 → 舞台 → 内层 + 缩放脚本`, () => {
      const out = render(type, cfg);
      // 外形：铺满设计盒 + 钉住字体栈（字宽影响等比基准）
      expect(out).toMatch(/^<div[^>]*style="[^"]*width:100%;height:100%[^"]*font-family:/);
      expect(out).toMatch(/class="[^"]*-st" style="/);
      expect(out).toMatch(/class="[^"]*-in[^"]*" style="/);
      // 脚本里内联了同一份基准尺寸（两端共用 ScaleFitSpec）
      expect(out).toContain(`var RW=${refW},RH=${refH}`);
      expect(out).toContain("__wcFit");
    });

    test(`${type}：关闭等比缩放 → 同结构但无脚本`, () => {
      const out = render(type, { ...cfg, scaleFit: false });
      expect(out).toMatch(/class="[^"]*-st" style="/);
      expect(out).toMatch(/class="[^"]*-in[^"]*" style="/);
      expect(out).not.toContain("__wcFit");
    });

    test(`${type}：舞台声明 == scaleStageCss(align, vAlign)（唯一来源）`, () => {
      const out = render(type, { ...cfg, align: "right", vAlign: "top" });
      expect(stage(out)).toEqual(decls(cssText(scaleStageCss("right", "top"))));
      expect(stage(out)["justify-content"]).toBe("flex-end");
      expect(stage(out)["align-items"]).toBe("flex-start");
      expect(stage(out)["width"]).toBe("100%");
      expect(stage(out)["height"]).toBe("100%");
    });

    test(`${type}：面板暴露缩放/对齐三项且 key 唯一`, () => {
      const schema = componentRegistry.get(type)?.configSchema ?? [];
      const keys = schema.map((f) => f.key);
      for (const k of ["scaleFit", "align", "vAlign"]) expect(keys).toContain(k);
      // 同 key 重复会让"面板出现两个同名字段、只有后者生效"
      expect(new Set(keys).size, `${type} 存在重复 key`).toBe(keys.length);
      // 三项都在「布局」组（避免散落在不同分组里找不到）
      for (const k of ["scaleFit", "align", "vAlign"]) {
        expect(schema.find((f) => f.key === k)?.group).toBe("布局");
      }
    });

    test(`${type}：面板默认值与 designSize 基准一致（拖进来即 1 倍）`, () => {
      const def = componentRegistry.get(type)?.defaultSize;
      expect(def?.width).toBe(refW);
      expect(def?.height).toBe(refH);
    });

    /**
     * 面板默认值 × 舞台默认摆放必须同源：新拖入的组件在「未配置」与「面板值」两条路径下
     * 落点相同，否则用户会看到"面板显示左对齐、实际居中"这类自相矛盾。
     * 取值来自 `STAGE_ALIGN_DEFAULT` / `STAGE_VALIGN_DEFAULT`（scaleFit.ts 只此一份）。
     */
    test(`${type}：面板的 align/vAlign 默认值 == 舞台默认摆放`, () => {
      const cfgDefaults = componentRegistry.get(type)?.defaultConfig as Record<string, unknown>;
      expect(cfgDefaults.align).toBe(STAGE_ALIGN_DEFAULT);
      expect(cfgDefaults.vAlign).toBe(STAGE_VALIGN_DEFAULT);
      // 舞台在"未配置"时给出的摆放与"面板默认值"给出的摆放逐字一致
      expect(decls(cssText(scaleStageCss()))).toEqual(
        decls(cssText(scaleStageCss(String(cfgDefaults.align), String(cfgDefaults.vAlign)))),
      );
    });
  }
});

describe("form-radio 动态数据 + 认证组件组联动", () => {
  const base = { label: "性别", items: [{ label: "男", value: "m" }, { label: "女", value: "f" }] };

  test("静态模式：编译期渲染条目，且不引入取数脚本", () => {
    const out = render("form-radio", base);
    expect(out).toContain('value="m"');
    expect(out).toContain('value="f"');
    expect(out).not.toContain("__wcRadio_");
  });

  test("接口模式：不渲染静态条目，改为运行时重建（含选项组容器 id）", () => {
    const out = render("form-radio", {
      ...base, dataMode: "api", apiUrl: "https://x/api/list", apiValueField: "code", apiLabelField: "title",
    });
    expect(out).not.toContain('value="m"');
    expect(out).toMatch(/-grp"/);
    expect(out).toContain("__wcRadio_");
    // 字段映射透传到运行时脚本
    expect(out).toContain('"code"');
    expect(out).toContain('"title"');
    // 取数骨架（URL / 认证 / 轮询）来自统一 dataLoaderScript
    expect(out).toContain("var authEnabled = null");
    expect(out).toContain("https://x/api/list");
  });

  test("认证三态：未配置=null（跟随站点全局），显式开/关透传布尔", () => {
    const unset = render("form-radio", { ...base, dataMode: "api", apiUrl: "https://x/api" });
    expect(unset).toContain("var authEnabled = null");
    const on = render("form-radio", { ...base, dataMode: "api", apiUrl: "https://x/api", authEnabled: true });
    expect(on).toContain("var authEnabled = true");
    const off = render("form-radio", { ...base, dataMode: "api", apiUrl: "https://x/api", authEnabled: false });
    expect(off).toContain("var authEnabled = false");
  });

  test("接口模式 + 无地址/无全局源：退回静态渲染（不产生空壳）", () => {
    const out = render("form-radio", { ...base, dataMode: "api" });
    expect(out).toContain('value="m"');
    expect(out).not.toContain("__wcRadio_");
  });
});

describe("form-segmented：胶囊容器即缩放内层", () => {
  const segItems = { items: [{ label: "列表", value: "list" }, { label: "卡片", value: "card" }] };

  test("内层同时带 -in 与 -grp 类，且有 id/role（脚本与禁用态规则都能取到）", () => {
    const out = render("form-segmented", segItems);
    const m = out.match(/<div([^>]*id="(seg-[a-z0-9]+)-grp"[^>]*)>/);
    expect(m, "缺少 id 为 *-grp 的内层").toBeTruthy();
    const attrs = m![1];
    expect(attrs).toContain('role="radiogroup"');
    expect(attrs).toContain(`${m![2]}-in`);
    expect(attrs).toContain(`${m![2]}-grp`);
    // 禁用态规则按类名生效（曾只写 id 导致 .X-grp 规则失效）
    expect(out).toContain(`.${m![2]}-grp{opacity:`);
  });

  test("接口模式：不渲染静态段，暴露可重入的 setItems 钩子", () => {
    const out = render("form-segmented", {
      ...segItems, dataMode: "api", apiUrl: "https://x/seg", apiValueField: "code", apiLabelField: "title",
    });
    expect(out).not.toContain('data-value="list"');
    expect(out).toContain("__wcSeg_");
    expect(out).toContain("setItems");
    // 重建后要重新绑定（旧实现把 NodeList 静态绑定，重建即失去点击）
    expect(out).toContain("function bind()");
    expect(out).toContain("grp.innerHTML=segmentsHTML(");
    expect(out).toContain('"code"');
    expect(out).toContain('"title"');
    expect(out).toContain("var authEnabled = null");
  });

  test("静态模式：不引入取数脚本与 setItems 钩子", () => {
    const out = render("form-segmented", segItems);
    expect(out).toContain('data-value="list"');
    expect(out).not.toContain("__wcSeg_");
    expect(out).not.toContain("var authEnabled");
  });

  test("面板具备动态数据入口，且接口模式下隐藏静态段编辑器", () => {
    const schema = componentRegistry.get("form-segmented")?.configSchema ?? [];
    const keys = schema.map((f) => f.key);
    for (const k of ["dataSourceId", "dataMode", "apiUrl", "authEnabled", "apiValueField", "apiLabelField"]) {
      expect(keys).toContain(k);
    }
    const f = schema.find((x) => x.key === "items");
    expect(f?.hidden?.({ dataMode: "api" })).toBe(true);
    expect(f?.hidden?.({ dataMode: "static" })).toBe(false);
  });
});

describe("表单组动态数据面板\n", () => {
  test("form-radio 具备全局数据源绑定 + 接口字段映射入口", () => {
    const keys = (componentRegistry.get("form-radio")?.configSchema ?? []).map((f) => f.key);
    for (const k of ["dataSourceId", "dataMode", "apiUrl", "apiPath", "apiMethod", "apiDataPath",
      "apiHeaders", "apiBody", "apiInterval", "authEnabled", "apiValueField", "apiLabelField"]) {
      expect(keys).toContain(k);
    }
  });

  test("接口模式下隐藏静态条目编辑器（避免两个互相打架的数据入口）", () => {
    const f = (componentRegistry.get("form-radio")?.configSchema ?? []).find((x) => x.key === "items");
    expect(f?.hidden?.({ dataMode: "api" })).toBe(true);
    expect(f?.hidden?.({ dataMode: "static" })).toBe(false);
    expect(f?.hidden?.({})).toBe(false);
  });
});

/**
 * 「舞台摆放两端同源」契约锁 —— 本轮修掉的真分叉。
 *
 * 缺陷：`STAGE_ALIGN_DEFAULT` 收口后，**只有发布端**读了它；编辑区渲染器仍各自写
 * `config.align ?? "left"`。于是配置里没有 `align` 键时（老场景 / 面板值被清空），
 * 画布靠左、发布端居中 —— 同一份数据两种观感，正是用户点名的
 *「发布和预览的效果和编辑模型相同」被破坏。
 *
 * 为什么这里只能靠源码守卫：jsdom 不实现 CSS 级联，MUI `sx` 产出的 emotion 类规则
 * 在单测里读不到最终 `justify-content`；行为侧唯一的真值来自真实浏览器
 * （`src/__measure__` 真值页 + headless Chrome），本用例负责在"两端取值入口"这一层
 * 把分叉钉死，浏览器探针负责确认最终几何。
 */
describe("舞台摆放：编辑区与发布端同源（防再次分叉）", () => {
  test("stageAlignOf/stageVAlignOf：缺省给默认值，显式值原样透传", () => {
    expect(stageAlignOf({})).toBe(STAGE_ALIGN_DEFAULT);
    expect(stageVAlignOf({})).toBe(STAGE_VALIGN_DEFAULT);
    expect(stageAlignOf({ align: "right" })).toBe("right");
    expect(stageAlignOf({ align: "left" })).toBe("left");
    expect(stageVAlignOf({ vAlign: "bottom" })).toBe("bottom");
    // 显式空串不回退到默认（历史行为不静默改变），最终由 alignToFlex 兜底
    expect(stageAlignOf({ align: "" })).toBe("");
    expect(alignToFlex(stageAlignOf({ align: "" }))).toBe(alignToFlex(""));
  });

  test("发布端未配置 align/vAlign 时，舞台 == 默认摆放（居中）", () => {
    for (const [type, cfg, refW, refH] of FIT_CASES) {
      const out = render(type, cfg, refW, refH);
      const st = stage(out);
      expect(st["justify-content"], `${type} 未配置 align 时未居中`).toBe(alignToFlex(STAGE_ALIGN_DEFAULT));
      expect(st["align-items"], `${type} 未配置 vAlign 时未居中`).toBe(vAlignToFlex(STAGE_VALIGN_DEFAULT));
    }
  });

  /**
   * 同一份配置，`scaleFit` 开与关的舞台摆放必须逐字相同。
   * 历史缺陷：scaleFit 开走 `toAlign()`（未知值→center）、关走 `alignToFlex()`（未知值→flex-start），
   * 于是**只切一个开关内容就跳位**。
   */
  test("scaleFit 开/关两条产物的舞台摆放逐字一致", () => {
    for (const [type, cfg, refW, refH] of FIT_CASES) {
      for (const align of [undefined, "left", "center", "right", ""]) {
        const conf = align === undefined ? cfg : { ...cfg, align };
        const on = stage(render(type, { ...conf, scaleFit: true }, refW, refH));
        const off = stage(render(type, { ...conf, scaleFit: false }, refW, refH));
        expect(on["justify-content"], `${type} align=${String(align)} 开关两侧不一致`).toBe(off["justify-content"]);
        expect(on["align-items"]).toBe(off["align-items"]);
      }
    }
  });

  /**
   * 源码守卫：凡发布端用 `stageAlignOf` 取摆放的组件，其编辑区渲染器也必须走同一入口。
   * 白名单式穷举——新增组件若忘接入，本用例不会自动发现；但**已接入组件的回退值再被
   * 写回字面量**（正是本次的回归路径）一定会失败。
   */
  const PAIRS: Array<[string, string]> = [
    ["form-switch", "FormSwitchRenderer.tsx"],
    ["form-checkbox", "FormCheckboxRenderer.tsx"],
    ["form-radio", "FormRadioRenderer.tsx"],
    ["form-button", "FormButtonRenderer.tsx"],
    ["form-segmented", "SegmentedRenderer.tsx"],
    ["form-rate", "RateRenderer.tsx"],
  ];

  test.each(PAIRS)("%s：编辑区渲染器与发布端共用拍摆放取值入口", (type, file) => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../editor/renderers", file), "utf8");
    expect(src, `${file} 未使用 stageAlignOf`).toContain("stageAlignOf(");
    expect(src, `${file} 未使用 stageVAlignOf`).toContain("stageVAlignOf(");
    // 渲染器里不得再出现硬编码的摆放回退字面量
    expect(src, `${file} 仍有硬编码 align 回退`).not.toMatch(/align\s*\?\?\s*["'](left|center|right)["']/);
    expect(src, `${file} 仍有硬编码 vAlign 回退`).not.toMatch(/vAlign\s*\?\?\s*["'](top|center|bottom)["']/);
    // 发布端同组件同样走该入口（两端同源，而不是"两边恰好都是 center"）
    const out = render(type, { text: "x", label: "x" });
    expect(out, `${type} 的 codegen 未走 stageAlignOf`).toMatch(/justify-content/);
  });
});
