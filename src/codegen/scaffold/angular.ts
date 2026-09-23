/**
 * Angular 14 工程脚手架生成器
 *
 * 生成完整的、可运行的 Angular 14 + TypeScript 工程（基于 Angular CLI）：
 *   - package.json（@angular/* 依赖）
 *   - angular.json（工作区配置）
 *   - tsconfig.json + tsconfig.app.json
 *   - src/index.html
 *   - src/main.ts（平台引导）
 *   - src/app/app.module.ts（根模块）
 *   - src/app/app-routing.module.ts（路由表）
 *   - src/app/app.component.ts（根组件）
 *   - src/app/pages/*.component.ts（每个视图一个组件）
 *   - src/styles.css
 */

import type { ProjectFile, ScaffoldContext, ScaffoldGenerator } from "./types";
import { deriveViews, getGlobalCanvasConfig, escapeHtml, deriveLayers, extractInlineScripts, extractSharedScripts, dedupeExternalScripts } from "./utils";
import { generateViewBody, generateLayerHTML } from "./components";
import { generateEventsScript } from "./events";
import { generateProjectGlobalConfigScript } from "./globalConfig";
import { buildViewportFitScript } from "../viewport";
import { generateDataScript } from "./data";
import { buildPageCSS, buildLayerCSS } from "../shared/webstyles";
import { buildAngularEnvironmentContent, buildHttpClientSource, buildApiIndexSource } from "../shared/apiClient";

export const generateAngularProject: ScaffoldGenerator = (ctx: ScaffoldContext): ProjectFile[] => {
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
      name: projectName,
      version: "0.1.0",
      scripts: {
        ng: "ng",
        dev: "ng serve",
        start: "ng serve",
        build: "ng build",
        watch: "ng build --watch --configuration development",
      },
      private: true,
      dependencies: {
        "@angular/animations": "^14.2.0",
        "@angular/common": "^14.2.0",
        "@angular/compiler": "^14.2.0",
        "@angular/core": "^14.2.0",
        "@angular/forms": "^14.2.0",
        "@angular/platform-browser": "^14.2.0",
        "@angular/platform-browser-dynamic": "^14.2.0",
        "@angular/router": "^14.2.0",
        rxjs: "~7.5.0",
        tslib: "^2.3.0",
        "zone.js": "~0.11.4",
      },
      devDependencies: {
        "@angular-devkit/build-angular": "^14.2.0",
        "@angular/cli": "^14.2.0",
        "@angular/compiler-cli": "^14.2.0",
        typescript: "~4.7.0",
      },
    }, null, 2),
  });

  // ── angular.json ──────────────────────────────────────
  files.push({
    path: "angular.json",
    description: "Angular 工作区配置",
    content: JSON.stringify({
      "$schema": "./node_modules/@angular/cli/lib/config/schema.json",
      version: 1,
      newProjectRoot: "projects",
      projects: {
        [projectName]: {
          projectType: "application",
          schematics: {},
          root: "",
          sourceRoot: "src",
          prefix: "app",
          architect: {
            build: {
              builder: "@angular-devkit/build-angular:browser",
              options: {
                outputPath: "dist",
                index: "src/index.html",
                main: "src/main.ts",
                polyfills: ["zone.js"],
                tsConfig: "tsconfig.app.json",
                assets: [],
                styles: ["src/styles.css"],
                scripts: [],
              },
              configurations: {
                production: {
                  budgets: [
                    { type: "initial", maximumWarning: "500kb", maximumError: "1mb" },
                    { type: "anyComponentStyle", maximumWarning: "2kb", maximumError: "4kb" },
                  ],
                  outputHashing: "all",
                },
                development: {
                  buildOptimizer: false,
                  optimization: false,
                  vendorChunk: false,
                  extractLicenses: false,
                  sourceMap: true,
                  namedChunks: true,
                },
              },
              defaultConfiguration: "production",
            },
            serve: {
              builder: "@angular-devkit/build-angular:dev-server",
              configurations: {
                production: { browserTarget: `${projectName}:build:production` },
                development: { browserTarget: `${projectName}:build:development` },
              },
              defaultConfiguration: "development",
            },
          },
        },
      },
    }, null, 2),
  });

  // ── tsconfig.json ─────────────────────────────────────
  files.push({
    path: "tsconfig.json",
    description: "TypeScript 配置",
    content: JSON.stringify({
      compileOnSave: false,
      compilerOptions: {
        baseUrl: "./",
        outDir: "./dist/out-tsc",
        forceConsistentCasingInFileNames: true,
        strict: true,
        noImplicitOverride: true,
        noPropertyAccessFromIndexSignature: true,
        noImplicitReturns: true,
        noFallthroughCasesInSwitch: true,
        sourceMap: true,
        declaration: false,
        experimentalDecorators: true,
        moduleResolution: "node",
        importHelpers: true,
        target: "ES2020",
        module: "ES2020",
        useDefineForClassFields: false,
        allowJs: true,
        lib: ["ES2020", "dom"],
      },
      angularCompilerOptions: {
        enableI18nLegacyMessageIdFormat: false,
        strictInjectionParameters: true,
        strictInputAccessModifiers: true,
        strictTemplates: true,
      },
    }, null, 2),
  });

  // ── tsconfig.app.json ─────────────────────────────────
  files.push({
    path: "tsconfig.app.json",
    description: "应用 TypeScript 配置",
    content: JSON.stringify({
      extends: "./tsconfig.json",
      compilerOptions: {
        outDir: "./out-tsc/app",
        types: [],
      },
      files: ["src/main.ts"],
      include: ["src/**/*.d.ts"],
    }, null, 2),
  });

  // ── src/environments（前后端分离 · 环境配置）────────────
  // Angular CLI 不加载 .env，环境配置走标准 src/environments/ 模式
  files.push({
    path: "src/environments/environment.ts",
    description: "环境配置（API 基地址 / 鉴权头），服务器地址不写死进代码",
    content: buildAngularEnvironmentContent(),
  });

  // ── src/api（前后端分离 · 统一 http 客户端 + 业务接口入口）──
  files.push({
    path: "src/api/http.ts",
    description: "统一 http 客户端（fetch 封装 + 拦截器：拼基地址/注入 token/统一错误）",
    content: buildHttpClientSource("ts", "angular-env"),
  });
  files.push({
    path: "src/api/index.ts",
    description: "类型化业务接口入口（表单提交/数据源统一走此层）",
    content: buildApiIndexSource("ts"),
  });

  // ── src/app/... ────────────────────────────────────────

  // ── src/main.ts ───────────────────────────────────────
  files.push({
    path: "src/main.ts",
    description: "Angular 平台引导",
    content: [
      `import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';`,
      `import { AppModule } from './app/app.module';`,
      ``,
      `platformBrowserDynamic()`,
      `  .bootstrapModule(AppModule)`,
      `  .catch((err) => console.error(err));`,
    ].join("\n"),
  });

  // ── src/app/app.module.ts ─────────────────────────────
  files.push({
    path: "src/app/app.module.ts",
    description: "根模块",
    content: [
      `import { NgModule } from '@angular/core';`,
      `import { BrowserModule } from '@angular/platform-browser';`,
      `import { AppRoutingModule } from './app-routing.module';`,
      `import { AppComponent } from './app.component';`,
      ``,
      `@NgModule({`,
      `  declarations: [AppComponent],`,
      `  imports: [BrowserModule, AppRoutingModule],`,
      `  providers: [],`,
      `  bootstrap: [AppComponent],`,
      `})`,
      `export class AppModule {}`,
    ].join("\n"),
  });

  // ── src/app/app-routing.module.ts ────────────────────
  files.push({
    path: "src/app/app-routing.module.ts",
    description: "路由表（从 SceneView[] 生成）",
    content: [
      `import { NgModule } from '@angular/core';`,
      `import { RouterModule, Routes } from '@angular/router';`,
      ``,
      ...views.map((v) => `import { ${v.componentName}Component } from './pages/${v.fileName}/${v.fileName}.component';`),
      ``,
      `const routes: Routes = [`,
      ...views.map((v) => `  { path: '${v.routePath === "/" ? "" : v.routePath}', component: ${v.componentName}Component },`),
      `];`,
      ``,
      `@NgModule({`,
      `  imports: [RouterModule.forRoot(routes)],`,
      `  exports: [RouterModule],`,
      `})`,
      `export class AppRoutingModule {}`,
    ].join("\n"),
  });

  // ── src/app/app.component.ts ──────────────────────────
  files.push({
    path: "src/app/app.component.ts",
    description: "根组件",
    content: [
      `import { Component } from '@angular/core';`,
      ``,
      `@Component({`,
      `  selector: 'app-root',`,
      `  template: \``,
      `    <div class="app-layout">`,
      `      <router-outlet></router-outlet>`,
      `    </div>`,
      `  \`,`,
      `  styles: [\``,
      `    .app-layout {`,
      `      margin: 0;`,
      `      padding: 0;`,
      `      min-height: 100vh;`,
      `      font-family: ${canvas.fontFamily};`,
      `      background: ${canvas.background};`,
      `    }`,
      `  \`],`,
      `})`,
      `export class AppComponent {}`,
    ].join("\n"),
  });

  // ── src/app/pages/{name}/{name}.component.ts + src/scripts/events-*.js ──
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

    // 提取内联脚本（[innerHTML] 不执行 <script> 标签）
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
    const ngImports = ["Component"];
    if (hasHooks) ngImports.push("AfterViewInit");
    const scriptImports: string[] = [];
    if (hasShared) scriptImports.push(`import { initSharedUI } from '../../../scripts/shared-ui';`);
    if (eventResult.hasEvents) scriptImports.push(`import { initEvents } from '../../../scripts/events-${v.fileName}';`);
    if (dataResult.hasData) scriptImports.push(`import { initDataLayer } from '../../../scripts/data-${v.fileName}';`);
    if (hasRest) scriptImports.push(`import { initPageScripts } from '../../../scripts/page-scripts-${v.fileName}';`);

    const hookBody: string[] = [];
    if (hasHooks) {
      hookBody.push(``, `  ngAfterViewInit() {`, `    setTimeout(() => {`);
      if (hasShared) hookBody.push(`      initSharedUI();`);
      if (hasRest) hookBody.push(`      initPageScripts();`);
      if (eventResult.hasEvents) hookBody.push(`      initEvents();`);
      if (dataResult.hasData) hookBody.push(`      initDataLayer();`);
      hookBody.push(`    }, 0);`, `  }`);
    }

    // ── 图层感知模式 ──
    const layers = sceneView ? deriveLayers(sceneView) : [];
    const hasMultipleLayers = layers.length > 0;

    if (hasMultipleLayers) {
      // 页面级 CSS 分离：画布(视图) + 各图层(图层维度) + 组件样式抽为独立 component.css
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
        path: `src/app/pages/${v.fileName}/${v.fileName}.component.css`,
        description: `页面样式（CSS/JS/HTML 分离）: ${v.name}`,
        content: pageCss,
      });

      // 生成每个图层的模板字符串模块文件
      const layerImports: string[] = [];
      const layerDivs: string[] = [];

      for (const layer of layers) {
        if (!layer.visible) continue;
        const layerHTML = generateLayerHTML(layer.id, sceneView!, scene, ctx.iconData);
        const safeLayerHTML = layerHTML
          .replace(/`/g, "\\`")
          .replace(/\$\{/g, "\\${");

        files.push({
          path: `src/app/pages/${v.fileName}/layers/${layer.fileName}.ts`,
          description: `图层模板: ${layer.name}`,
          content: [
            `/**`,
            ` * ${layer.name} 图层模板`,
            ` * 所属视图: ${v.name} (id: ${v.id})`,
            ` * 图层 id: ${layer.id}`,
            ` * 由 web-craft 脚手架生成器自动生成`,
            ` * 样式位于页面 CSS: ${v.fileName}.component.css（CSS/JS/HTML 分离）`,
            ` */`,
            `export const ${layer.fileName}HTML = \`${safeLayerHTML}\`;`,
          ].join("\n"),
        });

        layerImports.push(`import { ${layer.fileName}HTML } from './layers/${layer.fileName}';`);
        layerDivs.push(`      <div class="layer layer-${layer.fileName}" [innerHTML]="${layer.fileName}SafeHTML"></div>`);
      }

      // 构建构造体中 safeHTML 的初始化
      const safeDeclarations: string[] = [];
      for (const layer of layers) {
        if (!layer.visible) continue;
        safeDeclarations.push(`  ${layer.fileName}SafeHTML = this.sanitizer.bypassSecurityTrustHtml(${layer.fileName}HTML);`);
      }

      files.push({
        path: `src/app/pages/${v.fileName}/${v.fileName}.component.ts`,
        description: `页面组件: ${v.name}`,
        content: [
          `/**`,
          ` * ${v.name} 页面`,
          ` * 视图 id: ${v.id}`,
          ` * 由 web-craft 脚手架生成器自动生成`,
          ` * 包含 ${layers.length} 个图层${eventResult.hasEvents ? " + 事件交互" : ""}${dataResult.hasData ? " + 数据绑定" : ""}${hasShared ? " + 共享交互" : ""}`,
          ` * 图层组件: ${layers.filter(l => l.visible).map(l => `./layers/${l.fileName}`).join(", ")}`,
          ` * 页面脚本: src/scripts/${allScripts.length > 0 ? `page-scripts-${v.fileName}.js, ` : ""}${eventResult.hasEvents ? `events-${v.fileName}.js, ` : ""}${dataResult.hasData ? `data-${v.fileName}.js` : ""}`,
          ` * 页面样式: ${v.fileName}.component.css（CSS/JS/HTML 分离）`,
          ` */`,
          `import { ${ngImports.join(", ")} } from '@angular/core';`,
          `import { DomSanitizer } from '@angular/platform-browser';`,
          ...scriptImports,
          ...layerImports,
          ``,
          `@Component({`,
          `  selector: 'app-${v.fileName}',`,
          `  template: \`,`,
          `    <div class="page page-${v.fileName}" data-design-width="${v.canvasWidth}" data-design-height="${v.canvasHeight}">`,
          ...layerDivs,
          `    </div>`,
          `  \`,`,
          `  styleUrls: ['./${v.fileName}.component.css'],`,
          `})`,
          `export class ${v.componentName}Component${hasHooks ? " implements AfterViewInit" : ""} {`,
          ...safeDeclarations,
          ``,
          `  constructor(private sanitizer: DomSanitizer) {}`,
          ...hookBody,
          `}`,
        ].join("\n"),
      });
    } else {
      // ── 单图层模式：页面样式抽为独立 component.css（CSS/JS/HTML 分离） ──
      const singlePageCss = [
        buildPageCSS({
          name: v.fileName,
          width: v.canvasWidth,
          height: v.canvasHeight,
          background: v.canvasBackground,
        }),
        `.components-layer {`,
        `  position: relative;`,
        `  width: 100%;`,
        `  height: 100%;`,
        `}`,
        ...(componentStyles.length > 0 ? [``, ...componentStyles] : []),
      ].join("\n");
      files.push({
        path: `src/app/pages/${v.fileName}/${v.fileName}.component.css`,
        description: `页面样式（CSS/JS/HTML 分离）: ${v.name}`,
        content: singlePageCss,
      });

      files.push({
        path: `src/app/pages/${v.fileName}/${v.fileName}.component.ts`,
        description: `页面组件: ${v.name}`,
        content: [
          `/**`,
          ` * ${v.name} 页面`,
          ` * 视图 id: ${v.id}`,
          ` * 由 web-craft 脚手架生成器自动生成`,
          ` * 包含 ${cleanedHTML ? "真实组件代码" : "空画布"}${eventResult.hasEvents ? " + 事件交互" : ""}${dataResult.hasData ? " + 数据绑定" : ""}${hasShared ? " + 共享交互" : ""}`,
          ` * 页面脚本: src/scripts/${hasRest ? `page-scripts-${v.fileName}.js, ` : ""}${eventResult.hasEvents ? `events-${v.fileName}.js, ` : ""}${dataResult.hasData ? `data-${v.fileName}.js` : ""}${hasShared ? `, shared-ui.js` : ""}`,
          ` * 页面样式: ${v.fileName}.component.css（CSS/JS/HTML 分离）`,
          ` */`,
          `import { ${ngImports.join(", ")} } from '@angular/core';`,
          `import { DomSanitizer } from '@angular/platform-browser';`,
          ...scriptImports,
          ``,
          `@Component({`,
          `  selector: 'app-${v.fileName}',`,
          `  template: \`,`,
          `    <div class="page page-${v.fileName}" data-design-width="${v.canvasWidth}" data-design-height="${v.canvasHeight}">`,
          `      <div [innerHTML]="safeHTML" class="components-layer"></div>`,
          `    </div>`,
          `  \`,`,
          `  styleUrls: ['./${v.fileName}.component.css'],`,
          `})`,
          `export class ${v.componentName}Component${hasHooks ? " implements AfterViewInit" : ""} {`,
          `  rawHTML = \`${cleanedHTML.replace(/`/g, "\\`").replace(/\$\{/g, "\\${")}\`;`,
          `  safeHTML: any;`,
          ``,
          `  constructor(private sanitizer: DomSanitizer) {`,
          `    this.safeHTML = this.sanitizer.bypassSecurityTrustHtml(this.rawHTML);`,
          `  }`,
          ...hookBody,
          `}`,
        ].join("\n"),
      });
    }
  }

  // ── src/index.html ────────────────────────────────────
  // 注：必须放在视图循环之后生成，以收集全站外部库（echarts CDN 等）
  const globalConfigScript = generateProjectGlobalConfigScript(scene);
  const externalScripts = dedupeExternalScripts(allProjectExternalScripts);
  files.push({
    path: "src/index.html",
    description: "Angular 入口 HTML",
    content: [
      `<!DOCTYPE html>`,
      `<html lang="zh-CN">`,
      `  <head>`,
      `    <meta charset="utf-8" />`,
      `    <title>${escapeHtml(projectName)}</title>`,
      `    <base href="/" />`,
      `    <meta name="viewport" content="width=device-width, initial-scale=1" />`,
      `    <meta name="description" content="${escapeHtml(projectDesc)}" />`,
      ...(globalConfigScript
        ? [`    <!-- 全局配置：API + 认证统一配置源（window.__WC_*） -->`, ...globalConfigScript.split("\n").map((l) => `    ${l}`)]
        : []),
      ...(externalScripts.length > 0
        ? [`    <!-- 外部库（echarts CDN 等，组件渲染依赖） -->`, ...externalScripts.map((s) => `    ${s}`)]
        : []),
      `  </head>`,
      `  <body>`,
      `    <app-root></app-root>`,
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

  // ── src/styles.css ────────────────────────────────────
  files.push({
    path: "src/styles.css",
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
      `}`,
      ``,
      `body {`,
      `  font-family: ${canvas.fontFamily};`,
      `  background: ${canvas.background};`,
      `}`,
    ].join("\n"),
  });

  // ── .gitignore ────────────────────────────────────────
  files.push({
    path: ".gitignore",
    description: "Git 忽略规则",
    content: [
      `/node_modules`,
      `/dist`,
      `/coverage`,
      `*.local`,
      `.DS_Store`,
      `.idea`,
      `.vscode/*`,
      `!.vscode/extensions.json`,
    ].join("\n"),
  });

  // ── README.md ────────────────────────────────────────
  files.push({
    path: "README.md",
    description: "项目说明文档",
    content: [
      `# ${escapeHtml(projectName)}`,
      ``,
      `${escapeHtml(projectDesc)}`,
      ``,
      `## 技术栈`,
      ``,
      `- Angular 14 + TypeScript`,
      `- Angular Router（多页面路由）`,
      ``,
      `## 架构（前后端分离 · 分层映射）`,
      ``,
      `输出遵循"CSS / JS / HTML 分层 + 前后端分离"的流行设计模式，与编辑器四大工具一一对应：`,
      ``,
      `| 编辑器 | 生成代码 | 说明 |`,
      `| --- | --- | --- |`,
      `| 画布 Canvas | \`src/styles.css\` + \`src/environments/environment.ts\` | 全局 reset、设计 token、API 环境配置 |`,
      `| 视图 View | \`src/app/pages/{view}/**\` + *.component.css | 每视图一个组件，页面级画布样式独立成 component.css |`,
      `| 图层 Layer | 图层模板 \`layers/*.ts\` | 多图层按图层拆分模板，图层样式收敛到 component.css |`,
      `| 组件 Component | 组件模板 + \`src/scripts/*\` + \`src/api/*\` | 组件 HTML + 事件/数据脚本（JS）+ Facade 服务层 |`,
      ``,
      `### 设计模式`,
      ``,
      `- **CSS/JS/HTML 分离（Angular 组件约定）**：模板、TypeScript、组件专属 \`*.component.css\` 相互独立，样式通过 \`styleUrls\` 引入而非内联。`,
      `- **前后端分离（Facade + 拦截器）**：\`src/api/http.ts\` 统一封装 fetch，依赖注入式暴露；业务通过 \`src/api/index.ts\` 的函数访问接口。`,
      `- **环境配置（12-Factor）**：服务器地址/鉴权头写入 \`src/environments/environment.ts\`（Angular CLI 不读 .env），不硬编码进代码。`,
      `- **模块化 + 依赖注入（DI）**：根模块装配路由与组件，页面组件通过构造器注入 \`DomSanitizer\` 等依赖。`,
      ``,
      `## 快速开始`,
      ``,
      "```bash",
      `npm install`,
      `npm run dev  # 启动开发服务器 (http://localhost:4200)`,
      "```",
      ``,
      `## 构建`,
      ``,
      "```bash",
      `npm run build  # 输出到 dist/`,
      "```",
      ``,
      `## 目录结构`,
      ``,
      "```",
      `src/`,
      `  app/`,
      `    app.module.ts          # 根模块`,
      `    app-routing.module.ts  # 路由表`,
      `    app.component.ts       # 根组件`,
      `    pages/                 # 页面组件（每个视图对应一个页面）`,
      `      *.component.ts       # 单图层模式：单文件页面`,
      `      */layers/            # 多图层模式：按图层拆分子组件`,
      `  scripts/                 # 页面脚本（按视图聚合，文件名含视图名）`,
      `    shared-ui.js            # 公共交互脚本（navbar/pane/anchor 等，全站一份）`,
      `    events-{view}.js        # 事件绑定脚本（有事件绑定时生成）`,
      `    data-{view}.js          # 数据层脚本（有 API/数据绑定时生成）`,
      `    page-scripts-{view}.js  # 视图特有交互脚本（auth 流程、自定义逻辑等）`,
      `  index.html               # Angular 入口`,
      `  main.ts                  # 应用引导`,
      `  styles.css               # 全局样式`,
      "```",
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
          `  - 页面: \`src/app/pages/${v.fileName}/${v.fileName}.component.ts\``,
        ];
        if (layerCount > 1) {
          mapLines.push(`  - 图层(${layerCount}): \`src/app/pages/${v.fileName}/layers/*.ts\``);
        }
        mapLines.push(`  - 路由: \`${v.routePath}\``);
        mapLines.push(`  - 脚本: \`src/scripts/{events,data,page-scripts}-${v.fileName}.js\``);
        return mapLines;
      }).flat(),
      ``,
      `> 由 web-craft 脚手架生成器自动生成`,
    ].join("\n"),
  });

  return files;
};
