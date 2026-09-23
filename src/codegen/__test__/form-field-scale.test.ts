/**
 * 字段型控件「文字随框缩放」（第 11 轮新增能力）的契约锁。
 *
 * 设计要点（与 label/checkbox 等的 transform 缩放是**两种机制**，勿混）：
 * - 字段层铺满拖动框，几何已自动「随框」；缺的是排版密度——框放大后字号不动，
 *   4K 大屏上「框大字小」。`scaleFit` 开关打开后字号（含派生的图标宽、行高）按
 *   「框 / 注册表 defaultSize」倍率**编译期**缩放。
 * - factor 只在**编译期**算：编辑区读 props width/height（= transform 尺寸），
 *   发布端读 component.transform —— 同源、无需运行时量测脚本。
 * - 不碰几何：不给字段型挂缩放骨架（transform 层会让边框环与字段层脱开，历史结论）。
 */
import { describe, test, expect, beforeAll } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import { componentRegistry } from "../../editor/registry";
import { registerFormComponents } from "../../editor/registerFormComponents";
import { FIELD_FITS, fieldScaleFactor, fitFactor } from "../../editor/data/scaleFit";
import fs from "node:fs";
import path from "node:path";

initBuiltinCodegens();
beforeAll(() => {
  registerFormComponents();
});

const FIELD_TYPES = Object.keys(FIELD_FITS);

const ctx = { pageScripts: [], pageStyles: [], iconData: {}, globalDataSources: {} } as never;

function comp(type: string, w: number, h: number, config: Record<string, unknown>): SceneComponent {
  return {
    id: "c1", type, name: type,
    transform: createDefaultTransform({ x: 0, y: 0, width: w, height: h }),
    layerId: "l1", zIndex: 0, locked: false, visible: true, config, children: [], parentId: null,
  };
}

function render(type: string, w: number, h: number, config: Record<string, unknown>): string {
  const fn = getCodegen(type);
  expect(fn, `${type} 缺 codegen`).toBeTruthy();
  return fn!(comp(type, w, h, config), ctx);
}

describe("字段型「文字随框缩放」契约", () => {
  test("FIELD_FITS 的 refW/refH 恒等于注册表 defaultSize（拖进来即 1 倍）", () => {
    for (const type of FIELD_TYPES) {
      const def = componentRegistry.get(type);
      expect(def, `${type} 未注册`).toBeTruthy();
      const fit = FIELD_FITS[type];
      expect(fit.refW, `${type} refW ≠ defaultSize.width`).toBe(def!.defaultSize.width);
      expect(fit.refH, `${type} refH ≠ defaultSize.height`).toBe(def!.defaultSize.height);
    }
  });

  test("面板 8 个字段型组件都有 scaleFit 开关（布局组、默认关）", () => {
    for (const type of FIELD_TYPES) {
      const f = (componentRegistry.get(type)!.configSchema ?? []).find((x) => x.key === "scaleFit");
      expect(f, `${type} 缺 scaleFit 字段`).toBeTruthy();
      expect(f!.type).toBe("toggle");
      expect(componentRegistry.get(type)!.defaultConfig.scaleFit).toBeUndefined();
    }
  });

  test("factor 取值：默认框=1 / 等比放大 / 夹档 / 尺寸未传=1 / 开关关=1", () => {
    // 默认框恰好 1 倍
    expect(fieldScaleFactor("form-input", 280, 56, true)).toBe(1);
    // 宽高都 ×2 → 2 倍
    expect(fieldScaleFactor("form-input", 560, 112, true)).toBeCloseTo(2);
    // 高度不足 → 以高为准（min(560/280, 56/56) = 1）
    expect(fieldScaleFactor("form-input", 560, 56, true)).toBe(1);
    // 超大框夹在 max=4
    expect(fieldScaleFactor("form-input", 2800, 560, true)).toBe(4);
    // 开关关闭 / 尺寸未传 / 未知类型 → 恒 1
    expect(fieldScaleFactor("form-input", 560, 112, false)).toBe(1);
    expect(fieldScaleFactor("form-input", 0, 0, true)).toBe(1);
    expect(fieldScaleFactor("unknown", 560, 112, true)).toBe(1);
  });

  test("关闭时产物与历史逐字一致（零回归），开启后字号 × factor", () => {
    // codegen 的 uid 用 Math.random —— stub 成确定序列后同配置两次渲染逐字可比
    const realRandom = Math.random;
    Math.random = () => 0.42;
    try {
      const base = { label: "姓名", labelPlacement: "top", fontSize: 14 };
      // 关闭：框放大也不变（uid 已 stub，两次渲染应逐字相同）
      const off1 = render("form-input", 280, 56, base);
      const off2 = render("form-input", 560, 112, base);
      expect(off2).toBe(off1);
      expect(off1).toContain("font-size: 14px");
      expect(off2).toContain("font-size: 14px");

      // 开启：2 倍框 → 字号 28（标签跟随、无 labelFontSize 配置时同源缩放）
      const on2 = render("form-input", 560, 112, { ...base, scaleFit: true });
      expect(on2).toContain("font-size: 28px");
      expect(on2).toContain("font-size:28px"); // 内联样式写法（字段层）

      // 显式 labelFontSize 同样缩放：默认 56 框 factor=1 → 20；2 倍框（scaleFit 开）→ 40
      const lb = { ...base, scaleFit: true, labelFontSize: 20 };
      expect(render("form-input", 280, 56, lb)).toContain("font-size:20px");
      expect(render("form-input", 560, 112, lb)).toContain("font-size:40px");
    } finally {
      Math.random = realRandom;
    }
  });

  test("七个字段型 codegen 全部接入（源码守卫：读 fieldScaleFactor 且 factor 乘进字号）", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../components/form.ts"), "utf8");
    for (const [type, fnName] of [
      ["form-input", "formInputCodegen"],
      ["form-textarea", "formTextareaCodegen"],
      ["form-select", "formSelectCodegen"],
      ["form-date", "datetimeInputCodegen"],
      ["form-time", "datetimeInputCodegen"],
      ["form-number", "formNumberCodegen"],
      ["form-file", "formFileCodegen"],
      ["form-slider", "formSliderCodegen"],
    ] as const) {
      const spec = FIELD_FITS[type];
      // date/time 共用 function datetimeInputCodegen（非 export const），按声明式定位
      const declIdx = src.indexOf(`export const ${fnName}`) >= 0
        ? src.indexOf(`export const ${fnName}`)
        : src.indexOf(`function ${fnName}`);
      expect(declIdx, `${fnName} 未找到`).toBeGreaterThanOrEqual(0);
      const seg = src.slice(declIdx, declIdx + 6000);
      // date/time 的第一个实参是条件表达式（type === "date" ? "form-date" : "form-time"），
      // 并非字符串字面量；此处只断言「本函数确实调用了 fieldScaleFactor」。
      // 原先的 'fieldScaleFactor("' 对 date/time 从来匹配不到自身调用，只是靠 6000 字符窗口
      // 溢进后续函数（formFileCodegen 等）的字面量调用才偶然通过 —— 窗口一旦不够就误报。
      expect(seg, `${fnName} 未接 fieldScaleFactor`).toContain("fieldScaleFactor(");
      expect(src, `form.ts 未引用 ${type} 基准`).toContain(`"${type}"`);
      expect(spec.min).toBe(0.5);
      expect(spec.max).toBe(4);
    }
  });

  test("编辑区渲染器与发布端同源（都调 fieldScaleFactor，同一乘法口径）", () => {
    const pairs: Array<[string, string]> = [
      ["FormInputRenderer.tsx", "form-input"],
      ["FormTextareaRenderer.tsx", "form-textarea"],
      ["FormSelectRenderer.tsx", "form-select"],
      ["DateTimeField.tsx", "form-date"],
      ["FormNumberRenderer.tsx", "form-number"],
      ["FormFileRenderer.tsx", "form-file"],
      ["FormSliderRenderer.tsx", "form-slider"],
    ];
    for (const [file, type] of pairs) {
      const src = fs.readFileSync(path.resolve(__dirname, "../../editor/renderers", file), "utf8");
      expect(src, `${file} 未接 fieldScaleFactor`).toContain("fieldScaleFactor(");
      expect(src, `${file} 未乘 fitF`).toMatch(/\*\s*fitF/);
      // 两端读同一张基准表（不许自带字面量）
      expect(src, `${file} 自带基准字面量`).not.toContain(`refW: ${FIELD_FITS[type].refW}`);
    }
    // date/time 薄壳把 props 透传给 DateTimeField
    for (const shell of ["FormDateRenderer.tsx", "FormTimeRenderer.tsx"]) {
      const src = fs.readFileSync(path.resolve(__dirname, "../../editor/renderers", shell), "utf8");
      expect(src).toContain("{...props}");
    }
  });

  test("fitFactor 公共口径不被字段型绕开（同一函数、同一种夹档）", () => {
    const spec = FIELD_FITS["form-number"];
    expect(fitFactor(400, 112, spec)).toBeCloseTo(2); // min(400/200, 112/56)
    expect(fitFactor(100, 28, spec)).toBeCloseTo(0.5);
    expect(fitFactor(1000, 1000, spec)).toBe(spec.max);
  });
});
