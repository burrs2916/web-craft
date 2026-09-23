import { describe, test, expect } from "vitest";
import { generateHTML } from "../engine";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import type { SceneDSL } from "../../types/scene";
import type { CodegenContext } from "../types";
import { DEFAULT_CANVAS_CONFIG } from "../../store/editorStore";

initBuiltinCodegens();

/**
 * `authEnabled` 三态的产物级回归锁。
 *
 * 背景（真实缺陷）：属性面板的 `select` 会把选项值 `String()` 后写回 config，
 * 于是 `false` 变 `"false"`（字符串真值）。编辑区 `authEnabled === null ? 全局 : authEnabled`
 * 把 `"false"` 当真值 → 照样注入 Token；发布端却把字符串字面量化成布尔 `false` → 不注入。
 * **同一份配置，两端行为相反**。
 *
 * 本锁从产物侧验证：三态在发布产物里必须是三种不同的字面量，且 `false` 与 `null` 不能混同。
 */

const BASE_URL = "https://api.example.com/v1";
const API_CFG = { dataMode: "api", apiUrl: "metrics/summary", apiMethod: "GET", apiDataPath: "data", apiInterval: 0 };

function makeCtx(): CodegenContext {
  return { pageScripts: [], pageStyles: [] } as unknown as CodegenContext;
}

function comp(config: Record<string, unknown>, type = "metric"): SceneComponent {
  return {
    id: "m1",
    type,
    name: "X",
    transform: createDefaultTransform({ x: 0, y: 0, width: 240, height: 120 }),
    layerId: "l1",
    zIndex: 0,
    locked: false,
    visible: true,
    config,
    children: [],
    parentId: null,
  };
}

function scene(config: Record<string, unknown>, type = "metric"): SceneDSL {
  return {
    id: "s",
    name: "s",
    status: "draft",
    tags: [],
    metadata: {},
    createdAt: 0,
    updatedAt: 0,
    canvasConfig: { ...DEFAULT_CANVAS_CONFIG },
    apiConfig: { baseUrl: BASE_URL, authEnabled: true, timeout: 8000 },
    views: [{ id: "v1", name: "Home", layers: [], components: [comp(config, type)] }],
  };
}

/** 产物里数据源脚本声明的 authEnabled 字面量（`var authEnabled = true|false|null;`） */
function authLiterals(html: string): string[] {
  return [...html.matchAll(/var authEnabled = (true|false|null);/g)].map((m) => m[1]!);
}

describe("authEnabled 三态：产物字面量必须是三种不同结果", () => {
  const pageFor = (v: unknown) =>
    generateHTML(scene({ ...API_CFG, authEnabled: v }), { framework: "static-html", preview: false })
      .map((p) => p.html)
      .join("\n");

  test("true → 强制注入（字面量 true）", () => {
    const lits = authLiterals(pageFor(true));
    expect(lits.length).toBeGreaterThan(0);
    expect(new Set(lits)).toEqual(new Set(["true"]));
  });

  test("false → 明确不注入（字面量 false）", () => {
    const lits = authLiterals(pageFor(false));
    expect(new Set(lits)).toEqual(new Set(["false"]));
  });

  test("null / undefined → 跟随站点全局（字面量 null）", () => {
    expect(new Set(authLiterals(pageFor(null)))).toEqual(new Set(["null"]));
    expect(new Set(authLiterals(pageFor(undefined)))).toEqual(new Set(["null"]));
  });

  test("历史脏值：字符串写法必须收敛成对应布尔/空（不能落错）", () => {
    expect(new Set(authLiterals(pageFor("false")))).toEqual(new Set(["false"]));
    expect(new Set(authLiterals(pageFor("true")))).toEqual(new Set(["true"]));
    expect(new Set(authLiterals(pageFor("null")))).toEqual(new Set(["null"]));
    // 关键：字符串 "false" 绝不能被当成真值原样透传
    expect(pageFor("false")).not.toContain('authEnabled = "false"');
  });
});

describe("组件级 authEnabled 三态透传（表单 / 图标）", () => {
  const CASES: Array<[string, Record<string, unknown>]> = [
    ["form-select", { dataMode: "api", apiUrl: "x", apiMethod: "GET" }],
    ["form-cascader", { dataMode: "api", apiUrl: "x", apiMethod: "GET" }],
    ["icon", { dataMode: "api", apiUrl: "x" }],
  ];

  test.each(CASES)("%s 的三态在产物里可区分且类型正确", (type, base) => {
    const run = (v: unknown) => {
      const ctx = makeCtx();
      const html = getCodegen(type)!(comp({ ...base, authEnabled: v }, type) as never, ctx as never);
      return html + (ctx.pageScripts ?? []).join("");
    };
    const t = run(true);
    const f = run(false);
    const n = run(null);
    // 三种取值必须产出不同结果（说明字段真的被消费，不是摆设）
    expect(t).not.toBe(f);
    expect(f).not.toBe(n);
    expect(n).not.toBe(t);
    // 字面量类型正确（不是被字符串化的 "true"/"false"/"null"）
    expect(t).toContain("authEnabled = true");
    expect(f).toContain("authEnabled = false");
    expect(n).toContain("authEnabled = null");
  });
});

describe("echart-pie 玫瑰图「关闭」：面板值必须是布尔 false", () => {
  /**
   * 真实缺陷链：面板 select 把 `value: false` 写成字符串 `"false"` →
   * 编辑区 `const roseType = config.roseType || false` 取到真值字符串 → 走 ECharts 的
   * `r: roseType ? linearMap(...) : r`（`pieLayout.js:150`）→ **画布是玫瑰图**；
   * 而发布端 `roseType === "radius" || "area"` 判否 → **普通饼图**。两端相反。
   */
  const pieScripts = (v: unknown): string => {
    const ctx = makeCtx();
    getCodegen("echart-pie")!(comp({ roseType: v }, "echart-pie") as never, ctx as never);
    return (ctx.pageScripts ?? []).join("\n");
  };

  test("roseType 写进产物脚本时必须是布尔，且运行时判据只看 radius/area", () => {
    // 产物在浏览器里运行时读的是 `cfg.roseType`，所以「面板存了什么类型」直接决定两端是否一致
    expect(pieScripts(false)).toContain('"roseType":false');
    expect(pieScripts("radius")).toContain('"roseType":"radius"');
    expect(pieScripts("area")).toContain('"roseType":"area"');
    // 运行时判据是**白名单**（与编辑区 PieChartRenderer 同一条件）：任何非 radius/area
    // 的值 —— 包括历史脏值字符串 "false" —— 都落成普通饼图，两端不会再相反。
    for (const v of [false, "false", null, undefined, 0]) {
      expect(pieScripts(v)).toContain('cfg.roseType === "radius" || cfg.roseType === "area"');
    }
    // 而面板侧已经不可能再产出字符串（见下一条用例）：写回值类型由 fieldSelect 保证。
  });

  test("面板对「关闭」选项写回布尔 false（而不是字符串 \"false\"）", async () => {
    const { resolveSelectValue } = await import("../../editor/data/fieldSelect");
    const { componentRegistry } = await import("../../editor/registry");
    const { registerChartComponents } = await import("../../editor/registerChartComponents");
    registerChartComponents();
    const field = (componentRegistry.get("echart-pie")?.configSchema ?? []).find((f) => f.key === "roseType");
    expect(field?.options?.map((o) => o.value)).toContain(false);
    expect(resolveSelectValue(field!, "false")).toBe(false);
  });
});
