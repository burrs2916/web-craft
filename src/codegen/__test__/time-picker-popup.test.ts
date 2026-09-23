import { describe, test, expect } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import { installTimePickerPopup } from "../../editor/data/timePickerPopup";

initBuiltinCodegens();

function comp(type: "form-date" | "form-time", config: Record<string, unknown>): SceneComponent {
  return {
    id: "c1", type, name: type,
    transform: createDefaultTransform({ x: 0, y: 0, width: 280, height: 56 }),
    layerId: "l1", zIndex: 0, locked: false, visible: true,
    config, children: [], parentId: null,
  };
}
const render = (type: "form-date" | "form-time", config: Record<string, unknown>): string =>
  getCodegen(type)!(comp(type, config), { pageScripts: [], pageStyles: [] } as never);

// ── 零依赖 DOM 沙箱（node 环境，无 jsdom；见 2026-09-22 第 18/21 轮）──
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
  created: FakeEl[];
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
    offsetWidth: 200, offsetTop: 0, scrollTop: 0, clientHeight: 300, ownerDocument: doc,
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
      return { left: 100, top: 100, width: 200, height: 40, right: 300, bottom: 140 };
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
    created: [],
    body: null as unknown as FakeEl,
    createElement(tag) { const el = makeEl(tag, doc); doc.created.push(el); return el; },
    addEventListener(t, fn) { (doc.handlers[t] = doc.handlers[t] || []).push(fn); },
    removeEventListener(t, fn) { doc.handlers[t] = (doc.handlers[t] || []).filter((f) => f !== fn); },
  };
  const body = makeEl("body", doc);
  const origAppend = body.appendChild.bind(body);
  body.appendChild = (c: FakeEl) => { origAppend(c); bodyChildren.push(c); return c; };
  const origRemove = body.removeChild.bind(body);
  body.removeChild = (c: FakeEl) => { const i = bodyChildren.indexOf(c); if (i >= 0) bodyChildren.splice(i, 1); return origRemove(c); };
  doc.body = body;
  const input = makeEl("input", doc);
  return { doc, input, bodyChildren };
}

const src = installTimePickerPopup.toString();

describe("timePickerPopup：两端同源", () => {
  test("form-time 产物逐字符内联函数源码（toString 同源范式）", () => {
    const out = render("form-time", { label: "时间" });
    expect(out).toContain(src);
    expect(out).toContain(`document.getElementById('ft-`);
  });
  test("form-date 不带弹层（本轮范围仅 time，date 仍走原生）", () => {
    const out = render("form-date", { label: "日期" });
    expect(out).not.toContain("data-wctp");
    expect(out).not.toContain(src);
  });
  test("原生拾取路径整体删除：指示器 display:none + input 不可点 + 透明触发器接点击", () => {
    const t = render("form-time", {});
    expect(t).toMatch(/input::-webkit-calendar-picker-indicator\{display:none\}/);
    expect(t).toMatch(/pointer-events:none" \/>/); // input 本体禁点
    expect(t).toMatch(/id="ft-[a-z0-9]+-tg"[^>]*role="combobox"/);
    const d = render("form-date", {});
    expect(d).toMatch(/input::-webkit-calendar-picker-indicator\{display:none\}/);
    expect(d).toMatch(/id="fd-[a-z0-9]+-tg"/);
  });
});

describe("timePickerPopup：自包含（脱离模块作用域求值）", () => {
  test("new Function 求值后可独立安装（引用外部标识符会当场抛错）", () => {
    const factory = new Function(`return (${src});`)() as typeof installTimePickerPopup;
    const { input } = makeDoc();
    expect(typeof factory(input as unknown as HTMLInputElement)).toBe("function");
  });
});

describe("timePickerPopup：行为链（沙箱）", () => {
  test("点击打开 → 点小时写值+input → 点分钟写值+change并关闭", () => {
    const { doc, input, bodyChildren } = makeDoc();
    const events: string[] = [];
    input.addEventListener("input", () => events.push("input:" + input.value));
    input.addEventListener("change", () => events.push("change:" + input.value));
    const teardown = installTimePickerPopup(input as unknown as HTMLInputElement);
    input.dispatch("click");
    expect(bodyChildren.length).toBe(1);
    const panel = bodyChildren[0];
    expect(panel.style.display).toBe("flex");
    expect(panel.style.position).toBe("fixed");
    expect(panel.style.transform).toBe("scale(1)");
    // 弹层宽度 = 字段宽（offsetWidth），两列各占一半
    expect(panel.style.width).toBe("200px");
    expect(panel.childNodes[0].style.flex).toBe("1 1 0");
    expect(panel.childNodes[1].style.flex).toBe("1 1 0");
    // 点 9 时：写值 + input 事件，面板保持打开
    const hourCol = panel.childNodes[0];
    const h9 = hourCol.childNodes.find((c) => c.getAttribute("data-wctp-h") === "9");
    expect(h9).toBeTruthy();
    h9!.dispatch("click");
    expect(input.value).toBe("09:00");
    expect(events).toEqual(["input:09:00", "change:09:00"]);
    expect(panel.style.display).toBe("flex");
    // 点 30 分：写值 + input + change，面板关闭
    const minCol = panel.childNodes[1];
    const m30 = minCol.childNodes.find((c) => c.getAttribute("data-wctp-m") === "30");
    m30!.dispatch("click");
    expect(input.value).toBe("09:30");
    expect(events).toEqual(["input:09:00", "change:09:00", "input:09:30", "change:09:30"]);
    expect(panel.style.display).toBe("none");
    // 再点 input 重新打开，doc 级 mousedown（外部）关闭
    input.dispatch("click");
    expect(panel.style.display).toBe("flex");
    const down = (doc.handlers["mousedown"] || [])[0]!;
    down({ target: makeEl("div", doc) });
    expect(panel.style.display).toBe("none");
    teardown();
    expect(input.getAttribute("data-wctp")).toBe(null);
  });
  test("已有值时打开：对应时/分项高亮；步长来自 step 属性（900s → 15 分钟）", () => {
    const { input, bodyChildren } = makeDoc();
    input.value = "09:30";
    input.attrs["step"] = "900";
    installTimePickerPopup(input as unknown as HTMLInputElement);
    input.dispatch("click");
    const panel = bodyChildren[0];
    const hourCol = panel.childNodes[0];
    const minCol = panel.childNodes[1];
    // 分钟列只有 0/15/30/45
    expect(minCol.childNodes.length).toBe(4);
    const m30 = minCol.childNodes.find((c) => c.getAttribute("data-wctp-m") === "30");
    expect(m30!.style.background).toBe("rgba(25,118,210,.12)");
    const h9 = hourCol.childNodes.find((c) => c.getAttribute("data-wctp-h") === "9");
    expect(h9!.style.fontWeight).toBe("600");
  });
  test("幂等：二次安装不重复挂监听（React StrictMode 双挂 effect 安全）", () => {
    const { input } = makeDoc();
    installTimePickerPopup(input as unknown as HTMLInputElement);
    installTimePickerPopup(input as unknown as HTMLInputElement);
    expect((input.handlers["click"] || []).length).toBe(1);
  });
  test("disabled / readonly：不安装、不产生节点", () => {
    const a = makeDoc(); a.input.disabled = true;
    installTimePickerPopup(a.input as unknown as HTMLInputElement);
    a.input.dispatch("click");
    expect(a.bodyChildren.length).toBe(0);
    const b = makeDoc(); b.input.readOnly = true;
    installTimePickerPopup(b.input as unknown as HTMLInputElement);
    b.input.dispatch("click");
    expect(b.bodyChildren.length).toBe(0);
  });
  test("发布端触发器模式：点击源是 trigger，input 本体点击不再开弹层", () => {
    const { doc, input, bodyChildren } = makeDoc();
    const tg = makeEl("div", doc);
    const teardown = installTimePickerPopup(input as unknown as HTMLInputElement, tg as unknown as HTMLElement);
    input.dispatch("click");
    expect(bodyChildren.length).toBe(0); // input 不是点击源
    tg.dispatch("click");
    expect(bodyChildren.length).toBe(1);
    expect(bodyChildren[0].style.display).toBe("flex");
    tg.dispatch("click");
    expect(bodyChildren[0].style.display).toBe("none");
    teardown();
  });
});
