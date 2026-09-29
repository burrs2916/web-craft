import {
  VIRTUAL_OVERSCAN,
  computeVirtualRange,
  formatCellDisplay,
  renderCellHtml,
  renderRowDetail,
  mergeColumnDefs,
  type ColumnDef,
} from "../../../editor/data/tableData";
import { cssText, type CssDecls, type TableStyle } from "../../../editor/data/tableStyle";
import {
  EDIT_RUNTIME_JS,
  FROZEN_RUNTIME_JS,
  PAGINATION_RUNTIME_JS,
  escapeJs,
} from "./runtime";

/** 接口模式 / 静态虚拟滚动共用同一份运行时脚本所需的编译期上下文。 */
export interface MountScriptContext {
  uid: string;
  showRowSelection: boolean;
  showRowExpand: boolean;
  detailField: string;
  vs: { enabled: boolean; viewportHeight: number };
  resizableColumns: boolean;
  editEnabled: boolean;
  editApiUrl: string;
  editApiMethod: string;
  editIdField: string;
  editAuthLiteral: string;
  panelColumns: ColumnDef[];
  frozenCount: number;
  s: TableStyle;
  staticColCount: number;
  emptyTdStyle: string;
  showSearch: boolean;
  showPagination: boolean;
  staticPageSize: number;
  showPageSizeOptions: boolean;
  showQuickJumper: boolean;
  selCheckStyle: string;
  thDecls: CssDecls;
}

/**
 * 接口模式 / 静态虚拟滚动：运行时重建（同一份解析与样式口径的 JS 化）。
 * 与编辑区 TableRenderer 结构同构，两端行为严格一致。
 */
export function buildMountScript(ctx: MountScriptContext): string {
  const {
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
  } = ctx;

  return `<script>
(function(){
  var head = document.getElementById("${uid}-head");
  var body = document.getElementById("${uid}-body");
  if (!body) return;
  var ROOT_EL = document.querySelector(".${uid}");
  var TABLE_EL = body.parentElement;
  var RENDERED_ROWS = [];
  var SHOW_ROW_SELECTION = ${showRowSelection};
  var SELECTED = []; // 选中行对象引用（排序/过滤/分页不复制行对象 → 引用稳定）
  ${showRowExpand ? `var SHOW_ROW_EXPAND = true;
  var DETAIL_FIELD = ${escapeJs(detailField)};
  var EXPANDED = []; // 展开行对象引用（排序/过滤/分页重渲染不丢展开态）
  var renderRowDetail = ${renderRowDetail.toString()};` : "var SHOW_ROW_EXPAND = false;"}

  // P4 虚拟滚动 / 列宽拖拽运行时常量（口径来自 tableData.ts）
  var VIRTUAL_ENABLED = ${vs.enabled};
  var VIRTUAL_HEIGHT = ${vs.viewportHeight};
  var VIRTUAL_OVERSCAN = ${VIRTUAL_OVERSCAN};
  var VSCROLL_TOP = 0;
  var VROW_HEIGHT = ${s.rowHeight};
  var RESIZABLE = ${resizableColumns};
  // 虚拟滚动窗口算法：直接复用编辑区 computeVirtualRange（已内联为运行时函数），
  // 与编辑区严格同源，消除此前在 renderTable 内手写一份导致的 ±1 行漂移。
  var computeVirtualRange = ${computeVirtualRange.toString()};
  // 单元格格式化：直接复用编辑区 formatCellDisplay（已内联为运行时函数），
  // 与编辑区严格同源；col.format 的日期/数字格式化两端一致生效，不再各自实现一份。
  var formatCellDisplay = ${formatCellDisplay.toString()};
  // 多态单元格 HTML：内联编辑区 renderCellHtml（与编译期/静态编辑脚本同一份实现），
  // 取代此前手写的运行时 renderCell 双份字面量。
  var renderCellHtml = ${renderCellHtml.toString()};
  // 编辑口径函数仅在开启编辑时内联（attachTableCellEditing 源码含行定位契约字符串，
  // 无条件内联会污染「不 bake 行」类断言与产物体积）
  ${editEnabled ? EDIT_RUNTIME_JS : ""}
  // 单元格编辑（多维第一档）配置：url 留空 = 仅本地修改；auth 三态与取数骨架同口径
  var EDIT_ENABLED = ${editEnabled};
  var EDIT_URL = ${escapeJs(editApiUrl)};
  var EDIT_METHOD = ${escapeJs(editApiMethod)};
  var EDIT_ID_FIELD = ${escapeJs(editIdField)};
  var EDIT_AUTH = ${editAuthLiteral};
  // 面板列定义（来自 config.tableData / columnDefs）：接口模式下与 API 派生列合并，
  // 与编辑端 resolveTableData 的 mergeColumnDefs 同源（已内联），保证画布预览与发布后一致。
  var PANEL_COLUMNS = ${JSON.stringify(panelColumns)};
  var mergeColumnDefs = ${mergeColumnDefs.toString()};
  ${frozenCount > 0 ? FROZEN_RUNTIME_JS : ""}
  var WIDTHS = {}; // 运行时拖拽列宽（px），与编辑端 colWidths state 对应，重渲染不丢失
  var SCROLLING = false;
  function emitSelection(){
    if (!ROOT_EL) return;
    ROOT_EL.dispatchEvent(new CustomEvent("row-selection-change", { detail: { rows: SELECTED.slice() } }));
  }
  function refreshTable(){
    renderTable(CURRENT_COLS, window["__wcTblData_${uid}"] || []);
  }
  // 行复选框事件委托：冒泡阶段统一处理（渲染重建不丢失监听，与编辑端 onChange 同构）
  if (SHOW_ROW_SELECTION && body) {
    body.addEventListener("change", function(e){
      var t = e.target;
      if (!t || !t.getAttribute) return;
      if (t.getAttribute("data-sel-row") == null) return;
      var ri = Number(t.getAttribute("data-sel-row"));
      var row = RENDERED_ROWS[ri];
      if (!row) return;
      var pos = SELECTED.indexOf(row);
      if (t.checked && pos < 0) SELECTED.push(row);
      if (!t.checked && pos >= 0) SELECTED.splice(pos, 1);
      var tr = t.closest("tr");
      if (tr) tr.classList.toggle("${uid}-row-selected", !!t.checked);
      syncSelHeader();
      emitSelection();
    });
  }
  // 行展开点击委托：切换 EXPANDED 引用后整表重渲染（详情行随重渲染重建，展开态按行对象引用保持）
  if (SHOW_ROW_EXPAND && body) {
    body.addEventListener("click", function(e){
      var t = e.target;
      if (!t || !t.getAttribute) return;
      if (t.getAttribute("data-expand-row") == null) return;
      var row = RENDERED_ROWS[Number(t.getAttribute("data-expand-row"))];
      if (!row) return;
      var pos = EXPANDED.indexOf(row);
      if (pos >= 0) EXPANDED.splice(pos, 1);
      else EXPANDED.push(row);
      refreshTable();
    });
  }
  // 单元格编辑（多维第一档）：双击原位编辑 + 乐观更新 + 写回失败回滚（与静态编辑脚本同一份实现）。
  // getRows/getColumns 分别对应渲染定位的行序号与可见列序号（与 td/tr 上的定位属性严格一致）。
  if (EDIT_ENABLED && body) {
    attachTableCellEditing(body, {
      enabled: true,
      getColumns: function(){ return VISIBLE_COLS; },
      getRows: function(){ return RENDERED_ROWS; },
      renderCellHtml: renderCellHtml,
      searchTextOf: null,
      writeBack: EDIT_URL ? function(row, field, value, done){
        tableCellWriteBack({ url: EDIT_URL, method: EDIT_METHOD, idField: EDIT_ID_FIELD, row: row, field: field, value: value, authEnabled: EDIT_AUTH })
          .then(function(ok){ if (!ok && window.console && console.warn) console.warn("[webcraft table] 单元格写回失败，已回滚本地修改:", field); done(ok); });
      } : null,
      onEdit: function(row, field, value){
        if (ROOT_EL) ROOT_EL.dispatchEvent(new CustomEvent("cell-edit", { detail: { field: field, value: value, row: row } }));
      },
    });
  }
  // 表头全选框三态：checked / indeterminate / 空。渲染后调用（与编辑端 displayData 全选口径一致）
  function syncSelHeader(){
    if (!SHOW_ROW_SELECTION) return;
    var all = head ? head.querySelector("input[data-sel-all]") : null;
    if (!all) return;
    var n = RENDERED_ROWS.length;
    var picked = 0;
    for (var i = 0; i < n; i++) {
      if (SELECTED.indexOf(RENDERED_ROWS[i]) >= 0) picked++;
    }
    all.checked = n > 0 && picked === n;
    all.indeterminate = picked > 0 && picked < n;
  }
  var TH_STYLE = ${escapeJs(cssText(thDecls))};
  var EMPTY_TD_STYLE = ${escapeJs(emptyTdStyle)};
  var SHOW_HEADER = ${s.showHeader};
  var STRIPE = ${s.stripeEnabled};
  var STRIPE_COLOR = ${escapeJs(s.stripeColor)};
  var ROW_HEIGHT = ${s.rowHeight};
  var ROW_COLOR = ${escapeJs(s.rowColor)};
  var ROW_FONT = ${s.rowFontSize};
  var BORDER = ${escapeJs(s.borderCss)};
  var PAD = ${escapeJs(`${s.padY}px ${s.padX}px`)};
  var ALIGN = ${escapeJs(s.align)};
  var EMPTY_TEXT = ${escapeJs(s.emptyText)};
  var COLUMN_STYLES = ${JSON.stringify(
    Array.from({ length: Math.max(staticColCount, 0) }).map((_, i) => {
      const cs = s.columnStyles(i);
      return {
        width: cs.width || null,
        align: cs.align || null,
        fontSize: cs.fontSize || null,
        color: cs.color || null,
        minWidth: cs.minWidth || null,
        padY: cs.padY !== undefined ? cs.padY : null,
        padX: cs.padX !== undefined ? cs.padX : null,
      };
    }),
  )};

  function escapeHtml(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }
  function tdStyle(ri, colIdx){
    var cs = COLUMN_STYLES[colIdx] || {};
    var css = "color:" + (cs.color || ROW_COLOR) + ";font-size:" + (cs.fontSize || ROW_FONT) + "px;height:" + ROW_HEIGHT + "px;border:" + (BORDER || "none") + ";";
    var padY = cs.padY != null ? cs.padY : ${s.padY};
    var padX = cs.padX != null ? cs.padX : ${s.padX};
    css += "padding:" + padY + "px " + padX + "px;";
    css += "text-align:" + (cs.align || ALIGN) + ";white-space:nowrap;";
    // 运行时拖拽宽度优先（与编辑端 colWidths[i] > columnStyle.width 同口径）
    if (WIDTHS[colIdx]) css += "width:" + WIDTHS[colIdx] + "px;";
    else if (cs.width) css += "width:" + cs.width + ";";
    if (cs.minWidth) css += "min-width:" + cs.minWidth + ";";
    if (STRIPE && ri % 2 === 1) css += "background-color:" + STRIPE_COLOR + ";";
    return css;
  }
  // 运行时单元格渲染：委托给同源 renderCellHtml（口径收口，见上方内联注释）
  var renderCell = function(row, col){
    return renderCellHtml(row, col);
  };
  function renderEmpty(){
    var span = (COLS || 1) + (SHOW_ROW_SELECTION ? 1 : 0);
    if (body) body.innerHTML = '<tr><td colspan="' + span + '" style="' + EMPTY_TD_STYLE + '">' + escapeHtml(EMPTY_TEXT) + '</td></tr>';
  }
  function parseColumnDefs(input) {
    if (!input) return [];
    if (Array.isArray(input)) {
      return input.filter(function(item){ return item && typeof item === "object"; }).map(function(item){
        var field = String(item.field || "");
        if (!field) return null;
        return {
          field: field,
          header: item.header != null ? String(item.header) : field,
          type: ["text","number","date","boolean","status","link","image","select"].indexOf(String(item.type).toLowerCase()) >= 0 ? String(item.type).toLowerCase() : "text",
          width: item.width != null ? String(item.width) : undefined,
          align: ["left","center","right"].indexOf(String(item.align).toLowerCase()) >= 0 ? String(item.align).toLowerCase() : undefined,
          format: item.format != null ? String(item.format) : undefined,
          sortable: item.sortable !== false,
          visible: item.visible !== false,
          options: (function(v){
            if (Array.isArray(v)) { var arr = v.map(String).filter(function(s){ return s.trim() !== ""; }); return arr.length ? arr : undefined; }
            if (typeof v === "string" && v.trim()) { var arr2 = v.split(",").map(function(s){ return s.trim(); }).filter(Boolean); return arr2.length ? arr2 : undefined; }
            return undefined;
          })(item.options),
          editable: typeof item.editable === "boolean" ? item.editable : undefined,
        };
      }).filter(Boolean);
    }
    if (typeof input === "string") {
      return input.split(",").map(function(s){ return s.trim(); }).filter(Boolean).map(function(segment){
        var parts = segment.split(":").map(function(s){ return s.trim(); });
        var field = parts[0];
        var header = parts[1] || field;
        var type = ["text","number","date","boolean","status","link","image","select"].indexOf(String(parts[2]).toLowerCase()) >= 0 ? String(parts[2]).toLowerCase() : undefined;
        return { field: field, header: header, type: type };
      });
    }
    return [];
  }
  function inferColumnDefs(sample) {
    if (!sample || typeof sample !== "object") return [];
    return Object.keys(sample).map(function(field){
      var val = sample[field];
      var type = "text";
      if (typeof val === "boolean") type = "boolean";
      else if (typeof val === "number") type = "number";
      else if (typeof val === "string") {
        if (/^https?:\\/\\//.test(val) || /^\\//.test(val)) {
          if (/\\.(png|jpe?g|gif|webp|svg)(\\?.*)?$/i.test(val)) type = "image";
          else type = "link";
        } else if (/^\\d{4}-\\d{2}-\\d{2}/.test(val)) {
          type = "date";
        }
      }
      var align = type === "number" ? "right" : "left";
      return { field: field, header: field, type: type, align: align };
    });
  }
  var COLS = 0;
  var SORT_FIELD = "";
  var SORT_ORDER = "none";
  var SEARCH_TEXT = "";
  var CURRENT_COLS = [];
  var VISIBLE_COLS = []; // 当前渲染的可见列（data-col-index 的定位口径，编辑脚本取列用）
  var SHOW_SEARCH = ${showSearch};
  var SEARCH_INPUT_EL = SHOW_SEARCH ? document.getElementById("${uid}-search") : null;
${PAGINATION_RUNTIME_JS}
  // ── 分页状态（与编辑端 buildPaginationModel / normalizePaginationTotal / paginateTableRows 同构） ──
  var SHOW_PAGINATION = ${showPagination};
  var PAGER_EL = SHOW_PAGINATION ? document.getElementById("${uid}-pager") : null;
  var PAGER_STATE = { page: 1, pageSize: ${staticPageSize}, totalPages: 1 };
  var TOTAL = null; // 接口动态总数（原始响应归一化），不可用时空态回退本地过滤后条数
  if (PAGER_EL) {
    bindPager(PAGER_EL, PAGER_STATE, function(){
      renderTable(CURRENT_COLS, window["__wcTblData_${uid}"] || []);
    });
  }

  // ── P4 虚拟滚动：tbody 为滚动容器（布局样式已随骨架内联），rAF 节流滚动 → 重渲染窗口 ──
  if (VIRTUAL_ENABLED && body) {
    body.addEventListener("scroll", function(){
      if (SCROLLING) return;
      SCROLLING = true;
      requestAnimationFrame(function(){
        SCROLLING = false;
        var st = body.scrollTop;
        if (st === VSCROLL_TOP) return;
        VSCROLL_TOP = st;
        renderTable(CURRENT_COLS, window["__wcTblData_${uid}"] || []);
      });
    });
  }

  // ── P4 列宽拖拽：head 级 mousedown 委托 + document 级 move/up（冒泡委托在渲染重建后仍生效） ──
  function applyColWidth(ci, px){
    var tds = body ? body.querySelectorAll("td[data-col-index]") : [];
    for (var ai = 0; ai < tds.length; ai++) {
      if (Number(tds[ai].getAttribute("data-col-index")) === ci) tds[ai].style.width = px + "px";
    }
    if (head) {
      var ths = head.querySelectorAll("th[data-col-index]");
      for (var bi = 0; bi < ths.length; bi++) {
        if (Number(ths[bi].getAttribute("data-col-index")) === ci) ths[bi].style.width = px + "px";
      }
    }
  }
  if (RESIZABLE) {
    document.addEventListener("mousedown", function(e){
      var t = e.target;
      if (!t || !t.getAttribute) return;
      var idx = t.getAttribute("data-col-resizer");
      if (idx == null) return;
      e.preventDefault();
      var ci = Number(idx);
      var th = t.parentElement;
      var base = parseFloat(th && th.style.width) || 100;
      var drag = { ci: ci, startX: e.clientX, startW: base };
      function onMove(ev){
        if (!drag) return;
        var w = Math.max(40, Math.round(drag.startW + (ev.clientX - drag.startX)));
        if (WIDTHS[drag.ci] !== w) {
          WIDTHS[drag.ci] = w;
          applyColWidth(drag.ci, w);
        }
      }
      function onUp(){
        if (drag) document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        drag = null;
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  function filterRows(dataRows, columns, keyword) {
    var k = (keyword || "").trim().toLowerCase();
    if (!k) return dataRows;
    return dataRows.filter(function(row){
      return columns.some(function(col){
        var raw = row[col.field];
        if (raw == null) return false;
        if (col.type === "boolean") {
          var on = raw === true || raw === "true" || raw === 1;
          if (k === "true" || k === "是") return on;
          if (k === "false" || k === "否") return !on;
          return (on ? "是" : "否").toLowerCase().indexOf(k) >= 0;
        }
        if (col.type === "number") {
          var n = Number(raw);
          if (!isNaN(n)) {
            return String(n).indexOf(k) >= 0 || String(n) === k;
          }
        }
        return String(raw).toLowerCase().indexOf(k) >= 0;
      });
    });
  }

  function compareFn(field, type) {
    return function(a, b) {
      var av = a[field], bv = b[field];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (type === "number") {
        var an = Number(av), bn = Number(bv);
        if (!isNaN(an) && !isNaN(bn)) return an - bn;
      }
      if (type === "date") {
        var ad = new Date(String(av)).getTime(), bd = new Date(String(bv)).getTime();
        if (!isNaN(ad) && !isNaN(bd)) return ad - bd;
      }
      if (type === "boolean") {
        var at = (av === true || av === "true" || av === 1) ? 1 : 0;
        var bt = (bv === true || bv === "true" || bv === 1) ? 1 : 0;
        return at - bt;
      }
      return String(av).localeCompare(String(bv));
    };
  }

  function sortRows(dataRows, columns, field, order) {
    if (order === "none" || !field) return dataRows;
    var col = null;
    for (var i = 0; i < columns.length; i++) {
      if (columns[i].field === field) { col = columns[i]; break; }
    }
    if (!col || col.sortable === false) return dataRows;
    var cmp = compareFn(field, col.type);
    return dataRows.slice().sort(function(a, b){
      return order === "asc" ? cmp(a, b) : cmp(b, a);
    });
  }

  function renderTable(columns, dataRows) {
    columns = columns.filter(function(col){ return col.visible !== false; });
    COLS = columns.length;
    VISIBLE_COLS = columns;

    dataRows = sortRows(dataRows, columns, SORT_FIELD, SORT_ORDER);
    dataRows = filterRows(dataRows, columns, SEARCH_TEXT);
    var fullRows = dataRows;

    // P4 虚拟滚动：按滚动位置计算窗口（与编辑端 computeVirtualRange 同构），
    // 仅列定义模型生效（columns.length > 0），旧版 rows 降级为直排。
    var virtual = null;
    if (VIRTUAL_ENABLED && COLS > 0 && fullRows.length > 0) {
      // 虚拟滚动窗口：调用编辑区同款 computeVirtualRange（已内联进本脚本），
      // 保证画布与发布后的窗口计算结果严格一致，不再各自实现一份。
      var vWin = computeVirtualRange({
        scrollTop: VSCROLL_TOP,
        viewportHeight: VIRTUAL_HEIGHT,
        rowHeight: VROW_HEIGHT,
        total: fullRows.length,
        overscan: VIRTUAL_OVERSCAN,
      });
      virtual = { start: vWin.start, end: vWin.end };
      dataRows = fullRows.slice(vWin.start, vWin.end);
    }

    if (SHOW_PAGINATION) {
      var pgTotal = TOTAL != null ? TOTAL : fullRows.length;
      PAGER_STATE.totalPages = Math.max(1, Math.ceil(pgTotal / PAGER_STATE.pageSize));
      PAGER_STATE.page = clampPage(PAGER_STATE.page, PAGER_STATE.totalPages);
      dataRows = fullRows.slice((PAGER_STATE.page - 1) * PAGER_STATE.pageSize, PAGER_STATE.page * PAGER_STATE.pageSize);
    }
    var DISPLAY_TOTAL = TOTAL != null ? TOTAL : fullRows.length;

    if (head && SHOW_HEADER && COLS > 0) {
      var ths = "";
      if (SHOW_ROW_SELECTION) {
        ths += '<th style="' + TH_STYLE + 'width:36px;text-align:center"><input type="checkbox" data-sel-all style="' + ${escapeJs(selCheckStyle)} + '" /></th>';
      }
      if (SHOW_ROW_EXPAND) {
        ths += '<th style="' + TH_STYLE + 'width:36px;text-align:center"></th>';
      }
      for (var ci = 0; ci < columns.length; ci++) {
        var col = columns[ci];
        var cs = COLUMN_STYLES[ci] || {};
        var extra = "";
        if (WIDTHS[ci]) extra += "width:" + WIDTHS[ci] + "px;";
        else if (cs.width) extra += "width:" + cs.width + ";";
        if (RESIZABLE) extra += "position:relative;";
        if (cs.align) extra += "text-align:" + cs.align + ";";
        var sortable = col.sortable !== false;
        var isSorted = SORT_FIELD === col.field;
        var icon = isSorted && SORT_ORDER === "asc" ? "▲" : isSorted && SORT_ORDER === "desc" ? "▼" : "⇅";
        var cursorStyle = sortable ? "cursor:pointer;" : "";
        var resizer = RESIZABLE ? '<span data-col-resizer="' + ci + '" style="position:absolute;top:0;right:-4px;width:8px;height:100%;cursor:col-resize;z-index:2" title="拖拽调整列宽"></span>' : "";
        ths += '<th data-field="' + escapeHtml(col.field) + '" data-sortable="' + (sortable ? "true" : "false") + '" data-col-index="' + ci + '" style="' + TH_STYLE + extra + cursorStyle + '">' + escapeHtml(col.header || col.field) + (sortable ? '<span style="font-size:0.75em;margin-left:4px;opacity:' + (isSorted ? 1 : 0.3) + '">' + icon + '</span>' : '') + resizer + '</th>';
      }
      head.innerHTML = virtual ? '<tr style="display:table;table-layout:fixed;width:100%">' + ths + '</tr>' : '<tr>' + ths + '</tr>';
      var selHeadAll = head.querySelector("input[data-sel-all]");
      if (selHeadAll) selHeadAll.addEventListener("change", function(){
        // 全选/反选「当前渲染行」（过滤+分页/虚拟窗口后），与编辑端 toggleAllRowsSelection 同构
        var allPicked = RENDERED_ROWS.length > 0 && RENDERED_ROWS.every(function(r){ return SELECTED.indexOf(r) >= 0; });
        for (var si = 0; si < RENDERED_ROWS.length; si++) {
          var r2 = RENDERED_ROWS[si];
          var pos = SELECTED.indexOf(r2);
          if (allPicked) { if (pos >= 0) SELECTED.splice(pos, 1); }
          else if (pos < 0) SELECTED.push(r2);
        }
        refreshTable();
        emitSelection();
      });
      var thElems = head.querySelectorAll('th');
      for (var ti = 0; ti < thElems.length; ti++) {
        (function(th){
          if (th.getAttribute('data-sortable') === 'true') {
            th.addEventListener('click', function(ev){
              // 拖拽列宽手柄时误触 th：不做排序（与编辑端 stopPropagation 语义一致）
              if (ev.target && ev.target.closest && ev.target.closest('[data-col-resizer]')) return;
              var field = th.getAttribute('data-field');
              if (SORT_FIELD === field) {
                SORT_ORDER = SORT_ORDER === "asc" ? "desc" : SORT_ORDER === "desc" ? "none" : "asc";
              } else {
                SORT_FIELD = field;
                SORT_ORDER = "asc";
              }
              if (SHOW_PAGINATION) PAGER_STATE.page = 1;
              var currentData = window["__wcTblData_${uid}"] || [];
              renderTable(columns, currentData);
            });
          }
        })(thElems[ti]);
      }
    }

    // 空态/加载态：不渲染分页内容并隐藏分页容器（与编辑端"空态/加载态不分页"一致）
    if (!COLS) { if (PAGER_EL) PAGER_EL.classList.add("${uid}-pager-hidden"); renderEmpty(); return; }
    if (!fullRows.length) { if (PAGER_EL) PAGER_EL.classList.add("${uid}-pager-hidden"); renderEmpty(); return; }
    if (PAGER_EL) PAGER_EL.classList.remove("${uid}-pager-hidden");
    var html = "";
    RENDERED_ROWS = dataRows;
    // 虚拟滚动垫片：顶部/底部块级 spacer 承载未渲染行高（与编辑端 data-virtual-spacer 同构）
    if (virtual && virtual.start > 0) {
      html += '<tr data-virtual-spacer="top" style="display:block;height:' + (virtual.start * VROW_HEIGHT) + 'px"></tr>';
    }
    for (var ri = 0; ri < dataRows.length; ri++) {
      var row = dataRows[ri];
      var selected = SHOW_ROW_SELECTION && SELECTED.indexOf(row) >= 0;
      var expanded = SHOW_ROW_EXPAND && EXPANDED.indexOf(row) >= 0;
      var detailTxt = SHOW_ROW_EXPAND ? renderRowDetail(row[DETAIL_FIELD]) : "";
      var tds = "";
      if (SHOW_ROW_SELECTION) {
        tds += '<td style="' + tdStyle(ri, -1) + 'width:36px;text-align:center"><input type="checkbox" data-sel-row="' + ri + '"' + (selected ? ' checked="checked"' : '') + ' style="' + ${escapeJs(selCheckStyle)} + '" /></td>';
      }
      if (SHOW_ROW_EXPAND) {
        tds += '<td style="' + tdStyle(ri, -1) + 'width:36px;text-align:center">' + (detailTxt ? '<button type="button" data-expand-row="' + ri + '" style="width:22px;height:22px;padding:0;font-size:12px;line-height:1;color:rgba(255,255,255,0.65);background-color:transparent;border:1px solid rgba(255,255,255,0.12);border-radius:4px;cursor:pointer">' + (expanded ? "▾" : "▸") + '</button>' : '') + '</td>';
      }
      for (var ci2 = 0; ci2 < COLS; ci2++) {
        tds += '<td data-col-index="' + ci2 + '" style="' + tdStyle(ri, ci2) + '">' + renderCell(row, columns[ci2]) + '</td>';
      }
      html += '<tr' + (virtual ? ' style="display:table;table-layout:fixed;width:100%"' : '') + ' data-row-index="' + ri + '"' + (selected ? ' class="' + '${uid}-row-selected' + '"' : '') + '>' + tds + '</tr>';
      if (expanded && detailTxt) {
        html += '<tr data-detail-row="' + ri + '"><td colspan="' + (COLS + (SHOW_ROW_SELECTION ? 1 : 0) + 1) + '" style="border:' + (BORDER || "none") + ';padding:' + PAD + ';text-align:left;white-space:pre-wrap">' + escapeHtml(detailTxt) + '</td></tr>';
      }
    }
    if (virtual && virtual.end < fullRows.length) {
      html += '<tr data-virtual-spacer="bottom" style="display:block;height:' + ((fullRows.length - virtual.end) * VROW_HEIGHT) + 'px"></tr>';
    }
    body.innerHTML = html;
    syncSelHeader();
    if (SHOW_PAGINATION && PAGER_EL) {
      PAGER_EL.innerHTML = buildPagerHtml({
        current: PAGER_STATE.page,
        total: DISPLAY_TOTAL,
        totalPages: PAGER_STATE.totalPages,
        pageSize: PAGER_STATE.pageSize,
        showPageSize: ${showPageSizeOptions},
        showQuickJumper: ${showQuickJumper}
      });
    }
    ${frozenCount > 0 ? `\n    // 冻结列（P2）：每次重建后重算 sticky 偏移与背景\n    applyFrozenColumns(ROOT_EL, ${frozenCount}, ${s.stickyHeader});` : ""}
  }

  // 数据模型解析（新版 columns+data / 旧版 headers+rows / 纯对象数组 / 纯二维数组），
  // 接口模式与静态虚拟滚动共用同一条口径。
  function parseModel(model) {
    var out = { columns: [], dataRows: [] };
    if (!model) return out;
    if (typeof model === "object" && !Array.isArray(model)) {
      if (Array.isArray(model.columns) && model.columns.length > 0) {
        out.columns = parseColumnDefs(model.columns);
      }
      if (Array.isArray(model.data) && model.data.length > 0) {
        out.dataRows = model.data;
      }
      if (!out.columns.length && Array.isArray(model.headers) && model.headers.length > 0) {
        out.columns = model.headers.map(String).map(function(h){ return { field: h, header: h, type: "text" }; });
      }
      if (!out.dataRows.length && Array.isArray(model.rows) && model.rows.length > 0) {
        out.dataRows = model.rows.map(function(row){
          var obj = {};
          out.columns.forEach(function(col, idx){ obj[col.field] = row[idx] != null ? row[idx] : ""; });
          return obj;
        });
      }
      return out;
    }
    // 纯数组（对象数组）
    if (Array.isArray(model) && model.length > 0) {
      var first = model[0];
      if (first && typeof first === "object" && !Array.isArray(first)) {
        out.columns = inferColumnDefs(first);
        out.dataRows = model;
        return out;
      }
      if (Array.isArray(first)) {
        if (!out.columns.length) {
          var maxCols = Math.max.apply(null, model.map(function(r){ return r.length; }));
          for (var i = 0; i < maxCols; i++) {
            out.columns.push({ field: "col_" + i, header: "列 " + (i + 1), type: "text" });
          }
        }
        out.dataRows = model.map(function(row){
          var obj = {};
          out.columns.forEach(function(col, idx){ obj[col.field] = row[idx] != null ? row[idx] : ""; });
          return obj;
        });
        return out;
      }
    }
    return out;
  }

  window["__wcTbl_${uid}"] = function(data, json) {
    // 接口动态总数：优先取原始响应归一化（与编辑端 normalizePaginationTotal(fetchedData) 同构）
    if (SHOW_PAGINATION && json != null) {
      var apiTotal = normalizeTotal(json);
      if (apiTotal != null) TOTAL = apiTotal;
    }
    var model = data && data.__picked !== undefined ? data.__picked : data;
    var parsed = parseModel(model);
    // 合并面板列（与编辑端 mergeColumnDefs 同源）：API 派生列 + 面板覆盖（header/type/width/format/sortable/visible）
    var mergedCols = (PANEL_COLUMNS && PANEL_COLUMNS.length && parsed.columns.length)
      ? mergeColumnDefs(parsed.columns, PANEL_COLUMNS)
      : parsed.columns;
    window["__wcTblData_${uid}"] = parsed.dataRows;
    CURRENT_COLS = mergedCols;
    // 导出 CSV 共享全局键：合并后的列定义（含面板 header/type/format 覆盖），供 csvExportScript 读取
    window["__wcTblCols_${uid}"] = mergedCols;
    // 行对象引用随新数据失效：刷新时清空选中（与编辑端数据流水线变化清空 selectedRows 同构）
    if (SELECTED.length) { SELECTED = []; }
    renderTable(mergedCols, parsed.dataRows);
    emitSelection();
  };
  if (SEARCH_INPUT_EL) {
    var SEARCH_TIMER = null;
    SEARCH_INPUT_EL.addEventListener("input", function(){
      SEARCH_TEXT = SEARCH_INPUT_EL.value;
      if (SHOW_PAGINATION) PAGER_STATE.page = 1;
      if (SEARCH_TIMER) clearTimeout(SEARCH_TIMER);
      SEARCH_TIMER = setTimeout(function(){
        renderTable(CURRENT_COLS, window["__wcTblData_${uid}"] || []);
      }, 200);
    });
  }
  renderEmpty();
})();
</script>`;
}