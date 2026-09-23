/**
 * 「数据键诚实性」扫描器 —— 跨层锁：**codegen 消费的数据键，必须有 UI 能把值送进去**。
 *
 * 为什么需要它：属性栏（EditorPropertyPanel）恒过滤 `数据源` 分组，数据接入的唯一 UI 入口是
 * API 面板（EditorApiConfigPanel），而该面板**由组件 schema 驱动**（档位读 `dataMode.options`、
 * 显隐读各字段的 `hidden`）。于是存在一个隐蔽失败模式：
 *   某组件 codegen 读了 `apiUrl`/`apiMethod`…，但 schema 没声明该键
 *   → 面板无从渲染该控件 → 组件「有能力却无入口」；旧实现只能靠在面板里硬编码 static/api
 *     档位兜底，而那对 83 个组件而言是**纯假控件**（改档位产物毫无变化，已实测）。
 *
 * 判定法（无假阳性）：以「该键 ON」为基线，只关掉这一个键重渲染，产物变化 ⇒ 该键被真实消费。
 * 规则：
 *   · dataMode/apiUrl/apiPath/apiMethod/apiBody/apiHeaders/apiDataPath/apiInterval/authEnabled
 *     —— 消费即必须在 schema 声明（这些键的语义就是「本组件自己的取数配置」）。
 *   · staticData —— 例外：它可由**全局数据源**注入（engine 覆盖本地配置），
 *     故消费它的前提不是「本地声明 staticData」，而是「声明 dataSourceId 作为注入通道」。
 *     （slider / steps / timeline / form-date 皆如此：本地静态值走各自专用字段 value/items。）
 *
 * 与 panel-honesty-scan 的分工：那个扫描器逐字段比对**属性栏 schema 字段**，并显式 SKIP 了
 * `dataMode`（"需完整数据源接线才改变产物"）与布局类组件；本扫描器补上被跳过的这块。
 *
 * 复用其坑位结论：① 要一起比对 ctx.pageStyles/pageScripts；② uid 来自随机源，每次渲染前钉住；
 * ③ 组件 codegen 可能依赖 ctx.scene（如 navbar-horizontal 读 views）→ 补最小 scene 并容错跳过。
 */
import { describe, test, expect, beforeAll, vi } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../../codegen/components";
import { componentRegistry, registerBuiltinComponents } from "../registry";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";

initBuiltinCodegens();
beforeAll(() => {
  registerBuiltinComponents();
});

/** API 模式「全开」基线：每个键都给非默认值，便于逐个关掉观察贡献 */
const API_ON: Record<string, unknown> = {
  dataMode: "api",
  apiUrl: "https://x.example/a",
  apiPath: "/p",
  apiMethod: "POST",
  apiBody: '{"b":1}',
  apiHeaders: '{"A":"1"}',
  apiDataPath: "d",
  apiInterval: 5,
  authEnabled: true,
};

const KEYS = Object.keys(API_ON);
const STATIC_ON: Record<string, unknown> = { dataMode: "static", staticData: "SD" };

/** 最小可用 ctx：补 scene 以容纳 navbar-horizontal 等读 views 的 codegen */
const ctxTemplate = {
  pageScripts: [] as string[],
  pageStyles: [] as string[],
  iconData: {},
  globalDataSources: {},
  scene: { id: "s1", name: "scene", views: [], dataSources: [] },
};

function comp(type: string, config: Record<string, unknown>): SceneComponent {
  const def = componentRegistry.get(type);
  const dw = (def?.defaultSize.width ?? 320) * 2;
  const dh = (def?.defaultSize.height ?? 120) * 2;
  return {
    id: "c1", type, name: type,
    transform: createDefaultTransform({ x: 0, y: 0, width: dw, height: dh }),
    layerId: "l1", zIndex: 0, locked: false, visible: true, config, children: [], parentId: null,
  };
}

/** 全量产物；抛出（依赖更完整的 ctx）时返回 null → 该类型记入 skipped，不参与判定 */
function render(type: string, config: Record<string, unknown>): string | null {
  const fn = getCodegen(type);
  if (!fn) return null;
  const spy = vi.spyOn(Math, "random").mockReturnValue(0.42); // uid 来源钉死，两次必须逐字相同
  const ctx = { ...ctxTemplate, pageScripts: [] as string[], pageStyles: [] as string[] };
  try {
    return (
      (fn(comp(type, config), ctx as never) as string) +
      "\u0000styles\u0000" + ctx.pageStyles.join("|") +
      "\u0000scripts\u0000" + ctx.pageScripts.join("|")
    );
  } catch {
    return null;
  } finally {
    spy.mockRestore();
  }
}

const schemaKeys = (type: string): Set<string> =>
  new Set((componentRegistry.get(type)?.configSchema ?? []).map((f) => f.key));

describe("数据键诚实性：codegen 消费的键必须有 UI 通道", () => {
  test("逐个数据键隔离探测：消费即必须声明（dataMode/apiUrl/apiPath/apiMethod/apiBody/apiHeaders/apiDataPath/apiInterval/authEnabled）", () => {
    const violations: string[] = [];
    let probed = 0;
    let skipped = 0;
    for (const def of componentRegistry.getAll()) {
      if (!getCodegen(def.type)) continue;
      const declared = schemaKeys(def.type);
      const base = render(def.type, API_ON);
      if (base === null) { skipped++; continue; }
      for (const k of KEYS) {
        if (declared.has(k)) continue; // 已声明，无需探测
        const without = { ...API_ON };
        delete without[k];
        const probe = render(def.type, without);
        if (probe === null) { skipped++; continue; }
        probed++;
        if (probe !== base) violations.push(`${def.type}: codegen 消费 "${k}"，但 schema 未声明`);
      }
    }
    expect(probed, "有效探测次数").toBeGreaterThan(100);
    expect(skipped, "跳过的探测次数不应吞掉面").toBeLessThan(200);
    expect(violations, "\n" + violations.join("\n")).toEqual([]);
  });

  test("staticData 例外规则：消费它就必须声明 dataSourceId（全局源注入通道）", () => {
    const violations: string[] = [];
    let consumed = 0;
    for (const def of componentRegistry.getAll()) {
      if (!getCodegen(def.type)) continue;
      const declared = schemaKeys(def.type);
      if (declared.has("staticData")) continue; // 本地已声明，天然有通道
      const withStatic = render(def.type, STATIC_ON);
      const without = render(def.type, { dataMode: "static" });
      if (withStatic === null || without === null || withStatic === without) continue;
      consumed++;
      if (!declared.has("dataSourceId")) {
        violations.push(`${def.type}: 消费 staticData 却既未声明 staticData 也未声明 dataSourceId（无注入通道）`);
      }
    }
    expect(consumed, "消费 staticData 的组件数").toBeGreaterThan(0);
    expect(violations, "\n" + violations.join("\n")).toEqual([]);
  });

  test("假控件反例：schema 无 dataMode 的组件，codegen 必须对 dataMode 不敏感", () => {
    const violations: string[] = [];
    let checked = 0;
    for (const def of componentRegistry.getAll()) {
      if (!getCodegen(def.type) || schemaKeys(def.type).has("dataMode")) continue;
      const a = render(def.type, {});
      const b = render(def.type, { dataMode: "api" });
      if (a === null || b === null) continue;
      checked++;
      if (a !== b) violations.push(`${def.type}: 单翻 dataMode 即改变产物，却未在 schema 声明该档位`);
    }
    expect(checked, "抽查组件数").toBeGreaterThan(50);
    expect(violations, "\n" + violations.join("\n")).toEqual([]);
  });
});
