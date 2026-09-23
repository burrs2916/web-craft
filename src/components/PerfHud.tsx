import { useEffect, useRef, useState } from "react";

/**
 * 轻量 FPS 浮层（仅预览/发布模式显示，用于 4K 卡顿诊断）。
 * 用一个 rAF 计数，每秒 setState 一次，开销可忽略。
 */
export function PerfHud() {
  const [fps, setFps] = useState(0);
  const frames = useRef(0);
  const last = useRef(performance.now());

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      frames.current += 1;
      const now = performance.now();
      const dt = now - last.current;
      if (dt >= 1000) {
        setFps(Math.round((frames.current * 1000) / dt));
        frames.current = 0;
        last.current = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const color = fps >= 50 ? "#7CFFB2" : fps >= 30 ? "#FFD479" : "#FF6B6B";

  return (
    <div
      style={{
        position: "fixed",
        top: 8,
        right: 8,
        zIndex: 99999,
        padding: "4px 8px",
        borderRadius: 4,
        background: "rgba(0,0,0,0.6)",
        color,
        font: "12px ui-monospace, monospace",
        pointerEvents: "none",
        userSelect: "none",
        letterSpacing: 0.5,
      }}
    >
      FPS {fps}
    </div>
  );
}
