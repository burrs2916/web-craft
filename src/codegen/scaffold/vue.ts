/**
 * Vue 3 + Vite 工程脚手架生成器
 *
 * 生成完整的、可运行的 Vue 3 + Vite + TypeScript 工程：
 *   - package.json（vue, vue-router, vite, typescript）
 *   - vite.config.ts
 *   - tsconfig.json + tsconfig.node.json
 *   - index.html
 *   - src/main.ts（createApp + 路由）
 *   - src/App.vue（根组件 + RouterView）
 *   - src/router/index.ts（路由表，从 SceneView[] 生成）
 *   - src/layouts/DefaultLayout.vue（从 CanvasConfig 生成）
 *   - src/pages/*.vue（每个视图一个页面骨架）
 *   - src/styles/global.css
 */

import type { ProjectFile, ScaffoldContext, ScaffoldGenerator } from "./types";
import { deriveViews, getGlobalCanvasConfig, escapeHtml, deriveLayers, extractInlineScripts, extractSharedScripts, dedupeExternalScripts } from "./utils";
import { generateViewBody, generateLayerHTML } from "./components";
import { generateEventsScript } from "./events";
import { generateProjectGlobalConfigScript } from "./globalConfig";
import { generateDataScript } from "./data";
import { buildViewportFitScript } from "../viewport";
import { buildPageCSS, buildLayerCSS } from "../shared/webstyles";
import { buildEnvContent, buildHttpClientSource, buildApiIndexSource } from "../shared/apiClient";

export const generateVueProject: ScaffoldGenerator = (ctx: ScaffoldContext): ProjectFile[] => {
  const { scene } = ctx;
  const views = deriveViews(scene);
  const canvas = getGlobalCanvasConfig(scene);
  const projectName = ctx.projectName;
  const projectDesc = ctx.projectDescription;

  const files: ProjectFile[] = [];

  // ── package.json ──────────────────────────────────────
  files.push({
    path: "package.json",
    description: "依赖声明",
    content: JSON.stringify({
      name: projectName.toLowerCase().replace(/\s+/g, "-"),
      private: true,
      version: "0.1.0",
      type: "module",
      scripts: {
        dev: "vite",
        build: "vue-tsc && vite build",
        preview: "vite preview",
      },
      dependencies: {
        vue: "^3.4.0",
        "vue-router": "^4.3.0",
      },
      devDependencies: {
        "@types/node": "^20.11.0",
        "@vitejs/plugin-vue": "^5.0.0",
        typescript: "^5.3.0",
        vite: "^5.1.0",
        "vue-tsc": "^2.0.0",
      },
    }, null, 2),
  });

  // ── vite.config.ts ────────────────────────────────────
  files.push({
    path: "vite.config.ts",
    description: "Vite 构建配置",
    content: [
      `import { defineConfig } from 'vite';`,
      `import vue from '@vitejs/plugin-vue';`,
      `import path from 'path';`,
      ``,
      `export default defineConfig({`,
      `  plugins: [vue()],`,
      `  resolve: {`,
      `    alias: {`,
      `      '@': path.resolve(__dirname, './src'),`,
      `    },`,
      `  },`,
      `  server: {`,
      `    port: 3000,`,
      `    open: true,`,
      `  },`,
      `});`,
    ].join("\n"),
  });

  // ── tsconfig.json ─────────────────────────────────────
  files.push({
    path: "tsconfig.json",
    description: "TypeScript 配置",
    content: JSON.stringify({
      compilerOptions: {
        target: "ES2020",
        useDefineForClassFields: true,
        module: "ESNext",
        lib: ["ES2020", "DOM", "DOM.Iterable"],
        skipLibCheck: true,
        moduleResolution: "bundler",
        allowImportingTsExtensions: true,
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        allowJs: true,
        jsx: "preserve",
        strict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noFallthroughCasesInSwitch: true,
        baseUrl: ".",
        paths: {
          "@/*": ["./src/*"],
        },
      },
      include: ["src/**/*.ts", "src/**/*.d.ts", "src/**/*.vue"],
      references: [{ path: "./tsconfig.node.json" }],
    }, null, 2),
  });

  // ── tsconfig.node.json ────────────────────────────────
  files.push({
    path: "tsconfig.node.json",
    description: "Vite 配置的 TypeScript 配置",
    content: JSON.stringify({
      compilerOptions: {
        composite: true,
        skipLibCheck: true,
        module: "ESNext",
        moduleResolution: "bundler",
        allowSyntheticDefaultImports: true,
      },
      include: ["vite.config.ts"],
    }, null, 2),
  });

  // ── .env（前后端分离 · 环境配置）─────────────────────
  files.push({
    path: ".env",
    description: "环境变量（API 基地址 / 鉴权头），服务器地址不写死进代码",
    content: buildEnvContent(),
  });

  // ── src/api（前后端分离 · 统一 http 客户端 + 业务接口入口）──
  files.push({
    path: "src/api/http.ts",
    description: "统一 http 客户端（fetch 封装 + 拦截器：拼基地址/注入 token/统一错误）",
    content: buildHttpClientSource("ts"),
  });
  files.push({
    path: "src/api/index.ts",
    description: "类型化业务接口入口（表单提交/数据源统一走此层）",
    content: buildApiIndexSource("ts"),
  });

  // ── src/main.ts ───────────────────────────────────────
  files.push({
    path: "src/main.ts",
    description: "Vue 应用入口",
    content: [
      `import { createApp } from 'vue';`,
      `import App from './App.vue';`,
      `import { router } from './router';`,
      `import './styles/global.css';`,
      ``,
      `const app = createApp(App);`,
      `app.use(router);`,
      `app.mount('#app');`,
    ].join("\n"),
  });

  // ── src/App.vue ───────────────────────────────────────
  files.push({
    path: "src/App.vue",
    description: "根组件",
    content: [
      `<template>`,
      `  <DefaultLayout>`,
      `    <RouterView />`,
      `  </DefaultLayout>`,
      `</template>`,
      ``,
      `<script setup lang="ts">`,
      `import DefaultLayout from './layouts/DefaultLayout.vue';`,
      `</script>`,
    ].join("\n"),
  });

  // ── src/router/index.ts ───────────────────────────────
  files.push({
    path: "src/router/index.ts",
    description: "路由表（从 SceneView[] 生成）",
    content: [
      `import { createRouter, createWebHistory } from 'vue-router';`,
      ``,
      ...views.map((v) => `import ${v.componentName} from '../pages/${v.componentName}.vue';`),
      ``,
      `export const routes = [`,
      ...views.map((v) =>
        `  { path: '${v.routePath}', name: '${v.fileName}', component: ${v.componentName} },`
      ),
      `];`,
      ``,
      `export const router = createRouter({`,
      `  history: createWebHistory(),`,
      `  routes,`,
      `});`,
    ].join("\n"),
  });

  // ── src/layouts/DefaultLayout.vue ─────────────────────
  files.push({
    path: "src/layouts/DefaultLayout.vue",
    description: "布局组件（从 CanvasConfig 生成）",
    content: [
      `<template>`,
      `  <div class="app-layout">`,
      `    <slot />`,
      `  </div>`,
      `</template>`,
      ``,
      `<style scoped>`,
      `.app-layout {`,
      `  margin: 0;`,
      `  padding: 0;`,
      `  min-height: 100vh;`,
      `  font-family: ${canvas.fontFamily};`,
      `  background: ${canvas.background};`,
      `}`,
      `</style>`,
    ].join("\n"),
  });

  // ── src/pages/*.vue + src/scripts/events-*.js ──────────
  // 全站公共交互脚本收集（navbar/pane/anchor 等带 __wc*Init 标记，跨视图去重为一份）
  const allProjectScripts: string[] = [];
  const allProjectExternalScripts: string[] = [];
  for (const v of views) {
    const sceneView = scene.views?.find((sv) => sv.id === v.id);
    const body = sceneView ? generateViewBody(sceneView, scene, ctx.iconData) : null;
    const rawHTML = body?.html ?? "";
    const componentStyles = body?.styles ?? [];
    const eventResult = generateEventsScript(body?.events ?? []);
    const dataResult = sceneView ? generateDataScript(sceneView, scene) : { hasData: false, inlineScript: "", module: "", bindingCount: 0 };

    // 提取内联脚本（v-html 不执行 <script> 标签）
    const { html: cleanedHTML, scripts: inlineScripts, external: externalScripts } = extractInlineScripts(rawHTML);
    allProjectExternalScripts.push(...externalScripts);
    const allScripts = [...(body?.scripts ?? []), ...inlineScripts];
    // 公共交互脚本（navbar/pane/anchor 等带 __wc*Init 幂等标记）视为全站共享，
    // 视图特有脚本（auth 流程、自定义逻辑）留在本视图 page-scripts
    const { shared: viewSharedScripts, rest: viewRestScripts } = extractSharedScripts(allScripts);
    allProjectScripts.push(...allScripts);

    // 如果有事件，生成独立的 events 模块文件
    if (eventResult.hasEvents) {
      files.push({
        path: `src/scripts/events-${v.fileName}.js`,
        description: `事件脚本: ${v.name}`,
        content: eventResult.module,
      });
    }

    // 如果有数据绑定，生成独立的 data 模块文件
    if (dataResult.hasData) {
      files.push({
        path: `src/scripts/data-${v.fileName}.js`,
        description: `数据层脚本: ${v.name}`,
        content: dataResult.module,
      });
    }

    // 如果有视图特有脚本，生成独立模块
    if (viewRestScripts.length > 0) {
      files.push({
        path: `src/scripts/page-scripts-${v.fileName}.js`,
        description: `页面交互脚本: ${v.name}`,
        content: [
          `// ${v.name} 视图特有交互脚本`,
          `// 由 web-craft 脚手架生成器自动生成`,
          `// 共享交互脚本（navbar/pane/anchor 等）已在 src/scripts/shared-ui.js 统一处理`,
          ``,
          `export function initPageScripts() {`,
          ...(viewRestScripts.map((s) => `  try { ${s} } catch(e) { console.warn('[page-scripts]', e); }`)),
          `}`,
        ].join("\n"),
      });
    }

    const hasShared = viewSharedScripts.length > 0;
    const hasRest = viewRestScripts.length > 0;
    const hasHooks = eventResult.hasEvents || dataResult.hasData || hasRest || hasShared;
    const vueImports = ["ref"];
    if (hasHooks) vueImports.push("onMounted");
    const scriptImports: string[] = [];
    if (hasShared) scriptImports.push(`import { initSharedUI } from '../scripts/shared-ui';`);
    if (eventResult.hasEvents) scriptImports.push(`import { initEvents } from '../scripts/events-${v.fileName}';`);
    if (dataResult.hasData) scriptImports.push(`import { initDataLayer } from '../scripts/data-${v.fileName}';`);
    if (hasRest) scriptImports.push(`import { initPageScripts } from '../scripts/page-scripts-${v.fileName}';`);

    const hookBody: string[] = [];
    if (hasHooks) {
      hookBody.push(``, `onMounted(() => {`);
      if (hasShared) hookBody.push(`  initSharedUI();`);
      if (hasRest) hookBody.push(`  initPageScripts();`);
      if (eventResult.hasEvents) hookBody.push(`  initEvents();`);
      if (dataResult.hasData) hookBody.push(`  initDataLayer();`);
      hookBody.push(`});`);
    }

    // ── 图层感知模式 ──
    const layers = sceneView ? deriveLayers(sceneView) : [];
    const hasMultipleLayers = layers.length > 0;

    if (hasMultipleLayers) {
      // 页面级 CSS 分离：画布(视图) + 各图层(图层维度) + 组件样式抽为独立 .css（CSS/JS/HTML 分离）
      const pageCss = [
        buildPageCSS({
          name: v.fileName,
          width: v.canvasWidth,
          height: v.canvasHeight,
          background: v.canvasBackground,
        }),
        ...layers
          .filter((l) => l.visible)
          .map((l) => buildLayerCSS({ name: l.fileName, opacity: l.opacity })),
        ...(componentStyles.length > 0 ? [``, ...componentStyles] : []),
      ].join("\n");
      files.push({
        path: `src/styles/pages/${v.componentName}.css`,
        description: `页面样式（CSS/JS/HTML 分离）: ${v.name}`,
        content: pageCss,
      });

      // 生成每个图层的子组件文件
      const layerImports: string[] = [];
      const layerTags: string[] = [];

      for (const layer of layers) {
        if (!layer.visible) continue;
        const layerHTML = generateLayerHTML(layer.id, sceneView!, scene, ctx.iconData);
        const safeLayerHTML = layerHTML
          .replace(/`/g, "\\`")
          .replace(/\$\{/g, "\\${");

        files.push({
          path: `src/pages/${v.componentName}/layers/${layer.componentName}.vue`,
          description: `图层组件: ${layer.name}`,
          content: [
            `<!--`,
            ` * ${layer.name} 图层`,
            ` * 所属视图: ${v.name} (视图 id: ${v.id})`,
            ` * 图层 id: ${layer.id}`,
            ` * 由 web-craft 脚手架生成器自动生成`,
            ` * 样式位于页面级 CSS: src/styles/pages/${v.componentName}.css（CSS/JS/HTML 分离）`,
            `-->`,
            `<template>`,
            `  <div class="layer layer-${layer.fileName}" v-html="layerHTML"></div>`,
            `</template>`,
            ``,
            `<script setup lang="ts">`,
            `import { ref } from 'vue';`,
            `import '../../../../styles/pages/${v.componentName}.css';`,
            ``,
            `const layerHTML = ref(\`${safeLayerHTML}\`);`,
            `</script>`,
          ].join("\n"),
        });

        layerImports.push(`import ${layer.componentName} from './${v.componentName}/layers/${layer.componentName}.vue';`);
        layerTags.push(`    <${layer.componentName} />`);
      }

      files.push({
        path: `src/pages/${v.componentName}.vue`,
        description: `页面: ${v.name}`,
        content: [
          `<!--`,
          ` * ${v.name} 页面`,
          ` * 视图 id: ${v.id}`,
          ` * 由 web-craft 脚手架生成器自动生成`,
          ` * 包含 ${layers.length} 个图层${eventResult.hasEvents ? " + 事件交互" : ""}${dataResult.hasData ? " + 数据绑定" : ""}${hasShared ? " + 共享交互" : ""}`,
          ` * 图层组件: ${layers.filter(l => l.visible).map(l => `./${v.componentName}/layers/${l.componentName}`).join(", ")}`,
          ` * 页面样式: src/styles/pages/${v.componentName}.css（CSS/JS/HTML 分离）`,
          `-->`,
          `<template>`,
          `  <div class="page page-${v.fileName}" data-design-width="${v.canvasWidth}" data-design-height="${v.canvasHeight}">`,
          ...layerTags,
          `  </div>`,
          `</template>`,
          ``,
          `<script setup lang="ts">`,
          `import { ${vueImports.join(", ")} } from 'vue';`,
          `import '../../styles/pages/${v.componentName}.css';`,
          ...scriptImports,
          ...layerImports,
          ``,
          ...hookBody,
          `</script>`,
        ].join("\n"),
      });
    } else {
      // ── 单图层模式：页面样式抽为独立 .css（CSS/JS/HTML 分离） ──
      const singlePageCss = [
        buildPageCSS({
          name: v.fileName,
          width: v.canvasWidth,
          height: v.canvasHeight,
          background: v.canvasBackground,
        }),
        ...(componentStyles.length > 0 ? [``, ...componentStyles] : []),
      ].join("\n");
      files.push({
        path: `src/styles/pages/${v.componentName}.css`,
        description: `页面样式（CSS/JS/HTML 分离）: ${v.name}`,
        content: singlePageCss,
      });

      files.push({
        path: `src/pages/${v.componentName}.vue`,
        description: `页面: ${v.name}`,
        content: [
          `<!--`,
          ` * ${v.name} 页面`,
          ` * 视图 id: ${v.id}`,
          ` * 由 web-craft 脚手架生成器自动生成`,
          ` * 包含 ${cleanedHTML ? "真实组件代码" : "空画布"}${eventResult.hasEvents ? " + 事件交互" : ""}${dataResult.hasData ? " + 数据绑定" : ""}${hasShared ? " + 共享交互" : ""}`,
          ` * 页面脚本: src/scripts/${hasRest ? `page-scripts-${v.fileName}.js, ` : ""}${eventResult.hasEvents ? `events-${v.fileName}.js, ` : ""}${dataResult.hasData ? `data-${v.fileName}.js` : ""}${hasShared ? `, shared-ui.js` : ""}`,
          ` * 页面样式: src/styles/pages/${v.componentName}.css（CSS/JS/HTML 分离）`,
          `-->`,
          `<template>`,
          `  <div class="page page-${v.fileName}" data-design-width="${v.canvasWidth}" data-design-height="${v.canvasHeight}">`,
          `    <div v-html="componentHTML" class="components-layer"></div>`,
          `  </div>`,
          `</template>`,
          ``,
          `<script setup lang="ts">`,
          `import { ${vueImports.join(", ")} } from 'vue';`,
          `import '../../styles/pages/${v.componentName}.css';`,
          ...scriptImports,
          ``,
          `const componentHTML = ref(\`${cleanedHTML.replace(/`/g, "\\`").replace(/\$\{/g, "\\${")}\`);`,
          ...hookBody,
          `</script>`,
        ].join("\n"),
      });
    }
  }

  // ── index.html ───────────────────────────────────────
  // 注：必须放在视图循环之后生成，以收集全站外部库（echarts CDN 等）
  const globalConfigScript = generateProjectGlobalConfigScript(scene);
  const externalScripts = dedupeExternalScripts(allProjectExternalScripts);
  files.push({
    path: "index.html",
    description: "Vite 入口 HTML",
    content: [
      `<!DOCTYPE html>`,
      `<html lang="zh-CN">`,
      `  <head>`,
      `    <meta charset="UTF-8" />`,
      `    <meta name="viewport" content="width=device-width, initial-scale=1.0" />`,
      `    <meta name="description" content="${escapeHtml(projectDesc)}" />`,
      `    <title>${escapeHtml(projectName)}</title>`,
      ...(globalConfigScript
        ? [`    <!-- 全局配置：API + 认证统一配置源（window.__WC_*） -->`, ...globalConfigScript.split("\n").map((l) => `    ${l}`)]
        : []),
      ...(externalScripts.length > 0
        ? [`    <!-- 外部库（echarts CDN 等，组件渲染依赖） -->`, ...externalScripts.map((s) => `    ${s}`)]
        : []),
      `  </head>`,
      `  <body>`,
      `    <div id="app"></div>`,
      `    <script type="module" src="/src/main.ts"></script>`,
      `    <script>`,
      buildViewportFitScript(),
      `    </script>`,
      `  </body>`,
      `</html>`,
    ].join("\n"),
  });

  // ── src/scripts/shared-ui.js（全站公共交互脚本，按 __wc*Init 标记去重）──
  const projectSharedScripts = extractSharedScripts(allProjectScripts).shared;
  if (projectSharedScripts.length > 0) {
    files.push({
      path: "src/scripts/shared-ui.js",
      description: "公共交互脚本（全站共享，防重复初始化）",
      content: [
        `// 公共交互脚本（navbar/sidebar/tabs/pane/anchor/modal/drawer）`,
        `// 由 web-craft 脚手架生成器自动生成`,
        `// 全站一份：带 __wc*Init 幂等守卫，跨视图/跨页面重复调用安全`,
        ``,
        `export function initSharedUI() {`,
        ...(projectSharedScripts.map((s) => `  try { ${s} } catch(e) { console.warn('[shared-ui]', e); }`)),
        `}`,
      ].join("\n"),
    });
  }

  // ── src/styles/global.css ─────────────────────────────
  files.push({
    path: "src/styles/global.css",
    description: "全局样式",
    content: [
      `* {`,
      `  margin: 0;`,
      `  padding: 0;`,
      `  box-sizing: border-box;`,
      `}`,
      ``,
      `html, body, #app {`,
      `  width: 100%;`,
      `  height: 100%;`,
      `}`,
      ``,
      `body {`,
      `  font-family: ${canvas.fontFamily};`,
      `  background: ${canvas.background};`,
      `  -webkit-font-smoothing: antialiased;`,
      `  -moz-osx-font-smoothing: grayscale;`,
      `}`,
      ``,
      `a {`,
      `  color: inherit;`,
      `  text-decoration: none;`,
      `}`,
    ].join("\n"),
  });

  // ── src/vite-env.d.ts ─────────────────────────────────
  files.push({
    path: "src/vite-env.d.ts",
    description: "Vite 类型声明",
    content: [
      `/// <reference types="vite/client" />`,
      ``,
      `declare module '*.vue' {`,
      `  import type { DefineComponent } from 'vue';`,
      `  const component: DefineComponent<{}, {}, any>;`,
      `  export default component;`,
      `}`,
    ].join("\n"),
  });

  // ── .gitignore ────────────────────────────────────────
  files.push({
    path: ".gitignore",
    description: "Git 忽略规则",
    content: [
      `node_modules`,
      `dist`,
      `dist-ssr`,
      `*.local`,
      ``,
      `# Editor`,
      `.vscode/*`,
      `!.vscode/extensions.json`,
      `.idea`,
      `.DS_Store`,
      `*.suo`,
      `*.ntuser*`,
      `*.njsproj`,
      `*.sln`,
      `*.sw?`,
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
      `- Vue 3`,
      `- Vite 5`,
      `- TypeScript 5`,
      `- Vue Router 4`,
      ``,
      `## 架构（前后端分离 · 分层映射）`,
      ``,
      `输出遵循"CSS / JS / HTML 分层 + 前后端分离"的流行设计模式，与编辑器四大工具一一对应：`,
      ``,
      `| 编辑器 | 生成代码 | 说明 |`,
      `| --- | --- | --- |`,
      `| 画布 Canvas | \`src/styles/global.css\` + \`.env\` | 设计 token（CSS 变量）、全局 reset、API 环境配置 |`,
      `| 视图 View | \`src/pages/*.vue\` + \`src/styles/pages/*.css\` | 每视图一个页面，页面级画布样式独立成 CSS |`,
      `| 图层 Layer | \`src/pages/{Page}/layers/*.vue\` | 多图层按图层拆分组件，图层样式收敛到页面 CSS |`,
      `| 组件 Component | 组件模板 + \`src/scripts/*\` + \`src/api/*\` | 组件 HTML + 事件/数据脚本（JS）+ Facade 服务层 |`,
      ``,
      `### 设计模式`,
      ``,
      `- **CSS/JS/HTML 分离（SFC + 独立样式）**：组件模板（HTML）、脚本（JS）、样式（页面级 \`styles/pages/*.css\` + 组件 SFC \`<style>\`）相互独立。`,
      `- **前后端分离（Facade + 拦截器）**：\`src/api/http.ts\` 统一封装 fetch——拼基地址、注入鉴权头、JSON 序列化、统一错误；业务只依赖 \`src/api/index.ts\` 暴露的服务函数。`,
      `- **环境配置（12-Factor）**：服务器地址/鉴权头写入 \`.env\`（\`VITE_*\`），不硬编码进代码。`,
      `- **组合式 API（Composition）**：页面按 \`<script setup>\` 组织，事件/数据/共享交互在生命周期钩子中初始化。`,
      ``,
      `## 快速开始`,
      ``,
      `\`\`\`bash`,
      `npm install`,
      `npm run dev`,
      `npm run build`,
      `npm run preview`,
      `\`\`\``,
      ``,
      `## 目录结构`,
      ``,
      `\`\`\``,
      `src/`,
      `  main.ts           # 应用入口`,
      `  App.vue           # 根组件 + 路由`,
      `  layouts/          # 布局组件`,
      `  pages/            # 页面组件（每个视图对应一个页面）`,
      `    *.vue           # 单图层模式：单文件页面`,
      `    */layers/       # 多图层模式：按图层拆分子组件`,
      `  scripts/          # 页面脚本（按视图聚合，文件名含视图名）`,
      `    shared-ui.js            # 公共交互脚本（navbar/pane/anchor 等，全站一份）`,
      `    events-{view}.js        # 事件绑定脚本（有事件绑定时生成）`,
      `    data-{view}.js          # 数据层脚本（有 API/数据绑定时生成）`,
      `    page-scripts-{view}.js  # 视图特有交互脚本（auth 流程、自定义逻辑等）`,
      `  styles/           # 样式（CSS/JS/HTML 分离）`,
      `    global.css              # 全局 reset + 设计 token`,
      `    pages/{Page}.css        # 页面画布/图层/组件样式（每视图一份）`,
      `  api/              # 前后端分离 API 层`,
      `    http.ts                 # 统一 http 客户端（拦截器：拼 base/注入 token/统一错误）`,
      `    index.ts                # 业务接口入口（userApi 等）`,
      `\`\`\``,
      ``,
      `## 视图 → 文件映射`,
      ``,
      `每个视图（scene.views）在生成工程中对应：`,
      ``,
      ...views.map((v) => {
        const sceneView = scene.views?.find((sv) => sv.id === v.id);
        const layerCount = (sceneView?.layers ?? []).length;
        const mapLines = [
          `- 视图 \`${v.name}\`（id: \`${v.id}\`）`,
          `  - 页面: \`src/pages/${v.componentName}.vue\``,
        ];
        if (layerCount > 1) {
          mapLines.push(`  - 图层(${layerCount}): \`src/pages/${v.componentName}/layers/*.vue\``);
        }
        mapLines.push(`  - 路由: \`${v.routePath}\``);
        mapLines.push(`  - 脚本: \`src/scripts/{events,data,page-scripts}-${v.fileName}.js\``);
        return mapLines;
      }).flat(),
      ``,
      `## 路由`,
      ``,
      ...views.map((v) => `- \`${v.routePath}\` → ${v.componentName} (${v.name})`),
    ].join("\n"),
  });

  return files;
};
