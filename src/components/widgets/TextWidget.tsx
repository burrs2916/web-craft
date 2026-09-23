import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import type { TextWidgetProps } from "./types";

export default function TextWidget({
  content,
  title,
  variant = "body1",
  color,
  visible = true,
  style,
  className,
}: TextWidgetProps) {
  if (!visible) return null;

  return (
    <Box style={style} className={className}>
      {title && (
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
          {title}
        </Typography>
      )}
      <Typography variant={variant} color={color}>
        {content}
      </Typography>
    </Box>
  );
}
