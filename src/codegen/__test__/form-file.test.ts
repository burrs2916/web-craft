import { describe, test, expect } from "vitest";
import { initBuiltinCodegens, getCodegen } from "../components";
import { createDefaultTransform } from "../../types/editor";
import type { SceneComponent } from "../../types/editor";
import { ffPickFiles, ffFormatSize, ffRejectText, ffSetInputFiles, FF_ZONE_ICON_PATH, fileFieldScript } from "../../editor/data/fileField";

initBuiltinCodegens();

function comp(config: Record<string, unknown>): SceneComponent {
  return {
    id: "c1", type: "form-file", name: "form-file",
    transform: createDefaultTransform({ x: 0, y: 0, width: 280, height: 96 }),
    layerId: "l1", zIndex: 0, locked: false, visible: true,
    config, children: [], parentId: null,
  };
}
const render = (config: Record<string, unknown>): string =>
  getCodegen("form-file")!(comp(config), { pageScripts: [], pageStyles: [] } as never);

// 假文件（鸭子类型即可喂给纯函数）
const mk = (name: string, size: number, type = ""): File =>
  ({ name, size, type }) as unknown as File;
const list = (arr: File[]): ({ length: number } & Record<number, File>) =>
  arr as unknown as ({ length: number } & Record<number, File>);

// node 无 DataTransfer：注入假类（仅 items.add + files getter，覆盖 ffSetInputFiles 的真实路径）
class FakeDT {
  arr: File[] = [];
  items = { add: (f: File) => { this.arr.push(f); } };
  get files(): File[] { return this.arr; }
}

// ── 自包含（脱离模块作用域求值：引用外部标识符会当场抛错/产出 undefined）──
const isoPick = new Function(`return (${ffPickFiles.toString()});`)() as typeof ffPickFiles;
const isoFmt = new Function(`return (${ffFormatSize.toString()});`)() as typeof ffFormatSize;
const isoText = new Function(`return (${ffRejectText.toString()});`)() as typeof ffRejectText;
const isoSetf = new Function("DataTransfer", `return (${ffSetInputFiles.toString()});`)(FakeDT) as typeof ffSetInputFiles;

describe("ffPickFiles：自包含 + 行为", () => {
  test("accept 后缀匹配（大小写不敏感）", () => {
    const r = isoPick(list([mk("A.PDF", 10), mk("b.docx", 10), mk("c.txt", 10)]), ".pdf", true, 0, 0);
    expect(r.kept.map((f) => f.name)).toEqual(["A.PDF"]);
    expect(r.rejected.map((x) => x.reason)).toEqual(["type", "type"]);
  });
  test("accept MIME 通配（image/*）与精确 MIME", () => {
    const r = isoPick(list([mk("a.png", 10, "image/png"), mk("b.txt", 10, "text/plain"), mk("c.json", 10, "application/json")]),
      "image/*,application/json", true, 0, 0);
    expect(r.kept.map((f) => f.name)).toEqual(["a.png", "c.json"]);
  });
  test("无 accept 不限类型", () => {
    const r = isoPick(list([mk("a.exe", 10), mk("b.bin", 10)]), "", true, 0, 0);
    expect(r.kept.length).toBe(2);
    expect(r.rejected.length).toBe(0);
  });
  test("单个大小上限：超限记 size 拒绝", () => {
    const r = isoPick(list([mk("a.pdf", 1024), mk("b.pdf", 2 * 1024 * 1024)]), "", true, 0, 1);
    expect(r.kept.map((f) => f.name)).toEqual(["a.pdf"]);
    expect(r.rejected).toEqual([{ name: "b.pdf", reason: "size" }]);
  });
  test("multiple=false 只保留第一个，其余记 count", () => {
    const r = isoPick(list([mk("a.pdf", 1), mk("b.pdf", 1), mk("c.pdf", 1)]), "", false, 0, 0);
    expect(r.kept.map((f) => f.name)).toEqual(["a.pdf"]);
    expect(r.rejected.map((x) => x.reason)).toEqual(["count", "count"]);
  });
  test("maxCount 截断多选，超出的记 count", () => {
    const r = isoPick(list([mk("a", 1), mk("b", 1), mk("c", 1)]), "", true, 2, 0);
    expect(r.kept.length).toBe(2);
    expect(r.rejected).toEqual([{ name: "c", reason: "count" }]);
  });
  test("过滤顺序：类型 → 大小 → 数量", () => {
    const r = isoPick(list([mk("x.png", 999), mk("big.pdf", 2 * 1024 * 1024), mk("y.pdf", 1), mk("z.pdf", 1)]),
      ".pdf", true, 1, 1);
    expect(r.kept.map((f) => f.name)).toEqual(["y.pdf"]);
    expect(r.rejected).toEqual([
      { name: "x.png", reason: "type" },
      { name: "big.pdf", reason: "size" },
      { name: "z.pdf", reason: "count" },
    ]);
  });
  test("空/脏输入安全", () => {
    expect(isoPick(null, "", true, 0, 0)).toEqual({ kept: [], rejected: [] });
    const r = isoPick(list([null as unknown as File, mk("a", 1)]), "", true, 0, 0);
    expect(r.kept.map((f) => f.name)).toEqual(["a"]);
  });
});

describe("ffFormatSize / ffRejectText / ffSetInputFiles：自包含 + 行为", () => {
  test("大小格式化", () => {
    expect(isoFmt(0)).toBe("0 B");
    expect(isoFmt(512)).toBe("512 B");
    expect(isoFmt(2048)).toBe("2 KB");
    expect(isoFmt(1536)).toBe("1.5 KB");
    expect(isoFmt(5 * 1024 * 1024)).toBe("5 MB");
    expect(isoFmt(3.2 * 1024 * 1024 * 1024)).toBe("3.2 GB");
    expect(isoFmt(NaN)).toBe("0 B");
  });
  test("拒绝文案：空清单空串、按原因聚合、超过 3 个省略", () => {
    expect(isoText(null)).toBe("");
    expect(isoText([])).toBe("");
    const mixed = [{ name: "a", reason: "type" }, { name: "b", reason: "size" }, { name: "c", reason: "type" }];
    const t = isoText(mixed);
    expect(t).toContain("已忽略 3 个文件");
    expect(t).toContain("类型不符 2 个");
    expect(t).toContain("超过大小限制 1 个");
    expect(t).toContain("a、b、c");
    const many = ["a", "b", "c", "d"].map((n) => ({ name: n, reason: "type" }));
    const t2 = isoText(many);
    expect(t2).toContain("a、b、c 等");
  });
  test("ffSetInputFiles：DataTransfer 重建写入 input.files", () => {
    const input = { files: [] as unknown } as unknown as HTMLInputElement;
    const files = [mk("a.pdf", 1), mk("b.pdf", 2)];
    isoSetf(input, files);
    expect((input.files as unknown as File[]).map((f) => f.name)).toEqual(["a.pdf", "b.pdf"]);
  });
});

// ── 两端同源：产物逐字符内联四个纯函数 ──
describe("form-file 产物：两端同源与结构锁", () => {
  test("产物逐字符内联 ffPickFiles/ffFormatSize/ffRejectText/ffSetInputFiles 源码", () => {
    const out = render({ label: "上传", accept: ".pdf", multiple: true, maxCount: 3, maxFileSize: 5 });
    expect(out).toContain(ffPickFiles.toString());
    expect(out).toContain(ffFormatSize.toString());
    expect(out).toContain(ffRejectText.toString());
    expect(out).toContain(ffSetInputFiles.toString());
    // 脚本只来自 fileFieldScript（唯一脚本来源）
    expect(out).toContain(fileFieldScript("ff", { accept: "", multiple: false, maxCount: 0, maxFileSizeMB: 0 }).slice(8, 40));
  });
  test("配置口径进脚本 CFG：maxCount/maxFileSize/accept/multiple", () => {
    const out = render({ accept: ".pdf", multiple: true, maxCount: 3, maxFileSize: 5 });
    expect(out).toContain('"a":".pdf"');
    expect(out).toContain('"m":true');
    expect(out).toContain('"c":3');
    expect(out).toContain('"s":5');
    const off = render({});
    expect(off).toContain('"a":""');
    expect(off).toContain('"c":0');
  });
  test("键盘可达：input 视觉隐藏（clip）而非 display:none + focus-within 高亮", () => {
    const out = render({});
    expect(out).not.toMatch(/type="file"[^>]*display:none/);
    expect(out).toContain("clip-path:inset(50%)");
    expect(out).toMatch(/\.ff-[a-z0-9]+ \.fzone:focus-within\{border-color:/);
  });
  test("标签口径：top/inside 一律悬浮框沿（fc-flabel 骑框），无顶部外置标签——内容相对整盒四边居中", () => {
    for (const lp of ["top", "inside", undefined]) {
      const out = render(lp === undefined ? { label: "上传文件" } : { label: "上传文件", labelPlacement: lp });
      expect(out).toMatch(/class="fc-flabel"[^>]*>上传文件/); // 悬浮徽章骑框沿
      expect(out).not.toMatch(/<label style="font-size:[^"]*;line-height:1\.2;color:[^"]*;margin-bottom:/); // 无顶部外置标签
      expect(out).not.toContain("margin-bottom:4px");
    }
    const none = render({ label: "上传文件", labelPlacement: "none" });
    expect(none).not.toContain("fc-flabel");
  });
  test("拖放区圆角按像素生效且封顶 24（不吃输入条 ×10 口径，防胶囊/按钮观感）", () => {
    expect(render({})).toContain("border-radius:8px"); // 默认 8 → 8px（旧口径是 80px 胶囊）
    expect(render({ borderRadius: 40 })).toContain("border-radius:24px"); // 封顶
    expect(render({ borderRadius: 80 })).toContain("border-radius:24px");
    // 文件行小圆角跟随但压到 6px 内
    expect(render({ borderRadius: 40 })).toMatch(/ff-item\{[^}]*border-radius:6px/);
  });
  test("拖放区中央上传图标：SVG 与提示文字成组居中（两端同一 ffZoneIconSvg）", () => {
    const out = render({});
    expect(out).toContain('class="ff-zone-icon"');
    expect(out).toContain('viewBox="0 0 24 24"');
    expect(out).toContain(FF_ZONE_ICON_PATH);
    // 图标在提示文字之前（icon + text 成组，flex 纵向居中）
    const zoneStart = out.indexOf('class="fzone"');
    const iconAt = out.indexOf('class="ff-zone-icon"', zoneStart);
    const hintAt = out.indexOf("点击或拖拽文件到此处", iconAt);
    expect(iconAt).toBeGreaterThan(zoneStart);
    expect(hintAt).toBeGreaterThan(iconAt);
  });
  test("文件列表结构：ff-list 容器 + JS 建 ff-del 删除按钮（type=button + aria-label）", () => {
    const out = render({});
    expect(out).toMatch(/class="ff-list" id="ff-[a-z0-9]+l"/);
    expect(out).toMatch(/id="ff-[a-z0-9]+e"/); // 拒绝提示元素
    expect(out).toContain("b.type='button'");
    expect(out).toContain("b.className='ff-del'");
    expect(out).toContain("'移除 '+f.name");
    // 旧「首个 等 N」回显已删除
    expect(out).not.toContain("ff-name");
    expect(out).not.toContain("等 '+fs.length");
  });
  test("回填走 DataTransfer 重建 + change 重过滤（两条路径同口径）", () => {
    const out = render({});
    expect(out).toContain("new DataTransfer()");
    // change 监听内再次 pick（原生弹窗只认 accept，大小/数量需重过滤）；selfChange 守卫防自清提示
    expect(out).toMatch(/if\(selfChange\)return;var fs=i\.files\|\|\[\];var res=pick\(fs/);
    // drop 绑定带 disabled 守卫
    expect(out).toContain("if(z&&!i.disabled)");
  });
});

// ── 发布端脚本沙箱行为链（node 环境，注入假 document / DataTransfer）──
interface FakeEl2 {
  tagName: string;
  style: Record<string, string>;
  attrs: Record<string, string>;
  handlers: Record<string, ((e: unknown) => void)[]>;
  childNodes: FakeEl2[];
  parentNode: FakeEl2 | null;
  readonly parentElement: FakeEl2 | null;
  readonly firstChild: FakeEl2 | null;
  classList: { toggle(name: string, force?: boolean): void; add(name: string): void; remove(name: string): void };
  className: string;
  textContent: string;
  type: string;
  disabled: boolean;
  files: File[];
  offsetWidth: number;
  ownerDocument: FakeDoc2 | null;
  setAttribute(k: string, v: string): void;
  getAttribute(k: string): string | null;
  addEventListener(t: string, fn: (e: unknown) => void): void;
  appendChild(c: FakeEl2): void;
  removeChild(c: FakeEl2): FakeEl2;
  closest(sel: string): FakeEl2 | null;
  dispatch(t: string, extra?: Record<string, unknown>): void;
  dispatchEvent(e: unknown): void;
}
interface FakeDoc2 {
  created: FakeEl2[];
  getElementById(id: string): FakeEl2 | null;
  createElement(tag: string): FakeEl2;
}

function el(tag: string, doc: FakeDoc2 | null): FakeEl2 {
  const e: FakeEl2 = {
    tagName: tag, style: {}, attrs: {}, handlers: {}, childNodes: [], parentNode: null,
    className: "", textContent: "", type: "", disabled: false, files: [], offsetWidth: 200, ownerDocument: doc,
    get parentElement() { return e.parentNode; },
    get firstChild() { return e.childNodes[0] || null; },
    classList: {
      toggle(name: string, force?: boolean) {
        const has = (" " + e.className + " ").includes(" " + name + " ");
        const want = force === undefined ? !has : !!force;
        if (want && !has) e.className = (e.className + " " + name).trim();
        else if (!want && has) e.className = (" " + e.className + " ").replace(" " + name + " ", " ").trim();
      },
      add(name: string) { if (!(" " + e.className + " ").includes(" " + name + " ")) e.className = (e.className + " " + name).trim(); },
      remove(name: string) { if ((" " + e.className + " ").includes(" " + name + " ")) e.className = (" " + e.className + " ").replace(" " + name + " ", " ").trim(); },
    },
    setAttribute(k, v) { e.attrs[k] = v; },
    getAttribute(k) { return k in e.attrs ? e.attrs[k] : null; },
    addEventListener(t, fn) { (e.handlers[t] = e.handlers[t] || []).push(fn); },
    appendChild(c) { c.parentNode = e; e.childNodes.push(c); },
    removeChild(c) { const i = e.childNodes.indexOf(c); if (i >= 0) e.childNodes.splice(i, 1); if (c.parentNode === e) c.parentNode = null; return c; },
    closest(sel) {
      let p: FakeEl2 | null = e;
      while (p) { if ((sel === ".fzone" && p.className === "fzone")) return p; p = p.parentNode; }
      return null;
    },
    dispatch(t, extra) {
      const ev = { type: t, target: e, preventDefault() {}, stopPropagation() {}, ...extra };
      for (const fn of e.handlers[t] || []) fn(ev);
    },
    dispatchEvent(ev) { const v = ev as { type: string }; for (const fn of e.handlers[v.type] || []) fn(ev); },
  };
  return e;
}

function mount(cfg: Parameters<typeof fileFieldScript>[1]) {
  const byId: Record<string, FakeEl2> = {};
  const doc: FakeDoc2 = {
    created: [],
    getElementById: (id) => byId[id] ?? null,
    createElement(tag) { const c = el(tag, doc); doc.created.push(c); return c; },
  };
  const input = el("input", doc);
  byId["ffx"] = input;
  const zone = el("label", doc);
  zone.className = "fzone";
  const fieldLayer = el("div", doc);
  const listEl = el("div", doc);
  byId["ffxl"] = listEl;
  const errEl = el("div", doc);
  byId["ffxe"] = errEl;
  zone.appendChild(input);
  fieldLayer.appendChild(zone);
  fieldLayer.appendChild(listEl);
  fieldLayer.appendChild(errEl);
  // 执行发布端脚本（剥掉 script 标签）
  const code = fileFieldScript("ffx", cfg).replace(/^<script>/, "").replace(/<\/script>$/, "");
  new Function("document", "DataTransfer", code)(doc, FakeDT);
  const changes: number[] = [];
  input.addEventListener("change", () => changes.push((input.files || []).length));
  return { input, zone, listEl, errEl, changes, doc };
}

function fieldLayerOf(m: { input: FakeEl2 }): FakeEl2 {
  return m.input.parentElement!.parentElement!;
}

describe("fileFieldScript：沙箱行为链", () => {
  test("drop → 过滤 → DataTransfer 回填 → 列表渲染 → 拒绝提示 → 单个删除", () => {
    const m = mount({ accept: ".pdf", multiple: false, maxCount: 0, maxFileSizeMB: 1 });
    const pdf = mk("a.pdf", 100, "application/pdf");
    const png = mk("b.png", 10, "image/png");
    const big = mk("c.pdf", 2 * 1024 * 1024, "application/pdf");
    m.zone.dispatch("drop", { dataTransfer: { files: [png, big, pdf] } });
    // multiple=false：只留第一个匹配且未超限的文件
    expect(m.input.files.map((f) => f.name)).toEqual(["a.pdf"]);
    expect(m.changes).toEqual([1]);
    expect(m.listEl.childNodes.length).toBe(1);
    // 行结构：文件名 + 大小 + 删除按钮
    const row = m.listEl.childNodes[0];
    expect(row.childNodes[0].textContent).toBe("a.pdf");
    expect(row.childNodes[1].textContent).toBe("100 B");
    expect(row.childNodes[2].type).toBe("button");
    expect(row.childNodes[2].textContent).toBe("×");
    // 拒绝提示（类型 + 大小）——不被 commit 自派的 change 清空
    expect(m.errEl.textContent).toContain("已忽略 2 个文件");
    expect(m.errEl.textContent).toContain("类型不符 1 个");
    expect(m.errEl.textContent).toContain("超过大小限制 1 个");
    expect(m.errEl.style.display).toBe("block");
    // has-val 切换（挂在 field layer 上，即 input 父的父）
    expect(fieldLayerOf(m).className).toContain("has-val");
    // 单个删除：重建空 FileList + change + 提示隐藏
    (row.childNodes[2].handlers["click"][0] as (e: unknown) => void)({ preventDefault() {}, stopPropagation() {} });
    expect(m.input.files).toEqual([]);
    expect(m.changes).toEqual([1, 0]);
    expect(m.listEl.childNodes.length).toBe(0);
    expect(m.errEl.style.display).toBe("none");
    expect(fieldLayerOf(m).className).not.toContain("has-val");
  });
  test("change 路径重过滤：原生弹窗塞进超限文件也会被清掉", () => {
    const m = mount({ accept: "", multiple: true, maxCount: 1, maxFileSizeMB: 0 });
    const a = mk("a.txt", 1);
    const b = mk("b.txt", 1);
    m.input.files = [a, b];
    m.input.dispatch("change");
    expect(m.input.files.map((f) => f.name)).toEqual(["a.txt"]);
    // 外层 change + commit 内层 change 各计一次（selfChange 只拦截 glue 自己的监听）
    expect(m.changes).toEqual([1, 1]);
    expect(m.errEl.textContent).toContain("超出数量限制 1 个");
  });
  test("全部被拒时不回填、不清空旧值", () => {
    const m = mount({ accept: ".pdf", multiple: true, maxCount: 0, maxFileSizeMB: 0 });
    const old = mk("old.pdf", 1);
    m.input.files = [old];
    m.zone.dispatch("drop", { dataTransfer: { files: [mk("x.png", 1, "image/png")] } });
    expect(m.input.files.map((f) => f.name)).toEqual(["old.pdf"]);
    expect(m.changes).toEqual([]);
    expect(m.errEl.textContent).toContain("类型不符 1 个");
  });
  test("disabled 守卫：拖拽绑定整体挂在 !i.disabled 之下", () => {
    const code = fileFieldScript("ffy", { accept: "", multiple: false, maxCount: 0, maxFileSizeMB: 0 });
    expect(code).toContain("if(z&&!i.disabled)");
    expect(code).toContain("if(i.disabled)return;"); // 删除按钮同样禁用
  });
});
