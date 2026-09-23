/**
 * 表单字段型控件的**编辑区校验口径**——与发布端 `codegen/components/form.ts` 的
 * `__WCVALIDATE` 同一套规则，保证「画布所见 = 发布所得」。
 *
 * 规则来源：面板的 validationSchema（额外校验/数值区间/正则/错误文案）。
 * 取值语义必须与发布端一致：
 * - 文本/日期/时间/数字 → 去空格后的字符串；
 * - 复选框/开关 → 勾选 `'on'` / 未勾选 `''`（枚举，只有必填有意义）；
 * - 单选组/多选组 → 选中项的提交值。
 *
 * 发布端规则优先级（`__WCVALIDATE`）：required → email → phone → number → rx → min/max，
 * 且 min/max 仅在**有值**时判定。这里逐条对齐，避免两端给出不同提示。
 */

export interface FieldValidationConfig {
  required?: unknown;
  validateType?: unknown;
  validateMin?: unknown;
  validateMax?: unknown;
  validateRegex?: unknown;
  validateMessage?: unknown;
}

/** 非空取值才做格式/区间校验（与发布端 `v!==''` 守卫一致） */
export function validateFieldValue(cfg: FieldValidationConfig, rawValue: string): string {
  const value = rawValue.trim();
  const required = cfg.required === true;
  const vtype = String(cfg.validateType ?? "none");
  const regex = String(cfg.validateRegex ?? "").trim();
  const msg = String(cfg.validateMessage ?? "").trim();

  if (required && value === "") return msg || "此项为必填项";
  if (value === "") return "";
  if (vtype === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return msg || "请输入有效的邮箱地址";
  if (vtype === "phone" && !/^1[3-9]\d{9}$/.test(value)) return msg || "请输入有效的手机号码";
  if (vtype === "number") {
    if (!/^-?\d+(\.\d+)?$/.test(value)) return msg || "请输入有效数字";
    const n = parseFloat(value);
    const bound = (v: unknown): number | null => (v === undefined || v === null || v === "" ? null : Number(v));
    const min = bound(cfg.validateMin);
    const max = bound(cfg.validateMax);
    if (min !== null && n < min) return msg || `数值不能小于 ${min}`;
    if (max !== null && n > max) return msg || `数值不能大于 ${max}`;
  }
  if (vtype === "regex" && regex) {
    try {
      if (!new RegExp(regex).test(value)) return msg || "输入格式不正确";
    } catch {
      // 非法正则视为未配置（发布端 `new RegExp` 抛错会被外层静默吞掉，行为一致）
      return "";
    }
  }
  return "";
}

/**
 * 枚举型控件（复选框 / 开关）的编辑区校验：取值只有「开/关」，格式类规则永不成立，
 * 故仅做必填判定——与面板 `choiceValidationSchema` 只暴露提示与配色保持同一口径。
 */
export function validateChoiceField(cfg: FieldValidationConfig, isOn: boolean): string {
  if (cfg.required === true && !isOn) return String(cfg.validateMessage ?? "").trim() || "此项为必填项";
  return "";
}
