/**
 * 组件树工具
 *
 * 从扁平的 SceneComponent[] 构建 parentId → children 映射，
 * 提供父链遍历能力（用于事件冒泡）。
 */

import type { SceneComponent } from "../../types/editor";

export interface ComponentTree {
  /** childId → parentId */
  parentMap: Map<string, string | null>;
  /** parentId → childrenIds[] */
  childrenMap: Map<string, string[]>;
  /** componentId → component */
  componentMap: Map<string, SceneComponent>;
}

/** 从组件列表构建组件树映射 */
export function buildComponentTree(components: SceneComponent[]): ComponentTree {
  const parentMap = new Map<string, string | null>();
  const childrenMap = new Map<string, string[]>();
  const componentMap = new Map<string, SceneComponent>();

  for (const comp of components) {
    componentMap.set(comp.id, comp);
    parentMap.set(comp.id, comp.parentId ?? null);

    const parentId = comp.parentId;
    if (parentId) {
      const siblings = childrenMap.get(parentId) ?? [];
      siblings.push(comp.id);
      childrenMap.set(parentId, siblings);
    }
  }

  return { parentMap, childrenMap, componentMap };
}

/**
 * 获取从目标组件到根的父链（不含目标自身）。
 * 例如 A → B → C（C 是根），getParentChain("A") = ["B", "C"]
 */
export function getParentChain(tree: ComponentTree, componentId: string): string[] {
  const chain: string[] = [];
  let current = tree.parentMap.get(componentId);
  const visited = new Set<string>([componentId]); // 防环

  while (current && !visited.has(current)) {
    chain.push(current);
    visited.add(current);
    current = tree.parentMap.get(current) ?? null;
  }

  return chain;
}

/** 获取组件的直接父组件 ID */
export function getParent(tree: ComponentTree, componentId: string): string | null {
  return tree.parentMap.get(componentId) ?? null;
}

/** 获取组件的直接子组件 ID 列表 */
export function getChildren(tree: ComponentTree, componentId: string): string[] {
  return tree.childrenMap.get(componentId) ?? [];
}
