import { useRef, useEffect, useState, useCallback } from "react";
import Box from "@mui/material/Box";
import type { ComponentRendererProps } from "../../types/editor";
import { DecorationWrapper } from "./DecorationWrapper";
import { getTitleFrameConfig, useFrameUid } from "./TitleFramePrimitives";

/**
 * 顶部光晕标题框 — 大屏版（克制 · 科技感 · 渐变色 + 发光）
 *
 * 视觉结构（上下双线包夹文字，冷静、克制）：
 *  ┌────────────────────────────────────────────────┐
 *  │                                                │
 *  │  ◆═══════════════════════════════════════◆  ← 上主线：渐变填充 + glow  │
 *  │              巷道喷雾降尘智能监控大屏            ← 主文字：描边 + 发光     │
 *  │  ────────────────────────────────────────────  ← 下副线：细弱渐变       │
 *  │                                                │
 *  └────────────────────────────────────────────────┘
 *
 * 元素（5 个核心部件，全部静态，无持续动画）：
 *  1. 上主线（linearGradient：左透明 → 中亮 → 右透明，stroke + glow）
 *  2. 文字描边层（深色 paintOrder=stroke）
 *  3. 文字填充层（亮色 + filter glow）
 *  4. 下副线（细弱渐变，与上主线呼应）
 *  5. 一次性入场淡入（0.6s，不重复）
 *
 * 颜色动画 = 渐变色填充（linearGradient），不是持续闪烁/呼吸
 * 多余元素（菱形端帽、中心装饰菱形、流光带、持续脉冲、呼吸）已全部删除
 */

// endCapStyle / centerDecor 已硬编码为 none，不再需要类型


export function TopGlowTitleFrameRenderer({ config, width: propW, height: propH }: ComponentRendererProps) {
  const fc = getTitleFrameConfig(config);
  const uid = useFrameUid();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: propW ?? 400, h: propH ?? 42 });
  const [mounted, setMounted] = useState(false);

  const measure = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setDims({ w: rect.width, h: rect.height });
      }
    }
  }, []);

  useEffect(() => {
    measure();
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const W = propW && propW > 0 ? propW : dims.w;
  const H = propH && propH > 0 ? propH : dims.h;

  // ─── 排版 ───
  const text = (config.text as string) ?? "标题";
  const textColor = (config.color as string) || "#ffffff";
  const baseFontSize = (config.fontSize as number) ?? 24;
  const fontSize = Math.max(14, Math.min(baseFontSize, H * 0.5));
  const letterSpacing = (config.letterSpacing as number) ?? 0;
  const textStrokeColor = (config.textStrokeColor as string) || "#0a1f3d";
  const textStrokeWidth = (config.textStrokeWidth as number) ?? 2;
  const textGlowEnabled = (config.textGlowEnabled as boolean) ?? true;
  const textGlowIntensity = (config.textGlowIntensity as number) ?? 2.5;
  // 文字发光色（独立于文字填充色），默认用 textColor 兜底
  const textGlowColor = (config.textGlowColor as string) || textColor;

  // 端帽/中心装饰已硬编码为 none，不再渲染（彻底消除 3 个菱形光斑）

  // ─── 几何与下副线参数 ───
  const linePositionPct = (config.linePosition as number) ?? 22;
  const lineLength = (config.lineLength as number) ?? 90;
  const subLineEnabled = (config.subLineEnabled as boolean) ?? true;
  const subLineOpacity = (config.subLineOpacity as number) ?? 0.25;
  const subLinePositionPct = (config.subLinePosition as number) ?? 75;

  // ─── 发光 ───
  const glowEnabled = fc.glowEnabled;
  const sw = fc.strokeWidth;
  const glowIntensity = (config.glowIntensity as number) ?? fc.strokeWidth;

  // 顶部主标题栏边框（仅 comp_*_1 经迁移写入 borderEnabled=true 时绘制；
  // 非侵入式：comp_*_2/3/4 等子标题栏不受影响）。朴素静态描边矩形，无霓虹辉光/闪烁——
  // 用户明确要求"简单边框即可"，克制、统一冷色描边。
  const showBorder = (config.borderEnabled as boolean) ?? false;
  const borderInset = 4;

  // 几何计算 — 上下双线对称分布在文字两侧
  const upLineY = (linePositionPct / 100) * H;
  const downLineY = (subLinePositionPct / 100) * H;
  const cx = W / 2;
  const halfLen = (lineLength / 100) * (W / 2);
  const upLineStartX = Math.max(0, cx - halfLen);
  const upLineEndX = Math.min(W, cx + halfLen);

  // 文字 y = 上下主线中点（被双线"包夹"）
  const textY = (upLineY + downLineY) / 2;

  // id
  const gradId = `tf-tg-grad-${uid}`;
  const grad2Id = `tf-tg-grad2-${uid}`;
  const glowId = `tf-tg-glow-${uid}`;
  const textGlowId = `tf-tg-textglow-${uid}`;
  const clipId = `tf-tg-clip-${uid}`;
  // 4K 性能：廉价发光（默认开），用宽半透明描边/文字模拟光晕，避免 feGaussianBlur CPU 光栅化
  const cheapGlow = (config.cheapGlow as boolean) ?? true;

  // 一次性入场淡入（不循环）
  const fadeInStyle = mounted ? {
    animation: `deco-tf-tg-fadein-${uid} 0.6s ease-out both`,
  } : { opacity: 0 };

  // 端帽/中心装饰已硬编码为 none，不再渲染

  // 上主线（渐变填充 + glow，butt linecap 避免 round 端点被 glow 模糊成光斑）
  const renderMainLine = () => {
    if (cheapGlow) {
      // 廉价外发光：宽半透明描边模拟光晕，4K/WKWebView 下不触发 feGaussianBlur CPU 光栅化
      return (
        <g>
          <line
            x1={upLineStartX} y1={upLineY} x2={upLineEndX} y2={upLineY}
            stroke={fc.glowColor} strokeWidth={sw * 1.8 * 3} strokeLinecap="butt" opacity={0.22}
          />
          <line
            x1={upLineStartX} y1={upLineY} x2={upLineEndX} y2={upLineY}
            stroke={`url(#${gradId})`} strokeWidth={sw * 1.8} strokeLinecap="butt"
          />
        </g>
      );
    }
    const filterAttr = glowEnabled ? `url(#${glowId})` : undefined;
    return (
      <line
        x1={upLineStartX} y1={upLineY} x2={upLineEndX} y2={upLineY}
        stroke={`url(#${gradId})`} strokeWidth={sw * 1.8} strokeLinecap="butt"
        filter={filterAttr}
      />
    );
  };

  // 下副线（细弱渐变，butt linecap）
  const renderSubLine = () => {
    if (!subLineEnabled) return null;
    if (downLineY > H - 2 || downLineY < 2) return null;
    return (
      <line
        x1={upLineStartX + (upLineEndX - upLineStartX) * 0.1}
        y1={downLineY} x2={upLineEndX - (upLineEndX - upLineStartX) * 0.1} y2={downLineY}
        stroke={`url(#${grad2Id})`} strokeWidth={Math.max(0.5, sw * 0.5)}
        strokeLinecap="butt" opacity={subLineOpacity}
      />
    );
  };

  return (
    <DecorationWrapper config={config}>
      <Box ref={containerRef} sx={{ width: "100%", height: "100%", opacity: fc.opacity, overflow: "visible" }}>
        <style>{`
          @keyframes deco-tf-tg-fadein-${uid} {
            0% { opacity: 0; }
            100% { opacity: 1; }
          }
        `}</style>
        <svg width="100%" height="100%" style={{ overflow: "visible" }}>
          <defs>
            {/* 上主线渐变（左透明 → 中亮 → 右透明，这就是"颜色动画"的科技感来源） */}
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={fc.stroke} stopOpacity="0" />
              <stop offset="15%" stopColor={fc.stroke} stopOpacity="0.5" />
              <stop offset="50%" stopColor={fc.stroke} stopOpacity="1" />
              <stop offset="85%" stopColor={fc.stroke} stopOpacity="0.5" />
              <stop offset="100%" stopColor={fc.stroke} stopOpacity="0" />
            </linearGradient>
            {/* 下副线渐变（更淡） */}
            <linearGradient id={grad2Id} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={fc.stroke} stopOpacity="0" />
              <stop offset="20%" stopColor={fc.stroke} stopOpacity="0.15" />
              <stop offset="50%" stopColor={fc.stroke} stopOpacity="0.25" />
              <stop offset="80%" stopColor={fc.stroke} stopOpacity="0.15" />
              <stop offset="100%" stopColor={fc.stroke} stopOpacity="0" />
            </linearGradient>
            {/* 主线 glow（颜色由 glowColor 控制，强度由 glowIntensity 控制）；cheapGlow 时不创建滤镜 */}
            {glowEnabled && !cheapGlow && (
              <filter id={glowId} x="-15%" y="-200%" width="130%" height="500%">
                <feGaussianBlur stdDeviation={Math.max(0.8, glowIntensity * 0.4)} result="blur1" />
                <feFlood floodColor={fc.glowColor} floodOpacity="0.85" result="flood" />
                <feComposite in="flood" in2="blur1" operator="in" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            )}
            {/* 文字 glow（颜色由 textGlowColor 控制，强度由 textGlowIntensity 动态影响 floodOpacity）；cheapGlow 时不创建滤镜 */}
            {textGlowEnabled && textGlowIntensity > 0 && !cheapGlow && (() => {
              // intensity: 0~8 → floodOpacity: 0.3~1.0（让强度变化真实可见）
              const intensity = Math.max(0, Math.min(8, textGlowIntensity));
              const floodOp = 0.3 + (intensity / 8) * 0.7;
              return (
                <filter id={textGlowId} x="-15%" y="-50%" width="130%" height="200%">
                  <feGaussianBlur stdDeviation={intensity * 0.4} result="tg-b1" />
                  <feFlood floodColor={textGlowColor} floodOpacity={floodOp} result="tg-flood" />
                  <feComposite in="tg-flood" in2="tg-b1" operator="in" result="tg-glow" />
                  <feMerge>
                    <feMergeNode in="tg-glow" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              );
            })()}
            <clipPath id={clipId}>
              <rect x={0} y={0} width={W} height={H} />
            </clipPath>
          </defs>

          <g clipPath={`url(#${clipId})`} style={fadeInStyle}>
            {/* 0) 顶部主标题栏矩形边框（朴素静态描边，无霓虹辉光/闪烁，4K 安全） */}
            {showBorder && (
              <rect
                x={borderInset}
                y={borderInset}
                width={Math.max(0, W - borderInset * 2)}
                height={Math.max(0, H - borderInset * 2)}
                rx={6}
                ry={6}
                fill="none"
                stroke={fc.stroke}
                strokeWidth={sw}
              />
            )}

            {/* 1) 上主线（渐变填充 + glow） */}
            {renderMainLine()}

            {/* 2) 下副线（细弱渐变） */}
            {renderSubLine()}

            {/* 5) 主文字（描边层） */}
            {textStrokeWidth > 0 && (
              <text
                x={cx} y={textY}
                fill="none" stroke={textStrokeColor}
                strokeWidth={textStrokeWidth} strokeLinejoin="round" paintOrder="stroke"
                fontSize={fontSize} fontWeight={800}
                textAnchor="middle" dominantBaseline="central"
                letterSpacing={letterSpacing}
                style={{ userSelect: "none", fontFamily: "'Microsoft YaHei', 'PingFang SC', sans-serif" }}
              >
                {text}
              </text>
            )}

            {/* 6) 主文字（填充层 + glow） */}
            {cheapGlow && textGlowEnabled && (
              <text
                x={cx} y={textY}
                fill={textGlowColor} fontSize={fontSize} fontWeight={800}
                textAnchor="middle" dominantBaseline="central"
                letterSpacing={letterSpacing} opacity={0.3}
                style={{ userSelect: "none", fontFamily: "'Microsoft YaHei', 'PingFang SC', sans-serif" }}
              >
                {text}
              </text>
            )}
            <text
              x={cx} y={textY}
              fill={textColor}
              fontSize={fontSize} fontWeight={800}
              textAnchor="middle" dominantBaseline="central"
              letterSpacing={letterSpacing}
              filter={!cheapGlow && textGlowEnabled && textGlowIntensity > 0 ? `url(#${textGlowId})` : undefined}
              style={{ userSelect: "none", fontFamily: "'Microsoft YaHei', 'PingFang SC', sans-serif" }}
            >
              {text}
            </text>
          </g>
        </svg>
      </Box>
    </DecorationWrapper>
  );
}
