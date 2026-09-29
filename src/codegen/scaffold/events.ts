/**
 * 事件代码生成 — 将 EventBinding[] 转为运行时 DOM 事件脚本
 *
 * 生成的脚本通过 data-component-id 属性定位 DOM 元素，
 * 使用原生 addEventListener 绑定事件，执行 show/hide/toggle/navigate 等动作。
 *
 * 该脚本是框架无关的纯 JavaScript，兼容所有 4 种框架输出。
 */

import type { EventBinding, ThresholdTriggerConfig } from "../../types/editor";

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
    "",
    "  // 字段路径抽取（data/threshold 触发用）：空路径返回整个数据对象",
    "  function getFieldPath(obj, path) {",
    "    if (!path) return obj;",
    "    var cur = obj;",
    "    var segs = String(path).split('.');",
    "    for (var i = 0; i < segs.length; i++) { if (cur == null) return undefined; cur = cur[segs[i]]; }",
    "    return cur;",
    "  }",
    "",
    "  // 数据触发条件评估：以监听到的 value 为上下文（区别于交互 condition 的 ctx.target）",
    "  function checkValueCondition(expr, value) {",
    "    if (!expr) return true;",
    "    try { return new Function('value', 'return (' + expr + ')')(value); }",
    "    catch (e) { console.warn('[web-craft] Value condition eval failed:', e); return false; }",
    "  }",
    "",
    "  // 声音提示（与编辑区 EventBindingEngine.playSound 同算法）",
    "  function playSound(type) {",
    "    try {",
    "      var AC = window.AudioContext || window.webkitAudioContext;",
    "      if (!AC) return;",
    "      var ac = new AC();",
    "      var osc = ac.createOscillator();",
    "      var gain = ac.createGain();",
    "      osc.connect(gain); gain.connect(ac.destination);",
    "      var t = type || 'alarm';",
    "      if (t === 'alarm') {",
    "        osc.frequency.value = 880; gain.gain.value = 0.3; osc.start();",
    "        setTimeout(function() { osc.frequency.value = 660; }, 200);",
    "        setTimeout(function() { osc.stop(); ac.close(); }, 600);",
    "      } else if (t === 'beep') {",
    "        osc.frequency.value = 1000; gain.gain.value = 0.2; osc.start();",
    "        setTimeout(function() { osc.stop(); ac.close(); }, 150);",
    "      } else if (t === 'success') {",
    "        osc.frequency.value = 523; gain.gain.value = 0.2; osc.start();",
    "        setTimeout(function() { osc.frequency.value = 659; }, 100);",
    "        setTimeout(function() { osc.frequency.value = 784; }, 200);",
    "        setTimeout(function() { osc.stop(); ac.close(); }, 400);",
    "      } else if (t === 'error') {",
    "        osc.frequency.value = 200; gain.gain.value = 0.3; osc.start();",
    "        setTimeout(function() { osc.stop(); ac.close(); }, 300);",
    "      } else { try { osc.stop(); ac.close(); } catch(e) {} }",
    "    } catch (e) {}",
    "  }",
    "",
    "  // 场景变量统一写入口（A2）：写 __wc_sceneVars + 广播 wc:sceneVar，",
    "  // 供 sceneVar: 前缀的 data/threshold 触发订阅；暴露到 window 供表单/数据层脚本复用",
    "  function setSceneVar(name, value) {",
    "    if (!window.__wc_sceneVars) window.__wc_sceneVars = {};",
    "    window.__wc_sceneVars[name] = value;",
    "    try { window.dispatchEvent(new CustomEvent('wc:sceneVar', { detail: { name: name, value: value } })); } catch(e) {}",
    "  }",
    "  window.__wc_setSceneVar = setSceneVar;",
    "",
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
    "      // ── 以下动作与编辑区 EventBindingEngine.executeAction 对齐（A1） ──",
    "      case 'toggleVisible': toggle(target); break;",
    "      case 'setData': setValue(target, params.property || params.prop || 'textContent', params.value !== undefined ? params.value : ''); break;",
    "      case 'toggleData': {",
    "        if (target) {",
    "          var __tdProp = params.property || params.prop;",
    "          if (__tdProp && params.valueA !== undefined && params.valueB !== undefined) {",
    "            var __tdCur = target[__tdProp];",
    "            target[__tdProp] = (String(__tdCur) === String(params.valueA)) ? params.valueB : params.valueA;",
    "          }",
    "        }",
    "        break;",
    "      }",
    "      case 'setVariable':",
    "        if (params.variableName) setSceneVar(params.variableName, params.value);",
    "        break;",
    "      case 'playSound': playSound(params.sound); break;",
    "      case 'executeScript': {",
    "        if (params.script) { try { new Function('payload', '\"use strict\";' + params.script)(evt); } catch(e) { console.warn('[web-craft] executeScript failed', e); } }",
    "        break;",
    "      }",
    "      case 'closeDialog': try { window.dispatchEvent(new CustomEvent('webcraft:closeDialog')); } catch(e) {} break;",
    "      case 'highlight': {",
    "        if (target) {",
    "          if (params.value === false) target.style.outline = '';",
    "          else target.style.outline = params.color || '2px solid #f59e0b';",
    "        }",
    "        break;",
    "      }",
    "      // ── 导航动作（A1b）：运行时查 __WC_NAV_MAP（engine 编译期注入）；查不到则诚实降级 ──",
    "      case 'switchView': {",
    "        var __nv = window.__WC_NAV_MAP || {};",
    "        var __vf = (__nv.views || {})[params.viewId];",
    "        if (__vf) window.location.href = __vf;",
    "        else console.warn('[web-craft] switchView: 视图不在发布导航映射中:', params.viewId);",
    "        break;",
    "      }",
    "      case 'navigateToScene': {",
    "        var __nv2 = window.__WC_NAV_MAP || {};",
    "        var __sf = (__nv2.scenes || {})[params.sceneId] || (params.viewId ? (__nv2.views || {})[params.viewId] : null);",
    "        if (__sf) {",
    "          if (params.openMode === 'newWindow') window.open(__sf, '_blank', 'noopener,noreferrer');",
    "          else window.location.href = __sf;",
    "        } else {",
    "          console.warn('[web-craft] navigateToScene: 场景不在发布导航映射中（跨场景导航需多场景产物关联）:', params.sceneId);",
    "        }",
    "        break;",
    "      }",
    "      case 'openDialog': {",
    "        // 发布端无 dialog 运行时，降级为跳转到目标场景页",
    "        var __nv3 = window.__WC_NAV_MAP || {};",
    "        var __df = (__nv3.scenes || {})[params.sceneId] || (params.viewId ? (__nv3.views || {})[params.viewId] : null);",
    "        if (__df) window.location.href = __df;",
    "        else console.warn('[web-craft] openDialog: 场景不在发布导航映射中:', params.sceneId);",
    "        break;",
    "      }",
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
    "          // 落地1: 写全局场景变量（统一入口：写对象 + 广播 wc:sceneVar）",
    "          if (params.onSuccessWriteVar && extracted !== undefined) { setSceneVar(params.onSuccessWriteVar, extracted); }",
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
    "  // 动作序列执行（A3 IR）：steps 由生成期从 binding.actions 编译（单动作绑定不生成此路径）",
    "  function execSteps(steps, evt) {",
    "    for (var i = 0; i < steps.length; i++) {",
    "      execAction(steps[i].targetId, steps[i].action, steps[i].params, evt);",
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

  // A3：动作序列编译（binding.actions 非空时生成 steps 数组；null = 单动作兼容路径，产物零变化）
  const stepsJsonOf = (b: EventBinding): string =>
    b.actions && b.actions.length > 0
      ? JSON.stringify(
          b.actions.map((a) => ({
            targetId: a.targetComponentId,
            action: a.targetAction,
            params: a.params ?? {},
          })),
        )
      : "null";

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
        `      var steps = ${stepsJsonOf(binding)};`,
        `      var handler = function(e) {`,
        `        if (checkCondition(condition, targetId, params)) {`,
        `          if (steps) { execSteps(steps, e); } else { execAction(targetId, action, params, e); }`,
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
        `      var steps = ${stepsJsonOf(binding)};`,
        `      function fire() { if (steps) { execSteps(steps, undefined); } else { execAction(targetId, action, params); } }`,
        `      function start() {`,
        `        if (${once}) { setTimeout(fire, ${interval}); }`,
        `        else { setInterval(fire, ${interval}); }`,
        `      }`,
        `      if (${delay} > 0) { setTimeout(start, ${delay}); }`,
        `      else { start(); }`,
        `    })();`,
        "",
      );
    } else if (trigger === "data") {
      const dt = binding.dataTrigger ?? {};
      if (dt.dataSourceId && dt.dataSourceId.startsWith("sceneVar:")) {
        // A2：场景变量触发的 data 绑定——变量值直接作为 value（与编辑区 subscribeSceneVariable 一致，不抽 field）
        bindingCount++;
        const varName = dt.dataSourceId.slice("sceneVar:".length);
        const paramsStr = JSON.stringify(binding.params ?? {});
        const conditionStr = binding.condition ? JSON.stringify(binding.condition) : "null";

        lines.push(
          `    // Data trigger (sceneVar:${varName}) → ${binding.targetAction}: ${binding.targetComponentId}`,
          `    (function() {`,
          `      var params = ${paramsStr};`,
          `      var steps = ${stepsJsonOf(binding)};`,
          `      var last;`,
          `      function handle(value) {`,
          `        var snapshot = JSON.stringify(value);`,
          `        if (snapshot === last) return;`,
          `        last = snapshot;`,
          `        if (!checkValueCondition(${conditionStr}, value)) return;`,
          `        var __evt = { detail: { value: value } };`,
          `        if (steps) { execSteps(steps, __evt); } else { execAction('${binding.targetComponentId}', '${binding.targetAction}', params, __evt); }`,
          `      }`,
          `      window.addEventListener('wc:sceneVar', function(e) {`,
          `        if (e.detail && e.detail.name === ${JSON.stringify(varName)}) handle(e.detail.value);`,
          `      });`,
          `      // 补拉当前值（变量可能已被更早执行的脚本写入）`,
          `      var cur = (window.__wc_sceneVars || {})[${JSON.stringify(varName)}];`,
          `      if (cur !== undefined) { try { handle(cur); } catch(__e) {} }`,
          `    })();`,
          "",
        );
      } else if (dt.dataSourceId) {
        bindingCount++;
        const paramsStr = JSON.stringify(binding.params ?? {});
        const conditionStr = binding.condition ? JSON.stringify(binding.condition) : "null";
        const fieldStr = JSON.stringify(dt.field ?? "");
        const throttleVal = binding.throttle ?? "null";
        const debounceVal = binding.debounce ?? "null";

        lines.push(
          `    // Data trigger → ${binding.targetAction}: source=${dt.dataSourceId} field=${dt.field ?? ""} → ${binding.targetComponentId}`,
          `    // 数据到达（含首次）且值有变化时触发；condition 以 value 为上下文评估`,
          `    (function() {`,
          `      if (!window.__wc_dataSubs) window.__wc_dataSubs = [];`,
          `      var params = ${paramsStr};`,
          `      var steps = ${stepsJsonOf(binding)};`,
          `      var last;`,
          `      function handle(data) {`,
          `        var value = getFieldPath(data, ${fieldStr});`,
          `        var snapshot = JSON.stringify(value);`,
          `        if (snapshot === last) return;`,
          `        last = snapshot;`,
          `        if (!checkValueCondition(${conditionStr}, value)) return;`,
          `        var __evt = { detail: { value: value } };`,
          `        if (steps) { execSteps(steps, __evt); } else { execAction('${binding.targetComponentId}', '${binding.targetAction}', params, __evt); }`,
          `      }`,
          `      var handler = handle;`,
          `      if (${throttleVal}) handler = throttle(handler, ${throttleVal});`,
          `      if (${debounceVal}) handler = debounce(handler, ${debounceVal});`,
          `      window.__wc_dataSubs.push({ sourceId: '${dt.dataSourceId}', fn: handler });`,
          `      // 补拉当前数据快照：若数据层脚本先于本脚本执行，其初始通知发生在订阅注册前`,
          `      if (typeof window.__wc_getSourceData === 'function') {`,
          `        var __snap = window.__wc_getSourceData('${dt.dataSourceId}');`,
          `        if (__snap !== undefined) { try { handler(__snap); } catch(e) {} }`,
          `      }`,
          `    })();`,
          "",
        );
      } else {
        bindingCount++;
        lines.push(
          `    // Data trigger (componentId=${dt.componentId ?? ""}) → ${binding.targetAction}: ${binding.targetComponentId}`,
          `    // 组件级数据监听需要运行时组件状态，静态发布暂不支持（仅 dataSourceId 形式可发布）`,
          "",
        );
      }
    } else if (trigger === "threshold") {
      const tt: Partial<ThresholdTriggerConfig> = binding.thresholdTrigger ?? {};
      const SAFE_OPS = [">", ">=", "<", "<=", "==", "!="];
      if (tt.dataSourceId && tt.dataSourceId.startsWith("sceneVar:") && tt.operator && SAFE_OPS.includes(tt.operator)) {
        // A2：场景变量触发的阈值绑定——变量值直接作为被比较值
        bindingCount++;
        const varName = tt.dataSourceId.slice("sceneVar:".length);
        const paramsStr = JSON.stringify(binding.params ?? {});
        const edgeStr = JSON.stringify(tt.edge ?? "rising");

        lines.push(
          `    // Threshold trigger (sceneVar:${varName}) → ${binding.targetAction}: ${binding.targetComponentId} ${tt.operator} ${tt.threshold} (${tt.edge ?? "rising"})`,
          `    (function() {`,
          `      var params = ${paramsStr};`,
          `      var steps = ${stepsJsonOf(binding)};`,
          `      var prevHit = false;`,
          `      function handle(value) {`,
          `        var num = typeof value === 'number' ? value : parseFloat(value);`,
          `        if (num === null || isNaN(num)) return;`,
          `        var hit = (num ${tt.operator} ${JSON.stringify(tt.threshold)});`,
          `        var edge = ${edgeStr};`,
          `        var should = (edge === 'both') ? (hit !== prevHit) : (edge === 'falling') ? (prevHit && !hit) : (hit && !prevHit);`,
          `        prevHit = hit;`,
          `        if (!should) return;`,
          `        var __evt = { detail: { value: num } };`,
          `        if (steps) { execSteps(steps, __evt); } else { execAction('${binding.targetComponentId}', '${binding.targetAction}', params, __evt); }`,
          `      }`,
          `      window.addEventListener('wc:sceneVar', function(e) {`,
          `        if (e.detail && e.detail.name === ${JSON.stringify(varName)}) handle(e.detail.value);`,
          `      });`,
          `      var cur = (window.__wc_sceneVars || {})[${JSON.stringify(varName)}];`,
          `      if (cur !== undefined) { try { handle(cur); } catch(__e) {} }`,
          `    })();`,
          "",
        );
      } else if (tt.dataSourceId && tt.operator && SAFE_OPS.includes(tt.operator)) {
        bindingCount++;
        const paramsStr = JSON.stringify(binding.params ?? {});
        const fieldStr = JSON.stringify(tt.field ?? "");
        const edgeStr = JSON.stringify(tt.edge ?? "rising");

        lines.push(
          `    // Threshold trigger → ${binding.targetAction}: source=${tt.dataSourceId} field=${tt.field ?? ""} ${tt.operator} ${tt.threshold} (${tt.edge ?? "rising"}) → ${binding.targetComponentId}`,
          `    // 边沿检测：rising=首次越限/恢复后再越限触发，falling=恢复沿触发，both=状态翻转即触发`,
          `    (function() {`,
          `      if (!window.__wc_dataSubs) window.__wc_dataSubs = [];`,
          `      var params = ${paramsStr};`,
          `      var steps = ${stepsJsonOf(binding)};`,
          `      var prevHit = false;`,
          `      function handle(data) {`,
          `        var raw = getFieldPath(data, ${fieldStr});`,
          `        var num = typeof raw === 'number' ? raw : parseFloat(raw);`,
          `        if (num === null || isNaN(num)) return;`,
          `        var hit = (num ${tt.operator} ${JSON.stringify(tt.threshold)});`,
          `        var edge = ${edgeStr};`,
          `        var should = (edge === 'both') ? (hit !== prevHit) : (edge === 'falling') ? (prevHit && !hit) : (hit && !prevHit);`,
          `        prevHit = hit;`,
          `        if (!should) return;`,
          `        var __evt = { detail: { value: num } };`,
          `        if (steps) { execSteps(steps, __evt); } else { execAction('${binding.targetComponentId}', '${binding.targetAction}', params, __evt); }`,
          `      }`,
          `      window.__wc_dataSubs.push({ sourceId: '${tt.dataSourceId}', fn: handle });`,
          `      // 补拉当前数据快照：若数据层脚本先于本脚本执行，其初始通知发生在订阅注册前`,
          `      if (typeof window.__wc_getSourceData === 'function') {`,
          `        var __snap = window.__wc_getSourceData('${tt.dataSourceId}');`,
          `        if (__snap !== undefined) { try { handle(__snap); } catch(e) {} }`,
          `      }`,
          `    })();`,
          "",
        );
      } else {
        bindingCount++;
        lines.push(
          `    // Threshold trigger (source=${tt.dataSourceId ?? ""}, componentId=${tt.componentId ?? ""}, op=${tt.operator}) → ${binding.targetAction}: ${binding.targetComponentId}`,
          `    // ${tt.dataSourceId ? "非法比较运算符" : "组件级阈值监听需要运行时组件状态，静态发布暂不支持（仅 dataSourceId 形式可发布）"}`,
          "",
        );
      }
    } else {
      bindingCount++;
      lines.push(
        `    // State trigger → ${binding.targetAction}: ${binding.targetComponentId}`,
        `    // state 触发源编辑区与发布端均未实现（两端一致的已知缺口，见 A3 待办）`,
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
