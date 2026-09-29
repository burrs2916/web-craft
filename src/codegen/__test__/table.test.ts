import { describe, test, expect } from "vitest";
import { tableCodegen } from "../components/table";
import type { SceneDSL } from "../../types/scene";
import type { SceneComponent } from "../../types/editor";
import type { CodegenContext } from "../types";
import { DEFAULT_CANVAS_CONFIG } from "../../store/editorStore";
import { createDefaultTransform } from "../../types/editor";

const baseComponent = (over: Partial<SceneComponent> = {}): SceneComponent => ({
  id: "c1",
  type: "table",
  name: "Table",
  transform: createDefaultTransform({ x: 0, y: 0, width: 400, height: 260 }),
  layerId: "l1",
  zIndex: 0,
  locked: false,
  visible: true,
  config: { dataMode: "static" },
  children: [],
  parentId: null,
  ...over,
});

const makeScene = (components: SceneComponent[]): SceneDSL => ({
  id: "table-test",
  name: "Table Test",
  status: "draft",
  tags: [],
  metadata: {},
  createdAt: 0,
  updatedAt: 0,
  canvasConfig: { ...DEFAULT_CANVAS_CONFIG, width: 1024, height: 768 },
  views: [{ id: "v1", name: "Dashboard", components, layers: [] }],
  apiConfig: { baseUrl: "", authEnabled: false, defaultHeaders: {}, timeout: 10000 },
});

const makeCtx = (scene: SceneDSL): CodegenContext => ({
  view: scene.views![0]!,
  canvasConfig: scene.canvasConfig!,
  scene,
  preview: true,
  componentMap: new Map(scene.views![0]!.components.map((c) => [c.id, c])),
  childrenByParent: new Map(),
  pageStyles: [],
  pageScripts: [],
  externalDeps: [],
  iconData: {},
});

describe("tableCodegen 数据源回归", () => {
  test("静态模式：渲染 headers/rows 表格，不注入 API loader", () => {
    const scene = makeScene([
      baseComponent({
        config: {
          dataMode: "static",
          headers: "名称, 数值",
          rows: "CPU, 63\n内存, 72",
        },
      }),
    ]);
    const html = tableCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
    expect(html).toContain("<th");
    expect(html).toContain(">名称<");
    expect(html).toContain(">数值<");
    expect(html).toContain(">CPU<");
    expect(html).toContain(">内存<");
    expect(html).not.toContain("doFetch");
    expect(html).not.toContain("getNestedValue");
  });

  test("staticData 对象数组优先：表头取自首行键名", () => {
    const scene = makeScene([
      baseComponent({
        config: {
          dataMode: "static",
          headers: "旧表头",
          rows: "旧行",
          staticData: JSON.stringify([
            { name: "节点A", load: "63" },
            { name: "节点B", load: "72" },
          ]),
        },
      }),
    ]);
    const html = tableCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
    expect(html).toContain(">name<");
    expect(html).toContain(">load<");
    expect(html).toContain(">节点A<");
    expect(html).not.toContain(">旧表头<");
  });

  test("API 模式：统一取数骨架 + mount 暴露 + 首屏静态占位保留", () => {
    const scene = makeScene([
      baseComponent({
        config: {
          dataMode: "api",
          apiUrl: "https://api.example.com/stats",
          apiMethod: "GET",
          apiInterval: 5,
          apiDataPath: "data.rows",
          headers: "名称, 数值",
          rows: "加载中, --",
        },
      }),
    ]);
    const html = tableCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
    expect(html).toContain("getNestedValue");
    expect(html).toContain("doFetch");
    expect(html).toContain("setInterval(doFetch, apiInterval * 1000)");
    expect(html).toContain('window["__wcTbl_');
    // 运行时重建逻辑保留在 uid 作用域的 mount 脚本
    // （2026-09-20：全局函数名从固定的 renderTable 改为 `__wcTbl_<uid>`，
    //  旧实现挂全局单例、同页两个表格实例会互相覆盖）
    expect(html).toContain("__wcTbl_");
    expect(html).toContain("data.__picked");
    // 接口模式下不渲染编译期本地占位行（数据由接口驱动填充）
    expect(html).not.toContain(">加载中<");
  });

  test("API 模式认证为布尔字面量（authEnabled 字符串比较 bug 已随骨架收敛消除）", () => {
    const scene = makeScene([
      baseComponent({
        config: {
          dataMode: "api",
          apiUrl: "https://api.example.com/stats",
          authEnabled: true,
        },
      }),
    ]);
    const html = tableCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
    expect(html).toContain("var authEnabled = true");
    expect(html).not.toContain('authEnabled === "true"');
  });

  test("API 模式 POST apiBody 透传到统一骨架", () => {
    const scene = makeScene([
      baseComponent({
        config: {
          dataMode: "api",
          apiUrl: "https://api.example.com/stats",
          apiMethod: "POST",
          apiBody: '{"range":"1h"}',
        },
      }),
    ]);
    const html = tableCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
    expect(html).toContain("var apiBodyRaw = ");
    // 请求体按原文 JSON 字符串发送（对象直传 fetch 会抛 TypeError），并自动补 Content-Type
    expect(html).toContain("body = apiBodyRaw");
    expect(html).toContain('headers["Content-Type"] = "application/json"');
  });
});

describe("tableCodegen 新版 ColumnDef 模型", () => {
  test("静态模式：columnDefs + data（textarea JSON）渲染表头、按 field 取值与多态单元格", () => {
    const scene = makeScene([
      baseComponent({
        config: {
          dataMode: "static",
          columnDefs: JSON.stringify([
            { field: "name", header: "名称", type: "text", width: "160px" },
            { field: "score", header: "分数", type: "number" },
            { field: "ok", header: "在线", type: "boolean" },
            { field: "home", header: "主页", type: "link" },
          ]),
          data: JSON.stringify([
            { name: "CPU", score: 63, ok: true, home: "https://cpu.example.com" },
            { name: "内存", score: 72, ok: false, home: "" },
          ]),
        },
      }),
    ]);
    const html = tableCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
    // 表头取自 header（不是 field）；数据按 field 取值
    expect(html).toContain(">名称<");
    expect(html).toContain(">分数<");
    expect(html).toContain(">CPU<");
    expect(html).toContain(">内存<");
    // 多态：boolean 圆点 + 是/否；link 外链
    expect(html).toContain("是");
    expect(html).toContain("否");
    expect(html).toContain('<a href="https://cpu.example.com"');
    // ColumnDef 驱动列样式：number 列右对齐（无显式 align 也生效）、width 透传
    expect(html).toContain("text-align:right");
    expect(html).toContain("width:160px");
    // 静态模式不注入数据加载骨架
    expect(html).not.toContain("doFetch");
    expect(html).not.toContain("__wcTbl_");
  });

  test("静态模式：ColumnDef visible:false 列在编译期不渲染（与编辑端/运行时同口径）", () => {
    const scene = makeScene([
      baseComponent({
        config: {
          dataMode: "static",
          columnDefs: JSON.stringify([
            { field: "name", header: "名称" },
            { field: "secret", header: "隐藏列", visible: false },
          ]),
          data: JSON.stringify([{ name: "A", secret: "x" }]),
        },
      }),
    ]);
    const html = tableCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
    expect(html).toContain(">名称<");
    expect(html).not.toContain(">隐藏列<");
    expect(html).not.toContain(">x<");
  });

  test("静态模式：columnDefs 空但 data 非空时自动推断列（对象数组直达 codegen）", () => {
    const scene = makeScene([
      baseComponent({
        config: {
          dataMode: "static",
          data: JSON.stringify([
            { name: "A", load: 63 },
            { name: "B", load: 72 },
          ]),
        },
      }),
    ]);
    const html = tableCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
    expect(html).toContain(">name<");
    expect(html).toContain(">load<");
    expect(html).toContain(">A<");
    // number 自动推断右对齐
    expect(html).toContain("text-align:right");
  });

  test("API 模式（新版）：编译期不落静态表头/数据，运行时含同名解析逻辑", () => {
    const scene = makeScene([
      baseComponent({
        config: {
          dataMode: "api",
          apiUrl: "https://api.example.com/stats",
          apiMethod: "GET",
          columnDefs: JSON.stringify([
            { field: "name", header: "名称", type: "text" },
            { field: "ok", header: "在线", type: "boolean" },
          ]),
        },
      }),
    ]);
    const html = tableCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
    // 统一取数骨架 + uid 作用域运行时重建
    expect(html).toContain("getNestedValue");
    expect(html).toContain("doFetch");
    expect(html).toContain("parseColumnDefs");
    expect(html).toContain("renderCell(");
    // 接口模式下编译期不渲染静态表头（等数据驱动重建）
    expect(html).not.toContain(">名称<");
    expect(html).not.toContain(">在线<");
  });
});

describe("tableCodegen 分页（P1-T3）", () => {
  test("静态模式：showPagination 生成分页容器、行隐藏类规则与运行时脚本，无内联状态写入", () => {
    const scene = makeScene([
      baseComponent({
        config: {
          dataMode: "static",
          columnDefs: JSON.stringify([
            { field: "name", header: "名称" },
            { field: "load", header: "数值", type: "number" },
          ]),
          data: JSON.stringify(
            Array.from({ length: 25 }, (_, i) => ({ name: `R${i + 1}`, load: i + 1 })),
          ),
          showPagination: true,
          pageSize: 10,
          showQuickJumper: true,
        },
      }),
    ]);
    const html = tableCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
    // 分页容器 + 行 data-row-index 标记
    expect(html).toMatch(/-pager"/);
    expect(html).toContain('data-row-index="0"');
    // 行显隐由类规则承载（仓库纪律：状态属性不得写 inline）
    expect(html).toContain("-row-hidden{display:none!important;}");
    expect(html).not.toMatch(/\.style\.display\s*=/);
    // 运行时算法完整注入（window 页码窗口 + 夹紧 + 每页条数选项）
    expect(html).toContain("PAGE_SIZE_OPTIONS");
    expect(html).toContain("clampPage(");
    expect(html).toContain("pageItemsOf(");
    expect(html).toContain("buildPagerHtml(");
    // 快速跳转控件
    expect(html).toContain("data-pg-jump");
  });

  test("API 模式：showPagination 注入运行时分页与接口动态总数（原始响应 json 归一化）", () => {
    const scene = makeScene([
      baseComponent({
        config: {
          dataMode: "api",
          apiUrl: "https://api.example.com/stats",
          apiMethod: "GET",
          columnDefs: JSON.stringify([{ field: "name", header: "名称" }]),
          showPagination: true,
          pageSize: 20,
          showPageSizeOptions: true,
        },
      }),
    ]);
    const html = tableCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
    // 运行时分页状态与算法
    expect(html).toContain("SHOW_PAGINATION");
    expect(html).toContain("PAGER_STATE");
    expect(html).toContain("normalizeTotal(");
    expect(html).toContain("buildPagerHtml(");
    // 分页切片必须发生在排序/过滤之后（与编辑端流水线同构）
    const sortIdx = html.indexOf("sortRows(dataRows");
    const filterIdx = html.indexOf("filterRows(dataRows");
    const pgIdx = html.indexOf("fullRows.slice(");
    expect(sortIdx).toBeGreaterThan(-1);
    expect(filterIdx).toBeGreaterThan(-1);
    expect(pgIdx).toBeGreaterThan(filterIdx);
    // loader 透传原始响应 json（接口动态总数唯一来源）
    expect(html).toContain("render(data, json)");
    expect(html).toContain("__wcTbl_tbl-");
    // 状态属性不写 inline（候选容器显隐走类规则）
    expect(html).not.toMatch(/\.style\.display\s*=/);
  });

  test("默认关闭分页：不生成分页容器与运行时脚本", () => {
    const scene = makeScene([
      baseComponent({
        config: {
          dataMode: "static",
          columnDefs: JSON.stringify([{ field: "name", header: "名称" }]),
          data: JSON.stringify([{ name: "A" }]),
        },
      }),
    ]);
    const html = tableCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
    expect(html).not.toContain("-pager");
    expect(html).not.toContain("PAGE_SIZE_OPTIONS");
    expect(html).not.toContain("buildPagerHtml(");
  });

  test("tableCodegen 行选择（P1-T4）：静态模式注入 checkbox 脚本、接口模式注入运行时状态", () => {
    // 静态模式
    const staticScene = makeScene([
      baseComponent({
        config: {
          dataMode: "static",
          columnDefs: JSON.stringify([{ field: "name", header: "名称" }]),
          data: JSON.stringify([{ name: "A" }, { name: "B" }]),
          showRowSelection: true,
        },
      }),
    ]);
    const staticHtml = tableCodegen(staticScene.views![0]!.components[0]!, makeCtx(staticScene));
    // 静态模式 checkbox 与事件契约
    expect(staticHtml).toContain('type="checkbox"');
    expect(staticHtml).toContain("data-sel-all");
    expect(staticHtml).toContain("data-sel-row");
    expect(staticHtml).toContain("row-selection-change");
    // 无 inline style.display（状态切换走类规则）
    expect(staticHtml).not.toMatch(/\.style\.display\s*=/);

    // 接口模式
    const apiScene = makeScene([
      baseComponent({
        config: {
          dataMode: "api",
          apiUrl: "https://api.example.com/items",
          columnDefs: JSON.stringify([{ field: "name", header: "名称" }]),
          showRowSelection: true,
        },
      }),
    ]);
    const apiHtml = tableCodegen(apiScene.views![0]!.components[0]!, makeCtx(apiScene));
    // 行选择运行时变量与函数
    expect(apiHtml).toContain("SHOW_ROW_SELECTION");
    expect(apiHtml).toContain("SELECTED");
    expect(apiHtml).toContain("emitSelection(");
    expect(apiHtml).toContain("syncSelHeader(");
    // 行选中类规则（背景色不内联，走 styleTag 类规则）
    expect(apiHtml).toContain("-row-selected");
    // data-sel-all / data-sel-row 复选框
    expect(apiHtml).toContain("data-sel-all");
    expect(apiHtml).toContain("data-sel-row");
    // 行选择事件
    expect(apiHtml).toContain("row-selection-change");
    // 无 inline style.display（状态切换走类规则）
    expect(apiHtml).not.toMatch(/\.style\.display\s*=/);
  });

  test("行选择：默认关闭时不生 checkbox 与选中规则", () => {
    const scene = makeScene([
      baseComponent({
        config: {
          dataMode: "static",
          columnDefs: JSON.stringify([{ field: "name", header: "名称" }]),
          data: JSON.stringify([{ name: "A" }]),
        },
      }),
    ]);
    const html = tableCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
    expect(html).not.toContain("data-sel-all");
    expect(html).not.toContain("data-sel-row");
    expect(html).not.toContain("-row-selected");
  });

  test("P3-安全：单元格内容经 escapeHTML 转义，脚本标签不执行", () => {
    const scene = makeScene([
      baseComponent({
        config: {
          dataMode: "static",
          columnDefs: JSON.stringify([{ field: "name", header: "名称" }]),
          data: JSON.stringify([{ name: "<script>alert(1)</script>" }]),
        },
      }),
    ]);
    const html = tableCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  test("P3-安全：link 类型拒绝 javascript: 协议", () => {
    const scene = makeScene([
      baseComponent({
        config: {
          dataMode: "static",
          columnDefs: JSON.stringify([{ field: "url", header: "链接", type: "link" }]),
          data: JSON.stringify([{ url: "javascript:alert(1)" }, { url: "https://example.com" }]),
        },
      }),
    ]);
    const html = tableCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('href="#unsafe"');
    expect(html).toContain('href="https://example.com"');
  });

  test("P3-安全：image 类型拒绝 javascript: 协议", () => {
    const scene = makeScene([
      baseComponent({
        config: {
          dataMode: "static",
          columnDefs: JSON.stringify([{ field: "img", header: "图", type: "image" }]),
          data: JSON.stringify([{ img: "javascript:alert(1)" }, { img: "https://example.com/a.png" }]),
        },
      }),
    ]);
    const html = tableCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
    expect(html).not.toContain('src="javascript:');
    expect(html).toContain('src="https://example.com/a.png"');
  });
});

describe("tableCodegen P4 虚拟滚动与列宽拖拽", () => {
  const mkScene = (over: Record<string, unknown> = {}) =>
    makeScene([
      baseComponent({
        config: {
          dataMode: "static",
          columnDefs: JSON.stringify([
            { field: "name", header: "名称" },
            { field: "val", header: "数值", type: "number" },
          ]),
          data: JSON.stringify(Array.from({ length: 200 }, (_, i) => ({ name: `行${i}`, val: i }))),
          ...over,
        },
      }),
    ]);
  const gen = (over: Record<string, unknown> = {}) => {
    const scene = mkScene(over);
    return tableCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
  };

  test("静态虚拟滚动：不 bake 全量行，改骨架 + 运行时初始化，忽略分页", () => {
    const html = gen({ virtualScroll: true, virtualScrollHeight: 240 });
    expect(html).not.toContain("data-search-text");
    // 运行时 renderTable 的 <tr> 需带行定位属性（单元格编辑按行序号定位行对象），
    // 故字面量出现 2 次 = 1 次运行时源码 + 0 次静态烘焙行（仍是"不 bake 全量行"）
    expect(html.split("data-row-index").length).toBe(2);
    expect(html).toContain('tbody id="tbl-');
    expect(html).toContain("max-height:240px");
    expect(html).toContain("VIRTUAL_ENABLED = true");
    expect(html).toContain("VIRTUAL_OVERSCAN");
    expect(html).toContain("SHOW_PAGINATION = false");
    expect(html).not.toMatch(/id="tbl-[a-z0-9]+-pager"/); // 无分页容器
  });

  test("静态虚拟滚动：bootstrap 把编译期数据灌入运行时数据槽", () => {
    const html = gen({ virtualScroll: true });
    expect(html).toMatch(/__wcTbl_tbl-[a-z0-9]+"\]\(/);
    expect(html).toContain('"name":"行0"');
    expect(html).toContain('"rows":[]');
    // 容器滚动仅由运行时脚本绑定（含 rAF 节流）
    expect(html).toContain('addEventListener("scroll"');
    expect(html).toContain("requestAnimationFrame");
  });

  test("接口模式虚拟滚动：注入窗口运行时常量且分页关闭", () => {
    const scene = makeScene([
      baseComponent({
        config: {
          dataMode: "api",
          apiUrl: "https://example.com/api/tbl",
          columnDefs: JSON.stringify([{ field: "a" }, { field: "b" }]),
          virtualScroll: true,
          virtualScrollHeight: 400,
        },
      }),
    ]);
    const html = tableCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
    expect(html).toContain("VIRTUAL_ENABLED = true");
    expect(html).toContain("VIRTUAL_HEIGHT = 400");
    expect(html).toContain("max-height:400px");
    expect(html).toContain("VSCROLL_TOP");
    expect(html).toContain('addEventListener("scroll"');
    expect(html).toContain("SHOW_PAGINATION = false");
    expect(html).not.toMatch(/id="tbl-[a-z0-9]+-pager"/);
  });

  test("列宽拖拽：静态 bake 注入 data-col-resizer 手柄与委托脚本", () => {
    const html = gen({ resizableColumns: true });
    expect(html).toContain("data-col-resizer=");
    expect(html).toContain("data-col-index=");
    expect(html).toContain("cursor:col-resize");
    expect(html).toMatch(/document\.addEventListener\("mousedown"/);
  });

  test("列宽拖拽：接口/虚拟运行时注入 RESIZABLE 常量与 WIDTHS 重算口径", () => {
    const scene = makeScene([
      baseComponent({
        config: {
          dataMode: "api",
          apiUrl: "https://example.com/api/tbl",
          columnDefs: JSON.stringify([{ field: "a" }, { field: "b" }]),
          resizableColumns: true,
        },
      }),
    ]);
    const html = tableCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
    expect(html).toContain("RESIZABLE = true");
    expect(html).toContain("WIDTHS");
    expect(html).toContain("applyColWidth");
    expect(html).toContain('data-col-resizer="');
    expect(html).toContain("data-col-index=");
    // 拖拽排序防误触守卫：排序点击跳过手柄
    expect(html).toContain("closest('[data-col-resizer]')");
  });

  test("默认关闭：无虚拟滚动/拖拽标记，分页照常烘焙", () => {
    const html = gen({ showPagination: true, pageSize: 10 });
    expect(html).not.toContain("VIRTUAL_ENABLED");
    expect(html).not.toContain("VIRTUAL_OVERSCAN");
    expect(html).not.toContain("data-virtual-spacer");
    expect(html).not.toContain("max-height:");
    expect(html).not.toContain("data-col-resizer");
    expect(html).toContain("data-row-index"); // 全量烘焙
    expect(html).toContain("data-pg"); // 分页照常
  });
});
