/**
 * 场景变量全局 Store
 *
 * 替代旧的 window.__sceneVariables 挂载方式。
 * - 使用 Zustand 管理，支持 subscribe
 * - persist 中间件持久化到 sessionStorage（页面刷新不丢失）
 * - BroadcastChannel 跨标签页/窗口同步
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface SceneVariableState {
  variables: Record<string, unknown>;
  /** 设置场景变量（触发订阅通知 + 跨窗口广播） */
  setVariable: (name: string, value: unknown) => void;
  /** 读取场景变量 */
  getVariable: (name: string) => unknown;
  /** 清空所有场景变量 */
  clearSceneVariables: () => void;
}

// BroadcastChannel 跨窗口同步（同源场景）
let bc: BroadcastChannel | null = null;
try {
  bc = new BroadcastChannel("webcraft:sceneVariables");
} catch {
  // 非浏览器环境或不支持 BroadcastChannel
}

export const useSceneVariableStore = create<SceneVariableState>()(
  persist(
    (set, get) => ({
      variables: {},

      setVariable: (name, value) => {
        set((state) => ({
          variables: { ...state.variables, [name]: value },
        }));
        // 跨窗口广播
        try {
          bc?.postMessage({ type: "set", name, value });
        } catch {
          /* swallow */
        }
      },

      getVariable: (name) => {
        return get().variables[name];
      },

      clearSceneVariables: () => {
        set({ variables: {} });
        try {
          bc?.postMessage({ type: "clear" });
        } catch {
          /* swallow */
        }
      },
    }),
    {
      name: "webcraft-scene-variables",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ variables: state.variables }),
    },
  ),
);

/**
 * 订阅单个场景变量变化，返回取消函数。
 * 独立于 store 定义以避免类型循环引用。
 */
export function subscribeSceneVariable(name: string, cb: (value: unknown) => void): () => void {
  let lastValue = useSceneVariableStore.getState().variables[name];
  return useSceneVariableStore.subscribe((state) => {
    const newVal = state.variables[name];
    if (newVal !== lastValue) {
      lastValue = newVal;
      cb(newVal);
    }
  });
}

/** 命令式读取场景变量（非 React 组件中使用） */
export function getSceneVariable(name: string): unknown {
  return useSceneVariableStore.getState().variables[name];
}

/** 命令式设置场景变量（非 React 组件中使用） */
export function setSceneVariable(name: string, value: unknown): void {
  useSceneVariableStore.getState().setVariable(name, value);
}

// 监听其他窗口的变量变更，同步到本窗口 store（不回播，避免循环）
if (bc) {
  bc.onmessage = (event: MessageEvent) => {
    const msg = event.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "set" && typeof msg.name === "string") {
      useSceneVariableStore.setState((state: SceneVariableState) => ({
        variables: { ...state.variables, [msg.name]: msg.value },
      }));
    } else if (msg.type === "clear") {
      useSceneVariableStore.setState({ variables: {} });
    }
  };
}
