import { styled, alpha } from "@mui/material/styles";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Toolbar from "@mui/material/Toolbar";
import InputBase from "@mui/material/InputBase";
import Badge from "@mui/material/Badge";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import SearchIcon from "@mui/icons-material/Search";
import NotificationsIcon from "@mui/icons-material/Notifications";
import FullscreenRoundedIcon from "@mui/icons-material/FullscreenRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import CircleIcon from "@mui/icons-material/Circle";
import { useMemo, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import Popover from "@mui/material/Popover";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import ListItemIcon from "@mui/material/ListItemIcon";
import Divider from "@mui/material/Divider";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useAlarmHistoryStore, type AlarmRecord } from "../../store/alarmHistoryStore";
import { useLayoutStore } from "../../store/layoutStore";

const Search = styled("div")(({ theme }) => ({
  position: "relative",
  borderRadius: theme.shape.borderRadius,
  backgroundColor: alpha(theme.palette.common.black, 0.05),
  "&:hover": {
    backgroundColor: alpha(theme.palette.common.black, 0.1),
  },
  marginRight: theme.spacing(2),
  marginLeft: theme.spacing(1),
  width: "100%",
  [theme.breakpoints.up("sm")]: {
    width: "auto",
  },
}));

const SearchIconWrapper = styled("div")(({ theme }) => ({
  padding: theme.spacing(0, 2),
  height: "100%",
  position: "absolute",
  pointerEvents: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
}));

const StyledInputBase = styled(InputBase)(({ theme }) => ({
  color: "inherit",
  "& .MuiInputBase-input": {
    padding: theme.spacing(1, 1, 1, 0),
    paddingLeft: `calc(1em + ${theme.spacing(4)})`,
    transition: theme.transitions.create("width"),
    width: "100%",
    [theme.breakpoints.up("md")]: {
      width: "20ch",
    },
  },
}));

interface AppNavbarProps {
  onSettingsClick?: () => void;
}

// 通知中心：复用报警历史的 sensorType 语义（与告警中心一致），severity → 圆点色
const ALARM_LABELS: Record<
  NonNullable<AlarmRecord["sensorType"]>,
  { label: string; color: string }
> = {
  smoke: { label: "烟雾报警", color: "error.main" },
  touch: { label: "触控/急停", color: "warning.main" },
  infrared: { label: "红外对射", color: "warning.main" },
  dustAlarm: { label: "粉尘报警", color: "error.main" },
  dust: { label: "粉尘浓度", color: "info.main" },
  alarm: { label: "通用报警", color: "warning.main" },
  numeric: { label: "数值越限", color: "info.main" },
  unknown: { label: "未知报警", color: "text.secondary" },
};

export default function AppNavbar(props: AppNavbarProps) {
  const { onSettingsClick } = props;
  const { config: layoutConfig, toggleSidebar } = useLayoutStore();
  const sidebarCollapsed = layoutConfig.sidebarCollapsed;

  const navigate = useNavigate();
  const records = useAlarmHistoryStore((s) => s.records);
  const acknowledge = useAlarmHistoryStore((s) => s.acknowledge);
  const acknowledgeAll = useAlarmHistoryStore((s) => s.acknowledgeAll);

  const [notifAnchor, setNotifAnchor] = useState<HTMLElement | null>(null);
  const notifOpen = Boolean(notifAnchor);

  // 通知 = 未确认的 enter 报警（与历史事件/告警中心同源）
  const unread = useMemo(
    () => records.filter((r) => r.type === "enter" && !r.acknowledged),
    [records],
  );
  const unreadCount = unread.length;
  const unreadPreview = unread.slice(0, 8);

  const openNotif = (e: MouseEvent<HTMLElement>) => setNotifAnchor(e.currentTarget);
  const closeNotif = () => setNotifAnchor(null);
  const handleAckOne = (id: string) => {
    acknowledge(id);
    closeNotif();
    navigate("/history");
  };
  const handleViewAll = () => {
    closeNotif();
    navigate("/history");
  };

  const deviceNameOf = (r: AlarmRecord) =>
    r.productName || r.productCode || r.deviceId;
  const formatNotifTime = (t: number) => {
    const d = new Date(t);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const handleFullscreen = async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const currentWindow = getCurrentWindow();
      const fullscreen = await currentWindow.isFullscreen();
      await currentWindow.setFullscreen(!fullscreen);
    } catch {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen();
      }
    }
  };

  return (
    <AppBar
      position="sticky"
      sx={{
        flexShrink: 0,
        backgroundColor: "background.paper",
        color: "text.primary",
        boxShadow: "none",
        borderBottom: "1px solid",
        borderColor: "divider",
      }}
    >
      <Toolbar>
        <Tooltip title={sidebarCollapsed ? "展开菜单" : "收起菜单"}>
          <IconButton
            edge="start"
            color="inherit"
            onClick={toggleSidebar}
            sx={{ mr: 1 }}
          >
            <MenuRoundedIcon />
          </IconButton>
        </Tooltip>

        <Search>
          <SearchIconWrapper>
            <SearchIcon />
          </SearchIconWrapper>
          <StyledInputBase
            placeholder="搜索..."
            inputProps={{ "aria-label": "search" }}
          />
        </Search>

        <Box sx={{ flexGrow: 1 }} />

        <Box sx={{ display: { xs: "none", md: "flex" }, gap: 1 }}>
          <Tooltip title="全屏">
            <IconButton color="inherit" onClick={handleFullscreen}>
              <FullscreenRoundedIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title={unreadCount > 0 ? `通知（${unreadCount} 条未读）` : "通知"}>
            <IconButton
              size="large"
              aria-label="show notifications"
              color="inherit"
              onClick={openNotif}
            >
              <Badge badgeContent={unreadCount} color="error">
                <NotificationsIcon />
              </Badge>
            </IconButton>
          </Tooltip>
          <Tooltip title="设置">
            <IconButton color="inherit" onClick={onSettingsClick}>
              <SettingsRoundedIcon />
            </IconButton>
          </Tooltip>
        </Box>

        <Popover
          open={notifOpen}
          anchorEl={notifAnchor}
          onClose={closeNotif}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          slotProps={{ paper: { sx: { width: 340, maxHeight: 460 } } }}
        >
          <Box sx={{ px: 2, py: 1.5, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              通知
              {unreadCount > 0 && (
                <Typography component="span" variant="caption" sx={{ ml: 0.5, color: "error.main" }}>
                  {unreadCount} 条未读
                </Typography>
              )}
            </Typography>
            <Button
              size="small"
              startIcon={<DoneAllIcon />}
              disabled={unreadCount === 0}
              onClick={() => {
                acknowledgeAll();
                closeNotif();
              }}
            >
              全部已读
            </Button>
          </Box>
          <Divider />
          {unreadPreview.length === 0 ? (
            <Typography variant="body2" sx={{ px: 2, py: 4, textAlign: "center", color: "text.secondary" }}>
              暂无未读通知
            </Typography>
          ) : (
            <List sx={{ py: 0 }}>
              {unreadPreview.map((r) => {
                const meta = ALARM_LABELS[r.sensorType ?? "unknown"];
                return (
                  <ListItemButton
                    key={r.id}
                    onClick={() => handleAckOne(r.id)}
                    sx={{ py: 1 }}
                  >
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <CircleIcon sx={{ fontSize: 10, color: meta.color }} />
                    </ListItemIcon>
                    <ListItemText
                      primary={deviceNameOf(r)}
                      slotProps={{
                        primary: { noWrap: true, variant: "body2" },
                        secondary: { variant: "caption" },
                      }}
                      secondary={`${meta.label} · ${formatNotifTime(r.timestamp)}`}
                    />
                  </ListItemButton>
                );
              })}
            </List>
          )}
          <Divider />
          <Box sx={{ p: 1 }}>
            <Button fullWidth size="small" onClick={handleViewAll}>
              查看全部
            </Button>
          </Box>
        </Popover>
      </Toolbar>
    </AppBar>
  );
}
