import { describe, test, expect } from "vitest";
import { generateProjectScaffold } from "../scaffold";
import { generateViewBody, generateLayerHTML } from "../scaffold/components";
import { generateEventsScript } from "../scaffold/events";
import { generateDataScript } from "../scaffold/data";
import { generateHTML } from "../engine";
import { initBuiltinCodegens } from "../components";
import type { SceneDSL } from "../../types/scene";
import type { EventBinding, DataBinding } from "../../types/editor";
import { DEFAULT_CANVAS_CONFIG } from "../../store/editorStore";
import { createDefaultTransform } from "../../types/editor";
import { deriveLayers } from "../scaffold/utils";

// 测试用场景（无事件）
const testScene: SceneDSL = {
  id: "test-scene",
  name: "Test Site",
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

// 带事件绑定的测试场景
const testBindings: EventBinding[] = [
  {
    id: "evt1",
    sourceComponentId: "c2",
    sourceEvent: "click",
    targetComponentId: "c1",
    targetAction: "toggle",
    triggerSource: "interaction",
  },
  {
    id: "evt2",
    sourceComponentId: "c2",
    sourceEvent: "mouseenter",
    targetComponentId: "c1",
    targetAction: "show",
    triggerSource: "interaction",
    throttle: 500,
  },
  {
    id: "evt3",
    sourceComponentId: "c2",
    sourceEvent: "click",
    targetComponentId: "c1",
    targetAction: "navigate",
    params: { route: "/about" },
    triggerSource: "interaction",
    debounce: 300,
  },
];

const testSceneWithEvents: SceneDSL = {
  ...testScene,
  id: "test-events-scene",
  views: [{
    ...testScene.views![0],
    eventBindings: testBindings,
  }],
};

describe("scaffold + component codegen integration", () => {
  test("generateViewBody produces component HTML with data-component-id", () => {
    initBuiltinCodegens();
    const result = generateViewBody(testScene.views![0], testScene);
    expect(result.html).toContain("Hello World");
    expect(result.html).toContain("Click Me");
    expect(result.html).toContain("position: absolute");
    expect(result.html).toContain('data-component-id="c1"');
    expect(result.html).toContain('data-component-id="c2"');
  });

  test("React scaffold embeds component HTML in .tsx", () => {
    initBuiltinCodegens();
    const files = generateProjectScaffold(testScene, "react");
    const pageFile = files.find((f) => f.path === "src/pages/Home.tsx");
    expect(pageFile).toBeDefined();
    expect(pageFile!.content).toContain("Hello World");
    expect(pageFile!.content).toContain("Click Me");
    expect(pageFile!.content).toContain("dangerouslySetInnerHTML");
    expect(pageFile!.content).not.toContain("TODO");
  });

  test("Vue scaffold embeds component HTML in .vue", () => {
    initBuiltinCodegens();
    const files = generateProjectScaffold(testScene, "vue");
    const pageFile = files.find((f) => f.path === "src/pages/Home.vue");
    expect(pageFile).toBeDefined();
    expect(pageFile!.content).toContain("Hello World");
    expect(pageFile!.content).toContain("Click Me");
    expect(pageFile!.content).toContain("v-html");
    expect(pageFile!.content).not.toContain("TODO");
  });

  test("Angular scaffold embeds component HTML in component.ts", () => {
    initBuiltinCodegens();
    const files = generateProjectScaffold(testScene, "angular");
    const pageFile = files.find((f) => f.path === "src/app/pages/home/home.component.ts");
    expect(pageFile).toBeDefined();
    expect(pageFile!.content).toContain("Hello World");
    expect(pageFile!.content).toContain("Click Me");
    expect(pageFile!.content).toContain("[innerHTML]");
    expect(pageFile!.content).not.toContain("TODO");
  });

  test("Static HTML scaffold embeds component HTML directly", () => {
    initBuiltinCodegens();
    const files = generateProjectScaffold(testScene, "static-html");
    const indexFile = files.find((f) => f.path === "index.html");
    expect(indexFile).toBeDefined();
    expect(indexFile!.content).toContain("Hello World");
    expect(indexFile!.content).toContain("Click Me");
    expect(indexFile!.content).not.toContain("TODO");
  });

  test("all 4 frameworks produce valid project structures", () => {
    initBuiltinCodegens();
    const frameworks = ["react", "vue", "angular", "static-html"] as const;
    for (const fw of frameworks) {
      const files = generateProjectScaffold(testScene, fw);
      expect(files.length).toBeGreaterThan(3);
      const hasEntry = files.some((f) =>
        f.path === "package.json" || f.path === "index.html" || f.path === "src/index.html"
      );
      expect(hasEntry).toBe(true);
    }
  });
});

describe("events codegen", () => {
  test("generateEventsScript produces interaction event bindings", () => {
    initBuiltinCodegens();
    const result = generateEventsScript(testBindings);
    expect(result.hasEvents).toBe(true);
    expect(result.script).toContain("addEventListener");
    expect(result.script).toContain("click");
    expect(result.script).toContain("mouseenter");
    expect(result.script).toContain("c2");
    expect(result.script).toContain("c1");
    expect(result.script).toContain("toggle");
    expect(result.script).toContain("show");
    expect(result.script).toContain("navigate");
  });

  test("generateEventsScript applies throttle and debounce", () => {
    initBuiltinCodegens();
    const result = generateEventsScript(testBindings);
    expect(result.script).toContain("throttle");
    expect(result.script).toContain("debounce");
  });

  test("generateEventsScript produces module export format", () => {
    initBuiltinCodegens();
    const result = generateEventsScript(testBindings);
    expect(result.module).toContain("export function initEvents");
    expect(result.module).toContain("addEventListener");
  });

  test("generateEventsScript produces IIFE inline script format", () => {
    initBuiltinCodegens();
    const result = generateEventsScript(testBindings);
    expect(result.inlineScript).toContain("(function()");
    expect(result.inlineScript).toContain("addEventListener");
  });

  test("generateEventsScript handles empty events", () => {
    initBuiltinCodegens();
    const result = generateEventsScript([]);
    expect(result.hasEvents).toBe(false);
    expect(result.script).toBe("");
    expect(result.module).toBe("");
    expect(result.inlineScript).toBe("");
  });

  test("generateEventsScript handles timer trigger", () => {
    initBuiltinCodegens();
    const timerBindings: EventBinding[] = [{
      id: "evt-timer",
      sourceComponentId: "c2",
      sourceEvent: "timer",
      targetComponentId: "c1",
      targetAction: "toggle",
      triggerSource: "timer",
      timerTrigger: { interval: 3000, once: false, delay: 500 },
    }];
    const result = generateEventsScript(timerBindings);
    expect(result.hasEvents).toBe(true);
    expect(result.script).toContain("setInterval");
    expect(result.script).toContain("3000");
    expect(result.script).toContain("500");
  });

  test("React scaffold generates events script file and imports it", () => {
    initBuiltinCodegens();
    const files = generateProjectScaffold(testSceneWithEvents, "react");
    const eventsFile = files.find((f) => f.path === "src/scripts/events-home.js");
    expect(eventsFile).toBeDefined();
    expect(eventsFile!.content).toContain("export function initEvents");
    expect(eventsFile!.content).toContain("addEventListener");

    const pageFile = files.find((f) => f.path === "src/pages/Home.tsx");
    expect(pageFile).toBeDefined();
    expect(pageFile!.content).toContain("import { initEvents }");
    expect(pageFile!.content).toContain("useEffect");
    expect(pageFile!.content).toContain("initEvents()");
  });

  test("Vue scaffold generates events script file and calls onMounted", () => {
    initBuiltinCodegens();
    const files = generateProjectScaffold(testSceneWithEvents, "vue");
    const eventsFile = files.find((f) => f.path === "src/scripts/events-home.js");
    expect(eventsFile).toBeDefined();
    expect(eventsFile!.content).toContain("export function initEvents");

    const pageFile = files.find((f) => f.path === "src/pages/Home.vue");
    expect(pageFile).toBeDefined();
    expect(pageFile!.content).toContain("import { initEvents }");
    expect(pageFile!.content).toContain("onMounted");
    expect(pageFile!.content).toContain("initEvents()");
  });

  test("Angular scaffold generates events script and ngAfterViewInit", () => {
    initBuiltinCodegens();
    const files = generateProjectScaffold(testSceneWithEvents, "angular");
    const eventsFile = files.find((f) => f.path === "src/scripts/events-home.js");
    expect(eventsFile).toBeDefined();

    const pageFile = files.find((f) => f.path === "src/app/pages/home/home.component.ts");
    expect(pageFile).toBeDefined();
    expect(pageFile!.content).toContain("AfterViewInit");
    expect(pageFile!.content).toContain("initEvents");
  });

  test("Static HTML scaffold inlines events script", () => {
    initBuiltinCodegens();
    const files = generateProjectScaffold(testSceneWithEvents, "static-html");
    const indexFile = files.find((f) => f.path === "index.html");
    expect(indexFile).toBeDefined();
    expect(indexFile!.content).toContain("addEventListener");
    expect(indexFile!.content).toContain("(function()");
  });

  test("scaffold without events does not generate events files", () => {
    initBuiltinCodegens();
    const files = generateProjectScaffold(testScene, "react");
    const eventsFile = files.find((f) => f.path === "src/scripts/events-home.js");
    expect(eventsFile).toBeUndefined();
  });
});

// ── 数据层 codegen 测试 ──────────────────────────────────

// 带数据绑定的测试场景
const testDataBindings: DataBinding[] = [
  {
    id: "bnd1",
    sourceId: "ds1",
    field: "name",
    targetProperty: "textContent",
    type: "value",
  },
  {
    id: "bnd2",
    sourceId: "ds1",
    field: "color",
    targetProperty: "style.color",
    type: "style",
  },
  {
    id: "bnd3",
    sourceId: "ds1",
    field: "visible",
    targetProperty: "visible",
    type: "visibility",
  },
];

const testSceneWithData: SceneDSL = {
  ...testScene,
  id: "test-data-scene",
  views: [{
    ...testScene.views![0],
    components: [
      {
        ...testScene.views![0].components[0],
        bindings: testDataBindings,
        config: {
          ...testScene.views![0].components[0].config,
          dataSourceId: "ds1",
          staticData: { name: "Dynamic Title", color: "#ff6600", visible: true },
        },
      },
      ...testScene.views![0].components.slice(1),
    ],
  }],
};

// 带 API 数据源的测试场景
const testSceneWithApi: SceneDSL = {
  ...testScene,
  id: "test-api-scene",
  views: [{
    ...testScene.views![0],
    components: [
      {
        ...testScene.views![0].components[0],
        bindings: [{
          id: "bnd-api",
          sourceId: "api1",
          field: "result.title",
          targetProperty: "textContent",
          type: "value",
          transform: "value + '!'",
        }],
        config: {
          ...testScene.views![0].components[0].config,
          dataSourceId: "api1",
          apiConfig: {
            url: "https://api.example.com/data",
            method: "GET",
            refreshInterval: 5000,
          },
        },
      },
      ...testScene.views![0].components.slice(1),
    ],
  }],
};

describe("data layer codegen", () => {
  test("generateDataScript handles empty bindings", () => {
    initBuiltinCodegens();
    const result = generateDataScript(testScene.views![0], testScene);
    expect(result.hasData).toBe(false);
    expect(result.inlineScript).toBe("");
    expect(result.module).toBe("");
    expect(result.bindingCount).toBe(0);
  });

  test("generateDataScript produces static data bindings", () => {
    initBuiltinCodegens();
    const view = testSceneWithData.views![0];
    const result = generateDataScript(view, testSceneWithData);
    expect(result.hasData).toBe(true);
    expect(result.bindingCount).toBe(3);
    expect(result.inlineScript).toContain("__data_ds1");
    expect(result.inlineScript).toContain("Dynamic Title");
    expect(result.inlineScript).toContain("applyBinding");
    expect(result.inlineScript).toContain("textContent");
    expect(result.inlineScript).toContain("style.color");
    expect(result.inlineScript).toContain("visibility");
  });

  test("generateDataScript produces API fetch + polling", () => {
    initBuiltinCodegens();
    const view = testSceneWithApi.views![0];
    const result = generateDataScript(view, testSceneWithApi);
    expect(result.hasData).toBe(true);
    expect(result.inlineScript).toContain("fetch");
    expect(result.inlineScript).toContain("https://api.example.com/data");
    expect(result.inlineScript).toContain("setInterval");
    expect(result.inlineScript).toContain("5000");
    expect(result.inlineScript).toContain("result.title");
  });

  test("generateDataScript applies transform expression", () => {
    initBuiltinCodegens();
    const view = testSceneWithApi.views![0];
    const result = generateDataScript(view, testSceneWithApi);
    expect(result.inlineScript).toContain("applyTransform");
    expect(result.inlineScript).toContain("value + '!'");
  });

  test("generateDataScript produces module export format", () => {
    initBuiltinCodegens();
    const view = testSceneWithData.views![0];
    const result = generateDataScript(view, testSceneWithData);
    expect(result.module).toContain("export function initDataLayer");
  });

  test("generateDataScript produces IIFE inline script format", () => {
    initBuiltinCodegens();
    const view = testSceneWithData.views![0];
    const result = generateDataScript(view, testSceneWithData);
    expect(result.inlineScript).toContain("(function()");
    expect(result.inlineScript).toContain("onReady");
  });

  test("React scaffold generates data script file and imports it", () => {
    initBuiltinCodegens();
    const files = generateProjectScaffold(testSceneWithData, "react");
    const dataFile = files.find((f) => f.path === "src/scripts/data-home.js");
    expect(dataFile).toBeDefined();
    expect(dataFile!.content).toContain("export function initDataLayer");
    expect(dataFile!.content).toContain("__data_ds1");

    const pageFile = files.find((f) => f.path === "src/pages/Home.tsx");
    expect(pageFile).toBeDefined();
    expect(pageFile!.content).toContain("import { initDataLayer }");
    expect(pageFile!.content).toContain("initDataLayer()");
  });

  test("Vue scaffold generates data script file and calls onMounted", () => {
    initBuiltinCodegens();
    const files = generateProjectScaffold(testSceneWithData, "vue");
    const dataFile = files.find((f) => f.path === "src/scripts/data-home.js");
    expect(dataFile).toBeDefined();
    expect(dataFile!.content).toContain("export function initDataLayer");

    const pageFile = files.find((f) => f.path === "src/pages/Home.vue");
    expect(pageFile).toBeDefined();
    expect(pageFile!.content).toContain("import { initDataLayer }");
    expect(pageFile!.content).toContain("onMounted");
    expect(pageFile!.content).toContain("initDataLayer()");
  });

  test("Angular scaffold generates data script and ngAfterViewInit", () => {
    initBuiltinCodegens();
    const files = generateProjectScaffold(testSceneWithData, "angular");
    const dataFile = files.find((f) => f.path === "src/scripts/data-home.js");
    expect(dataFile).toBeDefined();

    const pageFile = files.find((f) => f.path === "src/app/pages/home/home.component.ts");
    expect(pageFile).toBeDefined();
    expect(pageFile!.content).toContain("AfterViewInit");
    expect(pageFile!.content).toContain("initDataLayer");
  });

  test("Static HTML scaffold inlines data script", () => {
    initBuiltinCodegens();
    const files = generateProjectScaffold(testSceneWithData, "static-html");
    const indexFile = files.find((f) => f.path === "index.html");
    expect(indexFile).toBeDefined();
    // Static HTML uses inline IIFE, not module export
    expect(indexFile!.content).toContain("__data_ds1");
    expect(indexFile!.content).toContain("Dynamic Title");
    expect(indexFile!.content).toContain("applyBinding");
    expect(indexFile!.content).toContain("(function()");
  });

  test("scaffold without data bindings does not generate data files", () => {
    initBuiltinCodegens();
    const files = generateProjectScaffold(testScene, "react");
    const dataFile = files.find((f) => f.path === "src/scripts/data-home.js");
    expect(dataFile).toBeUndefined();
  });

  test("CDN engine includes data script in preview HTML", () => {
    initBuiltinCodegens();
    const pages = generateHTML(testSceneWithData, { framework: "static-html", preview: true });
    expect(pages.length).toBeGreaterThan(0);
    expect(pages[0].html).toContain("__data_ds1");
    expect(pages[0].html).toContain("applyBinding");
  });
});

// ── 图层感知 codegen 测试 ──────────────────────────────────

// 多图层测试场景：两个图层，各含一个组件
const testSceneWithLayers: SceneDSL = {
  id: "test-layers-scene",
  name: "Layered Site",
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
        layerId: "layer-header",
        zIndex: 0,
        locked: false,
        visible: true,
        config: {
          content: "Header Text",
          fontSize: 32,
          color: "#ffffff",
          textAlign: "center",
          fontWeight: "bold",
          fontFamily: "inherit",
        },
        children: [],
        parentId: null,
      },
      {
        id: "c2",
        type: "form-button",
        name: "Submit",
        transform: createDefaultTransform({ x: 300, y: 300, width: 120, height: 40 }),
        layerId: "layer-content",
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
    layers: [
      {
        id: "layer-header",
        name: "Header",
        type: "layer",
        visible: true,
        locked: false,
        opacity: 1,
        parentId: null,
        children: [],
        order: 0,
        expanded: true,
        isDefault: true,
      },
      {
        id: "layer-content",
        name: "Content",
        type: "layer",
        visible: true,
        locked: false,
        opacity: 0.8,
        parentId: null,
        children: [],
        order: 1,
        expanded: true,
      },
    ],
    canvasConfig: { ...DEFAULT_CANVAS_CONFIG, width: 800, height: 600 },
  }],
};

describe("layer-aware codegen", () => {
  test("deriveLayers returns empty for single-layer views", () => {
    const result = deriveLayers(testScene.views![0]);
    expect(result).toHaveLength(0);
  });

  test("deriveLayers returns layer scaffolds for multi-layer views", () => {
    const result = deriveLayers(testSceneWithLayers.views![0]);
    expect(result).toHaveLength(2);
    expect(result[0].componentName).toBe("Header");
    expect(result[0].fileName).toBe("header");
    expect(result[0].components).toHaveLength(1);
    expect(result[1].componentName).toBe("Content");
    expect(result[1].fileName).toBe("content");
    expect(result[1].opacity).toBe(0.8);
  });

  test("generateLayerHTML produces HTML for a specific layer only", () => {
    initBuiltinCodegens();
    const view = testSceneWithLayers.views![0];
    const headerHTML = generateLayerHTML("layer-header", view, testSceneWithLayers);
    const contentHTML = generateLayerHTML("layer-content", view, testSceneWithLayers);

    expect(headerHTML).toContain("Header Text");
    expect(headerHTML).not.toContain("Click Me");

    expect(contentHTML).toContain("Click Me");
    expect(contentHTML).not.toContain("Header Text");
  });

  test("React scaffold generates layer sub-components when layers > 1", () => {
    initBuiltinCodegens();
    const files = generateProjectScaffold(testSceneWithLayers, "react");

    // 页面文件仍存在
    const pageFile = files.find((f) => f.path === "src/pages/Home.tsx");
    expect(pageFile).toBeDefined();
    expect(pageFile!.content).toContain("import Header from './Home/layers/Header'");
    expect(pageFile!.content).toContain("import Content from './Home/layers/Content'");
    expect(pageFile!.content).toContain("<Header />");
    expect(pageFile!.content).toContain("<Content />");

    // 图层子组件文件
    const headerLayer = files.find((f) => f.path === "src/pages/Home/layers/Header.tsx");
    expect(headerLayer).toBeDefined();
    expect(headerLayer!.content).toContain("Header Text");
    expect(headerLayer!.content).toContain("layer-header");

    const contentLayer = files.find((f) => f.path === "src/pages/Home/layers/Content.tsx");
    expect(contentLayer).toBeDefined();
    expect(contentLayer!.content).toContain("Click Me");
    expect(contentLayer!.content).toContain("layer-content");
    // CSS/JS/HTML 分离：图层定位/透明度样式抽到页面级 CSS，不再内联在组件
    expect(contentLayer!.content).toContain("import '../../../styles/pages/Home.css'");
    expect(contentLayer!.content).not.toContain("pointerEvents");

    const pageCss = files.find((f) => f.path === "src/styles/pages/Home.css");
    expect(pageCss).toBeDefined();
    expect(pageCss!.content).toContain(".layer-header");
    expect(pageCss!.content).toContain(".layer-content");
    // opacity 应传递到图层所在页面 CSS
    expect(pageCss!.content).toContain("opacity: 0.8");
  });

  test("Vue scaffold generates layer sub-components when layers > 1", () => {
    initBuiltinCodegens();
    const files = generateProjectScaffold(testSceneWithLayers, "vue");

    const pageFile = files.find((f) => f.path === "src/pages/Home.vue");
    expect(pageFile).toBeDefined();
    expect(pageFile!.content).toContain("import Header from './Home/layers/Header.vue'");
    expect(pageFile!.content).toContain("import Content from './Home/layers/Content.vue'");
    expect(pageFile!.content).toContain("<Header />");
    expect(pageFile!.content).toContain("<Content />");

    const headerLayer = files.find((f) => f.path === "src/pages/Home/layers/Header.vue");
    expect(headerLayer).toBeDefined();
    expect(headerLayer!.content).toContain("Header Text");

    const contentLayer = files.find((f) => f.path === "src/pages/Home/layers/Content.vue");
    expect(contentLayer).toBeDefined();
    expect(contentLayer!.content).toContain("Click Me");
  });

  test("Angular scaffold generates layer template modules when layers > 1", () => {
    initBuiltinCodegens();
    const files = generateProjectScaffold(testSceneWithLayers, "angular");

    const pageFile = files.find((f) => f.path === "src/app/pages/home/home.component.ts");
    expect(pageFile).toBeDefined();
    expect(pageFile!.content).toContain("import { headerHTML } from './layers/header';");
    expect(pageFile!.content).toContain("import { contentHTML } from './layers/content';");
    expect(pageFile!.content).toContain("[innerHTML]");
    // CSS/JS/HTML 分离：组件引用 styleUrls 而非内联 styles
    expect(pageFile!.content).toContain("styleUrls: ['./home.component.css']");

    const headerLayer = files.find((f) => f.path === "src/app/pages/home/layers/header.ts");
    expect(headerLayer).toBeDefined();
    expect(headerLayer!.content).toContain("headerHTML");
    expect(headerLayer!.content).toContain("Header Text");

    const contentLayer = files.find((f) => f.path === "src/app/pages/home/layers/content.ts");
    expect(contentLayer).toBeDefined();
    expect(contentLayer!.content).toContain("contentHTML");
    expect(contentLayer!.content).toContain("Click Me");

    const pageCss = files.find((f) => f.path === "src/app/pages/home/home.component.css");
    expect(pageCss).toBeDefined();
    expect(pageCss!.content).toContain(".page-home");
    expect(pageCss!.content).toContain(".layer-content");
    // opacity 应传递到图层所在 component.css
    expect(pageCss!.content).toContain("opacity: 0.8");
  });

  test("Static HTML scaffold wraps components in layer divs when layers > 1", () => {
    initBuiltinCodegens();
    const files = generateProjectScaffold(testSceneWithLayers, "static-html");

    const indexFile = files.find((f) => f.path === "index.html");
    expect(indexFile).toBeDefined();
    expect(indexFile!.content).toContain('class="layer layer-header"');
    expect(indexFile!.content).toContain('class="layer layer-content"');
    expect(indexFile!.content).toContain("Header Text");
    expect(indexFile!.content).toContain("Click Me");
    // CSS/JS/HTML 分离：页面链接独立 CSS 与 http 客户端，图层内不再内联定位样式
    expect(indexFile!.content).toContain('href="assets/css/pages/home.css"');
    expect(indexFile!.content).toContain('src="assets/js/http.js"');
    expect(indexFile!.content).not.toContain("opacity: 0.8");

    const pageCss = files.find((f) => f.path === "assets/css/pages/home.css");
    expect(pageCss).toBeDefined();
    expect(pageCss!.content).toContain(".page-home");
    expect(pageCss!.content).toContain(".layer-content");
    // opacity 应传递到图层所在页面 CSS（不再内联）
    expect(pageCss!.content).toContain("opacity: 0.8");
  });

  test("CDN engine wraps components in layer divs when layers > 1", () => {
    initBuiltinCodegens();
    const pages = generateHTML(testSceneWithLayers, { framework: "static-html", preview: true });
    expect(pages.length).toBeGreaterThan(0);
    expect(pages[0].html).toContain('class="layer layer-header"');
    expect(pages[0].html).toContain('class="layer layer-content"');
    expect(pages[0].html).toContain("Header Text");
    expect(pages[0].html).toContain("Click Me");
  });

  test("single-layer views still use original non-layer codegen path", () => {
    initBuiltinCodegens();
    const files = generateProjectScaffold(testScene, "react");
    // 不应有 layers 子目录文件
    const layerFile = files.find((f) => f.path.includes("/layers/"));
    expect(layerFile).toBeUndefined();

    const pageFile = files.find((f) => f.path === "src/pages/Home.tsx");
    expect(pageFile).toBeDefined();
    // 应直接嵌入 HTML，不是导入图层组件
    expect(pageFile!.content).toContain("dangerouslySetInnerHTML");
    expect(pageFile!.content).toContain("componentHTML");
  });

  test("四种模板统一接入 env/api/http 前后端分离层", () => {
    initBuiltinCodegens();

    // Vue
    const vueFiles = generateProjectScaffold(testScene, "vue");
    expect(vueFiles.find((f) => f.path === ".env")?.content).toContain("VITE_API_BASE_URL");
    expect(vueFiles.find((f) => f.path === "src/api/http.ts")?.content).toContain("window.__wc_http");
    expect(vueFiles.find((f) => f.path === "src/api/index.ts")?.content).toContain("userApi");
    // resolveUrl 只豁免绝对 URL：/api/* 也必须拼基地址，否则 base 对业务接口永不生效
    expect(vueFiles.find((f) => f.path === "src/api/http.ts")?.content).not.toContain("startsWith('/api/')");
    // .env 的 token 变量必须被 http 客户端消费（不能是死配置）
    expect(vueFiles.find((f) => f.path === "src/api/http.ts")?.content).toContain("VITE_API_TOKEN_HEADER");
    expect(vueFiles.find((f) => f.path === "src/api/http.ts")?.content).toContain("VITE_AUTH_STORAGE");

    // Angular
    const ngFiles = generateProjectScaffold(testScene, "angular");
    // Angular CLI 不读 .env：环境配置走标准 src/environments/
    expect(ngFiles.find((f) => f.path === ".env")).toBeUndefined();
    expect(ngFiles.find((f) => f.path === "src/environments/environment.ts")?.content).toContain("apiBaseUrl");
    expect(ngFiles.find((f) => f.path === "src/api/http.ts")?.content).toContain("from '../environments/environment'");
    // Angular 产物不得依赖 import.meta.env（无 vite/client 类型，ng build 会编译失败）
    expect(ngFiles.find((f) => f.path === "src/api/http.ts")?.content).not.toContain("import.meta.env");

    // static-html：无构建步骤 → 非模块版 http 客户端
    const staticFiles = generateProjectScaffold(testScene, "static-html");
    expect(staticFiles.find((f) => f.path === "assets/js/http.js")?.content).toContain("window.__wc_http");
    expect(staticFiles.find((f) => f.path === "assets/js/http.js")?.content).toContain("})(window);");
    // 静态版同样不豁免 /api/*（与模块版行为一致）
    expect(staticFiles.find((f) => f.path === "assets/js/http.js")?.content).not.toContain("indexOf('/api/')");
    // 静态版 getToken 完整（storage 读取不能缺失）
    expect(staticFiles.find((f) => f.path === "assets/js/http.js")?.content).toContain("__wc_getToken");

    // 各模板主页链接/引入 http 客户端
    const reactFiles = generateProjectScaffold(testScene, "react");
    expect(reactFiles.find((f) => f.path === "src/api/http.ts")?.content).toContain("window.__wc_http");
  });

  test("单图层模式同样抽离页面 CSS（四模板对齐）", () => {
    initBuiltinCodegens();

    // React：去内联 pageStyle/<style> 注入，样式抽到 src/styles/pages/*.css
    const reactFiles = generateProjectScaffold(testScene, "react");
    const reactPage = reactFiles.find((f) => f.path === "src/pages/Home.tsx");
    expect(reactPage!.content).toContain("import '../styles/pages/Home.css'");
    expect(reactPage!.content).not.toContain("pageStyle");
    expect(reactPage!.content).not.toContain("dangerouslySetInnerHTML={{ __html: extraStyles }}");
    expect(reactFiles.find((f) => f.path === "src/styles/pages/Home.css")?.content).toContain(".page-home");

    // Vue：页面样式抽到 src/styles/pages/*.css，页面组件 import 而非 scoped <style>
    const vueFiles = generateProjectScaffold(testScene, "vue");
    const vuePage = vueFiles.find((f) => f.path === "src/pages/Home.vue");
    expect(vuePage!.content).toContain("import '../../styles/pages/Home.css'");
    expect(vuePage!.content).not.toContain("<style scoped>");
    expect(vueFiles.find((f) => f.path === "src/styles/pages/Home.css")?.content).toContain(".page-home");

    // Angular：页面样式抽到 component.css，组件用 styleUrls
    const ngFiles = generateProjectScaffold(testScene, "angular");
    const ngPage = ngFiles.find((f) => f.path === "src/app/pages/home/home.component.ts");
    expect(ngPage!.content).toContain("styleUrls: ['./home.component.css']");
    expect(ngPage!.content).not.toContain("styles: [");
    expect(ngFiles.find((f) => f.path === "src/app/pages/home/home.component.css")?.content).toContain(".page-home");

    // static-html：页面样式抽到 assets/css/pages/*.css，页面区去除内联 context 样式
    const staticFiles = generateProjectScaffold(testScene, "static-html");
    const staticIndex = staticFiles.find((f) => f.path === "index.html");
    expect(staticIndex!.content).toContain('href="assets/css/pages/home.css"');
    expect(staticIndex!.content).toContain('<div class="page page-home" data-design-width="800" data-design-height="600">');
    expect(staticIndex!.content).not.toContain('page-home" data-design-width="800" data-design-height="600" style=');
    expect(staticFiles.find((f) => f.path === "assets/css/pages/home.css")?.content).toContain(".page-home");
  });
});
