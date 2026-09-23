import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import ArticleRoundedIcon from "@mui/icons-material/ArticleRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import {
  querySystemHistory,
  queryEventHistory,
  recentTimeRange,
  formatTimestamp,
} from "../../services/historyApi";

interface FeedItem {
  id: string | number | undefined;
  timestamp: string | number;
  level: string;
  type: string;
  summary: string;
  source: "system" | "event";
}

function levelColor(level: string): "error" | "warning" | "info" | "default" {
  if (level === "error") return "error";
  if (level === "warn" || level === "warning") return "warning";
  if (level === "info") return "info";
  return "default";
}

function levelLabel(level: string): string {
  if (level === "error") return "错误";
  if (level === "warn" || level === "warning") return "警告";
  if (level === "info") return "信息";
  return level || "默认";
}

export default function RecentLogsCard({ limit = 6 }: { limit?: number }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    setLoading(true);
    setError(null);

    const range = recentTimeRange(24);

    Promise.all([
      querySystemHistory({ from: range.from, to: range.to, limit: 50, offset: 0 }),
      queryEventHistory({ from: range.from, to: range.to, limit: 50, offset: 0 }),
    ])
      .then(([sys, ev]) => {
        if (aborted) return;
        const merged: FeedItem[] = [
          ...sys.data.map((r) => ({
            id: r.id,
            timestamp: r.timestamp,
            level: r.level ?? "info",
            type: r.event_type ?? "system",
            summary: r.message ?? "",
            source: "system" as const,
          })),
          ...ev.data.map((r) => ({
            id: r.id,
            timestamp: r.timestamp,
            level: r.level ?? "info",
            type: r.event_type ?? "event",
            summary: `${r.device_id ?? "-"} ${r.reason ?? ""}`.trim(),
            source: "event" as const,
          })),
        ];
        merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setItems(merged.slice(0, limit));
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (aborted) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });

    return () => {
      aborted = true;
    };
  }, [limit]);

  return (
    <Card variant="outlined" sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <CardContent sx={{ p: 2, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 0.5 }}
          >
            <ArticleRoundedIcon fontSize="small" />
            最近日志
          </Typography>
          <Box
            component="button"
            onClick={() => navigate("/logs")}
            sx={{
              border: "none",
              background: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              color: "primary.main",
              fontSize: "0.75rem",
              p: 0,
            }}
          >
            全部
            <ChevronRightRoundedIcon fontSize="small" />
          </Box>
        </Box>

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : error ? (
          <Typography variant="caption" color="text.secondary" sx={{ py: 2, display: "block" }}>
            {error.includes("未配置数据源")
              ? "未配置激活的 HTTP 数据源，无法加载日志"
              : `加载失败：${error}`}
          </Typography>
        ) : items.length === 0 ? (
          <Typography variant="caption" color="text.secondary" sx={{ py: 2, display: "block" }}>
            近 24 小时暂无系统/设备事件
          </Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25, overflow: "auto" }}>
            {items.map((it, i) => (
              <Box
                key={`${it.source}-${it.id ?? i}`}
                sx={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 0.75,
                  py: 0.5,
                  borderBottom: i < items.length - 1 ? "0.5px solid" : "none",
                  borderColor: "divider",
                }}
              >
                <Chip
                  size="small"
                  label={levelLabel(it.level)}
                  color={levelColor(it.level)}
                  sx={{ height: 18, fontSize: "0.6rem", mt: 0.25, flexShrink: 0 }}
                />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.2 }}>
                    {formatTimestamp(it.timestamp as string | number | undefined)} · {it.type}
                  </Typography>
                  <Typography variant="body2" noWrap title={it.summary}>
                    {it.summary || it.type}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
