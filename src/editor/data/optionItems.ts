/**
 * 选项型组件（下拉选择 / 单选组 等）共享的选项数据映射工具（零依赖纯函数）
 *
 * 编辑态渲染器（FormSelectRenderer / FormRadioRenderer）与发布态代码生成
 * （codegen/components/form.ts）共用同一套解析逻辑，保证"编辑器所见即发布所得"。
 * 单选组原为 `options` 纯文本（每行一个选项），故与下拉共用同一解析器即可自动兼容迁移。
 *
 * 静态选项支持两种存储形态并自动兼容（老页面 options 文本无需迁移）：
 *   - 新：items 数组 [{ label, value, icon }]（list-editor 逐条编辑）
 *   - 旧：options 文本（每行「显示名|提交值」，省略 | 则显示名=提交值）
 * 接口响应由 parseApiOptionItems 解包，字段映射沿用组件的 apiValueField/apiLabelField。
 */

export interface OptionItem {
  label: string;
  value: string;
  icon?: string;
}

/** 旧格式文本：每行 "显示名|提交值"（省略 | 则显示名=提交值） */
function parseLegacyText(raw: string): OptionItem[] {
  return String(raw ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf("|");
      if (i === -1) return { label: line, value: line };
      const label = line.slice(0, i).trim();
      const value = line.slice(i + 1).trim();
      return { label: label || value, value: value || label };
    });
}

/** 单条静态原始项 -> 标准 OptionItem（应用字段别名兜底） */
function mapRawItem(item: unknown, index: number): OptionItem {
  if (item == null || typeof item !== "object") {
    const s = String(item ?? "");
    return { label: s, value: s };
  }
  const obj = item as Record<string, unknown>;
  const label = String(obj.label ?? obj.text ?? obj.title ?? obj.name ?? `选项 ${index + 1}`);
  const value = String(obj.value ?? obj.id ?? label);
  const iconRaw = obj.icon ?? obj.iconName;
  const icon = iconRaw != null && String(iconRaw) ? String(iconRaw) : undefined;
  return { label: label || value, value: value || label, icon };
}

/**
 * 解析静态选项：兼容 items 数组与旧 options 文本。
 * 支持：数组 / 字符串（旧文本）/ 对象（内含常见数组键）。无法解析时返回空数组。
 */
export function parseOptionItems(input: unknown): OptionItem[] {
  if (input == null) return [];
  if (Array.isArray(input)) return input.map((it, i) => mapRawItem(it, i));
  if (typeof input === "string") return parseLegacyText(input);
  if (typeof input === "object") {
    const obj = input as Record<string, unknown>;
    for (const key of ["items", "list", "options", "data"]) {
      const v = obj[key];
      if (Array.isArray(v)) return v.map((it, i) => mapRawItem(it, i));
    }
    return [mapRawItem(obj, 0)];
  }
  return [];
}

/** 取对象字段，支持点路径 */
function pick(obj: Record<string, unknown>, path: string): unknown {
  if (!path) return undefined;
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

/**
 * 解析接口响应为选项列表。
 * 解包顺序与发布端内联脚本一致：数组 → 直接使用；对象 → items / list → 否则单条。
 * 字段映射：value=apiValueField（缺省回退 id→value），label=apiLabelField（缺省回退 name→label→text→value）。
 */
export function parseApiOptionItems(
  input: unknown,
  mapping: { valueField?: string; labelField?: string } = {},
): OptionItem[] {
  if (input == null) return [];
  let raw: unknown;
  if (Array.isArray(input)) {
    raw = input;
  } else if (typeof input === "object") {
    const obj = input as Record<string, unknown>;
    const arr = obj.items ?? obj.list;
    raw = Array.isArray(arr) ? arr : [obj];
  } else {
    raw = [input];
  }
  const vField = mapping.valueField ?? "";
  const lField = mapping.labelField ?? "";
  return (raw as unknown[]).map((d) => {
    if (d == null || typeof d !== "object") {
      const s = String(d ?? "");
      return { label: s, value: s };
    }
    const obj = d as Record<string, unknown>;
    const valRaw = vField ? pick(obj, vField) : (obj.id ?? obj.value);
    const labRaw = lField ? pick(obj, lField) : (obj.name ?? obj.label ?? obj.text ?? valRaw);
    const value = String(valRaw ?? "");
    const label = String(labRaw ?? "") || value;
    return { label, value: value || label };
  });
}

/* ──────────────────────────────────────────────
 * 静态 / 接口两种模式的**统一选项口径**
 * ────────────────────────────────────────────── */

export interface FormOptionsResult {
  /** 最终选项列表（接口模式下由响应归一而来） */
  items: OptionItem[];
  /** 是否由接口响应驱动（true 时静态 items 被忽略，面板也应隐藏静态条目编辑器） */
  fromApi: boolean;
}

/**
 * 选项型表单控件（下拉 / 单选组 / 分段控制器 / 复选框组…）的**唯一选项取值口径**。
 *
 * 为什么必须收口：编辑区渲染器与发布端 codegen 各自判断「静态还是接口」时，
 * 曾出现「编辑区按静态渲染、发布端按接口渲染」这类预览/发布漂移。现在两边都只调本函数，
 * 判定逻辑（dataMode + 字段映射 apiValueField/apiLabelField）只有一份。
 *
 * @param c 已做过全局数据源覆盖的有效配置（编辑区走 resolveEffectiveDataConfig，
 *          发布端由 codegen/engine.ts 的 withEffectiveConfig 完成，两者语义一致）
 * @param apiData 接口响应原文；非接口模式可省略
 */
export function resolveFormOptions(
  c: Record<string, unknown>,
  apiData?: unknown,
): FormOptionsResult {
  if (String(c.dataMode ?? "static") === "api") {
    return {
      items: parseApiOptionItems(apiData, {
        valueField: String(c.apiValueField ?? "") || undefined,
        labelField: String(c.apiLabelField ?? "") || undefined,
      }),
      fromApi: true,
    };
  }
  return { items: parseOptionItems(c.items ?? c.options), fromApi: false };
}

/* ──────────────────────────────────────────────
 * 面板诚实性：选项与「默认选中」的实时诊断（纯函数、零副作用）
 * ──────────────────────────────────────────────
 * 这些都**只诊断不改解析** —— 解析口径由上面的 parse/resolve 系列决定，
 * 诊断函数的职责是把「用户看不见的静默行为」说出来（面板类型 ConfigField.diagnose）。
 */

export type OptionDiagLevel = "ok" | "warn" | "error" | "info";

export interface OptionDiag {
  level: OptionDiagLevel;
  text: string;
  /** 补充说明：原因、后果、怎么改 */
  detail?: string;
}

/** 选项摘要：`广东 · 江苏 · 浙江`（超出 max 项时截断并报总数） */
export function summarizeOptionItems(items: OptionItem[], max = 6): string {
  const names = items.map((it) => it.label || it.value);
  const head = names.slice(0, max).join(" · ");
  return names.length > max ? `${head} …（共 ${names.length} 项）` : head;
}

/**
 * 「选项数据」诊断：把解析结果与**会被用户察觉但看不出原因**的配置问题说出来。
 *
 * 覆盖四类（按严重度递减）：
 *   1. 写坏的 JSON 文本 —— 旧 `options` 文本没解析成数组时，会被逐行解析成一个怪选项
 *   2. 提交值重复     —— 选中任一项都提交同一个值，表单无法区分（真实数据错误）
 *   3. 显示名重复     —— 提交值不同但画布/发布页里看起来一模一样
 *   4. 空 / 正常      —— 空给出明确提示；正常给出项数与摘要
 */
export function diagnoseOptionItems(input: unknown): OptionDiag {
  const items = parseOptionItems(input);
  if (!items.length) {
    return {
      level: "warn",
      text: "尚未配置任何选项",
      detail: "控件在画布与发布页都会是空的，至少需要一项。",
    };
  }
  // 旧 options 文本写坏：[{"label":"A" 这类以括号开头、却整段变成一个选项
  const first = items[0];
  if (items.length === 1 && /^[[{]/.test(first.value)) {
    return {
      level: "warn",
      text: "这段文本看起来是 JSON，但没有解析成数组",
      detail:
        `当前被当作 1 个选项（显示名与提交值都是「${first.value}」）。` +
        "请检查括号/引号是否配对，或改用「选项列表」逐条录入。",
    };
  }
  const valueCount = new Map<string, number>();
  for (const it of items) valueCount.set(it.value, (valueCount.get(it.value) ?? 0) + 1);
  const dupValues = [...valueCount.entries()].filter(([, n]) => n > 1);
  if (dupValues.length) {
    return {
      level: "error",
      text: `提交值重复：${dupValues.map(([v, n]) => `「${v}」×${n}`).join("、")}`,
      detail: "选中其中任一项都会提交同一个值，表单无法区分它们；请给每项不同的提交值。",
    };
  }
  const labelValues = new Map<string, Set<string>>();
  for (const it of items) {
    const set = labelValues.get(it.label) ?? new Set<string>();
    set.add(it.value);
    labelValues.set(it.label, set);
  }
  const dupLabels = [...labelValues.entries()].filter(([, set]) => set.size > 1);
  if (dupLabels.length) {
    return {
      level: "warn",
      text: `显示名重复：${dupLabels.map(([l]) => `「${l}」`).join("、")}`,
      detail: "提交值不同但显示名一样，画布与发布页里看不出区别；建议改成可区分的显示名。",
    };
  }
  return { level: "ok", text: `已配置 ${items.length} 项`, detail: summarizeOptionItems(items) };
}

/**
 * 「默认选中」诊断（索引型：下拉选择 / 单选组）。
 *
 * 关键差异（此前无人告知用户，属静默行为）：
 *   - **下拉选择**：设了占位提示或「一键清空」时索引**从 1 起**（0 = 未选中）；
 *     越界会被**夹取为最后一项**（静默选中末项）。
 *   - **单选组**：索引**从 0 起**；越界**不预选任何项**。
 * 同一处「默认选中索引」在两个组件里语义不同，诊断必须如实说出来。
 */
export function diagnoseSelectedIndex(
  config: Record<string, unknown>,
  items: OptionItem[],
  variant: "select" | "radio",
): OptionDiag | null {
  const rawIndex = Number(config.selectedIndex ?? 0) || 0;
  const index = Math.max(0, Math.floor(rawIndex));

  if (String(config.dataMode ?? "static") === "api") {
    return {
      level: "info",
      text: variant === "select" ? "接口模式：初始不预选静态项" : "接口模式：运行时取第 1 项",
      detail:
        variant === "select"
          ? "选项由接口在运行期填充：设了占位提示或「一键清空」则初始显示占位文字，否则取第 1 项；静态索引只对「静态选项」模式生效。"
          : "选项由接口在运行期重建，并默认勾选第 1 项；静态索引不参与预选。",
    };
  }

  if (!items.length) {
    return { level: "warn", text: "尚未配置选项，默认选中索引暂不生效" };
  }

  if (variant === "radio") {
    if (index >= items.length) {
      return {
        level: "warn",
        text: `索引 ${index} 超出范围（共 ${items.length} 项，从 0 起）`,
        detail: "超出范围时不会预选任何一项（下拉选择在同样情况下会夹取为最后一项）。",
      };
    }
    return {
      level: "ok",
      text: `将默认选中第 ${index + 1} 项「${items[index].label}」`,
      detail: index === 0 ? "索引从 0 起。" : undefined,
    };
  }

  // 下拉选择：有占位/清空时索引从 1 起，0 表示未选中
  const showEmpty = Boolean(String(config.placeholder ?? "").trim()) || config.clearable === true;
  const effective = showEmpty ? items.length + 1 : items.length;
  const position = showEmpty ? (index > 0 ? index : 0) : index;
  const clamped = Math.max(0, Math.min(position, effective - 1));

  if (showEmpty && index === 0) {
    return {
      level: "info",
      text: "0 = 未选中",
      detail: `已设占位提示或「一键清空」，初始显示占位文字；要选第 1 项「${items[0].label}」请填 1。`,
    };
  }
  if (position > effective - 1) {
    return {
      level: "warn",
      text: `索引 ${index} 超出范围（共 ${items.length} 项${showEmpty ? "，从 1 起" : "，从 0 起"}）`,
      detail: `超出部分当前会被夹取为最后一项「${items[items.length - 1].label}」。`,
    };
  }
  const target = items[showEmpty ? clamped - 1 : clamped];
  return {
    level: "ok",
    text: `将默认选中第 ${showEmpty ? index : index + 1} 项「${target?.label ?? ""}」`,
    detail: showEmpty ? "序号从 1 起（0 表示未选中）。" : "序号从 1 起。",
  };
}

/**
 * 「默认选中值」诊断（取值型：分段控制器等用 value 而非索引的组件）。
 * 值不在选项列表里时，两端都会回退到第 1 项 —— 说出来，别让用户以为选中了自己填的那个。
 */
export function diagnoseOptionValue(
  config: Record<string, unknown>,
  items: OptionItem[],
  valueKey = "value",
): OptionDiag | null {
  const v = String(config[valueKey] ?? "").trim();

  if (String(config.dataMode ?? "static") === "api") {
    return {
      level: "info",
      text: "接口模式：运行时取第 1 项",
      detail: "选项由接口在运行期决定，静态默认值不参与预选。",
    };
  }
  if (!items.length) {
    return { level: "warn", text: "尚未配置选项，默认选中值暂不生效" };
  }
  if (!v) {
    return { level: "info", text: `留空时默认选中第 1 项「${items[0].label}」` };
  }
  const hit = items.find((it) => it.value === v);
  if (!hit) {
    return {
      level: "warn",
      text: `当前值「${v}」不在选项列表中`,
      detail: `画布与发布页都会回退为选中第 1 项「${items[0].label}」，但仍会提交原值；重新选一次即可修正。`,
    };
  }
  return { level: "ok", text: `将默认选中「${hit.label}」` };
}
