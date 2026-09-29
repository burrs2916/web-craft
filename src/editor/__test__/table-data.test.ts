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
  getColumnDefs,
  getRowValues,
  getTableHeaders,
  hasBranch,
  indexCalendarMarks,
  inferColumnDefs,
  isWeekendColumn,
  iterateTableRows,
  normalizeCalendarMarks,
  normalizeDescriptionPayload,
  normalizePaginationTotal,
  normalizeTablePayload,
  normalizeTreePayload,
  padDescriptionItems,
  parseColumnDefs,
  parseDateValue,
  parseDescriptionItems,
  parseTableHeaders,
  parseTableRows,
  parseTreeNodes,
  resolveCalendarMarks,
  resolveDescriptionItems,
  resolveTableData,
  resolveTreeData,
  rowsToData,
  filterTableRows,
  sortTableRows,
  paginateTableRows,
  computeVirtualRange,
  readVirtualScroll,
  readColumnResize,
  VIRTUAL_OVERSCAN,
  toggleRowSelection,
  toggleAllRowsSelection,
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

  test("normalizeTablePayload：对象数组 → 新版列定义自动推断 + 对象数据", () => {
    const m = normalizeTablePayload([
      { name: "节点A", load: 12 },
      { name: "节点B", load: 30 },
    ]);
    expect(m).toEqual({
      columns: [
        { field: "name", header: "name", type: "text", align: "left" },
        { field: "load", header: "load", type: "number", align: "right" },
      ],
      data: [
        { name: "节点A", load: 12 },
        { name: "节点B", load: 30 },
      ],
    });
  });

  test("normalizeTablePayload：二维数组无可推断表头 / 旧式 columns+rows / 单对象 / JSON 字符串", () => {
    expect(normalizeTablePayload([["a", "b"]])).toEqual({ headers: [], rows: [["a", "b"]] });
    expect(normalizeTablePayload({ columns: ["x"], rows: [[1], [2]] }))
      .toEqual({ columns: [{ field: "x", header: "x" }], headers: ["x"], rows: [["1"], ["2"]] });
    expect(normalizeTablePayload({ a: 1, b: "z" }))
      .toEqual({ headers: ["字段", "值"], rows: [["a", "1"], ["b", "z"]] });
    expect(normalizeTablePayload('[{"k":1}]'))
      .toEqual({ columns: [{ field: "k", header: "k", type: "number", align: "right" }], data: [{ k: 1 }] });
  });

  test("normalizeTablePayload：无法识别时返回 null（不抛异常）", () => {
    expect(normalizeTablePayload(null)).toBeNull();
    expect(normalizeTablePayload("")).toBeNull();
    expect(normalizeTablePayload("纯文本")).toBeNull();
    expect(normalizeTablePayload("{坏JSON")).toBeNull();
  });

  test("resolveTableData：接口模式只认接口数据；无数据时为空表（不闪占位行）", () => {
    const config = { headers: "占位头", rows: "占位行,占位行" };
    expect(resolveTableData({ config, fetched: undefined, isApi: true })).toEqual({ columns: [], data: [] });
    expect(resolveTableData({ config, fetched: [{ a: 1 }], isApi: true }))
      .toEqual({ columns: [{ field: "a", header: "a", type: "number", align: "right" }], data: [{ a: 1 }] });
  });

  test("resolveTableData：staticData 优先于 headers/rows，识别失败才回退", () => {
    expect(resolveTableData({
      config: { staticData: [{ a: 1 }], headers: "h", rows: "r" },
      isApi: false,
    })).toEqual({ columns: [{ field: "a", header: "a", type: "number", align: "right" }], data: [{ a: 1 }] });

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

describe("表格：ColumnDef 列定义模型", () => {
  test("parseColumnDefs：对象数组全字段解析，缺 header 用 field 兜底，非法项丢弃", () => {
    expect(parseColumnDefs([
      { field: "a", header: "名称", type: "number", align: "right", width: "120px", sortable: true },
      { field: "b", type: "text" },
      { field: "" },
      null,
      42,
    ])).toEqual([
      { field: "a", header: "名称", type: "number", align: "right", width: "120px", sortable: true, visible: true },
      { field: "b", header: "b", type: "text", sortable: false, visible: true },
    ]);
  });

  test("parseColumnDefs：逗号简写 field / field:header / field:header:type", () => {
    expect(parseColumnDefs("name, load:负载, ok:状态:boolean")).toEqual([
      { field: "name", header: "name" },
      { field: "load", header: "负载" },
      { field: "ok", header: "状态", type: "boolean" },
    ]);
  });

  test("parseColumnDefs：JSON 字符串 / 旧式字符串数组项 / 非法输入", () => {
    expect(parseColumnDefs('[{"field":"a","header":"A","type":"date"}]')).toEqual([
      { field: "a", header: "A", type: "date", sortable: false, visible: true },
    ]);
    expect(parseColumnDefs(["x", "y:列Y"])).toEqual([
      { field: "x", header: "x" },
      { field: "y", header: "列Y" },
    ]);
    expect(parseColumnDefs("")).toEqual([]);
    expect(parseColumnDefs(null)).toEqual([]);
    expect(parseColumnDefs(42)).toEqual([]);
  });

  test("inferColumnDefs：number/boolean/link/image/date 启发式推断 + 对齐", () => {
    expect(inferColumnDefs({
      count: 3,
      ok: false,
      url: "https://example.com",
      avatar: "/img/a.png",
      day: "2026-09-20",
      name: "文本",
    })).toEqual([
      { field: "count", header: "count", type: "number", align: "right" },
      { field: "ok", header: "ok", type: "boolean", align: "left" },
      { field: "url", header: "url", type: "link", align: "left" },
      { field: "avatar", header: "avatar", type: "image", align: "left" },
      { field: "day", header: "day", type: "date", align: "left" },
      { field: "name", header: "name", type: "text", align: "left" },
    ]);
    expect(inferColumnDefs(null)).toEqual([]);
  });

  test("resolveTableData：新版 columnDefs+data 优先（data 支持数组或 textarea JSON 字符串）", () => {
    expect(resolveTableData({
      config: { columnDefs: "name, load:负载", data: [{ name: "A", load: 1 }] },
      isApi: false,
    })).toEqual({
      columns: [
        { field: "name", header: "name" },
        { field: "load", header: "负载" },
      ],
      data: [{ name: "A", load: 1 }],
    });

    expect(resolveTableData({
      config: {
        columnDefs: '[{"field":"name","header":"名称"}]',
        data: '[{"name":"A"}]',
      },
      isApi: false,
    })).toEqual({
      columns: [{ field: "name", header: "名称", sortable: false, visible: true }],
      data: [{ name: "A" }],
    });
  });

  test("resolveTableData：只给 data（无 columnDefs）时自动推断列；全空时回退旧版空表", () => {
    expect(resolveTableData({ config: { data: [{ a: 1 }] }, isApi: false }))
      .toEqual({ columns: [{ field: "a", header: "a", type: "number", align: "right" }], data: [{ a: 1 }] });
    expect(resolveTableData({ config: {}, isApi: false })).toEqual({ headers: [], rows: [] });
  });

  test("resolveTableData：新版统一 tableData（列+行同一模型）优先，兼容 JSON 字符串形态", () => {
    expect(resolveTableData({
      config: {
        columnDefs: "name, load:负载",
        data: [{ name: "OLD", load: 1 }],
        headers: ["旧", "表"],
        rows: [["1", "2"]],
        tableData: {
          columns: [
            { field: "name", header: "名称", type: "text", align: "left", sortable: true, visible: true },
            { field: "price", header: "价格", type: "number", align: "right", sortable: true, visible: true },
          ],
          rows: [{ name: "苹果", price: 5.5 }, { name: "香蕉", price: 3.2 }],
        },
      },
      isApi: false,
    })).toEqual({
      columns: [
        { field: "name", header: "名称", type: "text", align: "left", sortable: true, visible: true },
        { field: "price", header: "价格", type: "number", align: "right", sortable: true, visible: true },
      ],
      data: [{ name: "苹果", price: 5.5 }, { name: "香蕉", price: 3.2 }],
    });

    // JSON 字符串形态（TableDataEditor 高级模式产出）
    expect(resolveTableData({
      config: { headers: ["旧"], rows: [["1"]], tableData: JSON.stringify({ columns: [{ field: "a", header: "A" }], rows: [{ a: "x" }] }) },
      isApi: false,
    })).toEqual({
      columns: [{ field: "a", header: "A", sortable: false, visible: true }],
      data: [{ a: "x" }],
    });
  });

  test("resolveTableData：tableData 为空模型时回退旧字段，旧字段全无时回退空表", () => {
    expect(resolveTableData({ config: { tableData: { columns: [], rows: [] }, headers: ["旧"], rows: [["1"]] }, isApi: false }))
      .toEqual({ headers: ["旧"], rows: [["1"]] });
    expect(resolveTableData({ config: {}, isApi: false })).toEqual({ headers: [], rows: [] });
  });

  test("getTableHeaders / getColumnDefs：列定义优先，其次旧表头，再其次 data 推断", () => {
    const model = {
      columns: [{ field: "a", header: "A" }, { field: "b" }],
      headers: ["x", "y"],
      data: [{ a: 1, b: 2 }],
      rows: [["1", "2"]],
    };
    expect(getTableHeaders(model)).toEqual(["A", "b"]);
    expect(getColumnDefs(model)).toEqual([{ field: "a", header: "A" }, { field: "b" }]);
    expect(getTableHeaders({ headers: ["x"] })).toEqual(["x"]);
    expect(getTableHeaders({ data: [{ k: 1 }] })).toEqual(["k"]);
    expect(getColumnDefs({ data: [{ k: 1 }] }))
      .toEqual([{ field: "k", header: "k", type: "number", align: "right" }]);
  });

  test("getColumnDefs/getTableHeaders：visible:false 列被统一过滤（编辑端/发布端同口径）", () => {
    const model = {
      columns: [
        { field: "a", header: "A" },
        { field: "hidden", header: "隐藏", visible: false },
      ],
    };
    expect(getColumnDefs(model)).toEqual([{ field: "a", header: "A" }]);
    expect(getTableHeaders(model)).toEqual(["A"]);
  });

  test("getRowValues / rowsToData / iterateTableRows：新旧数据统一对象视角", () => {
    const columns = [{ field: "a", header: "A" }, { field: "b", header: "B" }];
    expect(getRowValues({ a: 1, b: "x" }, columns)).toEqual(["1", "x"]);
    expect(getRowValues({ a: null, b: 0 }, columns)).toEqual(["", "0"]);

    expect(rowsToData([["1", "2"], ["3", ""]], ["a", "b"])).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "" },
    ]);

    const seen: string[] = [];
    iterateTableRows({ columns, data: [{ a: "A1", b: "B1" }] }, (row) => seen.push(row.a as string));
    expect(seen).toEqual(["A1"]);

    const seen2: string[] = [];
    iterateTableRows({ headers: ["a", "b"], rows: [["1", "2"]] }, (row) => seen2.push(row.a as string));
    expect(seen2).toEqual(["1"]);
  });

  test("API 模式：对象数组自动推断列定义；列宽/显隐等属性从面板列定义合并覆盖", () => {
    // 纯 API 返回对象数组：没有列定义 → 自动推断
    expect(resolveTableData({
      config: {},
      fetched: [{ name: "A", price: 5.5, active: true }],
      isApi: true,
    })).toEqual({
      columns: [
        { field: "name", header: "name", type: "text", align: "left" },
        { field: "price", header: "price", type: "number", align: "right" },
        { field: "active", header: "active", type: "boolean", align: "left" },
      ],
      data: [{ name: "A", price: 5.5, active: true }],
    });

    // 面板通过 tableData 配置了列定义：API 返回合并覆盖
    expect(resolveTableData({
      config: {
        tableData: {
          columns: [
            { field: "name", header: "名称", type: "text", align: "left", width: "200px", sortable: true, visible: true },
            { field: "price", header: "价格", type: "text", align: "center", width: "100px", sortable: false, visible: false },
            // 面板存在但 API 没有的列追加到末尾
            { field: "extra", header: "额外", type: "text", align: "left", sortable: true, visible: true },
          ],
          rows: [{ name: "旧", price: 1, extra: "x" }],
        },
      },
      fetched: [{ name: "A", price: 5.5 }],
      isApi: true,
    })).toEqual({
      columns: [
        // header / type / align / width / sortable / visible 从面板覆盖，field 保留 API
        { field: "name", header: "名称", type: "text", align: "left", width: "200px", sortable: true, visible: true },
        { field: "price", header: "价格", type: "text", align: "center", width: "100px", sortable: false, visible: false },
        // extra 追加
        { field: "extra", header: "额外", type: "text", align: "left", sortable: true, visible: true },
      ],
      data: [{ name: "A", price: 5.5 }],
    });
  });

  test("API 模式：旧版 {columns, rows} 响应自动转新版对象数组", () => {
    expect(resolveTableData({
      config: {},
      fetched: { columns: ["名称", "数值"], rows: [["a", "1"], ["b", "2"]] },
      isApi: true,
    })).toEqual({
      columns: [
        { field: "名称", header: "名称" },
        { field: "数值", header: "数值" },
      ],
      data: [
        { "名称": "a", "数值": "1" },
        { "名称": "b", "数值": "2" },
      ],
    });
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

  test("paginateTableRows：首页切片（页码从 1 开始）", () => {
    const data = Array.from({ length: 25 }, (_, i) => ({ name: `R${i + 1}` }));
    expect(paginateTableRows(data, 1, 10)).toHaveLength(10);
    expect(paginateTableRows(data, 1, 10)[0]).toEqual({ name: "R1" });
    expect(paginateTableRows(data, 1, 10)[9]).toEqual({ name: "R10" });
  });

  test("paginateTableRows：中间页/末页切片与越界夹紧", () => {
    const data = Array.from({ length: 25 }, (_, i) => ({ name: `R${i + 1}` }));
    expect(paginateTableRows(data, 2, 10)[0]).toEqual({ name: "R11" });
    expect(paginateTableRows(data, 3, 10)).toHaveLength(5);
    // 越界页码夹到最后一页，不返回空
    expect(paginateTableRows(data, 999, 10)[0]).toEqual({ name: "R21" });
    expect(paginateTableRows(data, 0, 10)[0]).toEqual({ name: "R1" });
    expect(paginateTableRows(data, -3, 10)[0]).toEqual({ name: "R1" });
  });

  test("paginateTableRows：pageSize 非法时回退 10，返回浅拷贝", () => {
    const data = Array.from({ length: 25 }, (_, i) => ({ name: `R${i + 1}` }));
    expect(paginateTableRows(data, 1, 0)).toHaveLength(10);
    expect(paginateTableRows(data, 1, NaN)).toHaveLength(10);
    const first = paginateTableRows(data, 1, 10);
    expect(first).not.toBe(data);
    expect(first[0]).toEqual(data[0]);
  });

  test("paginateTableRows：空数据返回空数组不报错", () => {
    expect(paginateTableRows([], 1, 10)).toEqual([]);
    expect(paginateTableRows([], 999, 10)).toEqual([]);
  });
});

describe("表格：排序", () => {
  test("sortTableRows：按 number 类型正序/倒序/取消", () => {
    const data = [
      { name: "A", load: 30 },
      { name: "B", load: 10 },
      { name: "C", load: 20 },
    ];
    const cols = [{ field: "load", type: "number" as const }, { field: "name" }];
    expect(sortTableRows(data, cols, "load", "asc").map((r) => r.load)).toEqual([10, 20, 30]);
    expect(sortTableRows(data, cols, "load", "desc").map((r) => r.load)).toEqual([30, 20, 10]);
    expect(sortTableRows(data, cols, "load", "none")).toBe(data);
  });

  test("sortTableRows：按 string localeCompare", () => {
    const data = [{ name: "香蕉" }, { name: "苹果" }, { name: "橙子" }];
    const cols = [{ field: "name" }];
    expect(sortTableRows(data, cols, "name", "asc").map((r) => r.name)).toEqual(["橙子", "苹果", "香蕉"]);
  });

  test("sortTableRows：null 值排在末尾，sortable=false 时跳过排序", () => {
    const data = [{ name: "A" }, { name: null }, { name: "B" }];
    const cols = [{ field: "name", sortable: false }];
    expect(sortTableRows(data, cols, "name", "asc")).toBe(data);
  });

  test("sortTableRows：不存在的字段直接返回原数组", () => {
    const data = [{ a: 1 }];
    expect(sortTableRows(data, [{ field: "a" }], "x", "asc")).toBe(data);
  });
});

describe("表格：搜索过滤", () => {
  test("filterTableRows：空关键词返回原数组", () => {
    const data = [{ name: "A", n: 1 }];
    expect(filterTableRows(data, [{ field: "name" }], "")).toBe(data);
    expect(filterTableRows(data, [{ field: "name" }], "   ")).toBe(data);
  });

  test("filterTableRows：文本包含匹配（忽略大小写）", () => {
    const data = [{ name: "Cloud Server" }, { name: "Edge Gateway" }, { name: "IoT Box" }];
    const cols = [{ field: "name" }];
    expect(filterTableRows(data, cols, "edge")).toEqual([{ name: "Edge Gateway" }]);
    expect(filterTableRows(data, cols, "GATEWAY")).toEqual([{ name: "Edge Gateway" }]);
    expect(filterTableRows(data, cols, "zzz")).toEqual([]);
  });

  test("filterTableRows：多列任一命中", () => {
    const data = [
      { name: "Node-1", region: "北京" },
      { name: "Node-2", region: "上海" },
    ];
    const cols = [{ field: "name" }, { field: "region" }];
    expect(filterTableRows(data, cols, "上海")).toEqual([{ name: "Node-2", region: "上海" }]);
    expect(filterTableRows(data, cols, "node")).toHaveLength(2);
  });

  test("filterTableRows：boolean 按是/否语义匹配", () => {
    const data = [
      { name: "A", active: true },
      { name: "B", active: false },
    ];
    const cols = [{ field: "name" }, { field: "active", type: "boolean" as const }];
    expect(filterTableRows(data, cols, "是")).toEqual([{ name: "A", active: true }]);
    expect(filterTableRows(data, cols, "否")).toEqual([{ name: "B", active: false }]);
    expect(filterTableRows(data, cols, "true")).toEqual([{ name: "A", active: true }]);
  });

  test("filterTableRows：number 类型数值匹配", () => {
    const data = [{ name: "A", load: 30 }, { name: "B", load: 105 }, { name: "C", load: 20 }];
    const cols = [{ field: "name" }, { field: "load", type: "number" as const }];
    expect(filterTableRows(data, cols, "10")).toEqual([{ name: "B", load: 105 }]);
    expect(filterTableRows(data, cols, "30")).toEqual([{ name: "A", load: 30 }]);
  });

  test("filterTableRows：null 值行不参与匹配且不报错", () => {
    const data = [{ name: "A", load: null }, { name: "B", load: 7 }];
    const cols = [{ field: "name" }, { field: "load", type: "number" as const }];
    expect(() => filterTableRows(data, cols, "7")).not.toThrow();
    expect(filterTableRows(data, cols, "7")).toEqual([{ name: "B", load: 7 }]);
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

describe("行选择：toggleRowSelection / toggleAllRowsSelection", () => {
  test("toggleRowSelection：以引用为标识，选中则移除，未选则加入，不改入参", () => {
    const a = { id: 1 };
    const b = { id: 2 };
    expect(toggleRowSelection([], a)).toEqual([a]);
    expect(toggleRowSelection([a], a)).toEqual([]);
    expect(toggleRowSelection([a, b], a)).toEqual([b]);
    expect(toggleRowSelection([a], b)).toEqual([a, b]);
    // 不改入参
    const src = [a];
    toggleRowSelection(src, b);
    expect(src).toEqual([a]);
  });

  test("toggleRowSelection：值相等但引用不同的对象视为不同行", () => {
    const a = { id: 1 };
    const b = { id: 1 };
    expect(toggleRowSelection([a], b)).toEqual([a, b]);
  });

  test("toggleAllRowsSelection：全选（候选全部加入）", () => {
    const a = { id: 1 };
    const b = { id: 2 };
    expect(toggleAllRowsSelection([], [a, b])).toEqual([a, b]);
  });

  test("toggleAllRowsSelection：全不选（候选全部已选则全部移除）", () => {
    const a = { id: 1 };
    const b = { id: 2 };
    expect(toggleAllRowsSelection([a, b], [a, b])).toEqual([]);
  });

  test("toggleAllRowsSelection：保留页外/过滤外已选", () => {
    const a = { id: 1 };
    const b = { id: 2 };
    const c = { id: 3 };
    expect(toggleAllRowsSelection([c], [a, b])).toEqual([c, a, b]);
  });

  test("toggleAllRowsSelection：候选为空时不改变已选", () => {
    const a = { id: 1 };
    expect(toggleAllRowsSelection([a], [])).toEqual([a]);
  });
});

describe("表格：P4 虚拟滚动窗口与配置读取", () => {
  test("computeVirtualRange：常规窗口含 overscan", () => {
    const r = computeVirtualRange({ scrollTop: 0, viewportHeight: 400, rowHeight: 40, total: 1000, overscan: 6 });
    expect(r.start).toBe(0);
    expect(r.end).toBe(22); // 400/40=10 可见 + 6*2 缓冲
    expect(r.end).toBeLessThanOrEqual(1000);
  });

  test("computeVirtualRange：滚动中段窗口平移", () => {
    const r = computeVirtualRange({ scrollTop: 4000, viewportHeight: 400, rowHeight: 40, total: 1000, overscan: 6 });
    // 已滚 100 行，可见 100..110，缓冲后 94..116
    expect(r.start).toBe(94);
    expect(r.end).toBe(116);
  });

  test("computeVirtualRange：滚动超界时夹紧到末尾", () => {
    const r = computeVirtualRange({ scrollTop: 999999, viewportHeight: 400, rowHeight: 40, total: 100, overscan: 6 });
    expect(r.start).toBeLessThanOrEqual(100);
    expect(r.end).toBe(100);
    expect(r.start).toBeGreaterThanOrEqual(0);
  });

  test("computeVirtualRange：总行 0 / 视口 0 返回空窗口", () => {
    expect(computeVirtualRange({ scrollTop: 10, viewportHeight: 400, rowHeight: 40, total: 0, overscan: 6 })).toEqual({ start: 0, end: 0 });
    expect(computeVirtualRange({ scrollTop: 10, viewportHeight: 0, rowHeight: 40, total: 10, overscan: 6 })).toEqual({ start: 0, end: 0 });
  });

  test("computeVirtualRange：非法输入回落（NaN/负数/缺失 overscan）", () => {
    const r = computeVirtualRange({ scrollTop: NaN, viewportHeight: 400, rowHeight: 40, total: 10 } as never);
    expect(r.start).toBe(0);
    expect(r.end).toBeGreaterThan(0);
    expect(r.end).toBeLessThanOrEqual(10);
    const neg = computeVirtualRange({ scrollTop: -5, viewportHeight: 400, rowHeight: 40, total: 10, overscan: -1 });
    expect(neg.start).toBe(0);
  });

  test("readVirtualScroll：开启读取高度，非法高度回落 360 且不低于 120", () => {
    expect(readVirtualScroll({ virtualScroll: true, virtualScrollHeight: 500 })).toEqual({ enabled: true, viewportHeight: 500 });
    expect(readVirtualScroll({ virtualScroll: true, virtualScrollHeight: "abc" })).toEqual({ enabled: true, viewportHeight: 360 });
    expect(readVirtualScroll({ virtualScroll: true, virtualScrollHeight: 20 })).toEqual({ enabled: true, viewportHeight: 120 });
    expect(readVirtualScroll({ virtualScroll: true })).toEqual({ enabled: true, viewportHeight: 360 });
    expect(readVirtualScroll({ virtualScroll: false })).toEqual({ enabled: false, viewportHeight: 360 });
    expect(readVirtualScroll({})).toEqual({ enabled: false, viewportHeight: 360 });
  });

  test("readColumnResize：仅 true 启用", () => {
    expect(readColumnResize({ resizableColumns: true })).toBe(true);
    expect(readColumnResize({ resizableColumns: false })).toBe(false);
    expect(readColumnResize({})).toBe(false);
    expect(readColumnResize({ resizableColumns: "yes" })).toBe(false);
  });

  test("VIRTUAL_OVERSCAN 默认值与 computeVirtualRange 缺省 overscan 一致", () => {
    expect(VIRTUAL_OVERSCAN).toBe(6);
    const r = computeVirtualRange({ scrollTop: 0, viewportHeight: 400, rowHeight: 40, total: 1000 });
    expect(r.end).toBe(22);
  });
});
