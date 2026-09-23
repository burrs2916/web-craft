import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

/**
 * datav 装饰族的「渲染尺寸来源」。
 *
 * 这批组件（13 边框 + 12 装饰 + 2 个雕花框）在编辑区依赖 `ResizeObserver` 量出容器像素尺寸，
 * 再据此生成 SVG 坐标。发布端（codegen）需要把**同一批组件**静态渲染成 HTML 字符串，
 * 此时没有浏览器测量 —— 于是由发布端把组件 transform 的宽高通过 Context 注入，
 * 组件内部照旧走同一个尺寸变量。
 *
 * 这样「编辑区看到的图形」与「发布产物里的图形」由**同一段几何代码**产出，
 * 不存在两份会漂移的字面量。编辑区不提供该 Context（值为 null）→ 继续走真实测量。
 */
export interface DatavRenderSize {
  width: number;
  height: number;
}

export const DatavRenderSizeContext = createContext<DatavRenderSize | null>(null);

/** 静态渲染时由发布端给出的尺寸；编辑区为 null */
export function useDatavRenderSize(): DatavRenderSize | null {
  return useContext(DatavRenderSizeContext);
}

export const DATAV_FALLBACK_SIZE: DatavRenderSize = { width: 400, height: 300 };

/**
 * 容器尺寸的唯一取用口：**发布端注入值优先，否则 ResizeObserver 实测**。
 * 抽出这一个 hook 是为了消灭此前三份逐字重复的测量代码（datavScalable /
 * ornamentalFrame / ornamentalDiamondFrame 各写了一遍）。
 */
export function useDatavBoxSize<T extends HTMLElement>(
  ref: RefObject<T | null>,
): DatavRenderSize {
  const override = useDatavRenderSize();
  const [size, setSize] = useState<DatavRenderSize>(DATAV_FALLBACK_SIZE);
  const measured = !override;

  useEffect(() => {
    if (!measured) return;
    const el = ref.current;
    if (!el) return;
    let raf: number | null = null;
    const update = () => {
      const w = el.clientWidth || DATAV_FALLBACK_SIZE.width;
      const h = el.clientHeight || DATAV_FALLBACK_SIZE.height;
      setSize((prev) =>
        Math.abs(prev.width - w) < 1 && Math.abs(prev.height - h) < 1
          ? prev
          : { width: w, height: h }
      );
    };
    const schedule = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [measured, ref]);

  return override ?? size;
}

/** 自建 ref 的便捷写法（datavScalable 各组件用） */
export function useDatavSizeRef<T extends HTMLElement>(): [RefObject<T | null>, DatavRenderSize] {
  const ref = useRef<T>(null);
  const size = useDatavBoxSize<T>(ref);
  return [ref, size];
}
