/**
 * 「数据源接入」面板契约锁 —— EditorApiConfigPanel 是全局数据源绑定的**唯一 UI 入口**。
 *
 * 背景：属性栏（EditorPropertyPanel）恒过滤 `数据源` 分组 + `global-datasource` / `datafield`
 * 字段类型，因此绑定全局数据源此前**完全没有入口**（引擎 withEffectiveConfig 与发布端
 * scaffold/data.ts 早已支持，用户却触达不到）。
 *
 * 契约（面板必须由组件自身 schema 驱动，不得硬编码档位/显隐）：
 *   · 模式档位 ← schema `dataMode.options`：吃下 gauge 的 realtime 等第三态；
 *   · 显隐     ← schema 各字段的 `hidden(config)`：与属性栏同源。
 *
 * 两类接法（勿混，混了就是假控件）：
 *   · 绑定型：`dataMode` 含 "datasource" → 发布端派生 value 绑定 → 运行时 data-update 事件；
 *   · 展示型：`dataMode` 只有 static/api，绑定靠**恒显示**的 `dataSourceId`（引擎覆盖本地取数配置）。
 * 若绑定型组件露出 datasource 档却不声明 dataSourceId/field，该档位就是死的。
 */
import { describe, test, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { componentRegistry, registerBuiltinComponents } from "../registry";
import { dataSourceSchemaFields, dataSourceSchemaFieldsNoStatic } from "../dataSourceFields";
import type { ConfigField } from "../../types/editor";

beforeAll(() => {
  registerBuiltinComponents();
});

type SchemaRow = { type: string; fields: ConfigField[] };

const allSchemas = (): SchemaRow[] =>
  componentRegistry.getAll().map((d) => ({ type: d.type, fields: d.configSchema ?? [] }));

const field = (fields: ConfigField[], key: string): ConfigField | undefined =>
  fields.find((f) => f.key === key);

/** 「绑定型」判据：dataMode 把绑定本身当作一个档位（含 "datasource"） */
const isBindingType = (fields: ConfigField[]): boolean =>
  Boolean((field(fields, "dataMode")?.options ?? []).some((o) => String(o.value) === "datasource"));

const typeNames = (pred: (fields: ConfigField[]) => boolean): string[] =>
  allSchemas()
    .filter((s) => pred(s.fields))
    .map((s) => s.type)
    .sort();

describe("数据源接入面板契约", () => {
  test("绑定型组件必须同时声明 dataSourceId 与 field（否则面板露出死档位）", () => {
    const bad = typeNames(
      (f) => isBindingType(f) && (!field(f, "dataSourceId") || !field(f, "field")),
    );
    expect(bad, "绑定型组件缺 dataSourceId/field").toEqual([]);
  });

  test("绑定型组件清单（能力清单：新增必须显式登记，并同步面板与发布端语义）", () => {
    expect(typeNames(isBindingType)).toEqual([
      "form-date",
      "form-slider",
      "form-time",
      "metric",
      "progress",
    ]);
  });

  test("绑定型：dataSourceId/field 仅在 datasource 档显示（模式即绑定开关）", () => {
    let checked = 0;
    for (const { type, fields } of allSchemas()) {
      if (!isBindingType(fields)) continue;
      const dsField = field(fields, "dataSourceId")!;
      const fField = field(fields, "field")!;
      expect(dsField.hidden?.({ dataMode: "api" } as never), `${type}: api 档不应显示数据源`).toBe(true);
      expect(dsField.hidden?.({ dataMode: "datasource" } as never), `${type}: datasource 档应显示数据源`).toBe(false);
      // 未选数据源时不显示字段选择，避免"选了字段却没源"
      expect(fField.hidden?.({ dataMode: "datasource", dataSourceId: "" } as never), `${type}: 未选源不应显示字段`).toBe(true);
      expect(fField.hidden?.({ dataMode: "datasource", dataSourceId: "ds1" } as never), `${type}: 选源后应显示字段`).toBe(false);
      checked++;
    }
    expect(checked, "绑定型样本数").toBeGreaterThan(0);
  });

  test("展示型：dataSourceId 恒显示（绑定入口不会在某些状态下消失）", () => {
    const dsCapable = allSchemas().filter((s) => Boolean(field(s.fields, "dataSourceId")));
    expect(dsCapable.length, "声明 dataSourceId 的组件不应为空").toBeGreaterThan(10);
    let checked = 0;
    for (const { type, fields } of dsCapable) {
      if (isBindingType(fields)) continue; // 绑定型的 dataSourceId 有 hidden（仅 datasource 档显示），另测
      // 有 hidden 就意味着"某些状态下绑定入口消失"——展示型必须恒显示，否则又回到不可达
      expect(field(fields, "dataSourceId")!.hidden, `${type}: 展示型 dataSourceId 不应有 hidden`).toBeUndefined();
      checked++;
    }
    expect(checked, "展示型样本数").toBeGreaterThan(10);
  });

  test("共享字段组：绑定全局源后 dataMode / api* 让位（面板据此隐藏本地配置，不出现矛盾控件）", () => {
    const dm = dataSourceSchemaFields.find((f) => f.key === "dataMode")!;
    expect(dm.hidden?.({} as never), "未绑定：模式档位应可见").toBe(false);
    expect(dm.hidden?.({ dataSourceId: "x" } as never), "已绑定：模式档位应让位").toBe(true);
    const apiUrl = dataSourceSchemaFields.find((f) => f.key === "apiUrl")!;
    expect(apiUrl.hidden?.({ dataMode: "api" } as never), "api 档：接口字段应可见").toBe(false);
    expect(apiUrl.hidden?.({ dataMode: "static" } as never), "非 api 档：接口字段应隐藏").toBe(true);
    expect(apiUrl.hidden?.({ dataMode: "api", dataSourceId: "x" } as never), "已绑定：接口字段应让位").toBe(true);
    // 展示型的 dataSourceId 恒显示（无 hidden）
    expect(dataSourceSchemaFields.find((f) => f.key === "dataSourceId")!.hidden).toBeUndefined();
    // gauge 族自持 dataMode（含 realtime），其 dataSourceId 同样恒显示——面板按 schema 透传即可
    expect(dataSourceSchemaFieldsNoStatic.find((f) => f.key === "dataSourceId")!.hidden).toBeUndefined();
  });

  test("面板由 schema 驱动（源码守卫：档位/显隐不得硬编码）", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../panels/EditorApiConfigPanel.tsx"), "utf8");
    expect(src, "模式档位应读 schema options").toContain('fieldOf("dataMode")?.options');
    expect(src, "数据源显隐应读 schema hidden").toContain('isHidden("dataSourceId")');
    expect(src, "不应硬编码「数据源绑定」档位").not.toContain('label: "数据源绑定"');
    expect(src, "不应硬编码模式档位").not.toContain('{ v: "static", label: "静态" }');
  });

  test("接口字段映射：schema 的「数据源」api* 文本字段必须有渲染通道（本面板是唯一入口）", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../panels/EditorApiConfigPanel.tsx"), "utf8");
    // 判据与面板源码同源：group「数据源」+ text + api* + 排除本面板已渲染的取数键
    expect(src, "字段映射区未按 schema group 通用渲染").toContain('f.group === "数据源"');
    expect(src, "字段映射区未接排除表").toContain("API_MAPPING_RENDERED_KEYS");
    for (const k of ["apiUrl", "apiPath", "apiMethod", "apiHeaders", "apiBody", "apiDataPath", "apiInterval"]) {
      expect(src, `排除表漏 "${k}"（会与本面板已有输入框重复）`).toContain(`"${k}"`);
    }
    // 能力清单：form-cascader 的取值/显示/子级三个映射字段
    const cas = allSchemas().find((s) => s.type === "form-cascader")!;
    const mapping = cas.fields.filter(
      (f) => f.group === "数据源" && f.type === "text" && f.key.startsWith("api") &&
        !["apiUrl", "apiPath", "apiMethod", "apiHeaders", "apiBody", "apiDataPath", "apiInterval"].includes(f.key),
    );
    expect(mapping.map((f) => f.key).sort()).toEqual(["apiChildrenField", "apiLabelField", "apiValueField"]);
    // 且这批字段仅在「api 模式且未绑定全局源」可见 → 面板不会渲染死控件
    for (const f of mapping) {
      expect(f.hidden?.({ dataMode: "static" } as never), `${f.key}: 非 api 档不应显示`).toBe(true);
      expect(f.hidden?.({ dataMode: "api" } as never), `${f.key}: api 档应显示`).toBe(false);
      expect(f.hidden?.({ dataMode: "api", dataSourceId: "x" } as never), `${f.key}: 已绑定应让位`).toBe(true);
    }
  });
});
