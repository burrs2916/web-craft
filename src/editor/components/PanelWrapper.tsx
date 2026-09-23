import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { ReactNode } from "react";

interface PanelWrapperProps {
  collapsed: boolean;
  onToggle: () => void;
  width: number;
  position?: "left" | "right";
  children: ReactNode;
  borderSide?: "left" | "right";
}

export function PanelWrapper({
  collapsed,
  onToggle,
  width,
  position = "left",
  children,
  borderSide = "right",
}: PanelWrapperProps) {
  return (
    <Box
      sx={{
        width: collapsed ? 40 : width,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderRight: borderSide === "right" && !collapsed ? 1 : 0,
        borderLeft: borderSide === "left" && !collapsed ? 1 : 0,
        borderColor: "divider",
        transition: "width 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        position: "relative",
        backgroundColor: (theme) =>
          theme.palette.mode === "dark"
            ? "rgba(18, 18, 24, 0.6)"
            : "rgba(250, 250, 252, 0.8)",
      }}
    >
      {collapsed ? (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            pt: 1,
            gap: 0.5,
          }}
        >
          <Tooltip title="展开" placement={position === "left" ? "right" : "left"}>
            <IconButton
              size="small"
              onClick={onToggle}
              sx={{
                width: 28,
                height: 28,
                borderRadius: 1,
                "&:hover": {
                  backgroundColor: (theme) =>
                    theme.palette.mode === "dark"
                      ? "rgba(255,255,255,0.08)"
                      : "rgba(0,0,0,0.06)",
                },
              }}
            >
              {position === "left" ? (
                <ChevronRightIcon sx={{ fontSize: 16 }} />
              ) : (
                <ChevronLeftIcon sx={{ fontSize: 16 }} />
              )}
            </IconButton>
          </Tooltip>
        </Box>
      ) : (
        <>
          {children}
          <Tooltip title="收起" placement={position === "left" ? "right" : "left"}>
            <IconButton
              size="small"
              onClick={onToggle}
              sx={{
                position: "absolute",
                top: 8,
                right: position === "left" ? 4 : "auto",
                left: position === "right" ? 4 : "auto",
                width: 20,
                height: 20,
                borderRadius: 0.5,
                zIndex: 10,
                opacity: 0.45,
                transition: "opacity 0.2s, background-color 0.2s",
                "&:hover": {
                  opacity: 1,
                  backgroundColor: (theme) =>
                    theme.palette.mode === "dark"
                      ? "rgba(255,255,255,0.12)"
                      : "rgba(0,0,0,0.08)",
                },
              }}
            >
              {position === "left" ? (
                <ChevronLeftIcon sx={{ fontSize: 12 }} />
              ) : (
                <ChevronRightIcon sx={{ fontSize: 12 }} />
              )}
            </IconButton>
          </Tooltip>
        </>
      )}
    </Box>
  );
}
