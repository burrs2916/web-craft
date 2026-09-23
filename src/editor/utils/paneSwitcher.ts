/**
 * 面板切换共享逻辑
 *
 * 编辑器渲染器(SidebarMenu / NavbarHorizontal)和 codegen 注入脚本三方共用，
 * 保证同一套切换逻辑在编辑预览和发布产物中行为一致。
 *
 * 核心操作：遍历 [data-pane-id] 切换 display/opacity，
 * 同时更新 [data-wc-content-panel] 容器的 data-active-pane 标记。
 */

/**
 * 切换到指定面板（编辑器预览模式用）
 *
 * @param targetId 目标面板 ID（对应 pane.id / data-pane-link 值）
 */
export function switchPane(targetId: string): void {
  const panes = document.querySelectorAll("[data-pane-id]");
  panes.forEach((p) => {
    const el = p as HTMLElement;
    const isActive = el.getAttribute("data-pane-id") === targetId;
    el.style.display = isActive ? "block" : "none";
    el.style.opacity = isActive ? "1" : "0";
  });
  const panels = document.querySelectorAll("[data-wc-content-panel]");
  panels.forEach((panel) => panel.setAttribute("data-active-pane", targetId));
}

/**
 * 生成 codegen 注入用面板切换脚本字符串。
 *
 * 与 switchPane 函数逻辑完全一致，但以纯 JS 字符串形式注入到
 * 预览/发布 HTML 中，不依赖编辑器运行时。
 *
 * @returns 自执行函数脚本字符串，带幂等守卫 __wcPaneSwitcherInit
 */
export function buildPaneSwitcherScript(): string {
  return `// web-craft content-panel switcher
(function(){if(window.__wcPaneSwitcherInit)return;window.__wcPaneSwitcherInit=true;
function switchPane(targetId){var panes=document.querySelectorAll('[data-pane-id]');panes.forEach(function(p){var isActive=p.getAttribute('data-pane-id')===targetId;p.style.display=isActive?'block':'none';p.style.opacity=isActive?'1':'0'})}
document.addEventListener('click',function(e){var link=e.target.closest('[data-pane-link]');if(!link)return;e.preventDefault();var targetId=link.getAttribute('data-pane-link');if(!targetId)return;switchPane(targetId);var panels=document.querySelectorAll('[data-wc-content-panel]');panels.forEach(function(panel){panel.setAttribute('data-active-pane',targetId)})})})();`;
}
