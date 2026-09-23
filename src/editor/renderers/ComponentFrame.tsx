import { memo } from "react";
import { RegionFrameRenderer } from "./RegionFrameRenderer";
import type { ComponentRendererProps } from "../../types/editor";

/**
 * 组件级边框装饰覆盖层
 *
 * 旧方案用独立的底部数据边框组件（comp_*_12_frame）去"包"内容组件；
 * 新方案（2026-08-22）改为：每个内容组件自带边框装饰（边框 / 四角 / 发光 / 动画 / 流光），
 * 由本组件作为绝对定位、pointer-events:none 的覆盖层绘制在组件自身之上。
 *
 * 直接复用 RegionFrameRenderer 的成熟画法（path 框线 + 四角 L + 发光 + 流光 + 呼吸/霓虹动画）。
 * 性能约束（4K/WKWebView）：组件级边框默认 cheapGlow=true，用宽半透明描边模拟外发光，
 * 不创建 feGaussianBlur 滤镜（WebKit 在 4K 下对 SVG 滤镜做 CPU 光栅化，是卡顿主因）。
 * 区域大框 36/37/38 不传 cheapGlow → 仍用真实 feGaussianBlur 发光。
 *
 * 本组件用 React.memo 包裹，且只依赖 component.config.frame（数据绑定改的是 config.data 等，
 * 不会改到 frame 的引用），因此实时数据每 tick 重渲染组件时，本边框层不重渲染、不重光栅。
 */

// 统一青蓝细线默认样式（与用户确认：#4fc3f7，细线 1.5 + 四角 + 发光 + 流光 + 呼吸）
export const DEFAULT_COMPONENT_FRAME: Record<string, unknown> = {
  enabled: true,
  stroke: "#4fc3f7",
  strokeWidth: 1.5,
  strokeDasharray: "",
  borderRadius: 8,
  cornerLength: 40,
  cornerThickness: 2.5,
  cornerSize: 12,
  cornerStyle: "rounded",
  showCornerDots: true,
  cornerDotSize: 4,
  glowEnabled: true,
  // 廉价外发光：用宽半透明描边模拟光晕，避免 4K 下 feGaussianBlur 的 CPU 光栅化卡顿
  cheapGlow: true,
  glowColor: "#4fc3f7",
  glowIntensity: 3,
  pulse: true,
  neonFlicker: false,
  flowLight: true,
  flowSpeed: 5000,
  // 贴边包裹内容：覆盖层直接贴在组件外框边缘，不再内缩 13px（组件级边框与区域大框 36/37/38 解耦）
  frameInset: 1.5,
  // 覆盖层不填充，避免遮挡内容
  fillColor: "rgba(79,195,247,0)",
  fillOpacity: 0,
  opacity: 1,
  // 不显示区域编号 / 标签（那是 region-frame 的职责）
  showIndex: false,
  showLabel: false,
  label: "",
  indexText: "01",
};

export interface ComponentFrameProps {
  // 只吃组件自身的 frame 配置（component.config.frame），数据 tick 不改它的引用 → memo 不破
  frameConfig?: Record<string, unknown>;
  componentId: string;
  width: number;
  height: number;
}

export const ComponentFrame = memo(function ComponentFrame({
  frameConfig,
  componentId,
  width,
  height,
}: ComponentFrameProps) {
  const frame = frameConfig;

  // 显式关闭则不绘制
  if (frame && frame["enabled"] === false) {
    return null;
  }

  // 合并默认样式与组件自有 frame 配置
  const merged: Record<string, unknown> = { ...DEFAULT_COMPONENT_FRAME, ...(frame ?? {}) };

  const props: ComponentRendererProps = {
    config: merged,
    componentId,
    width,
    height,
    mode: "preview",
  };

  return <RegionFrameRenderer {...props} />;
});
