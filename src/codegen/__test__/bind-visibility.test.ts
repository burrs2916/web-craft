import { describe, test, expect } from "vitest";
import { skeletonCodegen } from "../components/skeleton";
import { spinCodegen } from "../components/spin";
import { emptyStateCodegen } from "../components/emptyState";
import { registerBasicComponents } from "../../editor/registerBasicComponents";
import { componentRegistry } from "../../editor/registryCore";
import type { SceneDSL } from "../../types/scene";
import type { SceneComponent } from "../../types/editor";
import type { CodegenContext } from "../types";
import { DEFAULT_CANVAS_CONFIG } from "../../store/editorStore";
import { createDefaultTransform } from "../../types/editor";
import { AUTH_ENABLED_OPTIONS } from "../../editor/data/authMode";

/**
 * 数据感知显隐（骨架屏 / 加载动画 / 空态占位）收敛回归测试
 *  1. 面板 schema 暴露数据感知字段（回归：能力曾存在但面板零字段）
 *  2. 发布脚本走统一骨架（URL/全局默认头/认证布尔/POST 请求体），旧手写认证模式清除
 *  3. loaded / empty 两种语义的显隐逻辑正确注入
 *  4. 生成脚本语法校验
 */

const mk = (type: string, config: Record<string, unknown>): { scene: SceneDSL; comp: SceneComponent } => {
  const comp: SceneComponent = {
    id: "c1", type, name: "C",
    transform: createDefaultTransform({ x: 0, y: 0, width: 320, height: 200 }),
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

const mkCtx = (scene: SceneDSL): CodegenContext => ({
  view: scene.views![0]!, canvasConfig: scene.canvasConfig!, scene, preview: false,
  componentMap: new Map(scene.views![0]!.components.map((c) => [c.id, c])),
  childrenByParent: new Map(), pageStyles: [], pageScripts: [], externalDeps: [], iconData: {},
});

const run = (type: string, config: Record<string, unknown>): string => {
  const { scene, comp } = mk(type, config);
  const ctx = mkCtx(scene);
  if (type === "skeleton") return skeletonCodegen(comp, ctx);
  if (type === "spin") return spinCodegen(comp, ctx);
  return emptyStateCodegen(comp, ctx);
};

const API_CFG = {
  visibilityMode: "api",
  bindUrl: "https://api.example.com/status",
  bindMethod: "GET",
  bindInterval: 5,
};

describe("面板 schema：数据感知字段暴露", () => {
  registerBasicComponents();
  const fieldKeys = (type: string) =>
    (componentRegistry.get(type)?.configSchema ?? []).map((f) => f.key);

  test("skeleton / spin 暴露加载感知字段组", () => {
    for (const type of ["skeleton", "spin"]) {
      const keys = fieldKeys(type);
      for (const k of ["visibilityMode", "bindUrl", "bindMethod", "bindHeaders", "bindBody", "bindInterval", "bindAuthEnabled", "hideOnError"]) {
        expect(keys, `${type} 缺 ${k}`).toContain(k);
      }
    }
  });

  test("empty-state 暴露空态感知字段组（含判空规则）", () => {
    const keys = fieldKeys("empty-state");
    for (const k of ["visibilityMode", "bindUrl", "bindMethod", "bindHeaders", "bindBody", "bindInterval", "bindAuthEnabled", "bindDataPath", "emptyWhen", "showWhenEmpty", "hideOnError"]) {
      expect(keys, `empty-state 缺 ${k}`).toContain(k);
    }
  });
});

describe("发布脚本：统一骨架收敛", () => {
  test("三组件脚本与 dataLoaderScript 同源（URL/默认头/认证布尔字面量）", () => {
    for (const type of ["skeleton", "spin", "empty-state"]) {
      const html = run(type, { ...API_CFG, bindAuthEnabled: true });
      expect(html, `${type}`).toContain("function buildFetchUrl()");
      expect(html, `${type}`).toContain("function buildFetchHeaders()");
      expect(html, `${type}`).toContain("window.__WC_DEFAULT_HEADERS");
      expect(html, `${type}`).toContain("var authEnabled = true");
      expect(html, `${type}`).toContain("setInterval(doFetch, apiInterval * 1000)");
      // 认证态联动：登录/登出后立即重新探测
      expect(html, `${type}`).toContain('addEventListener("auth-state-change"');
      // 旧手写认证模式已清除
      expect(html, `${type}`).not.toContain("JSON.parse(c).token");
    }
  });

  test("POST 探测：请求体按原文发送 + 自动补 Content-Type", () => {
    const html = run("skeleton", { ...API_CFG, bindMethod: "POST", bindBody: '{"id":1}' });
    expect(html).toContain("var apiBodyRaw = ");
    expect(html).toContain("body = apiBodyRaw");
    expect(html).toContain('headers["Content-Type"] = "application/json"');
  });

  test("loaded 模式：接口成功返回即隐藏", () => {
    const html = run("spin", API_CFG);
    expect(html).toContain('host.style.display="none";');
    // 失败按 hideOnError（默认 false → 继续显示）
    expect(html).toContain('host.style.display="";');
    expect(html).not.toContain("function isEmpty");
  });

  test("empty 模式：判空规则 + 显隐映射注入", () => {
    const html = run("empty-state", {
      ...API_CFG,
      bindDataPath: "data.list",
      emptyWhen: "emptyArray",
      showWhenEmpty: true,
      hideOnError: true,
    });
    expect(html).toContain("function isEmpty");
    expect(html).toContain("applyEmpty");
    expect(html).toContain('var apiDataPath = "data.list"');
    expect(html).toContain('"emptyArray"');
    // 失败隐藏
    expect(html).toContain('host.style.display="none";');
  });

  test("非 api 模式不注入脚本", () => {
    const html = run("skeleton", { visibilityMode: "always" });
    expect(html).not.toContain("doFetch");
  });

  test("生成脚本语法校验（new Function 仅解析）", () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ["skeleton", { ...API_CFG, bindMethod: "POST", bindBody: '{"q":1}', bindAuthEnabled: true }],
      ["spin", API_CFG],
      ["empty-state", { ...API_CFG, bindDataPath: "data.list", emptyWhen: "zero", showWhenEmpty: false }],
    ];
    for (const [type, config] of cases) {
      const html = run(type, config);
      const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
      expect(scripts.length, `${type} 应有脚本`).toBeGreaterThan(0);
      scripts.forEach((s, i) => {
        expect(() => new Function(s), `${type} 脚本#${i} 语法错误`).not.toThrow();
      });
    }
  });
});

/**
 * 数据感知族的「认证接入」与内容数据源**同一口径**（三态）。
 *
 * 回归背景（本轮 #9）：此前这里是两态 toggle（`injectAuth` 语义），缺省渲染成 OFF，
 * 而运行时把 `undefined` 当"不带 Token" —— 面板无法表达"跟随站点全局"这一最常用意图，
 * 站点全局开着时面板与实际行为还会互相矛盾。现与 `dataSourceFields.apiFields()` 共用
 * `AUTH_ENABLED_OPTIONS` + `readAuthEnabled`，并原样透传到运行时（null = 跟随全局）。
 */
describe("数据感知族：认证接入三态", () => {
  test("面板字段类型是 select 且选项含三态（含 null=跟随站点全局）", () => {
    for (const type of ["skeleton", "spin", "empty-state"]) {
      const f = (componentRegistry.get(type)?.configSchema ?? []).find((x) => x.key === "bindAuthEnabled");
      expect(f, `${type} 缺 bindAuthEnabled`).toBeTruthy();
      expect(f!.type, `${type} 仍是两态控件`).toBe("select");
      const values = (f!.options ?? []).map((o) => o.value);
      expect(values, `${type} 选项缺 null`).toContain(null);
      expect(values, `${type} 选项缺 true`).toContain(true);
      expect(values, `${type} 选项缺 false`).toContain(false);
      // 与内容数据源同一份选项对象（改一处即两处同步）
      expect(values).toEqual(AUTH_ENABLED_OPTIONS.map((o) => o.value));
    }
  });

  test("未设置 → 跟随站点全局（运行时 null，而不是被压成 false）", () => {
    for (const type of ["skeleton", "spin", "empty-state"]) {
      expect(run(type, API_CFG), `${type}`).toContain("var authEnabled = null");
    }
  });

  test("显式三态原样透传（含面板早期写回成字符串的 'false'）", () => {
    const cases: Array<[unknown, string]> = [
      [true, "var authEnabled = true"],
      [false, "var authEnabled = false"],
      ["false", "var authEnabled = false"],
      ["true", "var authEnabled = true"],
      [null, "var authEnabled = null"],
    ];
    for (const [value, expectLine] of cases) {
      expect(run("skeleton", { ...API_CFG, bindAuthEnabled: value }), `bindAuthEnabled=${String(value)}`)
        .toContain(expectLine);
    }
  });

  test("运行时按站点全局解析（null 时读 window.__WC_AUTH_ENABLED）", () => {
    const html = run("spin", API_CFG);
    expect(html).toContain("authEnabled === null ? (window.__WC_AUTH_ENABLED || false) : authEnabled === true");
  });
});
