/**
 * 纯 HTML 工程脚手架生成器
 *
 * 生成无需构建步骤的静态 HTML/CSS 工程：
 *   - index.html（首页）
 *   - pages/*.html（每个视图一个页面）
 *   - assets/css/style.css（全局样式）
 *   - assets/js/main.js（基础脚本）
 *
 * 无 package.json、无构建工具，直接用浏览器打开即可。
 */

import type { ProjectFile, ScaffoldContext, ScaffoldGenerator } from "./types";
import { deriveViews, getGlobalCanvasConfig, escapeHtml, deriveLayers, extractInlineScripts, extractSharedScripts } from "./utils";
import { generateViewBody, generateLayerHTML } from "./components";
import { generateEventsScript } from "./events";
import { generateDataScript } from "./data";
import { generateProjectGlobalConfigScript } from "./globalConfig";
import { buildViewportFitScript } from "../viewport";
import { buildPageCSS, buildLayerCSS } from "../shared/webstyles";
import { buildStaticHttpClientSource } from "../shared/apiClient";

export const generateStaticHtmlProject: ScaffoldGenerator = (ctx: ScaffoldContext): ProjectFile[] => {
  const { scene } = ctx;
  const views = deriveViews(scene);
  const canvas = getGlobalCanvasConfig(scene);
  const projectName = ctx.projectName;
  const projectDesc = ctx.projectDescription;

  const files: ProjectFile[] = [];

  // ── 全局样式 ──────────────────────────────────────────
  files.push({
    path: "assets/css/style.css",
    description: "全局样式",
    content: [
      `* {`,
      `  margin: 0;`,
      `  padding: 0;`,
      `  box-sizing: border-box;`,
      `}`,
      ``,
      `html, body {`,
      `  width: 100%;`,
      `  height: 100%;`,
      `  overflow-x: hidden;`,
      `}`,
      ``,
      `body {`,
      `  font-family: ${canvas.fontFamily};`,
      `  background: ${canvas.background};`,
      `  -webkit-font-smoothing: antialiased;`,
      `  -moz-osx-font-smoothing: grayscale;`,
      `}`,
      ``,
      `.page {`,
      `  position: relative;`,
      `  margin: 0;`,
      `  overflow: hidden;`,
      `  transform-origin: top left;`,
      `}`,
      ``,
      `a {`,
      `  color: inherit;`,
      `  text-decoration: none;`,
      `}`,
    ].join("\n"),
  });

  // ── 基础脚本 ──────────────────────────────────────────
  // 响应式等比铺满：固定宽度画布按 视口宽/设计宽 双向缩放（窄屏缩小、宽屏放大），
  // 任意视口宽度下整页铺满且不拉伸变形；由共享的 buildViewportFitScript 生成。
  files.push({
    path: "assets/js/main.js",
    description: "基础脚本",
    content: [
      `// ${projectName} - 静态站点脚本`,
      `// 由 web-craft 脚手架生成器自动生成`,
      ``,
      buildViewportFitScript(),
    ].join("\n"),
  });

  // ── assets/js/http.js（前后端分离 · 统一 http 客户端 + 拦截器）──
  // 无 ES module，IIFE 暴露 window.__wc_http，校验/相对路径/响应抽取统一走此层。
  files.push({
    path: "assets/js/http.js",
    description: "统一 http 客户端（fetch 封装 + 拦截器，暴露 window.__wc_http）",
    content: buildStaticHttpClientSource(),
  });

  // ── 每个视图一个 HTML 页面（含真实组件代码 + 事件脚本）──
  // 全站公共交互脚本收集（navbar/pane/anchor 等带 __wc*Init 标记，跨视图去重为一份）
  const allProjectScripts: string[] = [];
  for (const v of views) {
    const isIndex = v.index === 0;
    const filePath = isIndex ? "index.html" : `pages/${v.fileName}.html`;
    const cssPath = isIndex ? "assets/css/style.css" : "../assets/css/style.css";
    const pageCssPath = isIndex ? `assets/css/pages/${v.fileName}.css` : `../assets/css/pages/${v.fileName}.css`;
    const jsPath = isIndex ? "assets/js/main.js" : "../assets/js/main.js";
    const httpPath = isIndex ? "assets/js/http.js" : "../assets/js/http.js";
    const sharedUiPath = isIndex ? "assets/js/shared-ui.js" : "../assets/js/shared-ui.js";

    const sceneView = scene.views?.find((sv) => sv.id === v.id);
    const body = sceneView ? generateViewBody(sceneView, scene, ctx.iconData) : null;
    const componentHTML = body?.html ?? "";
    const componentStyles = body?.styles ?? [];
    const eventResult = generateEventsScript(body?.events ?? []);
    const dataResult = sceneView ? generateDataScript(sceneView, scene) : { hasData: false, inlineScript: "", module: "", bindingCount: 0 };

    // ── 图层感知模式 ──
    const layers = sceneView ? deriveLayers(sceneView) : [];
    const hasMultipleLayers = layers.length > 0;

    // 页面级 CSS 分离：画布(视图) + 各图层(图层维度) + 组件样式抽为独立 /pages/{name}.css
    const pageCss = [
      buildPageCSS({
        name: v.fileName,
        width: v.canvasWidth,
        height: v.canvasHeight,
        background: v.canvasBackground,
      }),
      ...(hasMultipleLayers
        ? layers.filter((l) => l.visible).map((l) => buildLayerCSS({ name: l.fileName, opacity: l.opacity }))
        : []),
      ...(componentStyles.length > 0 ? [``, ...componentStyles] : []),
    ].join("\n");
    // 页面专用样式文件（CSS/JS/HTML 分离）
    files.push({
      path: isIndex ? `assets/css/pages/${v.fileName}.css` : `assets/css/pages/${v.fileName}.css`,
      description: `页面样式（CSS/JS/HTML 分离）: ${v.name}`,
      content: pageCss,
    });

    let pageContent: string;
    if (hasMultipleLayers) {
      // 按图层生成语义化包装 div（定位/透明度样式已抽离到页面 CSS）
      const layerDivs = layers
        .filter((l) => l.visible)
        .map((layer) => {
          const layerHTML = generateLayerHTML(layer.id, sceneView!, scene, ctx.iconData);
          return `      <div class="layer layer-${layer.fileName}">\n        ${layerHTML}\n      </div>`;
        });
      pageContent = layerDivs.join("\n");
    } else {
      pageContent = componentHTML;
    }

    const globalConfigScript = generateProjectGlobalConfigScript(scene);

    // 公共交互脚本（navbar/pane/anchor 等）抽取到全站 assets/js/shared-ui.js，
    // 视图特有脚本（auth 流程、自定义逻辑）保持本页内联
    // 注意：navbar/sidebar 等组件的 __wc*Init 脚本拼在组件 HTML 内的 <script> 中，
    // 必须经 extractInlineScripts 提取后再与 body.scripts 合并。
    // 外链 <script src>（echarts CDN 等）keepExternal 保留在页面 HTML 中直接执行。
    const { html: cleanedHTML, scripts: inlineScripts } = extractInlineScripts(pageContent, { keepExternal: true });
    pageContent = cleanedHTML;
    const pageScripts = [...(body?.scripts ?? []), ...inlineScripts];
    allProjectScripts.push(...pageScripts);
    const { shared: pageSharedScripts, rest: pageRestScripts } = extractSharedScripts(pageScripts);

    files.push({
      path: filePath,
      description: `页面: ${v.name}`,
      content: [
        `<!DOCTYPE html>`,
        `<html lang="zh-CN">`,
        `  <head>`,
        `    <meta charset="UTF-8" />`,
        `    <meta name="viewport" content="width=device-width, initial-scale=1.0" />`,
        `    <meta name="description" content="${escapeHtml(projectDesc)}" />`,
        `    <title>${escapeHtml(v.name)} - ${escapeHtml(projectName)}</title>`,
        `    <link rel="stylesheet" href="${cssPath}" />`,
        `    <link rel="stylesheet" href="${pageCssPath}" />`,
        ...(globalConfigScript ? [globalConfigScript] : []),
        `  </head>`,
        `  <body>`,
        `    <div class="page page-${v.fileName}" data-design-width="${v.canvasWidth}" data-design-height="${v.canvasHeight}">`,
        pageContent,
        `    </div>`,
        `    <script src="${jsPath}"></script>`,
        `    <script src="${httpPath}"></script>`,
        ...(pageSharedScripts.length > 0
          ? [`    <script src="${sharedUiPath}"></script>`]
          : []),
        ...(pageRestScripts.length > 0
          ? pageRestScripts.map((s) => `    <script>\n${s}\n    </script>`)
          : []),
        ...(dataResult.hasData
          ? [`    <script>`, dataResult.inlineScript, `    </script>`]
          : []),
        ...(eventResult.hasEvents
          ? [`    <script>`, eventResult.inlineScript, `    </script>`]
          : []),
        `  </body>`,
        `</html>`,
      ].join("\n"),
    });
  }

  // ── assets/js/shared-ui.js（全站公共交互脚本，按 __wc*Init 标记去重）──
  const projectSharedScripts = extractSharedScripts(allProjectScripts).shared;
  if (projectSharedScripts.length > 0) {
    files.push({
      path: "assets/js/shared-ui.js",
      description: "公共交互脚本（全站共享，防重复初始化）",
      content: [
        `// 公共交互脚本（navbar/sidebar/tabs/pane/anchor/modal/drawer）`,
        `// 由 web-craft 脚手架生成器自动生成`,
        `// 全站一份：带 __wc*Init 幂等守卫，跨页面重复加载安全`,
        ``,
        ...projectSharedScripts.map((s) => s.trim().replace(/;+\s*$/, "") + ";"),
        ``,
      ].join("\n"),
    });
  }

  // ── .gitignore ──────────────────────────────────────
  files.push({
    path: ".gitignore",
    description: "Git 忽略规则",
    content: [
      `.DS_Store`,
      `.idea`,
      `.vscode/*`,
      `!.vscode/extensions.json`,
      `*.log`,
    ].join("\n"),
  });

  // ── README.md ──────────────────────────────────────────
  files.push({
    path: "README.md",
    description: "项目说明",
    content: [
      `# ${projectName}`,
      ``,
      projectDesc ? `> ${projectDesc}` : `> 由 web-craft 脚手架生成器自动生成`,
      ``,
      `## 技术栈`,
      ``,
      `- 纯 HTML / CSS / JavaScript`,
      `- 无构建工具，浏览器直接打开`,
      ``,
      `## 架构（前后端分离 · 分层映射）`,
      ``,
      `输出遵循"CSS / JS / HTML 分层 + 前后端分离"的流行设计模式，与编辑器四大工具一一对应：`,
      ``,
      `| 编辑器 | 生成代码 | 说明 |`,
      `| --- | --- | --- |`,
      `| 画布 Canvas | \`assets/css/style.css\` | 全局 reset、设计基线（.page 布局） |`,
      `| 视图 View | \`*.html\` + \`assets/css/pages/*.css\` | 每视图一个页面，页面级画布样式独立成 pages CSS |`,
      `| 图层 Layer | 图层包装 \`<div class="layer-*\">\` | 多图层按图层包装，定位/透明度样式在 pages CSS 收敛 |`,
      `| 组件 Component | 组件 HTML + 内联脚本 + \`assets/js/http.js\` | 组件结构 + 事件/数据脚本（JS）+ Facade 客户端 |`,
      ``,
      `### 设计模式`,
      ``,
      `- **CSS/JS/HTML 分离（无构建）**：样式抽离到 \`assets/css/**\`，逻辑沉到 \`assets/js/**\`，结构留在 \`*.html\`。`,
      `- **前后端分离（Facade + 拦截器）**：\`assets/js/http.js\`（IIFE）暴露 \`window.__wc_http\`，统一拼基地址、注入鉴权头、JSON 序列化、统一错误；配合 \`<head>\` 的全局配置脚本注入 \`window.__WC_*\` 环境变量。`,
      `- **多页 + 模块化脚本**：页面间公共交互抽取为 \`assets/js/shared-ui.js\`（幂等初始化），事件/数据脚本独立文件。`,
      `- **响应式等比适配**：固定宽度画布按视口宽双向缩放，保持跨屏视觉一致。`,
      ``,
      `## 目录结构`,
      ``,
      `\`\`\``,
      `index.html          # 首页`,
      `pages/              # 子页面`,
      `assets/css/style.css  # 全局样式`,
      `assets/css/pages/*.css # 页面级独立样式（CSS/JS/HTML 分离）`,
      `assets/js/main.js     # 基础脚本（响应式缩放）`,
      `assets/js/http.js     # 统一 http 客户端（前后端分离，暴露 window.__wc_http）`,
      `assets/js/shared-ui.js # 公共交互脚本（navbar/pane/anchor 等，全站一份）`,
      `\`\`\``,
      ``,
      `## 使用`,
      ``,
      `直接用浏览器打开 index.html，或部署到任意静态托管服务。`,
    ].join("\n"),
  });

  return files;
};
