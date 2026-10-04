import type { CSSProperties } from 'react';

export const ALL_AGENT_TOOLS = ['terminal', 'file', 'command_history', 'terminal_session', 'plugin_manager', 'memory'];
export const BRAND = '#60A5FA';
export const GRADIENT = 'linear-gradient(135deg, #60A5FA 0%, #38BDF8 100%)';

// 自造可靠 outlined 字段：彻底弃用 MUI 的 <fieldset><legend> notch。
// Tauri WKWebView 下，MUI 用 legend 渲染缺口时：① 不可靠渲染（缺口不出现）② legend 占满宽度拦截点击（无法输入）。
// 这里用「外层边框 Box + 浮动 label 补丁（与背景同色覆盖边框）」实现，零 fieldset/legend 依赖，WebKit 下 100% 正常。
// 注意：fieldControlStyle / selectSx 必须定义在模块作用域（组件外），否则每次父组件 render 都会生成新的
// 引用，React 会把它当作新组件类型 → 反复卸载重挂 input 子树 → 焦点丢失无法输入。
export const fieldControlStyle: CSSProperties = {
  width: '100%',
  border: 'none',
  outline: 'none',
  background: 'transparent',
  padding: '11px 12px',
  fontSize: 14,
  fontFamily: 'inherit',
  color: 'inherit',
  boxSizing: 'border-box',
  display: 'block',
};

export const selectSx = {
  width: '100%',
  '& .MuiSelect-select': { py: 1.4, px: 1.5, fontSize: 14 },
  '&:before': { display: 'none' },
  '&:after': { display: 'none' },
};