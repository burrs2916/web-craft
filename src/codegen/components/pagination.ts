import type { ComponentCodegenFn } from "../types";
import { renderMenuIcon } from "../iconPipeline";
import { dataLoaderScript } from "../dataLoader";
import { buildPaginationModel, normalizePaginationTotal } from "../../editor/data/tableData";
import { PAGINATION_FIT, resolvePaginationStyle, paginationTexts, cssText } from "../../editor/data/tableStyle";
import { scaleFitStage, scaleFitScript } from "../scaleFit";
import { readAuthEnabled } from "../../editor/data/authMode";

/**
 * pagination 分页组件 → HTML（与编辑区 PaginationRenderer 结构同构）
 *
 * 交互铁律：页码的**选中态 / 悬浮态一律由类规则承载**（`.pg-<uid>-item.is-active`、`:hover`），
 * 绝不在点击时逐个改 inline 样式 —— 旧实现正是这么做的，后果是 inline 恒胜过类规则，
 * 悬浮与选中互相压死、过渡失效；而且旧实现用 `document.querySelectorAll('.pg-xxx')`
 * 做**全局**查询，同一页面放两个分页实例会互相串扰。现在所有选择器都限定在自身 uid 容器内。
 *
 * 取数：接口模式复用统一骨架 `dataLoaderScript`（URL 拼接 / 全局默认请求头 / 认证三态注入 /
 * POST 请求体 / 轮询 / `auth-state-change` 重取），与编辑区 `useApiDataFetch` 语义一致。
 *
 * 缩放：与编辑区同一公式（`editor/data/scaleFit.ts` 的 fitFactor + PAGINATION_FIT），
 * 发布端用 transform 实现（只触发合成、不引起重排，拖动框连续改尺寸时不掉帧）。
 */
export const paginationCodegen: ComponentCodegenFn = (component, ctx) => {
  const c = component.config;
  const s = resolvePaginationStyle(c);
  const disabled = c.disabled === true;
  const scaleFit = c.scaleFit !== false;
  const showPrevNext = c.showPrevNext !== false;
  const showTotal = c.showTotal !== false;
  const showPageSize = c.showPageSize === true;
  const showQuickJumper = c.showQuickJumper === true;

  const dataMode = String(c.dataMode ?? "static");
  const isApi = dataMode === "api" && (String(c.apiUrl ?? "") || String(c.apiPath ?? ""));
  const staticTotal = normalizePaginationTotal(c.staticData) ?? Number(c.total ?? 100);

  const uid = `pg-${Math.random().toString(36).slice(2, 9)}`;
  const arrowSize = s.fontSize + 4;
  const prevIcon = renderMenuIcon("material:chevron_left", arrowSize, ctx);
  const nextIcon = renderMenuIcon("material:chevron_right", arrowSize, ctx);

  /* ── 状态类规则（唯一承载选中/悬浮/禁用态的地方） ── */
  const rules = [
    `.${uid}-item{border:${s.borderEnabled ? `1px solid ${s.borderColor}` : "none"};background-color:${s.bgColor};color:${s.textColor};font-weight:400;}`,
    `.${uid}-item.is-active{background-color:${s.activeBgColor};color:${s.activeTextColor};font-weight:600;border:none;}`,
    disabled ? "" : `.${uid}-item:not(.is-active):not(.is-disabled):hover{background-color:${s.hoverBg};}`,
    `.${uid}-item.is-disabled{opacity:0.4;pointer-events:none;}`,
    `.${uid}-item:not(.is-disabled):not(.${uid}-ellipsis){cursor:pointer;}`,
    `.${uid}-jump{width:44px;border:${s.borderEnabled ? `1px solid ${s.borderColor}` : "none"};border-radius:${s.radiusCss};background-color:transparent;color:${s.textColor};font-size:${s.fontSize}px;text-align:center;outline:none;font-family:inherit;height:${s.btnSize}px;box-sizing:border-box;}`,
    `.${uid}-jump::-webkit-inner-spin-button{-webkit-appearance:none;}`,
    `.${uid}-ellipsis{cursor:default;}`,
  ].filter(Boolean).join("");
  const styleTag = `<style>${rules}</style>`;

  const buttonStyle = cssText(s.btn);

  /** 单个页码 / 箭头按钮（服务端渲染用） */
  const btn = (
    label: string,
    pageAttr: string,
    extra: { active?: boolean; dis?: boolean; noNav?: boolean },
  ): string => {
    const cls = [
      `${uid}-item`,
      extra.active ? "is-active" : "",
      extra.dis ? "is-disabled" : "",
      extra.noNav ? `${uid}-ellipsis` : "",
    ].filter(Boolean).join(" ");
    const attrs = extra.noNav ? "" : ` data-page="${pageAttr}"`;
    return `<div class="${cls}" style="${buttonStyle}"${attrs}>${label}</div>`;
  };

  /** 服务端渲染的完整内容（页码算法只有 buildPaginationModel 一份实现） */
  const buildStaticInner = (model: ReturnType<typeof buildPaginationModel>): string => {
    const { totalLabel, pageSizeLabel } = paginationTexts(model, showTotal, showPageSize);
    let html = "";
    if (totalLabel) {
      html += `<span style="font-size:${s.fontSize}px;color:${s.textColor};white-space:nowrap;margin-right:8px">${totalLabel}</span>`;
    }
    if (showPrevNext) {
      html += btn(prevIcon, String(model.current - 1), { dis: !model.canPrev });
    }
    for (const item of model.pageItems) {
      if (item === "ellipsis") html += btn("···", "", { noNav: true });
      else html += btn(String(item), String(item), { active: item === model.current });
    }
    if (showPrevNext) {
      html += btn(nextIcon, String(model.current + 1), { dis: !model.canNext });
    }
    if (pageSizeLabel) {
      html += `<span style="font-size:${s.fontSize}px;color:${s.textColor};white-space:nowrap;margin-left:4px">${pageSizeLabel}</span>`;
    }
    if (showQuickJumper) {
      html += `<span style="display:flex;align-items:center;gap:4px;margin-left:4px">`
        + `<span style="font-size:${s.fontSize}px;color:${s.textColor};white-space:nowrap">跳至</span>`
        + `<input type="number" class="${uid}-jump" value="${model.current}"${disabled ? " disabled" : ""}/>`
        + `<span style="font-size:${s.fontSize}px;color:${s.textColor};white-space:nowrap">页</span></span>`;
    }
    return html;
  };

  const innerBox = (inner: string) =>
    `<div class="${uid}-in" style="display:flex;align-items:center;gap:${s.gap}px;transform-origin:center center;flex-shrink:0">${inner}</div>`;
  const stage = (inner: string) =>
    scaleFit
      ? scaleFitStage({ uid, control: innerBox(inner), spec: PAGINATION_FIT, innerStyle: "display:flex" })
      : innerBox(inner);
  const wrap = (inner: string) =>
    `<div class="${uid}-wrap" style="${cssText(s.outer)}">${stage(inner)}</div>`;
  const fitScript = scaleFit ? scaleFitScript(uid, PAGINATION_FIT) : "";

  /* ══ 静态模式：服务端渲染页码（与编辑区共用 buildPaginationModel） ══ */
  if (!isApi) {
    const model = buildPaginationModel({
      current: c.current,
      pageSize: c.pageSize,
      total: staticTotal,
      maxButtons: c.maxButtons,
    });
    const interactScript = `
<script>
(function(){
  var root = document.querySelector('.${uid}-wrap');
  if (!root) return;
  var totalPages = ${model.totalPages};
  var current = ${model.current};
  function apply(next){
    if (!isFinite(next) || next < 1 || next > totalPages) return;
    current = next;
    root.querySelectorAll('.${uid}-item[data-page]').forEach(function(n){
      var p = parseInt(n.getAttribute('data-page'), 10);
      if (p === current) n.classList.add('is-active');
      else n.classList.remove('is-active');
    });
    var jump = root.querySelector('.${uid}-jump');
    if (jump) jump.value = String(current);
  }
  if (${!disabled}) {
    root.querySelectorAll('.${uid}-item[data-page]').forEach(function(n){
      n.addEventListener('click', function(){
        var p = parseInt(n.getAttribute('data-page'), 10);
        if (!isNaN(p)) apply(p);
      });
    });
    var jump = root.querySelector('.${uid}-jump');
    if (jump) {
      jump.addEventListener('change', function(){ apply(Math.floor(Number(jump.value))); });
      jump.addEventListener('keydown', function(e){ if (e.key === 'Enter') apply(Math.floor(Number(jump.value))); });
    }
  }
})();
</script>`;
    return `${styleTag}${wrap(buildStaticInner(model))}${fitScript}${interactScript}`;
  }

  /* ══ 接口模式：总数由接口驱动，运行时重建页码（与 TS 侧同一算法） ══ */
  const mountScript = `<script>
(function(){
  var root = document.querySelector('.${uid}-wrap');
  if (!root) return;
  var host = root.querySelector('.${uid}-in');
  if (!host) return;
  var PAGE_SIZE = ${Number(c.pageSize ?? 10) || 10};
  var MAX_BUTTONS = ${Math.min(9, Math.max(3, Number(c.maxButtons ?? 5) || 5))};
  var INITIAL = ${Math.max(1, Math.floor(Number(c.current ?? 1) || 1))};
  var SHOW_TOTAL = ${showTotal};
  var SHOW_PAGE_SIZE = ${showPageSize};
  var SHOW_JUMP = ${showQuickJumper};
  var SHOW_PREV_NEXT = ${showPrevNext};
  var DISABLED = ${disabled};
  var FONT = ${s.fontSize};
  var TEXT_COLOR = ${JSON.stringify(s.textColor)};
  var BTN_STYLE = ${JSON.stringify(buttonStyle)};
  var PREV_ICON = ${JSON.stringify(prevIcon)};
  var NEXT_ICON = ${JSON.stringify(nextIcon)};

  var total = ${staticTotal};
  var current = INITIAL;

  function model(){
    var totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (current > totalPages) current = totalPages;
    if (current < 1) current = 1;
    var items = [];
    if (totalPages <= MAX_BUTTONS) {
      for (var i = 1; i <= totalPages; i++) items.push(i);
    } else {
      var half = Math.floor(MAX_BUTTONS / 2);
      var start = Math.max(1, current - half);
      var end = Math.min(totalPages, start + MAX_BUTTONS - 1);
      if (end - start < MAX_BUTTONS - 1) start = Math.max(1, end - MAX_BUTTONS + 1);
      if (start > 1) { items.push(1); if (start > 2) items.push('...'); }
      for (var j = start; j <= end; j++) items.push(j);
      if (end < totalPages) { if (end < totalPages - 1) items.push('...'); items.push(totalPages); }
    }
    return { totalPages: totalPages, items: items };
  }

  function render(){
    var m = model();
    var html = '';
    if (SHOW_TOTAL) html += '<span style="font-size:' + FONT + 'px;color:' + TEXT_COLOR + ';white-space:nowrap;margin-right:8px">共 ' + total + ' 条</span>';
    if (SHOW_PREV_NEXT) html += '<div class="${uid}-item' + (current <= 1 ? ' is-disabled' : '') + '" data-page="' + (current - 1) + '" style="' + BTN_STYLE + '">' + PREV_ICON + '</div>';
    for (var i = 0; i < m.items.length; i++) {
      var it = m.items[i];
      if (it === '...') { html += '<div class="${uid}-item ${uid}-ellipsis" style="' + BTN_STYLE + '">···</div>'; continue; }
      html += '<div class="${uid}-item' + (it === current ? ' is-active' : '') + '" data-page="' + it + '" style="' + BTN_STYLE + '">' + it + '</div>';
    }
    if (SHOW_PREV_NEXT) html += '<div class="${uid}-item' + (current >= m.totalPages ? ' is-disabled' : '') + '" data-page="' + (current + 1) + '" style="' + BTN_STYLE + '">' + NEXT_ICON + '</div>';
    if (SHOW_PAGE_SIZE) html += '<span style="font-size:' + FONT + 'px;color:' + TEXT_COLOR + ';white-space:nowrap;margin-left:4px">' + PAGE_SIZE + ' 条/页</span>';
    if (SHOW_JUMP) html += '<span style="display:flex;align-items:center;gap:4px;margin-left:4px"><span style="font-size:' + FONT + 'px;color:' + TEXT_COLOR + ';white-space:nowrap">跳至</span><input type="number" class="${uid}-jump" value="' + current + '"' + (DISABLED ? ' disabled' : '') + '/><span style="font-size:' + FONT + 'px;color:' + TEXT_COLOR + ';white-space:nowrap">页</span></span>';
    host.innerHTML = html;
    if (DISABLED) return;
    host.querySelectorAll('.${uid}-item[data-page]').forEach(function(n){
      n.addEventListener('click', function(){
        var p = parseInt(n.getAttribute('data-page'), 10);
        if (!isNaN(p)) { current = p; render(); }
      });
    });
    var jump = host.querySelector('.${uid}-jump');
    if (jump) {
      jump.addEventListener('change', function(){ current = Math.floor(Number(jump.value)) || current; render(); });
      jump.addEventListener('keydown', function(e){ if (e.key === 'Enter') { current = Math.floor(Number(jump.value)) || current; render(); } });
    }
  }

  window["__wcPg_${uid}"] = function(data){
    var t = null;
    if (Array.isArray(data)) t = data.length;
    else if (typeof data === 'number') t = data;
    else if (data && typeof data === 'object') {
      var keys = ['total','totalCount','totalElements','count'];
      for (var i = 0; i < keys.length; i++) {
        if (typeof data[keys[i]] === 'number') { t = data[keys[i]]; break; }
      }
    }
    if (t != null) total = Math.max(0, Math.floor(t));
    render();
  };
})();
</script>`;

  const loader = dataLoaderScript({
    container: `var el = document.querySelector('.${uid}-wrap');`,
    apiUrl: String(c.apiUrl ?? ""),
    apiPath: String(c.apiPath ?? ""),
    apiMethod: String(c.apiMethod ?? "GET"),
    apiHeaders: String(c.apiHeaders ?? ""),
    apiBody: String(c.apiBody ?? ""),
    apiInterval: Number(c.apiInterval ?? 0),
    apiDataPath: String(c.apiDataPath ?? ""),
    authEnabled: readAuthEnabled(c.authEnabled),
    renderBody: `if (window["__wcPg_${uid}"]) window["__wcPg_${uid}"](data);`,
  });

  return `${styleTag}${wrap("")}${fitScript}${mountScript}${loader}`;
};
