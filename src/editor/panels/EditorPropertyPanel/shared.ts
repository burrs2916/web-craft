import type { ConfigField } from '../../../types/editor';

/** `ConfigFieldRenderer` 及其各字段渲染器共用的入参形状。 */
export interface FieldRendererProps {
  field: ConfigField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  config: Record<string, unknown>;
  allComponents?: Array<{ id: string; type: string; name?: string }>;
  componentId?: string;
}

/**
 * 解析字段当前值：config[key] 缺省时回退到 legacyKey（自动迁移兼容），
 * 使面板呈现与画布/发布端一致（如 form-select 的旧 options 文本 → items 数组）。
 */
export function resolveConfigFieldValue(
  config: Record<string, unknown>,
  field: ConfigField,
): unknown {
  const current = config[field.key];
  if (current !== undefined && current !== null) return current;
  if (field.legacyKey && config[field.legacyKey] !== undefined && config[field.legacyKey] !== null) {
    const raw = config[field.legacyKey];
    return field.legacyParse ? field.legacyParse(raw) : raw;
  }
  return current;
}

/**
 * 诊断条配色 / 前缀标记。
 * 只靠颜色传达状态对色觉障碍不友好，故同时给一个符号前缀。
 */
export const DIAG_COLORS: Record<string, string> = {
  ok: 'success.main',
  warn: 'warning.main',
  error: 'error.main',
  info: 'info.main',
};
export const DIAG_MARKS: Record<string, string> = { ok: '✓', warn: '!', error: '✕', info: 'i' };