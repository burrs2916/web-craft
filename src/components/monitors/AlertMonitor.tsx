import { useEffect, useMemo, useState } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import Tooltip from "@mui/material/Tooltip";
import Badge from "@mui/material/Badge";
import Divider from "@mui/material/Divider";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import WarningRoundedIcon from "@mui/icons-material/WarningRounded";
import ErrorRoundedIcon from "@mui/icons-material/ErrorRounded";
import InfoRoundedIcon from "@mui/icons-material/InfoRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import NotificationsRoundedIcon from "@mui/icons-material/NotificationsRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import { useDeviceStore } from "../../store/deviceStore";
import { useAlarmHistoryStore } from "../../store/alarmHistoryStore";
import type { AlertMonitorProps } from "./types";

export type AlertSeverity = "error" | "warning" | "info" | "success";

export interface AlertItem {
  id: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  timestamp: string;
  source: string;
  acknowledged?: boolean;
}

// 报警传感器子类型 → 中文标签 + 严重度（与 alarmHistoryStore.AlarmRecord.sensorType 对齐）
export const sensorMeta: Record<
  NonNullable<import("../../store/alarmHistoryStore").AlarmRecord["sensorType"]>,
  { label: string; severity: AlertSeverity }
> = {
  smoke: { label: "烟雾报警", severity: "error" },
  touch: { label: "触控/急停", severity: "warning" },
  infrared: { label: "红外对射", severity: "warning" },
  dustAlarm: { label: "粉尘报警", severity: "error" },
  dust: { label: "粉尘浓度", severity: "info" },
  alarm: { label: "通用报警", severity: "warning" },
  numeric: { label: "数值越限", severity: "info" },
  unknown: { label: "未知报警", severity: "info" },
};

const severityConfig = {
  error: {
    color: "error" as const,
    icon: <ErrorRoundedIcon />,
    label: "严重",
  },
  warning: {
    color: "warning" as const,
    icon: <WarningRoundedIcon />,
    label: "警告",
  },
  info: {
    color: "info" as const,
    icon: <InfoRoundedIcon />,
    label: "信息",
  },
  success: {
    color: "success" as const,
    icon: <CheckCircleRoundedIcon />,
    label: "正常",
  },
};

// 级别 tab：全部 / 严重 / 警告 / 信息
const TAB_DEFS: { key: AlertSeverity | "all"; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "error", label: "严重" },
  { key: "warning", label: "警告" },
  { key: "info", label: "信息" },
];

// 确认状态 tab：全部 / 未确认 / 已确认
const ACK_TAB_DEFS: { key: "all" | "unread" | "acknowledged"; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "unread", label: "未确认" },
  { key: "acknowledged", label: "已确认" },
];

const PAGE_SIZE = 10;

export default function AlertMonitor({
  title = "告警中心",
  visible = true,
  style,
  className,
  defaultAckFilter = "all",
  showBulkActions = false,
}: AlertMonitorProps) {
  const records = useAlarmHistoryStore((s) => s.records);
  const acknowledge = useAlarmHistoryStore((s) => s.acknowledge);
  const acknowledgeAll = useAlarmHistoryStore((s) => s.acknowledgeAll);
  const clear = useAlarmHistoryStore((s) => s.clear);
  const loadFromBackend = useAlarmHistoryStore((s) => s.loadFromBackend);
  const deviceCount = useDeviceStore((s) => Object.keys(s.devices).length);

  const [tab, setTab] = useState<AlertSeverity | "all">("all");
  const [ackFilter, setAckFilter] = useState<"all" | "unread" | "acknowledged">(defaultAckFilter);
  const [page, setPage] = useState(1);

  // 切换筛选时回到第 1 页
  useEffect(() => {
    setPage(1);
  }, [ackFilter, tab]);

  // === 真实告警：来自 alarmHistoryStore（deviceStore 推 WS 触发），按时间倒序 ===
  const enterItems = useMemo<(AlertItem & { ts: number; acknowledged: boolean })[]>(() => {
    return records
      .filter((r) => r.type === "enter")
      .map((r) => {
        const meta = sensorMeta[r.sensorType ?? "unknown"] ?? sensorMeta.unknown;
        const devName = r.productName || r.productCode || r.deviceId;
        return {
          id: r.id,
          title: `${meta.label} · ${devName}`,
          description: `设备 ${r.deviceId} 触发${meta.label}`,
          severity: meta.severity,
          timestamp: new Date(r.timestamp).toLocaleTimeString("zh-CN"),
          source: "设备报警",
          ts: r.timestamp,
          acknowledged: r.acknowledged,
        };
      })
      .sort((a, b) => b.ts - a.ts);
  }, [records]);

  // 确认筛选（未确认 / 已确认 / 全部）
  const ackItems = useMemo(() => {
    if (ackFilter === "unread") return enterItems.filter((i) => !i.acknowledged);
    if (ackFilter === "acknowledged") return enterItems.filter((i) => i.acknowledged);
    return enterItems;
  }, [enterItems, ackFilter]);

  // 确认分桶计数（用于确认 Tabs 角标）
  const ackCounts = useMemo(() => {
    let unread = 0;
    let ack = 0;
    for (const it of enterItems) {
      if (it.acknowledged) ack += 1;
      else unread += 1;
    }
    return { all: enterItems.length, unread, acknowledged: ack };
  }, [enterItems]);

  // 各级别计数（用于严重度 Tabs 角标，基于当前确认筛选）
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: ackItems.length, error: 0, warning: 0, info: 0 };
    for (const it of ackItems) c[it.severity] = (c[it.severity] ?? 0) + 1;
    return c;
  }, [ackItems]);

  const filtered = tab === "all" ? ackItems : ackItems.filter((i) => i.severity === tab);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (!visible) return null;

  const errorCount = counts.error ?? 0;
  const warningCount = counts.warning ?? 0;

  // 无报警时的状态提示（非假数据）
  if (enterItems.length === 0) {
    return (
      <Card
        variant="outlined"
        sx={{ height: "100%", display: "flex", flexDirection: "column" }}
        style={style}
        className={className}
      >
        <CardContent sx={{ flex: 1, display: "flex", flexDirection: "column", p: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
            <Typography component="h2" variant="subtitle2">
              {title}
            </Typography>
            <Badge badgeContent={0} color="error">
              <NotificationsRoundedIcon color="action" fontSize="small" />
            </Badge>
          </Box>
          <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Typography variant="body2" color="text.secondary">
              {deviceCount === 0
                ? "等待设备数据 · 运行时 edge-conductor 推送后显示真实报警"
                : `已加载 ${deviceCount} 台设备，当前无触发报警`}
            </Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      variant="outlined"
      sx={{ height: "100%", display: "flex", flexDirection: "column" }}
      style={style}
      className={className}
    >
      <CardContent sx={{ flex: 1, display: "flex", flexDirection: "column", p: 0 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            p: 2,
            pb: 1,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography component="h2" variant="subtitle2">
              {title}
            </Typography>
            <Badge badgeContent={errorCount + warningCount} color="error">
              <NotificationsRoundedIcon color="action" fontSize="small" />
            </Badge>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            {showBulkActions && (
              <>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => acknowledgeAll()}
                  disabled={ackCounts.unread === 0}
                >
                  全部确认
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  onClick={() => clear()}
                  disabled={enterItems.length === 0}
                >
                  清空
                </Button>
              </>
            )}
            <Tooltip title="刷新">
              <IconButton size="small" onClick={() => void loadFromBackend()}>
                <RefreshRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* 确认状态 tabs：全部 / 未确认 / 已确认 */}
        <Tabs
          value={ackFilter}
          onChange={(_, v) => {
            setAckFilter(v);
            setPage(1);
          }}
          variant="fullWidth"
          sx={{ px: 1, minHeight: 34, "& .MuiTab-root": { minHeight: 34, py: 0.25 } }}
        >
          {ACK_TAB_DEFS.map((t) => (
            <Tab
              key={t.key}
              value={t.key}
              label={`${t.label} ${ackCounts[t.key] ?? 0}`}
              sx={{ fontSize: "0.7rem" }}
            />
          ))}
        </Tabs>

        {/* 级别 tabs */}
        <Tabs
          value={tab}
          onChange={(_, v) => {
            setTab(v);
            setPage(1);
          }}
          variant="fullWidth"
          sx={{ px: 1, minHeight: 36, "& .MuiTab-root": { minHeight: 36, py: 0.5 } }}
        >
          {TAB_DEFS.map((t) => (
            <Tab
              key={t.key}
              value={t.key}
              label={`${t.label} ${counts[t.key] ?? 0}`}
              sx={{ fontSize: "0.75rem" }}
            />
          ))}
        </Tabs>
        <Divider />

        {/* 告警列表（默认 10 条/页，按时间倒序） */}
        <Box sx={{ flex: 1, overflow: "auto", minHeight: 0 }}>
          {filtered.length === 0 ? (
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 4 }}>
              <Typography variant="body2" color="text.secondary">
                {ackFilter === "unread"
                  ? "未确认报警已全部处理"
                  : ackFilter === "acknowledged"
                  ? "暂无已确认报警"
                  : "当前筛选下暂无报警"}
              </Typography>
            </Box>
          ) : (
            pageItems.map((alert, index) => (
            <Box key={alert.id}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  px: 2,
                  py: 1.5,
                  opacity: alert.acknowledged ? 0.55 : 1,
                }}
              >
                <Box
                  sx={{
                    color: `${severityConfig[alert.severity].color}.main`,
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {severityConfig[alert.severity].icon}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                      {alert.title}
                    </Typography>
                    <Chip
                      size="small"
                      label={severityConfig[alert.severity].label}
                      color={severityConfig[alert.severity].color}
                      sx={{ height: 20, fontSize: "0.65rem" }}
                    />
                  </Box>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {alert.description} · {alert.timestamp}
                  </Typography>
                </Box>
                {alert.acknowledged ? (
                  <Tooltip title="已确认">
                    <span>
                      <CheckCircleRoundedIcon fontSize="small" color="success" />
                    </span>
                  </Tooltip>
                ) : (
                  <Tooltip title="确认报警">
                    <IconButton size="small" edge="end" onClick={() => acknowledge(alert.id)}>
                      <DeleteOutlineRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
              {index < pageItems.length - 1 && <Divider />}
            </Box>
            ))
          )}
        </Box>

        {/* 分页（按时间索引翻页） */}
        <Divider />
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 2,
            py: 1,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            共 {filtered.length} 条 · 第 {safePage}/{totalPages} 页
          </Typography>
          <Box sx={{ display: "flex", gap: 1 }}>
            <Chip
              size="small"
              label="上一页"
              clickable
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              sx={{ height: 24 }}
            />
            <Chip
              size="small"
              label="下一页"
              clickable
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              sx={{ height: 24 }}
            />
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
