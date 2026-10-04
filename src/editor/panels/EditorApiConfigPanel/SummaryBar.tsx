import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import { useEditorStore } from "../../../store/editorStore";
import { createDefaultApiConfig } from "../../../types/scene";

/** 面板顶部摘要条：站点模式 / 认证 / 基地址启用状态 */
export function SummaryBar() {
  const apiConfig = useEditorStore((s) => s.apiConfig);
  const config = apiConfig ?? createDefaultApiConfig();
  // 站点运行模式：显式配置优先，缺省 auto（按组件动态判定）
  const siteMode: "static" | "dynamic" | "auto" = config.siteMode ?? "auto";
  const hasBaseUrl = Boolean(config.baseUrl);

  return (
    <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 1, py: 0.5, borderBottom: 1, borderColor: "divider", flexShrink: 0 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Typography variant="caption" sx={{ color: "text.disabled", fontSize: 11 }}>
          数据与认证
        </Typography>
        <Chip
          size="small"
          label={siteMode === "static" ? "静态" : siteMode === "dynamic" ? "动态" : "自动"}
          sx={{ fontSize: 9.5, height: 16, bgcolor: siteMode === "static" ? "action.selected" : siteMode === "dynamic" ? "primary.main" : "action.hover", color: siteMode === "dynamic" ? "#fff" : "text.secondary" }}
        />
        <Chip
          size="small"
          icon={config.authEnabled ? undefined : undefined}
          label={config.authEnabled ? "需认证" : "匿名可访问"}
          sx={{ fontSize: 9.5, height: 16, bgcolor: config.authEnabled ? "warning.main" : "action.hover", color: config.authEnabled ? "#fff" : "text.secondary" }}
        />
      </Box>
      {hasBaseUrl ? (
        <Typography variant="caption" sx={{ fontSize: 10.5, fontWeight: 700, color: "success.main" }}>已启用</Typography>
      ) : (
        <Typography variant="caption" sx={{ fontSize: 10.5, fontWeight: 700, color: "text.disabled" }}>未启用</Typography>
      )}
    </Box>
  );
}