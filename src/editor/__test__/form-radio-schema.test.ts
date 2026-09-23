import { describe, test, expect, beforeAll } from "vitest";
import { componentRegistry } from "../registry";
import { registerFormComponents } from "../registerFormComponents";
import type { ConfigField } from "../../types/editor";

beforeAll(() => {
  registerFormComponents();
});

const def = () => componentRegistry.get("form-radio");
const keys = (): string[] => def()?.configSchema?.map((f) => f.key) ?? [];
const field = (k: string): ConfigField | undefined => def()?.configSchema?.find((f) => f.key === k);

describe("form-radio 配置面板（条目化 + 全量字段）", () => {
  test("选项为 list-editor（非 textarea），逐条含 显示名/提交值/图标", () => {
    const f = field("items");
    expect(f?.type).toBe("list-editor");
    expect(f?.itemFields?.map((x) => x.key)).toEqual(["label", "value", "icon"]);
    expect(f?.itemFields?.some((x) => x.type === "icon-picker")).toBe(true);
    expect(f?.itemLabelKey).toBe("label");
  });

  test("旧 options 文本经 legacyKey/legacyParse 自动迁移进面板", () => {
    const f = field("items");
    expect(f?.legacyKey).toBe("options");
    expect(f?.legacyParse?.("男\n女")).toEqual([
      { label: "男", value: "男" },
      { label: "女", value: "女" },
    ]);
    const mapped = f?.legacyParse?.("男|male\n女|female") as Array<{ label: string; value: string }>;
    expect(mapped.map((p) => p.label)).toEqual(["男", "女"]);
    expect(mapped.map((p) => p.value)).toEqual(["male", "female"]);
  });

  test("补齐字段名/排列方向/标签位置/帮助文字/必填/尺寸", () => {
    const ks = keys();
    for (const k of [
      "fieldName", "label", "items", "selectedIndex", "direction",
      "labelPlacement", "helperText", "required", "disabled",
      "size", "textColor", "accentColor", "fontSize",
    ]) {
      expect(ks).toContain(k);
    }
    // 旧文本字段不再暴露（已由 items 条目化取代）
    expect(ks).not.toContain("options");
  });

  test("校验只保留对单选组有意义的规则（提示文案 + 错误颜色）", () => {
    const ks = keys();
    expect(ks).toContain("validateMessage");
    expect(ks).toContain("errorColor");
    // 取值恒为预设枚举，格式类规则（邮箱/手机号/数字/正则）永不成立，不暴露以免配出必然失败的表单
    for (const k of ["validateType", "validateMin", "validateMax", "validateRegex"]) {
      expect(ks).not.toContain(k);
    }
  });

  test("defaultConfig 条目化且无 options 残留", () => {
    const cfg = def()?.defaultConfig as Record<string, unknown>;
    expect(cfg.options).toBeUndefined();
    expect(Array.isArray(cfg.items)).toBe(true);
    expect((cfg.items as Array<{ label: string; value: string }>).map((i) => i.value)).toEqual(["男", "女"]);
    expect(cfg.selectedIndex).toBe(0);
    expect(cfg.direction).toBe("vertical");
    expect(cfg.labelPlacement).toBe("top");
    expect(cfg.size).toBe("small");
    for (const k of ["fieldName", "helperText", "validateMessage", "errorColor"]) {
      expect(cfg[k]).toBeDefined();
    }
    expect(cfg.required).toBe(false);
    expect(cfg.disabled).toBe(false);
  });

  test("排列方向 / 标签位置 / 尺寸为受控枚举", () => {
    expect(field("direction")?.options?.map((o) => o.value)).toEqual(["vertical", "horizontal"]);
    expect(field("labelPlacement")?.options?.map((o) => o.value)).toEqual(["top", "left"]);
    expect(field("size")?.options?.map((o) => o.value)).toEqual(["small", "medium"]);
  });
});
