import { useEffect, useRef } from "react";
import { useViewportSyncService } from "../context/SceneEditorContext";
import { useSceneStore } from "../../store/sceneStore";

export function useViewportSyncRules() {
  const viewportSyncService = useViewportSyncService();
  const prevRuleKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!viewportSyncService) return;

    const unsub = useSceneStore.subscribe((state) => {
      const activeSceneId = state.activeSceneId;
      if (!activeSceneId) return;

      const scene = state.scenes.find(s => s.id === activeSceneId);
      if (!scene) return;

      const rules = (scene.viewportSyncRules ?? []) as any[];
      const currentKeys = new Set(rules.map(r => `${r.sourceId}->${r.targetId}`));

      for (const key of prevRuleKeysRef.current) {
        if (!currentKeys.has(key)) {
          const [sourceId, targetId] = key.split('->');
          viewportSyncService.removeSyncRule(sourceId, targetId);
        }
      }

      for (const rule of rules) {
        const key = `${rule.sourceId}->${rule.targetId}`;
        if (!prevRuleKeysRef.current.has(key)) {
          viewportSyncService.addSyncRule(rule);
        }
      }

      prevRuleKeysRef.current = currentKeys;
    });

    const state = useSceneStore.getState();
    const activeSceneId = state.activeSceneId;
    if (activeSceneId) {
      const scene = state.scenes.find(s => s.id === activeSceneId);
      const rules = (scene?.viewportSyncRules ?? []) as any[];
      if (rules.length > 0) {
        for (const rule of rules) {
          viewportSyncService.addSyncRule(rule);
        }
        prevRuleKeysRef.current = new Set(rules.map(r => `${r.sourceId}->${r.targetId}`));
      }
    }

    return () => {
      for (const key of prevRuleKeysRef.current) {
        const [sourceId, targetId] = key.split('->');
        viewportSyncService.removeSyncRule(sourceId, targetId);
      }
      prevRuleKeysRef.current.clear();
      unsub();
    };
  }, [viewportSyncService]);
}
