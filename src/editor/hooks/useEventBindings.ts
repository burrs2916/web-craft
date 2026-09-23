import { useEffect, useRef } from "react";
import { useEventBindingEngine } from "../context/SceneEditorContext";
import { useEditorStore } from "../../store/editorStore";
import { buildComponentTree } from "../utils/componentTree";

export function useEventBindings() {
  const eventBindingEngine = useEventBindingEngine();
  const prevIdsRef = useRef<Set<string>>(new Set());
  const prevCompIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!eventBindingEngine) return;

    // 同步组件树到事件引擎（用于事件冒泡）
    const syncComponentTree = () => {
      const components = useEditorStore.getState().components;
      // 仅在组件 ID 集合变化时才重建组件树
      const compIds = new Set(components.map(c => c.id));
      if (compIds.size === prevCompIdsRef.current.size && [...compIds].every(id => prevCompIdsRef.current.has(id))) {
        return;
      }
      prevCompIdsRef.current = compIds;
      eventBindingEngine.setComponentTree(buildComponentTree(components));
    };
    syncComponentTree();

    const unsub = useEditorStore.subscribe((state) => {
      // 组件变化时更新组件树（按需）
      syncComponentTree();

      const currentBindings = state.eventBindings ?? [];
      const currentIds = new Set(currentBindings.map(b => b.id));

      for (const id of prevIdsRef.current) {
        if (!currentIds.has(id)) {
          eventBindingEngine.unregisterBinding(id);
        }
      }

      for (const binding of currentBindings) {
        if (!prevIdsRef.current.has(binding.id)) {
          eventBindingEngine.registerBinding(binding);
        }
      }

      prevIdsRef.current = currentIds;
    });

    const state = useEditorStore.getState();
    if (state.eventBindings.length > 0) {
      eventBindingEngine.setupFromBindings(state.eventBindings);
      prevIdsRef.current = new Set(state.eventBindings.map(b => b.id));
    }

    return () => {
      eventBindingEngine.clear();
      prevIdsRef.current.clear();
      prevCompIdsRef.current.clear();
      unsub();
    };
  }, [eventBindingEngine]);
}
