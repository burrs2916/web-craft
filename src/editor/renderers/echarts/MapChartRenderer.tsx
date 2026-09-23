import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { echarts, CHART_BOX_SX, calcFontScale, chartFontSizes, calcDevicePixelRatio } from "./echartsCore";
import { useEchartOptions } from "./useEchartOptions";
import type { ComponentRendererProps } from "../../../types/editor";
import { useChartData } from "./useChartData";

/** 地图已注册缓存（模块级，避免重复请求） */
const mapRegistry = new Map<string, Promise<boolean> | boolean>();

/**
 * 确保地图 GeoJSON 已注册（发布端与 codegen 使用同一数据源）
 */
function useRegisteredMap(mapName: string): boolean {
  const [ready, setReady] = useState(() => {
    const cached = mapRegistry.get(mapName);
    return cached === true || echarts.getMap(mapName) !== undefined;
  });

  useEffect(() => {
    if (mapRegistry.get(mapName) === true || echarts.getMap(mapName)) {
      setReady(true);
      return;
    }
    let promise = mapRegistry.get(mapName) as Promise<boolean> | undefined;
    if (!promise) {
      const code = mapName === "china" || mapName === "中国" ? "100000" : mapName;
      promise = fetch(`https://geo.datav.aliyun.com/areas_v3/bound/${code}_full.json`)
        .then((r) => {
          if (!r.ok) throw new Error("map fetch fail");
          return r.json();
        })
        .then((geo) => {
          try {
            echarts.registerMap(mapName, geo);
            mapRegistry.set(mapName, true);
            return true;
          } catch {
            mapRegistry.set(mapName, false);
            return false;
          }
        })
        .catch(() => {
          mapRegistry.set(mapName, false);
          return false;
        });
      mapRegistry.set(mapName, promise);
    }
    promise.then((ok) => setReady(ok));
    return () => {};
  }, [mapName]);

  return ready;
}

/** 地图 */
export function MapChartRenderer({ config, width, height }: ComponentRendererProps) {
  config = useChartData(config);
  const isDark = (config.theme as string) !== "light";
  const mapName = (config.mapName as string) || "china";
  const mapReady = useRegisteredMap(mapName);
  const data = (config.data as { name: string; value: number }[]) || [
    { name: "北京", value: 200 }, { name: "上海", value: 180 },
    { name: "广东", value: 150 }, { name: "四川", value: 120 },
    { name: "浙江", value: 100 },
  ];
  const roam = (config.roam as boolean) ?? true;
  const visualMapMin = (config.visualMapMin as number) ?? 0;
  const visualMapMax = (config.visualMapMax as number) ?? 200;

  const scale = calcFontScale(width, height);
  const fs = chartFontSizes(scale);
  const dpr = calcDevicePixelRatio(width, height);

  const baseOption: Record<string, unknown> = {
    visualMap: {
      min: visualMapMin, max: visualMapMax,
      left: 10, bottom: 20, text: ["高", "低"], calculable: true,
      inRange: { color: ["#50a3ba", "#eac736", "#d94e5d"] },
      textStyle: { color: isDark ? "rgba(255,255,255,0.6)" : "#666", fontSize: fs.subtitle },
    },
    series: [{
      type: "map",
      map: mapName,
      roam,
      data,
      label: { show: false, fontSize: fs.label },
      itemStyle: {
        areaColor: isDark ? "rgba(0,193,222,0.06)" : "#eee",
        borderColor: isDark ? "rgba(0,193,222,0.3)" : "#999",
        ...(isDark ? { shadowColor: "rgba(0,193,222,0.15)", shadowBlur: 6 } : {}),
      },
      emphasis: {
        itemStyle: { areaColor: "rgba(0,193,222,0.2)" },
        label: { show: true, color: "#fff", fontSize: fs.label },
      },
    }],
  };

  const option = useEchartOptions(config, baseOption, scale);

  if (!mapReady) {
    return (
      <Box sx={{ ...CHART_BOX_SX, color: isDark ? "rgba(255,255,255,0.5)" : "#888", fontSize: 13 }}>
        {mapRegistry.get(mapName) === false ? "地图数据加载失败" : "地图加载中…"}
      </Box>
    );
  }

  return (
    <Box sx={CHART_BOX_SX}>
      <ReactEChartsCore echarts={echarts} option={option} theme={isDark ? "industrial-dark" : undefined} notMerge lazyUpdate opts={{ devicePixelRatio: dpr }} style={{ width: "100%", height: "100%" }} />
    </Box>
  );
}
