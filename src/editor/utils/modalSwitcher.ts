/**
 * 弹出框切换共享逻辑
 *
 * 编辑器渲染器(Sidebar/Navbar/按钮)和 codegen 注入脚本三方共用，
 * 保证同一套弹出/关闭逻辑在编辑预览和发布产物中行为一致。
 *
 * DOM 结构（overlay 和 content 为兄弟节点）：
 *   <div data-modal-id="xxx" data-modal-open="false">
 *     <div data-modal-overlay>   ← 遮罩层（fixed 覆盖视口）
 *     <div data-modal-content>  ← 内容框（absolute 跟随组件位置）
 *
 * 核心操作：
 * - openModal(modalId)：显示遮罩 + 内容框
 * - closeModal(modalId)：隐藏遮罩 + 内容框
 * - 点击遮罩层关闭、ESC 关闭
 * - 按钮交互：data-modal-action="ok|cancel|submit"
 *   - ok / cancel → 关闭弹出框
 *   - submit → 校验必填字段 → 收集表单数据 → 关闭
 */

/**
 * 打开指定弹出框（编辑器预览模式用）
 */
export function openModal(modalId: string): void {
  const modal = document.querySelector(`[data-modal-id="${modalId}"]`);
  if (!modal) return;
  const overlay = modal.querySelector("[data-modal-overlay]") as HTMLElement | null;
  const content = modal.querySelector("[data-modal-content]") as HTMLElement | null;
  if (overlay) overlay.style.display = "block";
  if (content) {
    content.style.display = "flex";
    content.style.opacity = "1";
    content.style.transform = "translateY(0) scale(1)";
  }
  modal.setAttribute("data-modal-open", "true");
}

/**
 * 关闭指定弹出框（编辑器预览模式用）
 */
export function closeModal(modalId: string): void {
  const modal = document.querySelector(`[data-modal-id="${modalId}"]`);
  if (!modal) return;
  const overlay = modal.querySelector("[data-modal-overlay]") as HTMLElement | null;
  const content = modal.querySelector("[data-modal-content]") as HTMLElement | null;
  if (content) {
    content.style.opacity = "0";
    content.style.transform = "translateY(-20px) scale(0.95)";
  }
  setTimeout(() => {
    if (overlay) overlay.style.display = "none";
    if (content) content.style.display = "none";
  }, 200);
  modal.setAttribute("data-modal-open", "false");
}

/**
 * 生成 codegen 注入用弹出框交互脚本字符串。
 *
 * 功能：
 * 1. 点击 [data-modal-link] → 打开对应 [data-modal-id]
 * 2. 点击 [data-modal-close] 或 [data-modal-overlay] → 关闭
 *    - 若 close 按钮有 data-modal-action="submit"，先校验必填字段再收集表单数据
 * 3. ESC 键关闭当前打开的 modal
 * 4. 支持多个 modal 独立控制
 * 5. overlay 和 content 为兄弟节点，点击 content 内部不关闭
 *
 * @returns 自执行函数脚本字符串，带幂等守卫 __wcModalInit
 */
export function buildModalSwitcherScript(): string {
  return `// web-craft modal switcher
(function(){if(window.__wcModalInit)return;window.__wcModalInit=true;
function openModal(modalId){var modal=document.querySelector('[data-modal-id="'+modalId+'"]');if(!modal)return;var overlay=modal.querySelector('[data-modal-overlay]');var content=modal.querySelector('[data-modal-content]');if(overlay)overlay.style.display='block';if(content){content.style.display='flex';content.style.opacity='1';content.style.transform='translateY(0) scale(1)'}modal.setAttribute('data-modal-open','true')}
function closeModal(modalId){var modal=document.querySelector('[data-modal-id="'+modalId+'"]');if(!modal)return;var overlay=modal.querySelector('[data-modal-overlay]');var content=modal.querySelector('[data-modal-content]');if(content){content.style.opacity='0';content.style.transform='translateY(-20px) scale(0.95)'}setTimeout(function(){if(overlay)overlay.style.display='none';if(content)content.style.display='none'},200);modal.setAttribute('data-modal-open','false')}
function validateAndCollect(modal){var fields=modal.querySelectorAll('[data-modal-field]');var data={};var valid=true;for(var i=0;i<fields.length;i++){var f=fields[i];var name=f.getAttribute('name')||'';if(!name)continue;if(f.type==='checkbox'){data[name]=f.checked;continue}var val=f.value||'';if(f.hasAttribute('required')&&!val.trim()){valid=false;f.style.borderColor='#f44'}else{f.style.borderColor=''}data[name]=val}return valid?data:null}
document.addEventListener('click',function(e){
var link=e.target.closest('[data-modal-link]');if(link){e.preventDefault();var mid=link.getAttribute('data-modal-link');if(mid)openModal(mid);return}
var closeBtn=e.target.closest('[data-modal-close]');if(closeBtn){var modal=closeBtn.closest('[data-modal-id]');if(!modal)return;var mid=modal.getAttribute('data-modal-id');if(!mid)return;
var action=closeBtn.getAttribute('data-modal-action');
if(action==='submit'){var result=validateAndCollect(modal);if(!result){e.preventDefault();return}try{var ev=new CustomEvent('wc-modal-submit',{detail:{modalId:mid,data:result}});document.dispatchEvent(ev)}catch(err){}}
else if(action==='ok'){try{var ev=new CustomEvent('wc-modal-ok',{detail:{modalId:mid}});document.dispatchEvent(ev)}catch(err){}}
else if(action==='cancel'){try{var ev=new CustomEvent('wc-modal-cancel',{detail:{modalId:mid}});document.dispatchEvent(ev)}catch(err){}}
closeModal(mid);return}
var overlay=e.target.closest('[data-modal-overlay]');if(overlay){var modal=overlay.closest('[data-modal-id]');if(modal){var mid=modal.getAttribute('data-modal-id');if(mid)closeModal(mid)}return}})
document.addEventListener('keydown',function(e){if(e.key==='Escape'){var open=document.querySelector('[data-modal-open="true"]');if(open){var mid=open.getAttribute('data-modal-id');if(mid)closeModal(mid)}}})})();`;
}
