import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import TrendUpIcon from "@mui/icons-material/TrendingUp";
import TrendDownIcon from "@mui/icons-material/TrendingDown";
import TrendFlatIcon from "@mui/icons-material/TrendingFlat";
import type { MetricWidgetProps } from "./types";

function SparklineChart({ data, trend }: { data: number[]; trend?: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const width = 100;
  const height = 40;
  const padding = 2;

  const points = data
    .map((value, index) => {
      const x = padding + (index / (data.length - 1)) * (width - padding * 2);
      const y = padding + (1 - (value - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  const areaPoints = [
    `${padding},${height - padding}`,
    ...data.map((value, index) => {
      const x = padding + (index / (data.length - 1)) * (width - padding * 2);
      const y = padding + (1 - (value - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    }),
    `${width - padding},${height - padding}`,
  ].join(" ");

  const gradientId = `gradient-${Math.random().toString(36).slice(2)}`;

  const getColor = () => {
    switch (trend) {
      case "up": return { stroke: "#4caf50", fill: "rgba(76, 175, 80, 0.15)" };
      case "down": return { stroke: "#f44336", fill: "rgba(244, 67, 54, 0.15)" };
      default: return { stroke: "#9e9e9e", fill: "rgba(158, 158, 158, 0.1)" };
    }
  };

  const colors = getColor();

  return (
    <Box sx={{ width: "100%", height: 50, mt: 1 }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: "100%" }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={colors.stroke} stopOpacity="0.3" />
            <stop offset="100%" stopColor={colors.stroke} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon
          fill={`url(#${gradientId})`}
          points={areaPoints}
        />
        <polyline
          fill="none"
          stroke={colors.stroke}
          strokeWidth="1.5"
          points={points}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Box>
  );
}

export default function MetricWidget({
  title,
  value,
  interval,
  trend,
  trendLabel,
  data,
  visible = true,
  style,
  className,
}: MetricWidgetProps) {
  if (!visible) return null;

  const getTrendIcon = () => {
    switch (trend) {
      case "up":
        return <TrendUpIcon sx={{ fontSize: 18 }} />;
      case "down":
        return <TrendDownIcon sx={{ fontSize: 18 }} />;
      default:
        return <TrendFlatIcon sx={{ fontSize: 18 }} />;
    }
  };

  const getTrendConfig = () => {
    switch (trend) {
      case "up":
        return { color: "success", label: "+12.5%", iconColor: "success.main" };
      case "down":
        return { color: "error", label: "-3.2%", iconColor: "error.main" };
      default:
        return { color: "default", label: "0%", iconColor: "text.secondary" };
    }
  };

  const trendConfig = getTrendConfig();
  const trendText = trendLabel ?? trendConfig.label;

  return (
    <Card
      variant="outlined"
      sx={{
        height: "100%",
        position: "relative",
        overflow: "hidden",
        transition: "all 0.2s ease-in-out",
        "&:hover": {
          borderColor: "primary.main",
          boxShadow: (theme) =>
            theme.vars
              ? `0 4px 20px rgba(${theme.vars.palette.primary.mainChannel} / 0.15)`
              : "0 4px 20px rgba(0,0,0,0.08)",
          transform: "translateY(-2px)",
        },
      }}
      style={style}
      className={className}
    >
      <CardContent sx={{ pb: "12px !important" }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Typography component="p" variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
            {title}
          </Typography>
          <Chip
            size="small"
            icon={getTrendIcon()}
            label={trendText}
            color={trendConfig.color as "success" | "error" | "default"}
            variant="outlined"
            sx={{ height: 22, fontSize: "0.65rem", fontWeight: 600 }}
          />
        </Box>

        <Typography component="p" variant="h4" sx={{ fontWeight: 700, mt: 1, mb: 0.5 }}>
          {value}
        </Typography>

        <Typography component="p" variant="caption" color="text.secondary">
          {interval}
        </Typography>

        {data && data.length > 0 && (
          <SparklineChart data={data} trend={trend} />
        )}
      </CardContent>
    </Card>
  );
}
