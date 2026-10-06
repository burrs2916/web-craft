import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import {
  PAGE_SIZE_OPTIONS,
  padDescriptionItems,
  resolveDescriptionItems,
} from "../../editor/data/tableData";
import {
  cssText,
  resolveCalendarStyle,
  resolveDescriptionsStyle,
  resolveTableStyle,
  resolveTreeStyle,
} from "../../editor/data/tableStyle";

initBuiltinCodegens();

/**
 * 表格组件组（table / calendar / descriptions / tree）的发布端契约锁。
 *
 * 分页不在此列：独立分页器组件已删除，分页是表格的启动项（table.showPagination），
 * 相关契约锁在 pagination-link.test.ts / pagination-not-standalone.test.ts。
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

describe("日历：发布端 == resolveCalendarStyle 输出（逐值）", () => {
  test("样式常量逐个透传到运行时", () => {
    const config = { weekStartsOn: 1, cellSize: "large", borderEnabled: true, weekStartsOn_dup: 1 };
    const html = render("calendar", config);
    const s = resolveCalendarStyle(config);
    expect(html).toContain(`var FONT = ${s.fontSize}`);
    expect(html).toContain(`var CELL_H = ${s.cellHeight}`);
    expect(html).toContain(`var STARTS_ON = 1`);
    expect(html).toContain(`var SELECTED_BG = ${JSON.stringify(s.selectedBg)}`);
    // GRID_COLOR 只注入裸颜色（运行时统一拼 '1px solid '+颜色；注入完整 border 值会双拼成非法样式）
    expect(html).toContain(`var GRID_COLOR = ${JSON.stringify(s.gridLineColor)}`);
  });

  test("组件外框：缺省 1px 可见外框；显式 0 = 无框；边框随圆角且 border-box", () => {
    // 缺省（老实例 config 里没有 borderWidth 键）：靠解析器缺省也必须有可见外框
    const legacy = render("calendar", {});
    expect(resolveCalendarStyle({}).borderWidth).toBe(1);
    expect(legacy).toMatch(/border:1px solid rgba\(255,255,255,0\.15\)/);
    expect(legacy).not.toContain("border:none");

    // 显式关掉：真的没有边框
    const off = render("calendar", { borderWidth: 0 });
    expect(off).toContain("border:none");

    // 边框随圆角/颜色走同一口径
    const cfg = { borderWidth: 2, borderColor: "#FF9800", borderRadius: 10 };
    const s = resolveCalendarStyle(cfg);
    const framed = render("calendar", cfg);
    expect(s.borderWidth).toBe(2);
    expect(framed).toContain("border:2px solid #FF9800");
    expect(framed).toContain("border-radius:10px");
    // 100% 宽高 + 边框必须 border-box，否则发布端比设计尺寸大 2×borderWidth
    expect(framed).toContain("box-sizing:border-box");
  });

  test("周起始为周一时星期栏标签轮转（发布端数组同口径）", () => {
    const html = render("calendar", { weekStartsOn: 1 });
    expect(html).toContain('var STARTS_ON = 1');
    expect(html).toContain('var LOCALE = "zh"');
    // 现在按 locale + weekStartsOn **编译期**排好序注入，运行时不再自己 slice（两端只有一份排序逻辑）
    expect(html).toContain('var WEEK_LABELS = ["一","二","三","四","五","六","日"]');
    expect(html).not.toContain("WEEKDAYS");
    // 周日起始（默认）不轮转
    expect(render("calendar", { weekStartsOn: 0 })).toContain('var WEEK_LABELS = ["日","一","二","三","四","五","六"]');
  });

  test("英文本案整体烘进产物（面向海外客户）", () => {
    const html = render("calendar", { locale: "en", weekStartsOn: 1 });
    expect(html).toContain('var LOCALE = "en"');
    expect(html).toContain('var WEEK_LABELS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]');
    expect(html).toContain('var MONTH_LABELS = ["January","February","March","April","May","June","July","August","September","October","November","December"]');
    expect(html).toContain('var TODAY_TEXT = "Today"');
    // 节日名走同一份 locale 表（函数被 toString() 内联进产物）
    expect(html).toContain("internationalDayInfo");
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
    // 1 条数据 → 补到 3 条 → 展开成 6 格 = 3 组 × 2 轨
    const cells = (html.match(/padding:6px 10px/g) || []).length;
    expect(cells, "3 列 = 6 轨，1 条数据应铺满 6 格").toBe(6);
    expect(html).toContain("border-right");
  });

  /**
   * 产物级锁：格子数必须铺满网格轨道，且标签/值对位正确。
   *
   * 【这次修的 bug】`padDescriptionItems` 按 `columns` 补齐，但水平网格是
   * `repeat(N, 标签列 值列)` = N 组 × 2 轨 → 格子数填不满轨道：
   *   2 列 + 2 条数据 → 只渲染 2 格 → 第 1 行被占满，
   *   **第 2 条数据的标签落到下一行标签列、值列空着** → 用户看到「作者的值不见了」。
   *
   * ⚠️ 判据必须数**产物里实际的格子数**并比对其文本顺序 ——
   * 只锁 `padDescriptionItems` 的长度不够：发布端运行时还另有一份 `pad()`
   * （接口模式用），两边都得对。
   */
  test("产物：格子数铺满「列数 × 2」轨道，标签与值对位", () => {
    const items = [
      { label: "产品名称", value: "WebCraft" },
      { label: "作者", value: "文超" },
    ];
    const html = render("descriptions", { columns: 2, items: JSON.stringify(items) });
    // 数网格里渲染了几个格子（每格都是 padding:6px 10px 的水平单元格）
    const cells = (html.match(/padding:6px 10px/g) || []).length;
    expect(cells, "2 列 = 4 条轨道，2 条数据必须补到 4 格").toBe(4);
    // 对位：标签1 | 值1 | 标签2 | 值2 —— 关键是「作者」后面必须跟着「文超」
    // ⚠️ 判据要**按格子切分**再取文本，不能用宽泛的 `>([^<>]+)</div>` ——
    // 外层容器也是 div，会把整段一起匹配掉（实测踩过：作者/文超 根本匹配不到）。
    const order = [...html.matchAll(/<div style="padding:6px 10px[^"]*">([^<]*)<\/div>/g)].map((m) => m[1]);
    expect(order, "应能切出 4 个水平格子").toHaveLength(4);
    // 偶数索引 = 标签列，奇数 = 值列
    expect(order[0], "第 1 格是标签").toBe("产品名称");
    expect(order[1], "第 2 格是它的值").toBe("WebCraft");
    expect(order[2], "第 3 格是第 2 条的标签").toBe("作者");
    expect(order[3], "第 4 格必须是「文超」—— 曾经这里被吞成「—」").toBe("文超");
  });

  test("发布端运行时也做「每条展开两格」（接口模式同样不能错位）", () => {
    const SRC = fs.readFileSync(
      path.resolve(__dirname, "../components/descriptions.ts"),
      "utf8",
    );
    // 编译期 + 运行时两处都要有「每条 → [标签格, 值格]」的展开动作
    const expansions = (SRC.match(/isLabel: (true|false)/g) || []).length;
    expect(
      expansions,
      "编译期与运行时各 2 处 isLabel（每条推两个格子）",
    ).toBeGreaterThanOrEqual(4);
    // 旧写法（用 i%2 判断列，遍历的却是「每条一个对象」的数组）必须绝迹。
    // 只查代码行：修复说明的注释里故意引用了那个写法来解释坑点，整段 not.toMatch 会误报自己。
    const codeLines = SRC.split("\n").filter(
      (l) => !l.trim().startsWith("*") && !l.trim().startsWith("//"),
    );
    expect(
      codeLines.filter((l) => l.includes("i % 2 === 0")),
      "代码里不该再用 i%2 判断标签/值列",
    ).toEqual([]);
    expect(codeLines.filter((l) => l.includes("isLabelCol")), "不该再有 isLabelCol").toEqual([]);
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
    expect(render("tree", { data: '[{"label":"r","children":[{"label":"k"}]}]' })).toContain("classList");
    // 表格分页栏不走 classList：bindPager 是整段重写 innerHTML（状态码在 style 里），故不在此列
  });

  test("table 的行悬浮由 CSS 类规则给出（不是 inline）", () => {
    const html = render("table", { headers: "a", rows: "1" });
    const s = resolveTableStyle({ headers: "a", rows: "1" });
    expect(html).toContain(`tbody tr:hover td{background-color:${s.hoverBg};}`);
  });

  test("表格内置分页栏：选中/禁用态走类规则（不再内联写色）", () => {
    // 分页栏按钮 HTML 由注入脚本（ctx.pageScripts）里的 buildPagerHtml 生成，
    // 模块级 render 只取静态产物、不带注入脚本，这里拼上 pageScripts 看"完整产物"。
    const sink = { pageScripts: [] as string[], pageStyles: [] as string[] };
    const html = getCodegen("table")!(mk("table", { showPagination: true, current: 3, total: 100, headers: "a", rows: "1" }), sink as never)
      + sink.pageScripts.join("\n");
    expect(html).toContain("data-pg=");
    // 选中/禁用态由类规则承载（修复：状态切换属性只能由类规则给，inline 会压制类规则）。
    // 独立分页器的 .is-active / .is-disabled 类规则随组件删除后表格没接上，现已补进发布端 styleTag。
    expect(html).toContain(".is-active{");
    expect(html).toContain(".is-disabled{");
    // 类规则里带上了选中底色（取自 resolveTablePagerStyle，默认 #2196F3，非写死）
    expect(html).toMatch(/is-active\{[^}]*background-color:#2196F3/);
    // 按钮 inline 不再内联背景色 —— 否则会压制类规则，选中色失效
    expect(html).not.toMatch(/<button[^>]*style="[^"]*background-color/);
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
