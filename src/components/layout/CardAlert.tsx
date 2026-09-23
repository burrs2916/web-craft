import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";

export default function CardAlert() {
  return (
    <Card variant="outlined" sx={{ m: 1.5, flexShrink: 0 }}>
      <CardContent>
        <AutoAwesomeRoundedIcon fontSize="small" />
        <Typography gutterBottom sx={{ fontWeight: 600 }}>
          系统更新提示
        </Typography>
        <Typography variant="body2" sx={{ mb: 2, color: "text.secondary" }}>
          新版本 v2.1.0 已发布，包含性能优化和新功能。
        </Typography>
        <Button variant="contained" size="small" fullWidth>
          立即更新
        </Button>
      </CardContent>
    </Card>
  );
}
