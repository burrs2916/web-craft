/**
 * 数字步进（form-number）口径文件——发布端与编辑区**共用同一批函数对象**。
 *
 * 为什么收口：form-number 的「小数位格式化 + 边界收敛 + 按钮禁用态」逻辑原来在
 * codegen 脚本里手写一份（fx/up/bump）、编辑区 React 里另写一份（format/clamp/
 * decDisabled/incDisabled），且图标路径常量也重复了一份（ICON_MINUS/ICON_PLUS vs
 * MINUS_PATH/PLUS_PATH）。正是「两端必漂移」的高危模式。此文件统一为：
 *
 * 1. 三个**自包含**纯函数（不得引用本模块其它导出或任何模块作用域标识符，否则构建器
 *    重命名后 toString() 内联进产物即成未定义引用）——codegen 用 `toString()` 内联，
 *    编辑区直接 import。
 * 2. 加减图标常量（MUI 同款路径）——两端共用同一字符串，杜绝图标漂移。
 * 3. `formNumberScript` 是发布端唯一脚本来源：DOM 绑定 + 上述函数内联 + 初始值规范化。
 *
 * NaN 处理口径（P1-2 统一）：解析失败时一律按 0 处理（与发布端原 up() 行为一致），
 * 这样编辑区「用户输入乱码」与发布端「NaN→0」对按钮禁用态的判断完全一致。
 */

/** 减号图标（MUI 同款 24×24 路径） */
export const FN_MINUS_PATH = "M19 13H5v-2h14v2z";
/** 加号图标（MUI 同款 24×24 路径） */
export const FN_PLUS_PATH = "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z";

/**
 * 小数位格式化（自包含）：precision>0 按位 toFixed，否则取整。
 * 与编辑区/发布端原实现同口径，抽成唯一来源防止漂移。
 */
export function fnFormat(value: unknown, precision: number): string {
  var n = Number(value);
  if (!(n >= 0) && !(n < 0)) return ""; // NaN/Infinity → 空串（与原编辑区 format 一致）
  var p = Math.max(0, Math.min(10, Math.floor(Number(precision) || 0)));
  return p > 0 ? n.toFixed(p) : String(Math.round(n));
}

/**
 * 边界收敛（自包含）：min/max 为 null 表示不限制。
 */
export function fnClamp(value: number, min: number | null, max: number | null): number {
  var n = Number(value);
  if (!(n >= 0) && !(n < 0)) n = 0;
  var lo = min == null ? -Infinity : Number(min);
  var hi = max == null ? Infinity : Number(max);
  return Math.min(hi, Math.max(lo, n));
}

/**
 * 按钮禁用态（自包含）：解析失败一律按 0 处理（P1-2 统一口径）。
 * 返回 [decDisabled, incDisabled]。
 */
export function fnEdge(value: unknown, min: number | null, max: number | null): [boolean, boolean] {
  var n = Number(value);
  if (!(n >= 0) && !(n < 0)) n = 0; // NaN/乱码 → 0（与发布端 up() 一致）
  var lo = min == null ? -Infinity : Number(min);
  var hi = max == null ? Infinity : Number(max);
  var dec = lo > -Infinity && n <= lo;
  var inc = hi < Infinity && n >= hi;
  return [dec, inc];
}

/** 发布端运行时脚本配置（进 <script> 的 JSON，只含步进口径，不含样式）。 */
export interface NumberFieldCfg {
  min: number | null;
  max: number | null;
  step: number;
  precision: number;
  disabled: boolean;
}

/**
 * 发布端唯一脚本来源：初始值规范化（P0-2）+ 边界禁用 + 实时校验联动 + 步进。
 * 三个纯函数以 `toString()` 内联（两端同源）。
 *
 * 依赖的 DOM 结构（formNumberCodegen 保证）：
 * - `#${uid}`           数字 input（type=number）
 * - 其 parentElement    步进行容器（含 data-num-dec / data-num-inc 按钮）
 */
export function formNumberScript(uid: string, cfg: NumberFieldCfg): string {
  const cfgJson = JSON.stringify({
    min: cfg.min == null ? null : Number(cfg.min),
    max: cfg.max == null ? null : Number(cfg.max),
    step: Number(cfg.step) || 1,
    P: Math.max(0, Math.min(10, Math.floor(Number(cfg.precision) || 0))),
    dis: cfg.disabled === true,
  }).replace(/</g, "\\u003c");
  return `<script>;(function(){
var i=document.getElementById('${uid}');if(!i)return;
var row=i.parentElement;if(!row)return;
var d=row.querySelector('[data-num-dec]'),n=row.querySelector('[data-num-inc]');
var fmt=(${fnFormat.toString()});
var clamp=(${fnClamp.toString()});
var edge=(${fnEdge.toString()});
var CFG=${cfgJson};
function P(){return CFG.P;}
function mn(){return CFG.min==null?-Infinity:CFG.min;}
function mx(){return CFG.max==null?Infinity:CFG.max;}
function up(){var e=edge(i.value,CFG.min,CFG.max);if(d)d.disabled=e[0];if(n)n.disabled=e[1];}
function bump(delta){var v=parseFloat(i.value);if(!(v>=0)&&!(v<0))v=0;var st=CFG.step||1;i.value=fmt(clamp(v+delta*st,CFG.min,CFG.max),CFG.P);up();i.dispatchEvent(new Event('input',{bubbles:true}));}
// P2：长按连击（pointer 优先，键盘 Enter/Space 也触发；单次点按只 bump 一次，不与原生 click 双发）
function bind(btn,delta){
  if(!btn)return;
  var timer=null, repeating=false;
  function begin(){ if(btn.disabled)return; if(timer)return; repeating=false; bump(delta); timer=setTimeout(function(){repeating=true; timer=setInterval(function(){bump(delta);},150);},400); }
  function end(){ if(timer){clearTimeout(timer);clearInterval(timer);timer=null;} }
  function key(e){ if(e.key==='Enter'||e.key===' '||e.key==='Spacebar'){e.preventDefault();bump(delta);} }
  var hasPE=(typeof window!=='undefined')&&!!(window&&window.PointerEvent);
  if(hasPE){
    btn.addEventListener('pointerdown',begin);
    btn.addEventListener('pointerup',end);
    btn.addEventListener('pointerleave',end);
    btn.addEventListener('pointercancel',end);
  } else {
    btn.addEventListener('mousedown',begin);
    btn.addEventListener('touchstart',begin,{passive:true});
    ['mouseup','mouseleave','mousecancel','touchend','touchcancel'].forEach(function(ev){btn.addEventListener(ev,end);});
  }
  btn.addEventListener('keydown',key);
}
bind(d,-1);
bind(n,1);
i.addEventListener('input',up);
i.addEventListener('change',function(){var v=parseFloat(i.value);if(!(v>=0)&&!(v<0))return;var c=clamp(v,CFG.min,CFG.max);var f=fmt(c,CFG.P);if(f!==i.value)i.value=f;up();});
// P0-2：初始值规范化（仅当存在有限初始值；空值保持空，NaN 走 edge→0）
(function(){var raw=i.value;var num=parseFloat(raw);if(raw!==''&&!(num>=0)&&!(num<0))return;if(raw==='')return;i.value=fmt(clamp(num,CFG.min,CFG.max),CFG.P);})();
up();
})();</script>`;
}
