import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import LinearProgress from "@mui/material/LinearProgress";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Checkbox from "@mui/material/Checkbox";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import ArchitectureIcon from "@mui/icons-material/Architecture";
import LayersIcon from "@mui/icons-material/Layers";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import VisibilityIcon from "@mui/icons-material/Visibility";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import BugReportIcon from "@mui/icons-material/BugReport";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import { CadViewerEngine } from "./CadViewerEngine";
import type { CadLayer } from "./types";
import type { TransformParams } from "./coordinate/TransformCalculator";

export interface CadViewerWidgetProps {
  fileUrl?: string;
  format?: "dxf" | "dwg";
  backgroundColor?: string;
  lineColor?: string;
  transformParams?: TransformParams | null;
  showToolbar?: boolean;
  mode?: "preview" | "edit";
  standalone?: boolean;
  engine?: CadViewerEngine;
  onDocumentLoaded?: (fileName: string) => void;
  onError?: (error: Error) => void;
  onCoordinateClick?: (cadX: number, cadY: number) => void;
  style?: React.CSSProperties;
  className?: string;
}

let _initLock: Promise<void> | null = null;

export function CadViewerWidget({
  fileUrl,
  format = "dxf",
  backgroundColor = "#1a1a2e",
  lineColor = "#4fc3f7",
  transformParams = null,
  showToolbar = true,
  mode = "edit",
  standalone = false,
  engine: externalEngine,
  onDocumentLoaded,
  onError,
  onCoordinateClick,
  style,
  className,
}: CadViewerWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [documentName, setDocumentName] = useState<string>("");
  const [loadError, setLoadError] = useState<string>("");
  const [loadProgress, setLoadProgress] = useState<number>(0);
  const [loadStage, setLoadStage] = useState<string>("");
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [isDarkBg, setIsDarkBg] = useState(true);
  const [layers, setLayers] = useState<CadLayer[]>([]);
  const [layerVisibility, setLayerVisibility] = useState<Map<string, boolean>>(new Map());

  const engineRef = useRef<CadViewerEngine | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (transformParams && engineRef.current) {
      engineRef.current.setTransformParams(transformParams);
    }
  }, [transformParams]);

  useEffect(() => {
    if (!containerRef.current) return;

    const engine = externalEngine || new CadViewerEngine(mode === "preview" ? "preview" : undefined);
    engineRef.current = engine;
    mountedRef.current = true;

    let cancelled = false;

    const initWhenReady = async () => {
      if (!containerRef.current || cancelled || !mountedRef.current) return;

      while (_initLock) {
        await _initLock;
        if (cancelled || !mountedRef.current) return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        if (cancelled || !mountedRef.current) return;
        initWhenReady();
        return;
      }

      if (engine.isInitialized) {
        if (!cancelled && mountedRef.current) setIsInitialized(true);
        return;
      }

      _initLock = (async () => {
        try {
          await engine.initialize({
            container: containerRef.current!,
            autoResize: true,
            backgroundColor,
            lineColor,
          });
        } finally {
          _initLock = null;
        }
      })();
      await _initLock;

      if (cancelled || !mountedRef.current) return;

      engine.on("documentOpened", (event) => {
        if (!mountedRef.current) return;
        const name = (event.data as Record<string, string>)?.fileName || "";
        setDocumentName(name);
        setIsLoading(false);
        setLoadProgress(100);
        setLoadStage("");

        const docLayers = engine.getDocumentLayers();
        setLayers(docLayers);
        const visibilityMap = new Map<string, boolean>();
        for (const layer of docLayers) {
          visibilityMap.set(layer.name, layer.visible);
        }
        setLayerVisibility(visibilityMap);

        onDocumentLoaded?.(name);
      });

      engine.on("error", (event) => {
        if (!mountedRef.current) return;
        const data = event.data as Record<string, unknown>;
        const err = data?.error;
        const message = err instanceof Error ? err.message : String(err || "未知错误");
        setLoadError(message);
        setIsLoading(false);
        setLoadProgress(0);
        setLoadStage("");
        onError?.(err instanceof Error ? err : new Error(message));
      });

      engine.on("loadProgress", (event) => {
        if (!mountedRef.current) return;
        const data = event.data as Record<string, unknown>;
        if (data?.progress !== undefined) {
          setLoadProgress(data.progress as number);
        }
        if (data?.stage) {
          setLoadStage(String(data.stage));
        }
      });

      if (!cancelled && mountedRef.current) setIsInitialized(true);
    };

    initWhenReady();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (!externalEngine) {
        engine.destroy();
      }
      engineRef.current = null;
      setIsInitialized(false);
      setDocumentName("");
      setLoadError("");
      setLoadProgress(0);
      setLoadStage("");
    };
  }, []);

  useEffect(() => {
    if (!fileUrl || !isInitialized || !engineRef.current) return;

    const loadFile = async () => {
      setIsLoading(true);
      setLoadError("");
      setLoadProgress(0);
      const fileName = fileUrl.split("/").pop() || `document.${format}`;
      const success = await engineRef.current!.openFromUrl(fileUrl, fileName);
      if (!success) {
        setLoadError(`无法加载文件: ${fileName}`);
        setIsLoading(false);
      }
    };

    loadFile();
  }, [fileUrl, format, isInitialized]);

  useEffect(() => {
    if (!containerRef.current || !isInitialized) return;

    const observer = new ResizeObserver(() => {
      engineRef.current?.resize();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isInitialized]);

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".dxf") && !fileName.endsWith(".dwg")) {
      setLoadError("请选择 DXF 或 DWG 文件");
      return;
    }

    if (!isInitialized || !engineRef.current) {
      setLoadError("CAD引擎尚未初始化，请稍后重试");
      return;
    }

    setIsLoading(true);
    setLoadError("");
    setLoadProgress(0);
    setLoadStage("读取文件...");

    const success = await engineRef.current.openFile(file);
    if (!success && !loadError) {
      setLoadError(`无法加载文件: ${file.name}`);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [isInitialized, loadError]);

  const handleZoomIn = useCallback(() => {
    engineRef.current?.zoomIn();
  }, []);

  const handleZoomOut = useCallback(() => {
    engineRef.current?.zoomOut();
  }, []);

  const handleFitToView = useCallback(() => {
    engineRef.current?.fitToView();
  }, []);

  const handleOpenFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleToggleLayer = useCallback((layerName: string, visible: boolean) => {
    engineRef.current?.setLayerVisible(layerName, visible);
    setLayerVisibility(prev => {
      const next = new Map(prev);
      next.set(layerName, visible);
      return next;
    });
  }, []);

  const handleShowAllLayers = useCallback(() => {
    if (!engineRef.current || !isInitialized) return;
    
    try {
      engineRef.current.showAllLayers();
      // 批量更新状态
      setLayerVisibility(prev => {
        const next = new Map(prev);
        for (const layer of layers) {
          next.set(layer.name, true);
        }
        return next;
      });
    } catch (err) {
      console.error('[CadViewerWidget] Failed to show all layers:', err);
    }
  }, [isInitialized, layers]);

  const handleHideAllLayers = useCallback(() => {
    if (!engineRef.current || !isInitialized) return;
    
    try {
      engineRef.current.hideAllLayers();
      // 批量更新状态
      setLayerVisibility(prev => {
        const next = new Map(prev);
        for (const layer of layers) {
          next.set(layer.name, false);
        }
        return next;
      });
    } catch (err) {
      console.error('[CadViewerWidget] Failed to hide all layers:', err);
    }
  }, [isInitialized, layers]);

  const handleToggleLayerPanel = useCallback(() => {
    setShowLayerPanel(prev => !prev);
  }, []);

  const handleToggleDebugMode = useCallback(() => {
    setDebugMode(prev => {
      const newMode = !prev;
      engineRef.current?.setDebugMode(newMode);
      return newMode;
    });
  }, []);

  const handleToggleBackground = useCallback(() => {
    setIsDarkBg(prev => {
      const newDark = !prev;
      const newColor = newDark ? "#1a1a2e" : "#f0f0f0";
      engineRef.current?.setBackgroundColor(newColor);
      return newDark;
    });
  }, []);

  const hasDocument = useMemo(() => engineRef.current?.isDocumentLoaded ?? false, [documentName]);

  const showPlaceholder = !isInitialized && !isLoading && !hasDocument;

  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleStandaloneFullscreen = useCallback(async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const currentWindow = getCurrentWindow();
      const fullscreen = await currentWindow.isFullscreen();
      if (fullscreen) {
        await currentWindow.setFullscreen(false);
        setIsFullscreen(false);
      } else {
        await currentWindow.setFullscreen(true);
        setIsFullscreen(true);
      }
    } catch (e) {
      console.error("[CadViewerWidget] fullscreen failed:", e);
    }
  }, []);

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor,
        borderRadius: 1,
        border: "1px solid rgba(33,150,243,0.15)",
        position: "relative",
        overflow: "hidden",
        ...style,
      }}
      className={className}
    >
      {showToolbar && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 1,
            py: 0.5,
            backgroundColor: "rgba(0,0,0,0.3)",
            borderBottom: "1px solid rgba(33,150,243,0.15)",
            zIndex: 10,
            flexShrink: 0,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <ArchitectureIcon sx={{ fontSize: 16, color: lineColor, opacity: 0.7 }} />
            <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.7)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {documentName || "CAD 图纸"}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
            <Tooltip title="放大">
              <IconButton size="small" onClick={handleZoomIn} sx={{ color: "rgba(255,255,255,0.6)" }}>
                <ZoomInIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="缩小">
              <IconButton size="small" onClick={handleZoomOut} sx={{ color: "rgba(255,255,255,0.6)" }}>
                <ZoomOutIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="适配视图">
              <IconButton size="small" onClick={handleFitToView} sx={{ color: "rgba(255,255,255,0.6)" }}>
                <FitScreenIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="打开文件">
              <IconButton size="small" onClick={handleOpenFile} sx={{ color: "rgba(255,255,255,0.6)" }}>
                <UploadFileIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            {hasDocument && (
              <>
                <Tooltip title="显示所有图层">
                  <IconButton size="small" onClick={handleShowAllLayers} sx={{ color: "rgba(255,255,255,0.6)" }}>
                    <VisibilityIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="隐藏所有图层">
                  <IconButton size="small" onClick={handleHideAllLayers} sx={{ color: "rgba(255,255,255,0.6)" }}>
                    <VisibilityOffIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="图层管理">
                  <IconButton size="small" onClick={handleToggleLayerPanel} sx={{ color: showLayerPanel ? lineColor : "rgba(255,255,255,0.6)" }}>
                    <LayersIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              </>
            )}
            {standalone && (
              <>
                <Box sx={{ width: 1, height: 16, bgcolor: "rgba(255,255,255,0.15)", mx: 0.5 }} />
                <Tooltip title={isFullscreen ? "退出全屏" : "全屏"}>
                  <IconButton size="small" onClick={handleStandaloneFullscreen} sx={{ color: "rgba(255,255,255,0.6)" }}>
                    {isFullscreen ? <FullscreenExitIcon sx={{ fontSize: 18 }} /> : <FullscreenIcon sx={{ fontSize: 18 }} />}
                  </IconButton>
                </Tooltip>
                <Tooltip title={debugMode ? "关闭调试模式" : "开启调试模式"}>
                  <IconButton size="small" onClick={handleToggleDebugMode} sx={{ color: debugMode ? "#ff9800" : "rgba(255,255,255,0.6)" }}>
                    <BugReportIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              </>
            )}
            <Tooltip title={isDarkBg ? "切换浅色背景" : "切换深色背景"}>
              <IconButton size="small" onClick={handleToggleBackground} sx={{ color: isDarkBg ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.6)" }}>
                {isDarkBg ? <DarkModeIcon sx={{ fontSize: 18 }} /> : <LightModeIcon sx={{ fontSize: 18 }} />}
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      )}

      <Box sx={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
        <Box
          ref={containerRef}
          sx={{
            flex: 1,
            position: "relative",
            minHeight: 0,
            "& canvas": {
              width: "100% !important",
              height: "100% !important",
            },
          }}
          onMouseDown={() => {
            if (!onCoordinateClick) return;
          }}
        />

        {showLayerPanel && hasDocument && layers.length > 0 && (
          <Box
            sx={{
              width: 220,
              backgroundColor: "rgba(0,0,0,0.85)",
              borderLeft: "1px solid rgba(33,150,243,0.15)",
              overflowY: "auto",
              flexShrink: 0,
              zIndex: 10,
            }}
          >
            <Box sx={{ px: 1, py: 0.5, borderBottom: "1px solid rgba(33,150,243,0.15)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>
                图层 ({layers.length})
              </Typography>
              <IconButton size="small" onClick={handleToggleLayerPanel} sx={{ color: "rgba(255,255,255,0.5)", p: 0.25 }}>
                <VisibilityOffIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Box>
            {layers.map((layer) => {
              const isVisible = layerVisibility.get(layer.name) ?? layer.visible;
              const r = (layer.color >> 16) & 0xff;
              const g = (layer.color >> 8) & 0xff;
              const b = layer.color & 0xff;
              return (
                <Box
                  key={layer.name}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    px: 1,
                    py: 0.25,
                    cursor: "pointer",
                    "&:hover": { backgroundColor: "rgba(255,255,255,0.05)" },
                    opacity: isVisible ? 1 : 0.5,
                  }}
                  onClick={() => handleToggleLayer(layer.name, !isVisible)}
                >
                  <Checkbox
                    checked={isVisible}
                    size="small"
                    sx={{
                      p: 0.25,
                      color: "rgba(255,255,255,0.4)",
                      "&.Mui-checked": { color: lineColor },
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => handleToggleLayer(layer.name, !isVisible)}
                  />
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      borderRadius: 0.5,
                      backgroundColor: `rgb(${r},${g},${b})`,
                      border: "1px solid rgba(255,255,255,0.2)",
                      flexShrink: 0,
                    }}
                  />
                  <Typography
                    variant="caption"
                    sx={{
                      color: isVisible ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.4)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      flex: 1,
                    }}
                  >
                    {layer.name}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      {showPlaceholder && (
        <Box
          sx={{
            position: "absolute",
            inset: showToolbar ? "32px 0 0 0" : 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            pointerEvents: "none",
            zIndex: 5,
          }}
        >
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              backgroundImage: `
                linear-gradient(0deg, ${lineColor}11 1px, transparent 1px),
                linear-gradient(90deg, ${lineColor}11 1px, transparent 1px)
              `,
              backgroundSize: "20px 20px",
              pointerEvents: "none",
            }}
          />
          <ArchitectureIcon sx={{ fontSize: 48, color: "rgba(79,195,247,0.4)" }} />
          <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>
            {mode === "preview" ? "上传图纸预览" : "CAD 图纸查看器"}
          </Typography>
          <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.3)" }}>
            支持 DXF / DWG 格式
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<UploadFileIcon />}
            onClick={handleOpenFile}
            sx={{
              pointerEvents: "auto",
              borderColor: "rgba(79,195,247,0.3)",
              color: "rgba(79,195,247,0.7)",
              "&:hover": {
                borderColor: "rgba(79,195,247,0.5)",
                backgroundColor: "rgba(79,195,247,0.1)",
              },
            }}
          >
            {mode === "preview" ? "上传图纸" : "打开图纸"}
          </Button>
          {mode === "preview" && (
            <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.2)", fontSize: 10 }}>
              预览模式下数据不会持久化
            </Typography>
          )}
        </Box>
      )}

      {isLoading && (
        <Box
          sx={{
            position: "absolute",
            inset: showToolbar ? "32px 0 0 0" : 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            backgroundColor: "rgba(0,0,0,0.5)",
            zIndex: 20,
          }}
        >
          <CircularProgress size={40} sx={{ color: lineColor }} />
          <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.7)" }}>
            正在加载图纸...
          </Typography>
          {loadProgress > 0 && (
            <Box sx={{ width: "60%", maxWidth: 300 }}>
              <LinearProgress
                variant="determinate"
                value={loadProgress}
                sx={{
                  backgroundColor: "rgba(255,255,255,0.1)",
                  "& .MuiLinearProgress-bar": {
                    backgroundColor: lineColor,
                  },
                }}
              />
              <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.5)", mt: 0.5, display: "block", textAlign: "center" }}>
                {loadProgress}% {loadStage && `— ${loadStage}`}
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {loadError && (
        <Box
          sx={{
            position: "absolute",
            bottom: 8,
            left: "50%",
            transform: "translateX(-50%)",
            px: 2,
            py: 0.5,
            borderRadius: 1,
            backgroundColor: "rgba(244,67,54,0.9)",
            zIndex: 20,
            maxWidth: "90%",
          }}
        >
          <Typography variant="caption" sx={{ color: "#fff" }}>
            {loadError}
          </Typography>
        </Box>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".dxf,.dwg"
        style={{ display: "none" }}
        onChange={handleFileSelect}
      />
    </Box>
  );
}
