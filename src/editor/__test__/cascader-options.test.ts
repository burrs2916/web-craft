import { describe, test, expect } from "vitest";
import {
  CASCADER_DEFAULT_OPTIONS,
  normalizeCascaderTree,
  parseCascaderStaticOptions,
  parseCascaderApiOptions,
  parseCascaderValue,
  findCascaderPath,
  cascaderDisplay,
  cascaderSubmitValue,
  summarizeCascaderTree,
  formatCascaderTreeOneLine,
  diagnoseCascaderOptions,
  diagnoseCascaderPath,
  cascaderPathOptions,
} from "../data/cascaderOptions";

/**
 * 级联选择**选项解析与取值派生**的口径锁。
 *
 * 这是编辑区渲染器与发布端 codegen 共用的唯一实现；两条链路都只读这里的结果，
 * 因此本文件的用例即「编辑区所见 = 发布所得」的结构性保证（不需要 DOM 即可判定）。
 */
describe("cascaderOptions：静态选项解析", () => {
  test("数组直接归一（缺 children 的不产生空数组字段）", () => {
    const out = normalizeCascaderTree([{ label: "浙江", value: "zj" }]);
    expect(out).toEqual([{ label: "浙江", value: "zj" }]);
  });

  test("JSON 树字符串解析为多级", () => {
    const out = parseCascaderStaticOptions(
      JSON.stringify([{ label: "浙江", value: "zj", children: [{ label: "杭州", value: "hz" }] }]),
    );
    expect(out[0].children?.[0]).toEqual({ label: "杭州", value: "hz" });
  });

  test("逐行缩进文本按行首空格建树，支持「显示名|提交值」", () => {
    const out = parseCascaderStaticOptions("浙江|zj\n  杭州|hz\n    西湖区|xh\n江苏|js");
    expect(out.map((o) => o.value)).toEqual(["zj", "js"]);
    expect(out[0].children?.[0].value).toBe("hz");
    expect(out[0].children?.[0].children?.[0].value).toBe("xh");
    // 兄弟节点正确回到同层（宁波是浙江的第二个子级，不是杭州的子级）
    const out2 = parseCascaderStaticOptions("浙江|zj\n  杭州|hz\n  宁波|nb\n江苏|js");
    expect(out2[0].children?.map((o) => o.value)).toEqual(["hz", "nb"]);
    expect(out2[1].value).toBe("js");
  });

  test("单行「显示名|提交值」只有一级", () => {
    expect(parseCascaderStaticOptions("华东|east")).toEqual([{ label: "华东", value: "east" }]);
  });

  test("只有显示名时提交值回退显示名（不必两列都写）", () => {
    expect(parseCascaderStaticOptions("浙江")).toEqual([{ label: "浙江", value: "浙江" }]);
  });

  test("空输入回退内置示例树（拖进来即可见效果）", () => {
    expect(parseCascaderStaticOptions("")).toEqual(CASCADER_DEFAULT_OPTIONS);
    expect(parseCascaderStaticOptions("   ")).toEqual(CASCADER_DEFAULT_OPTIONS);
    expect(parseCascaderStaticOptions(undefined)).toEqual(CASCADER_DEFAULT_OPTIONS);
    expect(parseCascaderStaticOptions("[]")).toEqual(CASCADER_DEFAULT_OPTIONS);
  });

  test("非法 JSON 落到逐行解析而不是整体丢弃（容错）", () => {
    const out = parseCascaderStaticOptions("[{ 坏数据\n浙江|zj");
    expect(out.map((o) => o.value)).toContain("zj");
  });

  test("空行被忽略", () => {
    expect(parseCascaderStaticOptions("浙江|zj\n\n  杭州|hz\n").length).toBe(1);
  });
});

describe("cascaderOptions：接口响应归一（字段名可配）", () => {
  const RAW = [
    { code: "zj", name: "浙江", sub: [{ code: "hz", name: "杭州" }] },
  ];

  test("按配置字段名取值", () => {
    const out = parseCascaderApiOptions(RAW, { valueField: "code", labelField: "name", childrenField: "sub" });
    expect(out[0]).toEqual({
      value: "zj",
      label: "浙江",
      children: [{ value: "hz", label: "杭州" }],
    });
  });

  test("字段名未配置时回退通用别名 value/label/children", () => {
    const out = parseCascaderApiOptions([{ value: "a", label: "A", children: [{ value: "b", label: "B" }] }]);
    expect(out[0].children?.[0].value).toBe("b");
  });

  test("字段名配置了但该字段缺失时继续回退（逐级兜底，不产生空节点）", () => {
    const out = parseCascaderApiOptions([{ id: "x", text: "X" }], { valueField: "code", labelField: "name", childrenField: "sub" });
    expect(out[0]).toEqual({ value: "x", label: "X" });
  });

  test("常见响应容器（items/list/data/children）自动解包", () => {
    const node = { value: "a", label: "A" };
    expect(parseCascaderApiOptions({ items: [node] })).toEqual([node]);
    expect(parseCascaderApiOptions({ list: [node] })).toEqual([node]);
    expect(parseCascaderApiOptions({ data: [node] })).toEqual([node]);
    expect(parseCascaderApiOptions([node])).toEqual([node]);
  });

  test("label 缺失时回退 value（不会渲染出空条目）", () => {
    expect(parseCascaderApiOptions([{ value: "a" }])).toEqual([{ value: "a", label: "a" }]);
  });

  test("非数组输入返回空（接口异常不炸面板）", () => {
    expect(parseCascaderApiOptions(null)).toEqual([]);
    expect(parseCascaderApiOptions("oops")).toEqual([]);
    expect(parseCascaderApiOptions(undefined)).toEqual([]);
  });

  test("取值与显示名同时为空的条目被滤除（发布端内联同一函数，故两端不会出现幽灵选项）", () => {
    // P0 回归根因：发布端旧实现自写 __norm 漏了这层过滤 → 同一响应编辑区 1 项、发布页 2 项
    const out = parseCascaderApiOptions(
      [
        { code: "a", name: "甲" },
        { code: "", name: "" },
      ],
      { valueField: "code", labelField: "name" },
    );
    expect(out).toEqual([{ value: "a", label: "甲" }]);
    // 过滤在每一层递归生效：空的子级同样被摘掉（不会在二级菜单里留空行）
    expect(
      normalizeCascaderTree([
        { value: "p", label: "P", children: [{ value: "c", label: "C" }, { value: "", label: "" }] },
      ]),
    ).toEqual([{ value: "p", label: "P", children: [{ value: "c", label: "C" }] }]);
  });
});

describe("cascaderOptions：取值 / 显示 / 提交派生", () => {
  const tree = parseCascaderStaticOptions("浙江|zj\n  杭州|hz\n    西湖区|xh");

  test("默认选中路径三种写法等价", () => {
    expect(parseCascaderValue(["zj", "hz", "xh"])).toEqual(["zj", "hz", "xh"]);
    expect(parseCascaderValue('["zj","hz","xh"]')).toEqual(["zj", "hz", "xh"]);
    expect(parseCascaderValue("zj/hz/xh")).toEqual(["zj", "hz", "xh"]);
    expect(parseCascaderValue("")).toEqual([]);
    expect(parseCascaderValue(undefined)).toEqual([]);
    expect(parseCascaderValue("[坏")).toEqual([]);
  });

  test("路径查找：命中前缀即截断（不存在的中间级不会漏到更深处）", () => {
    expect(findCascaderPath(tree, ["zj", "hz", "xh"]).map((o) => o.value)).toEqual(["zj", "hz", "xh"]);
    expect(findCascaderPath(tree, ["zj", "不存在", "xh"]).map((o) => o.value)).toEqual(["zj"]);
    expect(findCascaderPath(tree, ["不存在"])).toEqual([]);
  });

  test("显示文案：完整路径 / 仅末级", () => {
    const p = findCascaderPath(tree, ["zj", "hz", "xh"]);
    expect(cascaderDisplay(p, true, " / ")).toBe("浙江 / 杭州 / 西湖区");
    expect(cascaderDisplay(p, false, " / ")).toBe("西湖区");
    expect(cascaderDisplay([], true, " / ")).toBe("");
  });

  test("提交值三口径：末级值 / 取值路径 / 显示名路径", () => {
    const p = findCascaderPath(tree, ["zj", "hz", "xh"]);
    expect(cascaderSubmitValue(p, "leaf", " / ")).toBe("xh");
    expect(cascaderSubmitValue(p, "path", "/")).toBe("zj/hz/xh");
    expect(cascaderSubmitValue(p, "labelPath", "/")).toBe("浙江/杭州/西湖区");
  });

  test("空路径三种口径都返回空串（必填校验据此判定）", () => {
    expect(cascaderSubmitValue([], "leaf", "/")).toBe("");
    expect(cascaderSubmitValue([], "path", "/")).toBe("");
    expect(cascaderSubmitValue([], "labelPath", "/")).toBe("");
  });

  test("仅选中顶级时三种口径都退化为该级（不产生悬空分隔符）", () => {
    const p = findCascaderPath(tree, ["zj"]);
    expect(cascaderSubmitValue(p, "leaf", "/")).toBe("zj");
    expect(cascaderSubmitValue(p, "path", "/")).toBe("zj");
    expect(cascaderSubmitValue(p, "labelPath", "/")).toBe("浙江");
  });
});

/**
 * 面板「选项数据 / 默认选中路径」的实时诊断口径。
 *
 * 这两处此前是**静默降级 / 静默截断**：JSON 写错退化成一行怪选项、路径写错只静默截断，
 * 面板全无反馈。下面的用例锁住「面板说的话 = 解析实际发生的事」。
 */
describe("cascaderOptions：面板实时诊断（把静默降级说出来）", () => {
  test("树摘要：层级 / 节点数 / 叶子数 / 首层名", () => {
    const s = summarizeCascaderTree(CASCADER_DEFAULT_OPTIONS);
    expect(s.depth).toBe(3);
    expect(s.nodes).toBe(10);
    expect(s.leaves).toBe(6);
    expect(s.roots).toEqual(["浙江", "江苏"]);
  });

  test("单行树摘要：层级用 › 表达、同父兄弟叶子合并", () => {
    const line = formatCascaderTreeOneLine(CASCADER_DEFAULT_OPTIONS);
    expect(line).toContain("浙江 › 杭州 › 西湖区·滨江区");
    expect(line).toContain("江苏 › 南京 › 鼓楼区·玄武区");
  });

  test("单行树摘要：超长按 maxChars 截断（不撑爆面板）", () => {
    const long = Array.from({ length: 20 }, (_, i) => ({ value: `v${i}`, label: `选项名称${i}` }));
    const line = formatCascaderTreeOneLine(long, 30);
    expect(line.length).toBe(30);
    expect(line.endsWith("…")).toBe(true);
  });

  test("选项数据：留空 → 提醒正在用内置示例，并给出示例结构", () => {
    const d = diagnoseCascaderOptions("");
    expect(d?.level).toBe("warn");
    expect(d?.text).toContain("正在使用内置示例数据（3 级 / 10 项）");
    expect(d?.detail).toContain("浙江 › 杭州");
  });

  test("选项数据：JSON 语法错误 → error + 说明已退化为逐行解析（旧行为是静默出一个怪选项）", () => {
    const d = diagnoseCascaderOptions('[{"label":"A"');
    expect(d?.level).toBe("error");
    expect(d?.text).toContain("JSON 语法错误");
    expect(d?.detail).toContain("已退化成「逐行文本」解析");
  });

  test("选项数据：写成单个对象（漏了外层方括号）→ error 且点明会被逐行解析成怪选项", () => {
    const d = diagnoseCascaderOptions('{"label":"A","value":"a"}');
    expect(d?.level).toBe("error");
    expect(d?.text).toContain("JSON 顶层是对象");
    expect(d?.detail).toContain("当前会被当作「逐行文本」解析");
  });

  test("选项数据：空数组按「未配置」处理（与解析分支同口径）", () => {
    const d = diagnoseCascaderOptions("[]");
    expect(d?.level).toBe("warn");
    expect(d?.text).toContain("空数组按「未配置」处理");
  });

  test("选项数据：合法 JSON → 摘要 + 树形单行", () => {
    const d = diagnoseCascaderOptions('[{"label":"省A","value":"a","children":[{"label":"市B","value":"b"}]}]');
    expect(d?.level).toBe("ok");
    expect(d?.text).toContain("2 级 / 2 项（可选末级 1 个）");
    expect(d?.detail).toBe("省A › 市B");
  });

  test("选项数据：被丢弃的空条目会报数（用户能看出少了什么）", () => {
    const d = diagnoseCascaderOptions('[{"label":"A","value":"a"},{"label":"","value":""}]');
    expect(d?.level).toBe("warn");
    expect(d?.text).toContain("1 项因取值与显示名同时为空被忽略");
  });

  test("选项数据：全空条目 → error（不会留一个打不开的空控件）", () => {
    expect(diagnoseCascaderOptions('[{"label":"","value":""}]')?.level).toBe("error");
  });

  test("选项数据：逐行文本有分隔符 = ok / 无分隔符 = warn", () => {
    expect(diagnoseCascaderOptions("浙江|zj\n  杭州|hz")?.level).toBe("ok");
    const d = diagnoseCascaderOptions("甲\n  乙");
    expect(d?.level).toBe("warn");
    expect(d?.text).toContain("已按逐行文本解析：2 级 / 2 项");
    expect(d?.detail).toContain("没有「|」分隔符");
  });

  test("选项数据：数组输入（历史数据/接口回填）也给摘要", () => {
    const d = diagnoseCascaderOptions([{ value: "a", label: "A" }]);
    expect(d?.level).toBe("ok");
    expect(d?.text).toContain("1 级 / 1 项");
  });

  test("默认路径：完整命中叶子 = ok", () => {
    const d = diagnoseCascaderPath("zhejiang/hangzhou/xihu", "");
    expect(d?.level).toBe("ok");
    expect(d?.text).toBe("将预选中：浙江 / 杭州 / 西湖区");
    expect(d?.detail).toBeUndefined();
  });

  test("默认路径：命中但该级还有下级 → 提示可继续补全", () => {
    const d = diagnoseCascaderPath("zhejiang/hangzhou", "");
    expect(d?.level).toBe("ok");
    expect(d?.detail).toContain("该项还有下级");
  });

  test("默认路径：部分命中 → warn，且说明实际会选到哪一级", () => {
    const d = diagnoseCascaderPath("zhejiang/nope", "");
    expect(d?.level).toBe("warn");
    expect(d?.text).toBe("只命中前 1 级：浙江");
    expect(d?.detail).toContain("第 2 级「nope」不存在");
    expect(d?.detail).toContain("只会选到「浙江」");
  });

  test("默认路径：完全不存在 → error + 列出可选首级（可直接照抄）", () => {
    const d = diagnoseCascaderPath("zzz", "");
    expect(d?.level).toBe("error");
    expect(d?.text).toContain("第 1 级「zzz」不在当前选项树里");
    expect(d?.detail).toContain("可选首级：zhejiang、jiangsu");
  });

  test("默认路径：留空不提示（不预选是合法用法）", () => {
    expect(diagnoseCascaderPath("", "")).toBeNull();
    expect(diagnoseCascaderPath(undefined, "")).toBeNull();
    expect(diagnoseCascaderPath("[]", "")).toBeNull();
  });

  test("默认路径：诊断跟随选项树变化（同一路径换树后由 ok 变 error）", () => {
    expect(diagnoseCascaderPath("zhejiang", "")?.level).toBe("ok");
    expect(diagnoseCascaderPath("zhejiang", '[{"label":"甲","value":"a"}]')?.level).toBe("error");
  });
});

describe("cascaderOptions：面板「默认选中路径」的候选枚举", () => {
  test("内置示例树 → 逐级枚举，value 就是可直接提交的路径字面量", () => {
    const paths = cascaderPathOptions("");
    const values = paths.map((p) => p.value);
    expect(values).toContain("zhejiang");
    expect(values).toContain("zhejiang/hangzhou");
    expect(values).toContain("zhejiang/hangzhou/xihu");
    // label 用显示名逐级相连，便于在面板里核对层级
    expect(paths.find((p) => p.value === "zhejiang/hangzhou/xihu")?.label).toBe("浙江 / 杭州 / 西湖区");
  });

  test("候选与解析同源：每个候选都能被 parseCascaderValue 解析并逐级命中", () => {
    // 这条是「候选不会给出对不上的路径」的机械保证 —— 候选由同一棵树枚举而来
    const tree = parseCascaderStaticOptions("");
    for (const path of cascaderPathOptions("")) {
      const hit = findCascaderPath(tree, parseCascaderValue(path.value));
      expect(hit.map((o) => o.value).join("/"), path.value).toBe(path.value);
    }
  });

  test("深层树：父级与叶子都在候选里（允许只选到某一级）", () => {
    const raw =
      '[{"label":"省A","value":"a","children":[{"label":"市B","value":"b","children":[{"label":"区C","value":"c"}]}]}]';
    expect(cascaderPathOptions(raw).map((p) => p.value)).toEqual(["a", "a/b", "a/b/c"]);
  });

  test("超过上限时截断，避免几千节点的树把下拉撑爆", () => {
    const many = JSON.stringify(
      Array.from({ length: 20 }, (_, i) => ({ label: `选项${i}`, value: `v${i}` })),
    );
    expect(cascaderPathOptions(many, 5)).toHaveLength(5);
  });
});
