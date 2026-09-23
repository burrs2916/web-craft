/**
 * Codegen engine standalone test
 * Run with: npx tsx src/codegen/__test__/standalone.ts
 *
 * Avoids importing store/editorStore (which triggers logger → import.meta.env)
 */
import { generateHTML } from "../engine";
import { initBuiltinCodegens } from "../components";
import type { SceneDSL } from "../../types/scene";
import type { SceneComponent, Transform } from "../../types/editor";

function makeTransform(overrides: Partial<Transform> = {}): Transform {
  return {
    x: 0, y: 0, width: 200, height: 150,
    rotation: 0, scale: { x: 1, y: 1 },
    ...overrides,
  };
}

function makeComponent(
  id: string,
  type: string,
  name: string,
  config: Record<string, unknown>,
  transformOverrides: Partial<Transform> = {},
): SceneComponent {
  return {
    id,
    type,
    name,
    transform: makeTransform(transformOverrides),
    layerId: "l1",
    zIndex: 0,
    locked: false,
    visible: true,
    config,
    children: [],
    parentId: null,
  };
}

function runTests(): void {
  initBuiltinCodegens();

  // --- Test 1: Text + Button + Image ---
  const scene: SceneDSL = {
    id: "test-1",
    name: "Test Website",
    status: "draft",
    tags: [],
    metadata: {},
    createdAt: 0,
    updatedAt: 0,
    views: [{
      id: "v1",
      name: "Home",
      components: [
        makeComponent("c1", "text", "Title", {
          content: "Hello World",
          fontSize: 32,
          color: "#ffffff",
          textAlign: "center",
          fontWeight: "bold",
          fontFamily: "inherit",
          lineHeight: 1.5,
          letterSpacing: 0,
          fontStyle: "normal",
          textDecoration: "none",
          overflow: "hidden",
          cursor: "default",
          verticalAlign: "middle",
        }, { x: 100, y: 50, width: 400, height: 80 }),
        makeComponent("c2", "form-button", "Button", {
          text: "Click Me",
          variant: "contained",
          bgColor: "#1976d2",
          textColor: "#ffffff",
          fontSize: 14,
          borderRadius: 4,
        }, { x: 300, y: 300, width: 120, height: 40 }),
        makeComponent("c3", "image", "Image", {
          source: "https://example.com/hero.jpg",
          fit: "cover",
          borderRadius: 8,
        }, { x: 50, y: 150, width: 300, height: 200 }),
      ],
      layers: [],
    }],
  };

  const pages = generateHTML(scene, { framework: "static-html", preview: true });

  const assertions: { name: string; pass: boolean }[] = [];

  assertions.push({ name: "Generated 1 page", pass: pages.length === 1 });
  assertions.push({ name: "Filename is index.html", pass: pages[0].filename === "index.html" });
  assertions.push({ name: "Has DOCTYPE", pass: pages[0].html.startsWith("<!DOCTYPE html>") });
  assertions.push({ name: "Has 'Hello World'", pass: pages[0].html.includes("Hello World") });
  assertions.push({ name: "Has 'Click Me'", pass: pages[0].html.includes("Click Me") });
  assertions.push({ name: "Has image src", pass: pages[0].html.includes("example.com/hero.jpg") });
  assertions.push({ name: "Has absolute positioning", pass: pages[0].html.includes("position: absolute") });
  assertions.push({ name: "Has data-component-id", pass: pages[0].html.includes("data-component-id") });

  // --- Test 2: Multi-view ---
  const multiViewScene: SceneDSL = {
    id: "test-2",
    name: "Multi View",
    status: "draft",
    tags: [],
    metadata: {},
    createdAt: 0,
    updatedAt: 0,
    views: [
      {
        id: "v1", name: "Home", components: [
          makeComponent("c1", "text", "Home Title", { content: "Home Page" }),
        ], layers: [],
      },
      {
        id: "v2", name: "About", components: [
          makeComponent("c2", "text", "About Title", { content: "About Page" }),
        ], layers: [],
      },
    ],
  };

  const pages2 = generateHTML(multiViewScene, { framework: "static-html", preview: false });
  assertions.push({ name: "Multi-view: 2 pages", pass: pages2.length === 2 });
  assertions.push({ name: "First page is index.html", pass: pages2[0].filename === "index.html" });
  assertions.push({ name: "Second page is about.html", pass: pages2[1].filename.includes("about") });

  // --- Test 3: Unsupported component ---
  const unsupportedScene: SceneDSL = {
    id: "test-3",
    name: "Unsupported",
    status: "draft",
    tags: [],
    metadata: {},
    createdAt: 0,
    updatedAt: 0,
    views: [{
      id: "v1", name: "Home",
      components: [
        makeComponent("c1", "unknown-type", "Unknown", {}),
      ],
      layers: [],
    }],
  };

  const pages3 = generateHTML(unsupportedScene, { framework: "static-html", preview: true });
  assertions.push({ name: "Unsupported: has placeholder", pass: pages3[0].html.includes("data-unsupported") });
  assertions.push({ name: "Unsupported: shows type name", pass: pages3[0].html.includes("unknown-type") });

  // --- Test 4: Vue framework ---
  const vuePages = generateHTML(scene, { framework: "vue", preview: true });
  assertions.push({ name: "Vue: generated 1 page", pass: vuePages.length === 1 });
  assertions.push({ name: "Vue: has Vue CDN", pass: vuePages[0].html.includes("vue@3") });
  assertions.push({ name: "Vue: has #app mount", pass: vuePages[0].html.includes('id="app"') });
  assertions.push({ name: "Vue: has createApp", pass: vuePages[0].html.includes("createApp") });
  assertions.push({ name: "Vue: has component content", pass: vuePages[0].html.includes("Hello World") });

  // --- Test 5: React framework ---
  const reactPages = generateHTML(scene, { framework: "react", preview: true });
  assertions.push({ name: "React: generated 1 page", pass: reactPages.length === 1 });
  assertions.push({ name: "React: has React CDN", pass: reactPages[0].html.includes("react@18") });
  assertions.push({ name: "React: has #root mount", pass: reactPages[0].html.includes('id="root"') });
  assertions.push({ name: "React: has Babel CDN", pass: reactPages[0].html.includes("babel") });
  assertions.push({ name: "React: has createRoot", pass: reactPages[0].html.includes("createRoot") });

  // --- Test 6: Angular framework ---
  const angularPages = generateHTML(scene, { framework: "angular", preview: true });
  assertions.push({ name: "Angular: generated 1 page", pass: angularPages.length === 1 });
  assertions.push({ name: "Angular: has zone.js", pass: angularPages[0].html.includes("zone.js") });
  assertions.push({ name: "Angular: has SystemJS", pass: angularPages[0].html.includes("systemjs") || angularPages[0].html.includes("System") });
  assertions.push({ name: "Angular: has app-root", pass: angularPages[0].html.includes("<app-root") });
  assertions.push({ name: "Angular: has bootstrap", pass: angularPages[0].html.includes("bootstrapModule") });

  // --- Results ---
  const passed = assertions.filter(a => a.pass).length;
  const failed = assertions.filter(a => !a.pass);

  console.log(`\n=== Codegen Test Results ===`);
  console.log(`${passed}/${assertions.length} passed\n`);

  for (const a of assertions) {
    console.log(`  ${a.pass ? "PASS" : "FAIL"}  ${a.name}`);
  }

  if (failed.length > 0) {
    console.error(`\n${failed.length} test(s) FAILED`);
    process.exit(1);
  }

  console.log(`\nALL TESTS PASSED\n`);

  // Print a sample of the generated HTML
  console.log("=== Sample HTML (first 800 chars) ===");
  console.log(pages[0].html.substring(0, 800));
  console.log("=== end ===\n");
}

runTests();
