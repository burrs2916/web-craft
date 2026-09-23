/**
 * 自绘日期（月历）弹层（口径文件，发布端与编辑区**共用同一函数对象**）
 *
 * 与 `timePickerPopup.ts` 同一范式与同一动机：预览窗口 = Tauri `WebviewWindow` =
 * macOS WKWebView/Safari 引擎，原生日期拾取器在预览里不可用/不可控 → 自绘。
 * 挂 document.body + position:fixed + `scaleOf()=rect/offsetWidth` 视觉补偿。
 *
 * 铁律（同 timePickerPopup）：
 * 1. `installDatePickerPopup` **自包含**——不得引用本模块其它导出或任何模块作用域标识符。
 * 2. 真实 input 仍是唯一值来源：原生 value setter（兼容 React 受控）+ 先 input 后 change。
 * 3. 幂等守卫 `data-wcdp`（React StrictMode 双挂安全），disabled/readonly 不安装。
 * 4. 月历规则：周日开头；`min`/`max` 属性外的日期禁点置灰；「今天」描边、选中日高亮。
 * 5. 宽度 = 字段宽，但月历 7 列有可读性下限 232px（窄字段按 232 兜底）。
 */

/**
 * 给 input 装自绘月历弹层，返回 teardown（移除监听与弹层节点）。
 *
 * @param trigger 可选点击源：发布端传壳内透明触发器（input 本体 `pointer-events:none`，
 * 原生拾取器在所有引擎里都无从触发）；编辑区不传则回退绑在 input 上。
 */
export function installDatePickerPopup(input: HTMLInputElement, trigger?: HTMLElement): () => void {
  if (!input || input.getAttribute("data-wcdp") === "1") return function () {};
  var doc = input.ownerDocument;
  var win = doc ? doc.defaultView : null;
  if (!doc || !win) return function () {};
  if (input.disabled || input.readOnly) return function () {};
  input.setAttribute("data-wcdp", "1");
  var tg: HTMLElement = trigger || input;

  var panel: HTMLDivElement | null = null;
  var grid: HTMLDivElement | null = null;
  var label: HTMLSpanElement | null = null;
  var open = false;
  var viewY = 0;
  var viewM = 0; // 0-11

  function pad(n: number): string { return (n < 10 ? "0" : "") + n; }
  function num(v: string): number { return parseInt(v, 10) || 0; }
  function key(y: number, m: number, d: number): number { return y * 10000 + m * 100 + d; }
  function cur(): { y: number; m: number; d: number } | null {
    var mm = /^(\d{4})-(\d{2})-(\d{2})/.exec(input.value || "");
    return mm ? { y: num(mm[1]), m: num(mm[2]), d: num(mm[3]) } : null;
  }
  function today(): { y: number; m: number; d: number } {
    var t = new Date();
    return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
  }
  function range(): { lo: number; hi: number } {
    var lo = -Infinity, hi = Infinity;
    var a = /^(\d{4})-(\d{2})-(\d{2})/.exec(input.getAttribute("min") || "");
    if (a) lo = key(num(a[1]), num(a[2]), num(a[3]));
    var b = /^(\d{4})-(\d{2})-(\d{2})/.exec(input.getAttribute("max") || "");
    if (b) hi = key(num(b[1]), num(b[2]), num(b[3]));
    return { lo: lo, hi: hi };
  }
  function scaleOf(): number {
    var r = input.getBoundingClientRect();
    var w = input.offsetWidth || r.width;
    return (w && r.width) ? (r.width / w) : 1;
  }
  function setValue(v: string): void {
    try {
      var Ctor = (win as unknown as { HTMLInputElement?: { prototype: unknown } }).HTMLInputElement;
      var d = Ctor ? Object.getOwnPropertyDescriptor(Ctor.prototype, "value") : null;
      if (d && d.set) { (d.set as (val: string) => void).call(input, v); }
      else { input.value = v; }
    } catch (_e) { input.value = v; }
  }
  function commit(y: number, m: number, d: number): void {
    setValue(y + "-" + pad(m) + "-" + pad(d));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    closeP();
  }
  function mkBtn(txt: string, fn: () => void, extra: string): HTMLDivElement {
    var b = doc.createElement("div");
    b.textContent = txt;
    b.style.cssText = "width:26px;height:26px;line-height:24px;text-align:center;cursor:pointer;user-select:none;border-radius:6px;font-size:13px;color:inherit;" + extra;
    b.addEventListener("mouseenter", function () { b.style.background = "rgba(0,0,0,.06)"; });
    b.addEventListener("mouseleave", function () { b.style.background = ""; });
    b.addEventListener("mousedown", function (e: MouseEvent) { e.preventDefault(); });
    b.addEventListener("click", fn);
    return b;
  }
  function render(): void {
    if (!panel || !grid || !label) return;
    label.textContent = viewY + "年" + (viewM + 1) + "月";
    // 只清日期格，保留前 7 个星期表头
    while (grid.childNodes.length > 7) {
      const last = grid.childNodes[grid.childNodes.length - 1] as ChildNode;
      if (last && last.parentNode === grid) grid.removeChild(last); else break;
    }
    var rg = range();
    var cc = cur();
    var td = today();
    var first = new Date(viewY, viewM, 1).getDay(); // 0=周日
    var days = new Date(viewY, viewM + 1, 0).getDate();
    var i: number;
    for (i = 0; i < first; i++) {
      var blank = doc.createElement("div");
      blank.style.cssText = "width:14.28%;height:30px";
      grid.appendChild(blank);
    }
    for (i = 1; i <= days; i++) {
      (function (d: number) {
        var cell = doc.createElement("div");
        cell.setAttribute("data-wcdp-d", viewY + "-" + pad(viewM + 1) + "-" + pad(d));
        cell.textContent = String(d);
        cell.style.cssText = "width:14.28%;height:30px;line-height:30px;text-align:center;cursor:pointer;user-select:none;box-sizing:border-box;font-size:13px";
        var k = key(viewY, viewM + 1, d);
        if (k < rg.lo || k > rg.hi) {
          cell.style.color = "rgba(0,0,0,.25)";
          cell.style.cursor = "default";
        } else {
          var isSel = !!cc && cc.y === viewY && cc.m === viewM + 1 && cc.d === d;
          var isToday = td.y === viewY && td.m === viewM + 1 && td.d === d;
          if (isSel) cell.style.background = "rgba(25,118,210,.12)";
          if (isToday) cell.style.boxShadow = "inset 0 0 0 1px rgba(25,118,210,.55)";
          cell.addEventListener("mouseenter", function () { if (cell.style.background === "") cell.style.background = "rgba(0,0,0,.05)"; });
          cell.addEventListener("mouseleave", function () { if (!isSel) cell.style.background = ""; });
          cell.addEventListener("mousedown", function (e: MouseEvent) { e.preventDefault(); });
          cell.addEventListener("click", function () { commit(viewY, viewM + 1, d); });
        }
        grid.appendChild(cell);
      })(i);
    }
  }
  function build(): void {
    if (!doc.body) return;
    panel = doc.createElement("div");
    panel.setAttribute("data-wcdp-panel", "");
    panel.style.cssText = "position:fixed;z-index:2147483000;display:none;box-sizing:border-box;background:#ffffff;border:1px solid rgba(0,0,0,.14);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:8px;transform-origin:top left";
    var cs = win && win.getComputedStyle ? win.getComputedStyle(input) : null;
    panel.style.fontFamily = cs && cs.fontFamily ? cs.fontFamily : "sans-serif";
    panel.style.color = cs && cs.color ? cs.color : "#333333";
    var head = doc.createElement("div");
    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:4px";
    head.appendChild(mkBtn("«", function () { viewY -= 1; render(); }, "font-size:15px"));
    head.appendChild(mkBtn("‹", function () { viewM -= 1; if (viewM < 0) { viewM = 11; viewY -= 1; } render(); }, "font-size:15px"));
    label = doc.createElement("span");
    label.style.cssText = "font-size:13px;font-weight:600;user-select:none";
    head.appendChild(label);
    head.appendChild(mkBtn("›", function () { viewM += 1; if (viewM > 11) { viewM = 0; viewY += 1; } render(); }, "font-size:15px"));
    head.appendChild(mkBtn("»", function () { viewY += 1; render(); }, "font-size:15px"));
    panel.appendChild(head);
    grid = doc.createElement("div");
    grid.style.cssText = "display:flex;flex-wrap:wrap";
    var wd = ["日", "一", "二", "三", "四", "五", "六"];
    for (var i = 0; i < 7; i++) {
      var w = doc.createElement("div");
      w.textContent = wd[i];
      w.style.cssText = "width:14.28%;height:26px;line-height:26px;text-align:center;font-size:12px;color:rgba(0,0,0,.45);user-select:none";
      grid.appendChild(w);
    }
    panel.appendChild(grid);
    doc.body.appendChild(panel);
  }
  function pos(): void {
    if (!panel) return;
    var r = input.getBoundingClientRect();
    var s = scaleOf() || 1;
    // 弹层宽 = 字段宽（月历 7 列可读性下限 232px），scale(s) 后视觉宽贴合字段
    var w = input.offsetWidth || r.width;
    if (w < 232) w = 232;
    panel.style.width = w + "px";
    var avail = win ? win.innerHeight - r.bottom - 8 : 300;
    var mh = Math.max(232, Math.round(avail / s));
    panel.style.maxHeight = mh + "px";
    var above = avail < 200 && r.top > 260;
    panel.style.top = above ? (r.top - 292 * s - 6) + "px" : r.bottom + "px";
    panel.style.left = r.left + "px";
    panel.style.transform = "scale(" + s + ")";
  }
  function openP(): void {
    if (!panel) build();
    var cc = cur();
    var base = cc ? cc : today();
    viewY = base.y; viewM = base.m - 1;
    render(); pos();
    if (panel) panel.style.display = "block";
    open = true;
  }
  function closeP(): void {
    if (panel) panel.style.display = "none";
    open = false;
  }
  function onClickIn(): void { if (open) closeP(); else openP(); }
  function onKeyOpen(e: KeyboardEvent): void {
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") { e.preventDefault(); if (!open) openP(); }
  }
  function onDocDown(e: MouseEvent): void {
    if (!open) return;
    var t = e.target as Node | null;
    if (panel && t && panel.contains(t)) return;
    if (t === input) return;
    if (tg !== input && tg.contains(t)) return;
    closeP();
  }
  function onScroll(): void { if (open) closeP(); }
  function onKey(e: KeyboardEvent): void { if ((e.key === "Escape" || e.key === "Esc") && open) closeP(); }
  function onInput(): void { if (open) { var cc = cur(); if (cc) { viewY = cc.y; viewM = cc.m - 1; } render(); } }

  tg.addEventListener("click", onClickIn);
  tg.addEventListener("keydown", onKeyOpen);
  doc.addEventListener("mousedown", onDocDown);
  win.addEventListener("scroll", onScroll, true);
  win.addEventListener("resize", onScroll);
  input.addEventListener("keydown", onKey);
  input.addEventListener("input", onInput);

  return function () {
    tg.removeEventListener("click", onClickIn);
    tg.removeEventListener("keydown", onKeyOpen);
    doc.removeEventListener("mousedown", onDocDown);
    win?.removeEventListener("scroll", onScroll, true);
    win?.removeEventListener("resize", onScroll);
    input.removeEventListener("keydown", onKey);
    input.removeEventListener("input", onInput);
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    panel = null; grid = null; label = null;
    open = false;
    input.removeAttribute("data-wcdp");
  };
}

/** 发布端内联脚本：把编辑区调用的**同一个函数**以 `toString()` 内联进产物（两端同源，杜绝漂移）。 */
export function datePickerPopupScript(uid: string): string {
  return `<script>;(${installDatePickerPopup.toString()})(document.getElementById('${uid}'),document.getElementById('${uid}-tg'));</script>`;
}
