/**
 * 抽屉切换共享逻辑
 *
 * 与 modalSwitcher 类似，但抽屉从四边滑动出现（translateX/Y）。
 *
 * DOM 结构（overlay 和 content 为兄弟节点）：
 *   <div data-drawer-id="xxx" data-drawer-open="false" data-drawer-direction="right">
 *     <div data-drawer-overlay>   ← 遮罩层（fixed 覆盖视口）
 *     <div data-drawer-content>  ← 内容框（fixed 按方向定位 + translateX/Y 动画）
 *
 * 核心操作：
 * - openDrawer(drawerId)：显示遮罩 + content 滑入（按 direction 设置 transform 到 translate(0)）
 * - closeDrawer(drawerId)：content 滑出 + 延迟隐藏遮罩
 * - 点击遮罩层关闭、ESC 关闭
 * - 按钮交互：data-drawer-action="ok|cancel|submit"
 *   - ok / cancel → 关闭抽屉
 *   - submit → 校验必填字段 → 收集表单数据 → 关闭
 */

/**
 * 获取抽屉的初始 transform（关闭状态，根据方向）
 */
function getInitialTransform(direction: string): string {
  switch (direction) {
    case "left": return "translateX(-100%)";
    case "top": return "translateY(-100%)";
    case "bottom": return "translateY(100%)";
    default: return "translateX(100%)"; // right
  }
}

/**
 * 打开指定抽屉（编辑器预览模式用）
 */
export function openDrawer(drawerId: string): void {
  const drawer = document.querySelector(`[data-drawer-id="${drawerId}"]`);
  if (!drawer) return;
  const overlay = drawer.querySelector("[data-drawer-overlay]") as HTMLElement | null;
  const content = drawer.querySelector("[data-drawer-content]") as HTMLElement | null;
  const direction = drawer.getAttribute("data-drawer-direction") || "right";

  if (overlay) overlay.style.display = "block";
  if (content) {
    content.style.display = "flex";
    // 先设置初始位置，下一帧再滑入（让浏览器有机会渲染初始状态）
    content.style.transform = getInitialTransform(direction);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        content.style.transform = "translateX(0) translateY(0)";
      });
    });
  }
  drawer.setAttribute("data-drawer-open", "true");
}

/**
 * 关闭指定抽屉（编辑器预览模式用）
 */
export function closeDrawer(drawerId: string): void {
  const drawer = document.querySelector(`[data-drawer-id="${drawerId}"]`);
  if (!drawer) return;
  const overlay = drawer.querySelector("[data-drawer-overlay]") as HTMLElement | null;
  const content = drawer.querySelector("[data-drawer-content]") as HTMLElement | null;
  const direction = drawer.getAttribute("data-drawer-direction") || "right";

  if (content) {
    content.style.transform = getInitialTransform(direction);
  }
  setTimeout(() => {
    if (overlay) overlay.style.display = "none";
    if (content) content.style.display = "none";
  }, 300);
  drawer.setAttribute("data-drawer-open", "false");
}

/**
 * 生成 codegen 注入用抽屉交互脚本字符串。
 *
 * 功能：
 * 1. 点击 [data-drawer-link] → 打开对应 [data-drawer-id]
 * 2. 点击 [data-drawer-close] 或 [data-drawer-overlay] → 关闭
 *    - 若 close 按钮有 data-drawer-action="submit"，先校验必填字段再收集表单数据
 * 3. ESC 键关闭当前打开的 drawer
 * 4. 按方向控制滑动动画（translateX/Y 从 ±100% → 0）
 *
 * @returns 自执行函数脚本字符串，带幂等守卫 __wcDrawerInit
 */
export function buildDrawerSwitcherScript(): string {
  return `// web-craft drawer switcher
(function(){if(window.__wcDrawerInit)return;window.__wcDrawerInit=true;
function getInitialTransform(dir){switch(dir){case 'left':return 'translateX(-100%)';case 'top':return 'translateY(-100%)';case 'bottom':return 'translateY(100%)';default:return 'translateX(100%)'}}
function openDrawer(drawerId){var drawer=document.querySelector('[data-drawer-id="'+drawerId+'"]');if(!drawer)return;var overlay=drawer.querySelector('[data-drawer-overlay]');var content=drawer.querySelector('[data-drawer-content]');var dir=drawer.getAttribute('data-drawer-direction')||'right';if(overlay)overlay.style.display='block';if(content){content.style.display='flex';content.style.transform=getInitialTransform(dir);requestAnimationFrame(function(){requestAnimationFrame(function(){content.style.transform='translateX(0) translateY(0)'})})}drawer.setAttribute('data-drawer-open','true')}
function closeDrawer(drawerId){var drawer=document.querySelector('[data-drawer-id="'+drawerId+'"]');if(!drawer)return;var overlay=drawer.querySelector('[data-drawer-overlay]');var content=drawer.querySelector('[data-drawer-content]');var dir=drawer.getAttribute('data-drawer-direction')||'right';if(content){content.style.transform=getInitialTransform(dir)}setTimeout(function(){if(overlay)overlay.style.display='none';if(content)content.style.display='none'},300);drawer.setAttribute('data-drawer-open','false')}
function validateAndCollect(drawer){var fields=drawer.querySelectorAll('[data-drawer-field]');var data={};var valid=true;for(var i=0;i<fields.length;i++){var f=fields[i];var name=f.getAttribute('name')||'';if(!name)continue;if(f.type==='checkbox'){data[name]=f.checked;continue}var val=f.value||'';if(f.hasAttribute('required')&&!val.trim()){valid=false;f.style.borderColor='#f44'}else{f.style.borderColor=''}data[name]=val}return valid?data:null}
document.addEventListener('click',function(e){
var link=e.target.closest('[data-drawer-link]');if(link){e.preventDefault();var did=link.getAttribute('data-drawer-link');if(did)openDrawer(did);return}
var closeBtn=e.target.closest('[data-drawer-close]');if(closeBtn){var drawer=closeBtn.closest('[data-drawer-id]');if(!drawer)return;var did=drawer.getAttribute('data-drawer-id');if(!did)return;
var action=closeBtn.getAttribute('data-drawer-action');
if(action==='submit'){var result=validateAndCollect(drawer);if(!result){e.preventDefault();return}try{var ev=new CustomEvent('wc-drawer-submit',{detail:{drawerId:did,data:result}});document.dispatchEvent(ev)}catch(err){}}
else if(action==='ok'){try{var ev=new CustomEvent('wc-drawer-ok',{detail:{drawerId:did}});document.dispatchEvent(ev)}catch(err){}}
else if(action==='cancel'){try{var ev=new CustomEvent('wc-drawer-cancel',{detail:{drawerId:did}});document.dispatchEvent(ev)}catch(err){}}
closeDrawer(did);return}
var overlay=e.target.closest('[data-drawer-overlay]');if(overlay){var drawer=overlay.closest('[data-drawer-id]');if(drawer){var did=drawer.getAttribute('data-drawer-id');if(did)closeDrawer(did)}return}})
document.addEventListener('keydown',function(e){if(e.key==='Escape'){var open=document.querySelector('[data-drawer-open="true"]');if(open){var did=open.getAttribute('data-drawer-id');if(did)closeDrawer(did)}}})})();`;
}
