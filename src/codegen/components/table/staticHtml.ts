import { escapeHTML } from "../../layout";
import {
  renderCellHtml,
  renderRowDetail,
  tableRowSearchText,
  visibleColumnDefs,
  type ColumnDef,
  type TableModel,
  type TableRow,
} from "../../../editor/data/tableData";
import { cssText, type TablePagerStyle, type TableStyle } from "../../../editor/data/tableStyle";

/** 静态模式表头/表体/工具栏 HTML 构建所需的编译期上下文。 */
export interface StaticHtmlContext {
  uid: string;
  s: TableStyle;
  thStyle: string;
  emptyTdStyle: string;
  resizableColumns: boolean;
  showRowSelection: boolean;
  showRowExpand: boolean;
  spanAll: number;
  selHeaderCell: string;
  expandHeaderCell: string;
  selRowCell: (ri: number) => string;
  detailField: string;
  isApi: boolean;
  virtualStatic: boolean;
  vs: { enabled: boolean; viewportHeight: number };
  showSearch: boolean;
  showExportCsv: boolean;
  showPagination: boolean;
  pagerStyle: TablePagerStyle;
  searchPlaceholder: string;
  hoverRule: string;
  rowSelectedRule: string;
  staticColumns: ColumnDef[];
  staticModel: TableModel;
}

export interface StaticHtmlResult {
  staticHeaderHTML: string;
  staticBodyHTML: string;
  tableHTML: string;
  searchHTML: string;
  csvToolbarHTML: string;
  pagerHTML: string;
  styleTag: string;
  outer: string;
}

// 构造行的搜索文本（与 filterTableRows 的匹配口径一致的纯文本表示：boolean→是/否，其余 String 原值）
// 口径收口到 tableData.tableRowSearchText（编辑脚本提交后同步 data-search-text 也用同一份）
function buildRowSearchText(row: TableRow, columns: ColumnDef[]): string {
  return tableRowSearchText(row, columns);
}

// 静态模式下的表头 HTML（如果有列定义）
function buildHeaderHTML(ctx: StaticHtmlContext, columns: ColumnDef[]): string {
  const { s, thStyle, selHeaderCell, expandHeaderCell, resizableColumns } = ctx;
  if (!s.showHeader || columns.length === 0) return "";
  const cells = columns.map((col, ci) => {
    const colSt = s.columnStyles(ci);
    const extra = colSt.width ? `width:${colSt.width};` : "";
    const alignExtra = colSt.align ? `text-align:${colSt.align};` : "";
    const relativeExtra = resizableColumns ? "position:relative;" : "";
    const resizer = resizableColumns
      ? `<span data-col-resizer="${ci}" style="position:absolute;top:0;right:-4px;width:8px;height:100%;cursor:col-resize;z-index:2" title="拖拽调整列宽"></span>`
      : "";
    // thStyle / baseStyle 走 cssText() —— 序列化**末尾不带分号**，后面还要接 extra / alignExtra 时
    // 必须在交界补一个完整 ";"，否则粘成 `white-space:nowraptext-align:left` → 整条声明作废。
    // 无条件补（relativeExtra 自带尾部分号时会出现 ";;"，style 属性完全合法），
    // 比"判断 relativeExtra 是否为空"更不容易漏。
    return `<th data-col-index="${ci}" style="${thStyle};${relativeExtra}${extra}${alignExtra}">${escapeHTML(col.header || col.field)}${resizer}</th>`;
  });
  return `<thead><tr>${selHeaderCell}${expandHeaderCell}${cells.join("")}</tr></thead>`;
}

// 静态模式下的数据行 HTML（按列定义提取值）
function buildBodyHTML(
  ctx: StaticHtmlContext,
  columns: ColumnDef[],
  data: TableRow[],
  rows?: string[][],
): string {
  const { s, uid, emptyTdStyle, showRowSelection, showRowExpand, spanAll, detailField, selRowCell } = ctx;
  if (columns.length === 0 && (!rows || rows.length === 0)) {
    return `<tbody><tr><td style="${emptyTdStyle};height:100%">${escapeHTML(s.emptyText)}</td></tr></tbody>`;
  }
  if (columns.length === 0) {
    // 旧版降级：无列定义但有 rows
    return `<tbody>${(rows ?? []).map((row, ri) => {
      const tdStyle = cssText(s.td(ri));
      const tds = row.map((cell, ci) => `<td data-col-index="${ci}" style="${tdStyle}">${escapeHTML(cell)}</td>`).join("");
      const searchText = escapeHTML(row.join(" ").toLowerCase());
      return `<tr data-search-text="${searchText}" data-row-index="${ri}">${tds}</tr>`;
    }).join("")}</tbody>`;
  }
  if (data.length === 0 && (!rows || rows.length === 0)) {
    const colSpan = columns.length + (showRowSelection ? 1 : 0) + (showRowExpand ? 1 : 0);
    return `<tbody><tr><td colspan="${colSpan}" style="${emptyTdStyle}">${escapeHTML(s.emptyText)}</td></tr></tbody>`;
  }
  // 优先使用对象数组 data
  if (data.length > 0) {
    // 详情行单元格样式：不固定行高（内容自适应）、保留边框与内边距
    const detailTdStyle = `border:${s.borderCss || "none"};padding:${s.padY}px ${s.padX}px;text-align:left;white-space:pre-wrap;`;
    const expandBtnStyle = "width:22px;height:22px;padding:0;font-size:12px;line-height:1;color:rgba(255,255,255,0.65);background-color:transparent;border:1px solid rgba(255,255,255,0.12);border-radius:4px;cursor:pointer";
    return `<tbody>${data.map((row, ri) => {
      const tds = columns.map((col, ci) => {
        const colSt = s.columnStyles(ci);
        const baseStyle = s.td(ri);
        let extra = "";
        if (colSt.align) extra += `text-align:${colSt.align};`;
        if (colSt.width) extra += `width:${colSt.width};`;
        if (colSt.minWidth) extra += `min-width:${colSt.minWidth};`;
        if (colSt.fontSize) extra += `font-size:${colSt.fontSize}px;`;
        if (colSt.color) extra += `color:${colSt.color};`;
        if (colSt.padY !== undefined || colSt.padX !== undefined) {
          extra += `padding:${colSt.padY ?? s.padY}px ${colSt.padX ?? s.padX}px;`;
        }
        const cellContent = renderCellHtml(row, col);
        // baseStyle 末尾不带分号（cssText 约定），后面接额外声明时必须补一整个 ";"，
        // 否则粘成 `white-space:nowraptext-align:center` → 声明作废、该单元格对齐/宽高全丢。
        return `<td data-col-index="${ci}" style="${cssText(baseStyle)};${extra}">${cellContent}</td>`;
      }).join("");
      const searchText = escapeHTML(buildRowSearchText(row, columns));
      // 展开列：详情内容非空才渲染箭头（renderRowDetail 口径两端同源）
      const detail = showRowExpand ? renderRowDetail(row[detailField]) : "";
      const expandCell = showRowExpand
        ? `<td style="${cssText(s.td(ri))};width:36px;text-align:center">${detail ? `<button type="button" data-expand="${ri}" style="${expandBtnStyle}">▸</button>` : ""}</td>`
        : "";
      const detailRow = detail
        ? `<tr data-detail-row="${ri}" class="${uid}-detail-hidden"><td colspan="${spanAll}" style="${detailTdStyle}">${escapeHTML(detail)}</td></tr>`
        : "";
      return `<tr data-search-text="${searchText}" data-row-index="${ri}">${selRowCell(ri)}${expandCell}${tds}</tr>${detailRow}`;
    }).join("")}</tbody>`;
  }
  // 降级旧版 rows
  return `<tbody>${(rows ?? []).map((row, ri) => {
    const tdStyle = cssText(s.td(ri));
    const tds = row.map((cell, ci) => `<td data-col-index="${ci}" style="${tdStyle}">${escapeHTML(cell)}</td>`).join("");
    const searchText = escapeHTML(row.join(" ").toLowerCase());
    return `<tr data-search-text="${searchText}" data-row-index="${ri}">${selRowCell(ri)}${tds}</tr>`;
  }).join("")}</tbody>`;
}

/** 组装静态模式的表头/表体/搜索/工具栏/分页/样式/整体骨架 HTML。 */
export function buildStaticHtml(ctx: StaticHtmlContext): StaticHtmlResult {
  const {
    uid,
    s,
    isApi,
    virtualStatic,
    vs,
    showSearch,
    showExportCsv,
    showPagination,
    pagerStyle,
    searchPlaceholder,
    hoverRule,
    rowSelectedRule,
    showRowExpand,
    staticColumns,
    staticModel,
  } = ctx;

  // bake 渲染列 = 列定义去掉 visible:false（面板勾选口径；与编辑区 visibleColumnDefs、
  // mountScript renderTable 内过滤三端同源）。此前 bake 不消费 visible → 静态产物中
  // 取消勾选的列照样渲染。
  const renderColumns = visibleColumnDefs(staticColumns);
  const staticHeaderHTML = !isApi ? buildHeaderHTML(ctx, renderColumns) : "";
  const staticBodyHTML = !isApi ? buildBodyHTML(ctx, renderColumns, staticModel.data ?? [], staticModel.rows) : "";

  // 虚拟滚动：容器布局（table/thead/tbody 块级流 + tbody 滚动区）随骨架内联，
  // 避免运行时书写 .style.display（状态切换仍全部走类规则）
  const virtualTableHTML = vs.enabled
    ? `<table style="width:100%;border-collapse:collapse;display:block"><thead id="${uid}-head" style="display:block"></thead><tbody id="${uid}-body" style="display:block;max-height:${vs.viewportHeight}px;overflow-y:auto;overscroll-behavior:contain"></tbody></table>`
    : "";

  // 编译期搜索框 HTML（静态/接口模式共用，与编辑端 TableRenderer 同构）
  const searchHTML = showSearch
    ? `<div style="padding:4px 8px;border-bottom:1px solid rgba(255,255,255,0.08)"><input type="text" id="${uid}-search" placeholder="${escapeHTML(String(searchPlaceholder ?? "搜索…"))}" style="width:100%;height:28px;padding:0 12px;font-size:${s.rowFontSize}px;color:${s.rowColor};background-color:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:4px;outline:none;" /></div>`
    : "";

  // 导出 CSV 工具栏（与编辑端 TableRenderer 同构）：仅当开启 exportCsv 时渲染，
  // 放置在表格上方、搜索框下方。有搜索框时搜索框已带下边框，这里不再重复。
  const csvToolbarHTML = showExportCsv
    ? `<div style="display:flex;align-items:center;justify-content:flex-end;padding:4px 8px${showSearch ? "" : ";border-bottom:1px solid rgba(255,255,255,0.08)"}"><button type="button" id="${uid}-export" style="height:28px;padding:0 12px;font-size:12px;color:rgba(255,255,255,0.85);background-color:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:4px;cursor:pointer">导出 CSV</button></div>`
    : "";

  const tableHTML = (isApi || virtualStatic)
    ? (virtualTableHTML || `<table style="width:100%;border-collapse:collapse"><thead id="${uid}-head"></thead><tbody id="${uid}-body"></tbody></table>`)
    : `<table style="width:100%;border-collapse:collapse">${staticHeaderHTML}${staticBodyHTML}</table>`;

  // 分页按钮状态色走类规则（修复：状态切换属性只能由类规则给，inline 会压制类规则）。
  // 独立分页器的 .is-active / .is-disabled 类规则随组件删除后，表格分页栏一直没接上 —— 这里补上。
  const pagerRule = showPagination
    ? `#${uid}-pager .wc-pg-btn{background-color:${pagerStyle.bgColor};color:${pagerStyle.textColor};}`
      + `#${uid}-pager .wc-pg-btn.is-active{background-color:${pagerStyle.color};color:${pagerStyle.activeTextColor};}`
      + `#${uid}-pager .wc-pg-btn.is-disabled{opacity:.4;cursor:not-allowed;}`
    : "";

  const styleTag = (hoverRule || rowSelectedRule || showSearch || showPagination || showRowExpand || pagerRule)
    ? `<style>${hoverRule}${rowSelectedRule}${showSearch || showPagination ? `.${uid}-row-hidden{display:none!important;}` : ""}${showRowExpand ? `.${uid}-detail-hidden{display:none!important;}` : ""}${showRowExpand ? `.${uid}-row-hidden + tr[data-detail-row]{display:none!important;}` : ""}${pagerRule}</style>`
    : "";

  const pagerHTML = showPagination
    ? `<div id="${uid}-pager" style="display:flex;align-items:center;justify-content:${pagerStyle.justify};gap:${pagerStyle.gap}px;padding:${pagerStyle.padY}px ${pagerStyle.padX}px;border-top:${pagerStyle.borderTop};flex-wrap:wrap"></div>`
    : "";

  const outer = `<div class="${uid}" style="${cssText(s.outer)}">${searchHTML}${csvToolbarHTML}${tableHTML}${pagerHTML}</div>`;

  return {
    staticHeaderHTML,
    staticBodyHTML,
    tableHTML,
    searchHTML,
    csvToolbarHTML,
    pagerHTML,
    styleTag,
    outer,
  };
}