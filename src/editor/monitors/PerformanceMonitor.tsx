/**
 * PerformanceMonitor — 开发模式性能监控悬浮面板
 *
 * 显示：FPS / drawCall / JS 堆内存
 * 仅在 DEV 模式下挂载，生产环境零开销
 */

import { useEffect, useState, useRef } from "react";
import Box from "@mui/material/Box";
import { useSceneEditorCore } from "../context/SceneEditorContext";

interface PerfData {
  fps: number;
  drawCalls: number;
  triangles: number;
  memMB: number;
}

export function PerformanceMonitor() {
  const core = useSceneEditorCore();
  const [perf, setPerf] = useState<PerfData>({ fps: 0, drawCalls: 0, triangles: 0, memMB: 0 });
  const [visible, setVisible] = useState(false);
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    let rafId: number;
    let intervalId: ReturnType<typeof setInterval>;

    // rAF 帧计数
    const countFrame = () => {
      frameCountRef.current++;
      rafId = requestAnimationFrame(countFrame);
    };
    rafId = requestAnimationFrame(countFrame);

    // 每秒采样一次
    intervalId = setInterval(() => {
      const now = performance.now();
      const elapsed = now - lastTimeRef.current;
      const fps = Math.round((frameCountRef.current * 1000) / elapsed);
      frameCountRef.current = 0;
      lastTimeRef.current = now;

      // Three.js renderer info
      let drawCalls = 0;
      let triangles = 0;
      const renderer = core?.getRenderer?.() ?? null;
      if (renderer) {
        const info = renderer.info;
        drawCalls = info.render.calls;
        triangles = info.render.triangles;
      }

      // JS 堆内存（Chromium only）
      let memMB = 0;
      const perfMem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      if (perfMem?.usedJSHeapSize) {
        memMB = Math.round(perfMem.usedJSHeapSize / 1024 / 1024);
      }

      setPerf({ fps, drawCalls, triangles, memMB });
      setVisible(true);
    }, 1000);

    return () => {
      cancelAnimationFrame(rafId);
      clearInterval(intervalId);
    };
  }, [core]);

  if (!visible || !import.meta.env.DEV) return null;

  const fpsColor = perf.fps >= 50 ? '#4caf50' : perf.fps >= 30 ? '#ff9800' : '#f44336';
  const dcColor = perf.drawCalls < 100 ? '#4caf50' : perf.drawCalls < 500 ? '#ff9800' : '#f44336';

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 8,
        right: 8,
        zIndex: 99999,
        bgcolor: 'rgba(0,0,0,0.75)',
        color: '#fff',
        borderRadius: 1,
        px: 1,
        py: 0.5,
        fontFamily: 'monospace',
        fontSize: 11,
        lineHeight: 1.6,
        pointerEvents: 'none',
        minWidth: 120,
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>FPS</span>
        <span style={{ color: fpsColor, fontWeight: 'bold' }}>{perf.fps}</span>
      </Box>
      {perf.drawCalls > 0 && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>DrawCall</span>
            <span style={{ color: dcColor }}>{perf.drawCalls}</span>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Tris</span>
            <span>{perf.triangles > 1000 ? `${(perf.triangles / 1000).toFixed(1)}k` : perf.triangles}</span>
          </Box>
        </>
      )}
      {perf.memMB > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Mem</span>
          <span>{perf.memMB}MB</span>
        </Box>
      )}
    </Box>
  );
}
