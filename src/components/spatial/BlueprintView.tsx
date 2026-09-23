import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import ImageRoundedIcon from "@mui/icons-material/ImageRounded";
import type { BlueprintViewProps } from "./types";

export default function BlueprintView({
  title = "平面蓝图",
  imageUrl: _imageUrl,
  coordinateSystem,
  visible = true,
  style,
  className,
}: BlueprintViewProps) {
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
            <ImageRoundedIcon sx={{ fontSize: 64, color: "primary.main", opacity: 0.5 }} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              蓝图视图
            </Typography>
            <Typography variant="caption" color="text.disabled">
              {coordinateSystem}
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
