import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { resolveMediaStyle } from "../data/mediaStyle";
import { useEditorStore } from "../../store/editorStore";
import { useApiDataFetch } from "../hooks/useApiDataFetch";
import { resolveEffectiveDataConfig } from "../../shared/resolveDataConfig";
import { readAuthEnabled } from "../data/authMode";

/**
 * 音频（audio）编辑区渲染器 —— 媒体组件组扩展新增。
 *
 * 与发布端 `codegen/components/media.ts` 的 `audioCodegen` **结构同构**：
 * 封面/图标 + 标题副标题 + 原生音频控件 + 未设置音源时的空态占位。
 *
 * 为何不自绘播放器：自绘需要接管进度、音量、缓冲、键盘与无障碍语义，
 * 收益低而风险高；原生 `<audio controls>` 在两类页面上表现稳定且自带无障碍。
 *
 * 样式一律走 `resolveMediaStyle`（媒体族唯一口径，图片/视频共用）：
 * 圆角 = 面板值 × 主题 shape.borderRadius(=10)，边框 / 阴影 / 透明度 / 空态配色
 * 与图片视频逐项同口径 —— 此前本组件自带一份字面量（`radius * 10`、默认色值各写一遍），
 * 属"同批字面量写两处必然漂移"的隐患。
 *
 * 动态资源（与 ImageRenderer / VideoRenderer 同构）：
 * `dataMode=api` 或绑定全局数据源时走统一 `useApiDataFetch`，按 `apiSrcField` 取音频地址、
 * `apiCoverField` 取封面地址；`authEnabled` 三态决定是否注入认证 Token
 * （null = 跟随站点全局认证态），即"认证 / 非认证"两种接入方式的切换点。
 */
export function AudioRenderer({ config, mode }: ComponentRendererProps) {
  const isEdit = mode !== "preview";
  const s = resolveMediaStyle(config, {
    radius: 4,
    bgColor: "rgba(255,255,255,0.06)",
    emptyText: "未设置音频",
  });

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
  const apiCoverField = String(effApi.apiCoverField ?? config.apiCoverField ?? "");
  const pickField = (obj: unknown, field: string, keys: string[]): string => {
    if (obj == null || typeof obj !== "object") return "";
    const read = (path: string) =>
      path.split(".").reduce<unknown>(
        (acc, k) => (acc == null || typeof acc !== "object" ? undefined : (acc as Record<string, unknown>)[k]),
        obj,
      );
    if (field) {
      const v = read(field);
      if (v) return String(v);
    }
    for (const k of keys) {
      const v = read(k);
      if (v) return String(v);
    }
    return "";
  };

  const { apiSrc, apiCover } = useMemo(() => {
    if (!isApi || apiRaw == null) return { apiSrc: "", apiCover: "" };
    if (typeof apiRaw === "string") return { apiSrc: apiRaw, apiCover: "" };
    return {
      apiSrc: pickField(apiRaw, apiSrcField, ["url", "src", "audio", "audioUrl", "path"]),
      apiCover: pickField(apiRaw, apiCoverField, ["cover", "poster", "image", "thumbnail"]),
    };
  }, [isApi, apiRaw, apiSrcField, apiCoverField]);

  const src = isApi ? apiSrc : String(config.source ?? "").trim();
  const cover = (isApi ? apiCover : "") || String(config.cover ?? "").trim();
  const title = String(config.title ?? "").trim();
  const subtitle = String(config.subtitle ?? "").trim();
  const icon = String(config.icon ?? "music_note");
  const showIcon = config.showIcon !== false;
  const textColor = String(config.textColor ?? "#E5E7EB");
  const subtitleColor = String(config.subtitleColor ?? "rgba(229,231,235,0.6)");
  const accentColor = String(config.accentColor ?? "#1976d2");
  const gap = Number(config.gap ?? 12) || 12;
  const padding = Number(config.padding ?? 12) || 12;
  const alignMap: Record<string, string> = { left: "flex-start", center: "center", right: "flex-end" };
  const align = alignMap[String(config.align ?? "left")] ?? "flex-start";
  const link = String(config.link ?? "").trim();
  const target = String(config.linkTarget ?? "_self") === "_blank" ? "_blank" : "_self";

  const innerRadius = Math.max(0, s.radius * 10 - 2);
  const autoplay = config.autoplay === true;
  const muted = autoplay ? config.muted !== false : config.muted === true;
  const preload = ["none", "metadata", "auto"].includes(String(config.preload ?? ""))
    ? String(config.preload)
    : "metadata";

  /* 空态判定：接口模式下"等待数据"也走空态，与发布端脚本切换的语义一致；
     加载失败（broken）时回退空态占位 */
  const [broken, setBroken] = useState(false);
  const showAudio = !!src && !broken;

  const flexSx = {
    display: "flex" as const,
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: align,
    gap: `${gap}px`,
    padding: `0 ${padding}px`,
  };

  const inner = (
    <>
      {cover ? (
        <Box
          component="img"
          src={cover}
          alt=""
          sx={{ width: 44, height: 44, flexShrink: 0, objectFit: "cover", borderRadius: `${innerRadius}px`, display: "block" }}
        />
      ) : (
        showIcon && (
          <Box
            sx={{
              width: 44,
              height: 44,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: `${innerRadius}px`,
              backgroundColor: accentColor,
              color: "#fff",
            }}
          >
            <svg viewBox="0 0 24 24" width={22} height={22} style={{ display: "block", fill: "currentColor" }} aria-hidden="true">
              <path
                d={
                  icon === "headphones"
                    ? "M12 3a9 9 0 0 0-9 9v7a2 2 0 0 0 2 2h2v-8H5v-1a7 7 0 0 1 14 0v1h-2v8h2a2 2 0 0 0 2-2v-7a9 9 0 0 0-9-9z"
                    : "M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"
                }
              />
            </svg>
          </Box>
        )
      )}

      {(title || subtitle) && (
        <Box sx={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
          {title && (
            <Box
              sx={{
                fontSize: "14px",
                fontWeight: 600,
                color: textColor,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {title}
            </Box>
          )}
          {subtitle && (
            <Box
              sx={{
                fontSize: "12px",
                color: subtitleColor,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {subtitle}
            </Box>
          )}
        </Box>
      )}

      {showAudio ? (
        <Box
          component="audio"
          src={src}
          controls={config.controls !== false}
          autoPlay={autoplay}
          muted={muted}
          loop={config.loop === true}
          preload={preload}
          onError={() => setBroken(true)}
          sx={{ flex: "0 1 260px", minWidth: 120, maxWidth: 320, ...(isEdit ? { pointerEvents: "none" } : {}) }}
        />
      ) : (
        <Box
          sx={{
            flex: "0 1 260px",
            minWidth: 120,
            maxWidth: 320,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 36,
            border: "2px dashed rgba(0,0,0,0.12)",
            borderRadius: s.radiusCss,
            fontSize: "12px",
            color: s.emptyColor,
            backgroundColor: s.emptyBg,
            userSelect: "none",
            backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(0,0,0,0.02) 8px, rgba(0,0,0,0.02) 16px)",
          }}
        >
          {s.emptyText}
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
        backgroundColor: s.bgColor,
        borderRadius: s.radiusCss,
        ...(s.borderCss ? { border: s.borderCss } : {}),
        ...(s.boxShadow ? { boxShadow: s.boxShadow } : {}),
        opacity: s.opacity,
      }}
    >
      {link ? (
        <Box
          component="a"
          href={link}
          target={target}
          rel={target === "_blank" ? "noopener noreferrer" : undefined}
          sx={{ ...flexSx, textDecoration: "none", ...(isEdit ? { pointerEvents: "none" } : {}) }}
        >
          {inner}
        </Box>
      ) : (
        <Box sx={flexSx}>{inner}</Box>
      )}
    </Box>
  );
}
