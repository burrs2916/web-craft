import type { ComponentCodegenFn } from "../types";
import { escapeHTML } from "../layout";
import { dataLoaderScript } from "../dataLoader";
import {
  collectBranchKeys,
  collectKeysByLevel,
  resolveTreeData,
  type TreeNodeModel,
} from "../../editor/data/tableData";
import { resolveTreeStyle, cssText } from "../../editor/data/tableStyle";
import { readAuthEnabled } from "../../editor/data/authMode";

/**
 * tree 树形控件 → HTML（与编辑区 TreeRenderer 结构同构）
 *
 * 状态承载铁律：展开/折叠、选中、悬浮**全部由类规则承载**，inline 只给"恒定"属性。
 *  - `.tree-<uid>-kids`       → `display:none`；`.is-open` → `display:flex`
 *  - `.tree-<uid>-arrow`      → `rotate(0)`；父级 `.is-open` → `rotate(90deg)`
 *  - `.tree-<uid>-lbl.is-sel` → 选中配色；`:hover` → 悬浮底色
 * 旧实现用 `el.querySelectorAll('.tree-text').forEach(... t.style.color=...)` 逐个改 inline，
 * 属于本仓库明令禁止的写法（inline 恒胜过类规则），且多个树实例会串扰。
 * 现在所有选择器都限定在自身 uid 容器内。
 */
export const treeCodegen: ComponentCodegenFn = (component) => {
  const c = component.config;
  const s = resolveTreeStyle(c);
  const uid = `tree-${Math.random().toString(36).slice(2, 9)}`;

  const dataMode = String(c.dataMode ?? "static");
  const isApi = dataMode === "api" && (String(c.apiUrl ?? "") || String(c.apiPath ?? ""));
  const data = isApi ? [] : resolveTreeData({ config: c });
  const expandLevel = Number(c.defaultExpandLevel ?? 99);

  const rules = [
    `.${uid}-node{display:flex;flex-direction:column;}`,
    `.${uid}-lbl{display:flex;align-items:center;gap:4px;padding:3px 6px;user-select:none;position:relative;z-index:1;}`,
    `.${uid}-lbl:not(.is-ro){cursor:pointer;}`,
    `.${uid}-lbl:not(.is-ro):not(.is-sel):hover{background-color:${s.hoverBg};}`,
    `.${uid}-lbl.is-sel{background-color:${s.activeBg};}`,
    `.${uid}-lbl.is-sel .${uid}-txt{color:${s.activeColor};}`,
    `.${uid}-arrow{flex-shrink:0;line-height:0;color:${s.iconColor};transition:transform 0.2s;transform:rotate(0deg);}`,
    `.${uid}-lbl.is-open .${uid}-arrow{transform:rotate(90deg);}`,
    `.${uid}-leaf{flex-shrink:0;line-height:0;color:${s.leafIconColor};margin-left:5px;}`,
    `.${uid}-txt{font-size:${s.fontSize}px;color:${s.textColor};line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}`,
    `.${uid}-kids{display:none;flex-direction:column;gap:${s.gap}px;}`,
    `.${uid}-kids.is-open{display:flex;}`,
    `.${uid}-line{position:absolute;width:1px;background-color:${s.lineColor};pointer-events:none;}`,
    `.${uid}-empty{color:${s.textColor};font-size:${s.fontSize}px;padding:8px;text-align:center;opacity:0.6;}`,
  ].join("");
  const styleTag = `<style>${rules}</style>`;

  const bodyStyle = cssText(s.outer);

  /** 节点 HTML 生成（TS 侧，静态模式；与 JS 侧 buildNode 逐条对应） */
  const buildNode = (node: TreeNodeModel, key: string, level: number, openKeys: Set<string>): string => {
    const hasChildren = !!(node.children && node.children.length > 0);
    const isOpen = openKeys.has(key);
    const arrow = hasChildren
      ? (s.showIcon
        ? `<span class="${uid}-arrow" style="display:inline-flex;width:16px;height:16px"><svg width="16" height="16" viewBox="0 0 24 24"><path d="M10 17l5-5-5-5z" fill="currentColor"/></svg></span>`
        : "")
      : `<span class="${uid}-leaf" style="display:inline-flex;width:6px;height:6px"><svg width="6" height="6" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="currentColor"/></svg></span>`;
    const lblSx = `margin-left:${level * s.indent}px;`
      + (s.rowHeight > 0 ? `height:${s.rowHeight}px;` : "")
      + `border-radius:${s.radius}px;`;
    const kids = hasChildren
      ? `<div class="${uid}-kids${isOpen ? " is-open" : ""}" data-kids="${key}">`
        + node.children!.map((child, i) => buildNode(child, `${key}-${i}`, level + 1, openKeys)).join("")
        + `</div>`
      : "";
    const line = s.showLine && hasChildren && isOpen
      ? `<div class="${uid}-line" style="left:${level * s.indent + 7}px;top:22px;bottom:0"></div>`
      : "";
    return `<div class="${uid}-node">${line}`
      + `<div class="${uid}-lbl${isOpen && hasChildren ? " is-open" : ""}${s.disabled ? " is-ro" : ""}" `
      + `data-key="${key}"${hasChildren ? ' data-branch="1"' : ""} style="${lblSx}">`
      + arrow
      + `<span class="${uid}-txt">${escapeHTML(node.label)}</span></div>`
      + kids
      + `</div>`;
  };

  const openKeys = new Set<string>(
    expandLevel >= 99 ? collectBranchKeys(data) : collectKeysByLevel(data, expandLevel),
  );

  const staticBody = data.length === 0
    ? `<div class="${uid}-empty">${escapeHTML(s.emptyText)}</div>`
    : `<div style="display:flex;flex-direction:column;gap:${s.gap}px">`
      + data.map((n, i) => buildNode(n, String(i), 0, openKeys)).join("")
      + `</div>`;

  /** 交互脚本（静态模式）：只切类，不改 inline */
  const interactScript = `
<script>
(function(){
  var root = document.getElementById("${uid}");
  if (!root) return;
  if (${s.disabled}) return;
  root.querySelectorAll('.${uid}-lbl').forEach(function(lbl){
    lbl.addEventListener('click', function(e){
      e.stopPropagation();
      var key = lbl.getAttribute('data-key');
      root.querySelectorAll('.${uid}-lbl.is-sel').forEach(function(x){ x.classList.remove('is-sel'); });
      lbl.classList.add('is-sel');
      if (lbl.getAttribute('data-branch') === '1') {
        var kids = root.querySelector('.${uid}-kids[data-kids="' + key + '"]');
        if (kids) kids.classList.toggle('is-open');
        lbl.classList.toggle('is-open');
      }
    });
  });
})();
</script>`;

  const bodyHTML = `<div id="${uid}" style="${bodyStyle}">${staticBody}</div>`;

  if (!isApi) return `${styleTag}${bodyHTML}${interactScript}`;

  /* ── 接口模式：运行时归一 + 重建树，随后复用同一套类规则与交互 ── */
  const renderBody = `
var FONT = ${s.fontSize};
var INDENT = ${s.indent};
var GAP = ${s.gap};
var RADIUS = ${s.radius};
var ROW_H = ${s.rowHeight};
var SHOW_ICON = ${s.showIcon};
var SHOW_LINE = ${s.showLine};
var DISABLED = ${s.disabled};
var EXPAND_LEVEL = ${expandLevel};
var EMPTY_TEXT = ${JSON.stringify(s.emptyText)};
var UID = ${JSON.stringify(uid)};

function normalize(arr){
  var out = [];
  if (!Array.isArray(arr)) return out;
  for (var i = 0; i < arr.length; i++) {
    var raw = arr[i];
    if (raw == null) continue;
    if (typeof raw === 'string' || typeof raw === 'number') { out.push({ label: String(raw) }); continue; }
    if (typeof raw !== 'object') continue;
    var lb = raw.label != null ? raw.label : (raw.title != null ? raw.title : (raw.text != null ? raw.text : raw.name));
    if (lb == null || String(lb) === '') continue;
    var node = { label: String(lb) };
    if (raw.value != null) node.value = String(raw.value);
    var kidsRaw = raw.children != null ? raw.children : (raw.nodes != null ? raw.nodes : raw.items);
    if (Array.isArray(kidsRaw)) { var kids = normalize(kidsRaw); if (kids.length) node.children = kids; }
    out.push(node);
  }
  return out;
}
function openKeysFor(nodes, level, prefix, depth){
  var keys = [];
  if (level <= 0) return keys;
  (nodes || []).forEach(function(n, i){
    var key = prefix + i;
    if (n.children && n.children.length && depth <= level) {
      keys.push(key);
      keys = keys.concat(openKeysFor(n.children, level, key + '-', depth + 1));
    }
  });
  return keys;
}
function allBranchKeys(nodes, prefix){
  var keys = [];
  (nodes || []).forEach(function(n, i){
    var key = prefix + i;
    if (n.children && n.children.length) { keys.push(key); keys = keys.concat(allBranchKeys(n.children, key + '-')); }
  });
  return keys;
}
function buildNode(node, key, level, openSet){
  var hasKids = !!(node.children && node.children.length);
  var isOpen = !!openSet[key];
  var arrow = hasKids
    ? (SHOW_ICON ? '<span class="' + UID + '-arrow" style="display:inline-flex;width:16px;height:16px"><svg width="16" height="16" viewBox="0 0 24 24"><path d="M10 17l5-5-5-5z" fill="currentColor"/></svg></span>' : '')
    : '<span class="' + UID + '-leaf" style="display:inline-flex;width:6px;height:6px"><svg width="6" height="6" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="currentColor"/></svg></span>';
  var sx = 'margin-left:' + (level * INDENT) + 'px;' + (ROW_H > 0 ? ('height:' + ROW_H + 'px;') : '') + 'border-radius:' + RADIUS + 'px;';
  var line = (SHOW_LINE && hasKids && isOpen)
    ? '<div class="' + UID + '-line" style="left:' + (level * INDENT + 7) + 'px;top:22px;bottom:0"></div>'
    : '';
  var kids = hasKids
    ? '<div class="' + UID + '-kids' + (isOpen ? ' is-open' : '') + '" data-kids="' + key + '">' + node.children.map(function(ch, i){ return buildNode(ch, key + '-' + i, level + 1, openSet); }).join('') + '</div>'
    : '';
  return '<div class="' + UID + '-node">' + line
    + '<div class="' + UID + '-lbl' + (hasKids && isOpen ? ' is-open' : '') + (DISABLED ? ' is-ro' : '') + '" data-key="' + key + '"' + (hasKids ? ' data-branch="1"' : '') + ' style="' + sx + '">'
    + arrow + '<span class="' + UID + '-txt">' + escapeHtml(node.label) + '</span></div>'
    + kids + '</div>';
}
function bind(){
  if (DISABLED) return;
  el.querySelectorAll('.' + UID + '-lbl').forEach(function(lbl){
    lbl.addEventListener('click', function(e){
      e.stopPropagation();
      var key = lbl.getAttribute('data-key');
      el.querySelectorAll('.' + UID + '-lbl.is-sel').forEach(function(x){ x.classList.remove('is-sel'); });
      lbl.classList.add('is-sel');
      if (lbl.getAttribute('data-branch') === '1') {
        var kids = el.querySelector('.'.concat(UID, '-kids[data-kids="', key, '"]'));
        if (kids) kids.classList.toggle('is-open');
        lbl.classList.toggle('is-open');
      }
    });
  });
}
var nodes = normalize(data);
if (!nodes.length) { el.innerHTML = '<div class="' + UID + '-empty">' + EMPTY_TEXT + '</div>'; return; }
var openList = EXPAND_LEVEL >= 99 ? allBranchKeys(nodes, '') : openKeysFor(nodes, EXPAND_LEVEL, '', 1);
var openSet = {};
openList.forEach(function(k){ openSet[k] = true; });
el.innerHTML = '<div style="display:flex;flex-direction:column;gap:' + GAP + 'px">' + nodes.map(function(n, i){ return buildNode(n, String(i), 0, openSet); }).join('') + '</div>';
bind();
`;

  const loader = dataLoaderScript({
    container: `var el = document.getElementById("${uid}");`,
    apiUrl: String(c.apiUrl ?? ""),
    apiPath: String(c.apiPath ?? ""),
    apiMethod: String(c.apiMethod ?? "GET"),
    apiHeaders: String(c.apiHeaders ?? ""),
    apiBody: String(c.apiBody ?? ""),
    apiInterval: Number(c.apiInterval ?? 0),
    apiDataPath: String(c.apiDataPath ?? ""),
    authEnabled: readAuthEnabled(c.authEnabled),
    renderBody,
  });

  return `${styleTag}${bodyHTML}${loader}`;
};
