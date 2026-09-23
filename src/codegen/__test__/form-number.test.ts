import { describe, test, expect, vi } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import {
  fnFormat,
  fnClamp,
  fnEdge,
  FN_MINUS_PATH,
  FN_PLUS_PATH,
  formNumberScript,
  type NumberFieldCfg,
} from "../../editor/data/numberField";

initBuiltinCodegens();

function comp(config: Record<string, unknown>): SceneComponent {
  return {
    id: "c1", type: "form-number", name: "form-number",
    transform: createDefaultTransform({ x: 0, y: 0, width: 200, height: 56 }),
    layerId: "l1", zIndex: 0, locked: false, visible: true,
    config, children: [], parentId: null,
  };
}
const render = (config: Record<string, unknown>): string =>
  getCodegen("form-number")!(comp(config), { pageScripts: [], pageStyles: [] } as never);

// 自包含（脱离模块作用域求值：引用外部标识符会当场抛错/产出 undefined）
const isoFmt = new Function(`return (${fnFormat.toString()});`)() as typeof fnFormat;
const isoClamp = new Function(`return (${fnClamp.toString()});`)() as typeof fnClamp;
const isoEdge = new Function(`return (${fnEdge.toString()});`)() as typeof fnEdge;

describe("fnFormat/fnClamp/fnEdge：自包含 + 行为", () => {
  test("fnFormat：precision 0 取整、>0 toFixed、NaN→空串", () => {
    expect(isoFmt(2.5, 0)).toBe("3"); // Math.round(2.5)=3
    expect(isoFmt(1.5, 0)).toBe("2");
    expect(isoFmt(-2.5, 0)).toBe("-2");
    expect(isoFmt(1.234, 2)).toBe("1.23");
    expect(isoFmt(1.2, 2)).toBe("1.20");
    expect(isoFmt("abc", 0)).toBe("");
    expect(isoFmt(NaN, 0)).toBe("");
  });
  test("fnClamp：null 不限制 + 越界吸附 + NaN→0", () => {
    expect(isoClamp(5, 0, 3)).toBe(3);
    expect(isoClamp(-1, 0, 3)).toBe(0);
    expect(isoClamp(2, null, null)).toBe(2);
    expect(isoClamp(NaN, 0, 3)).toBe(0);
  });
  test("fnEdge：NaN→0 统一（P1-2），与发布端 up() 一致", () => {
    expect(isoEdge("abc", 0, 999)).toEqual(isoEdge(0, 0, 999)); // 乱码按 0
    expect(isoEdge(0, 0, 999)[0]).toBe(true); // min=0 时 dec 禁用
    expect(isoEdge(999, 0, 999)[1]).toBe(true); // max=999 时 inc 禁用
    expect(isoEdge(5, 0, 999)).toEqual([false, false]);
  });
});

describe("form-number 产物：两端同源与结构锁", () => {
  test("产物逐字符内联三个纯函数源码（toString）", () => {
    const out = render({});
    expect(out).toContain(fnFormat.toString());
    expect(out).toContain(fnClamp.toString());
    expect(out).toContain(fnEdge.toString());
    // 脚本只来自 formNumberScript（唯一脚本来源）
    expect(out).toContain(formNumberScript("fn", { min: null, max: null, step: 1, precision: 0, disabled: false }).slice(8, 40));
  });
  test("P0-1：隐藏原生数字 spinner（Safari/WKWebView 原生箭头与自绘按钮重叠）", () => {
    const out = render({});
    expect(out).toContain("::-webkit-inner-spin-button");
    expect(out).toContain("::-webkit-outer-spin-button");
    expect(out).toContain("-moz-appearance:textfield");
    expect(out).toContain("appearance:none");
  });
  test("P1-1：图标常量同源（编辑器与发布端共用 FN_*，无重复字面量漂移）", () => {
    expect(FN_MINUS_PATH).toBe("M19 13H5v-2h14v2z");
    expect(FN_PLUS_PATH).toBe("M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z");
    expect(FN_MINUS_PATH.length).toBeGreaterThan(0);
    expect(FN_PLUS_PATH.length).toBeGreaterThan(0);
  });
  test("P2：aria-label + inputmode 可达性", () => {
    const out = render({});
    expect(out).toContain('aria-label="减少"');
    expect(out).toContain('aria-label="增加"');
    expect(out).toContain('inputmode="decimal"');
  });
  test("步进按钮 data-num-dec/inc + disabled 守卫", () => {
    expect(render({})).toMatch(/data-num-dec/);
    expect(render({})).toMatch(/data-num-inc/);
    expect(render({ disabled: true })).toContain('disabled aria-label="减少"');
  });
  test("P0-2：脚本含初始值规范化（非整数默认 + 整数精度 → 预览/发布一致）", () => {
    const out = render({ value: 1.5, precision: 0 });
    expect(out).toContain("i.value=fmt(clamp(num,CFG.min,CFG.max),CFG.P)");
  });
  test("required 校验接入 __WCVALIDATE（type=number 取值回归）", () => {
    const ctx = { pageScripts: [] as string[], pageStyles: [] as string[] } as never;
    getCodegen("form-number")!(comp({ required: true }), ctx);
    expect((ctx as { pageScripts: string[] }).pageScripts.some((s) => s.includes("__WCVALIDATE"))).toBe(true);
  });
});

// ── 发布端脚本沙箱行为链（node 环境，注入假 document）──
interface FakeEl {
  style: Record<string, string>;
  attrs: Record<string, string>;
  handlers: Record<string, ((e: unknown) => void)[]>;
  childNodes: FakeEl[];
  parentNode: FakeEl | null;
  readonly parentElement: FakeEl | null;
  readonly firstChild: FakeEl | null;
  className: string;
  value: string;
  disabled: boolean;
  type: string;
  classList: { add(n: string): void; remove(n: string): void; toggle(n: string, f?: boolean): void };
  setAttribute(k: string, v: string): void;
  getAttribute(k: string): string | null;
  addEventListener(t: string, fn: (e: unknown) => void): void;
  appendChild(c: FakeEl): void;
  removeChild(c: FakeEl): FakeEl;
  querySelector(sel: string): FakeEl | null;
  dispatchEvent(e: unknown): void;
  closest(sel: string): FakeEl | null;
}
function el(): FakeEl {
  const e: FakeEl = {
    style: {}, attrs: {}, handlers: {}, childNodes: [], parentNode: null, className: "", value: "", disabled: false, type: "",
    get parentElement() { return e.parentNode; },
    get firstChild() { return e.childNodes[0] || null; },
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute(k, v) { e.attrs[k] = v; },
    getAttribute(k) { return k in e.attrs ? e.attrs[k] : null; },
    addEventListener(t, fn) { (e.handlers[t] = e.handlers[t] || []).push(fn); },
    appendChild(c) { c.parentNode = e; e.childNodes.push(c); },
    removeChild(c) { const i = e.childNodes.indexOf(c); if (i >= 0) e.childNodes.splice(i, 1); if (c.parentNode === e) c.parentNode = null; return c; },
    querySelector(sel) {
      const key = sel.replace(/^\[|\]$/g, "");
      const walk = (n: FakeEl): FakeEl | null => {
        for (const c of n.childNodes) {
          if (key in c.attrs) return c;
          const r = walk(c);
          if (r) return r;
        }
        return null;
      };
      return walk(e);
    },
    dispatchEvent(ev) { const v = ev as { type: string }; for (const fn of e.handlers[v.type] || []) fn(ev); },
    closest() { return null; },
  };
  return e;
}

function mount(cfg: NumberFieldCfg) {
  const byId: Record<string, FakeEl> = {};
  const doc = {
    getElementById: (id: string) => byId[id] ?? null,
  };
  const input = el();
  input.type = "number";
  byId["fnx"] = input;
  const row = el();
  const dec = el(); dec.attrs["data-num-dec"] = "";
  const inc = el(); inc.attrs["data-num-inc"] = "";
  row.appendChild(dec);
  row.appendChild(input);
  row.appendChild(inc);
  const code = formNumberScript("fnx", cfg).replace(/^<script>/, "").replace(/<\/script>$/, "");
  new Function("document", code)(doc);
  const inputs: string[] = [];
  input.addEventListener("input", () => inputs.push(input.value));
  return { input, dec, inc, inputs, doc };
}

describe("formNumberScript：沙箱行为链", () => {
  test("步进 + 边界禁用 + precision 格式化", () => {
    const m = mount({ min: 0, max: 10, step: 1, precision: 0, disabled: false });
    const tap = (btn: FakeEl) => { btn.handlers["mousedown"][0]({}); btn.handlers["mouseup"][0]({}); };
    m.input.value = "0";
    tap(m.inc);
    expect(m.input.value).toBe("1");
    expect(m.inputs).toEqual(["1"]);
    // 到 max 后 inc 禁用
    m.input.value = "10";
    tap(m.inc);
    expect(m.input.value).toBe("10"); // 不变
    expect(m.inc.disabled).toBe(true);
    // 到 min 后 dec 禁用
    m.input.value = "0";
    tap(m.dec);
    expect(m.input.value).toBe("0");
    expect(m.dec.disabled).toBe(true);
  });
  test("P0-2：初始非整数默认 + 整数精度 → 规范化（预览/发布一致）", () => {
    const m = mount({ min: 0, max: 999, step: 1, precision: 0, disabled: false });
    m.input.value = "1.5";
    // 重新执行脚本以触发 init 规范化（mount 已执行；此处模拟挂载时即带初值）
    const byId: Record<string, FakeEl> = { fnx: m.input };
    const doc = { getElementById: (id: string) => byId[id] ?? null };
    const code = formNumberScript("fnx", { min: 0, max: 999, step: 1, precision: 0, disabled: false })
      .replace(/^<script>/, "").replace(/<\/script>$/, "");
    new Function("document", code)(doc);
    expect(m.input.value).toBe("2"); // 1.5 → 取整 2（与编辑区 fnFormat 一致）
  });
  test("NaN 输入：按钮态按 0 处理（P1-2 两端一致）", () => {
    const m = mount({ min: 0, max: 999, step: 1, precision: 0, disabled: false });
    m.input.value = "abc";
    const code = formNumberScript("fnx", { min: 0, max: 999, step: 1, precision: 0, disabled: false })
      .replace(/^<script>/, "").replace(/<\/script>$/, "");
    const byId: Record<string, FakeEl> = { fnx: m.input };
    new Function("document", code)({ getElementById: (id: string) => byId[id] ?? null });
    expect(m.dec.disabled).toBe(true); // NaN→0 ≤ min=0 → dec 禁用（与编辑区 fnEdge 一致）
    expect(m.inc.disabled).toBe(false);
  });
  test("disabled 守卫：按钮绑定整体挂在 !i.disabled 之下", () => {
    const code = formNumberScript("fny", { min: null, max: null, step: 1, precision: 0, disabled: true });
    expect(code).toContain("bind(d,-1);");
    expect(code).toContain("bind(n,1);");
    expect(code).toContain("if(!i)return");
    expect(code).toContain("if(btn.disabled)return;"); // bind 入口禁用守卫
  });

  test("P2：长按连击（单次点按只 bump 一次，长按 repeat）", () => {
    vi.useFakeTimers();
    try {
      const m = mount({ min: 0, max: 100, step: 1, precision: 0, disabled: false });
      m.input.value = "5";
      // 单次点按：mousedown + mouseup → 恰好 1 bump（不与原生 click 双发）
      (m.inc.handlers["mousedown"][0] as () => void)();
      (m.inc.handlers["mouseup"][0] as () => void)();
      expect(m.input.value).toBe("6");
      // 长按：mousedown → 400ms 起 repeat（每 150ms 一次）
      (m.inc.handlers["mousedown"][0] as () => void)();
      vi.advanceTimersByTime(400); // 触发 repeat 计时器（首跳）
      expect(m.input.value).toBe("7");
      vi.advanceTimersByTime(300); // 2 次 repeat
      expect(m.input.value).toBe("9");
      (m.inc.handlers["mouseup"][0] as () => void)(); // 结束
      vi.advanceTimersByTime(1000); // 不应再 bump
      expect(m.input.value).toBe("9");
    } finally {
      vi.useRealTimers();
    }
  });
});
