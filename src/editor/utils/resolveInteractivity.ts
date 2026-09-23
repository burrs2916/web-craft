import type { EventBinding } from "../../types/editor";

/**
 * 检测指定组件在预览/运行时是否应启用交互。
 * 纯函数，无副作用，可在渲染循环中安全调用。
 *
 * 判定规则：
 * 1. 组件作为 sourceComponentId 出现在任意 EventBinding 中 → 可交互
 * 2. 存在通配符绑定 (sourceComponentId === '*' 或空字符串) → 所有组件可交互
 * 3. 组件作为 targetComponentId 出现在 action 为 highlight/hide/show 的绑定中 → 可交互（需要接收视觉变化）
 */
export interface InteractivityResult {
  isInteractive: boolean;
}

export function resolveInteractivity(
  componentId: string,
  eventBindings: EventBinding[],
): InteractivityResult {
  if (!eventBindings || eventBindings.length === 0) {
    return { isInteractive: false };
  }

  for (const binding of eventBindings) {
    // 通配符绑定 → 所有组件都可交互
    if (binding.sourceComponentId === "*" || !binding.sourceComponentId) {
      return { isInteractive: true };
    }

    // 组件作为事件源
    if (binding.sourceComponentId === componentId) {
      return { isInteractive: true };
    }

    // 组件作为需要视觉响应的目标（highlight/hide/show 等）
    if (
      binding.targetComponentId === componentId &&
      ["highlight", "hide", "show", "navigateToScene"].includes(binding.targetAction)
    ) {
      return { isInteractive: true };
    }
  }

  return { isInteractive: false };
}
