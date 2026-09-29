/**
 * 树形控件：默认数据、解析、归一、展开键与计数。
 * 从 tableData.ts 迁出，仅做代码搬迁。
 */

export interface TreeNodeModel {
  label: string;
  value?: string;
  /** 可选自定义图标（Material 名 / 自定义图标 id），供图标管线消费 */
  icon?: string;
  disabled?: boolean;
  children?: TreeNodeModel[];
}

/** 未配置时的占位树（两端同一份，勿再各写一份） */

export const DEFAULT_TREE_DATA: TreeNodeModel[] = [
  {
    label: "src",
    children: [
      {
        label: "editor",
        children: [
          { label: "renderers", children: [{ label: "TreeRenderer.tsx" }] },
          { label: "registry.ts" },
        ],
      },
      {
        label: "codegen",
        children: [
          { label: "components", children: [{ label: "tree.ts" }] },
          { label: "store" },
        ],
      },
      { label: "store" },
    ],
  },
  {
    label: "public",
    children: [{ label: "index.html" }],
  },
];

/** 是否递归包含任何带 children 的节点（用于"是否显示展开箭头"这类判断） */

export function hasBranch(nodes: TreeNodeModel[]): boolean {
  return nodes.some((n) => !!(n.children && n.children.length > 0));
}

/** 静态 JSON 文本 → 树节点；解析失败返回空数组 */

export function parseTreeNodes(input: unknown): TreeNodeModel[] {
  if (Array.isArray(input)) return normalizeTreePayload(input);
  if (typeof input !== "string") return [];
  const trimmed = input.trim();
  if (!trimmed.startsWith("[")) return [];
  try {
    return normalizeTreePayload(JSON.parse(trimmed));
  } catch {
    return [];
  }
}

/**
 * 任意树数据 → 规范节点树。
 * 标签别名 label|title|text|name；子节点键 children|nodes|items。
 * 无标签的节点被丢弃（与旧双端实现一致）。
 */

export function normalizeTreePayload(data: unknown): TreeNodeModel[] {
  if (!Array.isArray(data)) return [];
  const map = (raw: unknown): TreeNodeModel | null => {
    if (raw == null) return null;
    if (typeof raw === "string" || typeof raw === "number") {
      return { label: String(raw) };
    }
    if (typeof raw !== "object") return null;
    const rec = raw as Record<string, unknown>;
    const label = rec.label ?? rec.title ?? rec.text ?? rec.name;
    if (label == null || String(label) === "") return null;
    const node: TreeNodeModel = { label: String(label) };
    if (rec.value != null) node.value = String(rec.value);
    if (rec.icon != null) node.icon = String(rec.icon);
    if (rec.disabled != null) node.disabled = Boolean(rec.disabled);
    const kids = rec.children ?? rec.nodes ?? rec.items;
    if (Array.isArray(kids)) {
      const mapped = kids.map(map).filter((n): n is TreeNodeModel => n != null);
      if (mapped.length) node.children = mapped;
    }
    return node;
  };
  return data.map(map).filter((n): n is TreeNodeModel => n != null);
}

/**
 * 树数据的最终取值口径。
 * 接口模式 → 只认接口数据（无数据则空树）；静态模式 → staticData 优先，其次内容组 data，
 * 全空则落默认占位树。
 */

export function resolveTreeData(o: {
  config: Record<string, unknown>;
  fetched?: unknown;
}): TreeNodeModel[] {
  const { config, fetched } = o;
  const isApi = String(config.dataMode ?? "static") === "api";

  if (isApi) return normalizeTreePayload(fetched);

  if (config.staticData != null && config.staticData !== "") {
    let parsed: unknown = config.staticData;
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        parsed = null;
      }
    }
    const fromStatic = normalizeTreePayload(parsed);
    if (fromStatic.length > 0) return fromStatic;
  }

  const fromContent = parseTreeNodes(config.data);
  if (fromContent.length > 0) return fromContent;
  return DEFAULT_TREE_DATA;
}

/** 节点路径键（根为 "0"，子为 "0-2"）→ 默认展开集合；与两端渲染时使用的键完全一致 */

export function collectBranchKeys(nodes: TreeNodeModel[], prefix = ""): string[] {
  const keys: string[] = [];
  nodes.forEach((node, i) => {
    const key = `${prefix}${i}`;
    if (node.children && node.children.length > 0) {
      keys.push(key);
      // 子节点的键是「父键 + '-' + 索引」，与渲染器的 renderNode(child, `${key}-${i}`) 同口径
      keys.push(...collectBranchKeys(node.children, `${key}-`));
    }
  });
  return keys;
}

/** 按"默认展开层级"取应展开的键；level <= 0 表示不展开，>= 99 视为全部展开 */

export function collectKeysByLevel(
  nodes: TreeNodeModel[],
  expandLevel: number,
  prefix = "",
  depth = 1,
): string[] {
  const keys: string[] = [];
  if (expandLevel <= 0) return keys;
  nodes.forEach((node, i) => {
    const key = `${prefix}${i}`;
    if (node.children && node.children.length > 0 && depth <= expandLevel) {
      keys.push(key);
      keys.push(...collectKeysByLevel(node.children, expandLevel, `${key}-`, depth + 1));
    }
  });
  return keys;
}

/** 树节点总数（用于面板展示/空态判断） */

export function countTreeNodes(nodes: TreeNodeModel[]): number {
  return nodes.reduce((acc, n) => acc + 1 + (n.children ? countTreeNodes(n.children) : 0), 0);
}

/* ══════════════════════════════════════════════
 * 4. 分页（pagination）
 * ══════════════════════════════════════════════ */
