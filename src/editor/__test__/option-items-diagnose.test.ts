/**
 * 选项族（下拉选择 / 单选组 / 分段控制器）**面板诊断**的口径锁。
 *
 * 起因：这些组件的「选项数据 / 默认选中」此前是**静默**的 —— 提交值写重复、索引越界、
 * 默认值不在列表里，画布与发布页各自兜底，而面板一句话都不说，
 * 用户只能看到「设置了却没生效」。
 *
 * 另附一条**两端语义差异**的显式记录（第 31 轮实测）：
 * 同为「默认选中索引」，**下拉选择越界会夹取为最后一项，单选组越界则不预选任何项** ——
 * 诊断必须如实说出，否则用户永远猜不到自己那个数字被怎么解释了。
 */
import { describe, test, expect } from "vitest";
import {
  diagnoseOptionItems,
  diagnoseSelectedIndex,
  diagnoseOptionValue,
  summarizeOptionItems,
  parseOptionItems,
} from "../data/optionItems";

const ITEMS_3 = [
  { label: "广东", value: "GD" },
  { label: "江苏", value: "JS" },
  { label: "浙江", value: "ZJ" },
];

describe("选项数据诊断：把静默的配置问题说出来", () => {
  test("正常：项数 + 摘要（超出上限截断并报总数）", () => {
    const d = diagnoseOptionItems(ITEMS_3)!;
    expect(d.level).toBe("ok");
    expect(d.text).toBe("已配置 3 项");
    expect(d.detail).toBe("广东 · 江苏 · 浙江");

    const many = Array.from({ length: 9 }, (_, i) => ({ label: `第${i}项`, value: `v${i}` }));
    expect(diagnoseOptionItems(many)?.detail).toContain("（共 9 项）");
  });

  test("提交值重复 → error（选中任一项都提交同一个值，表单无法区分）", () => {
    const d = diagnoseOptionItems([
      { label: "广东", value: "G" },
      { label: "广西", value: "G" },
    ])!;
    expect(d.level).toBe("error");
    expect(d.text).toBe("提交值重复：「G」×2");
    expect(d.detail).toContain("无法区分");
  });

  test("提交值不重复但显示名重复 → warn（画布上看不出区别）", () => {
    const d = diagnoseOptionItems([
      { label: "广东", value: "G1" },
      { label: "广东", value: "G2" },
    ])!;
    expect(d.level).toBe("warn");
    expect(d.text).toContain("显示名重复：「广东」");
  });

  test("旧 options 文本写坏 → warn 指出「看起来是 JSON 但没解析成数组」", () => {
    const d = diagnoseOptionItems('[{"label":"A"')!;
    expect(d.level).toBe("warn");
    expect(d.text).toContain("看起来是 JSON");
    expect(d.detail).toContain("改用「选项列表」逐条录入");
  });

  test("空 → warn（说清两端都会是空的）", () => {
    expect(diagnoseOptionItems("")?.level).toBe("warn");
    expect(diagnoseOptionItems([])?.text).toBe("尚未配置任何选项");
    expect(diagnoseOptionItems(undefined)?.detail).toContain("画布与发布页都会是空的");
  });
});

describe("默认选中索引诊断：下拉选择与单选组的语义差异必须说出来", () => {
  test("下拉选择：无占位时索引从 0 起，0 即第一项", () => {
    const d = diagnoseSelectedIndex({ selectedIndex: 0 }, ITEMS_3, "select")!;
    expect(d.level).toBe("ok");
    expect(d.text).toBe("将默认选中第 1 项「广东」");
  });

  test("下拉选择：设占位/清空后索引从 1 起，0 = 未选中", () => {
    const zero = diagnoseSelectedIndex({ selectedIndex: 0, placeholder: "请选择" }, ITEMS_3, "select")!;
    expect(zero.level).toBe("info");
    expect(zero.text).toBe("0 = 未选中");

    const one = diagnoseSelectedIndex({ selectedIndex: 1, placeholder: "请选择" }, ITEMS_3, "select")!;
    expect(one.text).toBe("将默认选中第 1 项「广东」");
    expect(one.detail).toContain("序号从 1 起");

    // clearable 与 placeholder 等价地触发「有空项」
    expect(diagnoseSelectedIndex({ selectedIndex: 0, clearable: true }, ITEMS_3, "select")?.text).toBe("0 = 未选中");
  });

  test("下拉选择越界 → warn 并说明会被夹取为最后一项", () => {
    const d = diagnoseSelectedIndex({ selectedIndex: 9 }, ITEMS_3, "select")!;
    expect(d.level).toBe("warn");
    expect(d.text).toContain("索引 9 超出范围（共 3 项，从 0 起）");
    expect(d.detail).toContain("夹取为最后一项「浙江」");
  });

  test("单选组越界 → warn 并说明不会预选（与下拉相反）", () => {
    const d = diagnoseSelectedIndex({ selectedIndex: 9 }, ITEMS_3, "radio")!;
    expect(d.level).toBe("warn");
    expect(d.text).toContain("共 3 项，从 0 起");
    expect(d.detail).toContain("不会预选任何一项");
    expect(d.detail).toContain("下拉选择");
  });

  test("接口模式：索引不参与预选，且两端行为分别说明", () => {
    const sel = diagnoseSelectedIndex({ dataMode: "api" }, ITEMS_3, "select")!;
    expect(sel.level).toBe("info");
    expect(sel.text).toContain("接口模式");
    expect(sel.detail).toContain("初始显示占位文字");

    const rad = diagnoseSelectedIndex({ dataMode: "api" }, ITEMS_3, "radio")!;
    expect(rad.text).toBe("接口模式：运行时取第 1 项");
    expect(rad.detail).toContain("默认勾选第 1 项");
  });

  test("未配置选项时不啰嗦「第 1 项」", () => {
    const d = diagnoseSelectedIndex({ selectedIndex: 0 }, [], "select")!;
    expect(d.level).toBe("warn");
    expect(d.text).toBe("尚未配置选项，默认选中索引暂不生效");
  });
});

describe("默认选中值诊断（取值型：分段控制器）", () => {
  test("命中选项 → ok", () => {
    expect(diagnoseOptionValue({ value: "JS" }, ITEMS_3)).toEqual({
      level: "ok",
      text: "将默认选中「江苏」",
    });
  });

  test("值不在列表里 → warn 说清「回退第 1 项但仍提交原值」", () => {
    const d = diagnoseOptionValue({ value: "zzz" }, ITEMS_3)!;
    expect(d.level).toBe("warn");
    expect(d.text).toContain("当前值「zzz」不在选项列表中");
    expect(d.detail).toContain("回退为选中第 1 项「广东」");
    expect(d.detail).toContain("仍会提交原值");
  });

  test("留空 → info（默认取第 1 项）", () => {
    expect(diagnoseOptionValue({}, ITEMS_3)?.text).toBe("留空时默认选中第 1 项「广东」");
  });

  test("接口模式 → 不按静态值判断", () => {
    const d = diagnoseOptionValue({ value: "zzz", dataMode: "api" }, ITEMS_3)!;
    expect(d.level).toBe("info");
    expect(d.text).toContain("接口模式");
  });
});

describe("summarizeOptionItems", () => {
  test("超出上限截断并报总数；旧文本解析同样可用", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ label: `L${i}`, value: `v${i}` }));
    expect(summarizeOptionItems(many, 3)).toBe("L0 · L1 · L2 …（共 9 项）");
    expect(summarizeOptionItems(parseOptionItems("甲\n乙"))).toBe("甲 · 乙");
  });
});
