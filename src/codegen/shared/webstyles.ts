/**
 * 共享样式架构 · 生成器
 *
 * 让四种发布模板（static-html / vue / react / angular）产出遵循"CSS/JS/HTML 分离"的
 * 统一样式：全局 reset + 设计 token（CSS 变量），页面级画布样式抽成独立 .css 类，
 * 而非内联在组件模板里。
 *
 * 架构分层（与编辑器四大工具映射）：
 *   画布 canvas  → :root 设计 token + 全局 reset（--wc-canvas-width/height/background）
 *   视图 view     → .page/.page-{name} 页面画布样式类
 *   图层/组件     → 由各组件自己的 html + 事件/数据模块承载（引擎 codegen 生成）
 */

/** 全局设计 token + reset：画布维度 → CSS 变量 */
export function buildGlobalCSSTokens(opts: {
  width: number;
  height: number;
  fontFamily: string;
  background: string;
}): string {
  return [
    `/* web-craft · 全局样式（CSS/JS/HTML 分离架构：样式统一在此层收敛） */`,
    `:root {`,
    `  /* 画布设计稿尺寸（canvasConfig） */`,
    `  --wc-canvas-width: ${opts.width}px;`,
    `  --wc-canvas-height: ${opts.height}px;`,
    `  --wc-font-family: ${opts.fontFamily};`,
    `  --wc-page-background: ${opts.background};`,
    `}`,
  ].join("\n");
}

/** 全局 reset：跨模板复用，统一视觉基线 */
export function buildGlobalResetCSS(opts: {
  fontFamily: string;
  background: string;
}): string {
  return [
    `* {`,
    `  margin: 0;`,
    `  padding: 0;`,
    `  box-sizing: border-box;`,
    `}`,
    ``,
    `html, body {`,
    `  width: 100%;`,
    `  min-height: 100%;`,
    `}`,
    ``,
    `body {`,
    `  font-family: ${opts.fontFamily};`,
    `  background: ${opts.background};`,
    `  -webkit-font-smoothing: antialiased;`,
    `  -moz-osx-font-smoothing: grayscale;`,
    `  overflow-x: hidden;`,
    `}`,
    ``,
    `a {`,
    `  color: inherit;`,
    `  text-decoration: none;`,
    `}`,
  ].join("\n");
}

/** 页面级画布样式：视图维度 → .page-{name} 类。返回独立 CSS 片段 */
export function buildPageCSS(opts: {
  name: string;
  width: number;
  height: number;
  background: string;
}): string {
  return [
    `/* ${opts.name} 页面画布（视图级样式，从组件模板内联样式抽离） */`,
    `.page-${opts.name} {`,
    `  position: relative;`,
    `  width: ${opts.width}px;`,
    `  height: ${opts.height}px;`,
    `  background: ${opts.background};`,
    `  overflow: hidden;`,
    `  transform-origin: top left;`,
    `}`,
  ].join("\n");
}

/** 通用 .page 缩放/定位样式（配合 viewport 等比适配脚本） */
export function buildPageBaseCSS(): string {
  return [
    `.page {`,
    `  position: relative;`,
    `  margin: 0 auto;`,
    `  transform-origin: top center;`,
    `}`,
  ].join("\n");
}

/** 图层容器样式：图层维度 → .layer-{name} 类 */
export function buildLayerCSS(opts: { name: string; opacity: number }): string {
  const lines: string[] = [
    `/* 图层 ${opts.name}（图层维度样式，从组件内联抽离） */`,
    `.layer-${opts.name} {`,
    `  position: absolute;`,
    `  inset: 0;`,
    `  pointer-events: none;`,
  ];
  if (opts.opacity !== 1) lines.push(`  opacity: ${opts.opacity};`);
  lines.push(`}`, ``);
  return lines.join("\n");
}