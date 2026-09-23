import { describe, test, expect } from "vitest";
import { stepsCodegen } from "../components/steps";
import { initBuiltinCodegens, getCodegen } from "../components";
import type { SceneDSL } from "../../types/scene";
import type { SceneComponent } from "../../types/editor";
import type { CodegenContext } from "../types";
import { DEFAULT_CANVAS_CONFIG } from "../../store/editorStore";
import { createDefaultTransform } from "../../types/editor";

const baseComponent = (over: Partial<SceneComponent> = {}): SceneComponent => ({
  id: "c1",
  type: "steps",
  name: "Steps",
  transform: createDefaultTransform({ x: 0, y: 0, width: 480, height: 120 }),
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
  id: "steps-test",
  name: "Steps Test",
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
  return stepsCodegen(scene.views![0]!.components[0]!, makeCtx(scene));
};

describe("stepsCodegen 数据源回归", () => {
  test("静态模式：渲染步骤标题/描述与状态色，不注入 API loader", () => {
    const html = run({
      dataMode: "static",
      steps: [
        { title: "提交申请", description: "填写基础信息" },
        { title: "审核中", description: "等待管理员审批" },
        { title: "已完成", description: "" },
      ],
      current: 1,
    });
    expect(html).toContain(">提交申请<");
    expect(html).toContain(">填写基础信息<");
    expect(html).toContain(">审核中<");
    expect(html).toContain(">等待管理员审批<");
    expect(html).toContain(">已完成<");
    // current=1：步骤一完成态（绿色）、步骤二进行态（橙色）
    expect(html).toContain("#4CAF50");
    expect(html).toContain("#FF9800");
    expect(html).not.toContain("getNestedValue");
    expect(html).not.toContain("doFetch");
  });

  test("staticData 非空时优先渲染 staticData，空则回退 steps", () => {
    const primary = run({
      dataMode: "static",
      steps: [{ title: "FROM_STEPS", description: "" }],
      staticData: JSON.stringify([{ title: "FROM_STATIC", description: "静态数据描述" }]),
    });
    expect(primary).toContain(">FROM_STATIC<");
    expect(primary).not.toContain(">FROM_STEPS<");

    const fallback = run({
      dataMode: "static",
      steps: [{ title: "FROM_STEPS", description: "" }],
      staticData: "",
    });
    expect(fallback).toContain(">FROM_STEPS<");
  });

  test("desc 字段回退为描述（与编辑器 parseSteps 对齐）", () => {
    const html = run({
      dataMode: "static",
      steps: [{ title: "仅标题步骤", desc: "来自 desc 的描述" }],
    });
    expect(html).toContain(">仅标题步骤<");
    expect(html).toContain(">来自 desc 的描述<");
  });

  test("showLastConnector：开启后末尾连接线渲染（编辑器与产物一致）", () => {
    const closed = run({
      dataMode: "static",
      steps: [
        { title: "步骤一", description: "" },
        { title: "步骤二", description: "" },
      ],
      current: 0,
      showLastConnector: true,
    });
    const open = run({
      dataMode: "static",
      steps: [
        { title: "步骤一", description: "" },
        { title: "步骤二", description: "" },
      ],
      current: 0,
      showLastConnector: false,
    });
    // 水平采用对称连接线（每步左右各一段，保证圆点与文字对齐）：
    // 2 步默认 2 段着色；闭环后末步右侧再追加一段 → 3 段
    const countColored = (s: string) => (s.match(/;background:rgba\(255,255,255,0\.15\)/g) ?? []).length;
    expect(countColored(open)).toBe(2);
    expect(countColored(closed)).toBe(3);
    // 每步左右对称存在连接线（首步左侧透明占位以居中圆点），且无间距贴合圆点保证连续
    expect(open).toContain("flex:1;height:2px;min-width:0");
    expect(open).toContain("background:transparent");
  });

  test("gap 仅作用于水平间距；垂直模式容器 0 间隙由连接线承接，保证连线连续", () => {
    const steps = [
      { title: "步骤一", description: "" },
      { title: "步骤二", description: "" },
    ];
    // 垂直：即使配置 gap，容器也不插入行间隙（避免切断连接线）
    const vertical = run({ dataMode: "static", steps, direction: "vertical", gap: 12 });
    expect(vertical).toContain("flex-direction:column;align-items:center;gap:0px");
    expect(vertical).toContain("min-height:24px");
    expect(vertical).not.toContain("gap:12px");
    // 水平：gap 配置仍注入容器间距
    const horizontal = run({ dataMode: "static", steps, direction: "horizontal", gap: 12 });
    expect(horizontal).toContain("gap:12px");
  });

  test("垂直模式：带连接线的步骤拉伸撑高填满高度、末步内容自适应，消除上下大边距", () => {
    const html = run({
      dataMode: "static",
      direction: "vertical",
      steps: [
        { title: "a", description: "" },
        { title: "b", description: "" },
        { title: "c", description: "" },
      ],
      current: 1,
    });
    // 带连接线步骤 flex:1 1 0 撑高，末步（无连接线）内容自适应，避免底部大空档
    expect(html).toContain("flex:1 1 0;min-width:0");
    expect(html).toContain("flex:0 0 auto;min-width:0");
    // 容器水平居中、垂直顶部起始（由连接线填满高度，边距小），容器自身不带 justify-content:center
    expect(html).toContain("flex-direction:column;align-items:center;gap:0px");
    // 连接线保底长度仍在
    expect(html).toContain("min-height:24px");
  });

  test("API 模式：dataLoaderScript 骨架 + mount 暴露 + 三种响应形态处理 + 首屏占位保留", () => {
    const html = run({
      dataMode: "api",
      apiUrl: "https://api.example.com/flow/status",
      apiMethod: "GET",
      apiInterval: 5,
      apiDataPath: "data",
      steps: [{ title: "占位步骤", description: "加载前占位" }],
      current: 0,
    });
    // 统一取数骨架
    expect(html).toContain("getNestedValue");
    expect(html).toContain("doFetch");
    expect(html).toContain("setInterval(doFetch, apiInterval * 1000)");
    // mount 暴露给 loader 回调
    expect(html).toContain('window["__wcStp_');
    // 数组 → 步骤列表
    expect(html).toContain("Array.isArray(data)");
    // 数字 → 当前索引
    expect(html).toContain('typeof data === "number"');
    // 对象 {steps|items|list, current} → 二者皆可（与 list/carousel 解包别名对齐）
    expect(html).toContain("data.steps");
    expect(html).toContain("data.items");
    expect(html).toContain("data.list");
    expect(html).toContain("data.current");
    // JSON 字符串响应也走解析（不按字符迭代）
    expect(html).toContain('typeof data === "string"');
    expect(html).toContain("JSON.parse(t)");
    // 接口模式下不渲染编译期本地占位步骤（数据由接口驱动填充）
    expect(html).not.toContain(">占位步骤<");
  });

  test("API 模式生成脚本语法校验（new Function 仅解析）", () => {
    const html = run({
      dataMode: "api",
      apiUrl: "https://api.example.com/flow",
      apiMethod: "POST",
      apiBody: '{"flowId":"f1"}',
      apiInterval: 3,
      steps: [
        { title: "步骤一", description: "a" },
        { title: "步骤二", description: "b" },
      ],
      current: 1,
      showLastConnector: true,
      direction: "vertical",
      variant: "number",
    });
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
    expect(scripts.length).toBeGreaterThan(0);
    scripts.forEach((s, i) => {
      expect(() => new Function(s), `脚本#${i} 语法错误`).not.toThrow();
    });
  });

  test("垂直步骤条：内层容器列向堆叠，连接线竖排带最小长度", () => {
    const html = run({
      dataMode: "static",
      direction: "vertical",
      steps: [
        { title: "上", description: "" },
        { title: "下", description: "" },
      ],
      current: 0,
      gap: 12,
    });
    expect(html).toContain("flex-direction:column");
    expect(html).toContain("align-items:center");
    expect(html).toContain("width:2px");
    expect(html).toContain("min-height:24px");
  });

  test("水平步骤条内容在框内垂直居中（对齐编辑器画布）", () => {
    const html = run({
      dataMode: "static",
      direction: "horizontal",
      steps: [
        { title: "a", description: "" },
        { title: "b", description: "" },
      ],
      current: 0,
    });
    expect(html).toContain("flex-direction:row");
    expect(html).toContain("align-items:center");
  });

  test("steps-vertical 拆分类型已挂载到 codegen 注册表，复用同一实现", () => {
    initBuiltinCodegens();
    expect(getCodegen("steps-vertical")).toBe(stepsCodegen);
    expect(getCodegen("steps")).toBe(stepsCodegen);
  });
});
