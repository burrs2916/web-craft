import type { ComponentCodegenFn, CodegenContext } from "../types";
import { escapeHTML } from "../layout";
import { dataLoaderScript } from "../dataLoader";
import { resolveEffectiveDataConfig } from "../../shared/resolveDataConfig";
import { MUI_FONT, POPUP_RADIUS_CSS, resolveFieldStyle } from "../../editor/data/fieldStyle";
import { withAlpha, contrastTextOn } from "../../editor/data/colorValue";
import { fieldShellHTML, validationHTML } from "../fieldChrome";
import { readAuthEnabled } from "../../editor/data/authMode";
import { fieldScaleFactor } from "../../editor/data/scaleFit";
import {
  parseCascaderStaticOptions,
  parseCascaderValue,
  findCascaderPath,
  cascaderDisplay,
  cascaderSubmitValue,
  normalizeCascaderTree,
  type CascaderOption,
  type CascaderSubmitMode,
} from "../../editor/data/cascaderOptions";

/** MUI 复刻图标 path（Material Icons 原路径，勿改） */
const ICON_ARROW_DROP = "M7 10l5 5 5-5z";
const ICON_ARROW_RIGHT = "M10 17l5-5-5-5z";
const ICON_CHECK = "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z";
const ICON_CLOSE =
  "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z";

/** 与编辑区 `CascaderRenderer` 的 EASE 同值：两端的过渡/动画曲线必须一致 */
const EASE = "cubic-bezier(0, 0, 0.2, 1)";

/**
 * 内联进 `<script>` 的 JSON —— `JSON.stringify` **不转义 `<`**，值里出现 `</script>`
 * 会提前闭合脚本标签（选项文案、占位符、分隔符都可能带这个子串）。
 * 与 `fieldChrome.ts` 的 `validationHTML` 同一范式；改这里要同步那边的写法。
 */
const jsJson = (v: unknown): string => JSON.stringify(v).replace(/</g, "\\u003c");

/**
 * form-cascader（级联选择）→ HTML
 *
 * 与表单族同口径（`resolveFieldStyle` + `fieldShellHTML`）：顶部标签 / 左上角悬浮徽章、
 * 边框环（borderWidth 可控、聚焦改色）、帮助文字、实时校验。
 *
 * 结构性问题与约定：
 * 1. **参与表单提交**：隐藏 `<input name>` 承载选中值（末级值 / 取值路径 / 显示名路径三选一），
 *    同时充当校验载体（`__WCVALIDATE` 读 `f.value`，故「必填」真正生效）。
 * 2. **无硬编码暗色**：弹层与文字全部由面板配置派生。
 * 3. **三种数据接入**：静态 JSON / 缩进文本、接口读取（认证 Token 注入 + 请求头 + 路径映射 + 轮询）、
 *    绑定全局数据源，与下拉选择 / 列表 / 表格完全同源。
 * 4. **选项解析零第二份实现**：静态走 `parseCascaderStaticOptions`；接口响应的归一**内联
 *    `normalizeCascaderTree.toString()`**（编辑区 `parseCascaderApiOptions` 用的同一函数）——
 *    旧实现发布端自写 `__norm`，闭包引用外层字段名且**漏了空项过滤**，同一响应会得出
 *    「编辑区 1 项、发布页 2 项」。
 * 5. **键盘可达（combobox + listbox 模式）**：焦点恒留在触发器上，靠 `aria-activedescendant`
 *    指向光标选项 → 方向键 / Home / End / Enter / Escape 全可用；面板与选项分别带
 *    `role=listbox` / `role=option` + `aria-selected`。
 * 6. **开合状态必须成对**：`build()` 置 `aria-expanded=true` + `aria-controls`，
 *    `close()` 必须复位（旧实现只置不复位 → 关闭后永久谎报展开）。
 * 7. **弹层选项行四态可分**（悬浮 / 已选 / 键盘光标 / 空态），与编辑区 `CascaderRenderer` 逐项同构：
 *    悬浮=浅 accent 底、已选=满 accent 底 + 对勾 + 加粗、光标=浅底 + 内侧焦点环、无选项=「暂无数据」。
 *    颜色换算走 `editor/data/colorValue`（`withAlpha` / `contrastTextOn`），两端同一份实现。
 *    状态规则**声明顺序即优先级**，勿重排。
 */
export const cascaderCodegen: ComponentCodegenFn = (component, ctx: CodegenContext) => {
  const c = component.config as Record<string, unknown>;

  // 字段型「文字随框缩放」：与 date/time 同范式 —— 只乘字号、不碰几何（默认关、零回归）
  const fitF = fieldScaleFactor(
    "form-cascader",
    component.transform.width,
    component.transform.height,
    c.scaleFit === true,
  );
  const s0 = resolveFieldStyle(c);
  const s = { ...s0, fontSize: s0.fontSize * fitF, labelFontSize: s0.labelFontSize * fitF };

  // ── 数据源解析：绑定全局源时以全局源覆盖组件自带取数配置（与编辑端同一函数） ──
  const dsId = String(c.dataSourceId ?? "");
  const gds = ctx.globalDataSources as Record<string, unknown> | undefined;
  const boundSource = dsId && gds ? (gds[dsId] as Record<string, unknown>) : undefined;
  const eff: Record<string, unknown> = boundSource
    ? (resolveEffectiveDataConfig(c, boundSource) as Record<string, unknown>)
    : c;
  // 与编辑区 `CascaderRenderer` 逐字同判定（含绑定全局源这一通道）。旧实现少一个 `dsId ||`，
  // 在「源为 api 型但 url/path 皆空」时与编辑区分叉（编辑区判 api → 空、发布端判 static → 出示例树）。
  const isApi =
    String(eff.dataMode ?? "static") === "api" &&
    Boolean(dsId || eff.apiUrl || eff.apiPath);
  // 三态透传：true=注入认证 Token，false=不注入，null/未设=跟随站点全局认证态。
  // 必须原样传给取数骨架，**不可压成布尔** —— 编辑区 useApiDataFetch 传的就是三态，
  // 压成 false 会让「未配置」在发布端变成「明确禁用」，非认证站点与认证站点的行为就此分叉。
  const authEnabled = readAuthEnabled(eff.authEnabled);

  const accent = String(c.accentColor ?? "#1976d2");
  const placeholder = String(c.placeholder ?? "请选择");
  const showPath = c.showPath !== false;
  const separator = String(c.separator ?? " / ");
  const submitMode: CascaderSubmitMode = (["leaf", "path", "labelPath"] as const).includes(
    String(c.submitMode ?? "leaf") as CascaderSubmitMode,
  )
    ? (String(c.submitMode ?? "leaf") as CascaderSubmitMode)
    : "leaf";
  const valueField = String(c.apiValueField ?? "value");
  const labelField = String(c.apiLabelField ?? "label");
  const childrenField = String(c.apiChildrenField ?? "children");
  const clearable = c.clearable === true && !s.disabled;
  const va = validationHTML(c);
  const uid = "cas-" + Math.random().toString(36).slice(2, 9);

  const options: CascaderOption[] = isApi ? [] : parseCascaderStaticOptions(c.options);
  const values = parseCascaderValue(c.value);

  const selectedPath = findCascaderPath(options, values);
  const initialDisplay = selectedPath.length
    ? cascaderDisplay(selectedPath, showPath, separator)
    : (isApi ? placeholder : "");
  const initialSubmit = cascaderSubmitValue(selectedPath, submitMode, separator);

  // 触发器：flex 撑满字段层（拖动缩放设计盒即随之放大/缩小），与 input 系列的几何语义一致
  const padX = 12;
  const triggerStyles = [
    "flex:1 1 auto", "min-width:0", "width:100%", "height:100%", "box-sizing:border-box",
    "display:flex", "align-items:center", "gap:6px",
    `padding:0 ${padX}px`,
    `background:${s.bgColor}`, `color:${s.textColor}`,
    `border-radius:${s.radiusCss}`,
    `font-family:${MUI_FONT}`, `font-size:${s.fontSize}px`, `font-weight:${s.fontWeight}`,
    `cursor:${s.disabled ? "not-allowed" : "pointer"}`,
    "outline:none",
    "user-select:none",
  ];

  const fieldName =
    String(c.fieldName ?? "").trim() ||
    String(c.label ?? "").trim().replace(/\s+/g, "_").replace(/[^\p{L}\p{N}_\-]/gu, "_").replace(/^_+|_+$/g, "") ||
    "cascader";
  // 无障碍名：标签 → 字段名 → 组件名，保证 combobox 恒有可读名称
  const ariaLabel = String(c.label ?? "").trim() || String(c.fieldName ?? "").trim() || "级联选择";

  const arrowIcon = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="${ICON_ARROW_DROP}"/></svg>`;
  const closeIcon = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="${ICON_CLOSE}"/></svg>`;

  let control = `<div class="cas-trigger" id="${uid}t" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-label="${escapeHTML(ariaLabel)}" tabindex="${s.disabled ? "-1" : "0"}" style="${triggerStyles.join(";")}">`;
  control += `<span class="cas-lb" id="${uid}l" style="flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap${initialDisplay ? "" : ";opacity:.5"}">${escapeHTML(initialDisplay || placeholder)}</span>`;
  if (clearable) {
    // ⚠️ `opacity` 是状态属性（`:hover` 要改它）→ **只能由类规则给**：写 inline 会把
    // `.cas-clr:hover{opacity:.9}` 永久压死（inline 恒胜过任何非 !important 的样式表规则）。
    // `display` 由脚本切换、无类规则竞争，故仍可 inline。
    control += `<span class="cas-clr" id="${uid}c" role="button" aria-label="清空" style="flex-shrink:0;display:${initialDisplay ? "flex" : "none"}">${closeIcon}</span>`;
  }
  control += `<span class="cas-arw" style="flex-shrink:0;display:flex;opacity:.6;transition:transform .2s ${EASE}">${arrowIcon}</span>`;
  control += `<input type="hidden" id="${uid}" name="${escapeHTML(fieldName)}" value="${escapeHTML(initialSubmit)}">`;
  control += `</div>`;

  const extraCss =
    `.${uid}.cas-open .cas-arw{transform:rotate(180deg)}` +
    // 清空键：基础透明度与 hover 都在类规则里（inline 会压死 hover）
    `.${uid} .cas-clr{opacity:.55;cursor:${s.disabled ? "default" : "pointer"}}` +
    `.${uid} .cas-clr:hover{opacity:.9}` +
    // 焦点可见：触发器可用键盘聚焦，必须有可见焦点环
    `#${uid}t:focus-visible{outline:2px solid ${accent};outline-offset:2px}` +
    // 弹层进场：与编辑区 sx 里的 @keyframes casIn 同名同参数（.12s 淡入 + 上移 4px）
    `@keyframes casIn{from{opacity:0;transform:translateY(-4px)}}` +
    // 弹层随组件一起缩放（DOM 弹层不走 OS 原生绘制，无需逃逸 transform），锚点在触发器下沿
    `.cas-panel-${uid}{position:absolute;top:100%;left:0;margin-top:4px;z-index:2147483000;display:flex;` +
    `background:${s.bgColor};border:1px solid ${s.borderColor};border-radius:${POPUP_RADIUS_CSS};overflow:hidden;` +
    `box-shadow:0 6px 24px rgba(0,0,0,.28);font-family:${MUI_FONT};box-sizing:border-box;` +
    `animation:casIn .12s ${EASE}}` +
    // 列：细滚动条（系统默认滚动条在 Windows 上是粗灰条，破坏浮层观感）
    `.cas-panel-${uid} .cas-menu{min-width:140px;max-height:220px;overflow-y:auto;` +
    `scrollbar-width:thin;scrollbar-color:${withAlpha(s.textColor, 0.25)} transparent}` +
    `.cas-panel-${uid} .cas-menu::-webkit-scrollbar{width:6px}` +
    `.cas-panel-${uid} .cas-menu::-webkit-scrollbar-thumb{background:${withAlpha(s.textColor, 0.25)};border-radius:3px}` +
    `.cas-panel-${uid} .cas-menu::-webkit-scrollbar-track{background:transparent}` +
    // 深层列：极浅底色 + 半透明分线，用来区分层级。
    // 旧实现分线直接用 borderColor（与浮层自身边框同色），压根看不出哪层是哪层。
    `.cas-panel-${uid} .cas-menu+.cas-menu{border-left:1px solid ${withAlpha(s.borderColor, 0.6)};` +
    `background:${withAlpha(s.textColor, 0.04)}}` +
    // 空态：与编辑区同款（旧实现是 0 列空框，这里只有 2px、编辑区却有 140px，两端形态还不一致）
    `.cas-panel-${uid} .cas-empty{min-width:140px;padding:6px 12px;color:${withAlpha(s.textColor, 0.45)};` +
    `font-size:${s.fontSize}px;white-space:nowrap;cursor:default;user-select:none}` +
    // 行：**基础态不给 background**，悬浮态才有干净的落点
    `.cas-panel-${uid} .cas-item{display:flex;align-items:center;justify-content:space-between;gap:6px;` +
    `padding:6px 12px;cursor:pointer;font-size:${s.fontSize}px;color:${s.textColor};white-space:nowrap;user-select:none}` +
    `.cas-panel-${uid} .cas-lbl{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}` +
    // 对勾占位恒存在（只切 opacity），避免选中/未选中之间文字左右跳
    // 挂在行下（`.cas-item .cas-chk`），与编辑区 `"& .cas-chk"` 同一层级语义
    `.cas-panel-${uid} .cas-item .cas-chk{display:flex;flex-shrink:0;width:14px;opacity:0}` +
    `.cas-panel-${uid} .cas-item.cas-active .cas-chk{opacity:1}` +
    // ↓ 状态规则：**声明顺序即优先级**（同特异性时后写的赢），勿重排。
    // 旧实现把三种状态合并成同一种满色高亮：「已选」与「鼠标悬停」长得一模一样，
    // 分不清「这是我选的值」还是「鼠标正好压在这」；浅色 accent 上的白字更只有 1.6:1。
    `.cas-panel-${uid} .cas-item:hover{background:${withAlpha(accent, 0.1)}}` +
    `.cas-panel-${uid} .cas-item.cas-cursor{background:${withAlpha(accent, 0.12)};` +
    `outline:2px solid ${accent};outline-offset:-2px}` +
    `.cas-panel-${uid} .cas-item.cas-active{background:${accent};color:${contrastTextOn(accent)};font-weight:500}` +
    // 已选同时是光标：底色不动，只把环换成与底色对比的颜色，否则环被底色吃掉
    `.cas-panel-${uid} .cas-item.cas-active.cas-cursor{outline:2px solid ${contrastTextOn(accent)};outline-offset:-2px}`;

  // ── 运行时：面板构建 / 选中同步 / 提交值写入 / 清空 / 键盘导航与外部点击关闭 ──
  const script = `<script>;(function(){
var W=document.getElementById('${uid}t');if(!W)return;
var wrap=W.parentElement,lb=document.getElementById('${uid}l'),inp=document.getElementById('${uid}'),clr=document.getElementById('${uid}c');
var showPath=${jsJson(showPath)},sep=${jsJson(separator)},ph=${jsJson(placeholder)};
var submitMode=${jsJson(submitMode)},disabled=${s.disabled},menuIcon=${jsJson(ICON_ARROW_RIGHT)},checkIcon=${jsJson(ICON_CHECK)};
var options=${jsJson(options)},selected=${jsJson(values)};
var active=selected.slice(),panel=null,curL=0,curI=0;
function fp(opts,vals){var r=[],cur=opts;for(var i=0;i<vals.length;i++){var f=null;for(var j=0;j<cur.length;j++){if(cur[j].value===vals[i]){f=cur[j];break;}}if(!f)break;r.push(f);cur=f.children||[];}return r;}
function display(){var p=fp(options,selected);if(!p.length)return '';return showPath?p.map(function(o){return o.label;}).join(sep):p[p.length-1].label;}
function submitValue(){var p=fp(options,selected);if(!p.length)return '';
  if(submitMode==='path')return p.map(function(o){return o.value;}).join(sep);
  if(submitMode==='labelPath')return p.map(function(o){return o.label;}).join(sep);
  return p[p.length-1].value;}
function sync(){var d=display();lb.textContent=d||ph;lb.style.opacity=d?'1':'.5';if(clr)clr.style.display=d?'flex':'none';inp.value=submitValue();inp.dispatchEvent(new Event('change',{bubbles:true}));}
function levelOptions(level){if(level===0)return options;var p=fp(options,active.slice(0,level));var last=p[p.length-1];return last?(last.children||[]):[];}
function paintCursor(){
  if(!panel)return;
  var all=panel.querySelectorAll('.cas-item');
  for(var i=0;i<all.length;i++)all[i].classList.remove('cas-cursor');
  var el=panel.querySelector('[data-lv="'+curL+'"][data-oi="'+curI+'"]');
  if(el){el.classList.add('cas-cursor');W.setAttribute('aria-activedescendant',el.id);}
  else{W.removeAttribute('aria-activedescendant');}
}
function close(){
  if(panel){panel.remove();panel=null;}
  wrap.classList.remove('cas-open');
  active=selected.slice();curL=0;curI=0;
  W.setAttribute('aria-expanded','false');
  W.removeAttribute('aria-controls');
  W.removeAttribute('aria-activedescendant');
}
function build(){
  if(panel){panel.remove();panel=null;}
  panel=document.createElement('div');panel.className='cas-panel-${uid}';panel.id='${uid}p';
  panel.setAttribute('role','listbox');
  var levels=[],n=active.length;for(var i=0;i<=n;i++)levels.push(i);
  for(var li=0;li<levels.length;li++){
    var opts=levelOptions(levels[li]);if(!opts.length)continue;
    var menu=document.createElement('div');menu.className='cas-menu';
    for(var oi=0;oi<opts.length;oi++){(function(o,level,idx){
      var on=(active[level]===o.value);
      var it=document.createElement('div');
      it.className='cas-item'+(on?' cas-active':'');
      it.id='${uid}o'+level+'_'+idx;
      it.setAttribute('role','option');
      it.setAttribute('aria-selected',on?'true':'false');
      it.setAttribute('data-lv',level);it.setAttribute('data-oi',idx);
      // 对勾占位：恒存在、只由 .cas-active .cas-chk 切 opacity，避免选中/未选中之间文字左右跳
      var ck=document.createElement('span');ck.className='cas-chk';
      ck.innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="'+checkIcon+'"/></svg>';
      it.appendChild(ck);
      var t=document.createElement('span');t.className='cas-lbl';t.textContent=o.label;it.appendChild(t);
      if(o.children&&o.children.length){var a=document.createElement('span');a.style.display='flex';a.innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="'+menuIcon+'"/></svg>';it.appendChild(a);}
      it.onmouseenter=function(){
        if(disabled)return;
        if(!o.children||!o.children.length)return;
        if(active[level]===o.value)return;
        active=active.slice(0,level);active[level]=o.value;build();
      };
      it.onclick=function(e){e.stopPropagation();active=active.slice(0,level);active[level]=o.value;
        if(!o.children||!o.children.length){selected=active.slice();sync();close();}
        else{curL=level+1;curI=0;build();}};
      menu.appendChild(it);
    })(opts[oi],levels[li],oi);}
    panel.appendChild(menu);
  }
  // 无选项（静态未填 / 接口数据未到达）：给一列空态提示，而不是留一个 0 列空框。
  // 旧行为是 append 一个只有边框的空 panel（约 2px 细条），而编辑区是 140px 宽的幽灵条 —— 两端形态还不一致，
  // 且键盘打开时用户会以为「按了没反应」。
  if(!panel.querySelector('.cas-menu')){
    var em=document.createElement('div');em.className='cas-empty';em.textContent='暂无数据';panel.appendChild(em);
  }
  wrap.appendChild(panel);wrap.classList.add('cas-open');
  W.setAttribute('aria-expanded','true');
  W.setAttribute('aria-controls',panel.id);
  paintCursor();
}
if(!disabled){
  W.addEventListener('click',function(e){if(clr&&clr.contains(e.target))return;e.stopPropagation();if(panel){close();}else{active=selected.slice();curL=0;curI=0;build();}});
  W.addEventListener('keydown',function(e){
    var k=e.key;
    if(!panel){
      if(k==='Enter'||k===' '||k==='ArrowDown'){e.preventDefault();active=selected.slice();curL=0;curI=0;build();}
      else if(k==='Escape'){close();}
      return;
    }
    if(k==='Escape'){e.preventDefault();close();return;}
    if(k==='Tab'){close();return;}
    if(k==='ArrowDown'||k==='ArrowUp'){
      e.preventDefault();
      var n1=levelOptions(curL).length;if(!n1)return;
      curI=(k==='ArrowDown')?(curI+1)%n1:(curI-1+n1)%n1;paintCursor();return;
    }
    if(k==='Home'||k==='End'){
      e.preventDefault();
      var n2=levelOptions(curL).length;if(!n2)return;
      curI=(k==='Home')?0:(n2-1);paintCursor();return;
    }
    if(k==='ArrowRight'){
      e.preventDefault();
      var o1=levelOptions(curL)[curI];
      if(!o1||!o1.children||!o1.children.length)return;
      active=active.slice(0,curL);active[curL]=o1.value;curL=curL+1;curI=0;build();return;
    }
    if(k==='ArrowLeft'){
      e.preventDefault();
      if(curL<=0)return;
      curL=curL-1;curI=0;build();return;
    }
    if(k==='Enter'||k===' '){
      e.preventDefault();
      var o2=levelOptions(curL)[curI];if(!o2)return;
      active=active.slice(0,curL);active[curL]=o2.value;
      if(!o2.children||!o2.children.length){selected=active.slice();sync();close();}
      else{curL=curL+1;curI=0;build();}
      return;
    }
  });
  if(clr)clr.addEventListener('click',function(e){e.stopPropagation();selected=[];active=[];sync();close();});
  document.addEventListener('mousedown',function(e){if(panel&&!panel.contains(e.target)&&!W.contains(e.target)){close();}});
  window.addEventListener('resize',close);window.addEventListener('scroll',close,true);
}
// 接口模式：数据到达后替换选项树并重同步（供下方取数脚本回调）
window['__wcCasOpts_${uid}']=function(tree){if(!tree||!tree.length)return;options=tree;
  var p=fp(options,selected);if(!p.length)selected=[];active=selected.slice();curL=0;curI=0;sync();if(panel)build();};
sync();
})();</script>`;

  // ── 接口取数：复用统一骨架（认证 Token / 请求头 / 路径映射 / 轮询 / 全局数据源绑定都在这层）──
  // 响应归一**直接内联口径函数源码**（编辑区 parseCascaderApiOptions 用的同一实现）：
  // 旧实现自写 `__norm`（闭包引用外层 vf/lf/cf 且漏了空项过滤）→ 同一响应两端选项数不同。
  const apiScript = isApi
    ? dataLoaderScript({
        container: `var el=document.getElementById('${uid}t');`,
        apiUrl: String(eff.apiUrl ?? ""),
        apiPath: String(eff.apiPath ?? ""),
        apiMethod: String(eff.apiMethod ?? "GET"),
        apiHeaders: typeof eff.apiHeaders === "string" ? eff.apiHeaders : JSON.stringify(eff.apiHeaders ?? {}),
        apiBody: typeof eff.apiBody === "string" ? eff.apiBody : JSON.stringify(eff.apiBody ?? {}),
        apiInterval: Number(eff.apiInterval ?? 0) || 0,
        apiDataPath: String(eff.apiDataPath ?? ""),
        authEnabled,
        renderBody: [
          `var vf=${jsJson(valueField)},lf=${jsJson(labelField)},cf=${jsJson(childrenField)};`,
          // 自包含口径（不得引用模块作用域标识符）：真正同源，且自带空项过滤
          `var __treeOf=${normalizeCascaderTree.toString()};`,
          `var src = Array.isArray(data) ? data : ((data && (data.items || data.list || data.children || data.data)) || []);`,
          `var tree = __treeOf(src, vf, lf, cf);`,
          `if (tree.length && typeof window['__wcCasOpts_${uid}'] === 'function') { window['__wcCasOpts_${uid}'](tree); }`,
        ].join("\n"),
      })
    : "";

  return fieldShellHTML({ uid, s, va, ctx, control, extraCss }) + script + apiScript;
};
