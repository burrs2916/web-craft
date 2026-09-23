import { describe, test, expect } from "vitest";
import { generateHTML } from "../engine";
import { initBuiltinCodegens } from "../components";
import type { SceneDSL } from "../../types/scene";
import { DEFAULT_CANVAS_CONFIG } from "../../store/editorStore";
import { createDefaultTransform } from "../../types/editor";

describe("basic codegen", () => {
  test("generates HTML with text, button, image components", () => {
    initBuiltinCodegens();

  const scene: SceneDSL = {
    id: "test-scene",
    name: "Test Website",
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
          name: "Title Text",
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
          name: "Submit Button",
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
        {
          id: "c3",
          type: "image",
          name: "Hero Image",
          transform: createDefaultTransform({ x: 50, y: 150, width: 300, height: 200 }),
          layerId: "l1",
          zIndex: 0,
          locked: false,
          visible: true,
          config: {
            source: "https://example.com/hero.jpg",
            fit: "cover",
            borderRadius: 8,
          },
          children: [],
          parentId: null,
        },
      ],
      layers: [],
      canvasConfig: { ...DEFAULT_CANVAS_CONFIG, width: 800, height: 600 },
    }],
  };

  const pages = generateHTML(scene, { framework: "static-html", preview: true });

  console.log(`Generated ${pages.length} page(s)`);
  console.log(`Page 1: ${pages[0].filename} (${pages[0].html.length} chars)`);
  console.log("--- HTML preview (first 500 chars) ---");
  console.log(pages[0].html.substring(0, 500));
  console.log("--- end ---");

  const hasHello = pages[0].html.includes("Hello World");
  const hasButton = pages[0].html.includes("Click Me");
  const hasImage = pages[0].html.includes("example.com/hero.jpg");
  const hasDoctype = pages[0].html.startsWith("<!DOCTYPE html>");

  expect(hasHello).toBe(true);
  expect(hasButton).toBe(true);
  expect(hasImage).toBe(true);
  expect(hasDoctype).toBe(true);
  });
});
