import { useEffect } from "react";
import Box from "@mui/material/Box";
import Avatar from "@mui/material/Avatar";
import Typography from "@mui/material/Typography";
import PersonIcon from "@mui/icons-material/Person";
import type { ComponentRendererProps } from "../../types/editor";
import { useWebsiteAuthStore, getWebsiteAuthState } from "../../store/websiteAuthStore";
import type { UserDisplayConfig } from "../../store/websiteAuthStore";

/**
 * 用户信息渲染器 v6
 *
 * v6 修复：
 * - P0-1: customLabel 字段名三层统一（configSchema/renderer/codegen 均读 customLabel）
 * - P0-2: cacheKey 作为 storage key，objectPath 作为对象嵌套路径（回退到 cacheKey）
 * - P1-3: 编辑模式虚线边框 + 组件徽章
 * - P2-2: 多条 avatar 配置只取第一条，控制台告警
 */
export function UserProfileRenderer({ config, mode }: ComponentRendererProps) {
  const user = useWebsiteAuthStore((s) => s.user);
  const isAuthenticated = useWebsiteAuthStore((s) => s.isAuthenticated);
  const setAuthConfig = useWebsiteAuthStore((s) => s.setConfig);
  const tokenKey = (config.tokenKey as string) || "auth_token";
  const tokenStorage = (config.tokenStorage as string) || "localStorage";

  const isEdit = mode === "edit";

  // ─── v5 动态展示配置 ───
  const userDisplayConfig = (config.userDisplayConfig as UserDisplayConfig[]) ?? [];

  // ─── 同步 userDisplayConfig 到 store（clearAllCachedValues 依赖此列表保留缓存键） ───
  // P2-16: 卸载时清空 store 中的 userDisplayConfig，避免残留
  useEffect(() => {
    setAuthConfig({ token: { key: tokenKey, storage: tokenStorage as "localStorage" | "sessionStorage" | "memory" }, userDisplayConfig });
    return () => {
      // 卸载时清空，避免其他组件依赖过期的 displayConfig
      const currentConfig = useWebsiteAuthStore.getState().config;
      if (currentConfig.userDisplayConfig === userDisplayConfig) {
        useWebsiteAuthStore.getState().setConfig({ userDisplayConfig: [] });
      }
    };
  }, [tokenKey, tokenStorage, userDisplayConfig, setAuthConfig]);

  // ─── v1 硬编码配置（向后兼容） ───
  const showAvatar = (config.showAvatar as boolean) ?? true;
  const showName = (config.showName as boolean) ?? true;
  const showRole = (config.showRole as boolean) ?? false;
  const showEmail = (config.showEmail as boolean) ?? false;
  const avatarSize = (config.avatarSize as number) ?? 40;
  const fontSize = (config.fontSize as number) || 14;
  const nameField = (config.nameField as string) || "name";
  const avatarField = (config.avatarField as string) || "avatar";
  const roleField = (config.roleField as string) || "role";
  const emailField = (config.emailField as string) || "email";
  const bgColor = (config.bgColor as string) || "transparent";
  const textColor = (config.textColor as string) || "#333333";
  const avatarBgColor = (config.avatarBgColor as string) || "#1976d2";
  const layout = (config.layout as string) || "horizontal";
  const placeholderName = (config.placeholderName as string) || "未登录";

  const getNested = (obj: unknown, path: string): unknown => {
    if (!obj || !path) return undefined;
    const keys = path.split(".");
    let cur: unknown = obj;
    for (const k of keys) {
      if (cur === null || cur === undefined) return undefined;
      cur = (cur as Record<string, unknown>)[k];
    }
    return cur;
  };

  // v5 动态模式：从缓存读取 userDisplayConfig 指定的字段
  const state = getWebsiteAuthState();
  const useDynamic = userDisplayConfig.length > 0;

  // P2-2: 检测多条 avatar 配置
  if (useDynamic && isEdit) {
    const avatarCount = userDisplayConfig.filter((c) => c.displayType === "avatar").length;
    if (avatarCount > 1) {
      console.warn(`[UserProfile] 检测到 ${avatarCount} 条 displayType=avatar 配置，仅第一条生效`);
    }
  }

  // 动态收集展示数据
  const displayData: { type: string; value: string; label?: string }[] = [];
  let dynamicAvatar: string | undefined;
  let avatarFound = false; // P2-2: 只取第一条 avatar
  let dynamicName: string = placeholderName;

  if (useDynamic && isAuthenticated) {
    userDisplayConfig.forEach((cfg) => {
      // P0-2: cacheKey 作为 storage key 读取缓存值
      let val = state.getCachedValue(cfg.cacheKey);
      // P0-2: objectPath 作为对象嵌套路径（留空回退到 cacheKey）
      if (!val && user) {
        const path = cfg.objectPath || cfg.cacheKey;
        const nested = getNested(user, path);
        if (nested !== undefined && nested !== null) val = String(nested);
      }
      if (!val) return;

      if (cfg.displayType === "avatar") {
        // P2-2: 只取第一条 avatar
        if (!avatarFound) {
          dynamicAvatar = val;
          avatarFound = true;
        }
      } else if (cfg.displayType === "name") {
        dynamicName = val;
      } else if (cfg.displayType !== "none") {
        displayData.push({
          type: cfg.displayType,
          value: val,
          label: cfg.customLabel,
        });
      }
    });
  }

  // v1 硬编码模式数据
  const name = useDynamic
    ? dynamicName
    : (user
        ? (getNested(user, nameField) as string) || (user.username as string) || placeholderName
        : placeholderName);
  const avatar = useDynamic ? dynamicAvatar : (user ? (getNested(user, avatarField) as string) : undefined);
  const role = useDynamic ? "" : (user ? (getNested(user, roleField) as string) : "");
  const email = useDynamic ? "" : (user ? (getNested(user, emailField) as string) : "");

  const isVertical = layout === "vertical";

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: isVertical ? "column" : "row",
        alignItems: "center",
        background: bgColor,
        color: textColor,
        padding: "8px",
        boxSizing: "border-box",
        position: "relative",
        ...(isVertical ? { textAlign: "center" } : {}),
      }}
    >
      {(useDynamic ? true : showAvatar) && (
        <Avatar
          src={avatar}
          sx={{
            width: avatarSize,
            height: avatarSize,
            bgcolor: avatarBgColor,
            fontSize: avatarSize * 0.4,
            flexShrink: 0,
            mr: isVertical ? 0 : 1.5,
            mb: isVertical ? 1 : 0,
          }}
        >
          {avatar ? undefined : isAuthenticated
            ? String(name || dynamicName).charAt(0).toUpperCase()
            : <PersonIcon sx={{ fontSize: avatarSize * 0.5 }} />}
        </Avatar>
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {(useDynamic ? true : showName) && (
          <Typography
            sx={{
              fontSize,
              fontWeight: 600,
              color: textColor,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {String(name)}
          </Typography>
        )}
        {/* v5 动态展示额外字段 */}
        {useDynamic && displayData.map((item, i) => (
          <Typography key={i} sx={{ fontSize: fontSize - 2, color: "#999", mt: 0.25 }}>
            {item.label ? `${item.label}: ` : ""}{item.value}
          </Typography>
        ))}
        {/* v1 硬编码模式 */}
        {!useDynamic && showRole && role && (
          <Typography sx={{ fontSize: fontSize - 2, color: "#999", mt: 0.25 }}>
            {role}
          </Typography>
        )}
        {!useDynamic && showEmail && email && (
          <Typography sx={{ fontSize: fontSize - 2, color: "#999", mt: 0.25 }}>
            {email}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
