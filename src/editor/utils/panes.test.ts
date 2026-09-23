/**
 * 回归测试：内容面板（content-panel）共享解析与 codegen 行为
 *
 * 历史缺陷：panes JSON 在 PaneEditor/渲染器/codegen/菜单绑定四处独立解析，
 * 行为不一致（编辑器显示空、画布显示默认 3 面板、发布为空）。
 * 现统一走 editor/utils/panes 的 parsePanes/normalizeActivePaneId。
 */
import { describe, it, expect } from "vitest";
import { parsePanes, normalizeActivePaneId, colorToHex, interpolateContent, genPaneId } from "./panes";
import { generateHTML } from "../../codegen/engine";
import type { SceneDSL } from "../../types/scene";
import type { SceneComponent } from "../../types/editor";

describe("parsePanes 规范化", () => {
  it("正常解析并保留字段", () => {
    const panes = parsePanes('[{"id":"p1","name":"A","content":"内容A","bgColor":"rgba(1,2,3,0.5)"}]');
    expect(panes).toEqual([{ id: "p1", name: "A", content: "内容A", bgColor: "rgba(1,2,3,0.5)" }]);
  });

  it("非法 JSON / 非数组返回空数组（不再生成默认 3 面板）", () => {
    expect(parsePanes("not json")).toEqual([]);
    expect(parsePanes('{"a":1}')).toEqual([]);
    expect(parsePanes(undefined)).toEqual([]);
  });

  it("剔除无效项与重复 ID，缺 ID 自动补全", () => {
    const panes = parsePanes('[{"name":"no-id"},{"id":"p1","name":"A"},{"id":"p1","name":"dup"},"bad",null]');
    expect(panes.length).toBe(2);
    expect(panes[0].id).toMatch(/^pane-/);
    expect(panes[1].id).toBe("p1");
  });

  it("genPaneId 生成唯一 id", () => {
    const a = genPaneId();
    const b = genPaneId();
    expect(a).not.toBe(b);
  });
});

describe("normalizeActivePaneId 悬空纠正", () => {
  const panes = parsePanes('[{"id":"p1","name":"A"},{"id":"p2","name":"B"}]');
  it("有效 id 原样返回", () => {
    expect(normalizeActivePaneId(panes, "p2")).toBe("p2");
  });
  it("悬空 id（面板已删）回退第一个面板", () => {
    expect(normalizeActivePaneId(panes, "deleted-id")).toBe("p1");
    expect(normalizeActivePaneId(panes, undefined)).toBe("p1");
  });
  it("空列表返回空字符串", () => {
    expect(normalizeActivePaneId([], "p1")).toBe("");
  });
});

describe("colorToHex rgba 兼容", () => {
  it("rgba() 转 hex", () => {
    expect(colorToHex("rgba(30,30,50,0.6)")).toBe("#1e1e32");
    expect(colorToHex("rgb(255,0,128)")).toBe("#ff0080");
  });
  it("hex 原样返回（含 3 位缩写展开）", () => {
    expect(colorToHex("#FF8800")).toBe("#ff8800");
    expect(colorToHex("#f80")).toBe("#ff8800");
  });
  it("无法解析时返回 fallback", () => {
    expect(colorToHex("transparent", "#123456")).toBe("#123456");
    expect(colorToHex(null, "#123456")).toBe("#123456");
  });
});

describe("interpolateContent 字段插值", () => {
  it("替换 {字段} 与嵌套路径", () => {
    expect(interpolateContent("温度：{temp}°C", { temp: 26 })).toBe("温度：26°C");
    expect(interpolateContent("{a.b.c}", { a: { b: { c: "深" } } })).toBe("深");
  });
  it("字段缺失保留原文", () => {
    expect(interpolateContent("{missing} 保留", {})).toBe("{missing} 保留");
  });
  it("对象值序列化为 JSON", () => {
    expect(interpolateContent("{obj}", { obj: { x: 1 } })).toBe('{"x":1}');
  });
});

describe("content-panel codegen", () => {
  function panelComp(config: Record<string, unknown>): SceneComponent {
    return {
      id: "cp-1",
      type: "content-panel",
      name: "面板",
      transform: { x: 0, y: 0, width: 400, height: 300, rotation: 0, scale: { x: 1, y: 1 } },
      layerId: "layer-1",
      zIndex: 1,
      locked: false,
      visible: true,
      config,
    };
  }
  function genScene(config: Record<string, unknown>): SceneDSL {
    return {
      id: "t", name: "T", activeViewId: "v1",
      views: [{
        id: "v1", name: "Home",
        components: [panelComp(config)],
        layers: [{ id: "layer-1", name: "L1", order: 0, visible: true, opacity: 1 }],
        canvasConfig: { width: 1200, height: 800, padding: { top: 0, right: 0, bottom: 0, left: 0 } },
      }],
    } as unknown as SceneDSL;
  }

  it("空 panes 生成占位提示（不再生成默认 3 面板）", () => {
    const html = generateHTML(genScene({ panes: "[]" }), { framework: "static-html", preview: true })[0].html;
    expect(html).toContain("未配置面板");
    expect(html).not.toContain('data-pane-id="pane-1"');
  });

  it("悬空 activePaneId 回退第一个面板", () => {
    const html = generateHTML(genScene({
      panes: '[{"id":"p1","name":"A","content":"c1"},{"id":"p2","name":"B","content":"c2"}]',
      activePaneId: "deleted",
    }), { framework: "static-html", preview: true })[0].html;
    expect(html).toContain('data-active-pane="p1"');
    expect(html).toMatch(/data-pane-id="p1"[^>]*display: block/);
  });

  it("contentPadding 配置生效（不再硬编码 12px）", () => {
    const html = generateHTML(genScene({
      panes: '[{"id":"p1","name":"A","content":"c1"}]',
      contentPaddingX: 24, contentPaddingY: 8,
    }), { framework: "static-html", preview: true })[0].html;
    expect(html).toContain("padding: 8px 24px");
  });

  it("API 模式生成数据绑定脚本（含 RAW 模板与插值）", () => {
    const html = generateHTML(genScene({
      panes: '[{"id":"p1","name":"A","content":"温度：{temp}°C"}]',
      dataMode: "api",
      apiUrl: "https://api.example.com/data",
      apiInterval: 5,
      apiDataPath: "data.metrics",
    }), { framework: "static-html", preview: true })[0].html;
    expect(html).toContain("__wcPaneDataBound");
    expect(html).toContain('var APIURL="https://api.example.com/data"');
    expect(html).toContain('var PATH="data.metrics"');
    expect(html).toContain('var INTERVAL=5');
    expect(html).toContain('"p1":"温度：{temp}°C"');
    // URL/headers 规则与统一骨架对齐：支持 apiPath 拼接与全局默认头
    expect(html).toContain("function buildUrl()");
    expect(html).toContain("window.__WC_DEFAULT_HEADERS");
  });

  it("静态模式不生成数据脚本", () => {
    const html = generateHTML(genScene({
      panes: '[{"id":"p1","name":"A","content":"c1"}]',
    }), { framework: "static-html", preview: true })[0].html;
    expect(html).not.toContain("__wcPaneDataBound");
  });

  it("标签功能已移除（不再输出 showLabel 标签栏）", () => {
    const html = generateHTML(genScene({
      panes: '[{"id":"p1","name":"A","content":"c1"}]',
      showLabel: true, labelText: "旧标签",
    }), { framework: "static-html", preview: true })[0].html;
    expect(html).not.toContain("旧标签");
  });
});
