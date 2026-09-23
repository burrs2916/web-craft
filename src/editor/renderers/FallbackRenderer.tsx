import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ComponentRendererProps } from "../../types/editor";

export function FallbackRenderer({
  componentId,
  componentType,
  error,
}: ComponentRendererProps & { componentType?: string; error?: string | null }) {
  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "4px",
        p: 1,
        boxSizing: "border-box",
        overflow: "hidden",
        backgroundColor: "rgba(255,0,0,0.1)",
        border: "1px dashed rgba(255,0,0,0.3)",
        borderRadius: 1,
      }}
    >
      <Typography
        variant="caption"
        sx={{ color: "rgba(255,0,0,0.7)", fontWeight: 600, lineHeight: 1.3, textAlign: "center", maxWidth: "100%" }}
      >
        未知组件{componentType ? `（${componentType}）` : ""}
      </Typography>
      <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.4)", lineHeight: 1.2, textAlign: "center", maxWidth: "100%", wordBreak: "break-all" }}>
        {componentId}
      </Typography>
      {error ? (
        <Typography variant="caption" sx={{ color: "rgba(255,152,0,0.8)", lineHeight: 1.2, textAlign: "center", maxWidth: "100%", wordBreak: "break-all" }}>
          {error}
        </Typography>
      ) : null}
    </Box>
  );
}