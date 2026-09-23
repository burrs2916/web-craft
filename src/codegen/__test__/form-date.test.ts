import { describe, test, expect, beforeAll } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { DateTimeField } from "../../editor/renderers/DateTimeField";
import { componentRegistry } from "../../editor/registry";
import { registerFormComponents } from "../../editor/registerFormComponents";

initBuiltinCodegens();
beforeAll(() => { registerFormComponents(); });

function comp(config: Record<string, unknown>): SceneComponent {
  return {
    id: "c1", type: "form-date", name: "form-date",
    transform: createDefaultTransform({ x: 0, y: 0, width: 280, height: 56 }),
    layerId: "l1", zIndex: 0, locked: false, visible: true,
    config, children: [], parentId: null,
  };
}
const render = (config: Record<string, unknown>): string =>
  getCodegen("form-date")!(comp(config), { pageScripts: [], pageStyles: [] } as never);

/** 本机当天 YYYY-MM-DD（与发布端运行时 / 编辑区同源算法） */
function todayISO(): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const t = new Date();
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

describe("form-date：默认值=今天（defaultToToday，第 15 轮 G1）", () => {
  test("开启且未填默认值：不写死 value，load 时运行时填当天（避免构建日固化）", () => {
    const out = render({ label: "日期", defaultToToday: true });
    // 产物无静态 value 属性（否则就是构建日写死）
    expect(out).not.toMatch(/value="\d{4}-\d{2}-\d{2}"/);
    // 注入的脚本在 load 时给 input 填当天日期（pad 补零 + new Date）
    expect(out).toContain("if(true)");
    expect(out).toContain("var t=new Date()");
    expect(out).toContain("i.value=t.getFullYear()+'-'+p(t.getMonth()+1)+'-'+p(t.getDate())");
  });

  test("显式填默认值优先于 defaultToToday：写死 value，无今天脚本", () => {
    const out = render({ label: "日期", defaultToToday: true, value: "2026-01-01" });
    expect(out).toContain('value="2026-01-01"');
    expect(out).not.toContain("if(true)");
  });

  test("未开启：无今天脚本（无 placeholder/清空时整段脚本缺失）", () => {
    const out = render({ label: "日期" });
    // dtToday 特征：var t=new Date()（月历 today() 是 new Date() 无 var t，且无 var p 补零前缀）
    expect(out).not.toContain("var t=new Date()");
    expect(out).not.toMatch(/var p=function\(n\)/);
  });

  test("编辑区渲染器同源：未填值且开启时显示当天日期", () => {
    const html = renderToStaticMarkup(
      createElement(DateTimeField as never, { config: { label: "日期", defaultToToday: true }, mode: "preview", type: "date", width: 280, height: 56, componentId: "c1" } as never),
    );
    expect(html).toContain(todayISO());
  });

  test("编辑区：显式默认值优先于今天", () => {
    const html = renderToStaticMarkup(
      createElement(DateTimeField as never, { config: { label: "日期", defaultToToday: true, value: "2026-01-01" }, mode: "preview", type: "date", width: 280, height: 56, componentId: "c1" } as never),
    );
    expect(html).toContain("2026-01-01");
    expect(html).not.toContain(todayISO());
  });
});

function compTime(config: Record<string, unknown>): SceneComponent {
  return {
    id: "c1", type: "form-time", name: "form-time",
    transform: createDefaultTransform({ x: 0, y: 0, width: 280, height: 56 }),
    layerId: "l1", zIndex: 0, locked: false, visible: true,
    config, children: [], parentId: null,
  };
}
const renderTime = (config: Record<string, unknown>): string =>
  getCodegen("form-time")!(compTime(config), { pageScripts: [], pageStyles: [] } as never);

describe("form-date / form-time：动态数据（G2，与 slider/switch 同套键与语义）", () => {
  test("static 模式零脚本（date/time 产物与历史逐字节一致的前提）", () => {
    const d = render({ label: "日期", value: "2026-01-01" });
    const t = renderTime({ label: "时间", value: "13:45" });
    expect(d).not.toContain("__wcDt_");
    expect(d).not.toContain("var apiUrl");
    expect(d).toContain('value="2026-01-01"');
    expect(t).not.toContain("__wcDt_");
    expect(t).toContain('value="13:45"');
  });

  test("api 模式 + 有地址：dataLoaderScript 骨架 + __wcDt_ 更新回调（date/time 共用同一函数）", () => {
    const d = render({ label: "日期", dataMode: "api", apiUrl: "https://a.b/d", apiDataPath: "data.d", authEnabled: true, apiInterval: 5 });
    const t = renderTime({ label: "时间", dataMode: "api", apiUrl: "https://a.b/t", apiDataPath: "data.t" });
    for (const out of [d, t]) {
      expect(out).toContain('var apiUrl = "https://a.b/');
      expect(out).toContain('var apiDataPath = "data.');
      expect(out).toContain('window["__wcDt_');
      // 更新回调：对象 unwrap（value/date/time）+ 不抢用户正在编辑的值守卫
      expect(out).toContain("function update(v){");
      expect(out).toContain("document.activeElement===i");
      expect(out).toContain('v.date!=null?v.date:v.time');
      expect(out).toContain("i.value=str");
      // 取数骨架回调把 data 喂给 __wcDt_
      expect(out).toContain("if (window");
      expect(out).toContain("__wcDt_");
    }
    expect(d).toContain("var authEnabled = true");
    expect(d).toContain("var apiInterval = 5");
  });

  test("field 数据源绑定：监听包装层 data-update 事件（数据引擎派发目标）", () => {
    const out = render({ field: "orderDate", dataMode: "datasource", dataSourceId: "ds1" });
    expect(out).toContain('el.addEventListener("data-update"');
    expect(out).toContain('d["orderDate"] !== undefined ? d["orderDate"] : d.value');
    // 同时暴露 __wcDt_ 供引擎直接调用
    expect(out).toContain('window["__wcDt_');
  });

  test("api 模式无地址：不注入任何取数脚本", () => {
    const d = render({ label: "日期", dataMode: "api", apiUrl: "" });
    const t = renderTime({ label: "时间", dataMode: "api", apiUrl: "" });
    expect(d).not.toContain("var apiUrl");
    expect(d).not.toContain("__wcDt_");
    expect(t).not.toContain("__wcDt_");
  });

  test("认证三态原样字面量化（null = 跟随全局）", () => {
    expect(render({ dataMode: "api", apiUrl: "https://a.b/d", authEnabled: true })).toContain("var authEnabled = true");
    expect(render({ dataMode: "api", apiUrl: "https://a.b/d", authEnabled: false })).toContain("var authEnabled = false");
    expect(render({ dataMode: "api", apiUrl: "https://a.b/d", authEnabled: null })).toContain("var authEnabled = null");
  });

  test("defaultToToday 在动态模式被压制：不写今天脚本、改由动态驱动", () => {
    const out = render({ label: "日期", defaultToToday: true, dataMode: "api", apiUrl: "https://a.b/d" });
    // 动态接管后「默认今天」失效
    expect(out).not.toContain("var t=new Date()");
    expect(out).not.toContain("if(true)");
    // 但仍注入动态回读能力
    expect(out).toContain('window["__wcDt_');
    // api 模式隐藏静态 value（不会写死构建日）
    expect(out).not.toMatch(/value="\d{4}-\d{2}-\d{2}"/);
  });

  test("编辑区：动态模式压制 defaultToToday（datasource 回退静态 value，不显示今天）", () => {
    const html = renderToStaticMarkup(
      createElement(DateTimeField as never, {
        config: { label: "日期", defaultToToday: true, value: "2026-03-03", dataMode: "datasource", dataSourceId: "ds1", field: "f" },
        mode: "preview", type: "date", width: 280, height: 56, componentId: "c1",
      } as never),
    );
    expect(html).toContain("2026-03-03");
    expect(html).not.toContain(todayISO());
  });

  test("编辑区：api 模式静态回退取 config.value（发布端同源 fallback）", () => {
    const html = renderToStaticMarkup(
      createElement(DateTimeField as never, {
        config: { label: "日期", value: "2026-07-07", dataMode: "api", apiUrl: "https://a.b/d" },
        mode: "preview", type: "date", width: 280, height: 56, componentId: "c1",
      } as never),
    );
    expect(html).toContain("2026-07-07");
  });
});

describe("form-date / form-time：#1 面板诚实性 + #2 全局静态源 staticData", () => {
  test("#1 defaultToToday 在动态模式隐藏（与 value 同款口径；form-time 无此字段）", () => {
    const def = componentRegistry.get("form-date")!;
    const f = def.configSchema!.find((x) => x.key === "defaultToToday")!;
    expect(f).toBeTruthy();
    expect(f.hidden?.({ dataMode: "static" } as never)).toBeFalsy();
    expect(f.hidden?.({ dataMode: "api" } as never)).toBe(true);
    expect(f.hidden?.({ dataMode: "datasource", field: "orderDate" } as never)).toBe(true);
    // 时间无「今天」语义 → 不应暴露该字段
    const t = componentRegistry.get("form-time")!;
    expect(t.configSchema!.some((x) => x.key === "defaultToToday")).toBe(false);
  });

  test("#2 staticData 显式存在时优先于静态 value（全局静态数据源驱动，date/time 同源）", () => {
    const d = render({ label: "日期", value: "2026-01-01", staticData: "2026-05-05" });
    expect(d).toContain('value="2026-05-05"');
    expect(d).not.toContain('value="2026-01-01"');
    const t = renderTime({ label: "时间", value: "13:45", staticData: "08:30" });
    expect(t).toContain('value="08:30"');
    expect(t).not.toContain('value="13:45"');
  });

  test("#2 staticData 不可解析（对象/空）时回退自带 value（coerce 语义）", () => {
    expect(render({ label: "日期", value: "2026-01-01", staticData: { foo: 1 } })).toContain('value="2026-01-01"');
    expect(render({ label: "日期", value: "2026-01-01", staticData: "" })).toContain('value="2026-01-01"');
  });

  test("#2 staticData 存在时不再预填「默认今天」", () => {
    const out = render({ label: "日期", defaultToToday: true, staticData: "2026-05-05" });
    expect(out).toContain('value="2026-05-05"');
    expect(out).not.toContain("var t=new Date()");
  });

  test("#2 编辑区同源：staticData 优先显示、覆盖自带 value", () => {
    const html = renderToStaticMarkup(
      createElement(DateTimeField as never, {
        config: { label: "日期", value: "2026-01-01", staticData: "2026-05-05" },
        mode: "preview", type: "date", width: 280, height: 56, componentId: "c1",
      } as never),
    );
    expect(html).toContain("2026-05-05");
    expect(html).not.toContain("2026-01-01");
  });
});
