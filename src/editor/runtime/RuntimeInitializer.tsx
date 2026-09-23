import { useEffect } from "react";
import { useEventBindings } from "../hooks/useEventBindings";
import type { SceneDSL } from "../../types/scene";

interface RuntimeInitializerProps {
  scene: SceneDSL | null;
  injectedVariables?: Record<string, unknown>;
}

/**
 * RuntimeInitializer - 运行时初始化组件
 * 在预览/运行模式下初始化事件绑定和场景变量
 */
export function RuntimeInitializer({ scene, injectedVariables }: RuntimeInitializerProps) {
  // 初始化事件绑定 - 将 store 中的 eventBindings 同步到 EventBindingEngine
  useEventBindings();

  // 初始化场景变量
  useEffect(() => {
    if (!scene?.variables) return;

    const variables = scene.variables;

    // 首先设置默认值
    for (const variable of variables) {
      if (variable.defaultValue !== undefined) {
        // 通过 store 更新变量值（如果 store 有相应方法）
        // 暂时通过 eventBindings 机制间接处理
      }
    }

    // 然后应用注入的变量（来自导航传递）
    if (injectedVariables) {
      for (const [name, value] of Object.entries(injectedVariables)) {
        const variable = variables.find((v) => v.name === name);
        if (variable) {
          variable.currentValue = value;
        }
      }
    }
  }, [scene, injectedVariables]);

  return null;
}
