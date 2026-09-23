import { describe, test, expect } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import { progressCircleFit, fitFactor } from "../../editor/data/scaleFit";

initBuiltinCodegens();

const ctx = { pageScripts: [] } as never;

function comp(config: Record<string, unknown>, w = 320, h = 120): SceneComponent {
  return {
    id: "c1",
    type: "progress",
    name: "progress",
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

function render(config: Record<string, unknown>, w?: number, h?: number): string {
  const fn = getCodegen("progress");
  expect(fn, "缺少 progress 的 codegen").toBeTruthy();
  return fn!(comp(config, w, h), ctx);
}

/**
 * progress 组件的契约锁。
 *
 * 背景：progress 曾是「两端分叉」的漏网之鱼 —— 编辑区圆形进度用 ResizeObserver 随框
 * 缩放，发布端却写死 80px 固定尺寸，"所见≠所得"。且当时整个组件**零测试**，回归
 * 无从拦截。本文件锁三件事：
 *   1. 圆形分支必须挂共享缩放骨架（-st/-in 三层 + scaleFitScript），且脚本内联的
 *      RW/RH/MIN/MAX 与 `progressCircleFit(circleSize)` 逐值一致（两端同源的凭据）；
 *   2. 圆形百分比标签居中口径与编辑区一致（translate(-50%,-50%) 绝对居中）；
 *   3. 线性分支不引入缩放骨架（铺满即满足，叠 transform 反而是回归）。
 */
describe("progress：圆形缩放骨架两端同源", () => {
  test("圆形：三层骨架 + 缩放脚本内联 progressCircleFit(80)", () => {
    const out = render({ shape: "circle" });
    expect(out).toMatch(/class="prg-[a-z0-9]+-st"/);
    expect(out).toMatch(/class="prg-[a-z0-9]+-in"/);
    const spec = progressCircleFit(80);
    expect(out).toContain(`var RW=${spec.refW},RH=${spec.refH},MIN=${spec.min},MAX=${spec.max}`);
    expect(out).toContain("__wcFit");
  });

  test("圆形：自定义 circleSize 时脚本基准随配置走（非写死 80）", () => {
    const out = render({ shape: "circle", circleSize: 120 });
    const spec = progressCircleFit(120);
    expect(out).toContain(`var RW=${spec.refW},RH=${spec.refH},MIN=${spec.min},MAX=${spec.max}`);
    // SVG 与内层按自然尺寸渲染，只被 transform 缩放
    expect(out).toContain('width="120"');
    expect(out).toContain("width:120px;height:120px");
  });

  test("圆形：缩放系数公式与编辑区 fitFactor 同源（夹在 [min,max]）", () => {
    // 编辑区在 160×60 的框里算出的系数，脚本公式必须给出同一个值
    const spec = progressCircleFit(80);
    const f = fitFactor(160, 60, spec); // min(160/80, 60/80)=0.75
    expect(f).toBe(0.75);
    // 脚本公式逐字核对：min(w/RW,h/RH) + MIN/MAX 夹取
    const out = render({ shape: "circle" });
    expect(out).toContain("f=Math.min(w/RW,h/RH)");
  });

  test("圆形：百分比标签绝对居中（与编辑区一致）", () => {
    const out = render({ shape: "circle", showLabel: true });
    expect(out).toContain("transform:translate(-50%,-50%)");
    expect(out).toContain("60%");
    const off = render({ shape: "circle", showLabel: false });
    expect(off).not.toContain("%</span>");
  });

  test("线性：不引入缩放骨架（铺满即满足）", () => {
    const out = render({ shape: "line", value: 40, max: 100 });
    expect(out).not.toContain("-st\"");
    expect(out).not.toContain("__wcFit");
    expect(out).toContain("width:40%");
  });

  test("线性：条纹动画产 keyframes，动画开关控制 animation", () => {
    const on = render({ shape: "line", striped: true, animated: true });
    expect(on).toContain("progress-stripes");
    // 条纹（循环）与生长（入场）共存：逗号拼接进同一 animation
    expect(on).toContain("progress-grow 0.8s ease-out,progress-stripes 1s linear infinite");
    const off = render({ shape: "line", striped: true, animated: false });
    expect(off).not.toContain("animation:progress");
  });

  test("线性：animated 产入场生长动画（from{width:0} → 内联终值）", () => {
    const on = render({ shape: "line", animated: true });
    expect(on).toContain("@keyframes progress-grow{from{width:0}}");
    expect(on).toContain("animation:progress-grow 0.8s ease-out");
    const off = render({ shape: "line", animated: false });
    expect(off).not.toContain("progress-grow");
  });

  test("圆形：animated 产 uid 作用域生长动画（from=空环周长，防多实例互踩）", () => {
    const on = render({ shape: "circle", animated: true });
    expect(on).toMatch(/@keyframes prg-[a-z0-9]+-grow\{from\{stroke-dashoffset:[0-9.]+\}/);
    expect(on).toMatch(/animation:prg-[a-z0-9]+-grow 0\.8s ease-out/);
    const off = render({ shape: "circle", animated: false });
    expect(off).not.toContain("-grow");
  });

  test("百分比色：labelColor 收口三处标签，留空沿用白色系默认（历史行为不变）", () => {
    // 默认：三种标签位置各自的原硬编码色（深底系）
    expect(render({ shape: "line", labelPosition: "right" })).toContain("color:rgba(255,255,255,0.6)");
    expect(render({ shape: "line", labelPosition: "inside" })).toContain("color:#fff");
    expect(render({ shape: "circle" })).toContain("color:rgba(255,255,255,0.7)");
    // 显式设置：两形状三位置全部跟随
    expect(render({ shape: "line", labelPosition: "right", labelColor: "#333333" })).toContain("color:#333333");
    expect(render({ shape: "line", labelPosition: "inside", labelColor: "#333333" })).toContain("color:#333333");
    expect(render({ shape: "circle", labelColor: "#333333" })).toContain("color:#333333");
  });

  test("状态色覆盖：success/warning/error 覆盖主色", () => {
    expect(render({ status: "success" })).toContain("#4CAF50");
    expect(render({ status: "error" })).toContain("#F44336");
  });
});
