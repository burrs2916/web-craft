import { describe, test, expect, beforeAll } from "vitest";
import { componentRegistry } from "../registry";
import { registerFormComponents } from "../registerFormComponents";
import type { ConfigField } from "../../types/editor";

beforeAll(() => {
  registerFormComponents();
});

function itemsField(): ConfigField | undefined {
  return componentRegistry.get("form-select")?.configSchema?.find((f) => f.key === "items");
}

describe("form-select 选项字段（条目化 + 自动迁移）", () => {
  test("选项为 list-editor（非 textarea），逐条含 显示名/提交值/图标", () => {
    const f = itemsField();
    expect(f?.type).toBe("list-editor");
    expect(f?.itemFields?.map((x) => x.key)).toEqual(["label", "value", "icon"]);
    expect(f?.itemFields?.some((x) => x.type === "icon-picker")).toBe(true);
    expect(f?.itemLabelKey).toBe("label");
  });

  test("接口模式下隐藏静态选项（静态↔动态单一入口）", () => {
    const f = itemsField();
    expect(f?.hidden?.({ dataMode: "api" })).toBe(true);
    expect(f?.hidden?.({ dataMode: "static" })).toBe(false);
    expect(f?.hidden?.({})).toBe(false);
  });

  test("旧 options 文本经 legacyKey/legacyParse 自动迁移进面板", () => {
    const f = itemsField();
    expect(f?.legacyKey).toBe("options");
    const parsed = f?.legacyParse?.("广东|GD\n北京|BJ") as Array<{ label: string; value: string }>;
    expect(parsed.map((p) => p.label)).toEqual(["广东", "北京"]);
    expect(parsed.map((p) => p.value)).toEqual(["GD", "BJ"]);
  });

  test("defaultConfig 已迁移到 items，不再残留 options", () => {
    const def = componentRegistry.get("form-select");
    expect(def?.defaultConfig?.options).toBeUndefined();
    expect(Array.isArray((def?.defaultConfig as Record<string, unknown>)?.items)).toBe(true);
  });

  test("保留接口取数字段（dataMode/apiValueField/apiLabelField）", () => {
    const keys = componentRegistry.get("form-select")?.configSchema?.map((f) => f.key) ?? [];
    expect(keys).toContain("dataMode");
    expect(keys).toContain("dataSourceId");
    expect(keys).toContain("apiUrl");
    expect(keys).toContain("apiValueField");
    expect(keys).toContain("apiLabelField");
    // 不再暴露旧的 options 文本字段
    expect(keys).not.toContain("options");
  });
});
