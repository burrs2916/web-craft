import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import {
  PAGE_SIZE_OPTIONS,
  buildPaginationModel,
  padDescriptionItems,
  resolveDescriptionItems,
} from "../../editor/data/tableData";
import {
  PAGINATION_FIT,
  cssText,
  resolveCalendarStyle,
  resolveDescriptionsStyle,
  resolvePaginationStyle,
  resolveTableStyle,
  resolveTreeStyle,
} from "../../editor/data/tableStyle";

initBuiltinCodegens();

/**
 * 表格组件组（table / pagination / calendar / descriptions / tree）的发布端契约锁。
 *
 * 三条不变量：
 * 1. **发布端产物里的样式值必须等于共享解析器的输出**（逐值对照）——
 *    两侧只要有一边再写死字面量就会红。
 * 2. **状态切换时才变化的属性绝不能出现在 inline style 上**（本仓库血案纪律）。
 * 3. **渲染器源码必须从 data 层取口径**，不得再写默认值字面量（静态不变量）。
 */

const mk = (type: string, config: Record<string, unknown>, size?: { width: number; height: number }): SceneComponent => ({
  id: "c1",
  type,
  name: type,
  transform: createDefaultTransform({ x: 0, y: 0, width: size?.width ?? 400, height: size?.height ?? 300 }),
  layerId: "l1",
  zIndex: 0,
  locked: false,
  visible: true,
  config,
  children: [],
  parentId: null,
});

const ctx = { pageScripts: [] } as never;

const render = (type: string, config: Record<string, unknown>): string =>
  getCodegen(type)!(mk(type, config), ctx);

/** 断言产物里存在指定 class 元素的 style 属性等于给定声明串（顺序无关） */
const expectDeclsPresent = (html: string, decls: string) => {
  const expected = decls.split(";").filter(Boolean).map((d) => d.trim());
  const styles = [...html.matchAll(/style="([^"]*)"/g)].map((m) => m[1]);
  const hit = styles.some((s) => {
    const set = new Set(s.split(";").filter(Boolean).map((d) => d.trim()));
    return expected.every((d) => set.has(d));
  });
  expect(hit, `未找到包含这些声明的元素：${decls}`).toBe(true);
};

/* ══════════════════════════════════════════════
 * 1. 逐值对照：发布端产物 == 共享解析器输出
 * ══════════════════════════════════════════════ */

describe("表格：发布端样式 == resolveTableStyle 输出（逐值）", () => {
  const configs: Array<[string, Record<string, unknown>]> = [
    ["缺省", {}],
    ["关闭表头+关闭边框+紧凑", { showHeader: false, borderEnabled: false, density: "compact" }],
    ["中号字重+居中+虚线+圆角", {
      headerFontWeight: "medium", align: "center", borderStyle: "dashed", borderRadius: 12,
    }],
    ["固定表头+关闭斑马纹", { stickyHeader: true, stripeEnabled: false }],
  ];

  for (const [name, config] of configs) {
    test(name, () => {
      const config2 = {
        headers: "a,b",
        rows: "1,2\n3,4",
        ...config,
      };
      const html = render("table", config2);
      const s = resolveTableStyle(config2);

      // 外层容器
      expect(html).toContain(`style="${cssText(s.outer)}"`);
      // 表头单元格（固定表头时追加 sticky 声明）；关闭表头时不应有 thead
      if (s.showHeader) {
        const thDecls = { ...s.th, ...(s.stickyHeader ? { position: "sticky", top: "0", zIndex: "1" } : {}) };
        expectDeclsPresent(html, cssText(thDecls));
      } else {
        expect(html).not.toContain("<thead>");
      }
      // 数据行：第 0 行无斑马纹、第 1 行有斑马纹（逐行口径）
      expectDeclsPresent(html, cssText(s.td(0)));
      if (s.stripeEnabled) {
        expectDeclsPresent(html, cssText(s.td(1)));
        expect(cssText(s.td(1))).toContain(`background-color:${s.stripeColor}`);
        expect(cssText(s.td(0))).not.toContain("background-color");
      }
    });
  }

  test("关闭表头时不输出 thead", () => {
    const html = render("table", { showHeader: false, headers: "a,b", rows: "1,2" });
    expect(html).not.toContain("<thead>");
  });

  test("空数据时输出空态文案与空态配色", () => {
    const html = render("table", { headers: "a", rows: "", emptyText: "无记录", emptyColor: "#abcdef" });
    expect(html).toContain("无记录");
    expect(html).toContain("#abcdef");
  });

  test("接口模式下 authEnabled 三态透传（缺省 = null，不压成 false）", () => {
    const html = render("table", { dataMode: "api", apiUrl: "https://x/y" });
    expect(html).toContain("var authEnabled = null");

    const on = render("table", { dataMode: "api", apiUrl: "https://x/y", authEnabled: true });
    expect(on).toContain("var authEnabled = true");

    const off = render("table", { dataMode: "api", apiUrl: "https://x/y", authEnabled: false });
    expect(off).toContain("var authEnabled = false");
  });
});

describe("分页：发布端样式 == resolvePaginationStyle 输出（逐值）", () => {
  test("按钮基础声明的值完全来自解析器", () => {
    const config = { size: "large", shape: "square", borderRadius: 8, gap: 12 };
    const html = render("pagination", config);
    const s = resolvePaginationStyle(config);
    expectDeclsPresent(html, cssText(s.btn));
    expect(html).toContain(`gap:${s.gap}px`);
  });

  test("圆形形状把圆角改成按钮半径的圆", () => {
    const s = resolvePaginationStyle({ size: "medium", shape: "round", borderRadius: 4 });
    expect(s.radius).toBe(16);
    expect(s.radiusCss).toBe("16px");
  });

  test("页码序列与 buildPaginationModel 完全一致（服务端渲染）", () => {
    const config = { current: 5, pageSize: 10, total: 100, maxButtons: 5 };
    const html = render("pagination", config);
    const m = buildPaginationModel(config);
    for (const item of m.pageItems) {
      if (item === "ellipsis") continue;
      expect(html).toContain(`data-page="${item}"`);
    }
    expect(html).toContain("共 100 条");
    // 当前页带 is-active（类规则承载选中态）
    expect(html).toMatch(/class="pg-[a-z0-9]+-item is-active" style="[^"]*" data-page="5"/);
  });

  test("第一页时上一页带 is-disabled 类", () => {
    const html = render("pagination", { current: 1, total: 100 });
    expect(html).toContain("is-disabled");
  });

  test("只读时不绑定点击（脚本内条件为假）", () => {
    const html = render("pagination", { disabled: true });
    expect(html).toContain("if (false) {");
  });

  test("scaleFit 开关控制缩放舞台（与 PAGINATION_FIT 同一基准）", () => {
    const on = render("pagination", {});
    expect(on).toContain(`var RW=${PAGINATION_FIT.refW},RH=${PAGINATION_FIT.refH},MIN=${PAGINATION_FIT.min},MAX=${PAGINATION_FIT.max}`);
    expect(on).toContain("-st\" style=");
    expect(on).toMatch(/class="pg-[a-z0-9]+-in"/);

    const off = render("pagination", { scaleFit: false });
    expect(off).not.toContain(`var RW=${PAGINATION_FIT.refW}`);
  });

  test("接口模式：统一取数骨架 + uid 作用域（不再全局 querySelectorAll）", () => {
    const html = render("pagination", { dataMode: "api", apiUrl: "https://x/y", authEnabled: true });
    expect(html).toContain("getNestedValue");
    expect(html).toContain("setInterval(doFetch, apiInterval * 1000)");
    expect(html).toContain("var authEnabled = true");
    // 所有选择器都锚定在自身 wrap 容器内
    expect(html).not.toMatch(/document\.querySelectorAll\('\.pg-/);
    expect(html).toContain(`document.querySelector('.pg-`);
  });
});

describe("日历：发布端 == resolveCalendarStyle 输出（逐值）", () => {
  test("样式常量逐个透传到运行时", () => {
    const config = { weekStartsOn: 1, cellSize: "large", borderEnabled: true, weekStartsOn_dup: 1 };
    const html = render("calendar", config);
    const s = resolveCalendarStyle(config);
    expect(html).toContain(`var FONT = ${s.fontSize}`);
    expect(html).toContain(`var CELL_H = ${s.cellHeight}`);
    expect(html).toContain(`var STARTS_ON = 1`);
    expect(html).toContain(`var SELECTED_BG = ${JSON.stringify(s.selectedBg)}`);
    expect(html).toContain(`var GRID_LINE = ${JSON.stringify(`1px solid ${s.gridLineColor}`)}`);
  });

  test("周起始为周一时星期栏标签轮转（发布端数组同口径）", () => {
    const html = render("calendar", { weekStartsOn: 1 });
    expect(html).toContain('var STARTS_ON = 1');
    expect(html).toContain('var WEEKDAYS = ["日","一","二","三","四","五","六"]');
    expect(html).toContain("WEEKDAYS.slice(1).concat([WEEKDAYS[0]])");
  });

  test("静态标记被索引进运行时 marks 表", () => {
    const html = render("calendar", { marks: '[{"date":"2026-09-20","label":"发布会"}]' });
    expect(html).toContain('"date":"2026-09-20"');
    expect(html).toContain("indexMarks(");
  });

  test("只读时不绑定导航/日期点击", () => {
    const html = render("calendar", { disabled: true });
    expect(html).toContain("if (DISABLED) return;");
  });
});

describe("描述列表：发布端 == resolveDescriptionsStyle 输出（逐值）", () => {
  test("水平布局网格模板与解析器一致（修掉两端 1fr2fr / 100% 的分歧）", () => {
    const config = { columns: 3 };
    const html = render("descriptions", { ...config, items: "a: 1\nb: 2" });
    const s = resolveDescriptionsStyle(config);
    const labelTrack = s.labelWidth > 0 ? `${s.labelWidth}px` : "minmax(0,1fr)";
    expect(html).toContain(`grid-template-columns:repeat(3, ${labelTrack} minmax(0,2fr))`);
  });

  test("标签列宽度 > 0 时使用固定像素轨道", () => {
    const html = render("descriptions", { columns: 2, labelWidth: 120, items: "a: 1" });
    expect(html).toContain("repeat(2, 120px minmax(0,2fr))");
  });

  test("补齐到列数整数倍（空单元格也输出，网格不塌）", () => {
    const html = render("descriptions", { columns: 3, items: "a: 1" });
    const padded = padDescriptionItems(resolveDescriptionItems({ config: { items: "a: 1" } }), 3);
    expect(padded).toHaveLength(3);
    expect(html).toContain("border-right");
  });

  test("垂直布局走 flex 换行分支", () => {
    const html = render("descriptions", { layout: "vertical", columns: 2, items: "a: 1" });
    expect(html).toContain("display:flex;flex-wrap:wrap");
    expect(html).not.toContain("display:grid");
  });

  test("接口模式：统一取数骨架 + 认证三态", () => {
    const html = render("descriptions", { dataMode: "api", apiUrl: "https://x/y" });
    expect(html).toContain("var authEnabled = null");
    expect(html).toContain("render(collect(data));");
  });
});

describe("树形控件：发布端 == resolveTreeStyle 输出（逐值）", () => {
  test("节点行内样式与解析器一致（缩进/圆角/行高）", () => {
    const config = { indent: 24, borderRadius: 6, rowHeight: 30 };
    const html = render("tree", { ...config, data: '[{"label":"root","children":[{"label":"kid"}]}]' });
    const s = resolveTreeStyle(config);
    expect(html).toContain(`margin-left:0px;height:${s.rowHeight}px;border-radius:${s.radius}px;`);
    expect(html).toContain(`margin-left:${s.indent}px;height:${s.rowHeight}px;`);
  });

  test("默认展开层级 99 = 全部展开（根节点带 is-open）", () => {
    const html = render("tree", { defaultExpandLevel: 99, data: '[{"label":"root","children":[{"label":"kid"}]}]' });
    expect(html).toContain("is-open");
  });

  test("默认展开层级 0 = 全折叠（节点不带 is-open 类）", () => {
    const html = render("tree", { defaultExpandLevel: 0, data: '[{"label":"root","children":[{"label":"kid"}]}]' });
    // 类规则本身恒在样式表里，断言的是"节点上没有 is-open 类"
    expect(html).toContain(".is-open{");
    expect(html).not.toContain(' is-open"');
  });

  test("空数据显示空态文案", () => {
    const html = render("tree", { dataMode: "api", apiUrl: "https://x/y", emptyText: "没有节点" });
    expect(html).toContain("没有节点");
  });

  test("关闭箭头图标 / 打开连接线", () => {
    const noIcon = render("tree", { showIcon: false, data: '[{"label":"r","children":[{"label":"k"}]}]' });
    expect(noIcon).not.toContain(`-arrow"`);
    const withLine = render("tree", { showLine: true, data: '[{"label":"r","children":[{"label":"k"}]}]' });
    expect(withLine).toContain(`-line"`);
  });
});

/* ══════════════════════════════════════════════
 * 2. 状态属性不得写 inline（仓库血案纪律）
 * ══════════════════════════════════════════════ */

const STATE_ATTRS = [
  "background", "backgroundColor", "color", "display", "left", "right", "top",
  "opacity", "border", "fontWeight", "visibility",
];

describe("表格组：状态切换属性不得由 JS 直接写 inline", () => {
  const cases: Array<[string, string, Record<string, unknown>]> = [
    ["table", "静态", { headers: "a", rows: "1\n2" }],
    ["table", "接口", { dataMode: "api", apiUrl: "https://x/y" }],
    ["pagination", "静态", { current: 3, total: 100 }],
    ["pagination", "接口", { dataMode: "api", apiUrl: "https://x/y" }],
    ["pagination", "可跳转", { showQuickJumper: true }],
    ["calendar", "静态", { marks: '[{"date":"2026-09-20"}]' }],
    ["calendar", "接口", { dataMode: "api", apiUrl: "https://x/y" }],
    ["descriptions", "接口", { dataMode: "api", apiUrl: "https://x/y" }],
    ["tree", "静态", { data: '[{"label":"r","children":[{"label":"k"}]}]' }],
    ["tree", "接口", { dataMode: "api", apiUrl: "https://x/y" }],
  ];

  for (const [type, label, config] of cases) {
    test(`${type}（${label}）：无 .style.状态属性 = 赋值，且状态规则由类名承载`, () => {
      const html = render(type, config);
      for (const attr of STATE_ATTRS) {
        const re = new RegExp(`\\.style\\.${attr}\\s*=`);
        expect(re.test(html), `发现内联状态写入 ${attr}`).toBe(false);
      }
      // 有交互态（悬浮/选中/展开）的组件必须有 <style> 承载类规则；
      // descriptions 无任何状态变化，全部声明都可以安全内联。
      if (type !== "descriptions") {
        expect(html).toContain("<style>");
      }
    });
  }

  test("有交互的组件用 classList 切换状态（而非改 inline）", () => {
    expect(render("pagination", { current: 3, total: 100 })).toContain("classList");
    expect(render("tree", { data: '[{"label":"r","children":[{"label":"k"}]}]' })).toContain("classList");
  });

  test("table 的行悬浮由 CSS 类规则给出（不是 inline）", () => {
    const html = render("table", { headers: "a", rows: "1" });
    const s = resolveTableStyle({ headers: "a", rows: "1" });
    expect(html).toContain(`tbody tr:hover td{background-color:${s.hoverBg};}`);
  });

  test("pagination 的选中/悬浮/禁用由类规则给出", () => {
    const html = render("pagination", {});
    const s = resolvePaginationStyle({});
    expect(html).toContain(".is-active{");
    expect(html).toContain(`background-color:${s.activeBgColor}`);
    expect(html).toContain(`:hover{background-color:${s.hoverBg};}`);
    expect(html).toContain(".is-disabled{opacity:0.4;pointer-events:none;}");
  });

  test("tree 的展开态由 is-open 类规则给出（箭头旋转也走类规则）", () => {
    const html = render("tree", { data: '[{"label":"r","children":[{"label":"k"}]}]' });
    expect(html).toContain("-kids{display:none;");
    expect(html).toContain("-kids.is-open{display:flex;}");
    expect(html).toContain("-lbl.is-open .");
    expect(html).toContain("transform:rotate(90deg);");
    expect(html).toContain("-lbl.is-sel{background-color:");
  });
});

/* ══════════════════════════════════════════════
 * 3. 渲染器源码不变量：口径只来自 data 层
 * ══════════════════════════════════════════════ */

describe("表格组渲染器：只读共享解析器，不再自带默认值字面量", () => {
  const root = process.cwd();
  const files: Array<[string, string[]]> = [
    ["TableRenderer.tsx", ["../data/tableData", "../data/tableStyle"]],
    ["PaginationRenderer.tsx", ["../data/tableData", "../data/tableStyle"]],
    ["CalendarRenderer.tsx", ["../data/tableData", "../data/tableStyle"]],
    ["DescriptionsRenderer.tsx", ["../data/tableData", "../data/tableStyle"]],
    ["TreeRenderer.tsx", ["../data/tableData", "../data/tableStyle"]],
  ];

  for (const [file, imports] of files) {
    test(`${file}：导入共享口径`, () => {
      const src = fs.readFileSync(path.join(root, "src/editor/renderers", file), "utf8");
      for (const imp of imports) {
        expect(src, `${file} 缺少 ${imp} 的导入`).toContain(`from "${imp}"`);
      }
    });

    test(`${file}：不写硬编码颜色默认值（|| 或 ?? 后接色值）`, () => {
      const src = fs.readFileSync(path.join(root, "src/editor/renderers", file), "utf8");
      const hardcoded = src.match(/(?:\|\||\?\?)\s*"(?:#|rgba?\()/g) ?? [];
      expect(hardcoded, `发现硬编码颜色默认值：${hardcoded.join(", ")}`).toHaveLength(0);
    });
  }

  test("PAGE_SIZE_OPTIONS 已导出（供后续每页条数下拉复用）", () => {
    expect(PAGE_SIZE_OPTIONS).toContain(10);
  });
});
