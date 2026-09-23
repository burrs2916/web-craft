import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import type { DashboardCanvasProps } from "./types";

export default function DashboardCanvas({
  title,
  widgets = [],
  visible = true,
  style,
  className,
}: DashboardCanvasProps) {
  if (!visible) return null;

  return (
    <Paper
      sx={{ height: "100%", display: "flex", flexDirection: "column" }}
      style={style}
      className={className}
    >
      <Box sx={{ p: 2, display: "flex", alignItems: "center", gap: 1 }}>
        <DashboardRoundedIcon />
        <Typography variant="h6">
          {title || "仪表盘画布"}
        </Typography>
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: 400,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "background.default",
          m: 2,
          borderRadius: 1,
          border: "1px dashed",
          borderColor: "divider",
        }}
      >
        <Box sx={{ textAlign: "center", color: "text.secondary" }}>
          <DashboardRoundedIcon sx={{ fontSize: 64, mb: 2, opacity: 0.3 }} />
          <Typography variant="h6">仪表盘画布</Typography>
          <Typography variant="body2">
            {widgets.length} 个微件
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
}
