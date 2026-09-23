import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import TimelineRoundedIcon from "@mui/icons-material/TimelineRounded";
import type { EventTimelineProps } from "./types";

export default function EventTimeline({
  title = "事件时间线",
  visible = true,
  style,
  className,
}: EventTimelineProps) {
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
            minHeight: 200,
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
            <TimelineRoundedIcon sx={{ fontSize: 48, color: "primary.main", opacity: 0.5 }} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              事件时间线
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
