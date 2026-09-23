import { describe, test, expect, beforeAll } from "vitest";
import { componentRegistry } from "../registry";
import { registerFormComponents } from "../registerFormComponents";
import { resolveLabelStyle } from "../data/labelStyle";
import { scaleStageCss } from "../data/scaleFit";
import type { ConfigField } from "../../types/editor";

beforeAll(() => {
  registerFormComponents();
});

const def = () => componentRegistry.get("form-label");
const keys = (): string[] => def()?.configSchema?.map((f) => f.key) ?? [];
const field = (k: string): ConfigField | undefined => def()?.configSchema?.find((f) => f.key === k);

describe("form-label 配置面板（字段补齐 + 命名统一）", () => {
  test("字段集：内容 + 全量样式（含行高/字间距/星号色）", () => {
    const ks = keys();
    for (const k of [
      "text", "required",
      "textColor", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "align", "errorColor",
    ]) {
      expect(ks).toContain(k);
    }
  });

  test("字段集：后缀 / 文字装饰 / 外观层（底色·内边距·圆角·不透明度）", () => {
    const ks = keys();
    for (const k of ["suffix", "textDecoration", "bgColor", "paddingX", "paddingY", "borderRadius", "opacity"]) {
      expect(ks, `缺少字段 ${k}`).toContain(k);
    }
    // 文字装饰是受控枚举，不是自由文本
    expect(field("textDecoration")?.options?.map((o) => o.value)).toEqual(["none", "underline", "line-through"]);
  });

  test("字段集：动态文案（认证 / 非认证两种接入方式齐备）", () => {
    const ks = keys();
    for (const k of [
      "dataSourceId", // 全局数据源绑定
      "dataMode", "apiUrl", "apiPath", "apiMethod",
      "apiDataPath", "apiHeaders", "apiBody", "apiInterval",
      "authEnabled", // 认证注入开关（本组共享片段）
      "apiTextField", // 文字取值字段
    ]) {
      expect(ks, `缺少数据接入字段 ${k}`).toContain(k);
    }
  });

  test("认证开关的默认值必须显式落成 false（否则面板显示 OFF、行为却是「跟随全局」）", () => {
    const cfg = (def()?.defaultConfig ?? {}) as Record<string, unknown>;
    // 面板 toggle 对 undefined 渲染成 OFF；而 codegen 对 undefined 的语义是「跟随全局认证态」。
    // 二者不一致就是"面板骗人"：站点全局开着认证时，用户看到关闭、请求却带着 Token。
    expect(cfg.authEnabled).toBe(false);
    // 数据源三态字段的其余默认值同样要落齐（与图片/视频/音频同构）
    expect(cfg.dataSourceId).toBe("");
    expect(cfg.dataMode).toBe("static");
    expect(cfg.apiMethod).toBe("GET");
    expect(cfg.apiInterval).toBe(0);
  });

  test("外观字段依赖显隐：没底色就不暴露内边距/圆角（不留「改了没反应」的入口）", () => {
    for (const k of ["paddingX", "paddingY", "borderRadius"]) {
      expect(field(k)?.hidden?.({ bgColor: "#ffeeaa" }), `${k} 有底色时被误隐藏`).toBe(false);
      expect(field(k)?.hidden?.({ bgColor: "" }), `${k} 无底色时仍显示`).toBe(true);
      expect(field(k)?.hidden?.({}), `${k} 缺省时仍显示`).toBe(true);
    }
    // 不透明度与底色无关，恒显示
    expect(field("opacity")?.hidden).toBeUndefined();
  });

  test("数据字段依赖显隐：绑定全局源或非接口模式时不暴露本地接口配置", () => {
    for (const k of ["apiUrl", "apiPath", "apiTextField"]) {
      expect(field(k)?.hidden?.({ dataMode: "api" }), `${k} 接口模式下被误隐藏`).toBe(false);
      expect(field(k)?.hidden?.({ dataMode: "static" }), `${k} 静态模式下仍显示`).toBe(true);
      expect(field(k)?.hidden?.({ dataMode: "api", dataSourceId: "ds1" }), `${k} 绑定全局源后仍显示`).toBe(true);
    }
  });

  test("每个字段都归组（避免字段落进无名分组）", () => {
    for (const f of def()?.configSchema ?? []) {
      expect(f.group, f.key).toBeTruthy();
    }
  });

  test("字重补齐「中等 500」，与同族 input/textarea/select 一致", () => {
    const opts = field("fontWeight")?.options ?? [];
    expect(opts.map((o) => o.value)).toEqual(["normal", "500", "bold"]);
    expect(field("fontWeight")?.label).toBe("文字字重");
  });

  test("对齐字段命名为「文字对齐」，选项为受控枚举", () => {
    expect(field("align")?.label).toBe("文字对齐");
    expect(field("align")?.options?.map((o) => o.value)).toEqual(["left", "center", "right"]);
  });

  test("星号色仅在开启必填标记时出现（避免无意义配置项）", () => {
    expect(field("errorColor")?.hidden?.({ required: true })).toBe(false);
    expect(field("errorColor")?.hidden?.({ required: false })).toBe(true);
    expect(field("errorColor")?.hidden?.({})).toBe(true);
  });

  test("行高/字间距为数值字段且有合理区间", () => {
    const lh = field("lineHeight");
    expect(lh?.type).toBe("number");
    expect(lh?.min).toBe(1);
    expect(lh?.step).toBe(0.05);
    const ls = field("letterSpacing");
    expect(ls?.type).toBe("number");
    expect(ls?.min).toBe(0);
  });
});

describe("form-label 取值口径：面板默认值 == 解析器默认值（三端零漂移）", () => {
  test("defaultConfig 与 resolveLabelStyle({}) 逐项一致", () => {
    const cfg = (def()?.defaultConfig ?? {}) as Record<string, unknown>;
    const r = resolveLabelStyle({});
    expect(cfg.text).toBe(r.text);
    expect(cfg.required).toBe(r.required);
    expect(cfg.textColor).toBe(r.textColor);
    expect(cfg.fontSize).toBe(r.fontSize);
    expect(cfg.fontWeight).toBe(r.fontWeight);
    expect(cfg.lineHeight).toBe(r.lineHeight);
    expect(cfg.letterSpacing).toBe(r.letterSpacing);
    expect(cfg.align).toBe(r.align);
    expect(cfg.errorColor).toBe(r.errorColor);
    // 本轮新增字段同样必须三处同值（面板默认 = 解析器默认）
    expect(cfg.suffix).toBe(r.suffix);
    expect(cfg.textDecoration).toBe(r.textDecoration);
    expect(cfg.bgColor).toBe(r.bgColor);
    expect(cfg.paddingX).toBe(r.paddingX);
    expect(cfg.paddingY).toBe(r.paddingY);
    expect(cfg.borderRadius).toBe(r.borderRadius);
    expect(cfg.opacity).toBe(r.opacity);
  });

  test("默认行高是 MUI FormLabel 约定的 1.4375，不是 Typography body1 的 1.5", () => {
    expect(resolveLabelStyle({}).lineHeight).toBe(1.4375);
    expect((def()?.defaultConfig as Record<string, unknown>)?.lineHeight).toBe(1.4375);
  });

  test("文字口径：空串=主动清空保持为空；未配置才回退默认文案", () => {
    expect(resolveLabelStyle({ text: "" }).text).toBe("");
    expect(resolveLabelStyle({}).text).toBe("标签");
    expect(resolveLabelStyle({ text: null }).text).toBe("标签");
  });

  test("非法值一律回退默认（不产生 0 行高 / NaN 字号）", () => {
    const r = resolveLabelStyle({
      textColor: "", fontSize: 0, fontWeight: "  ", lineHeight: 0, letterSpacing: -3, align: "middle", errorColor: "",
    });
    expect(r.textColor).toBe("#333333");
    expect(r.fontSize).toBe(14);
    expect(r.fontWeight).toBe("normal");
    expect(r.lineHeight).toBe(1.4375);
    expect(r.letterSpacing).toBe(0);
    expect(r.align).toBe("center");
    expect(r.errorColor).toBe("#f44336");
  });

  test("外观字段：0 是合法值（不得被 `|| 兜底` 吃掉），负数/NaN 才回退", () => {
    // 0 内边距 / 0 圆角 / 0 不透明度都是用户真实想要的值
    const zero = resolveLabelStyle({ paddingX: 0, paddingY: 0, borderRadius: 0, opacity: 0 });
    expect(zero.paddingX).toBe(0);
    expect(zero.paddingY).toBe(0);
    expect(zero.borderRadius).toBe(0);
    expect(zero.opacity).toBe(0);
    // 非法值回退
    const bad = resolveLabelStyle({ paddingX: -5, paddingY: "abc", borderRadius: NaN, opacity: 5 });
    expect(bad.paddingX).toBe(0);
    expect(bad.paddingY).toBe(0);
    expect(bad.borderRadius).toBe(0);
    expect(bad.opacity).toBe(1);
    // 越界不透明度夹紧
    expect(resolveLabelStyle({ opacity: -1 }).opacity).toBe(0);
  });

  test("文字装饰是受控枚举：非法值回退 none（不把任意字符串漏进 CSS）", () => {
    expect(resolveLabelStyle({ textDecoration: "underline" }).textDecoration).toBe("underline");
    expect(resolveLabelStyle({ textDecoration: "blink" }).textDecoration).toBe("none");
    expect(resolveLabelStyle({}).textDecoration).toBe("none");
  });

  test("对齐到 flex 主轴的映射集中在缩放舞台口径（两端不再各写一份）", () => {
    // `LabelStyle` 刻意不再派生 `justify`：内层是 nowrap 收缩盒，它自己的 justify 永远无可见效果；
    // 唯一有意义的摆放层是缩放舞台 → 映射只留在 scaleStageCss。
    expect(scaleStageCss(resolveLabelStyle({ align: "left" }).align).justifyContent).toBe("flex-start");
    expect(scaleStageCss(resolveLabelStyle({ align: "center" }).align).justifyContent).toBe("center");
    expect(scaleStageCss(resolveLabelStyle({ align: "right" }).align).justifyContent).toBe("flex-end");
  });
});
