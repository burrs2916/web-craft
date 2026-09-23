import { describe, test, expect } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";

initBuiltinCodegens();

const ctx = { pageScripts: [] } as never;

function comp(config: Record<string, unknown>): SceneComponent {
  return {
    id: "prg1",
    type: "progress",
    name: "progress",
    transform: createDefaultTransform({ x: 0, y: 0, width: 280, height: 20 }),
    layerId: "l1",
    zIndex: 0,
    locked: false,
    visible: true,
    config,
    children: [],
    parentId: null,
  };
}

function render(config: Record<string, unknown>): string {
  const fn = getCodegen("progress");
  expect(fn, "缺少 progress 的 codegen").toBeTruthy();
  return fn!(comp(config), ctx);
}

/**
 * progress 动态数据链路契约锁（对标 metric-data-link.test.ts）。
 *
 * 与指标卡同一套数据键（dataMode/apiUrl/apiDataPath/apiInterval/authEnabled/field），
 * 由 API 配置面板「切换为接口读取」统一接线；全局源绑定由引擎层 withEffectiveConfig
 * 覆盖 config，组件 codegen 无需自理 dataSourceId。本文件锁四件事：
 *   1. api 模式产 dataLoaderScript 统一取数骨架 + __wcPrg 更新回调；
 *   2. 线/圆两形状都有可被运行时寻址的 uid 类钩子（-fill/-ring/-label）；
 *   3. 认证三态原样透传（readAuthEnabled 口径）；
 *   4. static 模式零脚本零钩子（历史产物逐字节不变）。
 */
describe("progress 动态数据链路", () => {
  test("api 模式（线性）：产统一取数骨架 + 更新回调 + fill 钩子", () => {
    const out = render({
      shape: "line", value: 60, max: 100,
      dataMode: "api", apiUrl: "https://api.example.com/metrics", apiDataPath: "data.cpu",
    });
    expect(out).toContain("__wcPrg_");
    expect(out).toMatch(/class="prg-[a-z0-9]+-fill"/);
    expect(out).toMatch(/class="prg-[a-z0-9]+-label"/);
    expect(out).toContain("var authEnabled = null"); // readAuthEnabled(undefined) → 跟随全局
    expect(out).toContain('apiUrl = "https://api.example.com/metrics"');
    expect(out).toContain('apiDataPath = "data.cpu"');
    expect(out).toContain("buildFetchUrl");
    expect(out).toContain("setInterval(doFetch");
  });

  test("api 模式（圆形）：ring 钩子存在，运行时按周长重设 dashoffset", () => {
    const out = render({
      shape: "circle", value: 60, max: 100, circleSize: 80,
      dataMode: "api", apiUrl: "https://api.example.com/metrics",
    });
    expect(out).toMatch(/class="prg-[a-z0-9]+-ring"/);
    // update 里用同一条 circumference 常量换算偏移
    expect(out).toContain("circ - circ * pct / 100");
  });

  test("数值防护：NaN 保持现状不闪 0，数值 clamp 到 [0, max]", () => {
    const out = render({
      shape: "line", dataMode: "api", apiUrl: "https://api.example.com/x",
    });
    expect(out).toContain("if (n === null) return;");
    expect(out).toContain("if (n < 0) n = 0;");
    expect(out).toContain("if (n > max) n = max;");
  });

  test("认证三态透传：true/false/null 字面量化（认真布尔，不接受字符串）", () => {
    expect(render({ shape: "line", dataMode: "api", apiUrl: "https://a.b", authEnabled: true }))
      .toContain("var authEnabled = true");
    expect(render({ shape: "line", dataMode: "api", apiUrl: "https://a.b", authEnabled: false }))
      .toContain("var authEnabled = false");
  });

  test("datasource 绑定：field 监听 data-update 事件（数据引擎派发目标）", () => {
    const out = render({ shape: "line", dataMode: "datasource", dataSourceId: "src1", field: "load" });
    expect(out).toContain('d["load"] !== undefined');
    expect(out).toContain('addEventListener("data-update"');
    // datasource 非 api 模式：不产取数骨架
    expect(out).not.toContain("buildFetchUrl");
  });

  test("static 模式：零运行时脚本、零钩子（历史产物不变）", () => {
    const out = render({ shape: "line", value: 40 });
    expect(out).not.toContain("__wcPrg_");
    expect(out).not.toContain("-fill\"");
    expect(out).not.toContain("buildFetchUrl");
    const circle = render({ shape: "circle", value: 40 });
    expect(circle).not.toContain("__wcPrg_");
    expect(circle).not.toContain("-ring\"");
  });

  test("api 但未配地址：不产取数骨架（与 metric isApi 判定同口径）", () => {
    const out = render({ shape: "line", dataMode: "api", apiUrl: "" });
    expect(out).not.toContain("buildFetchUrl");
  });

  test("运行时容器兜底：动态模式线性分支带 id 容器（包装层缺失时脚本不哑火）", () => {
    // 探针曾暴露：线性分支无 -st 骨架，若 querySelector 链只有包装层一个目标，
    // 包装层缺失即整条链路哑火 —— 对齐 metric 的 getElementById(uid) 兜底
    const api = render({ shape: "line", dataMode: "api", apiUrl: "https://a.b" });
    expect(api).toMatch(/<div id="prg-[a-z0-9]+" /);
    const stat = render({ shape: "line", value: 40 });
    expect(stat).not.toMatch(/<div id="prg-[a-z0-9]+" /);
  });

  test("staticData 优先（全局静态源驱动，metric 同款）：数字与对象 {value} 形态", () => {
    // 数字形态：编译期 percent 采用 staticData 而非 config.value
    expect(render({ shape: "line", value: 60, staticData: 25 })).toContain("width:25%");
    // 对象形态：经 coerceProgressNumber 解包 value 键
    expect(render({ shape: "line", value: 60, staticData: { value: 30 } })).toContain("width:30%");
    // 不可解析（对象无兜底键）→ 回退 config.value
    expect(render({ shape: "line", value: 60, staticData: { foo: 1 } })).toContain("width:60%");
    // 圆形同样生效
    expect(render({ shape: "circle", value: 60, staticData: 25 })).toContain("stroke-dashoffset=\"");
  });

  test("运行时对象形态解包：coerceNum 镜像接受 {value|percent|current} 兜底键", () => {
    const out = render({ shape: "line", dataMode: "api", apiUrl: "https://a.b" });
    expect(out).toContain("v.value != null ? v.value : (v.percent != null ? v.percent : v.current)");
  });
});
