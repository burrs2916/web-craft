import Box from "@mui/material/Box";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import type { ComponentRendererProps } from "../../types/editor";
import { useApiDataFetch } from "../hooks/useApiDataFetch";
import {
  resolveTableData,
  getColumnDefs,
  sortTableRows,
  filterTableRows,
  rowsToData,
  buildPaginationModel,
  normalizePaginationTotal,
  paginateTableRows,
  toggleRowSelection,
  toggleAllRowsSelection,
  formatCellDisplay,
  computeVirtualRange,
  readVirtualScroll,
  readColumnResize,
  tableModelToCSV,
  applyFrozenColumns,
  renderRowDetail,
  isCellEditable,
  initialEditValue,
  parseCellEditValue,
  PAGE_SIZE_OPTIONS,
  type ColumnDef,
  type TableRow,
} from "../data/tableData";
import { resolveTableStyle, tableColumnCount } from "../data/tableStyle";
import { readAuthEnabled } from "../data/authMode";

/**
 * 表格（table）编辑区渲染器 —— 与发布端 `codegen/components/table.ts` **结构同构**。
 *
 * 新版支持 ColumnDef 列定义模型：
 *   - columns: ColumnDef[]（字段/标题/类型/宽度/对齐/格式化/排序/可见性）
 *   - data: TableRow[]（对象数组，按 field 取值）
 *   - 兼容旧版 headers + rows（自动降级）
 *
 * 多态单元格：按 column.type 渲染不同形态（text/number/date/boolean/status/link/image）。
 * 排序：列头点击，asc → desc → none 循环。
 * 搜索：顶部搜索框，按文本/数字/日期多态匹配，实时过滤数据行。
 */

const pagerBtnSx = {
  minWidth: 26,
  height: 26,
  px: 0.5,
  fontSize: 12,
  lineHeight: "26px",
  color: "rgba(255,255,255,0.75)",
  backgroundColor: "transparent",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "4px",
  cursor: "pointer",
  userSelect: "none",
  "&:hover:not(:disabled)": { backgroundColor: "rgba(255,255,255,0.12)" },
  "&:disabled": { opacity: 0.35, cursor: "not-allowed" },
} as const;

const SAFE_URL_PROTOCOLS = new Set(["http:", "https:", "data:"]);
function isSafeUrl(url: string): boolean {
  try { return SAFE_URL_PROTOCOLS.has(new URL(url, "http://localhost").protocol); } catch { return false; }
}

function formatCellValue(row: TableRow, col: ColumnDef): string {
  return formatCellDisplay(row, col);
}

function renderCellContent(row: TableRow, col: ColumnDef): React.ReactNode {
  const value = formatCellValue(row, col);
  if (col.type === "link" && value) {
    return (
      <Box
        component="a"
        href={isSafeUrl(value) ? value : "#unsafe"}
        target="_blank"
        rel="noopener noreferrer"
        sx={{ color: "#2196F3", textDecoration: "none", fontSize: "inherit" }}
      >
        {value}
      </Box>
    );
  }
  if (col.type === "image" && value) {
    return isSafeUrl(value) ? (
      <Box
        component="img"
        src={value}
        alt={col.header || col.field}
        sx={{
          maxWidth: 48,
          maxHeight: 32,
          objectFit: "contain",
          borderRadius: 2,
          display: "block",
        }}
      />
    ) : null;
  }
  if (col.type === "boolean") {
    const on = value === "是";
    return (
      <Box
        component="span"
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.5,
          color: on ? "#4CAF50" : "#F44336",
          fontSize: "inherit",
        }}
      >
        <Box
          component="span"
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: on ? "#4CAF50" : "#F44336",
            display: "inline-block",
          }}
        />
        {value}
      </Box>
    );
  }
  if (col.type === "status" && value) {
    return (
      <Box
        component="span"
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.5,
          px: 1,
          py: 0.25,
          borderRadius: 1,
          fontSize: "0.85em",
          backgroundColor: "rgba(255,255,255,0.08)",
          color: "rgba(255,255,255,0.9)",
        }}
      >
        <Box
          component="span"
          sx={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: value === "error" ? "#F44336" : value === "warning" ? "#FF9800" : "#4CAF50",
            display: "inline-block",
          }}
        />
        {value}
      </Box>
    );
  }
  return value;
}

export function TableRenderer({ config }: ComponentRendererProps) {
  const dataMode = (config.dataMode as string) || "static";
  const isApi = dataMode === "api";

  const { data: fetchedData, error: apiError, loading } = useApiDataFetch<unknown>({
    dataMode: isApi ? "api" : "static",
    staticData: config.staticData != null && config.staticData !== "" ? config.staticData : undefined,
    apiPath: (config.apiPath as string) || "",
    apiUrl: (config.apiUrl as string) || "",
    apiMethod: ((config.apiMethod as string) || "GET") as "GET" | "POST",
    apiBody: config.apiBody,
    apiHeaders: config.apiHeaders,
    apiInterval: (config.apiInterval as number) ?? 0,
    apiDataPath: (config.apiDataPath as string) || "",
    authEnabled: readAuthEnabled(config.authEnabled),
    dataSourceId: (config.dataSourceId as string) || "",
  });

  // 行选择以「行对象引用」为标识，必须保证同一数据源下 model 解析结果复用：
  // 直接每次渲染 re-parse 会产生新引用，checkbox 状态会全部失效（排序/过滤/分页
  // 不复制行对象 → 引用在交互间稳定，但 re-parse 字符串会重建对象）。
  const model = useMemo(
    () => resolveTableData({ config, fetched: fetchedData, isApi }),
    [config, fetchedData, isApi],
  );
  const s = resolveTableStyle(config);
  const columns = getColumnDefs(model);
  const colCount = columns.length || tableColumnCount(model);
  const showEmpty = colCount > 0 && (!model.data || model.data.length === 0) && (!model.rows || model.rows.length === 0);
  const showNothing = colCount === 0;

  // ── 排序状态 ──
  const [sortField, setSortField] = useState("");
  const [sortOrder, setSortOrder] = useState("none");

  // ── 搜索状态 ──
  const showSearch = config.showSearch === true;
  const searchPlaceholder = (config.searchPlaceholder as string) || "搜索…";
  const [searchText, setSearchText] = useState("");

  // ── 分页状态 ──
  const virtualScroll = readVirtualScroll(config);
  const resizableColumns = readColumnResize(config);
  // 虚拟滚动与分页互斥（与发布端同口径）：启用虚拟滚动时忽略分页配置
  const showPagination = config.showPagination === true && !virtualScroll.enabled;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(Math.max(1, Math.floor(Number(config.pageSize) || 10)));

  // ── 导出 CSV（与发布端 csvExportScript 同源：导出当前加载的全量数据，带 BOM） ──
  const showExportCsv = config.exportCsv === true;
  const handleExportCsv = () => {
    const visibleCols = columns.filter((c) => c.visible !== false);
    if (!visibleCols.length) return;
    const csv = tableModelToCSV({ columns: visibleCols, rows: allData });
    const blob = new Blob([String.fromCharCode(65279) + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "table.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // ── 冻结列（P2，与发布端严格同源：调用同一份 tableData.ts 的 applyFrozenColumns） ──
  const frozenColumnsCfg = Math.max(0, Math.min(50, Math.floor(Number(config.frozenColumns) || 0)));
  const frozenCount = Math.min(frozenColumnsCfg, columns.length);
  // 每次渲染后重算 sticky 偏移与背景（纯 DOM 变更，不走 setState，无死循环风险）；
  // 发布端在 renderTable 末尾/静态 load 后调用同一函数，行为一致。
  useLayoutEffect(() => {
    applyFrozenColumns(outerRef.current, frozenCount, s.stickyHeader);
  });

  // ── 行展开详情（P2-2，与发布端同构：展开态按行对象引用保持） ──
  // 与虚拟滚动互斥（详情行破坏等高窗口 spacer 数学，与分页同口径）
  const showRowExpand = config.showRowExpand === true && !virtualScroll.enabled;
  const detailField = String(config.detailField ?? "detail").trim() || "detail";
  const [expandedRows, setExpandedRows] = useState<TableRow[]>([]);
  const toggleRowExpand = (row: TableRow) =>
    setExpandedRows((prev) =>
      prev.includes(row) ? prev.filter((r) => r !== row) : [...prev, row],
    );

  // ── P4 列宽拖拽状态 ──
  // 列宽是「布局度量」，运行时拖拽后以 px 覆盖 columnStyle.width（不写回配置，
  // 与发布端运行时拖拽同构）；拖拽过程中写入内联 style，属于布局度量而非状态属性。
  const [colWidths, setColWidths] = useState<Record<number, number>>({});
  const dragRef = useRef<{ index: number; startX: number; startW: number } | null>(null);

  // ── P4 虚拟滚动状态 ──
  const tbodyRef = useRef<HTMLElement>(null);
  const [vScrollTop, setVScrollTop] = useState(0);
  const rafRef = useRef<number | null>(null);
  const vRowHeight = Math.max(20, s.rowHeight); // 行高固定（td height），虚拟滚动按固定步长计算

  // 列变化（列数/顺序变化）时重置拖拽出的宽度，避免错位
  useEffect(() => {
    setColWidths({});
  }, [columns.length]);

  // 列宽拖拽：mousedown -> window mousemove/mouseup
  const handleResizeStart = (colIndex: number, startW: number) => (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { index: colIndex, startX: e.clientX, startW };
    const onMove = (ev: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const w = Math.max(40, Math.round(drag.startW + (ev.clientX - drag.startX)));
      setColWidths((prev) => (prev[drag.index] === w ? prev : { ...prev, [drag.index]: w }));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // 虚拟滚动：滚动时用 rAF 节流更新 scrollTop（避免每次 scroll 事件触发 React 重渲染）
  const handleTbodyScroll = (e: React.UIEvent<HTMLElement>) => {
    const el = e.currentTarget;
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setVScrollTop(el.scrollTop);
    });
  };
  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
  }, []);

  // ── 行选择状态（以行对象引用为标识，跨排序/搜索/分页稳定） ──
  const showRowSelection = config.showRowSelection === true;
  const [selectedRows, setSelectedRows] = useState<TableRow[]>([]);
  const outerRef = useRef<HTMLDivElement>(null);
  const headCheckRef = useRef<HTMLInputElement>(null);

  // ── 单元格编辑（多维第一档，与发布端 attachTableCellEditing 同构语义） ──
  // 编辑区仅本地预览：提交写入覆盖层（以行对象引用为键），不发写回请求（写回是发布端行为）。
  const editEnabled = config.editEnabled === true;
  const [editing, setEditing] = useState<{ row: TableRow; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editOverrides, setEditOverrides] = useState<Map<TableRow, Record<string, unknown>>>(new Map());

  // 单元格当前值：覆盖层优先，其次原始行值
  const cellValueOf = (row: TableRow, col: ColumnDef): unknown => {
    const o = editOverrides.get(row);
    if (o && col.field in o) return o[col.field];
    return row[col.field];
  };

  const startEdit = (row: TableRow, col: ColumnDef) => {
    if (!editEnabled || !isCellEditable(col)) return;
    setEditing({ row, field: col.field });
    setEditValue(initialEditValue(cellValueOf(row, col), col));
  };

  const commitEdit = (explicitVal?: string) => {
    if (!editing) return;
    const col = columns.find((c) => c.field === editing.field);
    if (!col) { setEditing(null); return; }
    const v = explicitVal != null ? explicitVal : editValue;
    const parsed = parseCellEditValue(col, v);
    const prev = cellValueOf(editing.row, col);
    const changed = parsed !== prev && String(parsed) !== String(prev);
    if (changed) {
      const target = editing.row;
      setEditOverrides((m) => {
        const next = new Map(m);
        next.set(target, { ...(next.get(target) ?? {}), [col.field]: parsed });
        return next;
      });
      // 与发布端同构：根节点派发 cell-edit 事件暴露本次编辑
      outerRef.current?.dispatchEvent(
        new CustomEvent("cell-edit", { detail: { field: col.field, value: parsed, row: target } }),
      );
    }
    setEditing(null);
  };

  const cancelEdit = () => setEditing(null);

  // 数据源刷新时行对象引用整体失效（与行选择的清空同口径）：编辑态与覆盖层一并清空
  useEffect(() => {
    setSelectedRows([]);
    setEditing(null);
    setEditOverrides(new Map());
  }, [fetchedData, config.staticData]);

  // 单元格编辑控件（布尔/下拉为 select，其余为 input；提交口径与发布端 parseCellEditValue 一致）
  const editorSx = {
    width: "100%",
    height: "24px",
    font: "inherit",
    fontSize: "inherit",
    color: "inherit",
    backgroundColor: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(33,150,243,0.6)",
    borderRadius: "3px",
    padding: "0 4px",
    outline: "none",
  } as const;
  const renderEditControl = (col: ColumnDef) => {
    if (col.type === "boolean" || col.type === "select") {
      const base = col.type === "boolean" ? ["是", "否"] : Array.isArray(col.options) ? col.options.map(String) : [];
      const list = col.type === "select" && editValue !== "" && !base.includes(editValue) ? [editValue, ...base] : base;
      return (
        <Box
          component="select"
          autoFocus
          value={editValue}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => commitEdit(e.target.value)}
          onBlur={() => commitEdit()}
          sx={editorSx}
        >
          {list.map((v) => (
            <Box key={v} component="option" value={v}>
              {v}
            </Box>
          ))}
        </Box>
      );
    }
    const type = col.type === "number" ? "number" : col.type === "date" ? "date" : "text";
    return (
      <Box
        component="input"
        autoFocus
        type={type}
        value={editValue}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setEditValue(e.target.value)}
        onBlur={() => commitEdit()}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Enter") commitEdit();
          else if (e.key === "Escape") cancelEdit();
        }}
        sx={editorSx}
      />
    );
  };

  // 选中变化时在组件根节点派发 row-selection-change 事件，暴露选中行数据
  useEffect(() => {
    if (!showRowSelection || !outerRef.current) return;
    outerRef.current.dispatchEvent(
      new CustomEvent("row-selection-change", { detail: { rows: [...selectedRows] } }),
    );
  }, [showRowSelection, selectedRows]);

  // 数据源刷新时行对象引用整体失效：清空选中/编辑覆盖（与发布端 __wcTbl_${uid} 刷新清空
  // SELECTED 同构）。仅监听数据源本身（接口响应 / 静态数据串），排序/搜索/分页不触发。
  // （该 effect 与上方"单元格编辑"清空逻辑合一，避免重复监听）

  // ── 数据流水线：原始 → 排序 → 过滤 → 分页 ──
  // 行选择依赖行对象引用稳定：model 已 useMemo，旧版 rows 降级也在此一次性转换，
  // 保证同数据源下 allData 引用不变（rowsToData 若每次渲染执行会重建行对象）。
  const allData: TableRow[] = useMemo(() => {
    if (model.data && model.data.length > 0) return model.data;
    if (model.rows && model.rows.length > 0) return rowsToData(model.rows, model.headers ?? []);
    return [];
  }, [model]);

  // P2 性能：整个流水线（排序→过滤→分页）一次性 useMemo，避免每次渲染重复计算。
  // 依赖项严格限定：仅当 allData / columns / sortField / sortOrder / searchText / page / pageSize / showPagination 变化时重算。
  const { filteredData, displayData, totalCount, pageModel } = useMemo(() => {
    const sortedData = sortTableRows(allData, columns, sortField, sortOrder as "asc" | "desc" | "none");
    const filteredData = filterTableRows(sortedData, columns, searchText);
    const dynamicTotal = isApi ? normalizePaginationTotal(fetchedData) : null;
    const totalCount = dynamicTotal != null ? dynamicTotal : filteredData.length;
    const pageModel = buildPaginationModel({ current: page, pageSize, total: totalCount });
    // 虚拟滚动优先于分页：窗口化渲染替代分页切片（与发布端同构）
    const displayData = showPagination ? paginateTableRows(filteredData, pageModel.current, pageModel.pageSize) : filteredData;
    return { filteredData, displayData, totalCount, pageModel };
  }, [allData, columns, sortField, sortOrder, searchText, page, pageSize, showPagination, isApi, fetchedData]);

  // P4 虚拟滚动：按滚动位置计算可视行窗口（仅影响渲染，不影响排序/过滤/选择语义）
  // 仅列定义模型（columns.length>0）启用；旧版 rows 降级为普通渲染。
  const virtual = virtualScroll.enabled && columns.length > 0 && filteredData.length > 0
    ? computeVirtualRange({
        scrollTop: vScrollTop,
        viewportHeight: virtualScroll.viewportHeight,
        rowHeight: vRowHeight,
        total: filteredData.length,
      })
    : null;
  // 渲染用行集：虚拟滚动时取窗口切片，否则取分页/全量 displayData
  const renderRows = virtual
    ? filteredData.slice(virtual.start, virtual.end)
    : displayData;

  // 列当前宽度（px）：拖拽覆盖优先，其次列定义宽度，取不到按 0（表头/表体按同一口径取宽）
  const colWidthPx = (i: number): number => {
    const w = colWidths[i];
    if (w) return w;
    const colStyle = s.columnStyles(i);
    return parseFloat(String(colStyle.width ?? "")) || 0;
  };

  // 排序/搜索变化时回到第 1 页
  useEffect(() => {
    setPage(1);
  }, [sortField, sortOrder, searchText, showPagination, pageSize]);

  // 表头全选框三态：checked（展示行全选）/ indeterminate（部分选）/ 空（全不选），
  // 与发布端 syncSelHeader 按 RENDERED_ROWS + SELECTED 计算的口径一致。
  useEffect(() => {
    if (!showRowSelection || !headCheckRef.current) return;
    const el = headCheckRef.current;
    const n = renderRows.length;
    const picked = renderRows.filter((r) => selectedRows.includes(r)).length;
    el.checked = n > 0 && picked === n;
    el.indeterminate = picked > 0 && picked < n;
  }, [showRowSelection, selectedRows, renderRows]);

  const thSx = s.th;
  const stickySx = s.stickyHeader
    ? { position: "sticky", top: 0, zIndex: 1 }
    : {};

  return (
    <Box ref={outerRef} sx={s.outer}>
      {showSearch && (
        <Box sx={{ p: "4px 8px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <Box
            component="input"
            type="text"
            placeholder={searchPlaceholder}
            value={searchText}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchText(e.target.value)}
            sx={{
              width: "100%",
              height: "28px",
              px: 1.5,
              fontSize: `${s.rowFontSize}px`,
              color: s.rowColor,
              backgroundColor: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "4px",
              outline: "none",
              "&::placeholder": { color: "rgba(255,255,255,0.25)" },
              "&:focus": { borderColor: "rgba(255,255,255,0.2)" },
            }}
          />
        </Box>
      )}
      {showExportCsv && (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", p: "4px 8px", borderBottom: showSearch ? undefined : "1px solid rgba(255,255,255,0.08)" }}>
          <Box
            component="button"
            type="button"
            onClick={handleExportCsv}
            sx={{
              height: "28px",
              px: 1.5,
              fontSize: 12,
              color: "rgba(255,255,255,0.85)",
              backgroundColor: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            导出 CSV
          </Box>
        </Box>
      )}
      {showNothing ? (
        <Box sx={{ ...s.emptyTd, height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {isApi ? "加载中…" : s.emptyText}
        </Box>
      ) : (
        <Box
          component="table"
          sx={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: `${s.rowFontSize}px`,
            "& th, & td": { boxSizing: "border-box" },
            ...(virtual ? { display: "block" } : {}),
            ...(s.hoverBg
              ? { "& tbody tr:hover td": { backgroundColor: s.hoverBg } }
              : {}),
          }}
        >
          {s.showHeader && columns.length > 0 && (
            <Box component="thead" sx={virtual ? { display: "block" } : {}}>
              <Box component="tr" sx={virtual ? { display: "table", tableLayout: "fixed", width: "100%" } : {}}>
                {showRowSelection && (
                  <Box
                    component="th"
                    key="__row-sel"
                    sx={{ ...thSx, width: 36, textAlign: "center" }}
                  >
                    <Box
                      component="input"
                      type="checkbox"
                      ref={headCheckRef}
                      onChange={() => setSelectedRows(toggleAllRowsSelection(selectedRows, renderRows))}
                      sx={{
                        cursor: "pointer",
                        accentColor: "#2196F3",
                        width: 14,
                        height: 14,
                        m: 0,
                      }}
                    />
                  </Box>
                )}
                {showRowExpand && (
                  <Box component="th" key="__expand-head" sx={{ ...thSx, width: 36, textAlign: "center" }} />
                )}
                {columns.map((col, i) => {
                  const colStyle = s.columnStyles(i);
                  const sortable = col.sortable !== false;
                  const isSorted = sortField === col.field;
                  return (
                    <Box
                      component="th"
                      key={`${col.field}-${i}`}
                      data-col-index={i}
                      onClick={(e) => {
                        // 拖拽列宽手柄时误触 th：不做排序（与发布端 closest('[data-col-resizer]') 守卫同构）
                        if ((e.target as Element).closest?.("[data-col-resizer]")) return;
                        if (!sortable) return;
                        if (isSorted) {
                          setSortOrder((prev) => (prev === "asc" ? "desc" : prev === "desc" ? "none" : "asc"));
                        } else {
                          setSortField(col.field);
                          setSortOrder("asc");
                        }
                      }}
                      sx={{
                        ...thSx,
                        ...(s.stickyHeader ? { position: "sticky", top: 0, zIndex: 1 } : {}),
                        ...(resizableColumns ? { position: "relative" } : {}),
                        ...(colWidths[i] ? { width: `${colWidths[i]}px` } : colStyle.width ? { width: colStyle.width } : {}),
                        ...(colStyle.align ? { textAlign: colStyle.align } : {}),
                        ...(sortable ? {
                          cursor: "pointer",
                          userSelect: "none",
                          "&:hover": { backgroundColor: "rgba(255,255,255,0.12)" },
                        } : {}),
                      } as any}
                    >
                      <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                        {col.header || col.field}
                        {sortable && (
                          <Box component="span" sx={{ fontSize: "0.75em", opacity: isSorted ? 1 : 0.3 }}>
                            {isSorted && sortOrder === "asc" ? "▲" : isSorted && sortOrder === "desc" ? "▼" : "⇅"}
                          </Box>
                        )}
                      </Box>
                      {resizableColumns && (
                        <Box
                          component="span"
                          data-col-resizer={i}
                          onMouseDown={handleResizeStart(i, colWidthPx(i) || 100)}
                          title="拖拽调整列宽"
                          sx={{
                            position: "absolute",
                            top: 0,
                            right: -4,
                            width: 8,
                            height: "100%",
                            cursor: "col-resize",
                            zIndex: 2,
                            "&:hover": { backgroundColor: "rgba(33,150,243,0.35)" },
                          }}
                        />
                      )}
                    </Box>
                  );
                })}
              </Box>
            </Box>
          )}
          {s.showHeader && columns.length === 0 && model.headers && model.headers.length > 0 && (
            <Box component="thead">
              <Box component="tr">
                {model.headers.map((h, i) => (
                  <Box component="th" key={`legacy-${i}`} data-col-index={i} sx={{ ...thSx, ...stickySx }}>
                    {h}
                  </Box>
                ))}
              </Box>
            </Box>
          )}
          <Box
            component="tbody"
            ref={tbodyRef}
            {...(virtual ? { onScroll: handleTbodyScroll } : {})}
            sx={
              virtual
                ? {
                    display: "block",
                    maxHeight: virtualScroll.viewportHeight,
                    overflowY: "auto",
                    overscrollBehavior: "contain",
                  }
                : {}
            }
          >
            {showEmpty ? (
              <Box component="tr">
                <Box component="td" colSpan={colCount + (showRowSelection ? 1 : 0) + (showRowExpand ? 1 : 0)} sx={{ ...s.emptyTd }}>
                  {isApi && loading ? "加载中…" : isApi && apiError ? apiError : s.emptyText}
                </Box>
              </Box>
            ) : (
              (() => {
                const rows: React.ReactNode[] = [];
                // 虚拟滚动顶部垫片：占位已滚动出视口的行高（tr 以块级高度承载，不参与表格布局）
                if (virtual && virtual.start > 0) {
                  rows.push(
                    <Box
                      component="tr"
                      key="__virtual-top"
                      data-virtual-spacer="top"
                      sx={{ display: "block", height: virtual.start * vRowHeight }}
                    />,
                  );
                }
                if (renderRows.length > 0) {
                  renderRows.forEach((row, ri) => {
                    const rowSelected = showRowSelection && selectedRows.includes(row);
                    const rowDetail = showRowExpand ? renderRowDetail(row[detailField]) : "";
                    const rowExpanded = showRowExpand && expandedRows.includes(row);
                    rows.push(
                      <Box
                        component="tr"
                        key={ri}
                        data-row-index={ri}
                        sx={virtual ? { display: "table", tableLayout: "fixed", width: "100%" } : {}}
                      >
                        {showRowSelection && (
                          <Box
                            component="td"
                            key="__row-sel"
                            sx={{
                              ...s.td(ri),
                              width: 36,
                              textAlign: "center",
                              ...(rowSelected ? { backgroundColor: "rgba(33,150,243,0.10)" } : {}),
                            }}
                          >
                            <Box
                              component="input"
                              type="checkbox"
                              data-sel-row={ri}
                              checked={rowSelected}
                              onChange={() => setSelectedRows(toggleRowSelection(selectedRows, row))}
                              sx={{
                                cursor: "pointer",
                                accentColor: "#2196F3",
                                width: 14,
                                height: 14,
                                m: 0,
                              }}
                            />
                          </Box>
                        )}
                        {showRowExpand && (
                          <Box
                            component="td"
                            key="__expand"
                            sx={{ ...s.td(ri), width: 36, textAlign: "center" }}
                          >
                            {rowDetail && (
                              <Box
                                component="button"
                                type="button"
                                onClick={() => toggleRowExpand(row)}
                                sx={{
                                  width: "22px",
                                  height: "22px",
                                  p: 0,
                                  fontSize: 12,
                                  lineHeight: 1,
                                  color: "rgba(255,255,255,0.65)",
                                  backgroundColor: "transparent",
                                  border: "1px solid rgba(255,255,255,0.12)",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                }}
                              >
                                {rowExpanded ? "▾" : "▸"}
                              </Box>
                            )}
                          </Box>
                        )}
                        {columns.map((col, ci) => {
                          const colSt = s.columnStyles(ci);
                          const tdDecl = s.td(ri);
                          const cellEditable = editEnabled && isCellEditable(col);
                          const isEditingCell = editing != null && editing.row === row && editing.field === col.field;
                          // 覆盖层取值：有编辑覆盖时以覆盖值渲染（行对象引用保持，不破坏行选择标识）
                          const override = editOverrides.get(row);
                          const effRow = override && col.field in override
                            ? { ...row, [col.field]: override[col.field] }
                            : row;
                          return (
                            <Box
                              component="td"
                              key={`${col.field}-${ci}`}
                              data-col-index={ci}
                              onDoubleClick={cellEditable ? () => startEdit(row, col) : undefined}
                              title={cellEditable && !isEditingCell ? "双击编辑" : undefined}
                              sx={{
                                ...tdDecl,
                                ...(cellEditable ? { cursor: "cell" } : {}),
                                ...(colSt.align ? { textAlign: colSt.align } : {}),
                                ...(colWidths[ci] ? { width: `${colWidths[ci]}px` } : colSt.width ? { width: colSt.width } : {}),
                                ...(colSt.minWidth ? { minWidth: colSt.minWidth } : {}),
                                ...(colSt.padY !== undefined || colSt.padX !== undefined
                                  ? {
                                      padding: `${colSt.padY ?? s.padY}px ${colSt.padX ?? s.padX}px`,
                                    }
                                  : {}),
                                ...(colSt.fontSize ? { fontSize: `${colSt.fontSize}px` } : {}),
                                ...(colSt.color ? { color: colSt.color } : {}),
                                ...(rowSelected ? { backgroundColor: "rgba(33,150,243,0.10)" } : {}),
                              }}
                            >
                              {isEditingCell ? renderEditControl(col) : renderCellContent(effRow, col)}
                            </Box>
                          );
                        })}
                      </Box>
                    );
                    // 详情行：展开且详情内容非空时渲染（colSpan 覆盖 选择列+展开列+数据列）
                    if (rowExpanded && rowDetail) {
                      rows.push(
                        <Box component="tr" key={`detail-${ri}`}>
                          <Box
                            component="td"
                            colSpan={colCount + (showRowSelection ? 1 : 0) + 1}
                            sx={{
                              border: s.borderEnabled ? `${s.borderWidth}px ${s.borderStyle} ${s.borderColor}` : undefined,
                              px: `${s.padX}px`,
                              py: `${s.padY}px`,
                              textAlign: "left",
                              whiteSpace: "pre-wrap",
                              color: s.rowColor,
                              fontSize: `${s.rowFontSize}px`,
                            }}
                          >
                            {rowDetail}
                          </Box>
                        </Box>,
                      );
                    }
                  });
                } else if (model.rows && model.rows.length > 0) {
                  // 旧版降级：rows 是 string[][], 按顺序渲染
                  model.rows.forEach((row, ri) => {
                    rows.push(
                      <Box component="tr" key={`legacy-${ri}`}>
                        {Array.from({ length: colCount }).map((_, ci) => (
                          <Box component="td" key={ci} data-col-index={ci} sx={s.td(ri)}>
                            {row[ci] ?? ""}
                          </Box>
                        ))}
                      </Box>
                    );
                  });
                }
                // 虚拟滚动底部垫片：占位视图下方未渲染的行高
                if (virtual && virtual.start + renderRows.length < filteredData.length) {
                  rows.push(
                    <Box
                      component="tr"
                      key="__virtual-bottom"
                      data-virtual-spacer="bottom"
                      sx={{
                        display: "block",
                        height: (filteredData.length - virtual.start - renderRows.length) * vRowHeight,
                      }}
                    />,
                  );
                }
                return rows;
              })()
            )}
          </Box>
        </Box>
      )}
      {showPagination && !showNothing && !showEmpty && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 0.5,
            px: 1,
            py: 0.5,
            borderTop: "1px solid rgba(255,255,255,0.08)",
            flexWrap: "wrap",
          }}
        >
          {config.showPageSizeOptions !== false && (
            <Box
              component="select"
              value={pageSize}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setPageSize(Math.max(1, Number(e.target.value)))}
              sx={{
                height: 26,
                fontSize: 12,
                color: "rgba(255,255,255,0.75)",
                backgroundColor: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "4px",
                outline: "none",
              }}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <Box component="option" key={n} value={n} sx={{ backgroundColor: "#1e1e2e" }}>
                  {n} 条/页
                </Box>
              ))}
            </Box>
          )}
          <Box
            component="button"
            disabled={!pageModel.canPrev}
            onClick={() => setPage(pageModel.current - 1)}
            sx={pagerBtnSx}
          >
            ‹
          </Box>
          {pageModel.pageItems.map((item, i) =>
            item === "ellipsis" ? (
              <Box key={`e-${i}`} component="span" sx={{ fontSize: 12, color: "rgba(255,255,255,0.4)", px: 0.5 }}>
                …
              </Box>
            ) : (
              <Box
                key={item}
                component="button"
                onClick={() => setPage(item)}
                sx={{
                  ...pagerBtnSx,
                  ...(item === pageModel.current
                    ? { backgroundColor: "#2196F3", color: "#fff", borderColor: "#2196F3" }
                    : {}),
                }}
              >
                {item}
              </Box>
            ),
          )}
          <Box
            component="button"
            disabled={!pageModel.canNext}
            onClick={() => setPage(pageModel.current + 1)}
            sx={pagerBtnSx}
          >
            ›
          </Box>
          {config.showQuickJumper === true && (
            <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, ml: 0.5 }}>
              <Box
                component="input"
                type="number"
                min={1}
                max={pageModel.totalPages}
                defaultValue={pageModel.current}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter") {
                    const target = e.target as HTMLInputElement;
                    const v = Number(target.value);
                    if (v >= 1 && v <= pageModel.totalPages) setPage(v);
                  }
                }}
                sx={{
                  width: 44,
                  height: 26,
                  fontSize: 12,
                  color: "rgba(255,255,255,0.75)",
                  backgroundColor: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "4px",
                  outline: "none",
                  textAlign: "center",
                }}
              />
            </Box>
          )}
          <Box component="span" sx={{ fontSize: 12, color: "rgba(255,255,255,0.4)", ml: 0.5 }}>
            共 {totalCount} 条
          </Box>
        </Box>
      )}
      {isApi && apiError && !showNothing && (
        <Box sx={{ color: "#F44336", fontSize: 11, p: 1, textAlign: "center" }}>{apiError}</Box>
      )}
    </Box>
  );
}
