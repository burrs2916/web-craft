import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import Chip from "@mui/material/Chip";
import CloudSyncIcon from "@mui/icons-material/CloudSync";
import WarningIcon from "@mui/icons-material/Warning";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RefreshIcon from "@mui/icons-material/Refresh";
import ErrorIcon from "@mui/icons-material/Error";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import { useAuthStore } from "../../store/authStore";
import type { AuthPreset } from "../../services/tauri";

interface FooterProps {
  syncStatus?: "synced" | "syncing" | "error";
  alertCount?: number;
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "已过期";
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m ${secs.toString().padStart(2, "0")}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs.toString().padStart(2, "0")}s`;
  } else {
    return `${secs}s`;
  }
}

const AUTH_PRESETS: AuthPreset[] = ["keycloak", "auth0", "internal", "custom"];

export default function AppFooter({
  syncStatus = "synced",
  alertCount = 0,
}: FooterProps) {
  const preset = useAuthStore((state) => state.preset);
  const isAuthenticated = useAuthStore((state) => !!state.currentUser);
  const tokenExpiresIn = useAuthStore((state) => state.tokenExpiresIn);
  const isRefreshing = useAuthStore((state) => state.isRefreshing);
  const refreshStatus = useAuthStore((state) => state.refreshStatus);

  const isAuthRequired = AUTH_PRESETS.includes(preset);

  const syncStatusConfig = {
    synced: { label: "已同步", icon: <CheckCircleIcon fontSize="small" /> },
    syncing: { label: "同步中", icon: <CloudSyncIcon fontSize="small" /> },
    error: { label: "同步失败", icon: <WarningIcon fontSize="small" /> },
  };

  const getRefreshStatusDisplay = () => {
    if (isRefreshing) {
      return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 80 }}>
          <RefreshIcon
            fontSize="small"
            sx={{ animation: "spin 1s linear infinite", "@keyframes spin": { "0%": { transform: "rotate(0deg)" }, "100%": { transform: "rotate(360deg)" } } }}
          />
          <Typography variant="caption" color="text.secondary">
            刷新中...
          </Typography>
        </Box>
      );
    }
    
    if (refreshStatus === "success") {
      return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 80 }}>
          <CheckCircleIcon fontSize="small" color="success" />
          <Typography variant="caption" color="success.main">
            刷新成功
          </Typography>
        </Box>
      );
    }
    
    if (refreshStatus === "error") {
      return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 80 }}>
          <ErrorIcon fontSize="small" color="error" />
          <Typography variant="caption" color="error.main">
            刷新失败
          </Typography>
        </Box>
      );
    }
    
    return <Box sx={{ minWidth: 80 }} />;
  };

  const getOnlineStatusDisplay = () => {
    if (!isAuthRequired) return null;

    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <FiberManualRecordIcon
          fontSize="small"
          sx={{
            color: isAuthenticated ? "success.main" : "error.main",
            fontSize: 10,
          }}
        />
        <Typography variant="caption" color="text.secondary">
          {isAuthenticated ? "Online" : "Offline"}
        </Typography>
      </Box>
    );
  };

  return (
    <Box
      component="footer"
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        px: 2,
        py: 1,
        backgroundColor: "background.paper",
        borderTop: 1,
        borderColor: "divider",
        minHeight: 40,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          {syncStatusConfig[syncStatus].icon}
          <Typography variant="caption" color="text.secondary">
            {syncStatusConfig[syncStatus].label}
          </Typography>
        </Box>
        <Divider orientation="vertical" flexItem />
        {alertCount > 0 && (
          <Chip
            size="small"
            color="warning"
            icon={<WarningIcon />}
            label={`${alertCount} 条告警`}
          />
        )}
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        {getOnlineStatusDisplay()}
        {isAuthenticated && tokenExpiresIn !== null && isAuthRequired && (
          <>
            <Divider orientation="vertical" flexItem />
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                {formatCountdown(tokenExpiresIn)}
              </Typography>
            </Box>
            {getRefreshStatusDisplay() && (
              <>
                <Divider orientation="vertical" flexItem />
                {getRefreshStatusDisplay()}
              </>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}
