import { describe, test, expect } from "vitest";
import {
  DEFAULT_DESCRIPTION_ITEMS,
  DEFAULT_TREE_DATA,
  buildMonthGrid,
  buildPaginationModel,
  collectBranchKeys,
  collectKeysByLevel,
  countTreeNodes,
  daysInMonth,
  hasBranch,
  indexCalendarMarks,
  isWeekendColumn,
  normalizeCalendarMarks,
  normalizeDescriptionPayload,
  normalizePaginationTotal,
  normalizeTablePayload,
  normalizeTreePayload,
  padDescriptionItems,
  parseDateValue,
  parseDescriptionItems,
  parseTableHeaders,
  parseTableRows,
  parseTreeNodes,
  resolveCalendarMarks,
  resolveDescriptionItems,
  resolveTableData,
  resolveTreeData,
  toDateKey,
  weekdayLabels,
} from "../data/tableData";

/**
 * 表格族「唯一取值口径」的数据层单测。
 *
 * 这些函数是编辑区渲染器与发布端 codegen 的**共同上游**：只要它们行为稳定，
 * 两端就不可能各解析出不同结果。此前两端各写一份（parseHeaders/parseRows/
 * resolveApiTableData/parseData/normalizeTree/parseItems/toDescItems/computePageRange
 * 共 8 份），本用例锁住收口后的行为契约。
 */

describe("表格：表头 / 行 / 归一", () => {
  test("parseTableHeaders：逗号分隔、去空白、过滤空项、接受数组", () => {
    expect(parseTableHeaders("名称, 价格 ,库存")).toEqual(["名称", "价格", "库存"]);
    expect(parseTableHeaders("名称,,库存")).toEqual(["名称", "库存"]);
    expect(parseTableHeaders(["a", "b"])).toEqual(["a", "b"]);
    expect(parseTableHeaders(undefined)).toEqual([]);
  });

  test("parseTableRows：换行+逗号，丢掉全空行", () => {
    expect(parseTableRows("a,b\nc,d")).toEqual([["a", "b"], ["c", "d"]]);
    expect(parseTableRows("a,b\n\n \n c,d")).toEqual([["a", "b"], ["c", "d"]]);
    expect(parseTableRows([[1, 2], 3])).toEqual([["1", "2"], ["3"]]);
  });

  test("normalizeTablePayload：对象数组以首项键为表头", () => {
    const m = normalizeTablePayload([
      { name: "节点A", load: 12 },
      { name: "节点B", load: 30 },
    ]);
    expect(m).toEqual({ headers: ["name", "load"], rows: [["节点A", "12"], ["节点B", "30"]] });
  });

  test("normalizeTablePayload：二维数组无表头 / {columns,rows} / 单对象 / JSON 字符串", () => {
    expect(normalizeTablePayload([["a", "b"]])).toEqual({ headers: [], rows: [["a", "b"]] });
    expect(normalizeTablePayload({ columns: ["x"], rows: [[1], [2]] }))
      .toEqual({ headers: ["x"], rows: [["1"], ["2"]] });
    expect(normalizeTablePayload({ a: 1, b: "z" }))
      .toEqual({ headers: ["字段", "值"], rows: [["a", "1"], ["b", "z"]] });
    expect(normalizeTablePayload('[{"k":1}]')).toEqual({ headers: ["k"], rows: [["1"]] });
  });

  test("normalizeTablePayload：无法识别时返回 null（不抛异常）", () => {
    expect(normalizeTablePayload(null)).toBeNull();
    expect(normalizeTablePayload("")).toBeNull();
    expect(normalizeTablePayload("纯文本")).toBeNull();
    expect(normalizeTablePayload("{坏JSON")).toBeNull();
  });

  test("resolveTableData：接口模式只认接口数据；无数据时为空表（不闪占位行）", () => {
    const config = { headers: "占位头", rows: "占位行,占位行" };
    expect(resolveTableData({ config, fetched: undefined, isApi: true })).toEqual({ headers: [], rows: [] });
    expect(resolveTableData({ config, fetched: [{ a: 1 }], isApi: true }))
      .toEqual({ headers: ["a"], rows: [["1"]] });
  });

  test("resolveTableData：staticData 优先于 headers/rows，识别失败才回退", () => {
    expect(resolveTableData({
      config: { staticData: [{ a: 1 }], headers: "h", rows: "r" },
      isApi: false,
    })).toEqual({ headers: ["a"], rows: [["1"]] });

    expect(resolveTableData({
      config: { staticData: "不是JSON", headers: "h1,h2", rows: "r1,r2" },
      isApi: false,
    })).toEqual({ headers: ["h1", "h2"], rows: [["r1", "r2"]] });

    expect(resolveTableData({
      config: { headers: "h1", rows: "r1" },
      isApi: false,
    })).toEqual({ headers: ["h1"], rows: [["r1"]] });
  });
});

describe("描述列表：静态文本 / 接口归一 / 默认值", () => {
  test("parseDescriptionItems：三种写法", () => {
    expect(parseDescriptionItems('[{"label":"版本","value":"1.0"}]')).toEqual([{ label: "版本", value: "1.0" }]);
    expect(parseDescriptionItems("版本: 1.0\n许可：MIT"))
      .toEqual([{ label: "版本", value: "1.0" }, { label: "许可", value: "MIT" }]);
    expect(parseDescriptionItems("仅标签")).toEqual([{ label: "仅标签", value: "" }]);
    expect(parseDescriptionItems("")).toEqual([]);
  });

  test("normalizeDescriptionPayload：字段别名 + 单对象展开 + 跳过嵌套对象", () => {
    expect(normalizeDescriptionPayload([{ name: "n", text: "t" }, { key: "k", value: "v" }]))
      .toEqual([{ label: "n", value: "t" }, { label: "k", value: "v" }]);
    expect(normalizeDescriptionPayload({ a: 1, b: { nested: true } }))
      .toEqual([{ label: "a", value: "1" }]);
    expect(normalizeDescriptionPayload(42)).toEqual([]);
  });

  test("resolveDescriptionItems：接口 > 静态 > 内容组 > 默认占位", () => {
    expect(resolveDescriptionItems({
      config: { dataMode: "api", items: "内容: 组" },
      fetched: { zone: "A" },
    })).toEqual([{ label: "zone", value: "A" }]);

    expect(resolveDescriptionItems({
      config: { dataMode: "static", staticData: '{"zone":"B"}', items: "内容: 组" },
    })).toEqual([{ label: "zone", value: "B" }]);

    expect(resolveDescriptionItems({ config: { items: "内容: 组" } }))
      .toEqual([{ label: "内容", value: "组" }]);

    expect(resolveDescriptionItems({ config: {} })).toEqual(DEFAULT_DESCRIPTION_ITEMS);
    // 接口模式拿不到数据时不落默认占位（避免"假数据"被误当成接口结果）
    expect(resolveDescriptionItems({ config: { dataMode: "api" }, fetched: null })).toEqual([]);
  });

  test("padDescriptionItems：补齐到列数整数倍", () => {
    expect(padDescriptionItems([{ label: "a", value: "1" }], 3)).toHaveLength(3);
    expect(padDescriptionItems([{ label: "a", value: "1" }], 1)).toHaveLength(1);
    expect(padDescriptionItems([], 2)).toHaveLength(0);
  });
});

describe("树：归一 / 取值 / 展开键", () => {
  test("normalizeTreePayload：标签与子节点键的别名", () => {
    const out = normalizeTreePayload([
      { title: "A", nodes: [{ text: "a1" }] },
      { name: "B", items: [{ label: "b1" }] },
      "裸字符串",
      { children: [{ label: "x" }] },
      null,
    ]);
    expect(out).toEqual([
      { label: "A", children: [{ label: "a1" }] },
      { label: "B", children: [{ label: "b1" }] },
      { label: "裸字符串" },
    ]);
  });

  test("parseTreeNodes：只接受数组 JSON；坏数据返回空数组", () => {
    expect(parseTreeNodes('[{"label":"x"}]')).toEqual([{ label: "x" }]);
    expect(parseTreeNodes("{}")).toEqual([]);
    expect(parseTreeNodes("{坏")).toEqual([]);
  });

  test("resolveTreeData：接口 > 静态 > 内容组 > 默认占位", () => {
    expect(resolveTreeData({ config: { dataMode: "api" }, fetched: [{ label: "接口" }] }))
      .toEqual([{ label: "接口" }]);
    expect(resolveTreeData({ config: { dataMode: "api" }, fetched: null })).toEqual([]);
    expect(resolveTreeData({
      config: { staticData: '[{"label":"静态"}]', data: '[{"label":"内容"}]' },
    })).toEqual([{ label: "静态" }]);
    expect(resolveTreeData({ config: { data: '[{"label":"内容"}]' } })).toEqual([{ label: "内容" }]);
    expect(resolveTreeData({ config: {} })).toEqual(DEFAULT_TREE_DATA);
  });

  test("collectBranchKeys：只收有子节点的键；键口径与两端渲染一致（前缀+索引）", () => {
    const data = [
      { label: "root", children: [{ label: "leaf" }, { label: "branch", children: [{ label: "n" }] }] },
      { label: "leaf2" },
    ];
    expect(collectBranchKeys(data)).toEqual(["0", "0-1"]);
    expect(hasBranch(data)).toBe(true);
    expect(countTreeNodes(data)).toBe(5);
  });

  test("collectKeysByLevel：0 全折叠 / 1 只展开根 / 99 全展开", () => {
    const data = [
      { label: "root", children: [{ label: "mid", children: [{ label: "leaf" }] }] },
    ];
    expect(collectKeysByLevel(data, 0)).toEqual([]);
    expect(collectKeysByLevel(data, 1)).toEqual(["0"]);
    expect(collectKeysByLevel(data, 2)).toEqual(["0", "0-0"]);
    expect(collectKeysByLevel(data, 99)).toEqual(["0", "0-0"]);
    expect(collectKeysByLevel(data, 99)).toEqual(collectBranchKeys(data));
  });
});

describe("分页：模型唯一算法", () => {
  test("总页数 ≤ 按钮数时全部平铺", () => {
    const m = buildPaginationModel({ current: 1, pageSize: 10, total: 30, maxButtons: 5 });
    expect(m.totalPages).toBe(3);
    expect(m.pageItems).toEqual([1, 2, 3]);
    expect(m.canPrev).toBe(false);
    expect(m.canNext).toBe(true);
  });

  test("总页数 > 按钮数：以当前页为中心，首尾补 1/末页与省略号", () => {
    const m = buildPaginationModel({ current: 5, pageSize: 10, total: 100, maxButtons: 5 });
    expect(m.totalPages).toBe(10);
    expect(m.pageItems).toEqual([1, "ellipsis", 3, 4, 5, 6, 7, "ellipsis", 10]);
  });

  test("靠近首尾时不产生多余省略号", () => {
    expect(buildPaginationModel({ current: 1, pageSize: 10, total: 100, maxButtons: 5 }).pageItems)
      .toEqual([1, 2, 3, 4, 5, "ellipsis", 10]);
    expect(buildPaginationModel({ current: 10, pageSize: 10, total: 100, maxButtons: 5 }).pageItems)
      .toEqual([1, "ellipsis", 6, 7, 8, 9, 10]);
  });

  test("当前页夹在 [1, totalPages]，maxButtons 夹在 [3, 9]", () => {
    expect(buildPaginationModel({ current: 999, pageSize: 10, total: 30 }).current).toBe(3);
    expect(buildPaginationModel({ current: -5, pageSize: 10, total: 30 }).current).toBe(1);
    expect(buildPaginationModel({ current: 1, pageSize: 10, total: 1, maxButtons: 999 }).pageItems).toEqual([1]);
  });

  test("非法/缺省入参走默认值（pageSize 10 / total 0 → 1 页）", () => {
    const m = buildPaginationModel({});
    expect(m.pageSize).toBe(10);
    expect(m.total).toBe(0);
    expect(m.totalPages).toBe(1);
    expect(m.pageItems).toEqual([1]);
  });

  test("normalizePaginationTotal：常见响应形态", () => {
    expect(normalizePaginationTotal({ total: 42 })).toBe(42);
    expect(normalizePaginationTotal({ totalCount: 7 })).toBe(7);
    expect(normalizePaginationTotal([1, 2, 3])).toBe(3);
    expect(normalizePaginationTotal(9)).toBe(9);
    expect(normalizePaginationTotal({ other: 1 })).toBeNull();
    expect(normalizePaginationTotal(null)).toBeNull();
  });
});

describe("日历：日期网格 / 标记", () => {
  test("parseDateValue：合法日期解析，非法回落今天", () => {
    expect(parseDateValue("2026-09-20")).toEqual({ year: 2026, month: 8, day: 20 });
    const now = new Date(2026, 0, 15);
    expect(parseDateValue("", now)).toEqual({ year: 2026, month: 0, day: 15 });
    expect(parseDateValue("坏", now)).toEqual({ year: 2026, month: 0, day: 15 });
  });

  test("buildMonthGrid：长度为 7 的倍数，前导空位随起始日变化", () => {
    // 2026-09-01 是周二
    const sun = buildMonthGrid(2026, 8, 0);
    expect(sun.length % 7).toBe(0);
    expect(sun.slice(0, 2)).toEqual([null, null]);
    expect(sun[2]).toBe(1);

    const mon = buildMonthGrid(2026, 8, 1);
    expect(mon.slice(0, 1)).toEqual([null]);
    expect(mon[1]).toBe(1);
  });

  test("daysInMonth / toDateKey 边界", () => {
    expect(daysInMonth(2024, 1)).toBe(29);
    expect(daysInMonth(2026, 1)).toBe(28);
    expect(toDateKey(2026, 0, 5)).toBe("2026-01-05");
  });

  test("weekdayLabels / isWeekendColumn 随起始日轮转", () => {
    expect(weekdayLabels(0)).toEqual(["日", "一", "二", "三", "四", "五", "六"]);
    expect(weekdayLabels(1)).toEqual(["一", "二", "三", "四", "五", "六", "日"]);
    expect(isWeekendColumn(0, 0)).toBe(true);
    expect(isWeekendColumn(0, 1)).toBe(false);
    expect(isWeekendColumn(5, 1)).toBe(true);
  });

  test("normalizeCalendarMarks：数组 / 对象 / JSON 字符串", () => {
    expect(normalizeCalendarMarks([{ date: "2026-09-20", label: "发布会", color: "#f00" }]))
      .toEqual([{ date: "2026-09-20", label: "发布会", color: "#f00" }]);
    expect(normalizeCalendarMarks({ "2026-09-21": "值班" }))
      .toEqual([{ date: "2026-09-21", label: "值班", color: "" }]);
    expect(normalizeCalendarMarks('[{"day":"2026-09-22"}]'))
      .toEqual([{ date: "2026-09-22", label: "", color: "" }]);
    expect(normalizeCalendarMarks("坏")).toEqual([]);
  });

  test("indexCalendarMarks：同日多条归拢", () => {
    const idx = indexCalendarMarks([
      { date: "2026-09-20", label: "a" },
      { date: "2026-09-20", label: "b" },
      { date: "2026-09-21", label: "c" },
    ]);
    expect(idx.get("2026-09-20")).toHaveLength(2);
    expect(idx.get("2026-09-21")).toHaveLength(1);
    expect(idx.get("2026-09-22")).toBeUndefined();
  });

  test("resolveCalendarMarks：接口 > 静态 > 内容组", () => {
    expect(resolveCalendarMarks({ config: { dataMode: "api" }, fetched: [{ date: "a" }] }))
      .toEqual([{ date: "a", label: "", color: "" }]);
    expect(resolveCalendarMarks({ config: { staticData: '{"b":"传"}' } })[0].date).toBe("b");
    expect(resolveCalendarMarks({ config: { marks: '[{"date":"c"}]' } })[0].date).toBe("c");
    expect(resolveCalendarMarks({ config: {} })).toEqual([]);
  });
});
