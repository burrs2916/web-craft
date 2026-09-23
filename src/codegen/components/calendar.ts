import type { ComponentCodegenFn } from "../types";
import { renderMenuIcon } from "../iconPipeline";
import { dataLoaderScript } from "../dataLoader";
import { resolveCalendarMarks, parseDateValue, toDateKey } from "../../editor/data/tableData";
import { resolveCalendarStyle, cssText } from "../../editor/data/tableStyle";
import { readAuthEnabled } from "../../editor/data/authMode";

/**
 * calendar 日历组件 → HTML（与编辑区 CalendarRenderer 结构同构）
 *
 * 相对旧实现的三处修正：
 * 1. **旧实现完全没有发布端动态数据能力** —— 日历是"接口驱动日期标记"最典型的场景，
 *    现已接入统一取数骨架（认证三态 / 轮询 / `auth-state-change` 重取）。
 * 2. 日期网格/星期表头/周末判定/默认日期解析由 `editor/data/tableData.ts` 收口；
 *    本文件内的运行时 JS 与 TS 侧 `buildMonthGrid` 一一对应（浏览器探针逐值验证）。
 * 3. 补齐「显示月份导航 / 星期栏配色 / 网格线开关 / 今日背景 / 只读」，且交互态（悬浮）
 *    一律走类规则，不用 inline。
 */
export const calendarCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;
  const s = resolveCalendarStyle(c);
  const disabled = c.disabled === true;
  const weekStartsOn = Number(c.weekStartsOn ?? 0) === 1 ? 1 : 0;
  const showNav = c.showNav !== false;
  const showMarkDot = c.showMarkDot !== false;

  const init = parseDateValue(c.value);
  const uid = `cal-${Math.random().toString(36).slice(2, 9)}`;

  // 静态标记（接口模式由运行时填充）
  const dataMode = String(c.dataMode ?? "static");
  const isApi = dataMode === "api" && (String(c.apiUrl ?? "") || String(c.apiPath ?? ""));
  const staticMarks = isApi ? [] : resolveCalendarMarks({ config: c });

  const prevIcon = renderMenuIcon("material:chevron_left", 18, ctx);
  const nextIcon = renderMenuIcon("material:chevron_right", 18, ctx);

  const rules = [
    `.${uid}-nav{display:flex;border-radius:4px;}`,
    disabled ? "" : `.${uid}-nav{cursor:pointer;}`,
    disabled ? "" : `.${uid}-nav:hover{background-color:${s.headerBg};}`,
    `.${uid}-cell{position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;}`,
    disabled ? "" : `.${uid}-cell:hover{background-color:rgba(255,255,255,0.06);}`,
  ].filter(Boolean).join("");
  const styleTag = `<style>${rules}</style>`;

  const gridLine = s.showGridLines ? `1px solid ${s.gridLineColor}` : "transparent";

  const container = `<div id="${uid}" style="${cssText({
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  })}"></div>`;

  /* ── 运行时渲染（网格算法与 TS 侧 buildMonthGrid / weekdayLabels 逐条对应） ── */
  const body = `
var UID = ${JSON.stringify(uid)};
var FONT = ${s.fontSize};
var WEEKDAY_FONT = ${s.weekdayFontSize};
var HEADER_FONT = ${s.headerFontSize};
var HEADER_COLOR = ${JSON.stringify(s.headerColor)};
var HEADER_BG = ${JSON.stringify(s.headerBg)};
var WEEKDAY_COLOR = ${JSON.stringify(s.weekdayColor)};
var DAY_COLOR = ${JSON.stringify(s.dayColor)};
var WEEKEND_COLOR = ${JSON.stringify(s.weekendColor)};
var SELECTED_BG = ${JSON.stringify(s.selectedBg)};
var SELECTED_TEXT = ${JSON.stringify(s.selectedText)};
var TODAY_BORDER = ${JSON.stringify(s.todayBorderColor)};
var TODAY_BG = ${JSON.stringify(s.todayBg)};
var MARK_COLOR = ${JSON.stringify(s.markDotColor)};
var GRID_LINE = ${JSON.stringify(gridLine)};
var RADIUS = ${s.radius};
var CELL_H = ${s.cellHeight};
var FILL = ${s.fillHeight};
var SHOW_WEEKEND = ${s.showWeekend};
var SHOW_TODAY = ${s.showToday};
var SHOW_GRID = ${s.showGridLines};
var SHOW_MARK = ${showMarkDot};
var SHOW_NAV = ${showNav};
var DISABLED = ${disabled};
var STARTS_ON = ${weekStartsOn};
var INIT_YEAR = ${init.year};
var INIT_MONTH = ${init.month};
var WEEKDAYS = ["日","一","二","三","四","五","六"];
var MONTHS = ["一月","二月","三月","四月","五月","六月","七月","八月","九月","十月","十一月","十二月"];
var PREV_ICON = ${JSON.stringify(prevIcon)};
var NEXT_ICON = ${JSON.stringify(nextIcon)};

var host = document.getElementById(UID);
if (host) {
  var viewYear = INIT_YEAR;
  var viewMonth = INIT_MONTH;
  var selectedKey = ${JSON.stringify(toDateKey(init.year, init.month, init.day))};
  var marks = {};
  function indexMarks(list){
    marks = {};
    (list || []).forEach(function(m){
      if (!m || !m.date) return;
      if (!marks[m.date]) marks[m.date] = [];
      marks[m.date].push(m);
    });
  }
  indexMarks(${JSON.stringify(staticMarks)});

  function pad2(n){ return n < 10 ? "0" + n : String(n); }
  function key(y, m, d){ return y + "-" + pad2(m + 1) + "-" + pad2(d); }
  function daysInMonth(y, m){ return new Date(y, m + 1, 0).getDate(); }
  function buildGrid(y, m){
    var firstDow = new Date(y, m, 1).getDay();
    var offset = STARTS_ON === 1 ? (firstDow + 6) % 7 : firstDow;
    var out = [];
    for (var i = 0; i < offset; i++) out.push(null);
    var total = daysInMonth(y, m);
    for (var d = 1; d <= total; d++) out.push(d);
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }
  function weekdayLabels(){
    return STARTS_ON === 1 ? WEEKDAYS.slice(1).concat([WEEKDAYS[0]]) : WEEKDAYS.slice();
  }
  function isWeekendCol(i){ return STARTS_ON === 1 ? (i === 5 || i === 6) : (i === 0 || i === 6); }
  function todayKey(){
    var t = new Date();
    return key(t.getFullYear(), t.getMonth(), t.getDate());
  }

  function render(){
    var cells = buildGrid(viewYear, viewMonth);
    var rows = Math.max(1, cells.length / 7);
    var html = "";
    if (SHOW_NAV) {
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:0 4px;margin-bottom:4px;flex-shrink:0">'
        + '<div class="' + UID + '-nav" data-nav="-1">' + PREV_ICON + '</div>'
        + '<span style="font-size:' + HEADER_FONT + 'px;color:' + HEADER_COLOR + ';font-weight:600">' + viewYear + '年 ' + MONTHS[viewMonth] + '</span>'
        + '<div class="' + UID + '-nav" data-nav="1">' + NEXT_ICON + '</div></div>';
    }
    html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);background-color:' + HEADER_BG + ';border-radius:' + RADIUS + 'px ' + RADIUS + 'px 0 0;flex-shrink:0">';
    weekdayLabels().forEach(function(wd, i){
      var col = (SHOW_WEEKEND && isWeekendCol(i)) ? WEEKEND_COLOR : WEEKDAY_COLOR;
      html += '<div style="display:flex;align-items:center;justify-content:center;height:' + Math.max(16, Math.round(CELL_H * 0.6)) + 'px;color:' + col + ';font-size:' + WEEKDAY_FONT + 'px;font-weight:' + (SHOW_WEEKEND ? 500 : 400) + '">' + wd + '</div>';
    });
    html += '</div>';
    var gridStyle = 'display:grid;grid-template-columns:repeat(7,1fr);flex:1;min-height:0;' + (FILL ? 'grid-template-rows:repeat(' + rows + ',minmax(0,1fr));' : '');
    html += '<div style="' + gridStyle + '">';
    var tKey = todayKey();
    for (var i = 0; i < cells.length; i++) {
      var borderBottom = SHOW_GRID ? ('1px solid ' + GRID_LINE) : 'none';
      var borderRight = (i % 7 !== 6) ? borderBottom : 'none';
      var d = cells[i];
      if (d === null) {
        html += '<div style="height:' + (FILL ? '100%' : CELL_H + 'px') + ';border-bottom:' + borderBottom + ';border-right:' + borderRight + '"></div>';
        continue;
      }
      var k = key(viewYear, viewMonth, d);
      var isSelected = (k === selectedKey);
      var isToday = SHOW_TODAY && (k === tKey);
      var dow = new Date(viewYear, viewMonth, d).getDay();
      var isWeekend = SHOW_WEEKEND && (dow === 0 || dow === 6);
      var bg = isSelected ? SELECTED_BG : ((isToday && TODAY_BG !== 'transparent') ? TODAY_BG : 'transparent');
      var fg = isSelected ? SELECTED_TEXT : (isWeekend ? WEEKEND_COLOR : DAY_COLOR);
      var cellStyle = 'height:' + (FILL ? '100%' : CELL_H + 'px') + ';min-height:0;border-bottom:' + borderBottom + ';border-right:' + borderRight + ';background-color:' + bg + ';color:' + fg + ';font-size:' + FONT + 'px;font-weight:' + (isToday ? 700 : 400) + ';';
      html += '<div class="' + UID + '-cell" data-day="' + k + '" style="' + cellStyle + '">';
      if (isToday && !isSelected) {
        html += '<div style="position:absolute;inset:2px;border-radius:' + RADIUS + 'px;border:1.5px solid ' + TODAY_BORDER + ';pointer-events:none"></div>';
      }
      html += '<div style="position:relative;z-index:1;line-height:1.1">' + d + '</div>';
      var list = marks[k] || [];
      if (SHOW_MARK && list.length) {
        html += '<div style="display:flex;gap:2px;margin-top:2px;position:relative;z-index:1">';
        for (var mi = 0; mi < Math.min(3, list.length); mi++) {
          var dotColor = isSelected ? SELECTED_TEXT : (list[mi].color || MARK_COLOR);
          html += '<div style="width:4px;height:4px;border-radius:50%;background-color:' + dotColor + '"></div>';
        }
        html += '</div>';
      }
      html += '</div>';
    }
    html += '</div>';
    host.innerHTML = html;
    bind();
  }

  function bind(){
    if (DISABLED) return;
    host.querySelectorAll('.' + UID + '-nav').forEach(function(n){
      n.addEventListener('click', function(){
        var dir = parseInt(n.getAttribute('data-nav'), 10);
        if (dir === -1) { if (viewMonth === 0) { viewMonth = 11; viewYear -= 1; } else viewMonth -= 1; }
        else { if (viewMonth === 11) { viewMonth = 0; viewYear += 1; } else viewMonth += 1; }
        render();
      });
    });
    host.querySelectorAll('.' + UID + '-cell').forEach(function(n){
      n.addEventListener('click', function(){
        selectedKey = n.getAttribute('data-day');
        render();
      });
    });
  }

  render();

  window["__wcCal_${uid}"] = function(data){
    var arr = [];
    if (Array.isArray(data)) {
      data.forEach(function(item){
        if (item && typeof item === "object") {
          var d = item.date != null ? item.date : (item.day != null ? item.day : item.value);
          if (d == null || d === "") return;
          arr.push({ date: String(d), label: item.label != null ? String(item.label) : (item.title != null ? String(item.title) : ""), color: item.color != null ? String(item.color) : "" });
        }
      });
    } else if (data && typeof data === "object") {
      Object.keys(data).forEach(function(k){
        if (!k.trim()) return;
        var v = data[k];
        arr.push({ date: k, label: v == null ? "" : String(v), color: "" });
      });
    }
    indexMarks(arr);
    render();
  };
}
`;

  const mainScript = `<script>(function(){${body}})();</script>`;

  const loader = isApi
    ? dataLoaderScript({
      container: `var el = document.getElementById("${uid}");`,
      apiUrl: String(c.apiUrl ?? ""),
      apiPath: String(c.apiPath ?? ""),
      apiMethod: String(c.apiMethod ?? "GET"),
      apiHeaders: String(c.apiHeaders ?? ""),
      apiBody: String(c.apiBody ?? ""),
      apiInterval: Number(c.apiInterval ?? 0),
      apiDataPath: String(c.apiDataPath ?? ""),
      authEnabled: readAuthEnabled(c.authEnabled),
      renderBody: `if (window["__wcCal_${uid}"]) window["__wcCal_${uid}"](data);`,
    })
    : "";

  return `${styleTag}${container}${mainScript}${loader}`;
};
