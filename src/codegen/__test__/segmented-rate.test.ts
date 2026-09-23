import { describe, test, expect, beforeAll } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import { fitFactor, RATE_FIT, SEGMENTED_FIT } from "../../editor/data/scaleFit";
import {
  rateTextCore,
  rateTextOf,
  rateSubmitValue,
  RATE_ICON_OPTIONS,
  RATE_SIZE_OPTIONS,
} from "../../editor/data/rateStyle";
import { componentRegistry } from "../../editor/registry";
import { registerFormComponents } from "../../editor/registerFormComponents";
import fs from "node:fs";
import path from "node:path";

initBuiltinCodegens();
beforeAll(() => registerFormComponents());

const ctx = { pageScripts: [] } as never;

function comp(type: string, config: Record<string, unknown>, size = { width: 320, height: 44 }): SceneComponent {
  return {
    id: "x1",
    type,
    name: type,
    transform: createDefaultTransform({ x: 0, y: 0, ...size }),
    layerId: "l1",
    zIndex: 0,
    locked: false,
    visible: true,
    config,
    children: [],
    parentId: null,
  };
}

const renderSeg = (config: Record<string, unknown>) => getCodegen("form-segmented")!(comp("form-segmented", config), ctx);
const renderRate = (config: Record<string, unknown>) => getCodegen("form-rate")!(comp("form-rate", config, { width: 220, height: 40 }), ctx);

const hiddenInput = (out: string) => (out.match(/<input type="hidden"[^>]*>/) || [])[0] || "";

describe("form-segmented codegen：表单提交接入", () => {
  test("输出隐藏 input 承载选中值（旧实现完全漏掉该字段）", () => {
    const inp = hiddenInput(renderSeg({ items: [{ label: "列表", value: "list" }], value: "list" }));
    expect(inp).toContain('type="hidden"');
    expect(inp).toContain('value="list"');
  });

  test("字段名：fieldName > 标签清洗 > segmented", () => {
    expect(hiddenInput(renderSeg({ fieldName: "viewMode" }))).toContain('name="viewMode"');
    expect(hiddenInput(renderSeg({ label: "视图 模式" }))).toContain('name="视图_模式"');
    expect(hiddenInput(renderSeg({}))).toContain('name="segmented"');
  });

  test("选中值不在选项内时回退首项（不会提交一个不存在的值）", () => {
    const out = renderSeg({ items: [{ label: "A", value: "a" }, { label: "B", value: "b" }], value: "zzz" });
    expect(hiddenInput(out)).toContain('value="a"');
  });

  test("选项解析复用统一解析器：旧 options 文本自动兼容", () => {
    const out = renderSeg({ options: "列表|list\n卡片|card", value: "card" });
    expect(out).toContain("列表");
    expect(out).toContain("卡片");
    expect(hiddenInput(out)).toContain('value="card"');
  });

  test("状态属性由类规则承载，绝不写 inline（避免压死状态规则）", () => {
    const out = renderSeg({ items: [{ label: "A", value: "a" }], value: "a" });
    // 选中态：段元素带 seg-on 类
    expect(out).toMatch(/class="seg-[a-z0-9]+-seg seg-on"/);
    // 段元素的 inline style 不得含 background/color/font-weight
    const segTag = (out.match(/<div class="seg-[a-z0-9]+-seg[^"]*"[^>]*style="([^"]*)"/) || [])[1] || "";
    expect(segTag).not.toContain("background");
    expect(segTag).not.toContain("color");
    expect(segTag).not.toContain("font-weight");
    // 状态色只出现在样式表里
    expect(out).toMatch(/\.seg-[a-z0-9]+-seg\.seg-on\{background:.*color:/);
  });

  test("圆角与表单族同口径（面板值 × 主题 shape.borderRadius=10，内层再内缩 2）", () => {
    const out = renderSeg({ borderRadius: 8 });
    expect(out).toContain("border-radius:80px");
    expect(out).toContain("border-radius:78px");
  });

  test("对齐：胶囊在拖动框内的水平位置可配", () => {
    expect(renderSeg({ align: "center" })).toContain("justify-content:center");
    expect(renderSeg({ align: "right" })).toContain("justify-content:flex-end");
    expect(renderSeg({})).toContain("justify-content:flex-start");
  });

  test("撑满/块级时各段等分", () => {
    expect(renderSeg({ fullWidth: true })).toContain("flex:1 1 0");
    expect(renderSeg({ block: true })).toContain("flex:1 1 0");
    expect(renderSeg({})).not.toContain("flex:1 1 0");
  });

  test("必填时挂校验容器与运行时；未设必填时不产生空规则容器", () => {
    const req = renderSeg({ required: true, items: [{ label: "A", value: "a" }] });
    expect(req).toContain(" data-vrules='");
    expect(req).toContain('class="fc-err"');
    expect(req).toContain("__WCVALIDATE");
    const plain = renderSeg({ items: [{ label: "A", value: "a" }] });
    expect(plain).not.toContain("data-vrules");
    expect(plain).not.toContain("__WCVALIDATE");
  });

  test("键盘：radiogroup + 方向键切换（可访问性）", () => {
    const out = renderSeg({ items: [{ label: "A", value: "a" }, { label: "B", value: "b" }] });
    expect(out).toContain('role="radiogroup"');
    expect(out).toContain('role="radio"');
    expect(out).toContain("ArrowRight");
    expect(out).toContain("aria-checked");
  });

  test("div 开闭平衡（含帮助文字/校验元素叠置）", () => {
    for (const cfg of [
      { items: [{ label: "A", value: "a" }] },
      { items: [{ label: "A", value: "a" }], required: true, helperText: "提示" },
      { options: "列表|list\n卡片|card", fullWidth: true, showIcon: true },
    ]) {
      const body = renderSeg(cfg)
        .replace(/<script[\s\S]*?<\/script>/g, "")
        .replace(/<style[\s\S]*?<\/style>/g, "");
      const opens = (body.match(/<div\b/g) ?? []).length;
      const closes = (body.match(/<\/div>/g) ?? []).length;
      expect(opens).toBe(closes);
      expect(opens).toBeGreaterThan(0);
    }
  });
});

describe("form-rate codegen：表单提交接入与缩放", () => {
  test("输出隐藏 input 承载分值（评分结果提交不出去曾是该控件最核心的缺陷）", () => {
    const inp = hiddenInput(renderRate({ value: 4 }));
    expect(inp).toContain('type="hidden"');
    expect(inp).toContain('value="4"');
  });

  test("字段名：fieldName > 标签清洗 > rating", () => {
    expect(hiddenInput(renderRate({ fieldName: "score" }))).toContain('name="score"');
    expect(hiddenInput(renderRate({ label: "满意度" }))).toContain('name="满意度"');
    expect(hiddenInput(renderRate({}))).toContain('name="rating"');
  });

  test("星状态由类规则承载，绝不写 inline display/clip-path", () => {
    const out = renderRate({ value: 3 });
    expect(out).toMatch(/class="rate-[a-z0-9]+-star rate-on"/);
    expect(out).toContain(".rate-on .rate-");
    // 顶层激活 svg 的 inline style 不含 display/clip-path（由类切换）
    const fillSvg = (out.match(/<svg class="rate-[a-z0-9]+-fill"[^>]*>/) || [])[0] || "";
    expect(fillSvg).not.toContain("display");
    expect(fillSvg).not.toContain("clip-path");
    // 类规则里两种激活形态齐备
    expect(out).toMatch(/\.rate-[a-z0-9]+-star\.rate-on \.rate-[a-z0-9]+-fill\{display:block;clip-path:none\}/);
    expect(out).toMatch(/\.rate-[a-z0-9]+-star\.rate-half \.rate-[a-z0-9]+-fill\{display:block;clip-path:inset\(0 50% 0 0\)\}/);
  });

  test("发出缩放舞台与缩放脚本（与编辑区 fitFactor 同公式同基准）", () => {
    const out = renderRate({});
    expect(out).toMatch(/class="rate-[a-z0-9]+-st"/);
    expect(out).toMatch(/class="rate-[a-z0-9]+-in"/);
    expect(out).toContain(`var RW=${RATE_FIT.refW},RH=${RATE_FIT.refH},MIN=${RATE_FIT.min},MAX=${RATE_FIT.max}`);
    expect(out).toContain("ResizeObserver");
  });

  test("星数量/图标/半星/文字随配置下发", () => {
    const out = renderRate({ max: 3, icon: "heart", allowHalf: true, showText: true, value: 2.5 });
    expect((out.match(/role="radio"/g) ?? []).length).toBe(3);
    expect(out).toContain("M12 21.35l-1.45-1.32");   // heart path
    expect(out).toContain("clip-path:inset(0 50% 0 0)"); // 半星类规则
    expect(out).toContain("2.5 分");
  });

  test("禁用时交互分支整体短路（if(!true) 包裹，运行时零绑定）", () => {
    const out = renderRate({ disabled: true });
    expect(out).toContain("if(!true){");
    // 只读态：光标由类规则给出；整体透明度由**缩放内层**的 opacity 声明给出
    // （不再另写 `.X-in{opacity}` 类规则 —— 与不透明度面板值同属性两处来源会互相压死）
    expect(out).toMatch(/\.rate-[a-z0-9]+-star\{cursor:default\}/);
    expect(out).toMatch(/class="rate-[a-z0-9]+-in" style="[^"]*opacity:0\.5/);
    expect(out).not.toMatch(/\.rate-[a-z0-9]+-in\{opacity:/);
    // 未禁用时分支可执行
    expect(renderRate({})).toContain("if(!false){");
  });

  test("矩形一：div 开闭平衡", () => {
    for (const cfg of [{}, { max: 10, showText: true, required: true, helperText: "请打分" }]) {
      const body = renderRate(cfg)
        .replace(/<script[\s\S]*?<\/script>/g, "")
        .replace(/<style[\s\S]*?<\/style>/g, "");
      const opens = (body.match(/<div\b/g) ?? []).length;
      const closes = (body.match(/<\/div>/g) ?? []).length;
      expect(opens).toBe(closes);
      expect(opens).toBeGreaterThan(0);
    }
  });
});

describe("scaleFit：缩放口径（两端唯一实现）", () => {
  test("设计基准尺寸下 factor = 1", () => {
    expect(fitFactor(RATE_FIT.refW, RATE_FIT.refH, RATE_FIT)).toBe(1);
  });

  test("取宽高较小比例（等比，不拉伸）", () => {
    // 2 倍基准（440×80）→ 恰好 2
    expect(fitFactor(RATE_FIT.refW * 2, RATE_FIT.refH * 2, RATE_FIT)).toBeCloseTo(2);
    // 宽 1000 但高只有 2 倍 → 仍以高为准（居小不居大）
    expect(fitFactor(1000, RATE_FIT.refH * 2, RATE_FIT)).toBeCloseTo(2);
    // 宽很大但高不足 → 以高为准
    expect(fitFactor(1000, RATE_FIT.refH / 2, RATE_FIT)).toBeCloseTo(0.5);
  });

  test("夹在下限/上限之间（极端尺寸不致内容消失或糊掉）", () => {
    expect(fitFactor(1, 1, RATE_FIT)).toBe(RATE_FIT.min);
    expect(fitFactor(100000, 100000, RATE_FIT)).toBe(RATE_FIT.max);
  });

  test("尺寸未测得（0/NaN/负）时按自然尺寸 factor=1", () => {
    expect(fitFactor(0, 30, RATE_FIT)).toBe(1);
    expect(fitFactor(RATE_FIT.refW, 0, RATE_FIT)).toBe(1);
    expect(fitFactor(NaN, 30, RATE_FIT)).toBe(1);
    expect(fitFactor(-5, 30, RATE_FIT)).toBe(1);
  });
});

/**
 * form-rate：取值口径唯一 + 面板三件套 + 外观层。
 *
 * 回归背景（本轮 #9）：改造前图标路径表 / 尺寸档位表 / 分值文案表
 * 在渲染器与 codegen 里**各写了一份**（靠注释维持一致），且面板没有 `scaleFit` / `vAlign`。
 */
describe("form-rate：取值口径唯一 + 外观层", () => {
  const readSrc = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), "utf8");

  test("三张表只此一份（两端不得各自复制）", () => {
    const pairs: Array<[string, string]> = [
      ["RateRenderer.tsx", "../../editor/renderers/RateRenderer.tsx"],
      ["rate.ts", "../components/rate.ts"],
    ];
    for (const [name, rel] of pairs) {
      const src = readSrc(rel);
      expect(src, `${name} 仍自带图标路径表`).not.toMatch(/M12 2l2\.95 6\.26/);
      expect(src, `${name} 仍自带尺寸档位表`).not.toMatch(/small:\s*16,\s*medium:\s*22/);
      expect(src, `${name} 仍自带分值文案表`).not.toMatch(/1:\s*"很差"/);
      // 两端都必须从唯一口径取值
      expect(src, `${name} 未读唯一口径`).toContain("rateStyle");
    }
  });

  test("外观层挂缩放内层：底色/内边距/圆角/不透明度随内容被缩放", () => {
    const out = renderRate({ bgColor: "#ffeeaa", paddingX: 10, paddingY: 4, borderRadius: 2, opacity: 0.8 });
    const inner = (out.match(/class="rate-[a-z0-9]+-in" style="([^"]*)"/) || [])[1] || "";
    expect(inner).toContain("background-color:#ffeeaa");
    expect(inner).toContain("padding-left:10px");
    expect(inner).toContain("padding-top:4px");
    // 表单族圆角口径：面板档位 × SHAPE_RADIUS(10)
    expect(inner).toContain("border-radius:20px");
    expect(inner).toContain("opacity:0.8");
  });

  test("默认态零回归：未配置外观时不输出底色/圆角/不透明度", () => {
    const inner = (renderRate({}).match(/class="rate-[a-z0-9]+-in" style="([^"]*)"/) || [])[1] || "";
    expect(inner).not.toContain("background-color");
    expect(inner).not.toContain("border-radius");
    expect(inner).not.toContain("opacity");
    expect(inner).toContain("gap:4px");
  });

  test("只读态：不透明度与面板值相乘，且不另写同类类规则", () => {
    const out = renderRate({ disabled: true, opacity: 0.8 });
    const inner = (out.match(/class="rate-[a-z0-9]+-in" style="([^"]*)"/) || [])[1] || "";
    expect(inner).toContain("opacity:0.4");
    expect(out).not.toMatch(/\.rate-[a-z0-9]+-in\{opacity:/);
  });
});

/**
 * form-segmented 第 26 轮优化回归锁：
 * P1-1 取值归一（两端一致）/ P2-3 口径收口 / P2-5 全宽不缩放 / P3 gap 兜底 / P3 aria。
 */
describe("form-segmented：取值归一 / 收口 / 全宽 / 兜底", () => {
  const readSrc = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), "utf8");
  /** 带 seg-on 的段元素计数（精确匹配元素 class，避开 CSS/脚本里的 seg-on 字面量） */
  const onSegs = (out: string) => (out.match(/class="seg-[a-z0-9]+-seg seg-on"/g) || []).length;

  test("P1-1：value 为空 / 不存在时命中首项并高亮（不再『无高亮却提交首项』）", () => {
    const items = [{ label: "A", value: "a" }, { label: "B", value: "b" }];
    for (const cfg of [{ items, value: "" }, { items, value: "zzz" }, { items }]) {
      const out = renderSeg(cfg as Record<string, unknown>);
      expect(onSegs(out), `value=${String((cfg as Record<string, unknown>).value)}`).toBe(1);
      expect(hiddenInput(out)).toContain('value="a"');
    }
  });

  test("P1-1：value 命中某项时该项高亮并提交该项", () => {
    const out = renderSeg({ items: [{ label: "A", value: "a" }, { label: "B", value: "b" }], value: "b" });
    expect(out).toMatch(/class="seg-[a-z0-9]+-seg seg-on"[^>]*data-value="b"/);
    expect(hiddenInput(out)).toContain('value="b"');
  });

  test("P2-3：兜底段 / 尺寸表只在 segmentedStyle 一份（两端不得各自复制）", () => {
    for (const rel of ["../../editor/renderers/SegmentedRenderer.tsx", "../components/segmented.ts"]) {
      const src = readSrc(rel);
      expect(src, `${rel} 仍自带兜底段`).not.toMatch(/label:\s*"选项一"/);
      expect(src, `${rel} 仍自带尺寸表`).not.toMatch(/small:\s*\{\s*height:\s*28/);
      expect(src, `${rel} 未读唯一口径`).toContain("segmentedStyle");
    }
  });

  test("P2-5：宽度撑满时不叠加等比缩放（避免双重尺寸溢出）", () => {
    const full = renderSeg({ fullWidth: true });
    expect(full).not.toContain("var RW=");
    const norm = renderSeg({});
    expect(norm).toContain(`var RW=${SEGMENTED_FIT.refW}`);
  });

  test("P3：间距 gap 合法 0 保留、空/非法回落 4", () => {
    expect(renderSeg({ gap: 0 })).toContain("padding:0px;gap:0px");
    expect(renderSeg({ gap: "" })).toContain("padding:4px;gap:4px");
    expect(renderSeg({ gap: "abc" })).toContain("padding:4px;gap:4px");
  });

  test("P3：radiogroup 带 aria-label、段带 aria-disabled", () => {
    const on = renderSeg({ fieldName: "viewMode", items: [{ label: "A", value: "a" }] });
    expect(on).toContain('aria-label="viewMode"');
    expect(on).toContain('aria-disabled="false"');
    const off = renderSeg({ disabled: true, items: [{ label: "A", value: "a" }] });
    expect(off).toContain('aria-disabled="true"');
  });

  test("P2-2/P2-6/P2-7：面板 value 动态下拉 / 暴露 labelPlacement / 移除 block", () => {
    const schema = componentRegistry.get("form-segmented")?.configSchema ?? [];
    const valueField = schema.find((f) => f.key === "value");
    expect(valueField?.type).toBe("select");
    expect(typeof valueField?.dynamicOptions).toBe("function");
    const opts = valueField!.dynamicOptions!({ items: [{ label: "列表", value: "list" }, { label: "卡片", value: "card" }] });
    expect(opts?.map((o) => o.value)).toEqual(["list", "card"]);
    expect(schema.some((f) => f.key === "labelPlacement")).toBe(true);
    expect(schema.some((f) => f.key === "block")).toBe(false);
  });

  test("P2-1：编辑区渲染器具备预览态键控（与发布端同键位）", () => {
    const src = readSrc("../../editor/renderers/SegmentedRenderer.tsx");
    expect(src).toContain("onKeyDown");
    expect(src).toContain("ArrowRight");
    expect(src).toContain("Home");
  });
});

/**
 * form-rate 第 27 轮优化回归锁：
 * P0-1 分值夹取 / P0-2 0 分提交语义 / P0-3 半星点击 / P1-1 键盘可达 /
 * P2-1 标签位置 / P2-2 文字色显隐 / P2-3 面板读口径 / P2-4 画布白名单 / P2-5 错误态环 / P3 自包含内联。
 */
describe("form-rate：夹取 / 提交语义 / 半星 / 键盘 / 面板", () => {
  const readSrc = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), "utf8");
  const onStars = (out: string) => (out.match(/class="rate-[a-z0-9]+-star rate-on"/g) || []).length;
  const starText = (out: string) => (out.match(/class="rate-[a-z0-9]+-text"[^>]*>([^<]*)</) || [])[1] || "";

  test("P0-1：分值夹取到 [0, max]（不再『全亮 5 颗却写 8 分、提交 8』）", () => {
    const over = renderRate({ value: 8, max: 5, showText: true });
    expect(onStars(over)).toBe(5);
    expect(hiddenInput(over)).toContain('value="5"');
    expect(starText(over)).toBe("很满意");
    expect(over).not.toContain("8 分");
    const over3 = renderRate({ value: 4, max: 3 });
    expect(onStars(over3)).toBe(3);
    expect(hiddenInput(over3)).toContain('value="3"');
    // 合法 0 与非整数不能被夹掉
    expect(hiddenInput(renderRate({ value: 0 }))).toContain('value=""');
    expect(hiddenInput(renderRate({ value: 2.5, allowHalf: true, max: 5 }))).toContain('value="2.5"');
  });

  test("P0-2：0 分 = 未评分 → 隐藏域交空串（必填才拦得住）", () => {
    const out = renderRate({ required: true, value: 0 });
    expect(out).toContain("data-vrules");
    expect(hiddenInput(out)).toContain('value=""');
    expect(hiddenInput(renderRate({ required: true, value: 3 }))).toContain('value="3"');
    // 运行时写值也走同一口径（不是脚本里另写一遍 String(cur)）
    expect(out).toContain("submitOf=");
    expect(out).toContain("inp.value=submitOf(cur)");
  });

  test("P0-2：提交值口径本身（0 → 空串，其余原样）", () => {
    expect(rateSubmitValue(0)).toBe("");
    expect(rateSubmitValue(3)).toBe("3");
    expect(rateSubmitValue(2.5)).toBe("2.5");
  });

  test("P0-3：点击按鼠标横坐标取半（hover 预告值不再被跳掉）", () => {
    const out = renderRate({ allowHalf: true });
    expect(out).toContain("function isHalf(el,e)");
    expect(out).toContain("cur=isHalf(el,e)?sv-0.5:sv");
    // 编辑区渲染器同判定
    const src = readSrc("../../editor/renderers/RateRenderer.tsx");
    expect(src).toContain("e.clientX - rect.left < rect.width / 2");
    expect(src).toContain("isHalf ? starValue - 0.5 : starValue");
  });

  test("P1-1：组可聚焦 + radiogroup + aria-label（键盘不再挂在不可聚焦容器上）", () => {
    const out = renderRate({ label: "满意度" });
    expect(out).toMatch(/<div role="radiogroup" aria-label="满意度"[^>]*class="rate-[a-z0-9]+-in"/);
    expect(out).toContain('tabindex="0"');
    expect(out).toContain("box.addEventListener('keydown'");
    const off = renderRate({ disabled: true });
    expect(off).toContain('tabindex="-1"');
    expect(off).toContain('aria-disabled="true"');
    expect(renderRate({})).toContain('aria-disabled="false"');
  });

  test("P1-1：编辑区渲染器预览态同键位 + 同无障碍属性", () => {
    const src = readSrc("../../editor/renderers/RateRenderer.tsx");
    expect(src).toContain("onKeyDown");
    expect(src).toContain("ArrowRight");
    expect(src).toContain("ArrowLeft");
    expect(src).toContain('role="radiogroup"');
    expect(src).toContain("aria-label={ariaLabel}");
    expect(src).toContain("tabIndex={isEdit || r.disabled ? -1 : 0}");
  });

  test("P2-1：面板暴露 labelPlacement，标签真的能显示", () => {
    const schema = componentRegistry.get("form-rate")?.configSchema ?? [];
    expect(schema.some((f) => f.key === "labelPlacement")).toBe(true);
    const top = renderRate({ label: "满意度", labelPlacement: "top" });
    expect(top).toContain("<label");
    expect(top).toContain("满意度");
    // 默认「无」时不渲染任何标签元素（旧实现面板改不动 → 标签恒不显示）
    expect(renderRate({ label: "满意度", labelPlacement: "none" })).not.toContain("<label");
  });

  test("P2-2：文字字号/颜色与「显示文字」联动显隐", () => {
    const schema = componentRegistry.get("form-rate")?.configSchema ?? [];
    for (const key of ["fontSize", "textColor"]) {
      const f = schema.find((x) => x.key === key);
      expect(typeof f?.hidden, `${key} 未联动 showText`).toBe("function");
      expect(f!.hidden!({ showText: false })).toBe(true);
      expect(f!.hidden!({ showText: true })).toBe(false);
    }
  });

  test("P2-3：面板图标/尺寸下拉读口径层（不另写字面量）", () => {
    const schema = componentRegistry.get("form-rate")?.configSchema ?? [];
    expect(schema.find((f) => f.key === "icon")?.options).toEqual(RATE_ICON_OPTIONS);
    expect(schema.find((f) => f.key === "size")?.options).toEqual(RATE_SIZE_OPTIONS);
  });

  test("P2-4：画布 overflow 白名单含 form-rate（星条超框不再被裁）", () => {
    const src = readSrc("../../editor/canvas/EditorCanvasComponent.tsx");
    const list = (src.match(/overflow:\s*\[([\s\S]*?)\]\.includes/) || [])[1] || "";
    expect(list).toContain('"form-rate"');
  });

  test("P2-5：无边框控件的错误态补 inset 环（与发布端 __WCVALIDATE 同公式）", () => {
    const src = readSrc("../../editor/renderers/fieldShell.tsx");
    expect(src).toContain("inset 0 0 0 ${s.borderWidth}px ${s.errorColor}");
  });

  test("P3：文案规则自包含 —— 脱离模块求值后与 rateTextOf 逐项一致", () => {
    const standalone = new Function("return " + rateTextCore.toString())() as (
      map: Record<number, string>,
      half: boolean,
      value: number,
    ) => string;
    const map = { 1: "很差", 2: "不满意", 3: "一般", 4: "满意", 5: "很满意" };
    const cases: Array<[number, boolean]> = [[0, false], [1, false], [2.5, true], [2.5, false], [5, false], [7, false], [3, true]];
    for (const [v, half] of cases) {
      expect(standalone(map, half, v), `v=${v} half=${half}`).toBe(rateTextOf(v, half));
    }
    // 发布端脚本内联的确实是这一份
    const out = renderRate({ value: 3, showText: true });
    expect(out).toContain("textOf=");
    expect(out).toContain("txt.textContent=textOf(textMap,allowHalf,d)");
  });

  test("P3：内联安全不变量 —— 函数源码不得含反引号 / ${（否则会破坏外层模板串）", () => {
    for (const [name, src] of [
      ["rateTextCore", rateTextCore.toString()],
      ["rateSubmitValue", rateSubmitValue.toString()],
    ] as const) {
      expect(src, `${name} 含反引号，无法安全内联`).not.toContain("`");
      expect(src, `${name} 含 \${ 插值，无法安全内联`).not.toContain("${");
      // 压缩后仍必须是可直接求值的独立源码（vitest 未压缩，这里锁住"不依赖模块作用域"）
      expect(() => new Function("return " + src)).not.toThrow();
    }
  });

  test("P3：图标路径回归 —— 点赞用官方 thumb_up 袖口", () => {
    const out = renderRate({ max: 3, icon: "like", allowHalf: true, value: 2.5, showText: true });
    expect(out).toContain("M1 21h4V9H1v6z");
    expect(out).toContain("2.5 分");
    expect((out.match(/role="radio"/g) ?? []).length).toBe(3);
  });
});
