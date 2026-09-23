/**
 * 事件代码生成 — 将 EventBinding[] 转为运行时 DOM 事件脚本
 *
 * 生成的脚本通过 data-component-id 属性定位 DOM 元素，
 * 使用原生 addEventListener 绑定事件，执行 show/hide/toggle/navigate 等动作。
 *
 * 该脚本是框架无关的纯 JavaScript，兼容所有 4 种框架输出。
 */

import type { EventBinding } from "../../types/editor";

/**
 * 事件代码生成结果
 */
export interface EventScriptResult {
  /** 事件初始化函数体代码（不含 IIFE 包装和 export 声明） */
  script: string;
  /** 是否有任何事件被生成 */
  hasEvents: boolean;
  /**
   * 生成完整的事件初始化模块文件
   * - React/Vue/Angular: `export function initEvents() { ... }`
   */
  module: string;
  /**
   * 生成内联 <script> 标签内容（IIFE 格式）
   * - Static HTML: `(function(){ ... })();`
   */
  inlineScript: string;
}

/**
 * 生成事件初始化代码
 *
 * @param events 该视图的所有事件绑定
 * @returns 函数体代码 + 模块文件 + 内联脚本
 */
export function generateEventsScript(events: EventBinding[]): EventScriptResult {
  if (!events || events.length === 0) {
    return {
      script: "",
      hasEvents: false,
      module: "",
      inlineScript: "",
    };
  }

  const body = generateEventBody(events);
  const hasEvents = body.trim().length > 0;

  return {
    script: body,
    hasEvents,
    module: hasEvents
      ? `// web-craft 自动生成的事件模块\nexport function initEvents() {\n${body}\n}\n`
      : "",
    inlineScript: hasEvents
      ? `// web-craft 自动生成的事件脚本\n(function() {\n${body}\n})();`
      : "",
  };
}

/**
 * 生成事件初始化函数体（被 module 和 inlineScript 共用）
 */
function generateEventBody(events: EventBinding[]): string {
  const lines: string[] = [
    "  function $(id) { return document.querySelector('[data-component-id=\"' + id + '\"]'); }",
    "",
    "  // 动作工具函数",
    "  function show(el) { if (el) el.style.display = ''; }",
    "  function hide(el) { if (el) el.style.display = 'none'; }",
    "  function toggle(el) { if (!el) return; el.style.display = el.style.display === 'none' ? '' : 'none'; }",
    "  function navigate(route) { if (route) window.location.href = route; }",
    "  function scrollToEl(el) { if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }",
    "  function setValue(el, prop, val) { if (el) el[prop] = val; }",
    "",
    "  // 节流/防抖",
    "  function throttle(fn, ms) {",
    "    var last = 0;",
    "    return function() {",
    "      var now = Date.now();",
    "      if (now - last >= ms) { last = now; fn.apply(this, arguments); }",
    "    };",
    "  }",
    "  function debounce(fn, ms) {",
    "    var timer;",
    "    return function() {",
    "      var args = arguments, ctx = this;",
    "      clearTimeout(timer);",
    "      timer = setTimeout(function() { fn.apply(ctx, args); }, ms);",
    "    };",
    "  }",
    "",
    "  // 执行动作",
    "  // ⚠️ {{value}} 事件值通道（第 12 轮）：触发事件的 detail.value（自定义事件，如开关）",
    "  // 或 target.value（原生控件，如滑块/输入框）会替换 params 里所有 {{value}} 占位符 ——",
    "  // 拖滑块/按开关下发命令时命令体才能携带当前值。无事件上下文时原样透传（零回归）。",
    "  function injectEventValue(x, val) {",
    "    if (x === '{{value}}') return val;",
    "    if (typeof x === 'string') return x.split('{{value}}').join(String(val));",
    "    if (Array.isArray(x)) return x.map(function(v){ return injectEventValue(v, val); });",
    "    if (x && typeof x === 'object') { var o = {}; for (var k in x) o[k] = injectEventValue(x[k], val); return o; }",
    "    return x;",
    "  }",
    "  function execAction(targetId, action, params, evt) {",
    "    var target = $(targetId);",
    "    params = params || {};",
    "    if (evt) {",
    "      var evVal;",
    "      if (evt.detail && evt.detail.value !== undefined) evVal = evt.detail.value;",
    "      else if (evt.target && evt.target.value !== undefined) evVal = evt.target.value;",
    "      if (evVal !== undefined) params = injectEventValue(params, evVal);",
    "    }",
    "    switch (action) {",
    "      case 'show': show(target); break;",
    "      case 'hide': hide(target); break;",
    "      case 'toggle': toggle(target); break;",
    "      case 'navigate': navigate(params.route || params.url || '#'); break;",
    "      case 'scrollTo': scrollToEl(target); break;",
    "      case 'setValue': setValue(target, params.prop || 'textContent', params.value || ''); break;",
    "      case 'addCssClass': if (target) target.classList.add(params.className || ''); break;",
    "      case 'removeCssClass': if (target) target.classList.remove(params.className || ''); break;",
    "      case 'toggleCssClass': if (target) target.classList.toggle(params.className || ''); break;",
    "      case 'callApi': {",
    "        var u = params.url || '';",
    "        if (!u) break;",
    "        // 相对路径拼接全局基地址（优先数据层暴露的 __wc_buildUrl，其次 __WC_API_BASE 兜底）",
    "        if (!/^https?:\\/\\//i.test(u)) {",
    "          var __b = (typeof window.__wc_buildUrl === 'function') ? window.__wc_buildUrl(u, '') : ((window.__WC_API_BASE || '') + (u.charAt(0) === '/' ? u : '/' + u));",
    "          u = __b || u;",
    "        }",
    "        var m = String(params.method || 'GET').toUpperCase();",
    "        var h = { 'Content-Type': 'application/json' };",
    "        // 自定义 headers",
    "        if (params.headers) { for (var hk in params.headers) { h[hk] = params.headers[hk]; } }",
    "        // 认证注入：优先数据层 __wc_getToken，其次自包含读取 storage（独立可用）",
    "        var t = null;",
    "        if (typeof window.__wc_getToken === 'function') { t = window.__wc_getToken(); }",
    "        else {",
    "          var __st = window.__WC_TOKEN_STORAGE || 'localStorage';",
    "          var __key = window.__WC_TOKEN_KEY || 'auth_token';",
    "          var __hdr = window.__WC_TOKEN_HEADER || 'Authorization';",
    "          var __pfx = window.__WC_TOKEN_PREFIX !== undefined ? window.__WC_TOKEN_PREFIX : 'Bearer ';",
    "          var __tok = null;",
    "          if (__st === 'localStorage') { try { __tok = window.localStorage.getItem(__key); } catch(e){} }",
    "          else if (__st === 'sessionStorage') { try { __tok = window.sessionStorage.getItem(__key); } catch(e){} }",
    "          else if (__st === 'memory') { __tok = (window.__webcraft_memory_cache || {})[__key]; }",
    "          if (__tok) t = { header: __hdr, value: __pfx + __tok };",
    "        }",
    "        if (t && t.header) h[t.header] = t.value;",
    "        var opt = { method: m, headers: h };",
    "        if (params.body && m !== 'GET') opt.body = JSON.stringify(params.body);",
    "        try { fetch(u, opt).then(function(res) { return res ? res.json().catch(function(){ return res.text(); }) : null; }).then(function(data) {",
    "          // 响应路径抽取",
    "          var extracted = data;",
    "          if (data && params.responsePath) {",
    "            var segs = String(params.responsePath).split('.');",
    "            for (var si = 0; si < segs.length; si++) { if (extracted != null) extracted = extracted[segs[si]]; }",
    "          }",
    "          // 落地1: 写全局场景变量",
    "          if (params.onSuccessWriteVar && extracted !== undefined) {",
    "            if (!window.__wc_sceneVars) window.__wc_sceneVars = {};",
    "            window.__wc_sceneVars[params.onSuccessWriteVar] = extracted;",
    "          }",
    "          // 落地2: 刷新目标组件接口数据（调用数据层暴露的 wc_refresh_<id>）",
    "          if (params.refreshSourceIds) {",
    "            for (var ri = 0; ri < params.refreshSourceIds.length; ri++) {",
    "              var fn = window['wc_refresh_' + String(params.refreshSourceIds[ri]).replace(/[^\\w]/g, '_')];",
    "              if (typeof fn === 'function') { try { fn(); } catch(e){} }",
    "            }",
    "          }",
    "        }).catch(function(e){ console.warn('[web-craft] callApi failed', e); }); } catch(e) { console.warn('[web-craft] callApi error', e); }",
    "        break;",
    "      }",
    "      default: console.warn('[web-craft] Unknown action:', action);",
    "    }",
    "  }",
    "",
    "  // 条件评估",
    "  function checkCondition(condition, targetId, params) {",
    "    if (!condition) return true;",
    "    try {",
    "      var target = $(targetId);",
    "      var ctx = { target: target, params: params || {} };",
    "      return new Function('ctx', 'return (' + condition + ')')(ctx);",
    "    } catch (e) {",
    "      console.warn('[web-craft] Condition eval failed:', e);",
    "      return false;",
    "    }",
    "  }",
    "",
    "  // DOM 就绪",
    "  function onReady(fn) {",
    "    if (document.readyState !== 'loading') fn();",
    "    else document.addEventListener('DOMContentLoaded', fn);",
    "  }",
    "",
    "  // 绑定事件",
    "  onReady(function() {",
  ];

  let bindingCount = 0;

  for (const binding of events) {
    if (binding.enabled === false) continue;
    const trigger = binding.triggerSource ?? "interaction";

    if (trigger === "interaction") {
      bindingCount++;
      const eventType = mapEventName(binding.sourceEvent);
      const paramsStr = JSON.stringify(binding.params ?? {});
      const conditionStr = binding.condition ? JSON.stringify(binding.condition) : "null";
      const throttleVal = binding.throttle ?? "null";
      const debounceVal = binding.debounce ?? "null";

      lines.push(
        `    // ${binding.sourceEvent} → ${binding.targetAction}: ${binding.sourceComponentId} → ${binding.targetComponentId}`,
        `    (function() {`,
        `      var src = $('${binding.sourceComponentId}');`,
        `      if (!src) return;`,
        `      var targetId = '${binding.targetComponentId}';`,
        `      var action = '${binding.targetAction}';`,
        `      var params = ${paramsStr};`,
        `      var condition = ${conditionStr};`,
        `      var handler = function(e) {`,
        `        if (checkCondition(condition, targetId, params)) {`,
        `          execAction(targetId, action, params, e);`,
        `        }`,
        `      };`,
        `      if (${throttleVal}) handler = throttle(handler, ${throttleVal});`,
        `      if (${debounceVal}) handler = debounce(handler, ${debounceVal});`,
        `      src.addEventListener('${eventType}', handler);`,
        `    })();`,
        "",
      );
    } else if (trigger === "timer") {
      bindingCount++;
      const interval = binding.timerTrigger?.interval ?? 5000;
      const once = binding.timerTrigger?.once ?? false;
      const delay = binding.timerTrigger?.delay ?? 0;
      const paramsStr = JSON.stringify(binding.params ?? {});

      lines.push(
        `    // Timer → ${binding.targetAction}: ${binding.targetComponentId} (interval=${interval}ms, once=${once})`,
        `    (function() {`,
        `      var targetId = '${binding.targetComponentId}';`,
        `      var action = '${binding.targetAction}';`,
        `      var params = ${paramsStr};`,
        `      function fire() { execAction(targetId, action, params); }`,
        `      function start() {`,
        `        if (${once}) { setTimeout(fire, ${interval}); }`,
        `        else { setInterval(fire, ${interval}); }`,
        `      }`,
        `      if (${delay} > 0) { setTimeout(start, ${delay}); }`,
        `      else { start(); }`,
        `    })();`,
        "",
      );
    } else if (trigger === "data" || trigger === "threshold" || trigger === "state") {
      bindingCount++;
      lines.push(
        `    // ${trigger} trigger → ${binding.targetAction}: ${binding.targetComponentId}`,
        `    // TODO: ${trigger} trigger requires runtime data layer (Phase 4)`,
        "",
      );
    }
  }

  lines.push("  });");

  return bindingCount > 0 ? lines.join("\n") : "";
}

/**
 * 将编辑器事件名映射为 DOM 事件名
 */
function mapEventName(sourceEvent: string): string {
  const map: Record<string, string> = {
    click: "click",
    dblclick: "dblclick",
    "double-click": "dblclick",
    mouseenter: "mouseenter",
    "mouse-enter": "mouseenter",
    hover: "mouseenter",
    mouseleave: "mouseleave",
    "mouse-leave": "mouseleave",
    mousemove: "mousemove",
    mousedown: "mousedown",
    mouseup: "mouseup",
    focus: "focus",
    blur: "blur",
    change: "change",
    input: "input",
    submit: "submit",
    keydown: "keydown",
    keyup: "keyup",
    keypress: "keypress",
    scroll: "scroll",
    resize: "resize",
  };
  return map[sourceEvent] ?? sourceEvent;
}
