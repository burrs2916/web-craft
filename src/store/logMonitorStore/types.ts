import type { ExportParams, OperationLog, DeviceEvent, SystemEvent, SensorRecord } from "../../services/historyApi";
import type { LogAnalysisReport } from "../../services/logMonitorApi";

// ═══════════════════════════════════════════════════════════════════
// 类型镜像（与 logQueryStore 对齐，方便替换时的视觉对齐）
// ═══════════════════════════════════════════════════════════════════

export type LogTab = "operation" | "event" | "system" | "sensor";

export interface TimeRange {
  from: string;
  to: string;
}

export interface QueryResult<T> {
  data: T[];
  total: number;
}

export interface LogQueryParams {
  timeRange: TimeRange;
  /** 多选设备画像：点选分控器卡时填入，scope 收窄为这些设备（支持分控器多选过滤） */
  selectedDeviceIds: string[];
  logLevel: string;
  eventType: string;
  /** 命令码过滤（如 0x0619 / 0x061b / 0x0628 喷雾触发类），从概览卡跳转时设置 */
  commandCode: string;
  currentPage: number;
  pageSize: number;
}

export interface LogMonitorState extends LogQueryParams {
  // ── Tab ──
  activeTab: LogTab;

  // ── 场景作用域 ──
  scopeMode: "scene" | "global";
  sceneDeviceIds: string[];
  /** 主视图喷雾控制工具栏当前绑定的集控器根（deviceId 列表），用于日志面板渲染"当前监控集控器"卡片 */
  selectedControllerIds: string[];

  // ── 查询结果（4 类：与 historyApi 一致的强类型）──
  operationLogs: QueryResult<OperationLog>;
  deviceEvents: QueryResult<DeviceEvent>;
  systemEvents: QueryResult<SystemEvent>;
  sensorData: QueryResult<SensorRecord>;

  // ── 概览卡统计样本（足量，不进表格分页）──
  statsEvents: QueryResult<DeviceEvent>;
  /** 概览卡指令统计：近 24h 总量 + 成功数（不进表格分页） */
  statsOps: QueryResult<OperationLog>;

  // ── 分析洞察报告（Task #110，消费 /api/history/log-monitor/report）──
  report: LogAnalysisReport | null;
  reportLoading: boolean;
  reportError: string | null;
  /** 报告参数：粉尘报警阈值 mg/m³（默认 10） */
  dustThreshold: number;
  /** 报告参数：关联命中窗口秒（默认 300） */
  sprayWindowSec: number;

  // ── 加载状态 ──
  loading: boolean;
  error: string | null;
  exporting: boolean;

  // ── 中央自动刷新 nonce（每 30s bump 一次，3 图表订阅自刷新）──
  refreshNonce: number;

  // ── Actions：参数设置 ──
  setQueryParams: (params: Partial<LogQueryParams>) => void;
  setActiveTab: (tab: LogTab) => void;
  setCurrentPage: (page: number) => void;
  setPageSize: (size: number) => void;

  // ── Actions：作用域 ──
  setScopeMode: (mode: "scene" | "global") => void;
  /** 由 subscribeLogMonitorToScene() 自动调用（外部也可手填） */
  setSceneDeviceIds: (ids: string[]) => void;
  /** 由 subscribeLogMonitorToScene() 自动调用，写入当前工具栏绑定的集控器根 */
  setSelectedControllerIds: (ids: string[]) => void;

  // ── Actions：查询 ──
  queryOperationLogs: () => Promise<void>;
  queryDeviceEvents: () => Promise<void>;
  /** 概览卡统计：近 24h 足量样本（limit=1000），不进表格分页 */
  queryEventsForStats: () => Promise<void>;
  /** 概览卡指令统计：近 24h 总量+成功数（limit=1000），不进表格分页 */
  queryOpsForStats: () => Promise<void>;
  querySystemEvents: () => Promise<void>;
  querySensorData: () => Promise<void>;
  queryActiveTab: () => Promise<void>;

  // ── Actions：导出 ──
  exportCsv: (source?: ExportParams["source"]) => Promise<void>;
  /** 生成分析洞察报告（调 report 端点，写 report 状态） */
  queryReport: () => Promise<void>;
  /** 导出分析洞察报告为 Markdown 文件（走 Tauri save dialog） */
  exportReport: () => Promise<void>;

  // ── Actions：重置 ──
  resetQuery: () => void;

  /** 中央定时器每 30s 调用：bump nonce 触发 3 图表(load) 自刷新 */
  bumpRefresh: () => void;
}