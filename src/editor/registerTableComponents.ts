import { componentRegistry, lazy } from "./registryCore";
import { dataSourceSchemaFields } from "./dataSourceFields";
import { DEFAULT_TREE_DATA } from "./data/tableData";

/**
 * 表格组件组注册
 *
 * 五个组件的共同约定（本次 2.0.0 统一收口，勿再各写一份）：
 * 1. **数据取值口径** → `editor/data/tableData.ts`（表头/行/描述项/树/分页模型/日历标记）
 * 2. **样式取值口径** → `editor/data/tableStyle.ts`（声明对象，编辑区展开进 sx、发布端 cssText 序列化）
 * 3. **动态数据接入** → `dataSourceSchemaFields`（全局数据源 / 静态 / 接口三态 + `authEnabled`
 *    三态：true 注入 Token、false 明确不注入、null 跟随站点全局认证态）
 * 4. 「能否绑定数据源」由 `registryCore.shouldInjectDataConfig` 决定：本组不属 layout/decoration，
 *    全部会获得统一数据源分组；因此这里显式声明 `dataSourceSchemaFields` 以控制字段顺序与文案。
 *
 * 认证联动：本组所有组件的 `authEnabled` 与认证组件组（登录表单 / 路由守卫 / OAuth）
 * 通过同一套运行时打通 —— 编辑区走 `useApiDataFetch` → `websiteAuthStore.buildAuthHeaders`；
 * 发布端走 `dataLoaderScript` 的 `window.__WC_AUTH_ENABLED` + `__WC_TOKEN_*`，并监听
 * `auth-state-change` 事件在登录/登出后立刻重取。三态语义两端严格一致。
 */
export function registerTableComponents(): void {

  // ─────────────────────────────────────────────────────────────
  // 表格
  // ─────────────────────────────────────────────────────────────
  componentRegistry.register({
    type: "table",
    name: "表格",
    icon: "table_chart",
    description: "结构化数据表格：列定义模型（字段/类型/宽度/对齐）、对象数组数据、斑马纹/边框/密度/悬浮高亮/固定表头/空态，支持静态或接口动态数据；兼容旧版逗号分隔表头",
    category: "ccat_table",
    version: "2.1.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 500, height: 300 },
    minSize: { width: 200, height: 100 },
    defaultConfig: {
      // 内容 —— 统一表格编辑器（列定义 + 数据行同时管理）
      showHeader: true,
      tableData: {
        columns: [
          { field: "name", header: "名称", type: "text", align: "left", sortable: true, visible: true },
          { field: "price", header: "价格", type: "number", align: "right", sortable: true, visible: true },
          { field: "count", header: "数量", type: "number", align: "right", sortable: true, visible: true },
        ],
        rows: [
          { name: "苹果", price: 5.5, count: 10, detail: { 产地: "山东烟台", 等级: "A" } },
          { name: "香蕉", price: 3.2, count: 20 },
          { name: "橙子", price: 4.8, count: 15 },
        ],
      },
      // 旧版兼容字段（保留在配置中供旧场景回退，新面板不暴露）
      columnDefs: [],
      data: [],
      headers: ["列1", "列2", "列3"],
      rows: [
        ["行1-1", "行1-2", "行1-3"],
        ["行2-1", "行2-2", "行2-3"],
      ],
      columnStyles: "",
      // 表头
      headerBgColor: "rgba(255,255,255,0.08)",
      headerColor: "#ffffff",
      headerFontSize: 13,
      headerFontWeight: "bold",
      headerHeight: 0,
      // 行
      rowColor: "rgba(255,255,255,0.75)",
      rowFontSize: 13,
      rowHeight: 40,
      density: "default",
      // cellPadY/cellPadX 不再预置：密度（density）提供默认档位，显式配置仍可覆盖
      // 斑马纹
      stripeEnabled: true,
      stripeColor: "rgba(255,255,255,0.04)",
      // 边框与圆角（px 口径）
      borderEnabled: true,
      borderColor: "rgba(255,255,255,0.12)",
      borderWidth: 1,
      borderStyle: "solid",
      borderRadius: 0,
      // 交互
      rowHoverEnabled: true,
      rowHoverBg: "rgba(255,255,255,0.06)",
      stickyHeader: false,
      // 高级（P4）：列宽拖拽 / 虚拟滚动
      resizableColumns: false,
      // 冻结列（P2）：冻结前 N 列，横向滚动时常驻左侧
      frozenColumns: 0,
      virtualScroll: false,
      virtualScrollHeight: 360,
      // 分页
      showPagination: false,
      pageSize: 10,
      showPageSizeOptions: true,
      showQuickJumper: false,
      // 行选择
      showRowSelection: false,
      // 行展开详情（与虚拟滚动互斥：详情行破坏等高窗口数学）
      showRowExpand: false,
      detailField: "detail",
      // 单元格编辑（多维第一档）：开启后双击可编辑类型单元格进入编辑态
      editEnabled: false,
      editApiUrl: "",
      editApiMethod: "PUT",
      editIdField: "id",
      // 导出
      exportCsv: false,
      // 空态
      emptyText: "暂无数据",
      emptyColor: "rgba(255,255,255,0.35)",
      emptyBg: "transparent",
      // 布局
      align: "left",
      overflow: "scroll",
    },
    capabilities: {
      resizable: true,
      rotatable: false,
      draggable: true,
      connectable: false,
      embeddable: false,
    },
    renderer: lazy(() => import("./renderers/TableRenderer").then(m => ({ default: m.TableRenderer }))),
    configSchema: [
      // —— 内容 ——
      { key: "showHeader", label: "显示表头", type: "toggle", group: "内容" },
      { key: "tableData", label: "表格数据", type: "table-editor", group: "内容",
        help: "列定义与数据行统一管理：添加列自动同步到所有行，添加行自动按列定义填充空单元格" },
      // 旧版兼容（tableData 有值时自动隐藏）
      { key: "columnDefs", label: "列定义（旧版兼容）", type: "list-editor", group: "内容（兼容）",
        help: "新版请用「表格数据」替代",
        addItemLabel: "添加列", itemLabelKey: "header",
        itemFields: [
          { key: "field", label: "字段名", type: "text", placeholder: "如 name" },
          { key: "header", label: "列标题", type: "text", placeholder: "如 名称" },
          { key: "type", label: "数据类型", type: "select", options: [
            { label: "文本", value: "text" },
            { label: "数字", value: "number" },
            { label: "日期", value: "date" },
            { label: "布尔", value: "boolean" },
            { label: "状态", value: "status" },
            { label: "链接", value: "link" },
            { label: "图片", value: "image" },
            { label: "下拉", value: "select" },
          ], defaultValue: "text" },
          { key: "options", label: "选项（逗号分隔）", type: "text", placeholder: "如 高,中,低",
            help: "仅下拉（select）类型生效" },
          { key: "width", label: "列宽", type: "text", placeholder: "如 120px" },
          { key: "align", label: "对齐", type: "select", options: [
            { label: "左对齐", value: "left" },
            { label: "居中", value: "center" },
            { label: "右对齐", value: "right" },
          ], defaultValue: "left" },
          { key: "sortable", label: "允许排序", type: "toggle", defaultValue: true },
          { key: "visible", label: "显示", type: "toggle", defaultValue: true },
          { key: "editable", label: "可编辑", type: "toggle", defaultValue: true,
            help: "仅编辑型类型（文本/数字/日期/布尔/下拉）生效" },
        ],
        hidden: (c) => c.tableData != null && typeof c.tableData === "object" && !Array.isArray(c.tableData) && (c.tableData as Record<string, unknown>).columns != null && ((c.tableData as Record<string, unknown>).columns as unknown[]).length > 0,
      },
      { key: "data", label: "数据（旧版兼容）", type: "json-data", group: "内容（兼容）",
        help: "新版请用「表格数据」替代", hidden: (c) => c.tableData != null && typeof c.tableData === "object" && !Array.isArray(c.tableData) && (c.tableData as Record<string, unknown>).columns != null && ((c.tableData as Record<string, unknown>).columns as unknown[]).length > 0 },
      { key: "columnStyles", label: "列样式覆盖（旧版兼容）", type: "json-data", group: "内容（兼容）",
        help: "新版请用「表格数据」替代", hidden: (c) => c.tableData != null && typeof c.tableData === "object" && !Array.isArray(c.tableData) && (c.tableData as Record<string, unknown>).columns != null && ((c.tableData as Record<string, unknown>).columns as unknown[]).length > 0 },
      { key: "headers", label: "表头（旧版兼容）", type: "text", group: "内容（兼容）",
        help: "逗号分隔。推荐用「表格数据」替代", hidden: (c) =>
          (c.tableData != null && typeof c.tableData === "object" && !Array.isArray(c.tableData) && (c.tableData as Record<string, unknown>).columns != null && ((c.tableData as Record<string, unknown>).columns as unknown[]).length > 0) ||
          (Array.isArray(c.columnDefs) && c.columnDefs.length > 0),
      },
      { key: "rows", label: "行数据（旧版兼容）", type: "textarea", group: "内容（兼容）",
        help: "每行一个记录，列之间用英文逗号分隔。推荐用「表格数据」替代", hidden: (c) =>
          (c.tableData != null && typeof c.tableData === "object" && !Array.isArray(c.tableData) && (c.tableData as Record<string, unknown>).columns != null && ((c.tableData as Record<string, unknown>).columns as unknown[]).length > 0) ||
          (Array.isArray(c.columnDefs) && c.columnDefs.length > 0),
      },
      // —— 数据源（共享字段组：全局源 / 静态 / 接口 + 认证三态）——
      ...dataSourceSchemaFields,
      // —— 表头样式 ——
      { key: "headerBgColor", label: "表头背景色", type: "color", group: "表头", hidden: (c) => c.showHeader === false },
      { key: "headerColor", label: "表头文字颜色", type: "color", group: "表头", hidden: (c) => c.showHeader === false },
      { key: "headerFontSize", label: "表头字号", type: "number", min: 8, max: 32, group: "表头", hidden: (c) => c.showHeader === false },
      { key: "headerFontWeight", label: "表头字重", type: "select", group: "表头", hidden: (c) => c.showHeader === false,
        options: [
          { label: "常规", value: "normal" },
          { label: "中等", value: "medium" },
          { label: "加粗", value: "bold" },
        ] },
      { key: "headerHeight", label: "表头高度", type: "number", min: 0, max: 200, group: "表头",
        help: "0 = 随内容自适应", hidden: (c) => c.showHeader === false },
      // —— 行样式 ——
      { key: "rowColor", label: "行文字颜色", type: "color", group: "行样式" },
      { key: "rowFontSize", label: "行字号", type: "number", min: 8, max: 32, group: "行样式" },
      { key: "rowHeight", label: "行高", type: "number", min: 20, max: 200, group: "行样式" },
      { key: "density", label: "密度", type: "select", group: "行样式",
        help: "影响单元格默认内边距；显式配置「单元格内边距」时以其为准", options: [
          { label: "紧凑", value: "compact" },
          { label: "默认", value: "default" },
          { label: "宽松", value: "comfortable" },
        ] },
      { key: "cellPadY", label: "单元格纵向内边距", type: "number", min: 0, max: 40, group: "行样式" },
      { key: "cellPadX", label: "单元格横向内边距", type: "number", min: 0, max: 60, group: "行样式" },
      // —— 斑马纹 ——
      { key: "stripeEnabled", label: "斑马纹", type: "toggle", group: "斑马纹" },
      { key: "stripeColor", label: "斑马纹颜色", type: "color", group: "斑马纹", hidden: (c) => !c.stripeEnabled },
      // —— 边框与圆角 ——
      { key: "borderEnabled", label: "显示边框", type: "toggle", group: "边框" },
      { key: "borderColor", label: "边框颜色", type: "color", group: "边框", hidden: (c) => !c.borderEnabled },
      { key: "borderWidth", label: "边框宽度", type: "number", min: 0, max: 8, group: "边框", hidden: (c) => !c.borderEnabled },
      { key: "borderStyle", label: "边框线型", type: "select", group: "边框", hidden: (c) => !c.borderEnabled,
        options: [
          { label: "实线", value: "solid" },
          { label: "虚线", value: "dashed" },
          { label: "点线", value: "dotted" },
        ] },
      { key: "borderRadius", label: "圆角", type: "number", min: 0, max: 60, group: "边框" },
      // —— 交互 ——
      { key: "showSearch", label: "显示搜索框", type: "toggle", group: "交互",
        help: "在表格顶部显示实时搜索输入框，按任意列内容过滤" },
      { key: "searchPlaceholder", label: "搜索占位文字", type: "text", group: "交互", hidden: (c) => c.showSearch !== true },
      { key: "rowHoverEnabled", label: "行悬浮高亮", type: "toggle", group: "交互" },
      { key: "rowHoverBg", label: "悬浮背景色", type: "color", group: "交互", hidden: (c) => c.rowHoverEnabled === false },
      { key: "stickyHeader", label: "固定表头", type: "toggle", group: "交互",
        help: "纵向滚动时表头保持在顶部" },
      { key: "showPagination", label: "显示分页", type: "toggle", group: "交互",
        help: "在表格底部显示分页控件（页码导航、每页条数、快速跳转）；开启虚拟滚动时自动忽略",
        hidden: (c) => c.showPagination !== true || c.virtualScroll === true },
      { key: "pageSize", label: "每页条数", type: "number", min: 1, max: 500, group: "交互",
        hidden: (c) => c.showPagination !== true || c.virtualScroll === true },
      { key: "showPageSizeOptions", label: "显示每页条数选择", type: "toggle", group: "交互",
        hidden: (c) => c.showPagination !== true || c.virtualScroll === true },
      { key: "showQuickJumper", label: "快速跳转", type: "toggle", group: "交互",
        hidden: (c) => c.showPagination !== true || c.virtualScroll === true },
      { key: "showRowSelection", label: "行选择（复选框）", type: "toggle", group: "交互",
        help: "首列显示复选框，支持全选/单选/反选，选中变化时通过 row-selection-change 事件暴露选中行数据" },
      { key: "showRowExpand", label: "行展开详情", type: "toggle", group: "交互",
        help: "行首显示展开箭头，展开后显示详情行；与虚拟滚动互斥（开启虚拟滚动时忽略）" },
      { key: "detailField", label: "详情字段名", type: "text", group: "交互",
        hidden: (c) => c.showRowExpand !== true,
        help: '行对象中承载详情的字段：对象→键值对列表，字符串→文本；该字段为空的行不显示箭头，如 [{"name":"苹果","detail":{"产地":"山东"}}]' },
      // —— 单元格编辑（多维第一档）——
      { key: "editEnabled", label: "单元格编辑", type: "toggle", group: "编辑",
        help: "开启后双击可编辑类型（文本/数字/日期/布尔/下拉）的单元格进入编辑态；编辑区仅本地预览，发布端按下方配置写回" },
      { key: "editApiUrl", label: "写回接口地址", type: "text", group: "编辑",
        hidden: (c) => c.editEnabled !== true,
        help: "留空 = 仅本地修改不写回服务器；请求体为 { 行主键: 值, 字段: 新值 }，认证注入与数据接口同口径" },
      { key: "editApiMethod", label: "写回方法", type: "select", group: "编辑",
        hidden: (c) => c.editEnabled !== true,
        options: [
          { label: "PUT", value: "PUT" },
          { label: "POST", value: "POST" },
          { label: "PATCH", value: "PATCH" },
        ] },
      { key: "editIdField", label: "行主键字段", type: "text", group: "编辑",
        hidden: (c) => c.editEnabled !== true,
        help: "写回请求体中标识行的字段名（行数据里应存在该字段），如 id" },
      { key: "resizableColumns", label: "列宽拖拽", type: "toggle", group: "交互",
        help: "表头右侧出现拖拽手柄，拖动调整列宽（运行时交互，不写入列定义）" },
      { key: "frozenColumns", label: "冻结列数", type: "number", min: 0, max: 10, group: "交互",
        help: "冻结前 N 列：横向滚动时这些列常驻左侧。被冻结列建议设置显式宽度以保证对齐" },
      { key: "virtualScroll", label: "虚拟滚动", type: "toggle", group: "交互",
        help: "大数据量（万行级）下仅渲染可视区行，大幅降低 DOM 与重绘成本；开启后忽略分页" },
      { key: "virtualScrollHeight", label: "滚动区高度", type: "number", min: 120, max: 2000, group: "交互",
        hidden: (c) => c.virtualScroll !== true,
        help: "虚拟滚动模式下表格滚动区的高度（px），行超出时出现纵向滚动条" },
      { key: "exportCsv", label: "允许导出 CSV", type: "toggle", group: "交互",
        help: "在表格顶部显示「导出 CSV」按钮，访客可将当前加载的数据下载为 CSV（带 BOM，Excel 中文不乱码）" },
      // —— 空态 ——
      { key: "emptyText", label: "空数据提示", type: "text", group: "空态" },
      { key: "emptyColor", label: "空态文字颜色", type: "color", group: "空态" },
      { key: "emptyBg", label: "空态背景色", type: "color", group: "空态" },
      // —— 布局 ——
      { key: "align", label: "文字对齐", type: "select", group: "布局",
        options: [
          { label: "左对齐", value: "left" },
          { label: "居中", value: "center" },
          { label: "右对齐", value: "right" },
        ] },
      { key: "overflow", label: "内容溢出", type: "select", group: "布局",
        options: [
          { label: "横向滚动", value: "scroll" },
          { label: "隐藏", value: "hidden" },
        ] },
    ],
  });

  // ─────────────────────────────────────────────────────────────
  // 分页
  // ─────────────────────────────────────────────────────────────
  componentRegistry.register({
    type: "pagination",
    name: "分页",
    icon: "more_horiz",
    description: "分页器：页码导航、总数、每页条数、快速跳转、圆形/方形按钮，支持接口动态总数",
    category: "ccat_table",
    version: "2.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 400, height: 40 },
    minSize: { width: 200, height: 28 },
    defaultConfig: {
      current: 1,
      pageSize: 10,
      total: 100,
      maxButtons: 5,
      showTotal: true,
      showQuickJumper: false,
      showPageSize: false,
      showPrevNext: true,
      size: "medium",
      shape: "square",
      color: "#2196F3",
      textColor: "rgba(255,255,255,0.65)",
      bgColor: "transparent",
      /* 留空 = 跟随主题色（color），此前显式预置导致主题色字段恒无效 */
      activeBgColor: "",
      activeTextColor: "#ffffff",
      borderEnabled: true,
      borderColor: "rgba(255,255,255,0.12)",
      hoverBgColor: "rgba(255,255,255,0.08)",
      borderRadius: 4,
      gap: 4,
      align: "center",
      disabled: false,
      scaleFit: true,
    },
    capabilities: {
      resizable: true, rotatable: false, draggable: true, connectable: false, embeddable: false,
    },
    renderer: lazy(() => import("./renderers/PaginationRenderer").then(m => ({ default: m.PaginationRenderer }))),
    configSchema: [
      // —— 内容 ——
      { key: "current", label: "当前页", type: "number", min: 1, group: "内容" },
      { key: "pageSize", label: "每页条数", type: "number", min: 1, group: "内容" },
      { key: "total", label: "总条数", type: "number", min: 0, group: "内容",
        help: "绑定接口并填写数据路径后，总数由接口返回值决定" },
      { key: "maxButtons", label: "最多页码按钮", type: "number", min: 3, max: 9, group: "内容" },
      // —— 数据源（共享字段组）——
      ...dataSourceSchemaFields,
      // —— 可见部件 ——
      { key: "showTotal", label: "显示总数", type: "toggle", group: "可见部件" },
      { key: "showPrevNext", label: "显示上一页/下一页", type: "toggle", group: "可见部件" },
      { key: "showPageSize", label: "显示每页条数", type: "toggle", group: "可见部件" },
      { key: "showQuickJumper", label: "快速跳转", type: "toggle", group: "可见部件" },
      // —— 样式 ——
      { key: "size", label: "尺寸", type: "select", group: "样式",
        options: [
          { label: "小", value: "small" },
          { label: "中", value: "medium" },
          { label: "大", value: "large" },
        ] },
      { key: "shape", label: "按钮形状", type: "select", group: "样式",
        options: [
          { label: "方形", value: "square" },
          { label: "圆形", value: "round" },
        ] },
      { key: "borderRadius", label: "圆角", type: "number", min: 0, max: 40, group: "样式",
        hidden: (c) => c.shape === "round" },
      { key: "gap", label: "间距", type: "number", min: 0, max: 32, group: "样式" },
      { key: "color", label: "主题色", type: "color", group: "配色" },
      { key: "textColor", label: "文字色", type: "color", group: "配色" },
      { key: "bgColor", label: "背景色", type: "color", group: "配色" },
      { key: "activeBgColor", label: "选中背景色", type: "color", group: "配色", help: "留空则跟随主题色" },
      { key: "activeTextColor", label: "选中文字色", type: "color", group: "配色" },
      { key: "borderEnabled", label: "显示边框", type: "toggle", group: "配色" },
      { key: "borderColor", label: "边框颜色", type: "color", group: "配色", hidden: (c) => c.borderEnabled === false },
      { key: "hoverBgColor", label: "悬浮背景色", type: "color", group: "配色" },
      // —— 行为与布局 ——
      { key: "disabled", label: "只读", type: "toggle", group: "行为", help: "只读时不响应点击翻页" },
      { key: "align", label: "水平对齐", type: "select", group: "布局",
        options: [
          { label: "左", value: "left" },
          { label: "居中", value: "center" },
          { label: "右", value: "right" },
        ] },
      { key: "scaleFit", label: "随拖动框等比缩放", type: "toggle", group: "布局",
        help: "开：内容按拖动框尺寸整体缩放并居中；关：保持设计尺寸不缩放" },
    ],
  });

  // ─────────────────────────────────────────────────────────────
  // 日历
  // ─────────────────────────────────────────────────────────────
  componentRegistry.register({
    type: "calendar",
    name: "日历",
    icon: "calendar_month",
    description: "月视图日历：日期选择、今日高亮、周末区分、接口驱动的日期标记，单元格自适应填满",
    category: "ccat_table",
    version: "2.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 280, height: 260 },
    minSize: { width: 200, height: 200 },
    defaultConfig: {
      value: "",
      weekStartsOn: 0,
      disabled: false,
      showNav: true,
      showTodayHighlight: true,
      showWeekend: true,
      showGridLines: true,
      // 标记（接口/静态）
      marks: "",
      markColor: "#FF9800",
      showMarkDot: true,
      // 样式
      headerColor: "#ffffff",
      headerBgColor: "rgba(255,255,255,0.08)",
      weekdayColor: "",
      dayColor: "rgba(255,255,255,0.75)",
      weekendColor: "rgba(255,255,255,0.45)",
      selectedBgColor: "#2196F3",
      selectedTextColor: "#ffffff",
      todayBorderColor: "#FF9800",
      todayBgColor: "transparent",
      gridLineColor: "rgba(255,255,255,0.04)",
      cellSize: "medium",
      customCellSize: 0,
      fontSize: 13,
      headerFontSize: 14,
      weekdayFontSize: 12,
      borderRadius: 6,
      fillHeight: true,
    },
    capabilities: {
      resizable: true, rotatable: false, draggable: true, connectable: false, embeddable: false,
    },
    renderer: lazy(() => import("./renderers/CalendarRenderer").then(m => ({ default: m.CalendarRenderer }))),
    configSchema: [
      // —— 内容 ——
      { key: "value", label: "默认日期", type: "text", group: "内容", help: "格式: YYYY-MM-DD；留空则使用今天" },
      { key: "weekStartsOn", label: "一周起始", type: "select", group: "内容",
        options: [
          { label: "周日", value: 0 },
          { label: "周一", value: 1 },
        ],
      },
      { key: "disabled", label: "只读", type: "toggle", group: "内容" },
      // —— 数据源（共享字段组：接口驱动日期标记）——
      ...dataSourceSchemaFields,
      // —— 标记 ——
      { key: "marks", label: "标记数据", type: "textarea", group: "标记",
        help: 'JSON 数组，如 [{"date":"2026-09-20","label":"发布会"}]；也支持 {"2026-09-20":"发布会"}' },
      { key: "showMarkDot", label: "显示标记圆点", type: "toggle", group: "标记" },
      { key: "markColor", label: "标记颜色", type: "color", group: "标记", hidden: (c) => c.showMarkDot === false },
      // —— 顶部导航 ——
      { key: "showNav", label: "显示月份导航", type: "toggle", group: "导航" },
      { key: "headerFontSize", label: "标题字号", type: "number", min: 8, max: 32, group: "导航" },
      { key: "headerColor", label: "标题颜色", type: "color", group: "导航" },
      // —— 日期网格 ——
      { key: "fillHeight", label: "自适应高度填满", type: "toggle", group: "网格",
        help: "开: 日期网格随拖动框高度均分铺满; 关: 使用单元格固定行高" },
      { key: "cellSize", label: "单元格尺寸", type: "select", group: "网格",
        options: [
          { label: "小", value: "small" },
          { label: "中", value: "medium" },
          { label: "大", value: "large" },
        ],
      },
      { key: "customCellSize", label: "自定义行高", type: "number", min: 0, max: 120, group: "网格",
        help: "0 = 使用上方档位预设" },
      { key: "fontSize", label: "日期字号", type: "number", min: 8, max: 28, group: "网格" },
      { key: "weekdayFontSize", label: "星期字号", type: "number", min: 8, max: 28, group: "网格" },
      { key: "headerBgColor", label: "星期栏背景色", type: "color", group: "网格" },
      { key: "weekdayColor", label: "星期文字色", type: "color", group: "网格", help: "留空跟随标题颜色" },
      { key: "showGridLines", label: "显示网格线", type: "toggle", group: "网格" },
      { key: "gridLineColor", label: "网格线颜色", type: "color", group: "网格", hidden: (c) => c.showGridLines === false },
      { key: "borderRadius", label: "圆角", type: "number", min: 0, max: 40, group: "网格" },
      // —— 日期配色 ——
      { key: "dayColor", label: "日期颜色", type: "color", group: "日期配色" },
      { key: "showWeekend", label: "区分周末", type: "toggle", group: "日期配色" },
      { key: "weekendColor", label: "周末颜色", type: "color", group: "日期配色", hidden: (c) => c.showWeekend === false },
      { key: "selectedBgColor", label: "选中背景色", type: "color", group: "日期配色" },
      { key: "selectedTextColor", label: "选中文字色", type: "color", group: "日期配色" },
      { key: "showTodayHighlight", label: "高亮今天", type: "toggle", group: "日期配色" },
      { key: "todayBorderColor", label: "今日边框色", type: "color", group: "日期配色", hidden: (c) => c.showTodayHighlight === false },
      { key: "todayBgColor", label: "今日背景色", type: "color", group: "日期配色", hidden: (c) => c.showTodayHighlight === false },
    ],
  });

  // ─────────────────────────────────────────────────────────────
  // 描述列表
  // ─────────────────────────────────────────────────────────────
  componentRegistry.register({
    type: "descriptions",
    name: "描述列表",
    icon: "list_alt",
    description: "键值对详情展示：多列布局、水平/垂直排列、标签宽度与对齐、斑马纹、边框、接口动态数据",
    category: "ccat_table",
    version: "2.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 400, height: 200 },
    minSize: { width: 200, height: 100 },
    defaultConfig: {
      items: "",
      title: "",
      columns: 2,
      layout: "horizontal",
      border: true,
      striped: false,
      labelWidth: 0,
      labelAlign: "left",
      valueAlign: "left",
      labelBgColor: "rgba(255,255,255,0.06)",
      labelColor: "rgba(255,255,255,0.5)",
      labelFontWeight: 500,
      valueColor: "rgba(255,255,255,0.85)",
      borderColor: "rgba(255,255,255,0.1)",
      fontSize: 13,
      titleColor: "rgba(255,255,255,0.9)",
      titleFontSize: 15,
      borderRadius: 4,
      gap: 0,
    },
    capabilities: {
      resizable: true, rotatable: false, draggable: true, connectable: false, embeddable: false,
    },
    renderer: lazy(() => import("./renderers/DescriptionsRenderer").then(m => ({ default: m.DescriptionsRenderer }))),
    configSchema: [
      // —— 内容 ——
      { key: "title", label: "标题", type: "text", group: "内容" },
      { key: "items", label: "数据项（JSON / 文本）", type: "textarea", group: "内容",
        help: 'JSON 数组 [{"label":"名称","value":"值"}]，或每行一条「标签: 值」' },
      // —— 数据源（共享字段组）——
      ...dataSourceSchemaFields,
      // —— 布局 ——
      { key: "layout", label: "排列方向", type: "select", group: "布局",
        options: [
          { label: "水平（标签在左）", value: "horizontal" },
          { label: "垂直（标签在上）", value: "vertical" },
        ],
      },
      { key: "columns", label: "列数", type: "number", min: 1, max: 6, group: "布局" },
      { key: "gap", label: "间距", type: "number", min: 0, max: 32, group: "布局" },
      { key: "border", label: "显示边框", type: "toggle", group: "布局" },
      { key: "borderColor", label: "边框颜色", type: "color", group: "布局", hidden: (c) => c.border === false },
      { key: "borderRadius", label: "圆角", type: "number", min: 0, max: 40, group: "布局" },
      { key: "labelWidth", label: "标签列宽度", type: "number", min: 0, max: 400, group: "布局",
        help: "0 = 自适应；仅水平布局生效" },
      { key: "labelAlign", label: "标签对齐", type: "select", group: "布局",
        options: [
          { label: "左", value: "left" },
          { label: "居中", value: "center" },
          { label: "右", value: "right" },
        ] },
      { key: "valueAlign", label: "值对齐", type: "select", group: "布局",
        options: [
          { label: "左", value: "left" },
          { label: "居中", value: "center" },
          { label: "右", value: "right" },
        ] },
      // —— 样式 ——
      { key: "fontSize", label: "字号", type: "number", min: 8, max: 28, group: "样式" },
      { key: "labelBgColor", label: "标签背景色", type: "color", group: "样式" },
      { key: "labelColor", label: "标签文字颜色", type: "color", group: "样式" },
      { key: "labelFontWeight", label: "标签字重", type: "number", min: 100, max: 900, step: 100, group: "样式" },
      { key: "valueColor", label: "值文字颜色", type: "color", group: "样式" },
      { key: "striped", label: "隔行变色", type: "toggle", group: "样式", hidden: (c) => c.layout === "vertical" },
      { key: "titleColor", label: "标题颜色", type: "color", group: "样式" },
      { key: "titleFontSize", label: "标题字号", type: "number", min: 8, max: 40, group: "样式" },
    ],
  });

  // ─────────────────────────────────────────────────────────────
  // 树形控件
  // ─────────────────────────────────────────────────────────────
  componentRegistry.register({
    type: "tree",
    name: "树形控件",
    icon: "account_tree",
    description: "树形数据展示：展开/折叠、默认展开层级、选中高亮、连线与缩进、接口动态数据、空态",
    category: "ccat_table",
    version: "2.0.0",
    builtIn: true,
    enabled: true,
    defaultSize: { width: 260, height: 300 },
    minSize: { width: 160, height: 120 },
    defaultConfig: {
      data: JSON.stringify(DEFAULT_TREE_DATA, null, 2),
      defaultExpandLevel: 99,
      disabled: false,
      // 样式
      showIcon: true,
      showLine: false,
      lineColor: "rgba(255,255,255,0.12)",
      textColor: "rgba(255,255,255,0.75)",
      activeColor: "#2196F3",
      activeBgColor: "",
      hoverBgColor: "rgba(255,255,255,0.06)",
      fontSize: 13,
      iconColor: "rgba(255,255,255,0.4)",
      leafIconColor: "rgba(255,255,255,0.25)",
      indent: 18,
      gap: 2,
      rowHeight: 0,
      borderRadius: 3,
      // 空态
      emptyText: "暂无数据",
    },
    capabilities: {
      resizable: true, rotatable: false, draggable: true, connectable: false, embeddable: false,
    },
    renderer: lazy(() => import("./renderers/TreeRenderer").then(m => ({ default: m.TreeRenderer }))),
    configSchema: [
      // —— 内容 ——
      { key: "data", label: "树数据（JSON）", type: "textarea", group: "内容",
        help: 'JSON 数组，如 [{"label":"节点","children":[...]}]；标签键兼容 label/title/text/name，子节点键兼容 children/nodes/items' },
      { key: "defaultExpandLevel", label: "默认展开层级", type: "number", min: 0, max: 99, group: "内容",
        help: "0 = 全部折叠；99 = 全部展开" },
      { key: "disabled", label: "只读", type: "toggle", group: "内容" },
      // —— 数据源（共享字段组）——
      ...dataSourceSchemaFields,
      // —— 节点样式 ——
      { key: "showIcon", label: "显示展开箭头", type: "toggle", group: "节点" },
      { key: "showLine", label: "显示连接线", type: "toggle", group: "节点" },
      { key: "lineColor", label: "连接线颜色", type: "color", group: "节点", hidden: (c) => !c.showLine },
      { key: "indent", label: "缩进", type: "number", min: 8, max: 60, group: "节点", help: "每一级相对父级的水平缩进（px）" },
      { key: "gap", label: "节点间距", type: "number", min: 0, max: 24, group: "节点" },
      { key: "rowHeight", label: "行高", type: "number", min: 0, max: 80, group: "节点", help: "0 = 随内容自适应" },
      { key: "borderRadius", label: "节点圆角", type: "number", min: 0, max: 24, group: "节点" },
      { key: "fontSize", label: "字号", type: "number", min: 8, max: 28, group: "节点" },
      // —— 配色 ——
      { key: "textColor", label: "文字颜色", type: "color", group: "配色" },
      { key: "activeColor", label: "选中文字色", type: "color", group: "配色" },
      { key: "activeBgColor", label: "选中背景色", type: "color", group: "配色", help: "留空则按选中文字色自动生成" },
      { key: "hoverBgColor", label: "悬停背景色", type: "color", group: "配色" },
      { key: "iconColor", label: "展开箭头颜色", type: "color", group: "配色" },
      { key: "leafIconColor", label: "叶子节点颜色", type: "color", group: "配色" },
      // —— 空态 ——
      { key: "emptyText", label: "空数据提示", type: "text", group: "空态" },
    ],
  });
}
