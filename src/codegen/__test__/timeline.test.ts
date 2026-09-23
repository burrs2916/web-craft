import { describe, test, expect } from "vitest";
import { timelineCodegen } from "../components/timeline";
import type { SceneDSL } from "../../types/scene";
import type { SceneComponent } from "../../types/editor";
import type { CodegenContext } from "../types";
import { DEFAULT_CANVAS_CONFIG } from "../../store/editorStore";
import { createDefaultTransform } from "../../types/editor";

const baseComponent = (over: Partial<SceneComponent> = {}): SceneComponent => ({
  id: "tl1",
  type: "timeline",
  name: "Timeline",
  transform: createDefaultTransform({ x: 0, y: 0, width: 400, height: 320 }),
  layerId: "l1",
  zIndex: 0,
  locked: false,
  visible: true,
  config: { dataMode: "static" },
  children: [],
  parentId: null,
  ...over,
});

const makeScene = (components: SceneComponent[]): SceneDSL => ({
  id: "timeline-test",
  name: "Timeline Test",
  status: "draft",
  tags: [],
  metadata: {},
  createdAt: 0,
  updatedAt: 0,
  canvasConfig: { ...DEFAULT_CANVAS_CONFIG, width: 1024, height: 768 },
  views: [{ id: "v1", name: "Dashboard", components, layers: [] }],
  apiConfig: { baseUrl: "", authEnabled: false, defaultHeaders: {}, timeout: 10000 },
});

const makeCtx = (scene: SceneDSL): CodegenContext => ({
  view: scene.views![0]!,
  canvasConfig: scene.canvasConfig!,
  scene,
  preview: true,
  componentMap: new Map(scene.views![0]!.components.map((c) => [c.id, c])),
  childrenByParent: new Map(),
  pageStyles: [],
  pageScripts: [],
  externalDeps: [],
  iconData: {},
});

const run = (config: Record<string, unknown>): string => {
  const scene = makeScene([baseComponent({ config })]);
  return timelineCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
};

describe("timelineCodegen", () => {
  test("静态模式：渲染事件标题/内容/时间戳，不注入 API loader", () => {
    const html = run({
      dataMode: "static",
      items: [
        { title: "提交", content: "完成信息录入", timestamp: "2024-01-01" },
        { title: "审核", content: "等待管理员审批", timestamp: "2024-03-15" },
      ],
    });
    expect(html).toContain(">提交<");
    expect(html).toContain(">完成信息录入<");
    expect(html).toContain(">2024-01-01<");
    expect(html).toContain(">审核<");
    expect(html).toContain(">2024-03-15<");
    expect(html).not.toContain("getNestedValue");
    expect(html).not.toContain("doFetch");
  });

  test("doc/label/time 字段回退 + staticData 优先", () => {
    const html = run({
      dataMode: "static",
      items: [{ title: "FROM_ITEMS", content: "a", time: "2024" }],
      staticData: JSON.stringify([{ label: "FROM_STATIC", desc: "静态描述", date: "2025" }]),
    });
    expect(html).toContain(">FROM_STATIC<");
    expect(html).toContain(">静态描述<");
    expect(html).toContain(">2025<");
    expect(html).not.toContain(">FROM_ITEMS<");
  });

  test("连接线连续：行不设 margin-bottom，行距由内容列 padding-bottom 提供，线无缝延伸", () => {
    const html = run({
      dataMode: "static",
      items: [
        { title: "a", content: "" },
        { title: "b", content: "" },
        { title: "c", content: "" },
      ],
      itemGap: 24,
    });
    expect(html).toContain("padding-bottom:24px");
    expect(html).toContain("width:2px;flex:1 1 0;min-height:12px");
    // 首行/末行：最后一项无连接线
    expect(html).toContain("border-radius:50%");
    // 不再有旧的 margin-bottom:itemGap 行间距（那是连线断开的来源）
    expect(html).not.toContain("margin-bottom:24px");
  });

  test("alpha-left/右/交替模式布局字段存在", () => {
    const left = run({ dataMode: "static", mode: "left", items: [{ title: "x", content: "" }] });
    expect(left).toContain('flex-direction:row');
    const right = run({ dataMode: "static", mode: "right", items: [{ title: "x", content: "" }] });
    expect(right).toContain('flex-direction:row-reverse');
    const alt = run({ dataMode: "static", mode: "alternate", items: [
      { title: "a", content: "" }, { title: "b", content: "" },
    ]});
    expect(alt).toContain("justify-content:flex-start");
    expect(alt).toContain("justify-content:flex-end");
  });

  test("API 模式：dataLoaderScript 骨架 + mount 暴露 + 对象解包 + 首屏占位保留", () => {
    const html = run({
      dataMode: "api",
      apiUrl: "https://api.example.com/events",
      apiMethod: "GET",
      apiDataPath: "data",
      items: [{ title: "占位事件", content: "加载前占位" }],
    });
    expect(html).toContain("getNestedValue");
    expect(html).toContain("doFetch");
    expect(html).toContain('window["__wcTl_');
    // 三种响应形态：数组 / 对象 {items|list|data|timeline} / JSON 字符串
    expect(html).toContain("Array.isArray(data)");
    expect(html).toContain("data.items");
    expect(html).toContain("data.list");
    expect(html).toContain("data.data");
    expect(html).toContain("data.timeline");
    expect(html).toContain("JSON.parse(t)");
    // 接口模式下不渲染编译期本地占位条目（数据由接口驱动填充）
    expect(html).not.toContain(">占位事件<");
  });

  test("API 模式生成脚本语法校验（new Function 仅解析）", () => {
    const html = run({
      dataMode: "api",
      apiUrl: "https://api.example.com/events",
      items: [{ title: "占位", content: "" }],
    });
    const scripts = html.match(/<script>([\s\S]*?)<\/script>/g) ?? [];
    expect(scripts.length).toBeGreaterThan(0);
    for (const s of scripts) {
      const body = s.replace(/^<script>/, "").replace(/<\/script>$/, "");
      expect(() => new Function(body)).not.toThrow();
    }
  });
});