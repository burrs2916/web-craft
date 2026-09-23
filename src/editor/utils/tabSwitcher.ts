/**
 * 标签页切换共享逻辑
 *
 * 编辑器渲染器(TabsRenderer)和 codegen 注入脚本两方共用，
 * 保证同一套切换逻辑在编辑预览和发布产物中行为一致。
 *
 * 编辑器预览模式：switchTab() 通过 store 获取 children 列表，
 *   读 child.config.__tabId 判断每个子组件属于哪个标签，切换 display。
 * 发布产物：buildTabSwitcherScript() 生成纯 JS 字符串，
 *   通过 [data-tab-pane] 的 data-tab-pane-id 切换 display，
 *   通过 [data-tab-link] 的 data-tab-id 切换标签按钮样式。
 */

import { useEditorStore } from "../../store/editorStore";
import { getChildTabId, type TabItem } from "./tabsConfig";

/**
 * 切换到指定标签（编辑器预览模式用）
 *
 * @param tabsId 标签页组件 ID（对应 data-tabs-id）
 * @param tabId 目标标签 ID
 * @param tabs 标签列表（TabItem[]）
 */
export function switchTab(tabsId: string, tabId: string, tabs: TabItem[]): void {
  // 找到 Tabs 组件根元素
  const tabsRoot = document.querySelector(`[data-tabs-id="${CSS.escape(tabsId)}"]`);
  if (!tabsRoot) return;

  // 更新 data-active-tab（索引，兼容旧脚本）和 data-active-tab-id
  const tabIndex = tabs.findIndex((t) => t.id === tabId);
  tabsRoot.setAttribute("data-active-tab", String(tabIndex >= 0 ? tabIndex : 0));
  tabsRoot.setAttribute("data-active-tab-id", tabId);

  // 从 store 获取 children 列表
  const state = useEditorStore.getState();
  const component = state.components.find((c) => c.id === tabsId);
  const childIds = component?.children ?? [];

  // 遍历子组件，按 __tabId 切换 display
  childIds.forEach((childId, i) => {
    const el = document.querySelector(`[data-comp-id="${CSS.escape(childId)}"]`) as HTMLElement | null;
    if (!el) return;

    // 读子组件的 config.__tabId
    const childComp = state.components.find((c) => c.id === childId);
    const childTabId = childComp
      ? getChildTabId(childComp.config, tabs, i)
      : tabs[Math.min(i, tabs.length - 1)]?.id ?? "";

    el.style.display = childTabId === tabId ? "block" : "none";
  });

  // 更新标签按钮激活态
  updateTabButtonStates(tabsRoot as HTMLElement, tabId);
}

/**
 * 更新标签按钮的激活/非激活样式
 */
function updateTabButtonStates(tabsRoot: HTMLElement, activeTabId: string): void {
  const buttons = tabsRoot.querySelectorAll("[data-tab-link]");
  buttons.forEach((btn) => {
    const tabId = btn.getAttribute("data-tab-id");
    const isActive = tabId === activeTabId;
    btn.setAttribute("data-tab-active", String(isActive));
  });
}

/**
 * 生成 codegen 注入用标签页切换脚本字符串。
 *
 * 与 switchTab 函数逻辑一致，但以纯 JS 字符串注入到预览/发布 HTML 中。
 * 发布产物中子组件被包裹在 [data-tab-pane] div 内，
 * 脚本通过 [data-tab-pane] 的 data-tab-pane-id 切换 display。
 * 标签按钮的激活/非激活样式通过 data-style-on / data-style-off 切换。
 *
 * @returns 自执行函数脚本字符串，带幂等守卫 __wcTabSwitcherInit
 */
export function buildTabSwitcherScript(): string {
  return `// web-craft tabs switcher
(function(){if(window.__wcTabSwitcherInit)return;window.__wcTabSwitcherInit=true;
function switchTab(tabsRoot,tabId){
  tabsRoot.setAttribute('data-active-tab-id',tabId);
  var panes=tabsRoot.querySelectorAll('[data-tab-pane]');
  for(var pi=0;pi<panes.length;pi++){var p=panes[pi];var paneId=p.getAttribute('data-tab-pane-id');p.style.display=paneId===tabId?'block':'none'}
  var btns=tabsRoot.querySelectorAll('[data-tab-link]');
  for(var bi=0;bi<btns.length;bi++){var b=btns[bi];var btnId=b.getAttribute('data-tab-id');var isActive=btnId===tabId;b.setAttribute('data-tab-active',String(isActive));var styleAttr=isActive?b.getAttribute('data-style-on'):b.getAttribute('data-style-off');if(styleAttr)b.setAttribute('style',styleAttr);var span=b.querySelector('span');if(span)span.style.fontWeight=isActive?'600':'400'}
}
document.addEventListener('click',function(e){
  var link=e.target.closest('[data-tab-link]');
  if(!link)return;
  e.preventDefault();
  var tabId=link.getAttribute('data-tab-id');
  if(!tabId)return;
  var tabsRoot=link.closest('[data-tabs-id]');
  if(!tabsRoot)return;
  switchTab(tabsRoot,tabId)
})})();`;
}
