import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import PersonIcon from "@mui/icons-material/Person";
import type { ComponentRendererProps } from "../../types/editor";
import { useWebsiteAuthStore } from "../../store/websiteAuthStore";
import { useApiDataFetch } from "../hooks/useApiDataFetch";
import { readAuthEnabled } from "../data/authMode";

/**
 * 嵌套路径取值（与 getNested 语义一致）
 * 如 "profile.avatar" → user.profile.avatar
 */
function getNested(obj: unknown, path: string): unknown {
  if (!obj || !path) return undefined;
  const keys = path.split(".");
  let cur: unknown = obj;
  for (const k of keys) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/**
 * 头像渲染器 v1.2 — 无侵入式数据源
 *
 * sourceMode:
 *   direct → 直接渲染远程图片链接（src），无图时 name 首字母 → PersonIcon
 *   api    → 通过 useApiDataFetch 动态请求 API：
 *              - 填 API 地址 + 可选认证开关，自动携带认证 Token
 *              - 按 apiDataPath 定位响应对象
 *              - 勾选 avatarField（图片字段）/ nameField（名称字段）映射渲染
 *
 * 兼容：
 *   - v1.1 bindMode="user"（读登录缓存）→ 映射为 api 模式，apiUrl 为空时回退读缓存
 *   - v1.0 text 字段 → name 的回退；showBadge → badgeMode 映射
 */
export function AvatarRenderer({ config }: ComponentRendererProps) {
  const user = useWebsiteAuthStore((s) => s.user);
  const isAuthenticated = useWebsiteAuthStore((s) => s.isAuthenticated);

  // ── 数据来源解析（含旧配置兼容） ──
  const sourceMode =
    (config.sourceMode as string) ?? (config.bindMode === "user" ? "api" : "direct");
  const isApi = sourceMode === "api";
  const apiUrl = String(config.apiUrl ?? "");
  const hasApiUrl = !!apiUrl;
  const apiMethod = (String(config.apiMethod ?? "GET") || "GET") as "GET" | "POST";
  const apiDataPath = String(config.apiDataPath ?? "");
  const authEnabled = readAuthEnabled(config.authEnabled);
  const avatarField = String(config.avatarField ?? "avatar");
  const nameField = String(config.nameField ?? "name");

  // ── API 动态数据（仅 api 模式且已配置地址时请求） ──
  const { data: apiData } = useApiDataFetch<unknown>({
    dataMode: isApi && hasApiUrl ? "api" : "static",
    staticData: null,
    apiUrl,
    apiMethod,
    apiDataPath,
    authEnabled: isApi && hasApiUrl ? authEnabled : null,
  });

  // ── 解析最终图片 / 名称 ──
  let resolvedSrc = "";
  let resolvedName = String(config.name ?? config.text ?? "");
  if (!isApi) {
    resolvedSrc = String(config.src ?? "");
  } else if (hasApiUrl) {
    const img = getNested(apiData, avatarField);
    if (img) resolvedSrc = String(img);
    const nm = getNested(apiData, nameField);
    if (nm) resolvedName = String(nm);
  } else if (user) {
    // 旧 v1.1 user 模式：读登录缓存
    const img = getNested(user, avatarField);
    if (img) resolvedSrc = String(img);
    const nm =
      getNested(user, nameField) ??
      (user.username as string | undefined) ??
      (user.name as string | undefined);
    if (nm) resolvedName = String(nm);
  }

  // ── 图片错误状态：随 resolvedSrc 变化重置（无状态残留） ──
  const [imgError, setImgError] = useState(false);
  useEffect(() => {
    setImgError(false);
  }, [resolvedSrc]);

  const showImage = !!resolvedSrc && !imgError;
  const initials = resolvedName ? String(resolvedName).charAt(0).toUpperCase() : "";
  // fallback 链末级：无名称时显示 PersonIcon 占位
  const showPlaceholderIcon = !initials;

  // ── 静态样式配置 ──
  const alt = (config.alt as string) || "";
  const shape = (config.shape as string) ?? "circle";
  const bgColor = (config.bgColor as string) || "rgba(255,152,0,0.15)";
  const textColor = (config.textColor as string) || "#FF9800";
  const fontSize = (config.fontSize as number) ?? 18;
  const fontWeight = (config.fontWeight as string) ?? "600";
  const borderEnabled = (config.borderEnabled as boolean) ?? false;
  const borderColor = (config.borderColor as string) || "rgba(255,255,255,0.2)";
  const borderWidth = (config.borderWidth as number) ?? 2;
  const objectFit = (config.objectFit as string) ?? "cover";
  const sizeMode = (config.sizeMode as string) ?? "fill";
  const fixedSize = (config.size as number) ?? 48;

  // 徽章：badgeMode none/static/auth；旧 showBadge 兼容映射为 static
  const badgeMode = (config.badgeMode as string) ?? (config.showBadge ? "static" : "none");
  const badgeColor = (config.badgeColor as string) || "#4CAF50";
  const badgeSize = (config.badgeSize as number) ?? 12;
  const badgePosition = (config.badgePosition as string) ?? "bottom-right";

  // ── 尺寸：fill 跟随组件框，fixed 固定像素 ──
  const avatarSize = sizeMode === "fixed" ? fixedSize : "100%";
  const borderRadius =
    shape === "circle" ? "50%" : shape === "rounded" ? "22%" : "12%";

  // ── 徽章 ──
  const badgeVisible = badgeMode !== "none";
  const badgeEffectiveColor =
    badgeMode === "auth" ? (isAuthenticated ? badgeColor : "rgba(255,255,255,0.35)") : badgeColor;
  const badgePosStyle: Record<string, Record<string, string | number>> = {
    "top-right": { top: 0, right: 0, transform: "translate(30%, -30%)" },
    "top-left": { top: 0, left: 0, transform: "translate(-30%, -30%)" },
    "bottom-right": { bottom: 0, right: 0, transform: "translate(30%, 30%)" },
    "bottom-left": { bottom: 0, left: 0, transform: "translate(-30%, 30%)" },
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        position: "relative",
      }}
    >
      <Box
        sx={{
          width: avatarSize,
          height: avatarSize,
          maxWidth: "100%",
          maxHeight: "100%",
          minWidth: 0,
          minHeight: 0,
          boxSizing: "border-box",
          borderRadius,
          backgroundColor: bgColor,
          color: textColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: `${fontSize}px`,
          fontWeight: fontWeight,
          lineHeight: 1,
          overflow: "hidden",
          flexShrink: 0,
          border: borderEnabled ? `${borderWidth}px solid ${borderColor}` : "none",
        }}
      >
        {showImage ? (
          <Box
            component="img"
            src={resolvedSrc}
            alt={alt}
            onError={() => setImgError(true)}
            sx={{
              width: "100%",
              height: "100%",
              objectFit,
              display: "block",
            }}
          />
        ) : showPlaceholderIcon ? (
          <PersonIcon sx={{ fontSize: "inherit", display: "block" }} />
        ) : (
          <>{initials}</>
        )}
      </Box>

      {badgeVisible && (
        <Box
          sx={{
            position: "absolute",
            width: badgeSize,
            height: badgeSize,
            borderRadius: "50%",
            backgroundColor: badgeEffectiveColor,
            border: "2px solid rgba(0,0,0,0.3)",
            boxSizing: "border-box",
            ...badgePosStyle[badgePosition],
          }}
        />
      )}
    </Box>
  );
}