import type { BaseWidgetProps } from "../../types/widget";

export interface AlertMonitorProps extends BaseWidgetProps {
  maxItems?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
  /** 默认确认筛选：未确认 / 已确认 / 全部（默认 all，保持仪表盘旧行为） */
  defaultAckFilter?: "all" | "unread" | "acknowledged";
  /** 是否显示「全部确认」「清空」批量操作（页面用，仪表盘卡片默认不显示） */
  showBulkActions?: boolean;
}

export interface LogViewerProps extends BaseWidgetProps {
  logLevel?: "debug" | "info" | "warn" | "error" | "all";
  maxLines?: number;
  autoScroll?: boolean;
}

export interface EventTimelineProps extends BaseWidgetProps {
  timeRange?: { start: string; end: string };
  eventTypes?: string[];
  maxEvents?: number;
}
