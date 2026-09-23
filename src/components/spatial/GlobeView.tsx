import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import PublicRoundedIcon from "@mui/icons-material/PublicRounded";
import type { GlobeViewProps } from "./types";

export default function GlobeView({
  title = "三维地球",
  coordinateSystem,
  terrainEnabled = false,
  atmosphereEnabled = true,
  visible = true,
  style,
  className,
}: GlobeViewProps) {
  if (!visible) return null;

  return (
    <Card
      variant="outlined"
      sx={{ height: "100%", display: "flex", flexDirection: "column" }}
      style={style}
      className={className}
    >
      <CardContent sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <Typography component="h2" variant="subtitle2" sx={{ mb: 2 }}>
          {title}
        </Typography>
        <Box
          sx={{
            flex: 1,
            minHeight: 300,
            backgroundColor: "action.hover",
            borderRadius: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px dashed",
            borderColor: "divider",
          }}
        >
          <Box sx={{ textAlign: "center" }}>
            <PublicRoundedIcon sx={{ fontSize: 64, color: "primary.main", opacity: 0.5 }} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              三维地球视图
            </Typography>
            <Typography variant="caption" color="text.disabled">
              {coordinateSystem} · 地形{terrainEnabled ? "开" : "关"} · 大气{atmosphereEnabled ? "开" : "关"}
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
