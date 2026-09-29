/**
 * 属性面板共享样式常量与工具。
 * 从 EditorPropertyPanel.tsx 拆出，供面板本体与各属性字段/区块复用。
 */

export const fieldSx = {
  '& .MuiInputBase-input': { fontSize: 11.5 },
  '& .MuiOutlinedInput-root': { borderRadius: 0.75 },
  '& .MuiOutlinedInput-root:not(.MuiInputBase-multiline)': { height: 32 },
  '& .MuiInputLabel-root': { fontSize: 10.5 },
  '& .MuiFormHelperText-root': { fontSize: 9, ml: 0 },
};

/**
 * 让标题始终悬浮在输入框左上角并打开缺口（shrink: true），
 * 输入框内部空间留给 placeholder 提示信息居中显示。
 */
export const floatedLabelProps = { inputLabel: { shrink: true } };

/**
 * Autocomplete 的 renderInput 专用：MUI v9 的 params 是 slotProps 形态，
 * `slotProps.input` 携带弹层锚点 ref（setAnchorEl）与 startAdornment/endAdornment，
 * `slotProps.htmlInput` 携带真实 input 的 ref、value/onChange/onKeyDown 与 role="combobox"。
 * 写 `slotProps={{ ...floatedLabelProps }}` 会把整个 params.slotProps 覆盖掉 ——
 * 控制台报 "Unable to find the input element"，且自由输入/键盘导航/下拉箭头静默失效。
 * 必须**按 key 合并**：只把 shrink 合进 inputLabel，其余 key 原样保留。
 */
export function autocompleteSlotProps(params: { slotProps?: Record<string, unknown> }): Record<string, unknown> {
  return {
    ...(params.slotProps ?? {}),
    inputLabel: {
      ...(params.slotProps?.inputLabel ?? {}),
      ...floatedLabelProps.inputLabel,
    },
  };
}



export const sectionHeaderSx = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  cursor: 'pointer',
  py: 0.6,
  px: 0.75,
  borderRadius: 0.75,
  '&:hover': { backgroundColor: 'action.hover' },
  userSelect: 'none',
  minHeight: 28,
};

export const sectionTitleSx = {
  fontWeight: 600,
  color: 'text.secondary',
  fontSize: 10,
  letterSpacing: 0.8,
  textTransform: 'uppercase',
};
