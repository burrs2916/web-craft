import { useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { resolveMediaStyle } from "../data/mediaStyle";
import { useEditorStore } from "../../store/editorStore";
import { useApiDataFetch } from "../hooks/useApiDataFetch";
import { resolveEffectiveDataConfig } from "../../shared/resolveDataConfig";
import { readAuthEnabled } from "../data/authMode";

/**
 * 视频（video）编辑区渲染器。
 *
 * 与发布端 `codegen/components/media.ts` 的 `videoCodegen` **结构同构**：
 * 同一份样式口径（resolveMediaStyle）→ 容器 + 内容层 + 空态 + 题注。
 *
 * 扩展能力：封面图、controls/autoplay/muted/loop/playsInline/preload 全量开关、
 * object-fit、圆角/边框/阴影/底色/透明度、题注、起播时间/音量/倍速、悬浮放大。
 *
 * 动态资源（本轮补齐，与 `ImageRenderer` 同构）：
 * `dataMode=api` 或绑定全局数据源时走统一 `useApiDataFetch`，按 `apiSrcField`
 * 取视频地址、`apiPosterField` 取封面地址；`authEnabled` 三态决定是否注入认证 Token
 * （null = 跟随站点全局认证态），即"认证 / 非认证"两种接入方式的切换点。
 *
 * 两处与发布端刻意保持一致的细节：
 * 1. **自动播放必须静音**：浏览器策略会拦下「非静音自动播放」，发布端已兜底静音，
 *    编辑区若只按面板值渲染就会出现「画布能播、发布后不播」。故 autoplay 时强制 muted。
 * 2. 原生控件（`controls`）在编辑区同样渲染，保证编辑区看到的控件布局与发布一致。
 */
export function VideoRenderer({ config, mode }: ComponentRendererProps) {
  const s = resolveMediaStyle(config, { fit: "contain", bgColor: "#000000", emptyText: "暂无视频" });
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
  const apiPosterField = String(effApi.apiPosterField ?? config.apiPosterField ?? "");
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

  const { apiSrc, apiPoster } = useMemo(() => {
    if (!isApi || apiRaw == null) return { apiSrc: "", apiPoster: "" };
    if (typeof apiRaw === "string") return { apiSrc: apiRaw, apiPoster: "" };
    return {
      apiSrc: pickField(apiRaw, apiSrcField, ["url", "src", "video", "videoUrl", "path"]),
      apiPoster: pickField(apiRaw, apiPosterField, ["poster", "cover", "image", "thumbnail"]),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isApi, apiRaw, apiSrcField, apiPosterField]);

  const src = isApi ? apiSrc : String(config.source ?? "").trim();
  const poster = isApi ? (apiPoster || String(config.poster ?? "").trim()) : String(config.poster ?? "").trim();
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  const autoplay = config.autoplay === true;
  const muted = autoplay ? config.muted !== false : config.muted === true;
  const controls = config.controls !== false;
  const loop = config.loop === true;
  const playsInline = config.playsInline !== false;
  const preload = ["none", "metadata", "auto"].includes(String(config.preload ?? ""))
    ? String(config.preload)
    : "metadata";

  const startTime = Number(config.startTime ?? 0) || 0;
  const volumeRaw = config.volume;
  const volume = volumeRaw === undefined || volumeRaw === null || volumeRaw === "" ? null : Number(volumeRaw);
  const rate = Number(config.playbackRate ?? 1) || 1;
  const link = String(config.link ?? "").trim();
  const target = String(config.linkTarget ?? "_self") === "_blank" ? "_blank" : "_self";

  const videoRef = useRef<HTMLVideoElement | null>(null);
  // 起播时间必须在视频元数据就绪后设置；volume/playbackRate 随时可写
  const applyStartTime = () => {
    const v = videoRef.current;
    if (!v || startTime <= 0) return;
    try { v.currentTime = startTime; } catch { /* 忽略 */ }
  };
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (volume !== null && Number.isFinite(volume)) {
      try { v.volume = Math.min(1, Math.max(0, volume)); } catch { /* 忽略 */ }
    }
    try { v.playbackRate = rate; } catch { /* 忽略 */ }
    // 如果元数据已就绪，立即设置 startTime
    if (v.readyState >= 1) applyStartTime();
    // 否则等 loadedmetadata 事件
    v.addEventListener("loadedmetadata", applyStartTime);
    return () => { v.removeEventListener("loadedmetadata", applyStartTime); };
  }, [startTime, volume, rate, src]);

  const content = (
    <>
      {src && !broken ? (
        <Box
          component="video"
          className="mv-img"
          ref={videoRef}
          src={src}
          poster={poster || undefined}
          controls={controls}
          autoPlay={autoplay}
          muted={muted}
          loop={loop}
          playsInline={playsInline}
          preload={preload}
          onError={() => setBroken(true)}
          // 编辑态禁用交互：画布上点击视频应落到组件选中，而不是触发播放
          disablePictureInPicture={isEdit}
          sx={{
            width: "100%",
            height: "100%",
            display: "block",
            objectFit: s.fit,
            objectPosition: s.objectPosition,
            transformOrigin: "center center",
            transition: s.transitionCss,
            // 裁剪 video 元素自身到圆角形状，解决浏览器默认控件突破容器圆角边界的问题
            clipPath: `inset(0 round ${s.radiusCss})`,
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
        // 悬浮放大挂在容器上（与发布端 `.uid:hover .uid-img` 同构）
        ...(s.hoverScale > 1 ? { "&:hover .mv-img": { transform: `scale(${s.hoverScale})` } } : {}),
      }}
    >
      {link ? (
        <Box
          component="a"
          href={link}
          target={target}
          rel={target === "_blank" ? "noopener noreferrer" : undefined}
          sx={{
            display: "block",
            width: "100%",
            height: "100%",
            textDecoration: "none",
            ...(isEdit ? { pointerEvents: "none" } : {}),
          }}
        >
          {content}
        </Box>
      ) : (
        content
      )}
    </Box>
  );
}
