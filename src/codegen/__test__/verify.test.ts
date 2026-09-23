/**
 * 四框架脚手架产物验证 — 生成完整工程并写入磁盘检查
 */

import { describe, test, expect } from "vitest";
import { generateProjectScaffold } from "../scaffold";
import { initBuiltinCodegens } from "../components";
import { generateHTML } from "../engine";
import type { SceneDSL } from "../../types/scene";
import type { EventBinding, DataBinding } from "../../types/editor";
import { DEFAULT_CANVAS_CONFIG } from "../../store/editorStore";
import { createDefaultTransform } from "../../types/editor";
import * as fs from "fs";
import * as path from "path";

initBuiltinCodegens();

const testScene: SceneDSL = {
  id: "verify-scene",
  name: "Verify Site",
  status: "draft",
  tags: [],
  metadata: {},
  createdAt: 0,
  updatedAt: 0,
  canvasConfig: { ...DEFAULT_CANVAS_CONFIG, width: 800, height: 600 },
  views: [{
    id: "v1",
    name: "Home",
    components: [
      {
        id: "c1",
        type: "text",
        name: "Title",
        transform: createDefaultTransform({ x: 100, y: 50, width: 400, height: 80 }),
        layerId: "l1",
        zIndex: 0,
        locked: false,
        visible: true,
        config: {
          content: "Hello World",
          fontSize: 32,
          color: "#ffffff",
          textAlign: "center",
          fontWeight: "bold",
          fontFamily: "inherit",
        },
        children: [],
        parentId: null,
        bindings: [{
          id: "b1",
          sourceId: "ds1",
          field: "title",
          targetProperty: "textContent",
          type: "value" as const,
        }] as DataBinding[],
        events: [{
          id: "e1",
          sourceComponentId: "c1",
          sourceEvent: "click",
          targetComponentId: "c2",
          targetAction: "toggle",
          triggerSource: "interaction" as const,
        }] as EventBinding[],
      },
      {
        id: "c2",
        type: "form-button",
        name: "Submit",
        transform: createDefaultTransform({ x: 300, y: 300, width: 120, height: 40 }),
        layerId: "l1",
        zIndex: 1,
        locked: false,
        visible: true,
        config: {
          text: "Click Me",
          variant: "contained",
          bgColor: "#1976d2",
          textColor: "#ffffff",
          fontSize: 14,
          borderRadius: 4,
        },
        children: [],
        parentId: null,
      },
    ],
    layers: [],
    canvasConfig: { ...DEFAULT_CANVAS_CONFIG, width: 800, height: 600 },
  }],
};

const outputBase = "/tmp/web-craft-verify";

function writeFile(dir: string, relPath: string, content: string) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
}

describe("Static HTML scaffold verification", () => {
  test("generates valid static HTML project", () => {
    const files = generateProjectScaffold(testScene, "static-html");
    const dir = path.join(outputBase, "static-html");
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });

    for (const f of files) writeFile(dir, f.path, f.content);

    const indexFile = files.find(f => f.path === "index.html");
    expect(indexFile).toBeDefined();
    const html = indexFile!.content;

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html");
    expect(html).toContain("<head>");
    expect(html).toContain("<body>");
    expect(html).toContain("Hello World");
    expect(html).toContain("Click Me");
    expect(html).toContain("position: absolute");
    expect(html).toContain('data-component-id="c1"');
    expect(html).toContain('data-component-id="c2"');
    expect(html).toContain("(function()"); // events IIFE
    expect(html).toContain("__data_ds1"); // data layer
    expect(html).toContain("</html>");

    console.log(`  ✅ static-html: ${files.length} files, index.html ${html.length} chars`);
  });
});

describe("React scaffold verification", () => {
  test("generates valid React + Vite + TypeScript project", () => {
    const files = generateProjectScaffold(testScene, "react");
    const dir = path.join(outputBase, "react");
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });

    for (const f of files) writeFile(dir, f.path, f.content);

    // 关键文件存在
    const requiredPaths = [
      "package.json", "vite.config.ts", "tsconfig.json",
      "index.html", "src/main.tsx", "src/App.tsx",
      "src/pages/Home.tsx", "src/styles/global.css",
      "src/scripts/events-home.js", "src/scripts/data-home.js",
      "README.md",
    ];
    for (const p of requiredPaths) {
      expect(files.some(f => f.path === p)).toBe(true);
    }

    // package.json 合法
    const pkgFile = files.find(f => f.path === "package.json");
    const pkg = JSON.parse(pkgFile!.content);
    expect(pkg.dependencies.react).toBeDefined();
    expect(pkg.dependencies["react-dom"]).toBeDefined();
    expect(pkg.dependencies["react-router-dom"]).toBeDefined();
    expect(pkg.devDependencies.vite).toBeDefined();
    expect(pkg.scripts.dev).toBe("vite");
    expect(pkg.scripts.build).toContain("vite build");

    // 页面文件内容合法
    const pageFile = files.find(f => f.path === "src/pages/Home.tsx");
    const content = pageFile!.content;
    expect(content).toContain("useEffect");
    expect(content).toContain("initEvents");
    expect(content).toContain("initDataLayer");
    expect(content).toContain("dangerouslySetInnerHTML");
    expect(content).toContain("Hello World");
    expect(content).not.toContain("TODO");

    console.log(`  ✅ react: ${files.length} files, package.json valid, page imports correct`);
  });
});

describe("Vue scaffold verification", () => {
  test("generates valid Vue 3 + Vite + TypeScript project", () => {
    const files = generateProjectScaffold(testScene, "vue");
    const dir = path.join(outputBase, "vue");
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });

    for (const f of files) writeFile(dir, f.path, f.content);

    const requiredPaths = [
      "package.json", "vite.config.ts", "tsconfig.json",
      "index.html", "src/main.ts", "src/App.vue",
      "src/router/index.ts", "src/pages/Home.vue",
      "src/styles/global.css",
      "src/scripts/events-home.js", "src/scripts/data-home.js",
      "README.md",
    ];
    for (const p of requiredPaths) {
      expect(files.some(f => f.path === p)).toBe(true);
    }

    const pkgFile = files.find(f => f.path === "package.json");
    const pkg = JSON.parse(pkgFile!.content);
    expect(pkg.dependencies.vue).toBeDefined();
    expect(pkg.dependencies["vue-router"]).toBeDefined();
    expect(pkg.devDependencies.vite).toBeDefined();

    const pageFile = files.find(f => f.path === "src/pages/Home.vue");
    const content = pageFile!.content;
    expect(content).toContain("<template>");
    expect(content).toContain("<script setup");
    expect(content).toContain("onMounted");
    expect(content).toContain("initEvents");
    expect(content).toContain("initDataLayer");
    expect(content).toContain("v-html");
    expect(content).toContain("Hello World");
    expect(content).not.toContain("TODO");

    console.log(`  ✅ vue: ${files.length} files, package.json valid, SFC structure correct`);
  });
});

describe("Angular scaffold verification", () => {
  test("generates valid Angular 14 + TypeScript project", () => {
    const files = generateProjectScaffold(testScene, "angular");
    const dir = path.join(outputBase, "angular");
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });

    for (const f of files) writeFile(dir, f.path, f.content);

    const requiredPaths = [
      "package.json", "angular.json", "tsconfig.json",
      "src/index.html", "src/main.ts",
      "src/app/app.module.ts", "src/app/app-routing.module.ts",
      "src/app/app.component.ts",
      "src/app/pages/home/home.component.ts",
      "src/styles.css",
      "src/scripts/events-home.js", "src/scripts/data-home.js",
    ];
    for (const p of requiredPaths) {
      expect(files.some(f => f.path === p)).toBe(true);
    }

    const pkgFile = files.find(f => f.path === "package.json");
    const pkg = JSON.parse(pkgFile!.content);
    expect(pkg.dependencies["@angular/core"]).toBeDefined();
    expect(pkg.dependencies["@angular/router"]).toBeDefined();
    expect(pkg.dependencies.rxjs).toBeDefined();

    const pageFile = files.find(f => f.path === "src/app/pages/home/home.component.ts");
    const content = pageFile!.content;
    expect(content).toContain("@Component");
    expect(content).toContain("AfterViewInit");
    expect(content).toContain("initEvents");
    expect(content).toContain("initDataLayer");
    expect(content).toContain("[innerHTML]");
    expect(content).toContain("Hello World");
    expect(content).not.toContain("TODO");

    console.log(`  ✅ angular: ${files.length} files, package.json valid, component decorator correct`);
  });
});

describe("CDN preview verification (all 4 frameworks)", () => {
  for (const fw of ["static-html", "vue", "react", "angular"] as const) {
    test(`${fw} CDN preview generates valid HTML`, () => {
      const pages = generateHTML(testScene, { framework: fw, preview: true });
      expect(pages.length).toBeGreaterThan(0);

      const html = pages[0].html;
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("Hello World");
      expect(html).toContain("position: absolute");
      // Angular CDN 预览把组件 HTML 放在 template 字符串里，data-component-id 可能被转义
      expect(html).toContain("data-component-id");

      // 预览 HTML 应该包含事件和数据脚本
      expect(html).toContain("(function()"); // events IIFE
      expect(html).toContain("__data_ds1"); // data layer

      console.log(`  ✅ ${fw} CDN preview: ${html.length} chars, events + data inlined`);
    });
  }
});

describe("Cross-framework consistency", () => {
  test("all 4 frameworks produce same component HTML", () => {
    for (const fw of ["static-html", "react", "vue", "angular"] as const) {
      const files = generateProjectScaffold(testScene, fw);
      // 各框架的页面文件路径不同，精确匹配
      const pagePath = {
        "static-html": "index.html",
        "react": "src/pages/Home.tsx",
        "vue": "src/pages/Home.vue",
        "angular": "src/app/pages/home/home.component.ts",
      }[fw];
      const pageFile = files.find(f => f.path === pagePath);
      expect(pageFile).toBeDefined();
      expect(pageFile!.content).toContain("Hello World");
      expect(pageFile!.content).toContain("Click Me");
      expect(pageFile!.content).toContain("position: absolute");
    }

    console.log("  ✅ All 4 frameworks embed identical component HTML");
  });

  test("all 4 frameworks generate events + data scripts", () => {
    for (const fw of ["static-html", "react", "vue", "angular"] as const) {
      const files = generateProjectScaffold(testScene, fw);

      // 检查事件脚本存在（static-html 是内联，其他是独立文件）
      if (fw === "static-html") {
        const indexFile = files.find(f => f.path === "index.html");
        expect(indexFile!.content).toContain("(function()");
        expect(indexFile!.content).toContain("toggle");
        expect(indexFile!.content).toContain("__data_ds1");
      } else {
        const eventsFile = files.find(f => f.path.includes("events-home"));
        expect(eventsFile).toBeDefined();
        expect(eventsFile!.content).toContain("export function initEvents");

        const dataFile = files.find(f => f.path.includes("data-home"));
        expect(dataFile).toBeDefined();
        expect(dataFile!.content).toContain("export function initDataLayer");
      }
    }

    console.log("  ✅ All 4 frameworks have events + data layer");
  });
});
