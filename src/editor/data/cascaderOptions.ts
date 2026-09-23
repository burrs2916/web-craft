/**
 * 级联选择（form-cascader）的**唯一选项解析口径** —— 编辑区渲染器与发布端 codegen 共用。
 *
 * 为什么必须独立成模块（沿用 `optionItems.ts` 已确立的范式）：
 * 树形数据的解析、取值路径查找、显示文案与提交值的派生，一旦在渲染器与 codegen 各写一份，
 * 就会出现「编辑区显示 A、发布后显示 B」这类漂移——本项目已在下拉选择上真实发生过。
 * 解析器收口后，两端只读同一份结果；新增任何树形/多级控件一律复用它。
 *
 * 三种静态写法都支持（便于逐级升级，不必一次改成 JSON）：
 * 1. JSON 树（推荐）：`[{"label":"浙江","value":"zj","children":[…"}]`
 * 2. JSON 字符串（同上）
 * 3. 逐行文本「显示名|提交值」，**行首缩进**表达层级（不想写 JSON 时用）
 */

export interface CascaderOption {
  value: string;
  label: string;
  children?: CascaderOption[];
}

/** 内置示例树（面板留空时的兜底，保证拖进来即可见效果） */
export const CASCADER_DEFAULT_OPTIONS: CascaderOption[] = [
  {
    value: "zhejiang",
    label: "浙江",
    children: [
      {
        value: "hangzhou",
        label: "杭州",
        children: [
          { value: "xihu", label: "西湖区" },
          { value: "binjiang", label: "滨江区" },
        ],
      },
      { value: "ningbo", label: "宁波" },
    ],
  },
  {
    value: "jiangsu",
    label: "江苏",
    children: [
      {
        value: "nanjing",
        label: "南京",
        children: [
          { value: "gulou", label: "鼓楼区" },
          { value: "xuanwu", label: "玄武区" },
        ],
      },
      { value: "suzhou", label: "苏州" },
    ],
  },
];

/**
 * 递归规整任意形状的树为 `{ value,label,children }`。
 * 字段名可配（接口响应常是 `code/name`、`id/text` 之类），每层依次回退到通用别名，
 * 与发布端 dataLoader 的 `__norm` 内联逻辑**逐条对应**（改这里必须同步改那里的字段回退链）。
 */
export function normalizeCascaderTree(
  input: unknown,
  valueField = "value",
  labelField = "label",
  childrenField = "children",
): CascaderOption[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((raw) => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const value = String(o[valueField] ?? o.value ?? o.id ?? "");
      const label = String(o[labelField] ?? o.label ?? o.name ?? o.text ?? value);
      const kids = normalizeCascaderTree(
        o[childrenField] ?? o.children ?? o.items,
        valueField,
        labelField,
        childrenField,
      );
      return kids.length ? { value, label, children: kids } : { value, label };
    })
    .filter((o) => o.value !== "" || o.label !== "");
}

/** 静态选项解析（数组 / JSON 字符串 / 缩进文本），全部走 normalizeCascaderTree 归一 */
export function parseCascaderStaticOptions(input: unknown): CascaderOption[] {
  if (Array.isArray(input) && input.length > 0) {
    return normalizeCascaderTree(input);
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return CASCADER_DEFAULT_OPTIONS;
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          // 显式空数组视作「未配置」→ 回退内置示例，避免画布上出现一个永远打不开的空控件；
          // 也不要把 "[ ]" 当成逐行文本解析成一个叫 "[]" 的选项。
          return parsed.length > 0 ? normalizeCascaderTree(parsed) : CASCADER_DEFAULT_OPTIONS;
        }
      } catch {
        /* 非法 JSON → 落到逐行解析（容错，不整体丢弃用户输入） */
      }
    }
    const roots: CascaderOption[] = [];
    const stack: { indent: number; node: CascaderOption }[] = [];
    for (const line of trimmed.split("\n")) {
      if (!line.trim()) continue;
      const indent = line.length - line.trimStart().length;
      const [label, value] = line.trim().split("|").map((p) => p.trim());
      const node: CascaderOption = { label: label || value, value: value || label };
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      if (stack.length) {
        const parent = stack[stack.length - 1].node;
        (parent.children ??= []).push(node);
      } else {
        roots.push(node);
      }
      stack.push({ indent, node });
    }
    if (roots.length) return roots;
  }
  return CASCADER_DEFAULT_OPTIONS;
}

/** 面板树形编辑器（CascaderOptionsEditor）的回写口径：树 → JSON 字符串。
 * 与 parseCascaderStaticOptions 互为逆操作（编辑器解析旧配置 → 用户改动 → 序列化回写）。
 * 空显示名/提交值互为兜底；children 为空数组时不落盘，保持与 normalizeCascaderTree 的输出形状一致。
 */
export function serializeCascaderTree(tree: CascaderOption[]): string {
  const clean = (nodes: CascaderOption[]): CascaderOption[] =>
    nodes
      .map((n) => {
        const label = (n.label ?? "").trim();
        const value = (n.value ?? "").trim() || label;
        const kids = (n.children ?? []).filter((k) => (k.label ?? "").trim() || (k.value ?? "").trim());
        const node: CascaderOption = { value: value || label, label: label || value };
        return kids.length ? { ...node, children: clean(kids) } : node;
      })
      .filter((n) => n.value !== "" || n.label !== "");
  return JSON.stringify(clean(tree));
}

/** 接口响应 → 选项树（先按 dataPath 解包常见容器，再递归归一） */
export function parseCascaderApiOptions(
  raw: unknown,
  opts: { valueField?: string; labelField?: string; childrenField?: string } = {},
): CascaderOption[] {
  if (raw == null) return [];
  const source = Array.isArray(raw)
    ? raw
    : ((raw as Record<string, unknown>)?.items ??
        (raw as Record<string, unknown>)?.list ??
        (raw as Record<string, unknown>)?.children ??
        (raw as Record<string, unknown>)?.data ??
        []);
  return normalizeCascaderTree(source, opts.valueField || "value", opts.labelField || "label", opts.childrenField || "children");
}

/** 沿选中值逐级查找（任一级未命中即截断，返回已命中的前缀路径） */
export function findCascaderPath(options: CascaderOption[], values: string[]): CascaderOption[] {
  const result: CascaderOption[] = [];
  let current = options;
  for (const val of values) {
    const found = current.find((o) => o.value === val);
    if (!found) break;
    result.push(found);
    current = found.children ?? [];
  }
  return result;
}

/**
 * 面板「默认选中路径」取值：支持三种写法
 * - 数组：`["zj","hz","xh"]`
 * - JSON 数组字符串：`'["zj","hz"]'`
 * - 斜杠路径字符串：`"zj/hz/xh"`
 */
export function parseCascaderValue(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return [];
    if (t.startsWith("[")) {
      try {
        const parsed = JSON.parse(t);
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [];
      }
    }
    return t.split("/").map((p) => p.trim()).filter(Boolean);
  }
  return [];
}

/** 触发器显示文案：完整路径 或 仅末级名称（空路径返回空串，由调用方回退 placeholder） */
export function cascaderDisplay(
  path: CascaderOption[],
  showPath: boolean,
  separator: string,
): string {
  if (!path.length) return "";
  return showPath ? path.map((o) => o.label).join(separator) : path[path.length - 1].label;
}

/* ────────────────────────────── 面板实时诊断 ──────────────────────────────
 * 「选项数据」「默认选中路径」两个字段以前是**静默降级**的：JSON 写错、路径写错、
 * 留空回退内置示例，面板都毫无反馈，用户只能靠肉眼在画布上比对。
 * 下面这组纯函数把「当前写法解析成了什么」直接说清楚，由字段的 `diagnose` 回调消费。
 */

export type CascaderDiagLevel = "ok" | "warn" | "error" | "info";

export interface CascaderDiag {
  level: CascaderDiagLevel;
  /** 主提示（一行，给结论） */
  text: string;
  /** 补充说明（错误原因、实际会发生什么、树形摘要） */
  detail?: string;
}

export interface CascaderTreeSummary {
  /** 层级数（只有根节点 = 1） */
  depth: number;
  /** 节点总数 */
  nodes: number;
  /** 叶子数（可选到的最末级项个数） */
  leaves: number;
  /** 首层显示名 */
  roots: string[];
}

/** 树摘要（层级 / 节点数 / 叶子数 / 首层名），面板状态条与测试共用 */
export function summarizeCascaderTree(tree: CascaderOption[]): CascaderTreeSummary {
  let nodes = 0;
  let leaves = 0;
  let depth = 0;
  const walk = (list: CascaderOption[], level: number) => {
    for (const node of list) {
      nodes++;
      depth = Math.max(depth, level);
      const kids = node.children ?? [];
      if (kids.length) walk(kids, level + 1);
      else leaves++;
    }
  };
  walk(tree, 1);
  return { depth, nodes, leaves, roots: tree.map((o) => o.label || o.value) };
}

/**
 * 单行树形摘要：`浙江 › 杭州 › 西湖区·滨江区 · 宁波`
 * 让「层级配错了没」一眼可见，而不必回画布展开面板逐级点。
 */
export function formatCascaderTreeOneLine(tree: CascaderOption[], maxChars = 72): string {
  const render = (node: CascaderOption): string => {
    const name = node.label || node.value;
    const kids = node.children ?? [];
    if (!kids.length) return name;
    // 同父级下的叶子合并成 `A·B`，分支继续递归，避免整行过长
    const leaves = kids.filter((k) => !(k.children ?? []).length).map((k) => k.label || k.value);
    const branches = kids.filter((k) => (k.children ?? []).length).map(render);
    const inner = [...branches, leaves.length ? leaves.join("·") : ""].filter(Boolean).join(" · ");
    return `${name} › ${inner}`;
  };
  const joined = tree.map(render).join("  ·  ");
  return joined.length > maxChars ? `${joined.slice(0, maxChars - 1)}…` : joined;
}

/**
 * 「选项数据」字段的实时诊断。
 * **必须与 `parseCascaderStaticOptions` 的分支保持一致**（否则提示与实际产物不符）。
 */
export function diagnoseCascaderOptions(raw: unknown): CascaderDiag | null {
  if (Array.isArray(raw)) {
    const tree = normalizeCascaderTree(raw);
    if (!tree.length) return { level: "error", text: "选项数组为空或每项都缺少取值与显示名，不会渲染出任何选项。" };
    const s = summarizeCascaderTree(tree);
    return { level: "ok", text: `已解析：${s.depth} 级 / ${s.nodes} 项（可选末级 ${s.leaves} 个）`, detail: formatCascaderTreeOneLine(tree) };
  }

  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    const s = summarizeCascaderTree(CASCADER_DEFAULT_OPTIONS);
    return {
      level: "warn",
      text: `当前留空，正在使用内置示例数据（${s.depth} 级 / ${s.nodes} 项）`,
      detail: `填入自己的选项数据后示例自动失效。示例结构：${formatCascaderTreeOneLine(CASCADER_DEFAULT_OPTIONS)}`,
    };
  }

  if (trimmed.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      const s = summarizeCascaderTree(parseCascaderStaticOptions(raw));
      return {
        level: "error",
        text: `JSON 语法错误：${e instanceof Error ? e.message : String(e)}`,
        detail: `已退化成「逐行文本」解析（当前得到 ${s.depth} 级 / ${s.nodes} 项，结果多半不是你要的）。修正 JSON，或改用「显示名|提交值」逐行写法。`,
      };
    }
    if (!Array.isArray(parsed)) {
      return { level: "error", text: "JSON 顶层不是数组。", detail: '应形如 [{"label":"浙江","value":"zj","children":[…]}。' };
    }
    if (parsed.length === 0) {
      const s = summarizeCascaderTree(CASCADER_DEFAULT_OPTIONS);
      return { level: "warn", text: `空数组按「未配置」处理，正在使用内置示例（${s.depth} 级 / ${s.nodes} 项）`, detail: "要真的清空选项，请至少留一条有效数据。" };
    }
    const tree = normalizeCascaderTree(parsed);
    if (!tree.length) {
      return { level: "error", text: "顶层每一项的取值与显示名都为空，解析结果为空。" };
    }
    const s = summarizeCascaderTree(tree);
    const dropped = parsed.length - tree.length;
    return {
      level: dropped > 0 ? "warn" : "ok",
      text: `已解析：${s.depth} 级 / ${s.nodes} 项（可选末级 ${s.leaves} 个）${dropped > 0 ? `；${dropped} 项因取值与显示名同时为空被忽略` : ""}`,
      detail: formatCascaderTreeOneLine(tree),
    };
  }

  // 单个对象：写成 `{...}` 而不是 `[{...}]` 是常见手误。
  // 解析口径只认以 `[` 开头的 JSON，所以这种输入会被**逐行解析成 1 个怪选项** —— 必须说出来。
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return {
          level: "error",
          text: "JSON 顶层是对象，而选项数据需要数组。",
          detail: '在首尾各加一对方括号即可：[{"label":"浙江","value":"zhejiang","children":[…}]。'
            + `当前会被当作「逐行文本」解析，得到 ${summarizeCascaderTree(parseCascaderStaticOptions(raw)).nodes} 个怪选项。`,
        };
      }
    } catch {
      /* 非法 JSON：交给下面的逐行解析提示（那里的措辞已说明会退化） */
    }
  }

  // 逐行文本
  const lines = trimmed.split("\n").filter((l) => l.trim());
  const tree = parseCascaderStaticOptions(raw);
  const s = summarizeCascaderTree(tree);
  const noPipe = lines.filter((l) => !l.includes("|")).length;
  return {
    level: noPipe === lines.length ? "warn" : "ok",
    text: `已按逐行文本解析：${s.depth} 级 / ${s.nodes} 项（可选末级 ${s.leaves} 个）`,
    detail: [
      noPipe > 0 ? `有 ${noPipe} 行没有「|」分隔符，已把整行同时当作显示名与提交值。` : "",
      formatCascaderTreeOneLine(tree),
    ].filter(Boolean).join(" "),
  };
}

/**
 * 「默认选中路径」字段的实时诊断：逐级校验路径是否存在于选项树。
 * 旧行为是**静默截断**（写到 `a/nope` 只选到 a、写到 `nope` 什么都不选），用户无从察觉。
 */
export function diagnoseCascaderPath(raw: unknown, optionsRaw: unknown): CascaderDiag | null {
  const values = parseCascaderValue(raw);
  if (!values.length) return null; // 不预选，无需提示
  const tree = parseCascaderStaticOptions(optionsRaw);
  const hit = findCascaderPath(tree, values);
  const hitLabel = hit.map((o) => o.label).join(" / ");

  if (hit.length === values.length) {
    const last = hit[hit.length - 1];
    const isLeaf = !(last.children ?? []).length;
    return {
      level: "ok",
      text: `将预选中：${hitLabel}`,
      detail: isLeaf ? undefined : "该项还有下级，可继续补全路径以选定末级。",
    };
  }
  if (hit.length === 0) {
    return {
      level: "error",
      text: `路径不存在：第 1 级「${values[0]}」不在当前选项树里`,
      detail: `画布与发布页都不会预选任何项（触发器回落占位文字）。可选首级：${tree.map((o) => o.value).join("、") || "（无）"}`,
    };
  }
  return {
    level: "warn",
    text: `只命中前 ${hit.length} 级：${hitLabel}`,
    detail: `第 ${hit.length + 1} 级「${values[hit.length]}」不存在，实际只会选到「${hit[hit.length - 1].label}」。`,
  };
}

/**
 * 面板「默认选中路径」的动态候选：由当前选项树枚举**所有合法路径**。
 *
 * 为什么需要：该字段此前是自由文本，用户得记住每一级的提交值再手拼 `zhejiang/hangzhou/xihu`，
 * 拼错时两端都静默不预选（只能靠 diagnose 事后发现）。改成候选列表后「从树里挑」即可，
 * 而 `editable` 仍保留手输（接口模式 / 数据还没填时要能先写路径）。
 *
 * value 用 `/` 连接的各级提交值 —— 与 `parseCascaderValue` 接受的格式完全一致；
 * label 用 ` / ` 连接的各级显示名，便于肉眼核对层级。
 * 空/未配置时 `parseCascaderStaticOptions` 会回退内置示例树，与画布所示一致（不会给出对不上的候选）。
 */
export function cascaderPathOptions(
  raw: unknown,
  maxItems = 300,
): Array<{ label: string; value: string }> {
  const tree = parseCascaderStaticOptions(raw);
  const out: Array<{ label: string; value: string }> = [];
  const walk = (nodes: CascaderOption[], values: string[], labels: string[]): void => {
    for (const node of nodes) {
      const nextValues = [...values, node.value];
      const nextLabels = [...labels, node.label || node.value];
      if (out.length < maxItems) {
        out.push({ label: nextLabels.join(" / "), value: nextValues.join("/") });
      }
      const kids = node.children ?? [];
      if (kids.length) walk(kids, nextValues, nextLabels);
    }
  };
  walk(tree, [], []);
  return out;
}

/** 级联选择的提交值口径（面板「提交值」下拉的三个选项） */
export type CascaderSubmitMode = "leaf" | "path" | "labelPath";

/**
 * 提交值派生：
 * - `leaf`      末级提交值（默认，最常见的 `region=xihu`）
 * - `path`      完整路径的**提交值**串（`zhejiang/hangzhou/xihu`，机器可读）
 * - `labelPath` 完整路径的**显示名**串（`浙江/杭州/西湖区`，人可读，用于直接入库展示）
 */
export function cascaderSubmitValue(
  path: CascaderOption[],
  submitMode: CascaderSubmitMode,
  separator: string,
): string {
  if (!path.length) return "";
  if (submitMode === "path") return path.map((o) => o.value).join(separator);
  if (submitMode === "labelPath") return path.map((o) => o.label).join(separator);
  return path[path.length - 1].value;
}
