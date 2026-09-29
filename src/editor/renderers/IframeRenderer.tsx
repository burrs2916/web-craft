import { useMemo, useState, useEffect, useRef } from "react";
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
  // 编辑态安全加固：画布初始化时嵌入页即开始加载，若按用户配置（默认不启用沙箱）
  // 其脚本可弹窗/顶层导航/访问父页面 DOM。编辑态强制收窄为受控策略——保留脚本渲染
  // 与表单提交，剥夺 allow-popups / allow-top-navigation / allow-same-origin（后者的
  // 同源访问面即便用户显式配置也不在编辑态打开）；预览态/发布端才放开用户完整配置。
  const effectiveSandbox = isEdit ? "allow-scripts allow-forms" : sandbox || undefined;
  const allowFullscreen = config.allowFullscreen === true;
  const loading = String(config.loading ?? "lazy") === "eager" ? "eager" : "lazy";
  const referrerPolicy: "no-referrer" | "no-referrer-when-downgrade" | "origin" =
    String(config.referrerPolicy ?? "") === "no-referrer"
      ? "no-referrer"
      : String(config.referrerPolicy ?? "") === "origin"
        ? "origin"
        : "no-referrer-when-downgrade";
  const title = String(config.title ?? "").trim() || "嵌入式内容";
  const ariaLabel = String(config.ariaLabel ?? "").trim() || title;
  const link = String(config.link ?? "").trim();
  const target = String(config.linkTarget ?? "_self") === "_blank" ? "_blank" : "_self";

  // P3-2 响应式缩放：容器级 transform:scale() 按画布宽度自适应缩放嵌入内容
  // 防止固定宽度嵌入页在窄容器内出现横向滚动条。打印态自动关闭以保正文清晰。
  const responsiveScale = config.responsiveScale === true;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scaleRatio, setScaleRatio] = useState(1);
  useEffect(() => {
    if (!responsiveScale || !containerRef.current) return;
    const el = containerRef.current;
    let ro: ResizeObserver | undefined;
    const calc = () => {
      const w = el.clientWidth;
      // 以 1280px 为基准宽度，小于基准时等比缩放；不小于基准时不放大（scale <= 1）
      const ratio = w > 0 ? Math.min(1, w / 1280) : 1;
      setScaleRatio(ratio);
    };
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(calc);
      ro.observe(el);
    }
    calc();
    return () => { if (ro) ro.disconnect(); };
  }, [responsiveScale]);

  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    setLoaded(false);
    setTimedOut(false);
  }, [src]);

  // T5 加载超时探测：loadTimeoutSec > 0 时启用（默认 0 = 关闭，保持'一直加载中'的
  // 旧行为）。超时仍未 onload → 加载层切'加载超时'文案；onload 到达则恢复隐藏。
  // 跨域 iframe 没有可用的失败事件，定时器是唯一可靠兜底；同源下 onload 本身就
  // 是精确信号，无需再读 readyState。
  const loadTimeoutSec = Number(config.loadTimeoutSec ?? 0);
  useEffect(() => {
    if (!src || loadTimeoutSec <= 0 || loaded) return;
    const t = window.setTimeout(() => setTimedOut(true), loadTimeoutSec * 1000);
    return () => window.clearTimeout(t);
  }, [src, loadTimeoutSec, loaded]);

  // T4 自适应高度：autoHeight 仅在预览态生效（编辑画布态的 sandbox 收窄后
  // 本就无法读取同源文档高度，且画布盒高度固定）；同源用 ResizeObserver 跟随
  // 内容高度，跨域靠嵌入页 postMessage({ type: "auto-height", height }) 回传。
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const autoHeight = config.autoHeight === true && !isEdit;
  useEffect(() => {
    if (!autoHeight || !src || !loaded) return;
    const frame = iframeRef.current;
    if (!frame) return;
    let doc: Document | null = null;
    try {
      doc = frame.contentDocument;
    } catch {
      doc = null;
    }
    // 同源：ResizeObserver 跟随内容文档高度
    if (doc) {
      let ro: ResizeObserver | undefined;
      const resize = () => {
        const h = Math.max(
          doc!.documentElement ? doc!.documentElement.scrollHeight : 0,
          doc!.body ? doc!.body.scrollHeight : 0,
        );
        if (h > 0 && frame.style.height !== `${h}px`) frame.style.height = `${h}px`;
      };
      if (typeof ResizeObserver !== "undefined" && doc.documentElement) {
        ro = new ResizeObserver(resize);
        ro.observe(doc.documentElement);
        if (doc.body) ro.observe(doc.body);
      }
      resize();
      return () => {
        if (ro) ro.disconnect();
      };
    }
    // 跨域：监听嵌入页回传
    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== frame.contentWindow) return;
      const m = ev.data as unknown;
      if (!m || typeof m !== "object") return;
      const h = (m as { height?: unknown }).height;
      const hNum = typeof h === "number" ? h : Number(h);
      if (hNum > 0 && frame.style.height !== `${hNum}px`) frame.style.height = `${hNum}px`;
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [autoHeight, src, loaded]);

  const content = (
    <Box
      sx={{
        position: "relative",
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        // 自适应高度时内容会超出画布盒高度，需要可见溢出；默认仍裁切
        overflow: autoHeight ? "visible" : "hidden",
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
        <Box sx={{ position: "relative", width: "100%", height: "100%", "@media print": { display: "none" }, transformOrigin: "0 0", transform: responsiveScale ? `scale(${scaleRatio})` : undefined }}>
          <Box
            component="iframe"
            className="mv-img"
            ref={iframeRef}
            src={src}
            title={title}
            allowFullScreen={allowFullscreen}
            loading={loading}
            referrerPolicy={referrerPolicy}
            sandbox={effectiveSandbox}
            allow={allow || undefined}
            onLoad={() => {
              setLoaded(true);
              // onload 已触发，超时兜底不再有意义（同源/可达页面）
              setTimedOut(false);
            }}
            aria-label={ariaLabel}
            role="region"
            // 编辑态禁用 iframe 内部交互：画布上点击/拖动应落到组件选中，而不是被嵌入页吞掉
            sx={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              display: "block",
              border: 0,
              transformOrigin: "center center",
              transition: s.transitionCss,
              ...(isEdit ? { pointerEvents: "none" } : {}),
              // T4 自适应高度：预览态开启 autoHeight 时改为按内容高度伸缩，
              // 高度由 effect 里 ResizeObserver / postMessage 回写的 inline height 决定
              ...(autoHeight
                ? { position: "absolute", top: 0, left: 0, width: "100%", height: "auto", minHeight: "100%" }
                : {}),
            }}
          />
          {!loaded && (
            <Box
              role="status"
              aria-live="polite"
              aria-label={timedOut ? "嵌入内容加载超时" : "正在加载嵌入内容"}
              sx={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: s.emptyBg,
                color: timedOut ? "#c62828" : s.emptyColor,
                fontSize: "12px",
                userSelect: "none",
                border: "2px dashed rgba(0,0,0,0.12)",
                borderRadius: s.radiusCss,
                backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(0,0,0,0.02) 8px, rgba(0,0,0,0.02) 16px)",
              }}
            >
              {timedOut ? "加载超时，请检查嵌入地址" : "加载中…"}
            </Box>
          )}
        </Box>
      ) : (
        <Box
          role="status"
          aria-live="polite"
          aria-label={s.emptyText}
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

  const printFallback = (
    <Box
      sx={{
        display: "none",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        textAlign: "center",
        backgroundColor: "#f5f5f5",
        border: "1px solid #ddd",
        borderRadius: s.radiusCss,
        fontSize: "12px",
        "@media print": { display: "flex !important" },
      }}
    >
      <Box sx={{ mb: 1, fontWeight: 500, color: "#333" }}>该嵌入内容在打印预览中不可用</Box>
      <Box component="a" href={src} sx={{ color: "#1976d2", wordBreak: "break-all", textDecoration: "none" }}>
        {src}
      </Box>
    </Box>
  );

  return link ? (
    <Box sx={{ width: "100%", height: "100%" }}>
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
          "@media print": { display: "none !important" },
        }}
      >
        {content}
      </Box>
      {printFallback}
    </Box>
  ) : (
    <Box sx={{ width: "100%", height: "100%" }}>
      <Box sx={{ width: "100%", height: "100%", "@media print": { display: "none !important" } }}>{content}</Box>
      {printFallback}
    </Box>
  );
}