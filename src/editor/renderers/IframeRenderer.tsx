import { useMemo } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { useApiDataFetch } from "../hooks/useApiDataFetch";
import { useEditorStore } from "../../store/editorStore";
import { resolveEffectiveDataConfig } from "../../shared/resolveDataConfig";
import { resolveMediaStyle } from "../data/mediaStyle";
import { readAuthEnabled } from "../data/authMode";

/**
 * 网页嵌入（iframe）编辑区渲染器。
 *
 * 与发布端 `codegen/components/media.ts` 的 `iframeCodegen` **结构同构**：
 * 同一份样式口径（`resolveMediaStyle`）→ 容器（圆角/边框/阴影/底色/裁剪）
 * + 内容层（iframe 铺满容器）+ 空态占位 + 题注。这是图片/视频/音频之外
 * 媒体组的第四个成员，`pointerEvents` 编辑态裁剪沿用视频的约定。
 *
 * 动态资源：`dataMode=api` 时走统一 `useApiDataFetch`（与发布端同一取数骨架），
 * 按 `apiSrcField` 从响应取嵌入地址；`authEnabled` 三态即「认证 / 非认证」接入切换点。
 *
 * 与图片/视频刻意一致的细节：
 * 1. **编辑态指针裁剪**：iframe 会拦截画布上的点击与拖动（内部是独立文档），
 *    编辑态必须 `pointerEvents: none`，否则组件无法选中/移动；预览态才放开交互。
 * 2. **空态只在「无地址」时显示**：iframe 跨域加载失败没有可靠的事件可监听
 *    （onerror 仅在同源/部分场景触发），发布端同样只按「有无地址」切空态——
 *    两端行为一致，加载失败由浏览器自身渲染错误页。
 */
export function IframeRenderer({ config, mode }: ComponentRendererProps) {
  const s = resolveMediaStyle(config, { emptyText: "未设置嵌入地址" });
  const isEdit = mode !== "preview";

  // ── 数据源（与发布端同源：全局数据源覆盖 → 统一取数骨架） ──
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
      const keys = apiSrcField ? [apiSrcField] : ["url", "src", "iframe", "embed", "path"];
      for (const k of keys) {
        const v = k.split(".").reduce<unknown>(
          (acc, key) => (acc == null || typeof acc !== "object" ? undefined : (acc as Record<string, unknown>)[key]),
          apiRaw,
        );
        if (v) return String(v);
      }
    }
    return "";
  }, [isApi, apiRaw, apiSrcField]);

  const staticSrc = String(config.src ?? "").trim();
  const src = isApi ? apiSrc : staticSrc;

  // 嵌入属性：sandbox / allow 只在确实配置时输出（空 sandbox 属性 = 全限制沙箱，不能误带）
  const sandbox = String(config.sandbox ?? "").trim();
  const allow = String(config.allow ?? "").trim();
  const allowFullscreen = config.allowFullscreen === true;
  const loading = String(config.loading ?? "lazy") === "eager" ? "eager" : "lazy";
  const referrerPolicy: "no-referrer" | "no-referrer-when-downgrade" | "origin" =
    String(config.referrerPolicy ?? "") === "no-referrer"
      ? "no-referrer"
      : String(config.referrerPolicy ?? "") === "origin"
        ? "origin"
        : "no-referrer-when-downgrade";
  const title = String(config.title ?? "").trim() || "嵌入式内容";

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
        // 悬浮放大挂在容器上（与发布端 `.uid:hover .uid-img` 同构）
        ...(s.hoverScale > 1 ? { "&:hover .mv-img": { transform: `scale(${s.hoverScale})` } } : {}),
      }}
    >
      {src ? (
        <Box
          component="iframe"
          className="mv-img"
          src={src}
          title={title}
          allowFullScreen={allowFullscreen}
          loading={loading}
          referrerPolicy={referrerPolicy}
          sandbox={sandbox || undefined}
          allow={allow || undefined}
          // 编辑态禁用 iframe 内部交互：画布上点击/拖动应落到组件选中，而不是被嵌入页吞掉
          sx={{
            width: "100%",
            height: "100%",
            display: "block",
            border: 0,
            transformOrigin: "center center",
            transition: s.transitionCss,
            ...(isEdit ? { pointerEvents: "none" } : {}),
          }}
        />
      ) : (
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
            border: "2px dashed rgba(0,0,0,0.12)",
            borderRadius: s.radiusCss,
            backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(0,0,0,0.02) 8px, rgba(0,0,0,0.02) 16px)",
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
    </Box>
  );
}