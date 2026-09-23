import { createContext, useContext, useRef, useEffect, type ReactNode } from "react";
import { SpatialLayerRegistry } from "../layers/SpatialLayerRegistry";
import { SceneEventDispatcher } from "../events/SceneEventDispatcher";
import { EventBindingEngine } from "../events/EventBindingEngine";
import { CoordinateEngine } from "../spatial/CoordinateEngine";
import { ViewportSyncService } from "../spatial/ViewportSyncService";
import { globalClock } from "../spatial/Clock";
import { ToolRegistry, type ToolContext } from "../tools/Tool";
import { DataOrchestrator, type ComponentDataBridge } from "../../datasource/orchestration/DataOrchestrator";
import { DataBindingEngine } from "../../datasource/binding/DataBindingEngine";
import { PanTool, ZoomTool, SelectTool } from "../tools/BuiltinTools";
import { useComponentLayerSync } from "../hooks/useComponentLayerSync";
import { useEditorLayerSync } from "../hooks/useEditorLayerSync";
import { useEventBindings } from "../hooks/useEventBindings";
import { injectGlobalCoordinateEngine, injectGlobalLayerRegistry, injectGlobalClock, injectGlobalViewportSyncService, injectGlobalDataOrchestrator, injectGlobalEventDispatcher, setGlobalStoreUpdater, setGlobalSceneStateProvider, type SceneStateProvider } from "../plugins/HostAPI";
import type { CRSType } from "../../types/spatial";
import type { ViewportProvider } from "../spatial/ViewportSyncService";
import { useEditorStore } from "../../store/editorStore";
import { useSceneStore } from "../../store/sceneStore";
import type * as THREE from "three";

export interface SceneEditorCore {
  layerRegistry: SpatialLayerRegistry;
  eventDispatcher: SceneEventDispatcher;
  eventBindingEngine: EventBindingEngine;
  coordinateEngine: CoordinateEngine;
  viewportSyncService: ViewportSyncService;
  toolRegistry: ToolRegistry;
  dataOrchestrator: DataOrchestrator;
  clock: typeof globalClock;
  /** 注册 Three.js WebGLRenderer 获取器（由 CADMapRenderer 等组件调用） */
  registerRendererGetter(getter: (() => THREE.WebGLRenderer | null) | null): void;
  /** 获取当前 WebGLRenderer（供 PerformanceMonitor 使用） */
  getRenderer(): THREE.WebGLRenderer | null;
}

const SceneEditorContext = createContext<SceneEditorCore | null>(null);

export function useSceneEditorCore(): SceneEditorCore | null {
  return useContext(SceneEditorContext);
}

export function useLayerRegistry(): SpatialLayerRegistry | null {
  return useContext(SceneEditorContext)?.layerRegistry ?? null;
}

export function useEventDispatcher(): SceneEventDispatcher | null {
  return useContext(SceneEditorContext)?.eventDispatcher ?? null;
}

export function useCoordinateEngine(): CoordinateEngine | null {
  return useContext(SceneEditorContext)?.coordinateEngine ?? null;
}

export function useToolRegistry(): ToolRegistry | null {
  return useContext(SceneEditorContext)?.toolRegistry ?? null;
}

export function useDataOrchestrator(): DataOrchestrator | null {
  return useContext(SceneEditorContext)?.dataOrchestrator ?? null;
}

export function useComponentDataBridge(): ComponentDataBridge | null {
  return useContext(SceneEditorContext)?.dataOrchestrator?.getBridge() ?? null;
}

export function useViewportSyncService(): ViewportSyncService | null {
  return useContext(SceneEditorContext)?.viewportSyncService ?? null;
}

export function useClock(): typeof globalClock | null {
  return useContext(SceneEditorContext)?.clock ?? null;
}

export function useEventBindingEngine(): EventBindingEngine | null {
  return useContext(SceneEditorContext)?.eventBindingEngine ?? null;
}

export { SceneEditorContext };

function resolveViewportFromLayers(layerRegistry: SpatialLayerRegistry): { centerX: number; centerY: number; zoom: number; width: number; height: number } {
  const layers = layerRegistry.getVisibleLayers();
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i] as unknown;
    if (layer && typeof (layer as ViewportProvider).getViewport === 'function') {
      try {
        const snapshot = (layer as ViewportProvider).getViewport();
        if (snapshot && typeof snapshot.centerX === 'number' && snapshot.width > 0) {
          return {
            centerX: snapshot.centerX,
            centerY: snapshot.centerY,
            zoom: snapshot.zoom,
            width: snapshot.width,
            height: snapshot.height,
          };
        }
      } catch {}
    }
  }
  return { centerX: 0, centerY: 0, zoom: 1, width: 0, height: 0 };
}

function createSceneToolContext(
  layerRegistry: SpatialLayerRegistry,
  coordinateEngine: CoordinateEngine,
  crs: CRSType,
  eventDispatcher: SceneEventDispatcher,
  viewportSyncService?: ViewportSyncService,
): ToolContext {
  return {
    getActiveLayerId: () => {
      const layers = layerRegistry.getVisibleLayers();
      return layers.length > 0 ? layers[layers.length - 1].id : null;
    },
    getSelectedEntityIds: () => {
      return useEditorStore.getState().selection.selectedIds;
    },
    selectEntity: (id: string, multi?: boolean) => {
      useEditorStore.getState().selectComponent(id, multi);
    },
    deselectAll: () => {
      useEditorStore.getState().deselectAll();
    },
    getViewport: () => {
      return resolveViewportFromLayers(layerRegistry);
    },
    setViewport: (centerX: number, centerY: number, zoom: number) => {
      const snapshot = {
        centerX,
        centerY,
        zoom,
        bearing: 0,
        pitch: 0,
        width: 0,
        height: 0,
        crs,
      };

      if (viewportSyncService) {
        const layers = layerRegistry.getVisibleLayers();
        const sourceId = layers.length > 0 ? layers[layers.length - 1].id : '';
        viewportSyncService.syncAllFrom(sourceId, snapshot);
        return;
      }

      const layers = layerRegistry.getVisibleLayers();
      for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i] as unknown;
        if (layer && typeof (layer as ViewportProvider).setViewport === 'function') {
          try {
            (layer as ViewportProvider).setViewport(snapshot);
          } catch {}
          break;
        }
      }
    },
    screenToWorld: (screenX: number, screenY: number) => {
      const vp = resolveViewportFromLayers(layerRegistry);
      return coordinateEngine.screenToWorld(
        { x: screenX, y: screenY },
        crs,
        { panX: vp.centerX, panY: vp.centerY, zoom: vp.zoom, rotation: 0, width: vp.width, height: vp.height },
      );
    },
    worldToScreen: (worldX: number, worldY: number) => {
      const vp = resolveViewportFromLayers(layerRegistry);
      return coordinateEngine.worldToScreen(
        { x: worldX, y: worldY },
        crs,
        { panX: vp.centerX, panY: vp.centerY, zoom: vp.zoom, rotation: 0, width: vp.width, height: vp.height },
      );
    },
    emitEvent: (eventName: string, payload?: unknown) => {
      eventDispatcher.emitToolEvent(eventName, payload);
    },
  };
}

export function SceneEditorProvider({ children, crs, mode = 'edit' }: { children: ReactNode; crs?: CRSType; mode?: 'edit' | 'preview' }) {
  const isEditMode = mode === 'edit';
  const coreRef = useRef<SceneEditorCore | null>(null);
  const initializedRef = useRef(false);

  if (!coreRef.current) {
    const layerRegistry = new SpatialLayerRegistry();
    const coordinateEngine = new CoordinateEngine();
    const viewportSyncService = new ViewportSyncService();
    viewportSyncService.setCoordinateEngine(coordinateEngine);
    const bindingEngine = new DataBindingEngine();
    const dataOrchestrator = new DataOrchestrator(bindingEngine);
    const eventDispatcher = new SceneEventDispatcher({
      layerRegistry,
      defaultRoutePolicy: "penetrate",
      crs: crs || "EPSG:3857",
      coordinateEngine,
    });
    const toolRegistry = new ToolRegistry();

    const eventBindingEngine = new EventBindingEngine();
    eventBindingEngine.setEventDispatcher(eventDispatcher);
    eventBindingEngine.setDataOrchestrator(dataOrchestrator);
    eventBindingEngine.setActionHandler((targetComponentId, action, params) => {
      const store = useEditorStore.getState();
      switch (action) {
        case 'highlight':
          dataOrchestrator.getBridge().updateComponent(targetComponentId, '__highlight', params?.value ?? true);
          break;
        case 'hide':
          store.updateComponent(targetComponentId, { visible: false });
          break;
        case 'show':
          store.updateComponent(targetComponentId, { visible: true });
          break;
        case 'setData':
          if (params?.property && params?.value !== undefined) {
            dataOrchestrator.getBridge().updateComponent(targetComponentId, String(params.property), params.value);
          }
          break;
        case 'navigateToScene':
          // 延迟导入避免循环依赖
          import("../runtime/NavigationExecutor").then(({ NavigationExecutor }) => {
            NavigationExecutor.execute(params as any);
          });
          break;
        default:
          dataOrchestrator.getBridge().updateComponent(targetComponentId, action, params ?? true);
          break;
      }
    });

    if (isEditMode) {
      toolRegistry.register(new SelectTool());
      toolRegistry.register(new PanTool());
      toolRegistry.register(new ZoomTool());

      toolRegistry.setContext(createSceneToolContext(layerRegistry, coordinateEngine, crs || "EPSG:3857", eventDispatcher, viewportSyncService));
      eventDispatcher.setToolRegistry(toolRegistry);
    }

    injectGlobalCoordinateEngine(coordinateEngine);
    injectGlobalLayerRegistry(layerRegistry);
    injectGlobalClock(globalClock);
    injectGlobalViewportSyncService(viewportSyncService);
    injectGlobalDataOrchestrator(dataOrchestrator);
    injectGlobalEventDispatcher(eventDispatcher);

    // renderer 获取器（由 CADMapRenderer 注册）
    let _rendererGetter: (() => THREE.WebGLRenderer | null) | null = null;

    coreRef.current = {
      layerRegistry,
      eventDispatcher,
      eventBindingEngine,
      coordinateEngine,
      viewportSyncService,
      toolRegistry,
      dataOrchestrator,
      clock: globalClock,
      registerRendererGetter(getter) { _rendererGetter = getter; },
      getRenderer() { return _rendererGetter?.() ?? null; },
    };
  }

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const core = coreRef.current!;

    setGlobalStoreUpdater((componentId, property, value) => {
      const store = useEditorStore.getState();
      if (property === 'visible') {
        store.updateComponent(componentId, { visible: value as boolean });
      } else {
        store.updateComponentConfig(componentId, { [property]: value });
      }
    });

    core.dataOrchestrator.setStoreSync((componentId, property, value) => {
      const store = useEditorStore.getState();
      if (property === 'visible') {
        store.updateComponent(componentId, { visible: value as boolean });
      } else {
        store.updateComponentConfig(componentId, { [property]: value });
      }
    });

    const sceneStateProvider: SceneStateProvider = {
      getSceneId: () => {
        return useSceneStore.getState().activeSceneId ?? '';
      },
      getViewport: () => {
        const canvas = useEditorStore.getState().canvasConfig;
        return { width: canvas.width, height: canvas.height, scale: 1 };
      },
      getActiveLayerId: () => {
        return useEditorStore.getState().activeLayerId ?? null;
      },
      getSelectedComponentIds: () => {
        return useEditorStore.getState().selection.selectedIds ?? [];
      },
    };
    setGlobalSceneStateProvider(sceneStateProvider);

    const unsub = core.layerRegistry.onGlobalLayerEvent((event) => {
      switch (event.type) {
        case 'visibility-change':
          core.toolRegistry.setContext(createSceneToolContext(
            core.layerRegistry,
            core.coordinateEngine,
            crs || "EPSG:3857",
            core.eventDispatcher,
            core.viewportSyncService,
          ));
          break;
        case 'data-update':
          if (event.layerId && event.data) {
            core.dataOrchestrator.pushDataToSource(event.layerId, event.data);
          }
          break;
        case 'bounds-change':
          break;
      }
    });

    return () => {
      unsub();
      core.clock.destroy();
      core.layerRegistry.clear();
      core.eventDispatcher.destroy();
      core.toolRegistry.destroy();
      core.viewportSyncService.destroy();
      core.dataOrchestrator.destroy();
      core.eventBindingEngine.destroy();
      initializedRef.current = false;
    };
  }, []);

  return (
    <SceneEditorContext.Provider value={coreRef.current}>
      <LayerSyncHelper />
      {children}
    </SceneEditorContext.Provider>
  );
}

function LayerSyncHelper() {
  useComponentLayerSync();
  useEditorLayerSync();
  useEventBindings();
  return null;
}
