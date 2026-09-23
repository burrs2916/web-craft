import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { METRIC_ICON_NAMES, buildMetricIconSvg } from "../utils/metricIcons";

/**
 * 指标图标选择器：只列出指标类组件（metricIcons.ts）支持的内置图标集，
 * 预览用同一套 Lucide 内联 SVG（buildMetricIconSvg），与发布端渲染一致。
 */
export function MetricIconPicker({
  value,
  onChange,
}: {
  value?: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const isSet = !!value;

  return (
    <Box sx={{ width: "100%" }}>
      <Box
        onClick={() => setOpen((o) => !o)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          pt: 0.5,
          pb: 0.5,
          pl: 0.75,
          pr: 0.5,
          border: "1px solid",
          borderColor: open ? "#0D9488" : "divider",
          borderRadius: 1,
          cursor: "pointer",
          "&:hover": { borderColor: "#0D9488", bgcolor: "action.hover" },
        }}
      >
        <Box
          sx={{
            width: 24,
            height: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "action.hover",
            borderRadius: 0.5,
            flexShrink: 0,
            color: "text.secondary",
          }}
        >
          {isSet ? (
            <span dangerouslySetInnerHTML={{ __html: buildMetricIconSvg(value!, 16, "currentColor") }} />
          ) : (
            <AddIcon sx={{ fontSize: 14 }} />
          )}
        </Box>
        <Typography noWrap sx={{ flex: 1, minWidth: 0, fontSize: 11.5, color: isSet ? "text.primary" : "text.disabled" }}>
          {isSet ? value : "点击选择指标图标"}
        </Typography>
        {isSet && (
          <Tooltip title="清除图标">
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
              sx={{ p: 0.25, color: "text.disabled", "&:hover": { color: "error.main" } }}
            >
              <CloseIcon sx={{ fontSize: 13 }} />
            </IconButton>
          </Tooltip>
        )}
        <ChevronRightIcon
          sx={{ fontSize: 14, color: "text.disabled", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}
        />
      </Box>

      {open && (
        <Box sx={{ mt: 1, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(34px,1fr))", gap: 0.5 }}>
          {METRIC_ICON_NAMES.map((name) => {
            const active = value === name;
            return (
              <Tooltip key={name} title={name} placement="top">
                <Box
                  onClick={() => { onChange(name); setOpen(false); }}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: 34,
                    borderRadius: 0.75,
                    cursor: "pointer",
                    border: "1px solid",
                    borderColor: active ? "#0D9488" : "divider",
                    bgcolor: active ? "rgba(13,148,136,0.12)" : "transparent",
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <span
                    dangerouslySetInnerHTML={{
                      __html: buildMetricIconSvg(name, 18, active ? "#0D9488" : "#9ca3af"),
                    }}
                  />
                </Box>
              </Tooltip>
            );
          })}
        </Box>
      )}
    </Box>
  );
}