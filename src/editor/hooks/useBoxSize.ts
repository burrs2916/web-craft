import { useEffect, useRef, useState } from "react";

/**
 * 测量容器实际尺寸（编辑区）。
 *
 * 用途：表格族中「内容有自然尺寸」的组件（分页等）需要按拖动框的实际尺寸算等比缩放
 * 系数（`editor/data/scaleFit.ts` 的 `fitFactor`），与发布端 `codegen/scaleFit.ts` 的
 * `scaleFitScript`（读 `clientWidth/clientHeight` + ResizeObserver）严格同源。
 *
 * 为什么必须实测而不是直接用 props 的 width/height：组件可能被包在带内边距/标签的
 * 外壳里，真正决定缩放的是内容所在的那一层；发布端测量的也是那一层。
 * 挂 ref 的位置必须与发布端脚本挂载测量器的位置一致，否则两端系数不同。
 */
export function useBoxSize(initial?: { w?: number; h?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({
    w: initial?.w ?? 0,
    h: initial?.h ?? 0,
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, w: size.w, h: size.h };
}
