import { describe, test, expect, beforeAll } from "vitest";
import { componentRegistry } from "../registry";
import { registerFormComponents } from "../registerFormComponents";
import {
  resolveToggleShell,
  toggleShellCss,
  toggleLabelTextCss,
  resolveSwitchSkin,
  resolveCheckboxUncheckedColor,
  TOGGLE_RADIUS_DEFAULT,
  TOGGLE_FONT_WEIGHT_DEFAULT,
  SWITCH_TRACK_OFF_COLOR,
  SWITCH_TRACK_OFF_OPACITY,
  SWITCH_TRACK_ON_OPACITY,
  SWITCH_THUMB_OFF_COLOR,
} from "../data/toggleStyle";
import type { ConfigField } from "../../types/editor";

beforeAll(() => {
  registerFormComponents();
});

const keys = (type: string): string[] =>
  componentRegistry.get(type)?.configSchema?.map((f) => f.key) ?? [];
const field = (type: string, k: string): ConfigField | undefined =>
  componentRegistry.get(type)?.configSchema?.find((f) => f.key === k);

/**
 * 开关 / 复选框属性栏契约锁 —— 本轮把它们从 16 / 17 项扩到 ~28 项。
 *
 * 加字段不是目的：**每加一条面板控件，都必须有对应的渲染实现，且两端读同一份口径**。
 * 因此这里既检查字段集齐备，也检查「面板默认值 == 解析器默认值」，
 * 产物级是否真的变化由 `toggle-codegen.test.ts` 负责。
 */
describe.each([
  ["form-switch", "开关"],
  ["form-checkbox", "复选框"],
])("%s 配置面板字段集", (type) => {
  test("外观层字段齐备（底色/边框/圆角/内边距/不透明度）", () => {
    for (const k of ["bgColor", "borderColor", "borderWidth", "borderRadius", "paddingX", "paddingY", "opacity"]) {
      expect(keys(type), `${type} 缺少外观字段 ${k}`).toContain(k);
    }
  });

  test("标签排版字段齐备（字重）", () => {
    expect(keys(type)).toContain("fontWeight");
    expect(field(type, "fontWeight")?.options?.map((o) => o.value)).toEqual([400, 500, 600, 700]);
  });

  test("外观字段归到「外观」分组，字号/字重归「样式」（不落进无名分组）", () => {
    expect(field(type, "bgColor")?.group).toBe("外观");
    expect(field(type, "borderRadius")?.group).toBe("外观");
    expect(field(type, "fontWeight")?.group).toBe("样式");
    for (const f of componentRegistry.get(type)?.configSchema ?? []) {
      expect(f.group, f.key).toBeTruthy();
    }
  });

  test("边框粗细仅在填了边框色后出现（不留「改了没反应」的入口）", () => {
    expect(field(type, "borderWidth")?.hidden?.({ borderColor: "#000000" })).toBe(false);
    expect(field(type, "borderWidth")?.hidden?.({ borderColor: "" })).toBe(true);
    expect(field(type, "borderWidth")?.hidden?.({})).toBe(true);
  });

  test("圆角 help 明确说明「设了底色或边框才可见」（避免用户以为控件坏了）", () => {
    expect(field(type, "borderRadius")?.help).toContain("可见");
    expect(field(type, "borderRadius")?.defaultValue).toBe(TOGGLE_RADIUS_DEFAULT);
  });
});

describe("开关专属字段", () => {
  test("轨道/滑块配色与透明度齐备", () => {
    for (const k of ["trackOffColor", "trackOffOpacity", "trackOnOpacity", "thumbOffColor"]) {
      expect(keys("form-switch"), `form-switch 缺少 ${k}`).toContain(k);
    }
  });

  test("不透明度是受控 slider 而非自由输入", () => {
    const f = field("form-switch", "trackOffOpacity");
    expect(f?.type).toBe("slider");
    expect(f?.min).toBe(0);
    expect(f?.max).toBe(1);
  });
});

describe("复选框专属字段", () => {
  test("未选中颜色独立可配，且默认跟随选中颜色", () => {
    expect(keys("form-checkbox")).toContain("uncheckedColor");
    expect(resolveCheckboxUncheckedColor({}, "#1976d2")).toBe("#1976d2");
    expect(resolveCheckboxUncheckedColor({ uncheckedColor: "#ff0000" }, "#1976d2")).toBe("#ff0000");
  });
});

describe("toggleStyle 取值口径：面板默认值 == 解析器默认值", () => {
  test("默认解析结果 = 历史产物观感（未配置任何外观字段时输出空声明）", () => {
    const s = resolveToggleShell({});
    expect(s.bgColor).toBe("");
    expect(s.borderColor).toBe("");
    expect(s.paddingX).toBe(0);
    expect(s.paddingY).toBe(0);
    expect(s.opacity).toBe(1);
    expect(s.fontWeight).toBe(TOGGLE_FONT_WEIGHT_DEFAULT);
    // 关键护栏：默认状态下**不产生任何声明** → 产物与历史逐字一致，零回归
    expect(toggleShellCss(s)).toEqual({});
    expect(toggleLabelTextCss(s)).toEqual({});
  });

  test("开关皮肤默认值 = MUI Switch 实测观感（历史字面量收口到此）", () => {
    const k = resolveSwitchSkin({});
    expect(k.trackOffColor).toBe(SWITCH_TRACK_OFF_COLOR);
    expect(k.trackOffOpacity).toBe(SWITCH_TRACK_OFF_OPACITY);
    expect(k.trackOnOpacity).toBe(SWITCH_TRACK_ON_OPACITY);
    expect(k.thumbOffColor).toBe(SWITCH_THUMB_OFF_COLOR);
  });

  test("0 是合法值：0 内边距/0 不透明度不得被 `|| 兜底` 吃掉", () => {
    const s = resolveToggleShell({ paddingX: 0, paddingY: 0, opacity: 0, borderRadius: 0 });
    expect(s.paddingX).toBe(0);
    expect(s.opacity).toBe(0);
    expect(s.radius).toBe(0);
    // opacity=0 必须真的产出声明（完全透明是用户能表达的真实意图）
    expect(toggleShellCss(s).opacity).toBe("0");
    // 0 内边距 = 未设置 → 不产出声明
    expect(toggleShellCss(s).padding).toBeUndefined();
  });

  test("越界/非法值一律回退默认", () => {
    const s = resolveToggleShell({
      bgColor: "   ",
      borderColor: null,
      paddingX: -10,
      paddingY: "abc",
      opacity: 5,
      fontWeight: 123,
      borderRadius: 999,
    });
    expect(s.bgColor).toBe("");
    expect(s.borderColor).toBe("");
    expect(s.paddingX).toBe(0);
    expect(s.paddingY).toBe(0);
    expect(s.opacity).toBe(1);
    expect(s.fontWeight).toBe(TOGGLE_FONT_WEIGHT_DEFAULT);
    expect(s.radius).toBe(24); // 夹紧到上限
  });

  test("圆角口径：面板值 × 10（与表单组其他控件一致）", () => {
    expect(resolveToggleShell({ borderRadius: 2 }).radiusCss).toBe("20px");
    expect(resolveToggleShell({}).radiusCss).toBe("0px");
  });

  test("外观层声明可直接序列化进 style 属性（camelCase → kebab-case）", () => {
    const s = resolveToggleShell({
      bgColor: "#ffeeaa",
      borderColor: "#333333",
      borderWidth: 2,
      borderRadius: 2,
      paddingX: 8,
      paddingY: 4,
      opacity: 0.8,
    });
    const css = toggleShellCss(s);
    expect(css.background).toBe("#ffeeaa");
    expect(css.border).toBe("2px solid #333333");
    expect(css.padding).toBe("4px 8px");
    expect(css.borderRadius).toBe("20px");
    expect(css.opacity).toBe("0.8");
  });

  test("边框粗细为 0 时不输出 border（避免 `0px solid` 这种看着像配置错误的声明）", () => {
    expect(toggleShellCss(resolveToggleShell({ borderColor: "#000000", borderWidth: 0 })).border).toBeUndefined();
  });
});
