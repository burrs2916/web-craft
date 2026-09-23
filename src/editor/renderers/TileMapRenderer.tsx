import { useEffect, useRef, useCallback, useState } from "react";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import type { ComponentRendererProps } from "../../types/editor";
import type { MapLibrary } from "../../types/mapLibrary";
import { MapLibreEngine } from "../map-engines/MapLibreEngine";
import type { MapEngine, MapEventData } from "../map-engines/types";
import { useViewportDelegate } from "../hooks/useViewportDelegate";
import type { ViewportDelegate } from "../layers/ComponentLayerAdapter";
import { useEventDispatcher } from "../context/SceneEditorContext";
import "maplibre-gl/dist/maplibre-gl.css";

export function TileMapRenderer({ config, componentId, width, height }: ComponentRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MapEngine | null>(null);
  const initRef = useRef(false);
  const setViewportDelegate = useViewportDelegate(componentId);
  const eventDispatcher = useEventDispatcher();

  const mapLibraryId = (config.mapLibraryId as string) || "";
  const [libraryConfig, setLibraryConfig] = useState<{ tileUrl: string; minZoom: number; maxZoom: number; apiKey: string } | null>(null);

  const tileUrl = libraryConfig?.tileUrl || (config.tileUrl as string) || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const crs = (config.crs as string) || "EPSG:3857";
  const center = config.center as [number, number] | undefined;
  const zoom = (config.zoom as number) ?? 10;
  const minZoom = libraryConfig?.minZoom ?? (config.minZoom as number) ?? 0;
  const maxZoom = libraryConfig?.maxZoom ?? (config.maxZoom as number) ?? 18;
  const pitch = (config.pitch as number) ?? 0;
  const bearing = (config.bearing as number) ?? 0;
  const showControls = (config.showControls as boolean) ?? true;

  useEffect(() => {
    if (!mapLibraryId) {
      setLibraryConfig(null);
      return;
    }
    let cancelled = false;
    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke<MapLibrary>("get_map_library", { id: mapLibraryId })
        .then((lib) => {
          if (cancelled || !lib.metadata) return;
          try {
            const meta = JSON.parse(lib.metadata);
            setLibraryConfig({
              tileUrl: meta.tileUrl || "",
              minZoom: meta.minZoom ?? 0,
              maxZoom: meta.maxZoom ?? 18,
              apiKey: meta.apiKey || "",
            });
          } catch { /* ignore */ }
        })
        .catch(() => {});
    });
    return () => { cancelled = true; };
  }, [mapLibraryId]);

  const handleMapEvent = useCallback((eventName: string, data: MapEventData) => {
    if (eventDispatcher) {
      eventDispatcher.emitToolEvent(`${componentId}:${eventName}`, data);
    }
  }, [componentId, eventDispatcher]);

  useEffect(() => {
    if (!containerRef.current || initRef.current) return;
    initRef.current = true;

    const engine = new MapLibreEngine();
    engineRef.current = engine;

    const style: Record<string, unknown> = {
      version: 8,
      sources: {
        "tile-source": {
          type: "raster",
          tiles: [tileUrl],
          tileSize: 256,
          minzoom: minZoom,
          maxzoom: maxZoom,
        },
      },
      layers: [
        {
          id: "tile-layer",
          type: "raster",
          source: "tile-source",
          minzoom: minZoom,
          maxzoom: maxZoom,
        },
      ],
    };

    engine
      .mount({
        container: containerRef.current,
        crs: crs as "EPSG:3857" | "EPSG:4326" | "EPSG:4490" | "local",
        style: JSON.stringify(style),
        camera: {
          center: center ? { x: center[0], y: center[1] } : { x: 116.397, y: 39.908 },
          zoom,
          pitch,
          bearing,
          minZoom,
          maxZoom,
        },
        minZoom,
        maxZoom,
        interactive: true,
        attributionControl: false,
      })
      .then(() => {
        engine.on("click", (data) => handleMapEvent("click", data));
        engine.on("zoom", (data) => handleMapEvent("zoomChange", data));
        engine.on("move", (data) => handleMapEvent("moveEnd", data));

        const delegate: ViewportDelegate = {
          getViewport: () => {
            const cam = engine.getCamera();
            return {
              centerX: cam.center.x,
              centerY: cam.center.y,
              zoom: cam.zoom,
              bearing: cam.bearing,
              pitch: cam.pitch,
              width: width ?? 0,
              height: height ?? 0,
              crs: crs as import("../../types/spatial").CRSType,
            };
          },
          setViewport: (snapshot) => {
            engine.flyTo({
              center: { x: snapshot.centerX, y: snapshot.centerY },
              zoom: snapshot.zoom,
              bearing: snapshot.bearing,
              pitch: snapshot.pitch,
              duration: 0,
            });
          },
          onViewportChange: (handler) => {
            const unsubs: (() => void)[] = [];
            unsubs.push(engine.on("move", () => {
              const cam = engine.getCamera();
              handler({
                centerX: cam.center.x,
                centerY: cam.center.y,
                zoom: cam.zoom,
                bearing: cam.bearing,
                pitch: cam.pitch,
                width: width ?? 0,
                height: height ?? 0,
                crs: crs as import("../../types/spatial").CRSType,
              }, componentId);
            }));
            unsubs.push(engine.on("zoom", () => {
              const cam = engine.getCamera();
              handler({
                centerX: cam.center.x,
                centerY: cam.center.y,
                zoom: cam.zoom,
                bearing: cam.bearing,
                pitch: cam.pitch,
                width: width ?? 0,
                height: height ?? 0,
                crs: crs as import("../../types/spatial").CRSType,
              }, componentId);
            }));
            return () => unsubs.forEach(u => u());
          },
        };
        setViewportDelegate(delegate);
      })
      .catch((err) => {
        console.error(`[TileMap:${componentId}] Mount failed:`, err);
      });

    return () => {
      setViewportDelegate(null);
      engine.unmount();
      engineRef.current = null;
      initRef.current = false;
    };
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !engine.isReady) return;

    if (config.zoom !== undefined) {
      engine.setCamera({ zoom: config.zoom as number });
    }
  }, [config.zoom]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !engine.isReady) return;

    if (config.center) {
      const c = config.center as [number, number];
      engine.setCamera({ center: { x: c[0], y: c[1] } });
    }
  }, [config.center]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !engine.isReady) return;

    if (config.pitch !== undefined) {
      engine.setCamera({ pitch: config.pitch as number });
    }
  }, [config.pitch]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !engine.isReady) return;

    if (config.bearing !== undefined) {
      engine.setCamera({ bearing: config.bearing as number });
    }
  }, [config.bearing]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const observer = new ResizeObserver(() => {
      engine.resize();
    });
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        borderRadius: 1,
        border: "1px solid rgba(33,150,243,0.15)",
      }}
    >
      <Box
        ref={containerRef}
        sx={{
          width: "100%",
          height: "100%",
          "& .maplibregl-ctrl-attrib": { display: "none" },
          "& .maplibregl-ctrl-logo": { display: "none" },
        }}
      />
      {!engineRef.current?.isReady && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,20,40,0.8)",
            gap: 1,
          }}
        >
          <CircularProgress size={24} sx={{ color: "rgba(33,150,243,0.6)" }} />
          <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.5)" }}>
            地图加载中...
          </Typography>
        </Box>
      )}
      {showControls && (
        <Box
          sx={{
            position: "absolute",
            bottom: 8,
            right: 8,
            display: "flex",
            gap: 0.5,
            zIndex: 10,
          }}
        >
          <MapControlButton
            label="+"
            onClick={() => {
              const camera = engineRef.current?.getCamera();
              if (camera) {
                engineRef.current?.setCamera({ zoom: camera.zoom + 1 });
              }
            }}
          />
          <MapControlButton
            label="-"
            onClick={() => {
              const camera = engineRef.current?.getCamera();
              if (camera) {
                engineRef.current?.setCamera({ zoom: camera.zoom - 1 });
              }
            }}
          />
          <MapControlButton
            label="⌂"
            onClick={() => {
              engineRef.current?.flyTo({
                center: center ? { x: center[0], y: center[1] } : { x: 116.397, y: 39.908 },
                zoom,
                duration: 1000,
              });
            }}
          />
        </Box>
      )}
    </Box>
  );
}

function MapControlButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        width: 28,
        height: 28,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,20,40,0.8)",
        border: "1px solid rgba(33,150,243,0.3)",
        borderRadius: 0.5,
        color: "rgba(255,255,255,0.8)",
        fontSize: 14,
        cursor: "pointer",
        "&:hover": {
          backgroundColor: "rgba(33,150,243,0.3)",
        },
      }}
    >
      {label}
    </Box>
  );
}
