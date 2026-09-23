/**
 * 类型级内建诊断单测（`editor/data/fieldDiagnose.ts`）。
 *
 * 这些诊断由面板按 `type` 统一调用（color 618 个字段 / number 774 个字段），
 * 覆盖面远大于 schema 逐字段声明的 `ConfigField.diagnose`，所以「不误报」比「不漏报」更重要 ——
 * 下面的用例把每条静默规则都钉住：一旦有人把判定放宽成「解析不了就报错」，
 * 39 个 `transparent` / `none` / `red` 的合法配置会立刻变成满屏红字，测试会先炸。
 */
import { describe, test, expect } from "vitest";
import {
  diagnoseColorValue,
  diagnoseNumberValue,
  diagnoseDynamicOptionsEmpty,
} from "../data/fieldDiagnose";

describe("diagnoseColorValue：只在「本来就写成单色、却写坏」时报错", () => {
  test("拼错的单色写法 → error", () => {
    const d = diagnoseColorValue("#12345", "边框色");
    expect(d?.level).toBe("error");
    expect(d?.text).toContain("不是合法颜色");
    expect(diagnoseColorValue("#gggggg")?.level).toBe("error");
  });

  test("合法单色 → 静默", () => {
    expect(diagnoseColorValue("#1976d2")).toBeNull();
    expect(diagnoseColorValue("#fff")).toBeNull();
    expect(diagnoseColorValue("rgb(1,2,3)")).toBeNull();
  });

  test("含 alpha → info（取色器改色会丢透明度）", () => {
    const d = diagnoseColorValue("rgba(0,0,0,0.5)", "文字色");
    expect(d?.level).toBe("info");
    expect(d?.text).toContain("含透明度");
    expect(d?.text).toContain("0.5");
  });

  test("非常规但合法的写法一律静默（实测默认配置里 39 处，误报就是灾难）", () => {
    for (const v of ["transparent", "none", "red", "gray", "currentColor", "var(--x)", "linear-gradient(#fff,#000)"]) {
      expect(diagnoseColorValue(v), v).toBeNull();
    }
  });

  test("空值静默（未设置由 defaultValue 兜底，不算异常）", () => {
    expect(diagnoseColorValue("")).toBeNull();
    expect(diagnoseColorValue(undefined)).toBeNull();
    expect(diagnoseColorValue(null)).toBeNull();
  });
});

describe("diagnoseNumberValue：越界要说清「会被夹取成什么」", () => {
  test("超出上限 → warn，并说明夹取结果", () => {
    const d = diagnoseNumberValue(50, 0, 40, "圆角");
    expect(d?.level).toBe("warn");
    expect(d?.text).toContain("超出上限 40");
    expect(d?.text).toContain("夹取为 40");
  });

  test("低于下限 → warn", () => {
    const d = diagnoseNumberValue(5, 10, undefined, "宽度");
    expect(d?.level).toBe("warn");
    expect(d?.text).toContain("低于下限 10");
  });

  test("在范围内 / 恰好等于边界 / 未声明边界 → 静默", () => {
    expect(diagnoseNumberValue(5, 0, 10)).toBeNull();
    expect(diagnoseNumberValue(10, 0, 10)).toBeNull();
    expect(diagnoseNumberValue(0, 0, 10)).toBeNull();
    expect(diagnoseNumberValue(42)).toBeNull();
    expect(diagnoseNumberValue(42, undefined, undefined)).toBeNull();
  });

  test("空值与非数字中间态静默（交给字段自身的 required 校验）", () => {
    expect(diagnoseNumberValue("", 0, 10)).toBeNull();
    expect(diagnoseNumberValue(undefined, 0, 10)).toBeNull();
    expect(diagnoseNumberValue("abc", 0, 10)).toBeNull();
  });

  test("数字字符串按数值判定", () => {
    expect(diagnoseNumberValue("99", 0, 10)?.level).toBe("warn");
  });
});

describe("diagnoseDynamicOptionsEmpty：只在「已有值却改不了」时出声", () => {
  test("有值但算不出候选 → info（面板对一个生效中的配置失明）", () => {
    const d = diagnoseDynamicOptionsEmpty("pane-1", "激活面板");
    expect(d?.level).toBe("info");
    expect(d?.text).toContain("激活面板");
    expect(d?.text).toContain("pane-1");
  });

  test("值为空 → 静默（该字段在当前配置下本就无意义）", () => {
    expect(diagnoseDynamicOptionsEmpty("", "激活面板")).toBeNull();
    expect(diagnoseDynamicOptionsEmpty(undefined, "激活面板")).toBeNull();
    expect(diagnoseDynamicOptionsEmpty("   ", "激活面板")).toBeNull();
  });
});
