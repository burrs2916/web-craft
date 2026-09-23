import { describe, test, expect } from "vitest";
import {
  sameOptionValue,
  selectDisplayValue,
  resolveSelectValue,
  readTriState,
} from "../data/fieldSelect";
import type { ConfigField } from "../../types/editor";

/**
 * 属性面板 `select` 字段的取值往返 —— 曾经这里是「字符串化写回」的重灾区：
 * 选项值一旦不是字符串（`false` / `null` / 数字），面板就会把配置改写成字符串，
 * 而字符串 `"false"` 是**真值**，于是同一份配置在编辑区与发布端被解释成不同结果。
 * 实测受害者：echart-pie 的「玫瑰图 = 关闭」（画布是玫瑰图、发布是普通饼图）。
 */
const f = (options: Array<{ label: string; value: unknown }>, extra?: Partial<ConfigField>): ConfigField => ({
  key: "k",
  label: "K",
  type: "select",
  options,
  ...extra,
});

describe("select 选项值 ↔ 配置值 往返", () => {
  test("字符串选项：行为与历史完全一致（零回归）", () => {
    const field = f([
      { label: "开", value: "on" },
      { label: "关", value: "off" },
    ]);
    expect(selectDisplayValue(field, "on")).toBe("on");
    expect(resolveSelectValue(field, "off")).toBe("off");
    // 未命中 → 原样透传（自由输入不被吞掉）
    expect(resolveSelectValue(field, "custom")).toBe("custom");
  });

  test("boolean 选项：写回真布尔，不再变成 \"true\"/\"false\"", () => {
    const field = f([
      { label: "关闭", value: false },
      { label: "半径", value: "radius" },
    ]);
    expect(selectDisplayValue(field, false)).toBe("false");
    expect(resolveSelectValue(field, "false")).toBe(false);
    expect(typeof resolveSelectValue(field, "false")).toBe("boolean");
    expect(resolveSelectValue(field, "radius")).toBe("radius");
  });

  test("null 选项（三态）：写回真 null，不再变成字符串 \"null\"", () => {
    const field = f([
      { label: "跟随全局", value: null },
      { label: "启用", value: true },
      { label: "禁用", value: false },
    ]);
    expect(selectDisplayValue(field, null)).toBe("null");
    expect(resolveSelectValue(field, "null")).toBe(null);
    expect(resolveSelectValue(field, "true")).toBe(true);
    expect(resolveSelectValue(field, "false")).toBe(false);
    // 三个选项互不相等，且都是**非字符串**真值
    for (const raw of ["null", "true", "false"]) {
      expect(typeof resolveSelectValue(field, raw)).not.toBe("string");
    }
  });

  test("配置值缺失时回退到 field.defaultValue（面板显示的不是空白）", () => {
    const field = f(
      [
        { label: "跟随全局", value: null },
        { label: "启用", value: true },
      ],
      { defaultValue: null },
    );
    expect(selectDisplayValue(field, undefined)).toBe("null");
  });

  test("数字选项：写回数字而非字符串", () => {
    const field = f([
      { label: "1 列", value: 1 },
      { label: "2 列", value: 2 },
    ]);
    expect(selectDisplayValue(field, 1)).toBe("1");
    expect(resolveSelectValue(field, "2")).toBe(2);
  });

  test("null 与 undefined 视为同一选项（配置语义等价）", () => {
    expect(sameOptionValue(null, undefined)).toBe(true);
    expect(sameOptionValue(undefined, undefined)).toBe(true);
    expect(sameOptionValue(null, false)).toBe(false);
    expect(sameOptionValue(0, 0)).toBe(true);
    expect(sameOptionValue(0, "0")).toBe(true);
  });
});

describe("readTriState：历史脏值一次性收敛", () => {
  test("三类「跟随」写法统一成 null", () => {
    for (const v of [undefined, null, "null"]) {
      expect(readTriState(v)).toBe(null);
    }
  });

  test("真写法（含字符串）统一成 true", () => {
    for (const v of [true, "true", 1, "1"]) {
      expect(readTriState(v)).toBe(true);
    }
  });

  test("假写法（含字符串 \"false\"）统一成 false", () => {
    // 关键回归点：字符串 "false" 在 `Boolean()` 下是真值，必须特判
    for (const v of [false, "false", 0, "0", ""]) {
      expect(readTriState(v)).toBe(false);
    }
    expect(Boolean("false")).toBe(true); // 证明上面的特判确有必要
  });
});

describe("三态字段口径与面板渲染联动", () => {
  test("authEnabled 的选项值是 boolean/null —— 面板必须能如实往返", async () => {
    const { AUTH_ENABLED_OPTIONS, authEnabledField } = await import("../data/authMode");
    const field = authEnabledField();
    expect(field.options).toBe(AUTH_ENABLED_OPTIONS);
    expect(AUTH_ENABLED_OPTIONS.map((o) => o.value)).toEqual([null, true, false]);
    expect(field.defaultValue).toBe(null);
    // 逐项往返：面板显示 → 用户选择 → 写回 config，值必须是原类型
    for (const opt of AUTH_ENABLED_OPTIONS) {
      const shown = selectDisplayValue(field, opt.value);
      expect(resolveSelectValue(field, shown)).toBe(opt.value);
    }
  });
});
