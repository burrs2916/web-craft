import { test } from "vitest";
import { metricCodegen } from "../components/basic";
import { tableCodegen } from "../components/table";
import { contentPanelCodegen } from "../components/layout";
import { formSelectCodegen, formCheckboxCodegen } from "../components/form";
import type { SceneDSL } from "../../types/scene";
import type { SceneComponent } from "../../types/editor";
import type { CodegenContext } from "../types";
import { DEFAULT_CANVAS_CONFIG } from "../../store/editorStore";
import { createDefaultTransform } from "../../types/editor";

const mk = (type: string, config: Record<string, unknown>): { scene: SceneDSL; comp: SceneComponent } => {
  const comp: SceneComponent = {
    id: "metric1", type, name: "C",
    transform: createDefaultTransform({ x: 0, y: 0, width: 220, height: 120 }),
    layerId: "l1", zIndex: 0, locked: false, visible: true,
    config, children: [], parentId: null,
  };
  const scene: SceneDSL = {
    id: "s", name: "S", status: "draft", tags: [], metadata: {},
    createdAt: 0, updatedAt: 0,
    canvasConfig: { ...DEFAULT_CANVAS_CONFIG, width: 1024, height: 768 },
    views: [{ id: "v1", name: "D", components: [comp], layers: [] }],
    apiConfig: { baseUrl: "", authEnabled: false, defaultHeaders: {}, timeout: 10000 },
  };
  return { scene, comp };
};

const ctx = (scene: SceneDSL): CodegenContext => ({
  view: scene.views![0]!, canvasConfig: scene.canvasConfig!, scene, preview: true,
  componentMap: new Map(scene.views![0]!.components.map((c) => [c.id, c])),
  childrenByParent: new Map(), pageStyles: [], pageScripts: [], externalDeps: [], iconData: {},
});

test("metric/table/content-panel 生成脚本语法校验（new Function 仅解析）", () => {
  const cases: Array<[string, boolean, ReturnType<typeof mk>]> = [
    ["metric api POST body", true, mk("metric", { dataMode: "api", apiUrl: "https://x.example.com/m?a=1&b=2", apiMethod: "POST", apiBody: '{"q":"cpu"}', apiInterval: 5, showTrend: true, statusRules: [{ min: 0, max: 50, color: "#4CAF50", label: "正常" }] })],
    ["metric static trend", false, mk("metric", { dataMode: "static", value: 42, showTrend: true })],
    ["table api", true, mk("table", { dataMode: "api", apiUrl: "https://x.example.com/stats", apiInterval: 5, apiDataPath: "data.rows", headers: "A,B", rows: "1,2" })],
    ["table static", false, mk("table", { dataMode: "static", headers: "A", rows: "1" })],
    ["content-panel api POST body", true, mk("content-panel", { dataMode: "api", apiUrl: "https://x.example.com/summary", apiMethod: "POST", apiBody: '{"id":1}', apiHeaders: '{"X-Org":"demo"}', apiInterval: 5, apiDataPath: "data.metrics", panes: '[{"id":"p1","name":"A","content":"温度：{temp}°C"}]' })],
    ["content-panel api path only", true, mk("content-panel", { dataMode: "api", apiUrl: "", apiPath: "dashboard/summary", apiMethod: "GET", apiInterval: 0, apiDataPath: "", panes: '[{"id":"p1","name":"A","content":"c"}]' })],
    ["content-panel static", false, mk("content-panel", { dataMode: "static", panes: '[{"id":"p1","name":"A","content":"c"}]' })],
    // form-select：静态 items+图标（panelScript 注入 data-icon）与接口模式（dataLoader 取数）脚本均须语法合法
    ["form-select static items+icon", true, mk("form-select", { label: "城市", items: [{ label: "北京", value: "BJ", icon: "material:home" }, { label: "上海", value: "SH" }] })],
    ["form-select static legacy text", true, mk("form-select", { label: "城市", placeholder: "请选择", clearable: true, options: "广东|GD\n北京|BJ" })],
    ["form-select api", true, mk("form-select", { label: "城市", placeholder: "请选择", clearable: true, dataMode: "api", apiUrl: "https://x.example.com/cities", apiDataPath: "data.list", apiValueField: "code", apiLabelField: "name" })],
    // form-checkbox：必填+帮助文字会注入「实时校验绑定」与「帮助文字让位」两段脚本，须语法合法
    ["form-checkbox required+helper", true, mk("form-checkbox", { label: "同意服务条款", required: true, validateMessage: "请先同意条款", errorColor: "#ff0000", helperText: "请阅读《服务条款》" })],
    ["form-checkbox plain", false, mk("form-checkbox", { label: "同意服务条款", size: "small", labelPlacement: "left" })],
  ];
  for (const [label, requiresScript, { scene, comp }] of cases) {
    const html = comp.type === "metric" ? metricCodegen(comp, ctx(scene))
      : comp.type === "table" ? tableCodegen(comp, ctx(scene))
      : comp.type === "form-select" ? formSelectCodegen(comp, ctx(scene))
      : comp.type === "form-checkbox" ? formCheckboxCodegen(comp, ctx(scene))
      : contentPanelCodegen(comp, ctx(scene));
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
    if (requiresScript && scripts.length === 0) throw new Error(`${label}: 无脚本`);
    scripts.forEach((s, i) => {
      try { new Function(s); } catch (e) { throw new Error(`${label} 脚本#${i} 语法错误: ${e}`); }
    });
  }
});
