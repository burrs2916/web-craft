/**
 * 数字输入框「可清空」落点口径（numberDraft.ts）回归锁（第 34 轮）。
 *
 * 锁的是什么：
 * 1. **最后一个数字删不掉** —— 旧实现「受控 value + onChange 里 `if (v === '') return`」，
 *    空串不提交 → React 重渲染把旧值打回输入框，永远清不空。修复 = 草稿层 + 明确落点。
 * 2. **落点口径唯一** —— 空值语义（unset 回退默认 / keep 保持原值）与越界夹取收口为纯函数，
 *    面板数字输入（NumberConfigField / CompactNumberInput / 喷雾参数 / Z-Index）共用。
 *    属性面板已按功能拆分（property/ 子模块），故源码级校验跨模块汇总。
 */
import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { parseLiveNumber, commitNumberDraft } from "../data/numberDraft";

describe("parseLiveNumber：实时提交判定", () => {
  test("未完成态返回 null（只进草稿，不回写、不打回旧值）", () => {
    expect(parseLiveNumber("")).toBeNull();
    expect(parseLiveNumber("-")).toBeNull();
    expect(parseLiveNumber(".")).toBeNull();
    expect(parseLiveNumber("-.")).toBeNull();
  });

  test("可解析值原样返回（负数/小数/科学计数）", () => {
    expect(parseLiveNumber("16")).toBe(16);
    expect(parseLiveNumber("-5")).toBe(-5);
    expect(parseLiveNumber("1.5")).toBe(1.5);
    expect(parseLiveNumber("12.")).toBe(12);
    expect(parseLiveNumber("1e3")).toBe(1000);
  });

  test("非数字返回 null", () => {
    expect(parseLiveNumber("abc")).toBeNull();
    expect(parseLiveNumber("1-2")).toBeNull();
  });
});

describe("commitNumberDraft：失焦落点判定", () => {
  test("范围内原值提交", () => {
    expect(commitNumberDraft("16", { min: 10, max: 30 })).toBe(16);
  });

  test("越界夹取进 [min,max]", () => {
    expect(commitNumberDraft("5", { min: 10, max: 30 })).toBe(10);
    expect(commitNumberDraft("99", { min: 10, max: 30 })).toBe(30);
    expect(commitNumberDraft("-3", { min: 10, max: 30 })).toBe(10);
  });

  test("无 min/max 时夹取无穷", () => {
    expect(commitNumberDraft("-42")).toBe(-42);
    expect(commitNumberDraft("9999")).toBe(9999);
  });

  test("空值 unset 语义：提交 undefined（消费端 `?? 默认值` 回退组件默认）", () => {
    expect(commitNumberDraft("", { min: 10, max: 30, empty: "unset" })).toBeUndefined();
    expect(commitNumberDraft("-", { empty: "unset" })).toBeUndefined();
    expect(commitNumberDraft(".", { empty: "unset" })).toBeUndefined();
    expect(commitNumberDraft("-.", { empty: "unset" })).toBeUndefined();
    expect(commitNumberDraft("  ", { empty: "unset" })).toBeUndefined();
  });

  test("空值 keep 语义：不提交（null），保持原值", () => {
    expect(commitNumberDraft("", { empty: "keep" })).toBeNull();
    expect(commitNumberDraft("-", { empty: "keep" })).toBeNull();
  });

  test("不可解析值与空值同语义", () => {
    expect(commitNumberDraft("abc", { empty: "unset" })).toBeUndefined();
    expect(commitNumberDraft("abc", { empty: "keep" })).toBeNull();
  });
});

describe("源码级不变量：反模式不得回流", () => {
  // 属性面板已按功能拆分：数字输入分布在面板子模块与 property/ 子模块，需汇总校验
  const panelDir = path.join(__dirname, "../../editor/panels");
  const panelSrc = [
    path.join(panelDir, "EditorPropertyPanel", "index.tsx"),
    path.join(panelDir, "EditorPropertyPanel", "inputs.tsx"),
    path.join(panelDir, "EditorPropertyPanel", "ConfigFieldRenderer.tsx"),
    path.join(panelDir, "property", "SensorSprayConfigSection.tsx"),
    path.join(panelDir, "property", "legacyIotWidgets", "DataSourceFields.tsx"),
    path.join(panelDir, "property", "legacyIotWidgets", "DatabaseFields.tsx"),
    path.join(panelDir, "property", "legacyIotWidgets", "ActionField.tsx"),
    path.join(panelDir, "property", "legacyIotWidgets", "DeviceFields.tsx"),
    path.join(panelDir, "property", "legacyIotWidgets", "DeviceStatusSection.tsx"),
  ]
    .map((f) => fs.readFileSync(f, "utf8"))
    .join("\n");

  test("面板不得再出现「空串拒绝提交」反模式（会导致最后一个数字删不掉）", () => {
    expect(panelSrc).not.toContain("if (v === '' || v === '-') return;");
    // 旧 blur 兜底「空串夹到 min/0」也不得回流（清空应按语义 unset/keep）
    expect(panelSrc).not.toContain("onChange(field.key, numMin > 0 ? numMin : 0)");
  });

  test("数字输入统一走 commitNumberDraft 落点口径", () => {
    const uses = panelSrc.match(/commitNumberDraft\(/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(4);
  });
});
