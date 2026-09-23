import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { useApiDataFetch } from "../hooks/useApiDataFetch";
import { useEditorStore } from "../../store/editorStore";
import { resolveEffectiveDataConfig } from "../../shared/resolveDataConfig";
import { resolveMediaStyle } from "../data/mediaStyle";
import { readAuthEnabled } from "../data/authMode";

/**
 * 图片（image）编辑区渲染器。
 *
 * 与发布端 `codegen/components/media.ts` 的 `imageCodegen` **结构同构**：
 * 同一份样式口径（`resolveMediaStyle`）→ 容器（圆角/边框/阴影/底色/裁剪）
 * + 内容层（object-fit / object-position / 悬浮放大）+ 空态占位 + 题注 + 链接包装。
 *
 * 相对旧实现修掉的三处：
 * 1. **圆角口径错位**：旧实现走 MUI sx 的「数字 × 主题 shape.borderRadius(=10)」，
 *    发布端却按字面 px 输出 —— 同一份配置两端圆角相差 10 倍。现两端只读 `radiusCss`。
 * 2. **空态硬编码暗色**：`rgba(255,255,255,0.05)` + 白字，浅色主题下就是一块看不见的灰。
 *    现由面板配置派生（底色/文字色/提示文案）。
 * 3. **无边框/阴影/透明度/object-position/悬浮放大/题注/懒加载**：属性栏无从配置。
 *
 * 动态资源：`dataMode=api` 时走统一 `useApiDataFetch`（与发布端同一取数骨架），
 * 按 `apiSrcField` 从响应取 URL；`authEnabled` 三态即「认证 / 非认证」接入切换点。
 */
export function ImageRenderer({ config }: ComponentRendererProps) {
  const s = resolveMediaStyle(config, { emptyText: "未设置图片" });

  const alt = String(config.alt ?? "").trim();
  const link = String(config.link ?? "").trim();
  const target = String(config.linkTarget ?? "_self") === "_blank" ? "_blank" : "_self";
  const lazy = config.lazyLoading === true;

  // ── 数据源（与发布端同源） ──
  const dataSources = useEditorStore((st) => st.dataSources);
  const dsId = String(config.dataSourceId ?? "");
  const boundSource = dsId ? dataSources.find((d) => d.id === dsId) : undefined;
  const effApi = resolveEffectiveDataConfig(config, boundSource);
  const dataMode = String(effApi.dataMode ?? "static");
  const isApi = dataMode === "api" && (dsId || String(effApi.apiUrl ?? "") || String(effApi.apiPath ?? ""));
  const authEnabledCfg = readAuthEnabled(config.authEnabled);

  const { data: apiRaw } = useApiDataFetch({
    dataMode: isApi ? "api" : "static",
    apiUrl: String(effApi.apiUrl ?? ""),
    apiPath: String(effApi.apiPath ?? ""),
    apiMethod: String(effApi.apiMethod ?? "GET") as "GET" | "POST",
    apiBody: effApi.apiBody,
    apiHeaders: effApi.apiHeaders,
    apiInterval: Number(effApi.apiInterval ?? 0) || 0,
    apiDataPath: String(effApi.apiDataPath ?? ""),
    authEnabled: authEnabledCfg,
    dataSourceId: dsId,
  });

  const apiSrcField = String(effApi.apiSrcField ?? config.apiSrcField ?? "");
  const apiSrc = useMemo(() => {
    if (!isApi || apiRaw == null) return "";
    if (typeof apiRaw === "string") return apiRaw;
    if (typeof apiRaw === "object") {
      const keys = apiSrcField ? [apiSrcField] : ["url", "src", "image", "imageUrl", "path"];
      for (const k of keys) {
        const v = k.split(".").reduce<unknown>((acc, key) => (acc == null || typeof acc !== "object" ? undefined : (acc as Record<string, unknown>)[key]), apiRaw);
        if (v) return String(v);
      }
    }
    return "";
  }, [isApi, apiRaw, apiSrcField]);

  const staticSrc = String(config.source ?? "").trim();
  const src = isApi ? apiSrc : staticSrc;
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);

  // 与发布端一致：无资源（含接口数据未到达）或加载失败时显示空态
  const showEmpty = !src || broken;

  const content = (
    <>
      {src && !broken && (
        <Box
          component="img"
          className="mv-img"
          src={src}
          alt={alt}
          loading={lazy ? "lazy" : undefined}
          onError={() => setBroken(true)}
          sx={{
            width: "100%",
            height: "100%",
            display: "block",
            objectFit: s.fit,
            objectPosition: s.objectPosition,
            transformOrigin: "center center",
            transition: s.transitionCss,
          }}
        />
      )}
      {showEmpty && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: s.emptyBg,
            color: s.emptyColor,
            fontSize: "12px",
            userSelect: "none",
          }}
        >
          {s.emptyText}
        </Box>
      )}
      {s.caption && (
        <Box
          sx={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding: "6px 10px",
            fontSize: `${s.captionFontSize}px`,
            lineHeight: 1.4,
            color: s.captionColor,
            background: s.captionBg,
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          {s.caption}
        </Box>
      )}
    </>
  );

  return (
    <Box
      sx={{
        position: "relative",
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
        borderRadius: s.radiusCss,
        backgroundColor: s.bgColor,
        ...(s.borderCss ? { border: s.borderCss } : {}),
        ...(s.boxShadow ? { boxShadow: s.boxShadow } : {}),
        opacity: s.opacity,
        // 悬浮放大挂在容器上（与发布端 `.uid:hover .uid-img` 同构）：
        // 挂在图片自身上只在指针压到图片时触发，两端手感会不一致
        ...(s.hoverScale > 1 ? { "&:hover .mv-img": { transform: `scale(${s.hoverScale})` } } : {}),
      }}
    >
      {link ? (
        <Box
          component="a"
          href={link}
          target={target}
          rel={target === "_blank" ? "noopener noreferrer" : undefined}
          sx={{ display: "block", width: "100%", height: "100%", textDecoration: "none" }}
        >
          {content}
        </Box>
      ) : (
        content
      )}
    </Box>
  );
}
