/**
 * LazyVisible — 视口懒渲染容器
 *
 * 用 IntersectionObserver 检测是否进入视口，
 * 未进入时渲染轻量占位（保持相同尺寸避免布局抖动），
 * 进入后才渲染真实的重量级子内容。
 *
 * 用于设备列表等含大量重量级 SVG 渲染的长列表，
 * 显著减少初始渲染与滚动时的绘制开销（等效虚拟化的核心收益，
 * 但不破坏现有分组/折叠结构，零新依赖）。
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import Box from "@mui/material/Box";

interface LazyVisibleProps {
  children: ReactNode;
  /** 占位尺寸，需与真实内容一致以避免布局抖动 */
  width: number | string;
  height: number | string;
  /** 提前加载的视口外边距（px），默认 200 */
  rootMargin?: number;
  /** 一旦可见就保持渲染（默认 true），false 则离开视口后卸载 */
  keepMounted?: boolean;
  /** 占位内容（默认空 Box） */
  placeholder?: ReactNode;
}

export function LazyVisible({
  children,
  width,
  height,
  rootMargin = 200,
  keepMounted = true,
  placeholder,
}: LazyVisibleProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 不支持 IntersectionObserver 时降级为直接渲染
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            if (keepMounted) observer.disconnect();
          } else if (!keepMounted) {
            setVisible(false);
          }
        }
      },
      { rootMargin: `${rootMargin}px` },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin, keepMounted]);

  return (
    <Box ref={ref} sx={{ width, height, flexShrink: 0 }}>
      {visible ? children : placeholder ?? null}
    </Box>
  );
}
