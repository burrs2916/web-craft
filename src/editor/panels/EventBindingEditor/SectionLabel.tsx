import type { ReactNode } from "react";
import Typography from "@mui/material/Typography";

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Typography
      variant="overline"
      sx={{
        display: "block",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.8,
        color: "text.secondary",
        mb: 0.75,
        mt: 0.5,
      }}
    >
      {children}
    </Typography>
  );
}