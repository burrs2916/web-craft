import type { ComponentCodegenFn } from "../../types";
import { dataLoaderScript } from "../../dataLoader";
import {
  resolveTableData,
  getColumnDefs,
  parseColumnDefs,
  parseTableDataModel,
  readVirtualScroll,
  readColumnResize,
  type ColumnDef,
} from "../../../editor/data/tableData";
import { resolveTableStyle, cssText, type CssDecls } from "../../../editor/data/tableStyle";
import { readAuthEnabled } from "../../../editor/data/authMode";
import { buildMountScript } from "./mountScript";
import { buildStaticHtml } from "./staticHtml";
import {
  buildCsvExportScript,
  buildStaticCsvDataScript,
  buildStaticEditScript,
  buildStaticExpandScript,
  buildStaticFrozenScript,
  buildStaticPagerScript,
  buildStaticResizeScript,
  buildStaticRowSelectScript,
  buildStaticSearchScript,
  buildStaticVirtualBootstrap,
} from "./staticScripts";

/**
 * table 组件 → HTML（与编辑区 TableRenderer 结构同构）
 *
 * 新版支持 ColumnDef 列定义模型：
 *   - 按 field 从对象数组取值
 *   - 列宽/对齐/格式化按列差异化
 *   - 多态单元格渲染（boolean 圆点 / status 徽章 / link 外链 / image 缩略图）
 *   - 兼容旧版 headers + rows 降级
 *
 * 数据解析与样式口径全部来自 `editor/data/tableData.ts` / `tableStyle.ts`，
 * 本文件**不写任何默认值字面量**。
 *
 * 交互铁律：行悬浮高亮由 `.tbl-<uid> tbody tr:hover td` 类规则承载，
 * **不能写成 inline style**（inline 恒胜过样式表，会把悬浮态永久压死）。
 *
 * 拆分后：静态 HTML 骨架、静态交互脚本、接口/虚拟模式运行时脚本分别收口到
 * `./staticHtml` / `./staticScripts` / `./mountScript`，运行时内联常量在 `./runtime`，
 * 本文件只负责配置解析与最终拼装，对外 API 与拆分前保持一致。
 */
export const tableCodegen: ComponentCodegenFn = (component) => {
  const c = component.config;

  const dataMode = String(c.dataMode ?? "static");
  const isApi = dataMode === "api" && (String(c.apiUrl ?? "") || String(c.apiPath ?? ""));
  const s = resolveTableStyle(c);

  // 编译期解析列定义（静态模式优先用面板配置；接口模式等运行时重建）
  const staticModel = resolveTableData({ config: c, isApi: false });
  const staticColumns = getColumnDefs(staticModel);
  const staticColCount = staticColumns.length;

  // 面板列定义（与编辑端 resolveTableData 的 API 分支同口径：优先 tableData，其次 columnDefs）。
  // 接口模式下发布端必须把它合并进 API 派生列，否则编辑器预览（已合并）与发布后（未合并）漂移。
  let panelColumns: ColumnDef[] = [];
  if (c.tableData != null) {
    const unified = parseTableDataModel(c.tableData);
    if (unified) panelColumns = unified.columns;
  }
  if (panelColumns.length === 0) panelColumns = parseColumnDefs(c.columnDefs);

  // P4 虚拟滚动 / 列宽拖拽：口径与编辑端唯一（tableData.ts）
  const vs = readVirtualScroll(c);
  const resizableColumns = readColumnResize(c);
  // 虚拟滚动与分页互斥（与编辑端同口径）
  const virtualStatic = !isApi && vs.enabled && staticColCount > 0;
  // 行展开详情（P2-2）：与虚拟滚动互斥（详情行破坏等高窗口 spacer 数学，与分页同口径）
  const showRowExpand = c.showRowExpand === true && !vs.enabled;
  const detailField = String(c.detailField ?? "detail").trim() || "detail";

  // 单元格编辑（多维第一档）：editEnabled 开启后双击可编辑类型单元格进入编辑态。
  // 写回配置：url 留空 = 仅本地修改；method 限 PUT/POST/PATCH；idField 为行主键字段。
  const editEnabled = c.editEnabled === true;
  const editApiUrl = String(c.editApiUrl ?? "").trim();
  const editApiMethodRaw = String(c.editApiMethod ?? "PUT").toUpperCase();
  const editApiMethod = ["PUT", "POST", "PATCH"].indexOf(editApiMethodRaw) >= 0 ? editApiMethodRaw : "PUT";
  const editIdField = String(c.editIdField ?? "id").trim() || "id";
  const editAuth = readAuthEnabled(c.authEnabled);
  const editAuthLiteral = editAuth === null ? "null" : String(editAuth);

  const uid = `tbl-${Math.random().toString(36).slice(2, 9)}`;

  const stickyInline = s.stickyHeader ? "position:sticky;top:0;z-index:1;" : "";
  const thStyle = cssText(s.th) + (stickyInline ? `;${stickyInline}` : "");
  const emptyTdStyle = cssText(s.emptyTd);

  /* ── 样式规则（含行悬浮 —— 状态属性只能由类规则承载） ── */
  const hoverRule = s.hoverBg
    ? `.${uid} tbody tr:hover td{background-color:${s.hoverBg};}`
    : "";

  const showRowSelection = c.showRowSelection === true;
  // 空态/详情行的总列跨度（数据列 + 行选择列 + 展开列）
  const spanAll = staticColCount + (showRowSelection ? 1 : 0) + (showRowExpand ? 1 : 0);
  // 行选中高亮由类规则承载（同悬停纪律：状态属性不得写 inline）
  const rowSelectedRule = showRowSelection
    ? `.${uid} tbody tr.${uid}-row-selected td{background-color:rgba(33,150,243,0.10);}`
    : "";
  const selCheckStyle = "width:14px;height:14px;cursor:pointer;vertical-align:middle";
  const selHeaderCell = showRowSelection
    ? `<th style="${thStyle}width:36px;text-align:center"><input type="checkbox" data-sel-all style="${selCheckStyle}" /></th>`
    : "";
  // 展开列表头（无 data-col-index：非数据列，冻结/列宽拖拽自动跳过）
  const expandHeaderCell = showRowExpand
    ? `<th style="${thStyle}width:36px;text-align:center"></th>`
    : "";
  // 行首列复选框（仅在有列定义的新版模型下渲染，与编辑端同构）
  const selRowCell = (ri: number) =>
    showRowSelection
      ? `<td style="${cssText(s.td(ri))}width:36px;text-align:center"><input type="checkbox" data-sel-row="${ri}" style="${selCheckStyle}" /></td>`
      : "";

  const showSearch = c.showSearch === true;
  const showExportCsv = c.exportCsv === true;
  // 冻结列（P2）：冻结前 N 列（按可见列序号），横向滚动时常驻左侧
  const frozenCount = Math.max(0, Math.min(50, Math.floor(Number(c.frozenColumns) || 0)));

  // 虚拟滚动开启时忽略分页（与编辑端 readVirtualScroll 互斥口径一致）
  const showPagination = c.showPagination === true && !vs.enabled;
  const staticPageSize = Math.max(1, Math.floor(Number(c.pageSize) || 10));
  const showPageSizeOptions = c.showPageSizeOptions !== false;
  const showQuickJumper = c.showQuickJumper === true;

  // 静态 HTML 骨架（表头/表体/搜索框/工具栏/分页容器/样式/整体）
  const { styleTag, outer } = buildStaticHtml({
    uid,
    s,
    thStyle,
    emptyTdStyle,
    resizableColumns,
    showRowSelection,
    showRowExpand,
    spanAll,
    selHeaderCell,
    expandHeaderCell,
    selRowCell,
    detailField,
    isApi: !!isApi,
    virtualStatic,
    vs,
    showSearch,
    showExportCsv,
    showPagination,
    searchPlaceholder: String(c.searchPlaceholder ?? "搜索…"),
    hoverRule,
    rowSelectedRule,
    staticColumns,
    staticModel,
  });

  // 静态模式交互脚本：搜索过滤 / 分页 / 行选择 / 列宽拖拽 / 行展开 / 单元格编辑 / 数据岛 / 导出 / 冻结列
  const staticSearchScript = buildStaticSearchScript({ uid, showSearch, showPagination, virtualStatic });
  const staticPagerScript = buildStaticPagerScript({
    uid,
    showSearch,
    showPagination,
    staticPageSize,
    showPageSizeOptions,
    showQuickJumper,
  });
  const staticResizeScript = buildStaticResizeScript({ uid, resizableColumns });
  const staticRowSelectScript = buildStaticRowSelectScript({ uid, showRowSelection, staticModel });
  const staticCsvDataScript = buildStaticCsvDataScript({
    uid,
    showExportCsv,
    editEnabled,
    isApi: !!isApi,
    virtualStatic,
    staticColumns,
    staticModel,
  });
  const csvExportScript = buildCsvExportScript({ uid, showExportCsv });
  const staticExpandScript = buildStaticExpandScript({ uid, showRowExpand, isApi: !!isApi, virtualStatic });
  const staticFrozenScript = buildStaticFrozenScript({ uid, frozenCount, s });
  const staticEditScript = buildStaticEditScript({
    uid,
    editEnabled,
    isApi: !!isApi,
    virtualStatic,
    editApiUrl,
    editApiMethod,
    editIdField,
    editAuthLiteral,
  });
  const staticVirtualBootstrap = buildStaticVirtualBootstrap({ uid, virtualStatic, staticColumns, staticModel });

  // 接口模式 / 静态虚拟滚动：运行时重建（同一份解析与样式口径的 JS 化）
  const thDecls: CssDecls = { ...s.th, ...(s.stickyHeader ? { position: "sticky", top: "0", zIndex: "1" } : {}) };
  const mountScript = buildMountScript({
    uid,
    showRowSelection,
    showRowExpand,
    detailField,
    vs,
    resizableColumns,
    editEnabled,
    editApiUrl,
    editApiMethod,
    editIdField,
    editAuthLiteral,
    panelColumns,
    frozenCount,
    s,
    staticColCount,
    emptyTdStyle,
    showSearch,
    showPagination,
    staticPageSize,
    showPageSizeOptions,
    showQuickJumper,
    selCheckStyle,
    thDecls,
  });

  const loader = dataLoaderScript({
    container: `var el = document.getElementById("${uid}-body");`,
    apiUrl: String(c.apiUrl ?? ""),
    apiPath: String(c.apiPath ?? ""),
    apiMethod: String(c.apiMethod ?? "GET"),
    apiHeaders: String(c.apiHeaders ?? ""),
    apiBody: String(c.apiBody ?? ""),
    apiInterval: Number(c.apiInterval ?? 0),
    apiDataPath: String(c.apiDataPath ?? ""),
    authEnabled: readAuthEnabled(c.authEnabled),
    renderBody: `if (window["__wcTbl_${uid}"]) window["__wcTbl_${uid}"](data, json);`,
  });

  if (!isApi) {
    if (virtualStatic) {
      // mountScript 先定义 __wcTbl_${uid}，bootstrap 再灌入编译期数据触发首屏渲染
      return `${styleTag}${outer}${mountScript}${staticVirtualBootstrap}${csvExportScript}${staticFrozenScript}`;
    }
    return `${styleTag}${outer}${staticSearchScript}${staticPagerScript}${staticResizeScript}${staticRowSelectScript}${staticCsvDataScript}${csvExportScript}${staticExpandScript}${staticFrozenScript}${staticEditScript}`;
  }
  return `${styleTag}${outer}${mountScript}${loader}${csvExportScript}`;
};