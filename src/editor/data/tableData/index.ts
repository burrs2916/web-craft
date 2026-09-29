/**
 * 表格族（表格 / 分页 / 日历 / 描述列表 / 树形控件）的**唯一取值口径**：数据解析。
 *
 * 拆分为多个子模块后由本文件聚合导出，对外 API 与拆分前保持一致。
 */
export { headersToColumnDefs, parseColumnDefs, inferColumnDefs, mergeColumnDefs } from './columns';
export type { ColumnDef } from './columns';
export { getTableHeaders, filterTableRows, sortTableRows, paginateTableRows, toggleRowSelection, toggleAllRowsSelection, getColumnDefs, getRowValues, formatCellDisplay, rowsToData, iterateTableRows, parseTableHeaders, parseTableRows, normalizeTablePayload } from './rows';
export type { TableRow, TableModel, SortOrder } from './rows';
export { parseTableDataModel, resolveTableData, parseCSV, tableModelToCSV, csvToTableModel } from './resolve';
export type { ResolveTableOptions } from './resolve';
export { DEFAULT_DESCRIPTION_ITEMS, parseDescriptionItems, normalizeDescriptionPayload, resolveDescriptionItems, padDescriptionItems } from './description';
export type { DescriptionItem } from './description';
export { DEFAULT_TREE_DATA, hasBranch, parseTreeNodes, normalizeTreePayload, resolveTreeData, collectBranchKeys, collectKeysByLevel, countTreeNodes } from './tree';
export type { TreeNodeModel } from './tree';
export { PAGE_SIZE_OPTIONS, buildPaginationModel, normalizePaginationTotal, VIRTUAL_OVERSCAN, computeVirtualRange, applyFrozenColumns, renderRowDetail, readVirtualScroll, readColumnResize } from './pagination';
export type { PaginationModel, VirtualRange } from './pagination';
export { EDITABLE_CELL_TYPES, isCellEditable, initialEditValue, parseCellEditValue, tableRowSearchText, renderCellHtml, tableCellWriteBack, attachTableCellEditing } from './cellEditing';
export { WEEKDAY_LABELS, MONTH_LABELS, toDateKey, parseDateValue, daysInMonth, buildMonthGrid, weekdayLabels, isWeekendColumn, normalizeCalendarMarks, indexCalendarMarks, resolveCalendarMarks } from './calendar';
export type { CalendarMark } from './calendar';
