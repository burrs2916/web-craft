/**
 * 指标卡数据链路回归测试（P0）
 *  1. datasource 模式：发布端自动推导组件值绑定（data-update 事件） 
 *  2. codegen 发布产物：POST apiBody 请求体不丢失
 *  3. 发布端组件监听器挂到 data-component-id 包装层（数据引擎事件派发目标）
 *  4. 数据引擎 applyBinding 对组件容器派发 data-update 而非覆写 DOM
 */

import { describe, test, expect } from "vitest";
import { generateDataScript } from "../scaffold/data";
import { metricCodegen } from "../components/basic";
import type { SceneDSL } from "../../types/scene";
import type { SceneComponent } from "../../types/editor";
import type { CodegenContext } from "../types";
import { DEFAULT_CANVAS_CONFIG } from "../../store/editorStore";
import { createDefaultTransform } from "../../types/editor";

const baseComponent = (over: Partial<SceneComponent> = {}): SceneComponent => ({
  id: "metric1",
  type: "metric",
  name: "Revenue",
  transform: createDefaultTransform({ x: 0, y: 0, width: 220, height: 120 }),
  layerId: "l1",
  zIndex: 0,
  locked: false,
  visible: true,
  config: {
    title: "Revenue",
    value: "--",
    dataMode: "static",
  },
  children: [],
  parentId: null,
  ...over,
});

const makeScene = (components: SceneComponent[]): SceneDSL => ({
  id: "metric-link-test",
  name: "Metric Link Test",
  status: "draft",
  tags: [],
  metadata: {},
  createdAt: 0,
  updatedAt: 0,
  canvasConfig: { ...DEFAULT_CANVAS_CONFIG, width: 1024, height: 768 },
  views: [{ id: "v1", name: "Dashboard", components, layers: [] }],
  apiConfig: { baseUrl: "", authEnabled: false, defaultHeaders: {}, timeout: 10000 },
});

/** 构造最小 CodegenContext（metricCodegen 只需 component + cntx 结构） */
const makeCtx = (scene: SceneDSL): CodegenContext => ({
  view: scene.views![0]!,
  canvasConfig: scene.canvasConfig!,
  scene,
  preview: true,
  componentMap: new Map(scene.views![0]!.components.map((c) => [c.id, c])),
  pageStyles: [],
  pageScripts: [],
  externalDeps: [],
});

const genMetric = (scene: SceneDSL, comp: SceneComponent) =>
  metricCodegen(comp, makeCtx(scene));

describe("P0-1 datasource 自动绑定推导", () => {
  test("datasource 组件无显式 bindings 时自动生成 value 绑定", () => {
    const scene = makeScene([
      baseComponent({
        config: {
          title: "CPU",
          dataMode: "datasource",
          dataSourceId: "ds-cpu",
          field: "cpu",
        },
      }),
    ]);
    const result = generateDataScript(scene.views![0]!, scene);
    expect(result.hasData).toBe(true);
    expect(result.bindingCount).toBe(1);
    // 数据引擎按组件 value 绑定派发 data-update（组件容器寻址）
    expect(result.inlineScript).toContain("data-component-id");
    expect(result.inlineScript).toContain("applyBinding('metric1'");
    expect(result.inlineScript).toContain("field: binding.field");
    expect(result.inlineScript).toContain("CustomEvent('data-update'");
    // datasource 引用的数据源必须有条目，避免运行时 ReferenceError
    expect(result.inlineScript).toContain("ds-cpu");
    // 生成的数据源按组件 dataSourceId 提取（sourceId = config.dataSourceId）
    expect(result.inlineScript).toContain("var __data_ds_cpu");
  });

  test("已存在同 sourceId 显式绑定时不重复推导", () => {
    const scene = makeScene([
      baseComponent({
        config: {
          dataMode: "datasource",
          dataSourceId: "ds-cpu",
          field: "cpu",
        },
        bindings: [
          { id: "b1", sourceId: "ds-cpu", field: "cpu", targetProperty: "value", type: "value" },
        ],
      }),
    ]);
    const result = generateDataScript(scene.views![0]!, scene);
    expect(result.bindingCount).toBe(1);
  });

  test("dataMode 非 datasource 不生成自动绑定", () => {
    const scene = makeScene([
      baseComponent({ config: { dataMode: "static", dataSourceId: "ds-cpu", field: "cpu" } }),
    ]);
    const result = generateDataScript(scene.views![0]!, scene);
    expect(result.bindingCount).toBe(0);
    expect(result.hasData).toBe(false);
  });
});

describe("P0-2 codegen POST apiBody", () => {
  test("apiBody 存在时发布产物 fetch 带请求体", () => {
    const scene = makeScene([]);
    const html = genMetric(scene,
      baseComponent({
        config: {
          title: "Metric",
          dataMode: "api",
          apiUrl: "https://api.example.com/m",
          apiMethod: "POST",
          apiBody: '{"query":"cpu"}',
        },
      }),
    );
    expect(html).toContain("var apiBodyRaw = ");
    // 请求体按原文 JSON 字符串发送（对象直传 fetch 会抛 TypeError），并自动补 Content-Type
    expect(html).toContain("body = apiBodyRaw");
    expect(html).toContain('headers["Content-Type"] = "application/json"');
    expect(html).toContain('(apiMethod === "GET" || apiMethod === "HEAD") ? undefined : body');
  });

  test("静态模式不生成 apiBody 逻辑", () => {
    const scene = makeScene([]);
    const html = genMetric(scene, baseComponent({ config: { title: "M", value: 42 } }));
    expect(html).not.toContain("apiBodyRaw");
  });
});

describe("P0-3 发布端事件挂载与引擎分支", () => {
  test("field 监听器挂到 data-component-id 包装层", () => {
    const scene = makeScene([]);
    const html = genMetric(scene,
      baseComponent({ config: { title: "M", dataMode: "datasource", dataSourceId: "ds1", field: "cpu" } }),
    );
    expect(html).toContain('querySelector(\'[data-component-id="metric1"]\')');
    expect(html).toContain("data-update");
    expect(html).toContain("detail[field]");
  });

  test("监听器带运行时 field 门控（field 为空不监听）", () => {
    const scene = makeScene([]);
    const html = genMetric(scene,
      baseComponent({ config: { title: "M", value: 42, dataMode: "static" } }),
    );
    // 监听代码存在但由运行时 var field 门控，field 为空时不会订阅
    expect(html).toContain("var field = \"\"");
    expect(html).toContain('el.addEventListener("data-update"');
  });

  test("静态 + 关趋势 + 无 field 时不生成任何脚本", () => {
    const scene = makeScene([]);
    const html = genMetric(scene,
      baseComponent({
        config: { title: "M", value: 42, dataMode: "static", showTrend: false },
      }),
    );
    expect(html).not.toContain("<script>");
  });
});

describe("P2-图标体系（Lucide SVG）", () => {
  /** 静态 HTML（script 之前）——图标渲染在静态区，趋势 jsCode 也含 <svg 字符串 */
  const staticHtml = (html: string) => html.split("<script>")[0];

  test("已知图标名发布产物渲染为内联 SVG 而非 material-icons 字体", () => {
    const scene = makeScene([]);
    const html = genMetric(scene,
      baseComponent({ config: { title: "M", value: 42, icon: "trending_up" } }),
    );
    const staticPart = staticHtml(html);
    expect(staticPart).not.toContain("material-icons");
    expect(staticPart).toContain("<svg");
    expect(staticPart).toContain('viewBox="0 0 24 24"');
    expect(staticPart).toContain('stroke="#');
  });

  test("未知图标名降级不渲染（静态 HTML 无 SVG）", () => {
    const scene = makeScene([]);
    const html = genMetric(scene,
      baseComponent({ config: { title: "M", value: 42, icon: "no_such_icon" } }),
    );
    expect(staticHtml(html)).not.toContain("<svg");
  });

  test("图标名归一化（大小写/中划线均生效）", () => {
    const scene = makeScene([]);
    const html = genMetric(scene,
      baseComponent({ config: { title: "M", value: 42, icon: "Trending-Up" } }),
    );
    expect(staticHtml(html)).toContain("<svg");
  });
});

describe("P2-数值格式化与趋势行为", () => {
  test("发布产物初始值千分位格式化（toLocaleString en-US）", () => {
    const scene = makeScene([]);
    // 静态 + 关趋势 + 无 field：零脚本（见 P0-3 门控用例），千分位为编译期格式化
    const staticHtml = genMetric(scene,
      baseComponent({ config: { title: "M", value: 1234567.891, precision: 2, dataMode: "static", showTrend: false } }),
    );
    expect(staticHtml).toContain("1,234,567.89");
    expect(staticHtml).not.toContain("<script>");
    // 脚本存在时（开趋势），运行时格式化同样走 toLocaleString("en-US")
    const withJs = genMetric(scene,
      baseComponent({ config: { title: "M", value: 1234567.891, precision: 2, dataMode: "static", showTrend: true } }),
    );
    expect(withJs).toContain('toLocaleString("en-US"');
  });

  test("趋势正负号保留（+x.x% / -x.x%）且不用绝对值吞符号", () => {
    const scene = makeScene([]);
    const html = genMetric(scene,
      baseComponent({ config: { title: "M", value: 100, dataMode: "api", apiUrl: "https://x.com/m", apiInterval: 0, showTrend: true } }),
    );
    expect(html).toContain('(diff >= 0 ? "+" : "-")');
    expect(html).toContain('Math.abs(diff).toFixed(1) + "%"');
    expect(html).not.toContain("Math.abs(((n - prevValue) / Math.abs(prevValue)) * 100)");
  });

  test("静态模式趋势门控：dataMode === static 不展示趋势（避免虚假 flat）", () => {
    const scene = makeScene([]);
    const html = genMetric(scene,
      baseComponent({ config: { title: "M", value: 100, dataMode: "static", showTrend: true } }),
    );
    expect(html).toContain('dataMode !== "static"');
  });

  test("prefix/suffix 颜色可配，未配置时回退 unitColor", () => {
    const scene = makeScene([]);
    const withColors = genMetric(scene,
      baseComponent({ config: { title: "M", value: 42, prefix: "$", suffix: "+", prefixColor: "#FF0000", suffixColor: "#00FF00", unitColor: "#FFFFFF" } }),
    );
    expect(withColors).toContain("color:#FF0000");
    expect(withColors).toContain("color:#00FF00");
    const noColors = genMetric(scene,
      baseComponent({ config: { title: "M", value: 42, prefix: "$", suffix: "+", unitColor: "#ABCDEF" } }),
    );
    expect(noColors).toContain("#ABCDEF");
  });

  test("发布端加载/错误状态：api 模式渲染 status 元素且骨架回调设置文案", () => {
    const scene = makeScene([]);
    const html = genMetric(scene,
      baseComponent({ config: { title: "M", value: "--", dataMode: "api", apiUrl: "https://x.com/m", apiInterval: 0 } }),
    );
    // status 占位元素（api 模式专属）
    expect(html).toContain('-status" style="display:none');
    // 主脚本暴露 mount/状态回调，取数骨架（dataLoaderScript）经钩子注入加载/失败文案
    expect(html).toContain('window["__wcMtr_');
    expect(html).toContain('window["__wcMtrS_');
    expect(html).toContain('("加载中…")');
    expect(html).toContain('("请求失败")');
    expect(html).toContain('("加载失败")');
    // 统一骨架承载取数（URL/认证/请求体/轮询）
    expect(html).toContain("doFetch");
    expect(html).toContain("getNestedValue");

    const staticHtml2 = genMetric(scene, baseComponent({ config: { title: "M", value: 42 } }));
    expect(staticHtml2).not.toContain('-status" style="display:none');
  });
});