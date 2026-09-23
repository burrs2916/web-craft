/**
 * 脚手架工具函数 — 视图名转换、画布配置提取
 */

import type { SceneDSL, SceneView } from "../../types/scene";
import type { CanvasConfig } from "../../types/canvasConfig";
import type { CanvasBackground, SceneComponent } from "../../types/editor";
import { canvasBackgroundToStyle } from "../layout";
import type { ViewScaffold, ScaffoldContext, LayerScaffold } from "./types";

/**
 * 将 CanvasBackground 对象或字符串统一转为 CSS background 值（不含属性名）
 *
 * 返回纯值如 "#ffffff"、"linear-gradient(to bottom, #a, #b)"，
 * 生成器中用 `background: ${value};` 拼接。
 */
function backgroundToCSS(bg: CanvasBackground | string | undefined): string {
  if (!bg) return "#1a1a2e";
  if (typeof bg === "string") return bg;
  // canvasBackgroundToStyle 返回 "background: xxx" 或 "background-color: xxx"
  // 提取纯值部分，使生成器可以写 "background: ${value}"
  const css = canvasBackgroundToStyle(bg).css || "#1a1a2e";
  // 去掉 "background:" 或 "background-color:" 前缀
  const match = css.match(/^background(?:-color)?:\s*(.+)$/);
  if (match) return match[1];
  // 多属性情况（image），提取第一个 background 属性的值
  const firstPart = css.split(";")[0].trim();
  const multiMatch = firstPart.match(/^background(?:-\w+)?:\s*(.+)$/);
  if (multiMatch) return multiMatch[1];
  return css;
}

/**
 * 判断字符串是否为纯 ASCII
 */
function isAscii(s: string): boolean {
  return /^[\x00-\x7F]+$/.test(s);
}

/**
 * 将任意字符串转为 PascalCase
 * "home page" → "HomePage", "my-component" → "MyComponent"
 */
function toPascalCase(s: string): string {
  return s
    .split(/[\s\-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

/**
 * 将任意字符串转为 kebab-case
 * "Home Page" → "home-page", "MyComponent" → "my-component"
 */
function toKebabCase(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase())
    .join("-");
}

/**
 * 从视图名派生组件名和路由路径
 * - ASCII 名："首页" → 无法转换，用 Page1
 * - ASCII 名："Home" → Home, /home
 */
export function deriveViewInfo(view: SceneView, index: number, scene: SceneDSL): ViewScaffold {
  const canvasConfig = view.canvasConfig ?? scene.canvasConfig;
  const width = canvasConfig?.width ?? 1920;
  const height = canvasConfig?.height ?? 1080;
  const background = backgroundToCSS(canvasConfig?.background);
  const fontFamily = canvasConfig?.fontFamily ?? "system-ui, sans-serif";

  if (view.name && isAscii(view.name)) {
    const componentName = toPascalCase(view.name);
    const fileName = toKebabCase(view.name);
    const routePath = index === 0 ? "/" : `/${fileName}`;
    return {
      id: view.id,
      name: view.name,
      componentName,
      fileName,
      routePath,
      index,
      canvasWidth: width,
      canvasHeight: height,
      canvasBackground: background,
      canvasFontFamily: fontFamily,
    };
  }

  // 非 ASCII 名（中文等），用 Page{N} 命名
  const n = index + 1;
  return {
    id: view.id,
    name: view.name,
    componentName: `Page${n}`,
    fileName: `page-${n}`,
    routePath: index === 0 ? "/" : `/page-${n}`,
    index,
    canvasWidth: width,
    canvasHeight: height,
    canvasBackground: background,
    canvasFontFamily: fontFamily,
  };
}

/**
 * 从 SceneDSL 提取所有视图的脚手架信息
 */
export function deriveViews(scene: SceneDSL): ViewScaffold[] {
  const views = scene.views ?? [];
  if (views.length === 0) {
    // 兜底：无视图时生成一个默认首页
    return [deriveViewInfo(
      { id: "default", name: "Home", components: [], layers: [] },
      0,
      scene,
    )];
  }
  return views.map((v, i) => deriveViewInfo(v, i, scene));
}

/**
 * 从全局画布配置提取信息
 */
export function getGlobalCanvasConfig(scene: SceneDSL): {
  width: number;
  height: number;
  background: string;
  fontFamily: string;
} {
  const cfg: CanvasConfig | undefined =
    scene.views?.[0]?.canvasConfig ?? scene.canvasConfig;
  return {
    width: cfg?.width ?? 1920,
    height: cfg?.height ?? 1080,
    background: backgroundToCSS(cfg?.background),
    fontFamily: cfg?.fontFamily ?? "system-ui, sans-serif",
  };
}

/**
 * 从 SceneDSL 构建脚手架上下文
 *
 * projectName 保证是合法的 npm 包名（小写字母、数字、短横线）。
 * 中文场景名会被转为默认值 "web-craft-project"。
 */
export function buildContext(
  scene: SceneDSL,
  framework: ScaffoldContext["framework"],
  iconData?: Record<string, string>,
): ScaffoldContext {
  const rawName = scene.name || "web-craft-project";
  // 转为合法 npm 包名：只保留 a-z0-9，其余替换为短横线，去掉首尾短横线
  const projectName = rawName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "web-craft-project";

  return {
    scene,
    framework,
    projectName,
    projectDescription: scene.description || "",
    iconData,
  };
}

/**
 * HTML 转义
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 从 HTML 中提取内联 <script> 标签内容
 *
 * React/Vue/Angular 使用 dangerouslySetInnerHTML/v-html/[innerHTML] 注入组件 HTML，
 * 这些方式不会执行 <script> 标签。需要将脚本提取出来单独注入。
 *
 * @returns 清理后的 HTML（不含 script 标签）+ 提取出的脚本内容数组
 */
export function extractInlineScripts(
  html: string,
  opts: { keepExternal?: boolean } = {},
): { html: string; scripts: string[]; external: string[] } {
  const scripts: string[] = [];
  const external: string[] = [];
  // 匹配 <script>...</script>（含属性）和 <style>...</style>
  // 只提取 script，保留 style
  const cleaned = html.replace(
    /<script\b[^>]*>([\s\S]*?)<\/script>/gi,
    (match: string, content: string) => {
      const trimmed = content.trim();
      const isExternal = /<script\b[^>]*\bsrc=/i.test(match);
      if (isExternal) {
        // 外链 script（如 echarts CDN）：keepExternal 时保留在 HTML 中（静态页可直接执行）；
        // 否则收集到 external 由框架层注入 index.html（v-html/innerHTML 不执行 script）
        if (opts.keepExternal) return match;
        external.push(match);
        return '';
      }
      if (trimmed) {
        scripts.push(trimmed);
      }
      return ''; // 移除 script 标签
    },
  );
  return { html: cleaned, scripts, external };
}

/**
 * 从脚本数组中提取共享交互脚本（带 __wc*Init 防重标记）
 *
 * navbar/sidebar/tabs/pane/anchor/modal/drawer 等公共交互脚本均以
 * `(function(){if(window.__wcXxxInit)return;window.__wcXxxInit=true;...})()`
 * IIFE 形式生成。受让每视图独立的 ctx.pageScripts 影响，跨视图会各自携带
 * 同一份逻辑（如 navbar 脚本在 N 个视图出现 N 次）。
 *
 * 此处按防重标记名去重：
 * - shared：全站唯一的公共交互脚本（生成 src/scripts/shared-ui.js）
 * - rest：视图特有/组件特有脚本（auth 登录流程、自定义逻辑等），
 *   留在各页 page-scripts-{view}.js 中（scaffold 三框架）
 *
 * @param scripts 单个视图的页面脚本数组
 * @returns shared 为去重后的共享脚本；rest 为其余脚本（保持原顺序）
 */
const SHARED_INIT_MARKER_RE = /__wc[A-Za-z]+Init/;

export function extractSharedScripts(scripts: string[]): { shared: string[]; rest: string[] } {
  const shared: string[] = [];
  const rest: string[] = [];
  const seen = new Set<string>();
  for (const s of scripts) {
    const marker = s.match(SHARED_INIT_MARKER_RE)?.[0];
    if (marker) {
      // 共享脚本：同一标记只保留第一份（其余跨视图重复丢弃）
      if (!seen.has(marker)) {
        seen.add(marker);
        shared.push(s);
      }
    } else {
      // 视图特有脚本：原样保留
      rest.push(s);
    }
  }
  return { shared, rest };
}

/**
 * 从视图派生图层脚手架信息
 *
 * 将 SceneView 中的 layers（LayerNode[]）和 components（按 layerId 分组）
 * 转换为 LayerScaffold[]，供脚手架生成器按图层拆分代码。
 *
 * 规则：
 * - 图层名 ASCII → PascalCase 组件名 / kebab-case 文件名
 * - 图层名非 ASCII（中文等）→ Layer{N} / layer-{n}
 * - 不可见图层或无组件的图层仍保留（生成空占位或跳过由生成器决定）
 * - 嵌套图层（group 类型有 children）在此处扁平化处理
 *
 * @returns LayerScaffold[]，按 order 升序排列。当视图只有 0-1 个图层时返回空数组（表示无需分层）。
 */
export function deriveLayers(view: SceneView): LayerScaffold[] {
  const layers = view.layers ?? [];
  if (layers.length <= 1) return [];

  // 按组件的 layerId 分组
  const componentsByLayer = new Map<string, SceneComponent[]>();
  for (const comp of view.components ?? []) {
    const list = componentsByLayer.get(comp.layerId) ?? [];
    list.push(comp);
    componentsByLayer.set(comp.layerId, list);
  }

  // 按 order 排序
  const sorted = [...layers].sort((a, b) => a.order - b.order);

  let nonAsciiIndex = 0;
  return sorted.map((layer) => {
    if (layer.name && isAscii(layer.name)) {
      const componentName = toPascalCase(layer.name);
      const fileName = toKebabCase(layer.name);
      return {
        id: layer.id,
        name: layer.name,
        componentName,
        fileName,
        order: layer.order,
        visible: layer.visible,
        opacity: layer.opacity,
        components: componentsByLayer.get(layer.id) ?? [],
        isDefault: layer.isDefault ?? false,
        isBackground: layer.isBackground ?? false,
      };
    }

    // 非 ASCII 名（中文等），用 Layer{N} 命名
    nonAsciiIndex++;
    return {
      id: layer.id,
      name: layer.name,
      componentName: `Layer${nonAsciiIndex}`,
      fileName: `layer-${nonAsciiIndex}`,
      order: layer.order,
      visible: layer.visible,
      opacity: layer.opacity,
      components: componentsByLayer.get(layer.id) ?? [],
      isDefault: layer.isDefault ?? false,
      isBackground: layer.isBackground ?? false,
    };
  });
}

/**
 * 外部脚本按 src 去重（echarts CDN 等每页/每站只注入一次）
 */
export function dedupeExternalScripts(external: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of external) {
    const m = tag.match(/src=["']([^"']+)["']/i);
    const key = m ? m[1] : tag;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}
