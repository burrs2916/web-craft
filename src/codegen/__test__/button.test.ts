import { describe, test, expect } from "vitest";
import { generateHTML } from "../engine";
import { initBuiltinCodegens, getCodegen } from "../components";
import { buildButtonHTML, buildButtonFitHTML } from "../shared/button";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import type { SceneDSL } from "../../types/scene";
import { DEFAULT_CANVAS_CONFIG } from "../../store/editorStore";

initBuiltinCodegens();

function btnComp(config: Record<string, unknown>): SceneComponent {
  return {
    id: "c1",
    type: "form-button",
    name: "Btn",
    transform: createDefaultTransform({ x: 100, y: 100, width: 160, height: 48 }),
    layerId: "l1",
    zIndex: 0,
    locked: false,
    visible: true,
    config,
    children: [],
    parentId: null,
  };
}

function btnScene(config: Record<string, unknown>): SceneDSL {
  return {
    id: "b",
    name: "B",
    status: "draft",
    tags: [],
    metadata: {},
    createdAt: 0,
    updatedAt: 0,
    canvasConfig: { ...DEFAULT_CANVAS_CONFIG, width: 800, height: 600 },
    views: [
      {
        id: "v1",
        name: "Home",
        layers: [],
        components: [btnComp(config)],
      },
    ],
  };
}

describe("form-button：三端一致 + 画布缩放 + 增强属性", () => {
  test("铺满模式（fullWidth）：按钮镜像容器尺寸 width/height 100%", () => {
    const h = buildButtonHTML({ text: "Go" }, { natural: false });
    expect(h).toContain("width: 100%");
    expect(h).toContain("height: 100%");
  });

  test("发布 codegen 委托给共享 buildButtonFitHTML（与编辑区渲染同一份按钮 HTML）", () => {
    const cfg = { text: "Go", variant: "contained" as const, bgColor: "#1976d2", textColor: "#ffffff", fontSize: 14, borderRadius: 4 };
    const out = getCodegen("form-button")!(btnComp(cfg) as never, {} as never);
    // 按钮本体仍是共享生成器产出的同一份（自然尺寸模式）
    expect(out).toContain(buildButtonHTML(cfg, { natural: true }));
    // 外层是「舞台 + 缩放内层」骨架，且带缩放脚本（发布端由脚本算系数）
    expect(out).toContain("-st\"");
    expect(out).toContain("-in\"");
    expect(out).toContain("transform:scale(1)");
    expect(out).toContain("__wcFit");

    const pages = generateHTML(btnScene(cfg), { framework: "static-html", preview: true });
    expect(pages[0]!.html).toContain("Go");
  });

  test("size 档位兑现为盒高与左右内距（此前是改了无反应的假控件）", () => {
    const small = buildButtonHTML({ text: "Go", size: "small" }, { natural: true });
    const large = buildButtonHTML({ text: "Go", size: "large" }, { natural: true });
    expect(small).toContain("height: 32px");
    expect(small).toContain("padding: 0 12px");
    expect(large).toContain("height: 44px");
    expect(large).toContain("padding: 0 22px");
    expect(small).not.toBe(large);
  });

  test("fullWidth 打开时退回铺满模式（无舞台/内层）", () => {
    const h = buildButtonFitHTML({ text: "Go", fullWidth: true });
    expect(h).toContain("width: 100%");
    expect(h).not.toContain("-st\"");
  });

  test("align/vAlign 真正影响舞台摆放", () => {
    expect(buildButtonFitHTML({ text: "Go" }, { align: "left", vAlign: "top" })).toContain(
      "justify-content:flex-start",
    );
    expect(buildButtonFitHTML({ text: "Go" }, { align: "right" })).toContain("justify-content:flex-end");
  });

  test("增强样式/功能字段：边框、阴影、字重字距、跳转链接", () => {
    const h = buildButtonHTML({
      text: "确认",
      variant: "outlined",
      bgColor: "#1976d2",
      textColor: "#1976d2",
      borderColor: "#ff0000",
      borderWidth: 3,
      shadow: "medium",
      fontWeight: 700,
      letterSpacing: 2,
      link: "https://a.com",
      linkTarget: "_blank",
    });
    expect(h).toContain("border: 3px solid #ff0000");
    expect(h).toContain("box-shadow:");
    expect(h).toContain("font-weight: 700");
    expect(h).toContain("letter-spacing: 2px");
    expect(h).toContain("onclick=\"window.open('https://a.com','_blank')\"");
  });

  test("编辑态：不注入跳转、不置灰（不干扰画布）", () => {
    const edit = buildButtonHTML({ text: "x", link: "https://a.com", disabled: true }, { edit: true });
    expect(edit).not.toContain("onclick");
    expect(edit).not.toContain("disabled");
  });
});