import { describe, test, expect, beforeAll } from "vitest";
import { componentRegistry } from "../registry";
import { registerFormComponents } from "../registerFormComponents";

beforeAll(() => {
  registerFormComponents();
});

describe("form-container 纯容器定位", () => {
  test("容器不再预置子输入框（defaultChildren 已移除）", () => {
    const def = componentRegistry.get("form-container");
    expect(def).toBeDefined();
    expect(def?.defaultChildren).toBeUndefined();
  });

  test("容器 schema 提供『表单字段』子元素管理面板入口", () => {
    const def = componentRegistry.get("form-container");
    expect(def?.configSchema?.some((f) => f.type === "form-fields")).toBe(true);
  });

  test("仍具备可嵌入子级的能力（embeddable 保持）", () => {
    const def = componentRegistry.get("form-container");
    expect(def?.capabilities?.embeddable).toBe(true);
  });

  test("不再自动注入『数据源』分组（表单容器是提交型，不消费展示数据）", () => {
    const def = componentRegistry.get("form-container");
    const keys = (def?.configSchema ?? []).map((f) => f.key);
    // 统一数据源注入的字段：数据模式 / 静态数据 / 接口系列
    expect(keys).not.toContain("dataMode");
    expect(keys).not.toContain("staticData");
    expect(keys).not.toContain("apiUrl");
    // 仍保留表单自身的"数据提交"分组
    expect(keys).toContain("submitUrl");
  });
});