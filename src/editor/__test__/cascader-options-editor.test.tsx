/**
 * 级联「选项数据」树形编辑器（CascaderOptionsEditor）回归锁（第 33 轮）。
 *
 * 锁的是什么：
 * 1. **不再手写 JSON** —— options 字段从 textarea 改为 `type: "cascader-options"` 树形编辑器，
 *    对齐 list-editor / MenuItemsEditor 的字段化范式；旧配置（JSON 树 / 逐行文本）必须能解析进面板。
 * 2. **回写口径** —— serializeCascaderTree 与 parseCascaderStaticOptions 互逆；
 *    空显示名/提交值互为兜底；空 children 不落盘。
 * 3. **存储格式不变** —— 渲染器与 codegen 的解析口径零改动（仍读同一个字符串配置）。
 */
import { describe, test, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import { CascaderOptionsEditor } from "../components/CascaderOptionsEditor";
import {
  parseCascaderStaticOptions,
  serializeCascaderTree,
  CASCADER_DEFAULT_OPTIONS,
} from "../data/cascaderOptions";

describe("serializeCascaderTree：回写口径", () => {
  test("与 parse 互逆（JSON 树 → 树 → JSON）", () => {
    const src = '[{"label":"浙江","value":"zj","children":[{"label":"杭州","value":"hz"}]}]';
    const tree = parseCascaderStaticOptions(src);
    const out = serializeCascaderTree(tree);
    expect(parseCascaderStaticOptions(out)).toEqual(tree);
  });

  test("内置示例树 → 序列化 → 解析不变", () => {
    const out = serializeCascaderTree(CASCADER_DEFAULT_OPTIONS);
    expect(parseCascaderStaticOptions(out)).toEqual(CASCADER_DEFAULT_OPTIONS);
  });

  test("提交值留空跟随显示名；显示名留空跟随提交值", () => {
    const out = serializeCascaderTree([
      { value: "", label: "浙江" },
      { value: "js", label: "" },
    ]);
    expect(JSON.parse(out)).toEqual([{ label: "浙江", value: "浙江" }, { label: "js", value: "js" }]);
  });

  test("空 children 不落盘；空白项被过滤", () => {
    const out = serializeCascaderTree([
      { label: "浙江", value: "zj", children: [] },
      { label: "  ", value: "" },
      { label: "江苏", value: "js", children: [{ label: "  ", value: "" }] },
    ]);
    expect(JSON.parse(out)).toEqual([
      { label: "浙江", value: "zj" },
      { label: "江苏", value: "js" },
    ]);
  });

  test("逐行文本（旧写法）解析进树后回写为 JSON 树", () => {
    const legacy = "浙江|zj\n  杭州|hz\n  宁波|nb\n江苏|js";
    const tree = parseCascaderStaticOptions(legacy);
    expect(tree[0].children?.map((c) => c.value)).toEqual(["hz", "nb"]);
    const out = serializeCascaderTree(tree);
    expect(parseCascaderStaticOptions(out)).toEqual(tree);
  });
});

describe("CascaderOptionsEditor：面板渲染", () => {
  const render = (value: unknown) =>
    renderToStaticMarkup(React.createElement(CascaderOptionsEditor, { value, onChange: () => {} }));

  test("旧 JSON 树配置解析为行（显示名 + 提交值都在行上）", () => {
    const html = render('[{"label":"浙江","value":"zj","children":[{"label":"杭州","value":"hz"}]}]');
    expect(html).toContain("浙江");
    expect(html).toContain("杭州");
    expect(html).toContain("zj");
    expect(html).toContain("hz");
    // 不再出现 JSON 语法提示（textarea 的 placeholder 已随类型一起退场）
    expect(html).not.toContain("children");
  });

  test("旧逐行文本配置同样解析为行", () => {
    const html = render("浙江|zj\n  杭州|hz");
    expect(html).toContain("浙江");
    expect(html).toContain("杭州");
  });

  test("留空回退内置示例树（与画布所示一致，可直接在其上改）", () => {
    const html = render("");
    expect(html).toContain("浙江");
    expect(html).toContain("西湖区");
  });

  test("有下级的行给展开指示（> 图标），无下级的行占位对齐", () => {
    const withKids = render('[{"label":"浙江","value":"zj","children":[{"label":"杭州","value":"hz"}]}]');
    expect(withKids).toContain("ChevronRightIcon");
    const leafOnly = render('[{"label":"江苏","value":"js"}]');
    expect(leafOnly).toContain("js");
    expect(leafOnly).not.toContain("ChevronRightIcon");
  });

  test("空态提示与添加入口恒在", () => {
    const html = render('[{"label":"浙江","value":"zj"}]');
    expect(html).toContain("选项树");
    expect(html).toContain("添加首级选项");
  });
});
