import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import ArticleRoundedIcon from "@mui/icons-material/ArticleRounded";
import type { LogViewerProps } from "./types";

export default function LogViewer({
  title = "系统日志",
  logLevel = "all",
  visible = true,
  style,
  className,
}: LogViewerProps) {
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
            <ArticleRoundedIcon sx={{ fontSize: 48, color: "primary.main", opacity: 0.5 }} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              日志查看器
            </Typography>
            <Typography variant="caption" color="text.disabled">
              级别: {logLevel}
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
