import { describe, test, expect } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import { installDatePickerPopup } from "../../editor/data/datePickerPopup";

initBuiltinCodegens();

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

// ── 零依赖 DOM 沙箱（node 环境，无 jsdom；同 time-picker-popup.test.ts）──
interface FakeEl {
  tagName: string;
  style: Record<string, string>;
  attrs: Record<string, string>;
  handlers: Record<string, ((e: unknown) => void)[]>;
  childNodes: FakeEl[];
  parentNode: FakeEl | null;
  textContent: string;
  value: string;
  disabled: boolean;
  readOnly: boolean;
  offsetWidth: number;
  offsetTop: number;
  scrollTop: number;
  clientHeight: number;
  ownerDocument: FakeDoc | null;
  setAttribute(k: string, v: string): void;
  getAttribute(k: string): string | null;
  removeAttribute(k: string): void;
  addEventListener(t: string, fn: (e: unknown) => void): void;
  removeEventListener(t: string, fn: (e: unknown) => void): void;
  appendChild(c: FakeEl): void;
  removeChild(c: FakeEl): FakeEl;
  contains(n: FakeEl | null): boolean;
  dispatch(t: string, extra?: Record<string, unknown>): void;
  dispatchEvent(e: unknown): void;
  getBoundingClientRect(): { left: number; top: number; width: number; height: number; right: number; bottom: number };
}

interface FakeDoc {
  defaultView: Record<string, unknown>;
  body: FakeEl;
  handlers: Record<string, ((e: unknown) => void)[]>;
  createElement(tag: string): FakeEl;
  addEventListener(t: string, fn: (e: unknown) => void): void;
  removeEventListener(t: string, fn: (e: unknown) => void): void;
}

function makeStyle(): Record<string, string> {
  const st: Record<string, string> = {};
  Object.defineProperty(st, "cssText", {
    set(v: string) {
      for (const part of String(v).split(";")) {
        const i = part.indexOf(":");
        if (i > 0) st[part.slice(0, i).trim()] = part.slice(i + 1).trim();
      }
    },
    get() { return Object.entries(st).map(([k, v]) => `${k}:${v}`).join(";"); },
  });
  return st;
}

function makeEl(tag: string, doc: FakeDoc | null): FakeEl {
  const el: FakeEl = {
    tagName: tag, style: makeStyle(), attrs: {}, handlers: {}, childNodes: [], parentNode: null,
    textContent: "", value: "", disabled: false, readOnly: false,
    offsetWidth: 480, offsetTop: 0, scrollTop: 0, clientHeight: 300, ownerDocument: doc,
    setAttribute(k, v) { el.attrs[k] = v; },
    getAttribute(k) { return k in el.attrs ? el.attrs[k] : null; },
    removeAttribute(k) { delete el.attrs[k]; },
    addEventListener(t, fn) { (el.handlers[t] = el.handlers[t] || []).push(fn); },
    removeEventListener(t, fn) { el.handlers[t] = (el.handlers[t] || []).filter((f) => f !== fn); },
    appendChild(c) { c.parentNode = el; el.childNodes.push(c); },
    removeChild(c) {
      const i = el.childNodes.indexOf(c);
      if (i >= 0) el.childNodes.splice(i, 1);
      if (c.parentNode === el) c.parentNode = null;
      return c;
    },
    contains(n) {
      let p: FakeEl | null = n;
      while (p) { if (p === el) return true; p = p.parentNode; }
      return false;
    },
    dispatch(t, extra) {
      const e = { type: t, target: el, stopPropagation() {}, preventDefault() {}, ...extra };
      for (const fn of el.handlers[t] || []) fn(e);
    },
    dispatchEvent(e) {
      const ev = e as { type: string };
      for (const fn of el.handlers[ev.type] || []) fn(e);
    },
    getBoundingClientRect() {
      return { left: 100, top: 100, width: 480, height: 40, right: 580, bottom: 140 };
    },
  };
  return el;
}

function makeDoc(): { doc: FakeDoc; input: FakeEl; bodyChildren: FakeEl[] } {
  const bodyChildren: FakeEl[] = [];
  const doc: FakeDoc = {
    defaultView: {
      innerHeight: 900,
      addEventListener() {}, removeEventListener() {},
      getComputedStyle: () => ({ fontFamily: "TestFont", fontSize: "14px", color: "#333333" }),
    },
    handlers: {},
    body: null as unknown as FakeEl,
    createElement(tag) { return makeEl(tag, doc); },
    addEventListener(t, fn) { (doc.handlers[t] = doc.handlers[t] || []).push(fn); },
    removeEventListener(t, fn) { doc.handlers[t] = (doc.handlers[t] || []).filter((f) => f !== fn); },
  };
  const body = makeEl("body", doc);
  const origAppend = body.appendChild.bind(body);
  body.appendChild = (c: FakeEl) => { origAppend(c); bodyChildren.push(c); return c; };
  doc.body = body;
  const input = makeEl("input", doc);
  return { doc, input, bodyChildren };
}

const src = installDatePickerPopup.toString();

describe("datePickerPopup：两端同源", () => {
  test("form-date 产物逐字符内联函数源码", () => {
    const out = render({ label: "日期" });
    expect(out).toContain(src);
    expect(out).toContain(`document.getElementById('fd-`);
  });
  test("form-time 不带月历（data-wcdp 属 date）", () => {
    const t = getCodegen("form-time")!({ ...comp({}), type: "form-time", name: "form-time" } as SceneComponent, { pageScripts: [], pageStyles: [] } as never);
    expect(t).not.toContain("data-wcdp");
    expect(t).not.toContain(src);
  });
  test("原生拾取路径整体删除：指示器 display:none + input 不可点 + 透明触发器接点击", () => {
    const out = render({});
    expect(out).toMatch(/input::-webkit-calendar-picker-indicator\{display:none\}/);
    expect(out).toMatch(/pointer-events:none" \/>/);
    expect(out).toMatch(/id="fd-[a-z0-9]+-tg"[^>]*role="combobox"/);
  });
});

describe("datePickerPopup：自包含", () => {
  test("new Function 求值后可独立安装", () => {
    const factory = new Function(`return (${src});`)() as typeof installDatePickerPopup;
    const { input } = makeDoc();
    expect(typeof factory(input as unknown as HTMLInputElement)).toBe("function");
  });
});

describe("datePickerPopup：行为链（沙箱）", () => {
  test("打开显示当前值所在月 → 点日期写值并关闭 → ‹ 翻上月", () => {
    const { doc, input, bodyChildren } = makeDoc();
    const events: string[] = [];
    input.addEventListener("input", () => events.push("input:" + input.value));
    input.addEventListener("change", () => events.push("change:" + input.value));
    input.value = "2026-09-15";
    installDatePickerPopup(input as unknown as HTMLInputElement);
    input.dispatch("click");
    const panel = bodyChildren[0];
    expect(panel.style.display).toBe("block");
    expect(panel.style.position).toBe("fixed");
    expect(panel.style.width).toBe("480px");
    const head = panel.childNodes[0];
    const grid = panel.childNodes[1];
    expect((head.childNodes[2] as FakeEl).textContent).toBe("2026年9月");
    // 7 表头 + 2 空位（2026-09-01 是周二）+ 30 天
    expect(grid.childNodes.length).toBe(7 + 2 + 30);
    const d20 = grid.childNodes.find((c) => c.getAttribute("data-wcdp-d") === "2026-09-20");
    expect(d20).toBeTruthy();
    d20!.dispatch("click");
    expect(input.value).toBe("2026-09-20");
    expect(events).toEqual(["input:2026-09-20", "change:2026-09-20"]);
    expect(panel.style.display).toBe("none");
    // 重开 → 翻上月 → label 变 2026年8月
    input.dispatch("click");
    const panel2 = bodyChildren[0];
    const head2 = panel2.childNodes[0];
    (head2.childNodes[1] as FakeEl).dispatch("click");
    expect((head2.childNodes[2] as FakeEl).textContent).toBe("2026年8月");
    teardown: {
      const down = (doc.handlers["mousedown"] || [])[0]!;
      down({ target: makeEl("div", doc) });
      expect(panel2.style.display).toBe("none");
    }
  });
  test("min 之外的日期置灰且不可点", () => {
    const { input, bodyChildren } = makeDoc();
    input.value = "2026-09-15";
    input.attrs["min"] = "2026-09-10";
    installDatePickerPopup(input as unknown as HTMLInputElement);
    input.dispatch("click");
    const grid = bodyChildren[0].childNodes[1];
    const d5 = grid.childNodes.find((c) => c.getAttribute("data-wcdp-d") === "2026-09-05");
    expect(d5!.style.color).toBe("rgba(0,0,0,.25)");
    d5!.dispatch("click");
    expect(input.value).toBe("2026-09-15");
  });
  test("宽度：宽字段取字段宽，窄字段按 232px 兜底（月历 7 列可读性）", () => {
    const a = makeDoc(); a.input.offsetWidth = 480;
    installDatePickerPopup(a.input as unknown as HTMLInputElement);
    a.input.dispatch("click");
    expect(a.bodyChildren[0].style.width).toBe("480px");
    const b = makeDoc(); b.input.offsetWidth = 200;
    installDatePickerPopup(b.input as unknown as HTMLInputElement);
    b.input.dispatch("click");
    expect(b.bodyChildren[0].style.width).toBe("232px");
  });
  test("幂等 + disabled 不安装", () => {
    const { input } = makeDoc();
    installDatePickerPopup(input as unknown as HTMLInputElement);
    installDatePickerPopup(input as unknown as HTMLInputElement);
    expect((input.handlers["click"] || []).length).toBe(1);
    const d = makeDoc(); d.input.disabled = true;
    installDatePickerPopup(d.input as unknown as HTMLInputElement);
    d.input.dispatch("click");
    expect(d.bodyChildren.length).toBe(0);
  });
  test("发布端触发器模式：点击源是 trigger，input 本体点击不再开弹层", () => {
    const { doc, input, bodyChildren } = makeDoc();
    const tg = makeEl("div", doc);
    const teardown = installDatePickerPopup(input as unknown as HTMLInputElement, tg as unknown as HTMLElement);
    input.dispatch("click");
    expect(bodyChildren.length).toBe(0);
    tg.dispatch("click");
    expect(bodyChildren.length).toBe(1);
    expect(bodyChildren[0].style.display).toBe("block");
    tg.dispatch("click");
    expect(bodyChildren[0].style.display).toBe("none");
    teardown();
  });
});
