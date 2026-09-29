import { useCallback, useState } from "react";
import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useEditorStore } from "../../../store/editorStore";
import type { LayerNode } from "../../../types/editor";
import { getLayerDescendants } from "../../../types/editor";

export interface LayerContextMenuState {
  layerId: string;
  x: number;
  y: number;
}

/**
 * 图层面板的状态与交互逻辑：选中/重命名、新建/复制/删除/移动、拖拽排序与编组、右键菜单。
 * 视图部分见 index.tsx、LayerInspector.tsx、LayerContextMenu.tsx。
 */
export function useLayerPanelState() {
  const layers = useEditorStore((s) => s.layers);
  const components = useEditorStore((s) => s.components);
  const addLayer = useEditorStore((s) => s.addLayer);
  const addLayerGroup = useEditorStore((s) => s.addLayerGroup);
  const removeLayer = useEditorStore((s) => s.removeLayer);
  const updateLayer = useEditorStore((s) => s.updateLayer);
  const toggleLayerVisibility = useEditorStore((s) => s.toggleLayerVisibility);
  const toggleLayerLock = useEditorStore((s) => s.toggleLayerLock);
  const toggleLayerExpanded = useEditorStore((s) => s.toggleLayerExpanded);
  const reorderLayer = useEditorStore((s) => s.reorderLayer);
  const moveLayerToParent = useEditorStore((s) => s.moveLayerToParent);
  const selectComponent = useEditorStore((s) => s.selectComponent);
  const setHoveredComponent = useEditorStore((s) => s.setHoveredComponent);
  const removeComponent = useEditorStore((s) => s.removeComponent);
  const updateComponent = useEditorStore((s) => s.updateComponent);
  const selection = useEditorStore((s) => s.selection);

  const toggleComponentVisibility = useCallback(
    (id: string) => {
      const comp = components.find((c) => c.id === id);
      if (comp) {
        updateComponent(id, { visible: !comp.visible });
      }
    },
    [components, updateComponent]
  );

  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  const [dragOverLayerId, setDragOverLayerId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<"top" | "bottom" | "middle" | null>(null);
  const [contextMenu, setContextMenu] = useState<LayerContextMenuState | null>(null);

  const layerMap = new Map(layers.map((l) => [l.id, l]));
  const rootLayers = layers
    .filter((l) => l.parentId === null)
    .sort((a, b) => b.order - a.order);

  const selectedLayer = layers.find((l) => l.id === selectedLayerId);

  const handleLayerClick = useCallback(
    (layerId: string) => {
      setSelectedLayerId(layerId);
      const state = useEditorStore.getState();
      const layer = state.layers.find(l => l.id === layerId);
      if (layer?.type === "layer") {
        state.setActiveLayer(layerId);
      }
    },
    []
  );

  const handleLayerDoubleClick = useCallback(
    (layerId: string) => {
      const layer = layerMap.get(layerId);
      if (!layer) return;
      setEditingLayerId(layerId);
      setEditValue(layer.name);
    },
    [layerMap]
  );

  const handleEditBlur = useCallback(() => {
    if (editingLayerId && editValue.trim()) {
      updateLayer(editingLayerId, { name: editValue.trim() });
    }
    setEditingLayerId(null);
  }, [editingLayerId, editValue, updateLayer]);

  const handleEditKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key === "Enter") {
        handleEditBlur();
      } else if (e.key === "Escape") {
        setEditingLayerId(null);
      }
    },
    [handleEditBlur]
  );

  const handleAddLayer = useCallback(() => {
    const targetParent =
      selectedLayerId && layerMap.get(selectedLayerId)?.type === "group"
        ? selectedLayerId
        : null;
    const layer = addLayer(undefined, targetParent);
    setSelectedLayerId(layer.id);
  }, [addLayer, selectedLayerId, layerMap]);

  const handleAddGroup = useCallback(() => {
    const targetParent =
      selectedLayerId && layerMap.get(selectedLayerId)?.type === "group"
        ? selectedLayerId
        : null;
    const group = addLayerGroup(undefined, targetParent);
    setSelectedLayerId(group.id);
  }, [addLayerGroup, selectedLayerId, layerMap]);

  const handleDuplicateLayer = useCallback(() => {
    if (!selectedLayerId) return;
    const source = layerMap.get(selectedLayerId);
    if (!source) return;
    if (source.type === "group") {
      const group = addLayerGroup(`${source.name} 副本`, source.parentId);
      setSelectedLayerId(group.id);
    } else {
      const layer = addLayer(`${source.name} 副本`, source.parentId);
      const layerComps = components.filter((c) => c.layerId === source.id);
      const addComp = useEditorStore.getState().addComponent;
      layerComps.forEach((comp) => {
        addComp(comp.type, layer.id, {
          x: comp.transform.x + 20,
          y: comp.transform.y + 20,
        });
      });
      setSelectedLayerId(layer.id);
    }
  }, [selectedLayerId, layerMap, addLayer, addLayerGroup, components]);

  const handleMoveUp = useCallback(
    (layer: LayerNode) => {
      const siblings = layers
        .filter((l) => l.parentId === layer.parentId)
        .sort((a, b) => b.order - a.order);
      const idx = siblings.findIndex((s) => s.id === layer.id);
      if (idx > 0) {
        const above = siblings[idx - 1];
        reorderLayer(layer.id, above.order);
        reorderLayer(above.id, layer.order);
      }
    },
    [layers, reorderLayer]
  );

  const handleMoveDown = useCallback(
    (layer: LayerNode) => {
      const siblings = layers
        .filter((l) => l.parentId === layer.parentId)
        .sort((a, b) => b.order - a.order);
      const idx = siblings.findIndex((s) => s.id === layer.id);
      if (idx < siblings.length - 1) {
        const below = siblings[idx + 1];
        reorderLayer(layer.id, below.order);
        reorderLayer(below.id, layer.order);
      }
    },
    [layers, reorderLayer]
  );

  const resetDragState = useCallback(() => {
    setDragSourceId(null);
    setDragOverLayerId(null);
    setDragOverPosition(null);
  }, []);

  const handleDragStart = useCallback(
    (e: ReactDragEvent, layerId: string) => {
      const layer = layerMap.get(layerId);
      if (layer?.locked) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData("application/x-layer-id", layerId);
      e.dataTransfer.effectAllowed = "move";
      setDragSourceId(layerId);
      console.log(`[LayerDrag] start: ${layerId}`);
    },
    [layerMap]
  );

  const handleDragOver = useCallback(
    (e: ReactDragEvent, targetId: string) => {
      e.preventDefault();
      e.stopPropagation();

      const sourceId = dragSourceId;
      if (!sourceId || sourceId === targetId) return;

      const targetLayer = layerMap.get(targetId);
      if (!targetLayer) return;

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const y = e.clientY - rect.top;
      const height = rect.height;
      const ratio = y / height;

      let position: "top" | "bottom" | "middle";
      if (targetLayer.type === "group" && ratio > 0.25 && ratio < 0.75) {
        position = "middle";
      } else if (ratio <= 0.5) {
        position = "top";
      } else {
        position = "bottom";
      }

      setDragOverLayerId(targetId);
      setDragOverPosition(position);
    },
    [dragSourceId, layerMap]
  );

  const handleDragLeave = useCallback(() => {
    setDragOverLayerId(null);
    setDragOverPosition(null);
  }, []);

  const handleDrop = useCallback(
    (e: ReactDragEvent, targetId: string) => {
      e.preventDefault();
      e.stopPropagation();

      const sourceId = e.dataTransfer.getData("application/x-layer-id");
      if (!sourceId || sourceId === targetId) {
        resetDragState();
        return;
      }

      const sourceLayer = layerMap.get(sourceId);
      const targetLayer = layerMap.get(targetId);
      if (!sourceLayer || !targetLayer) {
        resetDragState();
        return;
      }

      const descendants = getLayerDescendants(layers, targetId);
      if (descendants.includes(sourceId)) {
        resetDragState();
        return;
      }

      if (dragOverPosition === "middle" && targetLayer.type === "group") {
        moveLayerToParent(sourceId, targetId);
        console.log(`[LayerDrag] move ${sourceId} into group ${targetId}`);
      } else {
        moveLayerToParent(sourceId, targetLayer.parentId);

        const siblings = layers
          .filter((l) => l.parentId === targetLayer.parentId && l.id !== sourceId)
          .sort((a, b) => b.order - a.order);

        const targetIdx = siblings.findIndex((s) => s.id === targetId);
        if (targetIdx !== -1) {
          const insertIdx =
            dragOverPosition === "top" ? targetIdx : targetIdx + 1;

          siblings.splice(insertIdx, 0, sourceLayer);

          siblings.forEach((s, i) => {
            reorderLayer(s.id, siblings.length - 1 - i);
          });
        }
        console.log(`[LayerDrag] reorder ${sourceId} ${dragOverPosition} ${targetId}`);
      }

      resetDragState();
    },
    [dragOverPosition, layerMap, layers, moveLayerToParent, reorderLayer, resetDragState]
  );

  const handleDragEnd = useCallback(() => {
    resetDragState();
  }, [resetDragState]);

  const handleContextMenu = useCallback(
    (e: ReactMouseEvent, layerId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setSelectedLayerId(layerId);
      setContextMenu({ layerId, x: e.clientX, y: e.clientY });
    },
    []
  );

  const handleContextClose = useCallback(() => {
    setContextMenu(null);
  }, []);

  return {
    // store data
    layers,
    components,
    selection,
    // store actions
    addLayerGroup,
    removeLayer,
    updateLayer,
    toggleLayerVisibility,
    toggleLayerLock,
    toggleLayerExpanded,
    moveLayerToParent,
    selectComponent,
    setHoveredComponent,
    removeComponent,
    toggleComponentVisibility,
    // derived
    layerMap,
    rootLayers,
    selectedLayer,
    // local state
    selectedLayerId,
    setSelectedLayerId,
    editingLayerId,
    editValue,
    setEditValue,
    dragOverLayerId,
    dragOverPosition,
    contextMenu,
    // handlers
    handleLayerClick,
    handleLayerDoubleClick,
    handleEditBlur,
    handleEditKeyDown,
    handleAddLayer,
    handleAddGroup,
    handleDuplicateLayer,
    handleMoveUp,
    handleMoveDown,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
    handleContextMenu,
    handleContextClose,
  };
}