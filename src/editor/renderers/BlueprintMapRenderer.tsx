import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import type { ComponentRendererProps } from "../../types/editor";
import type { MapLibrary } from "../../types/mapLibrary";
import { MapLibreEngine } from "../map-engines/MapLibreEngine";
import type { MapEngine } from "../map-engines/types";
import { useViewportDelegate } from "../hooks/useViewportDelegate";
import type { ViewportDelegate } from "../layers/ComponentLayerAdapter";
import type { CRSType } from "../../types/spatial";
import "maplibre-gl/dist/maplibre-gl.css";

export function BlueprintMapRenderer({ config, componentId, width, height, spatialContext }: ComponentRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MapEngine | null>(null);
  const initRef = useRef(false);
  const setViewportDelegate = useViewportDelegate(componentId);

  const mapLibraryId = (config.mapLibraryId as string) || "";
  const [libraryConfig, setLibraryConfig] = useState<{
    imagePath: string;
    bounds: { min: { x: number; y: number }; max: { x: number; y: number } } | null;
  } | null>(null);

  const imageUrl = libraryConfig?.imagePath
    ? `asset://localhost/${libraryConfig.imagePath}`
    : (config.imageUrl as string) || "";
  const configBounds = config.bounds as { min: { x: number; y: number }; max: { x: number; y: number } } | undefined;
  const bounds = libraryConfig?.bounds || configBounds;
  const opacity = (config.opacity as number) ?? 1;
  const showBaseMap = (config.showBaseMap as boolean) ?? true;
  const baseMapUrl = (config.baseMapUrl as string) || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const crs = spatialContext?.crs || (config.crs as string) || "EPSG:3857";
  const zoom = (config.zoom as number) ?? 10;

  useEffect(() => {
    if (!mapLibraryId) {
      setLibraryConfig(null);
      return;
    }
    let cancelled = false;
    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke<MapLibrary>("get_map_library", { id: mapLibraryId })
        .then((lib) => {
          if (cancelled) return;
          try {
            const meta = lib.metadata ? JSON.parse(lib.metadata) : {};
            const libBounds = lib.bounds ? JSON.parse(lib.bounds) : null;
            setLibraryConfig({
              imagePath: meta.imagePath || "",
              bounds: libBounds ? {
                min: { x: libBounds.minX, y: libBounds.minY },
                max: { x: libBounds.maxX, y: libBounds.maxY },
              } : null,
            });
          } catch { /* ignore */ }
        })
        .catch(() => {});
    });
    return () => { cancelled = true; };
  }, [mapLibraryId]);

  useEffect(() => {
    if (!containerRef.current || initRef.current) return;
    initRef.current = true;

    const engine = new MapLibreEngine();
    engineRef.current = engine;

    const sources: Record<string, unknown> = {};
    const layers: Record<string, unknown>[] = [];

    if (showBaseMap) {
      sources["base-tiles"] = {
        type: "raster",
        tiles: [baseMapUrl],
        tileSize: 256,
      };
      layers.push({
        id: "base-tile-layer",
        type: "raster",
        source: "base-tiles",
      });
    }

    if (imageUrl && bounds) {
      sources["blueprint-image"] = {
        type: "image",
        url: imageUrl,
        coordinates: [
          [bounds.min.x, bounds.max.y],
          [bounds.max.x, bounds.max.y],
          [bounds.max.x, bounds.min.y],
          [bounds.min.x, bounds.min.y],
        ],
      };
      layers.push({
        id: "blueprint-layer",
        type: "raster",
        source: "blueprint-image",
        paint: {
          "raster-opacity": opacity,
        },
      });
    }

    const style = {
      version: 8,
      sources,
      layers,
    };

    const defaultCenter = bounds
      ? { x: (bounds.min.x + bounds.max.x) / 2, y: (bounds.min.y + bounds.max.y) / 2 }
      : { x: 116.397, y: 39.908 };

    engine
      .mount({
        container: containerRef.current,
        crs: crs as "EPSG:3857" | "EPSG:4326" | "EPSG:4490" | "local",
        style: JSON.stringify(style),
        camera: {
          center: defaultCenter,
          zoom,
        },
        interactive: true,
        attributionControl: false,
      })
      .then(() => {
        if (bounds) {
          engine.fitBounds(bounds, 50);
        }

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
              crs: crs as CRSType,
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
                crs: crs as CRSType,
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
                crs: crs as CRSType,
              }, componentId);
            }));
            return () => unsubs.forEach(u => u());
          },
        };
        setViewportDelegate(delegate);
      })
      .catch((err) => {
        console.error(`[BlueprintMap:${componentId}] Mount failed:`, err);
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
      {!imageUrl && (
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
          <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.5)" }}>
            请配置图片地址和坐标范围
          </Typography>
        </Box>
      )}
      {imageUrl && !engineRef.current?.isReady && (
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
            蓝图加载中...
          </Typography>
        </Box>
      )}
    </Box>
  );
}
