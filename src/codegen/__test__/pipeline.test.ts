/**
 * Phase 5 构建管线测试 — 验证 codegen → scaffold → data → events 全链路一致性
 */

import { describe, test, expect } from "vitest";
import { generateProjectScaffold } from "../scaffold";
import { generateViewBody } from "../scaffold/components";
import { generateEventsScript } from "../scaffold/events";
import { generateDataScript } from "../scaffold/data";
import { generateHTML } from "../engine";
import { initBuiltinCodegens } from "../components";
import type { SceneDSL } from "../../types/scene";
import type { EventBinding, DataBinding } from "../../types/editor";
import { DEFAULT_CANVAS_CONFIG } from "../../store/editorStore";
import { createDefaultTransform } from "../../types/editor";

// 完整测试场景：组件 + 事件 + 数据绑定
const fullPipelineScene: SceneDSL = {
  id: "pipeline-test",
  name: "Pipeline Test Site",
  status: "draft",
  tags: [],
  metadata: { localWorkDir: "/tmp/web-craft-test" },
  createdAt: 0,
  updatedAt: 0,
  canvasConfig: { ...DEFAULT_CANVAS_CONFIG, width: 1024, height: 768 },
  views: [{
    id: "v1",
    name: "Dashboard",
    components: [
      {
        id: "metric1",
        type: "metric",
        name: "Revenue",
        transform: createDefaultTransform({ x: 50, y: 50, width: 300, height: 120 }),
        layerId: "l1",
        zIndex: 0,
        locked: false,
        visible: true,
        config: {
          title: "Revenue",
          value: 0,
          unit: "$",
          fontSize: 48,
          color: "#1976d2",
          apiUrl: "https://api.example.com/revenue",
        },
        bindings: [
          {
            id: "b1",
            sourceId: "api1",
            field: "data.value",
            targetProperty: "textContent",
            type: "value",
            transform: "'$' + value.toFixed(2)",
          },
        ] as DataBinding[],
        events: [
          {
            id: "e1",
            sourceComponentId: "metric1",
            sourceEvent: "click",
            targetComponentId: "chart1",
            targetAction: "toggle",
            triggerSource: "interaction",
          },
        ] as EventBinding[],
        children: [],
        parentId: null,
      },
      {
        id: "chart1",
        type: "shape",
        name: "Chart",
        transform: createDefaultTransform({ x: 50, y: 200, width: 600, height: 400 }),
        layerId: "l1",
        zIndex: 1,
        locked: false,
        visible: true,
        config: {
          shape: "rect",
          bgColor: "#f5f5f5",
          borderRadius: 8,
        },
        children: [],
        parentId: null,
      },
    ],
    layers: [],
    canvasConfig: { ...DEFAULT_CANVAS_CONFIG, width: 1024, height: 768 },
    eventBindings: [
      {
        id: "e2",
        sourceComponentId: "metric1",
        sourceEvent: "click",
        targetComponentId: "chart1",
        targetAction: "navigate",
        params: { route: "/details" },
        triggerSource: "interaction",
      },
    ] as EventBinding[],
  }],
};

describe("Phase 5: build pipeline integration", () => {
  test("full pipeline: generateViewBody collects events + dataBindings", () => {
    initBuiltinCodegens();
    const view = fullPipelineScene.views![0];
    const body = generateViewBody(view, fullPipelineScene);

    expect(body.html).toContain("Revenue");
    expect(body.html).toContain('data-component-id="metric1"');
    expect(body.html).toContain('data-component-id="chart1"');
    expect(body.events.length).toBe(2); // 1 component + 1 view
    expect(body.dataBindings.length).toBe(1);
    expect(body.dataBindings[0].sourceId).toBe("api1");
    expect(body.dataBindings[0].field).toBe("data.value");
  });

  test("full pipeline: events script + data script both generated", () => {
    initBuiltinCodegens();
    const view = fullPipelineScene.views![0];
    const body = generateViewBody(view, fullPipelineScene);
    const eventResult = generateEventsScript(body.events);
    const dataResult = generateDataScript(view, fullPipelineScene);

    expect(eventResult.hasEvents).toBe(true);
    expect(eventResult.inlineScript).toContain("toggle");
    expect(eventResult.inlineScript).toContain("navigate");

    expect(dataResult.hasData).toBe(true);
    expect(dataResult.inlineScript).toContain("api1");
    expect(dataResult.inlineScript).toContain("data.value");
  });

  test("React scaffold with full pipeline produces events + data files", () => {
    initBuiltinCodegens();
    const files = generateProjectScaffold(fullPipelineScene, "react");
    const eventsFile = files.find((f) => f.path === "src/scripts/events-dashboard.js");
    const dataFile = files.find((f) => f.path === "src/scripts/data-dashboard.js");
    const pageFile = files.find((f) => f.path === "src/pages/Dashboard.tsx");

    expect(eventsFile).toBeDefined();
    expect(dataFile).toBeDefined();
    expect(pageFile).toBeDefined();

    // Page file should import both
    expect(pageFile!.content).toContain("import { initEvents }");
    expect(pageFile!.content).toContain("import { initDataLayer }");
    expect(pageFile!.content).toContain("useEffect");
    expect(pageFile!.content).toContain("initEvents()");
    expect(pageFile!.content).toContain("initDataLayer()");
  });

  test("Vue scaffold with full pipeline produces events + data files", () => {
    initBuiltinCodegens();
    const files = generateProjectScaffold(fullPipelineScene, "vue");
    const eventsFile = files.find((f) => f.path === "src/scripts/events-dashboard.js");
    const dataFile = files.find((f) => f.path === "src/scripts/data-dashboard.js");
    const pageFile = files.find((f) => f.path === "src/pages/Dashboard.vue");

    expect(eventsFile).toBeDefined();
    expect(dataFile).toBeDefined();
    expect(pageFile).toBeDefined();
    expect(pageFile!.content).toContain("onMounted");
    expect(pageFile!.content).toContain("initEvents()");
    expect(pageFile!.content).toContain("initDataLayer()");
  });

  test("Angular scaffold with full pipeline produces events + data files", () => {
    initBuiltinCodegens();
    const files = generateProjectScaffold(fullPipelineScene, "angular");
    const eventsFile = files.find((f) => f.path === "src/scripts/events-dashboard.js");
    const dataFile = files.find((f) => f.path === "src/scripts/data-dashboard.js");
    const pageFile = files.find((f) => f.path === "src/app/pages/dashboard/dashboard.component.ts");

    expect(eventsFile).toBeDefined();
    expect(dataFile).toBeDefined();
    expect(pageFile).toBeDefined();
    expect(pageFile!.content).toContain("AfterViewInit");
    expect(pageFile!.content).toContain("initEvents()");
    expect(pageFile!.content).toContain("initDataLayer()");
  });

  test("Static HTML scaffold with full pipeline inlines events + data scripts", () => {
    initBuiltinCodegens();
    const files = generateProjectScaffold(fullPipelineScene, "static-html");
    const indexFile = files.find((f) => f.path === "index.html");

    expect(indexFile).toBeDefined();
    expect(indexFile!.content).toContain("Revenue");
    expect(indexFile!.content).toContain("(function()");
    expect(indexFile!.content).toContain("toggle");
    expect(indexFile!.content).toContain("api1");
  });

  test("CDN preview HTML includes events + data scripts", () => {
    initBuiltinCodegens();
    const pages = generateHTML(fullPipelineScene, {
      framework: "static-html",
      preview: true,
    });

    expect(pages.length).toBeGreaterThan(0);
    const html = pages[0].html;
    expect(html).toContain("Revenue");
    expect(html).toContain("(function()");
    expect(html).toContain("toggle");
    expect(html).toContain("api1");
    expect(html).toContain("data.value");
  });

  test("scaffold README mentions build commands", () => {
    initBuiltinCodegens();
    const files = generateProjectScaffold(fullPipelineScene, "react");
    const readme = files.find((f) => f.path === "README.md");

    expect(readme).toBeDefined();
    expect(readme!.content).toContain("npm install");
    expect(readme!.content).toContain("npm run dev");
    expect(readme!.content).toContain("npm run build");
  });

  test("localWorkDir is embedded in scene metadata for build pipeline", () => {
    expect(fullPipelineScene.metadata?.localWorkDir).toBe("/tmp/web-craft-test");
  });
});
