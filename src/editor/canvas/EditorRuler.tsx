import React, { memo, useRef, useEffect, useCallback } from "react";
import Ruler from "@scena/react-ruler";
import { useTheme } from "@mui/material/styles";
import Box from "@mui/material/Box";

const RULER_SIZE = 20;

interface EditorRulerProps {
  /** 滚动容器的 ref，标尺从此读取 scrollLeft/scrollTop */
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  /** 画布内容区的 ref，用于计算画布原点偏移 */
  canvasContentRef: React.RefObject<HTMLDivElement>;
  /** 缩放比例 */
  zoom: number;
  /** 是否显示标尺 */
  rulerVisible?: boolean;
  children: React.ReactNode;
}

/**
 * 标尺包裹组件：在顶部和左侧渲染标尺条带，追踪滚动容器的 scrollLeft/scrollTop。
 *
 * 核心原理：
 *   react-ruler 的刻度位置 = (value - scrollPos) * zoom
 *   当 value=0 时，0 刻度的像素位置 = -scrollPos * zoom
 *   我们希望 0 刻度对齐画布 0 原点，即：
 *     -scrollPos * zoom = canvasRect.left - containerRect.left
 *     scrollPos = (containerRect.left - canvasRect.left) / zoom
 *
 * 驱动方式：
 *   不用 scrollPos prop（React prop 更新链路有时序问题），
 *   改用 Ruler 实例的 scroll() 方法直接驱动，更可靠。
 */
const EditorRulerInner: React.FC<EditorRulerProps> = memo(({
  scrollContainerRef,
  canvasContentRef,
  zoom,
  rulerVisible = true,
  children,
}) => {
  const rulerXRef = useRef<Ruler | null>(null);
  const rulerYRef = useRef<Ruler | null>(null);
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const offset = rulerVisible ? RULER_SIZE : 0;

  // 用 ref 持有最新 zoom，避免 scroll 事件监听因 zoom 变化而频繁重绑定
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  /**
   * 计算画布原点偏移并直接驱动 Ruler 实例。
   * 用 requestAnimationFrame 确保在浏览器完成布局后读取位置。
   */
  const updateRulers = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const z = zoomRef.current;
    const canvas = canvasContentRef.current;

    let scrollX: number;
    let scrollY: number;

    if (canvas) {
      // 通过 getBoundingClientRect 计算画布原点(0,0)相对于容器左上角的偏移
      // 这样标尺 0 刻度始终对齐画布 0 原点，不受弹性 spacer 居中影响
      const containerRect = container.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      scrollX = (containerRect.left - canvasRect.left) / z;
      scrollY = (containerRect.top - canvasRect.top) / z;
    } else {
      // 画布内容区尚未渲染，退回简单滚动偏移
      scrollX = container.scrollLeft / z;
      scrollY = container.scrollTop / z;
    }

    // 直接调用 Ruler 实例方法，绕过 React prop 更新链路
    rulerXRef.current?.scroll(scrollX, z);
    rulerYRef.current?.scroll(scrollY, z);
  }, [scrollContainerRef, canvasContentRef]);

  // 滚动事件监听
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || !rulerVisible) return;
    const handler = () => updateRulers();
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, [scrollContainerRef, rulerVisible, updateRulers]);

  // zoom 变化时用 RAF 延迟一帧，确保画布已完成 scale 变换后的布局
  useEffect(() => {
    if (!rulerVisible) return;
    const raf = requestAnimationFrame(() => updateRulers());
    return () => cancelAnimationFrame(raf);
  }, [zoom, rulerVisible, updateRulers]);

  // 组件挂载后延迟更新（等画布渲染完成 + zoomToFit + centerCanvas 完成）
  useEffect(() => {
    if (!rulerVisible) return;
    const t1 = setTimeout(() => updateRulers(), 100);
    // 二次保险：300ms 后再更新一次，覆盖 zoomToFit + centerCanvas 的异步链路
    const t2 = setTimeout(() => updateRulers(), 300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [rulerVisible, updateRulers]);

  // ResizeObserver：容器或画布尺寸变化时画布会重新居中（margin:auto），
  // 0 刻度位置随之偏移，需要重新对齐。
  // 画布尺寸变化（断点切换宽度、高度自适应）不触发 scroll 事件，必须单独监听；
  // 初次 observe 的首次回调也覆盖画布晚挂载的场景。
  useEffect(() => {
    if (!rulerVisible) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      // 延迟一帧，等 flex 布局重新计算完
      requestAnimationFrame(() => updateRulers());
    });
    ro.observe(el);
    const canvas = canvasContentRef.current;
    if (canvas) ro.observe(canvas);
    return () => ro.disconnect();
  }, [scrollContainerRef, canvasContentRef, rulerVisible, updateRulers]);

  if (!rulerVisible) {
    return (
      <Box sx={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
        {children}
      </Box>
    );
  }

  // 标尺单位：缩放越小，刻度间距越大
  const unit = Math.max(50, Math.floor(50 / zoom));

  const bgColor = isDark ? "#1E1E2F" : "#f5f5f5";
  const borderColor = isDark ? "#3A3A4E" : "#ddd";
  const lineColor = isDark ? "#3A3A4E" : "#ccc";
  const textColor = isDark ? "#A0A0B2" : "#666";

  return (
    <Box
      sx={{
        position: "relative",
        width: "100%",
        height: "100%",
        backgroundColor: bgColor,
        overflow: "hidden",
      }}
    >
      {/* 左上角块 */}
      <Box
        sx={{
          position: "absolute",
          width: offset,
          height: offset,
          color: textColor,
          textAlign: "center",
          fontSize: 10,
          top: 0,
          left: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: bgColor,
          borderBottom: `1px solid ${borderColor}`,
          borderRight: `1px solid ${borderColor}`,
          zIndex: 10,
        }}
      >
        px
      </Box>

      {/* 水平标尺 */}
      <Box
        sx={{
          position: "absolute",
          top: 0,
          left: offset,
          right: 0,
          height: offset,
          backgroundColor: bgColor,
          borderBottom: `1px solid ${borderColor}`,
          zIndex: 5,
          overflow: "hidden",
        }}
      >
        <Ruler
          ref={rulerXRef}
          type="horizontal"
          zoom={zoom}
          unit={unit}
          segment={2}
          negativeRuler={true}
          defaultScrollPos={0}
          lineColor={lineColor}
          textColor={textColor}
          backgroundColor="transparent"
          textOffset={[0, 10]}
          style={{ width: "100%", height: "100%" }}
        />
      </Box>

      {/* 垂直标尺 */}
      <Box
        sx={{
          position: "absolute",
          top: offset,
          left: 0,
          width: offset,
          bottom: 0,
          backgroundColor: bgColor,
          borderRight: `1px solid ${borderColor}`,
          zIndex: 5,
          overflow: "hidden",
        }}
      >
        <Ruler
          ref={rulerYRef}
          type="vertical"
          zoom={zoom}
          unit={unit}
          segment={2}
          negativeRuler={true}
          defaultScrollPos={0}
          lineColor={lineColor}
          textColor={textColor}
          backgroundColor="transparent"
          textOffset={[10, 0]}
          style={{ width: "100%", height: "100%" }}
        />
      </Box>

      {/* 滚动内容区 */}
      <Box
        sx={{
          position: "absolute",
          top: offset,
          left: offset,
          right: 0,
          bottom: 0,
          overflow: "hidden",
        }}
      >
        {children}
      </Box>
    </Box>
  );
});

EditorRulerInner.displayName = "EditorRuler";

export const EditorRuler = EditorRulerInner;
