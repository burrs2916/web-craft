import { describe, test, expect, beforeAll, vi } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { registerBuiltinComponents } from "../../editor/registry";
import { componentRegistry } from "../../editor/registryCore";
import { DATA_CONFIG_SCHEMA } from "../../editor/dataConfigMixin";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";

/**
 * 属性栏「数据源」分组的诚实性契约锁。
 *
 * 背景（本轮修掉的真实缺陷）：
 *   注册表曾按"类目前缀 + 跳过名单"**自动**给组件塞进通用数据源分组
 *   （`DATA_CONFIG_SCHEMA`，9~10 条控件）。实测 32 个被塞进分组的组件里，
 *   **29 个改了这组字段产物毫无变化** —— 也就是说用户打开属性栏，
 *   看到一整组"API 地址 / 请求方式 / 轮询间隔 / 注入认证 Token"，
 *   挨个填完点发布，页面不会有任何反应。配了不生效比没有更糟。
 *
 * 现在的规则（本文件即其守门人）：
 *   1. 组件若在 configSchema 里出现通用数据源字段，那这些字段**必须是它自己声明的**，
 *      或者它显式写了 `dataConfigMixin: true`（表示"我确实消费这组字段"）；
 *   2. 显式声明 `dataConfigMixin: true` 的组件，改这组字段必须能改变产物（否则就是假声明）；
 *   3. 组件**自己声明**的数据字段不受本锁约束 —— 它们的可用性常由组件自身的
 *      模式开关（如 avatar 的 `sourceMode`）决定，属于该组件自己的事。
 */

/** 通用分组的字段名（去掉 `__dataGroupTitle` 这类纯展示项） */
const MIXIN_KEYS = DATA_CONFIG_SCHEMA.map((f) => f.key).filter((k) => !k.startsWith("__"));

/** 组件自己声明的字段名（注册表合并前的原始 schema） */
const ownKeys = new Map<string, string[]>();

beforeAll(() => {
  const original = componentRegistry.register.bind(componentRegistry);
  (componentRegistry as unknown as { register: (d: never) => void }).register = ((def: {
    type: string;
    configSchema?: Array<{ key: string }>;
  }) => {
    ownKeys.set(def.type, (def.configSchema ?? []).map((f) => f.key));
    return original(def as never);
  }) as never;
  initBuiltinCodegens();
  registerBuiltinComponents();
});

describe("通用数据源分组：只有显式声明才注入", () => {
  test("没有任何组件被静默塞进通用数据源字段", () => {
    const offenders: string[] = [];
    for (const d of componentRegistry.getAll()) {
      if (d.dataConfigMixin === true) continue;
      const own = ownKeys.get(d.type) ?? [];
      const injected = (d.configSchema ?? [])
        .map((f) => f.key)
        .filter((k) => MIXIN_KEYS.includes(k) && !own.includes(k));
      if (injected.length > 0) offenders.push(`${d.type} ← ${injected.join(",")}`);
    }
    expect(offenders, "以下组件出现了「未声明却被注入」的数据源字段").toEqual([]);
  });

  test("显式声明的组件，数据源字段必须真的能改变产物", () => {
    let seed = 0;
    vi.spyOn(Math, "random").mockImplementation(() => {
      seed = (seed + 1) % 1000000;
      return seed / 1000000;
    });

    const declared = componentRegistry.getAll().filter((d) => d.dataConfigMixin === true);

    for (const d of declared) {
      const fn = getCodegen(d.type);
      expect(fn, `${d.type} 声明了 dataConfigMixin 却没有 codegen`).toBeTruthy();
      const base = d.defaultConfig as Record<string, unknown>;
      const own = new Set(ownKeys.get(d.type) ?? []);
      const injected = (d.configSchema ?? [])
        .map((f) => f.key)
        .filter((k) => MIXIN_KEYS.includes(k) && !own.has(k));

      const run = (cfg: Record<string, unknown>) => {
        seed = 0;
        const ctx = { pageScripts: [] as string[], pageStyles: [] as string[] } as never;
        const component: SceneComponent = {
          id: "c1", type: d.type, name: d.type,
          transform: createDefaultTransform({ x: 0, y: 0, width: 360, height: 160 }),
          layerId: "l1", zIndex: 0, locked: false, visible: true,
          config: cfg, children: [], parentId: null,
        };
        let html = "";
        try { html = fn!(component, ctx) ?? ""; } catch { /* 抛错则视为无变化 */ }
        const cx = ctx as unknown as { pageScripts?: string[]; pageStyles?: string[] };
        return html + (cx.pageScripts ?? []).join("") + (cx.pageStyles ?? []).join("");
      };

      const on: Record<string, unknown> = { ...base };
      for (const k of injected) {
        on[k] = k === "dataMode" ? "api"
          : k === "authEnabled" ? true
            : k === "apiInterval" ? 9
              : k === "staticData" ? '{"mark":"PROBE"}'
                : k === "apiMethod" ? "POST"
                  : k === "apiHeaders" ? '{"X":"1"}'
                    : k === "apiBody" ? '{"a":1}'
                      : "PROBEMARK";
      }
      expect(run(on), `${d.type} 声明了 dataConfigMixin，但数据源字段改变不了产物`).not.toBe(run(base));
    }
  });
});
