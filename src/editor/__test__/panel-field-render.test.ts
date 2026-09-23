/**
 * 属性面板**渲染诚实性**锁：schema 里声明的东西，面板必须真的渲染出来。
 *
 * 与 `codegen/__test__/panel-honesty-scan.test.ts`（比对**发布产物**）互补 ——
 * 那一层只能证明「改了值产物会变」，证明不了「面板上看得见」。
 * 本文件直接渲染真实属性面板组件（`EditorPropertyPanelContent`）并断言 DOM 文本。
 *
 * 起因（第 30 轮实测）：`ConfigFieldRenderer` 的整个 switch 里**从来没有渲染过 `field.help`**
 * （唯一消费点在已停用的 DeviceMultiSelectField），于是全仓组件写下的帮助文案全是死数据，
 * 包括级联选择「选项数据」那三种写法的唯一说明。这里把它锁成契约。
 *
 * 实现注意：zustand v5 在 `renderToStaticMarkup` 下取的是 `getInitialState()`（SSR snapshot），
 * 所以必须 mock 掉 editorStore 才能注入「当前选中的组件」——这是唯一能在 node 环境渲染真实面板的方式。
 */
import { describe, test, expect, vi, beforeAll } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createDefaultTransform } from "../../types/editor";

vi.mock("../../store/editorStore", () => {
  const fake = { current: {} };
  const api = {
    getState: () => fake.current,
    getInitialState: () => fake.current,
    setState: (patch: Record<string, unknown>) => {
      Object.assign(fake.current, patch);
    },
    subscribe: () => () => {},
  };
  const useEditorStore = (sel?: (s: Record<string, unknown>) => unknown) =>
    sel ? sel(api.getInitialState()) : api.getInitialState();
  (useEditorStore as unknown as Record<string, unknown>).getState = api.getState;
  (useEditorStore as unknown as Record<string, unknown>).setState = api.setState;
  (useEditorStore as unknown as Record<string, unknown>).subscribe = api.subscribe;
  return { useEditorStore, useEditorActions: () => ({}) };
});

const TRANSFORM = { ...createDefaultTransform(), width: 280, height: 56 };

let renderSelected: (type: string, patch?: Record<string, unknown>) => string;

beforeAll(async () => {
  const { registerFormComponents } = await import("../registerFormComponents");
  const { registerBasicComponents } = await import("../registerBasicComponents");
  const { componentRegistry } = await import("../registryCore");
  const { useEditorStore } = await import("../../store/editorStore");
  const { EditorPropertyPanelContent } = await import("../panels/EditorPropertyPanel");
  registerFormComponents();
  registerBasicComponents();

  renderSelected = (type, patch = {}) => {
    const def = componentRegistry.get(type);
    if (!def) throw new Error(`组件未注册：${type}`);
    const comp = {
      id: "c1",
      type,
      name: def.name,
      config: { ...(def.defaultConfig ?? {}), ...patch },
      transform: TRANSFORM,
      visible: true,
      locked: false,
      zIndex: 0,
      layerId: "l1",
      parentId: null,
    };
    useEditorStore.setState({
      components: [comp],
      layers: [
        { id: "l1", name: "图层", visible: true, locked: false, opacity: 1, parentId: null, children: ["c1"], order: 0, expanded: true, type: "layer" },
      ],
      selection: { selectedIds: ["c1"], hoveredId: null, isMultiSelect: false },
      activeBreakpoint: "desktop",
      maxHistory: 50,
    });
    return renderToStaticMarkup(React.createElement(EditorPropertyPanelContent));
  };
});

describe("属性面板：field.help 必须真的渲染", () => {
  test("级联选择：选项数据/默认路径/分隔符三处帮助文案都在 DOM 里", () => {
    const html = renderSelected("form-cascader");
    expect(html).toContain("选项数据");
    // 选项数据已改树形编辑器（type: "cascader-options"），help 同步为新范式说明
    expect(html).toContain("逐条编辑显示名与提交值");
    expect(html).toContain("各级提交值用 / 分隔");
    expect(html).toContain("既用于触发器上的路径显示");
  });

  test("帮助渲染是通用能力，不是级联专属（评分组件同样可见）", () => {
    const html = renderSelected("form-rate");
    expect(html).toContain("0 分视为未评分");
  });

  test("隐藏字段连帮助一起不渲染（不留「有说明没控件」的孤儿文案）", () => {
    // labelGap 仅「外部上方」标签可见
    const hidden = renderSelected("form-cascader", { labelPlacement: "inside" });
    expect(hidden).not.toContain("仅「外部上方」标签位置生效");
    const shown = renderSelected("form-cascader", { labelPlacement: "top" });
    expect(shown).toContain("仅「外部上方」标签位置生效");
  });
});

describe("属性面板：field.diagnose 状态条", () => {
  test("选项数据留空 → 提醒正在使用内置示例，并给出示例结构", () => {
    const html = renderSelected("form-cascader", { options: "" });
    expect(html).toContain("当前留空，正在使用内置示例数据");
    expect(html).toContain("浙江 › 杭州");
  });

  test("选项数据 JSON 写坏 → 错误条 + 说明已退化为逐行解析", () => {
    const html = renderSelected("form-cascader", { options: '[{"label":"A"' });
    expect(html).toContain("JSON 语法错误");
    expect(html).toContain("已退化成「逐行文本」解析");
  });

  test("选项数据合法 → 摘要条（层数/项数 + 单行树）", () => {
    const html = renderSelected("form-cascader", {
      options: '[{"label":"省A","value":"a","children":[{"label":"市B","value":"b"}]}]',
    });
    expect(html).toContain("已解析：2 级 / 2 项");
    expect(html).toContain("省A › 市B");
  });

  test("默认选中路径写错 → 逐级命中反馈（旧行为是静默截断）", () => {
    const partial = renderSelected("form-cascader", { value: "zhejiang/nope" });
    expect(partial).toContain("只命中前 1 级");
    expect(partial).toContain("第 2 级「nope」不存在");

    const missing = renderSelected("form-cascader", { value: "zzz" });
    expect(missing).toContain("路径不存在：第 1 级「zzz」");
    expect(missing).toContain("可选首级：zhejiang、jiangsu");
  });

  test("默认选中路径合法 → 正面确认（说清会预选到哪一项）", () => {
    const html = renderSelected("form-cascader", { value: "zhejiang/hangzhou/xihu" });
    expect(html).toContain("将预选中：浙江 / 杭州 / 西湖区");
  });

  test("留空不预选时不刷屏（无诊断行）", () => {
    const html = renderSelected("form-cascader", { value: "" });
    expect(html).not.toContain("将预选中");
    expect(html).not.toContain("路径不存在");
  });

  test("接口模式：路径不做静态校验，改说明运行时解析（避免误报「不存在」）", () => {
    const html = renderSelected("form-cascader", { dataMode: "api", apiUrl: "/api/area", value: "a/b" });
    expect(html).toContain("接口模式：此路径在运行时按接口返回的树解析");
  });

  test("分隔符显隐跟随「提交值」：只在真的会用到时才出现", () => {
    const hidden = renderSelected("form-cascader", { showPath: false, submitMode: "leaf" });
    expect(hidden).not.toContain("路径分隔符");
    const shownBySubmit = renderSelected("form-cascader", { showPath: false, submitMode: "path", separator: "@@" });
    expect(shownBySubmit).toContain("路径分隔符");
    const shownByDisplay = renderSelected("form-cascader", { showPath: true, submitMode: "leaf" });
    expect(shownByDisplay).toContain("路径分隔符");
  });
});

/**
 * `dynamicOptions` 与 `editable` 的组合能力。
 *
 * 旧行为（第 31 轮实测）：`dynamicOptions` 分支**提前 return 并忽略 `editable`**，
 * 且候选为空时整字段 `return null` —— 于是一旦选项数据还没配好，
 * 「默认选中路径」这条**输入框会在面板上直接消失**，用户连手输的机会都没有。
 * 判别特征：MUI Autocomplete 的 `MuiAutocomplete-root` 只在真的渲染了 Autocomplete 时才出现
 * （select / radio / segmented 面板为 0，级联为 42 —— 含 CSS 出现次数，用 contains 即可）。
 */
describe("属性面板：动态候选 + 可自由输入", () => {
  test("级联「默认选中路径」= 可选可输（Autocomplete，而不是只能从列表里选）", () => {
    const html = renderSelected("form-cascader");
    expect(html).toContain("默认选中路径");
    expect(html).toContain("MuiAutocomplete-root");
  });

  test("候选枚举为空时字段依然在（旧行为是整条消失）", () => {
    // 选项数据解析后没有有效项 → cascaderPathOptions 返回空数组
    const html = renderSelected("form-cascader", { options: '[{"label":"","value":""}]' });
    expect(html).toContain("默认选中路径");
    expect(html).toContain("MuiAutocomplete-root");
  });

  test("分段控制器「默认选中值」仍是纯下拉（候选必须来自选项列表，不允许填不存在的值）", () => {
    const html = renderSelected("form-segmented");
    expect(html).toContain("默认选中值");
    expect(html).not.toContain("MuiAutocomplete-root");
  });
});

describe("属性面板：选项族诊断（下拉 / 单选 / 分段）", () => {
  test("下拉选择：选项摘要 + 默认选中索引的正面确认", () => {
    const html = renderSelected("form-select");
    expect(html).toContain("已配置 4 项");
    expect(html).toContain("北京 · 上海 · 广州 · 深圳");
    expect(html).toContain("将默认选中第 1 项「北京」");
  });

  test("单选组：越界索引说明「不会预选」（与下拉的夹取行为相反）", () => {
    const html = renderSelected("form-radio", { selectedIndex: 9 });
    expect(html).toContain("索引 9 超出范围");
    expect(html).toContain("不会预选任何一项");
  });

  test("分段控制器：默认值不在选项列表 → 提示会回退第 1 项", () => {
    const html = renderSelected("form-segmented", { value: "zzz" });
    expect(html).toContain("当前值「zzz」不在选项列表中");
    expect(html).toContain("回退为选中第 1 项「选项一」");
  });

  test("提交值重复 → error 级诊断也出现在面板上", () => {
    const html = renderSelected("form-select", {
      items: [
        { label: "广东", value: "G" },
        { label: "广西", value: "G" },
      ],
    });
    expect(html).toContain("提交值重复");
    expect(html).toContain("无法区分");
  });
});

describe("属性面板：类型级内建诊断（color / number / 未知 type 兜底 / 候选为空）", () => {
  // 探针组件：真实注册表里没有「未知 type」与「候选为空的非 editable select」这种形态，
  // 用一个临时注册的合成组件把四个分支一次覆盖。仅本测试文件内注册，不影响其他用例。
  beforeAll(async () => {
    const { componentRegistry } = await import("../registryCore");
    if (componentRegistry.has("__diag_probe__")) return;
    componentRegistry.register({
      type: "__diag_probe__",
      name: "诊断探针",
      icon: "science",
      description: "仅测试用",
      category: "ccat_test",
      version: "1.0.0",
      enabled: true,
      defaultSize: { width: 200, height: 40 },
      capabilities: {},
      renderer: { kind: "react" },
      defaultConfig: {
        bogus: "",
        num: 99,
        col: "#12345",
        colAlpha: "rgba(0,0,0,0.5)",
        colOk: "#1976d2",
        colNamed: "transparent",
        dyn: "pane-1",
        dynEmpty: "",
      },
      configSchema: [
        { key: "bogus", label: "怪类型", type: "__bogus_type__" as never },
        { key: "num", label: "圆角", type: "number", min: 0, max: 10 },
        { key: "col", label: "边框色", type: "color" },
        { key: "colAlpha", label: "文字色", type: "color" },
        { key: "colOk", label: "正常色", type: "color" },
        { key: "colNamed", label: "命名色", type: "color" },
        { key: "dyn", label: "激活面板", type: "select", dynamicOptions: () => [] },
        { key: "dynEmpty", label: "空候选", type: "select", dynamicOptions: () => [] },
      ],
    } as never);
  });

  test("未知 type：绝不静默消失 —— 必须渲染出显性占位（带类型名与 key）", () => {
    const html = renderSelected("__diag_probe__");
    expect(html).toContain("未支持的字段类型");
    expect(html).toContain("__bogus_type__");
    expect(html).toContain("key: bogus");
  });

  test("number 越界：说明「离开输入框会被夹取成什么」", () => {
    const html = renderSelected("__diag_probe__");
    expect(html).toContain("超出上限 10");
    expect(html).toContain("夹取为 10");
  });

  test("color：拼错的单色 → error；含 alpha → info", () => {
    const html = renderSelected("__diag_probe__");
    expect(html).toContain("不是合法颜色");
    expect(html).toContain("#12345");
    expect(html).toContain("含透明度");
    expect(html).toContain("0.5");
  });

  test("color：正常色与命名色保持静默（宁可漏报也不误报）", () => {
    const html = renderSelected("__diag_probe__");
    const seg = html.slice(html.indexOf("正常色"), html.indexOf("激活面板"));
    expect(seg).not.toContain("不是合法颜色");
    expect(seg).not.toContain("含透明度");
  });

  test("select 候选为空：已有值时必须出声（面板不能对生效中的配置失明）", () => {
    const html = renderSelected("__diag_probe__");
    expect(html).toContain("当前没有可用候选项");
    expect(html).toContain("pane-1");
  });

  test("select 候选为空但值为空：保持安静（字段在该配置下本就无意义）", () => {
    const html = renderSelected("__diag_probe__");
    const seg = html.slice(html.indexOf("空候选"), html.indexOf("空候选") + 400);
    expect(seg).not.toContain("当前没有可用候选项");
  });
});

describe("属性面板：Autocomplete renderInput 必须保留 params.slotProps", () => {
  // MUI v9 的 params 是 slotProps 形态：htmlInput 携带 ref/键盘/role="combobox"，
  // input 携带弹层锚点 ref 与下拉箭头。曾写 slotProps={{ ...floatedLabelProps }} 整体覆盖，
  // 控制台报 "Unable to find the input element" 且自由输入/键盘导航静默失效。
  test("级联「默认选中路径」（editable select → Autocomplete）：input 带 role=combobox 与下拉箭头", () => {
    const html = renderSelected("form-cascader");
    // htmlInput props（ref/键盘/role）真正流到了 input 元素上
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-autocomplete="list"');
    // params.slotProps.input 的 endAdornment（下拉箭头）也保留
    expect(html).toContain("MuiAutocomplete-endAdornment");
  });

  test("悬浮徽标（inputLabel shrink）仍生效，但不能以覆盖 params 为代价", () => {
    const html = renderSelected("form-cascader");
    expect(html).toContain('data-shrink="true"');
  });
});
