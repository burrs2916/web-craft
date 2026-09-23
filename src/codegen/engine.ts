import type {
  GeneratedPage,
  CodegenOptions,
  CodegenContext,
  AssembleParams,
} from "./types";
import type { SceneComponent } from "../types/editor";
import type { SceneDSL, SceneView } from "../types/scene";
import type { CanvasConfig } from "../types/canvasConfig";
import type { BackgroundStyle } from "./types";
import { componentWrapperStyle, canvasBackgroundToStyle, escapeHTML, REJECTION_GUARD_SCRIPT, joinScripts } from "./layout";
import { initBuiltinCodegens, getCodegen } from "./components";
import { normalizeCanvasConfig } from "../types/canvasConfig";
import { assembleVueHTML, assembleReactHTML, assembleAngularHTML } from "./frameworks";
import { generateEventsScript } from "./scaffold/events";
import { generateDataScript } from "./scaffold/data";
import { generateGlobalConfigScript } from "./scaffold/globalConfig";
import { buildViewportFitScript } from "./viewport";

let initialized = false;

function ensureInit(): void {
  if (!initialized) {
    initBuiltinCodegens();
    initialized = true;
  }
}

/**
 * 代码生成引擎入口
 *
 * 输入：SceneDSL（含 views、globalComponents 等）
 * 输出：GeneratedPage[]（每视图一个 HTML 文件）
 *
 * 流程：
 *   1. 遍历 scene.views，每个 view 生成一个 HTML 页面
 *   2. 对每个 view，遍历其 components，按 type 调用对应 codegen 函数
 *   3. 组件用绝对定位包装（position:absolute + left/top/width/height）
 *   4. 画布背景生成页面级 CSS
 *   5. 多视图 → 多页面，首页为 index.html
 */
export function generateHTML(
  scene: SceneDSL,
  options: CodegenOptions = { framework: "static-html", preview: false },
): GeneratedPage[] {
  ensureInit();

  const views = scene.views ?? [];
  if (views.length === 0) {
    return [generateEmptyPage(scene)];
  }

  return views.map((view, index) => {
    const filename = index === 0 ? "index.html" : slugify(view.name) + ".html";
    return generateViewPage(scene, view, filename, options);
  });
}

/**
 * 生成单个视图对应的 HTML 页面
 */
function generateViewPage(
  scene: SceneDSL,
  view: SceneView,
  filename: string,
  options: CodegenOptions,
): GeneratedPage {
  const canvasConfig = normalizeCanvasConfig(view.canvasConfig ?? scene.canvasConfig);
  const components = view.components ?? [];
  const componentMap = new Map<string, SceneComponent>(
    components.map((c) => [c.id, c]),
  );

  // 构建 parentId → 子组件列表映射（按 parent.children 顺序排序）；隐藏的子组件不发布
  const childrenByParent = new Map<string, SceneComponent[]>();
  for (const comp of components) {
    if (comp.parentId && comp.visible !== false) {
      const siblings = childrenByParent.get(comp.parentId) ?? [];
      // 仅添加尚未加入的子组件
      if (!siblings.find((s) => s.id === comp.id)) {
        siblings.push(comp);
      }
      childrenByParent.set(comp.parentId, siblings);
    }
  }
  // 按 parent.children 顺序排序每个 siblings 数组
  for (const [pid, siblings] of childrenByParent) {
    const parent = componentMap.get(pid);
    const childIds = parent?.children ?? [];
    siblings.sort((a, b) => {
      const ia = childIds.indexOf(a.id);
      const ib = childIds.indexOf(b.id);
      return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
    });
  }

  const ctx: CodegenContext = {
    view,
    canvasConfig,
    scene,
    preview: options.preview,
    componentMap,
    childrenByParent,
    pageStyles: [],
    pageScripts: [],
    externalDeps: [],
    iconData: options.iconData,
    globalDataSources: Object.fromEntries((scene.dataSources ?? []).map((d) => [d.id, d])),
  };

  const bgStyle = canvasBackgroundToStyle(canvasConfig.background);
  const bodyContent = generateBody(components, ctx, canvasConfig, bgStyle);

  // 生成事件脚本（预览模式下内联到页面）
  const eventResult = generateEventsScript([
    ...components.filter(c => c.visible !== false).flatMap(c => c.events ?? []).filter(e => e.enabled !== false),
    ...((view.eventBindings ?? []).filter(e => e.enabled !== false)),
  ]);
  if (eventResult.hasEvents) {
    ctx.pageScripts.push(eventResult.inlineScript);
  }

  // 页面等比铺满视口：固定宽度画布按视口宽/设计宽双向缩放（窄屏缩小、宽屏放大）
  ctx.pageScripts.push(buildViewportFitScript());

  // 生成数据层脚本（预览模式下内联到页面）
  const dataResult = generateDataScript(view, scene);
  if (dataResult.hasData) {
    ctx.pageScripts.push(dataResult.inlineScript);
  }

  // ── 生成全局配置脚本（注入到 <head>，在所有页面脚本之前执行） ──
  const headScripts = generateGlobalConfigScript(scene, components);

  const pageTitle = canvasConfig.metadata?.title || view.name || scene.name || "Untitled";

  // 根据框架选择对应的模板组装函数
  const assembleFn =
    options.framework === "vue" ? assembleVueHTML :
    options.framework === "react" ? assembleReactHTML :
    options.framework === "angular" ? assembleAngularHTML :
    assembleHTML;

  const html = assembleFn({
    title: pageTitle,
    description: canvasConfig.metadata?.description ?? "",
    keywords: canvasConfig.metadata?.keywords ?? [],
    favicon: canvasConfig.metadata?.favicon ?? "",
    fontFamily: canvasConfig.fontFamily,
    canvasWidth: canvasConfig.width,
    canvasHeight: canvasConfig.height,
    padding: canvasConfig.padding,
    maxWidth: canvasConfig.maxWidth,
    bgStyle,
    bodyContent,
    pageStyles: ctx.pageStyles,
    pageScripts: ctx.pageScripts,
    externalDeps: ctx.externalDeps,
    preview: options.preview,
    headScripts,
  });

  return { filename, title: pageTitle, html, viewId: view.id };
}

/**
 * 生成 body 内容：画布容器 + 所有组件
 */
function generateBody(
  components: SceneComponent[],
  ctx: CodegenContext,
  canvasConfig: CanvasConfig,
  bgStyle: BackgroundStyle,
): string {
  const layers = ctx.view.layers ?? [];

  // 仅渲染顶级组件（无 parentId），子组件由父组件的 codegen 函数通过 ctx.childrenByParent 自行渲染
  const visibleComponents = components.filter((c) => c.visible !== false && !c.parentId);

  // 图层感知模式：按图层分组渲染
  if (layers.length > 1) {
    // 按图层 order 分组组件
    const componentsByLayer = new Map<string, SceneComponent[]>();
    for (const comp of visibleComponents) {
      const list = componentsByLayer.get(comp.layerId) ?? [];
      list.push(comp);
      componentsByLayer.set(comp.layerId, list);
    }

    // 按 layer order 生成每层的包装 div
    const sortedLayers = [...layers].sort((a, b) => a.order - b.order);
    const layerDivs = sortedLayers
      .filter((l) => l.visible)
      .map((layer) => {
        const layerComps = (componentsByLayer.get(layer.id) ?? [])
          .sort((a, b) => a.zIndex - b.zIndex);
        const layerHTML = layerComps
          .map((comp) => generateComponentHTML(comp, ctx))
          .join("\n    ");
        const opacity = layer.opacity !== 1 ? `; opacity: ${layer.opacity}` : "";
        const layerClass = layer.name.toLowerCase().replace(/\s+/g, "-");
        return `    <div class="layer layer-${layerClass}" style="position: absolute; inset: 0; pointer-events: none${opacity}">
      ${layerHTML}
    </div>`;
      });

    const pad = canvasConfig.padding;
    const innerStyles = [
      "position: relative",
      `width: ${canvasConfig.width}px`,
      `min-height: ${canvasConfig.height}px`,
      `padding: ${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px`,
    ];

    if (bgStyle) {
      const bgCss = bgStyle.css;
      if (bgCss) {
        const isVideoBg = canvasConfig.background.type === "video" && canvasConfig.background.videoUrl;
        if (isVideoBg) {
          return `  <div class="page" data-design-width="${canvasConfig.width}" data-design-height="${canvasConfig.height}" style="${["position: relative", "overflow: hidden", `width: ${canvasConfig.width}px`, `min-height: ${canvasConfig.height}px`].join("; ")}">
    ${bgStyle.html ?? ""}
    <div style="${innerStyles.join("; ")}; position: relative; z-index: 1">
    ${layerDivs.join("\n    ")}
    </div>
  </div>`;
        }
        innerStyles.unshift(bgCss);
      }
    }

    return `  <div class="page" data-design-width="${canvasConfig.width}" data-design-height="${canvasConfig.height}" style="${innerStyles.join("; ")}">
    ${layerDivs.join("\n    ")}
  </div>`;
  }

  // ── 单图层模式：沿用原有逻辑 ──
  visibleComponents.sort((a, b) => a.zIndex - b.zIndex);

  const componentHTML = visibleComponents
    .map((comp) => generateComponentHTML(comp, ctx))
    .join("\n    ");

  const pad = canvasConfig.padding;
  const innerStyles = [
    "position: relative",
    `width: ${canvasConfig.width}px`,
    `min-height: ${canvasConfig.height}px`,
    `padding: ${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px`,
    "margin: 0 auto",
  ];

  if (bgStyle) {
    const bgCss = bgStyle.css;
    if (bgCss) {
      const isVideoBg = canvasConfig.background.type === "video" && canvasConfig.background.videoUrl;
      if (isVideoBg) {
        return `  <div class="page" data-design-width="${canvasConfig.width}" data-design-height="${canvasConfig.height}" style="${["position: relative", "overflow: hidden", `width: ${canvasConfig.width}px`, `min-height: ${canvasConfig.height}px`].join("; ")}">
    ${bgStyle.html ?? ""}
    <div style="${innerStyles.join("; ")}; position: relative; z-index: 1">
    ${componentHTML}
    </div>
  </div>`;
      }
      innerStyles.unshift(bgCss);
    }
  }

  return `  <div class="page" data-design-width="${canvasConfig.width}" data-design-height="${canvasConfig.height}" style="${innerStyles.join("; ")}">
      ${componentHTML}
    </div>`;
}

/**
 * 生成单个组件的 HTML（含绝对定位包装）
 */
function generateComponentHTML(
  component: SceneComponent,
  ctx: CodegenContext,
): string {
  const codegenFn = getCodegen(component.type);
  const effective = withEffectiveConfig(component, ctx);

  if (!codegenFn) {
    return generateUnsupportedComponent(component, ctx);
  }

  const innerHTML = codegenFn(effective, ctx);
  const wrapperStyle = componentWrapperStyle(component);

  const dataAttrs = `data-component-id="${component.id}" data-component-type="${component.type}"`;

  return `    <div style="${wrapperStyle}" ${dataAttrs}>${innerHTML}</div>`;
}

/**
 * 计算组件的"有效配置"：当组件配置了 dataSourceId 且命中全局数据源时，
 * 用全局数据源的 data 配置覆盖组件本地配置，返回浅克隆组件。
 * 与编辑端 useApiDataFetch 的绑定语义一致（绑定后数据来自全局源，忽略自带配置），
 * 使 table/list/echarts 等自取数 codegen 在发布端自动消费全局数据源。
 */
function withEffectiveConfig(
  component: SceneComponent,
  ctx: CodegenContext,
): SceneComponent {
  const raw = (component.config ?? {}) as Record<string, unknown>;
  const sourceId = String(raw.dataSourceId ?? "");
  const gs = sourceId ? ctx.globalDataSources?.[sourceId] : undefined;
  if (!gs) return component;

  return {
    ...component,
    config: {
      ...raw,
      dataMode: gs.dataMode,
      staticData: gs.staticData,
      apiUrl: gs.apiUrl,
      apiPath: gs.apiPath,
      apiMethod: gs.apiMethod,
      apiDataPath: gs.apiDataPath,
      apiHeaders: gs.apiHeaders,
      apiBody: gs.apiBody,
      apiInterval: gs.apiInterval,
      authEnabled: gs.authEnabled,
    },
  };
}

/**
 * 生成子组件的 HTML（供容器组件 codegen 调用）。
 *
 * 与 generateComponentHTML 类似，但子组件的绝对定位基准是父组件的内容区（position: relative），
 * 而非画布。子组件的 left/top/width/height 保持与编辑器中一致（相对父组件内层 Box）。
 *
 * 递归：如果子组件自身也是容器（有自己的 children），其 codegen 可继续通过 ctx.childrenByParent 查找。
 */
export function generateChildHTML(
  component: SceneComponent,
  ctx: CodegenContext,
): string {
  const codegenFn = getCodegen(component.type);
  const effective = withEffectiveConfig(component, ctx);

  if (!codegenFn) {
    return `<div style="${componentWrapperStyle(component)}" data-component-id="${component.id}" data-component-type="${component.type}"></div>`;
  }

  const innerHTML = codegenFn(effective, ctx);
  const wrapperStyle = componentWrapperStyle(component);

  return `<div style="${wrapperStyle}" data-component-id="${component.id}" data-component-type="${component.type}">${innerHTML}</div>`;
}

/**
 * 不支持的组件生成占位符
 */
function generateUnsupportedComponent(
  component: SceneComponent,
  ctx: CodegenContext,
): string {
  if (ctx.preview) {
    const wrapperStyle = componentWrapperStyle(component);
    const placeholderStyle = "width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(255,152,0,0.1);border:1px dashed rgba(255,152,0,0.4);border-radius:4px;color:rgba(255,152,0,0.8);font-size:12px";
    return `    <div style="${wrapperStyle}" data-component-id="${component.id}" data-component-type="${component.type}" data-unsupported="true">
      <div style="${placeholderStyle}">${escapeHTML(component.type)} (codegen 待实现)</div>
    </div>`;
  }

  const wrapperStyle = componentWrapperStyle(component);
  return `    <div style="${wrapperStyle}" data-component-id="${component.id}" data-component-type="${component.type}"></div>`;
}

/**
 * 组装完整 HTML 文档（static-html 模式）
 */

function assembleHTML(p: AssembleParams): string {
  const headParts: string[] = [
    `  <meta charset="UTF-8">`,
    `  <meta name="viewport" content="width=device-width, initial-scale=1.0">`,
    `  <title>${escapeHTML(p.title)}</title>`,
  ];

  if (p.description) {
    headParts.push(`  <meta name="description" content="${escapeHTML(p.description)}">`);
  }

  if (p.keywords.length > 0) {
    headParts.push(`  <meta name="keywords" content="${escapeHTML(p.keywords.join(", "))}">`);
  }

  if (p.favicon) {
    headParts.push(`  <link rel="icon" href="${escapeHTML(p.favicon)}">`);
  }

  for (const dep of p.externalDeps) {
    headParts.push(`  <link rel="stylesheet" href="${dep}">`);
  }

  const bodyStyle = [
    "margin: 0",
    "padding: 0",
    `font-family: ${p.fontFamily}`,
    "background: #1a1a2e",
  ];

  const css = `
  * { box-sizing: border-box; }
  body { ${bodyStyle.join("; ")}; }
  ${p.bgStyle.css ? `.canvas-bg { ${p.bgStyle.css} }` : ""}
  ${p.pageStyles.join("\n  ")}
`;

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
${REJECTION_GUARD_SCRIPT}
${headParts.join("\n")}
  <style>
${css}
  </style>
${p.headScripts ?? ""}
</head>
<body>
${p.bodyContent}
${p.bgStyle.html ?? ""}
${p.pageScripts.length > 0 ? `<script>\n${joinScripts(p.pageScripts).replace(/<\/script/gi, "<\\/script")}\n  </script>` : ""}
</body>
</html>`;

  return p.preview ? html : minifyHTML(html);
}

/**
 * 生成空场景的占位页面
 */
function generateEmptyPage(scene: SceneDSL): GeneratedPage {
  return {
    filename: "index.html",
    title: scene.name || "Empty",
    html: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(scene.name || "Empty")}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; background: #1a1a2e; color: #888; display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: sans-serif; }
  </style>
</head>
<body>
  <div style="text-align: center">
    <h1>${escapeHTML(scene.name || "Empty Scene")}</h1>
    <p>No components to render.</p>
  </div>
</body>
</html>`,
    viewId: scene.activeViewId ?? "",
  };
}

/**
 * 简单的 HTML 压缩（去多余空白）
 */
function minifyHTML(html: string): string {
  return html
    .replace(/\n\s*\n/g, "\n")
    .replace(/  +/g, "  ");
}

/**
 * 视图名称 → URL 友好的文件名
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "") || "page";
}
