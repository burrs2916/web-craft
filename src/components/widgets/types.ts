import type { BaseWidgetProps } from "../../types/widget";

export interface MetricWidgetProps extends BaseWidgetProps {
  value: string;
  interval: string;
  trend: "up" | "down" | "neutral";
  /** 可选：覆盖趋势 Chip 的默认文案（默认按 trend 显示 +12.5%/-3.2%/0%）。用于接入真实数据时不显示虚假百分比。 */
  trendLabel?: string;
  data: number[];
}

export interface ChartWidgetProps extends BaseWidgetProps {
  height?: number;
}

export interface LineChartWidgetProps extends ChartWidgetProps {
  data: {
    xAxis: string[];
    series: {
      name: string;
      data: number[];
    }[];
  };
}

export interface BarChartWidgetProps extends ChartWidgetProps {
  data: { label: string; value: number }[];
}

export interface PieChartWidgetProps extends ChartWidgetProps {
  data: {
    name: string;
    value: number;
  }[];
}

export interface GaugeChartWidgetProps extends ChartWidgetProps {
  value: number;
  min?: number;
  max?: number;
  unit?: string;
}

export interface TableWidgetProps extends BaseWidgetProps {
  columns: TableWidgetColumn[];
  rows: Record<string, unknown>[];
  searchable?: boolean;
  searchPlaceholder?: string;
  pagination?: boolean;
  rowsPerPageOptions?: number[];
  defaultRowsPerPage?: number;
  onRowClick?: (row: Record<string, unknown>) => void;
}

export interface TableWidgetColumn {
  id: string;
  label: string;
  minWidth?: number;
  align?: "left" | "right" | "center";
  format?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
  sortable?: boolean;
}

export interface TextWidgetProps extends BaseWidgetProps {
  content: string;
  variant?: "body1" | "body2" | "caption" | "h6" | "subtitle1";
  color?: string;
}
