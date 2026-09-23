import type { ComponentCategory, ComponentCategoryNode, ComponentPluginItem } from "../types/component";

/**
 * 判断组件是否属于指定分类，与 buildCategoryTree 的匹配逻辑保持一致。
 * 匹配规则：直接匹配 → 加 ccat_ 前缀 → 替换 - 为 _
 */
export function isPluginInCategory(plugin: ComponentPluginItem, categoryId: string): boolean {
  if (!plugin.category) return false;
  if (plugin.category === categoryId) return true;
  // 尝试加 ccat_ 前缀
  if (!plugin.category.startsWith("ccat_") && `ccat_${plugin.category}` === categoryId) return true;
  // 尝试替换 - 为 _
  if (plugin.category.replace(/-/g, "_") === categoryId) return true;
  // 反向：categoryId 去 ccat_ 前缀匹配
  if (categoryId.startsWith("ccat_") && plugin.category === categoryId.replace("ccat_", "")) return true;
  return false;
}

export function buildCategoryTree(
  categories: ComponentCategory[],
  plugins: ComponentPluginItem[]
): ComponentCategoryNode[] {
  const nodeMap = new Map<string, ComponentCategoryNode>();

  for (const cat of categories) {
    nodeMap.set(cat.id, {
      id: cat.id,
      name: cat.name,
      icon: cat.icon,
      color: cat.color,
      sortOrder: cat.sortOrder ?? 0,
      description: cat.description,
      children: [],
      plugins: [],
    });
  }

  for (const plugin of plugins) {
    let catId = plugin.category;
    // 空字符串或 undefined = 未分组，不归入任何 category
    if (!catId) continue;

    let node = nodeMap.get(catId);
    if (!node && !catId.startsWith("ccat_")) {
      catId = `ccat_${catId}`;
      node = nodeMap.get(catId);
    }
    if (!node && catId.includes("-")) {
      catId = catId.replace(/-/g, "_");
      node = nodeMap.get(catId);
    }
    if (node) {
      node.plugins.push(plugin);
    }
    // 找不到对应 category 的 plugin 视为未分组，不 fallback
  }

  // 扁平结构：所有节点都是根节点，按 sortOrder 排序
  const roots = Array.from(nodeMap.values());
  roots.sort((a, b) => a.sortOrder - b.sortOrder);
  return roots;
}

/** 获取未分组的组件列表 */
export function getUngroupedPlugins(
  categories: ComponentCategory[],
  plugins: ComponentPluginItem[]
): ComponentPluginItem[] {
  return plugins.filter((p) => {
    if (!p.category) return true;
    // 使用 isPluginInCategory 统一匹配，覆盖 ccat_ 前缀和连字符替换
    return !categories.some((c) => isPluginInCategory(p, c.id));
  });
}

export function countAllPlugins(node: ComponentCategoryNode): number {
  let count = node.plugins.length;
  if (node.children) {
    for (const child of node.children) {
      count += countAllPlugins(child);
    }
  }
  return count;
}

export function collectPluginTypes(node: ComponentCategoryNode): Set<string> {
  const types = new Set<string>();
  node.plugins.forEach((p) => types.add(p.type));
  return types;
}
