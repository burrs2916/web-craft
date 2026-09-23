import { describe, test, expect, beforeAll } from "vitest";
import { componentRegistry } from "../registry";
import { registerFormComponents } from "../registerFormComponents";
import type { ConfigField } from "../../types/editor";

beforeAll(() => {
  registerFormComponents();
});

const def = () => componentRegistry.get("form-checkbox");
const keys = (): string[] => def()?.configSchema?.map((f) => f.key) ?? [];
const field = (k: string): ConfigField | undefined => def()?.configSchema?.find((f) => f.key === k);

describe("form-checkbox 配置面板（全量补齐）", () => {
  test("补齐字段名/必填/帮助文字/位置/尺寸/半选", () => {
    const ks = keys();
    for (const k of ["fieldName", "label", "checked", "indeterminate", "labelPlacement", "helperText", "required", "disabled", "size"]) {
      expect(ks).toContain(k);
    }
  });

  test("校验只保留对复选框有意义的规则（提示文案 + 错误颜色）", () => {
    const ks = keys();
    expect(ks).toContain("validateMessage");
    expect(ks).toContain("errorColor");
    // 格式类规则对 勾选='on' / 未勾选='' 永不成立，不暴露以免配出必然失败的表单
    for (const k of ["validateType", "validateMin", "validateMax", "validateRegex"]) {
      expect(ks).not.toContain(k);
    }
  });

  test("半选时隐藏「默认勾选」（半选优先，避免两个互斥状态同时可配）", () => {
    expect(field("checked")?.hidden?.({ indeterminate: true })).toBe(true);
    expect(field("checked")?.hidden?.({ indeterminate: false })).toBe(false);
    expect(field("checked")?.hidden?.({})).toBe(false);
  });

  test("标签位置与尺寸为受控枚举", () => {
    expect(field("labelPlacement")?.options?.map((o) => o.value)).toEqual(["right", "left"]);
    expect(field("size")?.options?.map((o) => o.value)).toEqual(["medium", "small"]);
  });

  test("defaultConfig 补齐新字段且保留原有默认", () => {
    const cfg = def()?.defaultConfig as Record<string, unknown>;
    expect(cfg.label).toBe("同意服务条款");
    for (const k of ["fieldName", "labelPlacement", "helperText", "validateMessage", "errorColor", "size"]) {
      expect(cfg[k]).toBeDefined();
    }
    expect(cfg.checked).toBe(false);
    expect(cfg.indeterminate).toBe(false);
    expect(cfg.required).toBe(false);
    expect(cfg.labelPlacement).toBe("right");
    expect(cfg.size).toBe("medium");
  });
});
