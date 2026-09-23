/**
 * Tabs 组件配置共享工具
 *
 * 编辑器(TabEditor / TabsRenderer / switchTab)和 codegen(tabsCodegen / buildTabSwitcherScript)
 * 两方共用，保证数据模型在编辑、预览、发布三层一致。
 *
 * 数据模型：
 * - config.tabs: JSON 字符串，解析后为 TabItem[] = [{ id, label, icon?, contentBg? }]
 * - config.activeTabId: string，当前激活标签 ID
 * - 子组件通过 config.__tabId 关联到对应标签（由 drop handler 设置）
 * - 一个标签页可包含多个子组件
 */

export interface TabItem {
  id: string;
  label: string;
  /** 标签图标：material:xxx / text:emoji / url / custom-xxx，空则无图标 */
  icon?: string;
  /** 此标签页内容区独立背景色，未设则回退到全局 config.contentBg */
  contentBg?: string | null;
}

const DEFAULT_TABS: TabItem[] = [
  { id: "tab-0", label: "标签 1" },
  { id: "tab-1", label: "标签 2" },
  { id: "tab-2", label: "标签 3" },
];

/**
 * 解析 config.tabs → TabItem[]
 * 兼容三种格式：
 * 1. JSON 字符串 '[{"id":"tab-0","label":"标签 1"},...]'（新格式）
 * 2. 旧换行分隔字符串 "标签 1\n标签 2\n标签 3"
 * 3. undefined / null → 默认 3 个标签
 */
export function parseTabs(config: Record<string, unknown>): TabItem[] {
  const raw = config.tabs;
  if (raw == null) return [...DEFAULT_TABS];

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    // 新格式：JSON 数组
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((t, i) => ({
            id: String(t?.id ?? `tab-${i}`),
            label: String(t?.label ?? `标签 ${i + 1}`),
            icon: t?.icon != null ? String(t.icon) : undefined,
            contentBg: t?.contentBg != null ? String(t.contentBg) : undefined,
          }));
        }
        if (Array.isArray(parsed) && parsed.length === 0) return [{ id: "tab-0", label: "标签 1" }];
      } catch {
        // JSON 解析失败，回退到换行格式
      }
    }
    // 旧格式：换行分隔
    const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
    if (lines.length > 0) {
      return lines.map((label, i) => ({
        id: `tab-${i}`,
        label,
      }));
    }
  }

  // 已经是数组（理论上 config 不该直接存数组，但做兼容）
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((t, i) => ({
      id: String((t as Record<string, unknown>)?.id ?? `tab-${i}`),
      label: String((t as Record<string, unknown>)?.label ?? `标签 ${i + 1}`),
      icon: (t as Record<string, unknown>)?.icon != null ? String((t as Record<string, unknown>).icon) : undefined,
      contentBg: (t as Record<string, unknown>)?.contentBg != null ? String((t as Record<string, unknown>).contentBg) : undefined,
    }));
  }

  return [...DEFAULT_TABS];
}

/** 序列化 TabItem[] → JSON 字符串（用于 config 存储） */
export function serializeTabs(tabs: TabItem[]): string {
  return JSON.stringify(tabs, null, 2);
}

/**
 * 获取当前激活标签 ID
 * 优先用 config.activeTabId（string），回退到旧 config.activeTab（number→转 id）
 */
export function getActiveTabId(config: Record<string, unknown>, tabs: TabItem[]): string {
  const id = config.activeTabId;
  if (typeof id === "string" && tabs.some((t) => t.id === id)) return id;

  // 回退：旧 activeTab 数字索引
  const oldIdx = Number(config.activeTab ?? 0);
  const clampedIdx = Math.min(Math.max(0, oldIdx), Math.max(0, tabs.length - 1));
  return tabs[clampedIdx]?.id ?? tabs[0]?.id ?? "";
}

/** 生成唯一标签 ID */
export function genTabId(): string {
  return `tab-${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 5)}`;
}

/**
 * 获取子组件所属的标签 ID
 * 优先读 child.config.__tabId（新机制）
 * 回退：按 children 数组索引分配（兼容旧数据）
 */
export function getChildTabId(
  childConfig: Record<string, unknown>,
  tabs: TabItem[],
  fallbackIndex: number,
): string {
  const tid = childConfig.__tabId;
  if (typeof tid === "string" && tabs.some((t) => t.id === tid)) return tid;
  // 回退：按索引分配
  const clampedIdx = Math.min(fallbackIndex, Math.max(0, tabs.length - 1));
  return tabs[clampedIdx]?.id ?? tabs[0]?.id ?? "";
}
