export const API_TYPE_KEYS: { value: string; labelKey: string }[] = [
  { value: 'openai-completions', labelKey: 'api.type_openai_completions' },
  { value: 'anthropic-messages', labelKey: 'api.type_anthropic_messages' },
  { value: 'ollama', labelKey: 'api.type_ollama' },
  { value: 'openai-responses', labelKey: 'api.type_openai_responses' },
];

export const AUTH_TYPE_KEYS: { value: string; labelKey: string }[] = [
  { value: 'bearer', labelKey: 'api.auth_type_bearer' },
  { value: 'x-api-key', labelKey: 'api.auth_type_x_api_key' },
  { value: 'custom', labelKey: 'api.auth_type_custom' },
];

export const PROVIDER_PRESET_KEYS = [
  { nameKey: 'preset.openai', logo: '🟢' },
  { nameKey: 'preset.anthropic', logo: '🟠' },
  { nameKey: 'preset.deepseek', logo: '🔵' },
  { nameKey: 'preset.google', logo: '🟡' },
  { nameKey: 'preset.ollama', logo: '🦙' },
];

/// 从字符串生成确定性颜色（相同名称永远得到相同颜色）
const PROVIDER_COLORS = [
  '#60A5FA', '#38BDF8', '#00E676', '#FBBF24', '#FF6B6B',
  '#26C6DA', '#AB47BC', '#FFA726', '#66BB6A', '#5C6BC0',
  '#EC407A', '#7E57C2', '#0EA5E9', '#9CCC65', '#8D6E63',
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getProviderColor(name: string): string {
  return PROVIDER_COLORS[hashString(name || '?') % PROVIDER_COLORS.length];
}