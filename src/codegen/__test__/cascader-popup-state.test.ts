/**
 * 级联弹出框「选项行四态」回归锁（第 32 轮）。
 *
 * 锁的是什么：
 * 1. **三态必须互相可区分** —— 旧实现把「悬浮 / 已选 / 键盘光标」写成同一种满 accent + 白字，
 *    导致鼠标划过时整列像跑马灯，且分不清「这是我选的值」还是「鼠标正好压在这」。
 *    更硬的问题：浅色 accent（如 #ffc107）上的白字对比度只有 1.6:1。这里把三态拆开并钉死。
 * 2. **状态属性只能由类规则给** —— 与 `state-rule-inline-conflict.test.ts` 同一条铁律：
 *    `.cas-item` 基础规则里不许出现 `background`，悬浮态才有干净的落点。
 * 3. **空态不许是幽灵空框** —— 旧实现 0 列时渲染约 2px 空 panel（编辑区却是 140px 幽灵条，两端还不一致）。
 * 4. **两端机制同源** —— 编辑区渲染器必须用同一套类名（cas-active / cas-cursor）与同一份颜色口径。
 */
import { describe, test, expect } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import fs from "node:fs";
import path from "node:path";

initBuiltinCodegens();

const TREE = JSON.stringify([
  { label: "浙江", value: "zj", children: [{ label: "杭州", value: "hz", children: [{ label: "西湖区", value: "xh" }] }] },
  { label: "江苏", value: "js" },
]);

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

const ctx = { pageScripts: [] } as never;
const render = (config: Record<string, unknown>): string => getCodegen("form-cascader")!(casComp(config), ctx);

const BASE = { label: "地区", options: TREE, accentColor: "#1976d2" };

/** 取某条规则体（`selector{...}` 的大括号内容），找不到返回空串 */
function ruleBody(css: string, selector: string): string {
  const i = css.indexOf(selector + "{");
  if (i < 0) return "";
  const j = css.indexOf("}", i);
  return j < 0 ? "" : css.slice(i + selector.length + 1, j);
}

describe("发布端：三态可区分（不再是一种满色高亮）", () => {
  const out = render(BASE);

  test("悬浮 = 浅色底（不再铺满 accent）", () => {
    expect(out).toContain(".cas-item:hover{background:rgba(25, 118, 210, 0.1)}");
  });

  test("键盘光标 = 浅色底 + 内侧焦点环（可目视定位，且与悬浮不同）", () => {
    expect(out).toContain(
      ".cas-item.cas-cursor{background:rgba(25, 118, 210, 0.12);outline:2px solid #1976d2;outline-offset:-2px}",
    );
  });

  test("已选 = 满 accent 底 + 口径取出的可读前景色 + 加粗", () => {
    expect(out).toContain(".cas-item.cas-active{background:#1976d2;color:#ffffff;font-weight:500}");
  });

  test("已选同时是光标：底色不动，环色 = 该行前景色（contrastTextOn），保证与底色可区分", () => {
    // 默认蓝 accent：白字达标 → 环也是白（与文字同色，读起来是一体的焦点指示）
    expect(out).toContain(".cas-item.cas-active.cas-cursor{outline:2px solid #ffffff;outline-offset:-2px}");
    // 浅色 accent：翻深色 → 环也是深色
    const light = render({ ...BASE, accentColor: "#ffc107" });
    expect(light).toContain(".cas-item.cas-active.cas-cursor{outline:2px solid rgba(0,0,0,.87);outline-offset:-2px}");
  });

  test("三态底色两两不同（旧实现三者同为 accent）", () => {
    const hover = ruleBody(out, ".cas-item:hover");
    const cursor = ruleBody(out, ".cas-item.cas-cursor");
    const active = ruleBody(out, ".cas-item.cas-active");
    const bg = (b: string) => (b.match(/background:([^;]+)/) || [])[1] || "";
    expect(bg(hover)).toBeTruthy();
    expect(bg(cursor)).toBeTruthy();
    expect(bg(active)).toBeTruthy();
    expect(new Set([bg(hover), bg(cursor), bg(active)]).size).toBe(3);
  });

  test("基础规则里不出现 background（状态属性只能由类规则给，否则悬浮被压死）", () => {
    const base = ruleBody(out, ".cas-item");
    expect(base).toBeTruthy();
    expect(base).not.toContain("background");
    expect(base).toContain("color:#333333");
  });

  test("浅色 accent 必须翻深色前景：白字只有 1.6:1，不能用", () => {
    const light = render({ ...BASE, accentColor: "#ffc107" });
    expect(light).toContain(".cas-item.cas-active{background:#ffc107;color:rgba(0,0,0,.87);font-weight:500}");
    expect(light).not.toContain(".cas-item.cas-active{background:#ffc107;color:#ffffff");
  });

  test("已选带对勾（不能只靠颜色区分，色觉障碍下要有形状线索）", () => {
    expect(out).toContain(".cas-item .cas-chk{display:flex;flex-shrink:0;width:14px;opacity:0}");
    expect(out).toContain(".cas-item.cas-active .cas-chk{opacity:1}");
    expect(out).toContain("ck.className='cas-chk'");
  });
});

describe("发布端：列 / 空态 / 进场", () => {
  const out = render(BASE);

  test("多列层级感：深层列半透明分线 + 极浅底色", () => {
    expect(out).toContain(".cas-menu+.cas-menu{border-left:1px solid rgba(208, 208, 216, 0.6);background:rgba(51, 51, 51, 0.04)}");
  });

  test("细滚动条（系统默认滚动条在 Windows 上是粗灰条）", () => {
    expect(out).toContain("scrollbar-width:thin;scrollbar-color:rgba(51, 51, 51, 0.25) transparent");
    expect(out).toContain(".cas-menu::-webkit-scrollbar{width:6px}");
    expect(out).toContain(".cas-menu::-webkit-scrollbar-thumb{background:rgba(51, 51, 51, 0.25);border-radius:3px}");
  });

  test("进场动效与编辑区同名同参数", () => {
    expect(out).toContain("@keyframes casIn{from{opacity:0;transform:translateY(-4px)}}");
    expect(out).toContain("animation:casIn .12s cubic-bezier(0, 0, 0.2, 1)");
  });

  test("无选项时渲染「暂无数据」列，而不是 0 列幽灵空框", () => {
    expect(out).toContain(
      ".cas-empty{min-width:140px;padding:6px 12px;color:rgba(51, 51, 51, 0.45);font-size:14px;white-space:nowrap;cursor:default;user-select:none}",
    );
    expect(out).toContain("em.className='cas-empty'");
    expect(out).toContain("暂无数据");
    // 空态兜底判据必须存在
    expect(out).toContain("!panel.querySelector('.cas-menu')");
  });
});

describe("编辑区 ↔ 发布端：同一套机制", () => {
  const src = fs.readFileSync(path.resolve(__dirname, "../../editor/renderers/CascaderRenderer.tsx"), "utf8");

  test("编辑区用同一份颜色口径（不自己写第二份 hex→rgba）", () => {
    expect(src).toContain("withAlpha(accentColor, 0.1)");
    expect(src).toContain("withAlpha(accentColor, 0.12)");
    expect(src).toContain("contrastTextOn(accentColor)");
  });

  test("编辑区用同名状态类（cas-active / cas-cursor），与发布端选择器语义一致", () => {
    expect(src).toContain('isActive ? "cas-active" : isCursor ? "cas-cursor"');
    expect(src).toContain('"&.cas-active"');
    expect(src).toContain('"&.cas-cursor"');
    expect(src).toContain('"&.cas-active.cas-cursor"');
  });

  test("编辑区同样有对勾占位、空态、细滚动条、同名动画", () => {
    expect(src).toContain('className="cas-chk"');
    expect(src).toContain("暂无数据");
    expect(src).toContain("scrollbarWidth");
    expect(src).toContain('"@keyframes casIn"');
    expect(src).toContain("animation: `casIn .12s ${EASE}`");
    expect(src).toContain('outlineOffset: "-2px"');
  });

  test("旧的三态合一写法已被彻底移除", () => {
    expect(src).not.toContain('isActive || isCursor ? "#fff"');
    expect(src).not.toContain("isActive || isCursor ? accentColor");
  });
});


describe("发布端：弹层圆角与触发器解耦（钉 10px，不随触发器 radiusCss 放大）", () => {
  test("默认触发器 40px 时弹层恒 10px（对齐 MUI Menu 惯例）", () => {
    const out = render({ ...BASE, borderRadius: 4 });
    expect(out).toContain("border-radius:40px"); // 触发器仍走家族口径
    expect(out).toMatch(/cas-panel-[\w-]+\{[^}]*border-radius:10px/);
    expect(out).not.toMatch(/cas-panel-[\w-]+\{[^}]*border-radius:40px/);
  });

  test("触发器圆角调大也不影响弹层（弹层不继承 radiusCss）", () => {
    const out = render({ ...BASE, borderRadius: 8 });
    expect(out).toMatch(/cas-panel-[\w-]+\{[^}]*border-radius:10px/);
  });
});
