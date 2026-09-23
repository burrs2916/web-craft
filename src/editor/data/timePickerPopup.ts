/**
 * 自绘时间拾取弹层（口径文件，发布端与编辑区**共用同一函数对象**）
 *
 * 为什么必须自绘：预览窗口是 Tauri `WebviewWindow`（macOS = WKWebView / Safari 引擎），
 * 该引擎对 `<input type="time">` **没有原生下拉拾取器**（Chrome 才有）→ 任何依赖
 * 原生弹层的方案在预览里注定无效。自绘弹层与 `<select>` 自绘下拉（form.ts）同一范式：
 * 挂 document.body + position:fixed + scaleOf() 视觉补偿，引擎无关、与页面缩放无关。
 *
 * 铁律（沿用 datetimePickerBridge 时代验证过的约束）：
 * 1. `installTimePickerPopup` **自包含**——不得引用本模块其它导出或任何模块作用域标识符
 *    （构建器会重命名它们 → 产物里成未定义引用），codegen 用 `toString()` 内联。
 * 2. 真实 input 仍是唯一值来源：提交用「原生 value setter」（兼容 React 受控输入）+
 *    先 input 后 change（顺序与原生一致），既有 liveValidate/清空/占位同步脚本零改动。
 * 3. 幂等：重复安装返回空 teardown（React StrictMode 双挂 effect 安全）。
 * 4. 步长：读 input 的 `step` 属性（秒）→ 分钟步长 = step/60（夹在 [1,30]），
 *    step ≥ 3600 时小时也按步长跳。
 */

/**
 * 给 input 装自绘时间弹层，返回 teardown（移除监听与弹层节点）。
 *
 * @param trigger 可选点击源：发布端传壳内透明触发器（input 本体 `pointer-events:none`，
 * 原生拾取器在所有引擎里都无从触发）；编辑区不传则回退绑在 input 上。
 */
export function installTimePickerPopup(input: HTMLInputElement, trigger?: HTMLElement): () => void {
  if (!input || input.getAttribute("data-wctp") === "1") return function () {};
  var doc = input.ownerDocument;
  var win = doc ? doc.defaultView : null;
  if (!doc || !win) return function () {};
  if (input.disabled || input.readOnly) return function () {};
  input.setAttribute("data-wctp", "1");
  var tg: HTMLElement = trigger || input;

  var panel: HTMLDivElement | null = null;
  var hourCol: HTMLDivElement | null = null;
  var minCol: HTMLDivElement | null = null;
  var open = false;
  var hourEls: { el: HTMLDivElement; v: number }[] = [];
  var minEls: { el: HTMLDivElement; v: number }[] = [];

  function pad(n: number): string { return (n < 10 ? "0" : "") + n; }
  function steps(): { h: number; m: number } {
    var st = parseInt(input.getAttribute("step") || "", 10);
    if (!(st > 0)) st = 60;
    var ms = Math.round(st / 60); if (ms < 1) ms = 1; if (ms > 30) ms = 30;
    var hs = st >= 3600 ? Math.floor(st / 3600) : 1; if (hs < 1) hs = 1;
    return { h: hs, m: ms };
  }
  function cur(): { h: number; m: number } {
    var mm = /^(\d{1,2}):(\d{2})/.exec(input.value || "");
    return mm ? { h: parseInt(mm[1], 10), m: parseInt(mm[2], 10) } : { h: -1, m: -1 };
  }
  function scaleOf(): number {
    var r = input.getBoundingClientRect();
    var w = input.offsetWidth || r.width;
    return (w && r.width) ? (r.width / w) : 1;
  }
  /** 原生 setter 写值：React 受控输入也能识别（tracker 比较 prototype setter），原生输入等价直接赋值 */
  function setValue(v: string): void {
    try {
      var Ctor = (win as unknown as { HTMLInputElement?: { prototype: unknown } }).HTMLInputElement;
      var d = Ctor ? Object.getOwnPropertyDescriptor(Ctor.prototype, "value") : null;
      if (d && d.set) { (d.set as (val: string) => void).call(input, v); }
      else { input.value = v; }
    } catch (_e) { input.value = v; }
  }
  function commit(h: number, m: number, closeAfter: boolean): void {
    setValue(pad(h) + ":" + pad(m));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    mark();
    if (closeAfter) closeP();
  }
  function selEl(arr: { el: HTMLDivElement; v: number }[], v: number): HTMLDivElement | null {
    for (var i = 0; i < arr.length; i++) if (arr[i].v === v) return arr[i].el;
    return null;
  }
  function mark(): void {
    var cc = cur();
    var i: number;
    for (i = 0; i < hourEls.length; i++) {
      var on = hourEls[i].v === cc.h;
      hourEls[i].el.style.background = on ? "rgba(25,118,210,.12)" : "";
      hourEls[i].el.style.fontWeight = on ? "600" : "";
    }
    for (i = 0; i < minEls.length; i++) {
      var on2 = minEls[i].v === cc.m;
      minEls[i].el.style.background = on2 ? "rgba(25,118,210,.12)" : "";
      minEls[i].el.style.fontWeight = on2 ? "600" : "";
    }
    if (hourCol) { var se = selEl(hourEls, cc.h); if (se) hourCol.scrollTop = se.offsetTop - hourCol.clientHeight / 2; }
    if (minCol) { var se2 = selEl(minEls, cc.m); if (se2) minCol.scrollTop = se2.offsetTop - minCol.clientHeight / 2; }
  }
  function col(side: "h" | "m", count: number, stepv: number): HTMLDivElement {
    var c = doc.createElement("div");
    c.style.cssText = "overflow-y:auto;overflow-x:hidden;padding:4px 0";
    for (var v = 0; v < count; v += stepv) {
      (function (val: number) {
        var it = doc.createElement("div");
        it.setAttribute("data-wctp-" + side, String(val));
        it.textContent = pad(val);
        it.style.cssText = "height:32px;line-height:32px;text-align:center;cursor:pointer;user-select:none;white-space:nowrap";
        it.addEventListener("mouseenter", function () { it.style.background = "rgba(0,0,0,.05)"; });
        it.addEventListener("mouseleave", function () { var cc = cur(); var on = (side === "h" ? cc.h : cc.m) === val; if (!on) it.style.background = ""; });
        it.addEventListener("mousedown", function (e: MouseEvent) { e.preventDefault(); });
        it.addEventListener("click", function () {
          var cc = cur();
          var h = side === "h" ? val : (cc.h >= 0 ? cc.h : 0);
          var m = side === "m" ? val : (cc.m >= 0 ? cc.m : 0);
          commit(h, m, side === "m");
        });
        (side === "h" ? hourEls : minEls).push({ el: it, v: val });
        c.appendChild(it);
      })(v);
    }
    return c;
  }
  function build(): void {
    if (!doc.body) return;
    panel = doc.createElement("div");
    panel.setAttribute("data-wctp-panel", "");
    panel.style.cssText = "position:fixed;z-index:2147483000;display:none;box-sizing:border-box;background:#ffffff;border:1px solid rgba(0,0,0,.14);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.18);overflow:hidden;transform-origin:top left";
    var cs = win && win.getComputedStyle ? win.getComputedStyle(input) : null;
    panel.style.fontFamily = cs && cs.fontFamily ? cs.fontFamily : "sans-serif";
    panel.style.fontSize = cs && cs.fontSize ? cs.fontSize : "14px";
    panel.style.color = cs && cs.color ? cs.color : "#333333";
    var st = steps();
    hourCol = col("h", 24, st.h);
    hourCol.style.flex = "1 1 0";
    minCol = col("m", 60, st.m);
    minCol.style.flex = "1 1 0";
    panel.appendChild(hourCol);
    panel.appendChild(minCol);
    doc.body.appendChild(panel);
  }
  function pos(): void {
    if (!panel || !hourCol || !minCol) return;
    var r = input.getBoundingClientRect();
    var s = scaleOf() || 1;
    // 弹层宽度 = 字段设计宽，再经 transform:scale(s) 后视觉宽 === 字段视觉宽（与 select 自绘弹层同口径）
    panel.style.width = (input.offsetWidth || r.width) + "px";
    var avail = win ? win.innerHeight - r.bottom - 8 : 300;
    var mh = Math.max(120, Math.min(272, Math.round(avail / s)));
    hourCol.style.maxHeight = mh + "px";
    minCol.style.maxHeight = mh + "px";
    var above = avail < 140 && r.top > 200;
    panel.style.top = above ? (r.top - mh * s - 6) + "px" : r.bottom + "px";
    panel.style.left = r.left + "px";
    panel.style.transform = "scale(" + s + ")";
  }
  function openP(): void {
    if (!panel) build();
    pos(); mark();
    if (panel) panel.style.display = "flex";
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
  function onInput(): void { if (open) mark(); }

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
    panel = null; hourCol = null; minCol = null; hourEls = []; minEls = [];
    open = false;
    input.removeAttribute("data-wctp");
  };
}

/** 发布端内联脚本：把编辑区调用的**同一个函数**以 `toString()` 内联进产物（两端同源，杜绝漂移）。 */
export function timePickerPopupScript(uid: string): string {
  return `<script>;(${installTimePickerPopup.toString()})(document.getElementById('${uid}'),document.getElementById('${uid}-tg'));</script>`;
}
