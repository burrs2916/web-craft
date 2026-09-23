import { DataFrame } from "../dataframe";
import type { SceneBinding, SceneTransformConfig, SceneVariable } from "../../types/scene";
import type { DataBindingEngine, BindingRule, BindingAction, BindingActionExecutor } from "../binding/DataBindingEngine";
import { BindingType, BindingTargetType, BindingAction as BindingActionEnum } from "../binding/DataBindingEngine";
import type { ManagedDataPipeline, DataTransformConfig, DataPipelineConfig } from "../pipeline/DataPipeline";
import { ManagedDataPipeline as ManagedDataPipelineClass } from "../pipeline/DataPipeline";
import { dataSourceEventBus } from "../events";
import { safeTransform } from "../utils/safeEval";
import { VariableTemplateEngine } from "../template/VariableTemplateEngine";

export type ComponentDataUpdater = (property: string, value: unknown) => void;

export type ComponentDataListener = (componentId: string, property: string, value: unknown) => void;

export interface ComponentDataBridge {
  registerUpdater(componentId: string, updater: ComponentDataUpdater): () => void;
  updateComponent(componentId: string, property: string, value: unknown): void;
  getComponentData(componentId: string): unknown;
  setComponentData(componentId: string, data: unknown): void;
  subscribe(listener: ComponentDataListener): () => void;
  getComponentProperty(componentId: string, property: string): unknown;
}

class ComponentDataBridgeImpl implements ComponentDataBridge {
  private updaters: Map<string, Set<ComponentDataUpdater>> = new Map();
  private componentData: Map<string, Record<string, unknown>> = new Map();
  private globalListeners: Set<ComponentDataListener> = new Set();

  registerUpdater(componentId: string, updater: ComponentDataUpdater): () => void {
    if (!this.updaters.has(componentId)) {
      this.updaters.set(componentId, new Set());
    }
    this.updaters.get(componentId)!.add(updater);
    return () => {
      const set = this.updaters.get(componentId);
      if (set) {
        set.delete(updater);
        if (set.size === 0) {
          this.updaters.delete(componentId);
        }
      }
    };
  }

  updateComponent(componentId: string, property: string, value: unknown): void {
    const existing = this.componentData.get(componentId);
    if (existing) {
      existing[property] = value;
    } else {
      this.componentData.set(componentId, { [property]: value });
    }

    const updaters = this.updaters.get(componentId);
    if (updaters) {
      for (const updater of updaters) {
        try {
          updater(property, value);
        } catch (err) {
          console.error(`[ComponentDataBridge] Updater error for ${componentId}:`, err);
        }
      }
    }

    for (const listener of this.globalListeners) {
      try {
        listener(componentId, property, value);
      } catch (err) {
        console.error(`[ComponentDataBridge] Listener error:`, err);
      }
    }
  }

  getComponentData(componentId: string): unknown {
    return this.componentData.get(componentId);
  }

  getComponentProperty(componentId: string, property: string): unknown {
    const data = this.componentData.get(componentId);
    if (data && property in data) {
      return data[property];
    }
    return undefined;
  }

  setComponentData(componentId: string, data: unknown): void {
    if (typeof data === 'object' && data !== null) {
      this.componentData.set(componentId, data as Record<string, unknown>);
    } else {
      this.componentData.set(componentId, { value: data });
    }
  }

  subscribe(listener: ComponentDataListener): () => void {
    this.globalListeners.add(listener);
    return () => {
      this.globalListeners.delete(listener);
    };
  }

  clear(): void {
    this.updaters.clear();
    this.componentData.clear();
    this.globalListeners.clear();
  }
}

export function sceneBindingToBindingRule(binding: SceneBinding): BindingRule {
  let action: BindingAction = BindingActionEnum.SET;

  if (binding.action) {
    const actionMap: Record<string, BindingAction> = {
      set: BindingActionEnum.SET,
      update: BindingActionEnum.UPDATE,
      append: BindingActionEnum.APPEND,
      highlight: BindingActionEnum.HIGHLIGHT,
      hide: BindingActionEnum.HIDE,
      show: BindingActionEnum.SHOW,
      remove: BindingActionEnum.REMOVE,
      navigate: BindingActionEnum.NAVIGATE,
      custom: BindingActionEnum.CUSTOM,
    };
    action = actionMap[binding.action] ?? BindingActionEnum.SET;
  }

  let transformFn: ((value: any) => any) | undefined;
  if (binding.transform?.type === 'map' && binding.transform.expression) {
    transformFn = safeTransform(binding.transform.expression);
  }

  return {
    id: binding.id,
    name: `${binding.dataSource}.${binding.metricName} -> ${binding.componentId}`,
    type: BindingType.PROPERTY,
    sourceId: binding.dataSource,
    sourceField: binding.metricName,
    targetType: BindingTargetType.COMPONENT,
    targetId: binding.componentId,
    targetProperty: 'data',
    action,
    transform: transformFn,
    enabled: true,
    priority: 0,
  };
}

export function sceneTransformToDataTransform(transform: SceneTransformConfig): DataTransformConfig {
  const typeMap: Record<string, DataTransformConfig['type']> = {
    map: 'map',
    filter: 'filter',
    aggregate: 'groupBy',
    custom: 'custom',
  };
  return {
    type: typeMap[transform.type] || 'custom',
    config: {
      expression: transform.expression,
      function: transform.function,
    },
  };
}

export type StoreSyncCallback = (componentId: string, property: string, value: unknown) => void;

interface SourceRegistryEntry {
  sourceId: string;
  data: unknown;
  lastUpdated: number;
  refCount: number;
  subscribers: Set<(data: unknown, sourceId: string) => void>;
}

export class DataOrchestrator implements BindingActionExecutor {
  private bindingEngine: DataBindingEngine;
  private pipelines: Map<string, ManagedDataPipeline> = new Map();
  private dataBridge: ComponentDataBridgeImpl;
  private sceneBindings: Map<string, SceneBinding> = new Map();
  private dataUpdateUnsub: (() => void) | null = null;
  private storeSync: StoreSyncCallback | null = null;
  private sourceRegistry: Map<string, SourceRegistryEntry> = new Map();
  private variableEngine: VariableTemplateEngine = new VariableTemplateEngine();

  constructor(bindingEngine: DataBindingEngine) {
    this.bindingEngine = bindingEngine;
    this.dataBridge = new ComponentDataBridgeImpl();

    this.bindingEngine.setActionExecutor(this);

    this.dataUpdateUnsub = dataSourceEventBus.on('data:updated', (payload) => {
      if (payload.extracted && typeof payload.extracted === 'object') {
        for (const [componentId, componentData] of Object.entries(payload.extracted)) {
          if (componentData && typeof componentData === 'object') {
            for (const [property, value] of Object.entries(componentData as Record<string, unknown>)) {
              this.dataBridge.updateComponent(componentId, property, value);
              this.syncToStore(componentId, property, value);
            }
          }
        }
      }
    });
  }

  setStoreSync(callback: StoreSyncCallback): void {
    this.storeSync = callback;
  }

  private syncToStore(componentId: string, property: string, value: unknown): void {
    if (this.storeSync) {
      try {
        this.storeSync(componentId, property, value);
      } catch (err) {
        console.error(`[DataOrchestrator] Store sync error for ${componentId}.${property}:`, err);
      }
    }
  }

  set(targetId: string, property: string, value: any): void {
    this.dataBridge.updateComponent(targetId, property, value);
    this.syncToStore(targetId, property, value);
  }

  update(targetId: string, property: string, value: any): void {
    this.dataBridge.updateComponent(targetId, property, value);
    this.syncToStore(targetId, property, value);
  }

  append(targetId: string, property: string, value: any): void {
    const existing = this.dataBridge.getComponentData(targetId);
    if (Array.isArray(existing) && Array.isArray(value)) {
      const merged = [...existing, ...value];
      this.dataBridge.setComponentData(targetId, merged);
      this.dataBridge.updateComponent(targetId, property, merged);
      this.syncToStore(targetId, property, merged);
    } else {
      this.dataBridge.updateComponent(targetId, property, value);
      this.syncToStore(targetId, property, value);
    }
  }

  remove(targetId: string, property: string, value: any): void {
    const existing = this.dataBridge.getComponentData(targetId);
    if (Array.isArray(existing) && Array.isArray(value)) {
      const removed = existing.filter((item: any) => !value.includes(item));
      this.dataBridge.setComponentData(targetId, removed);
      this.dataBridge.updateComponent(targetId, property, removed);
      this.syncToStore(targetId, property, removed);
    } else {
      this.dataBridge.updateComponent(targetId, property, value);
      this.syncToStore(targetId, property, value);
    }
  }

  highlight(targetId: string, _property: string, value: any): void {
    this.dataBridge.updateComponent(targetId, '__highlight', value);
    this.syncToStore(targetId, '__highlight', value);
  }

  hide(targetId: string): void {
    this.dataBridge.updateComponent(targetId, 'visible', false);
    this.syncToStore(targetId, 'visible', false);
  }

  show(targetId: string): void {
    this.dataBridge.updateComponent(targetId, 'visible', true);
    this.syncToStore(targetId, 'visible', true);
  }

  navigate(_targetId: string, _property: string, value: any): void {
    // 支持内部场景导航：value 为 NavigateToSceneParams 对象时走内部导航
    if (typeof value === 'object' && value !== null && value.sceneId) {
      import("../../editor/runtime/NavigationExecutor").then(({ NavigationExecutor }) => {
        NavigationExecutor.execute(value);
      });
    } else if (typeof window !== 'undefined' && typeof value === 'string') {
      // 外部 URL 导航
      window.open(value, '_blank', 'noopener,noreferrer');
    }
  }

  custom(targetId: string, property: string, value: any): void {
    this.dataBridge.updateComponent(targetId, property, value);
    this.syncToStore(targetId, property, value);
  }

  setupFromSceneBindings(bindings: SceneBinding[]): void {
    this.clearAll();

    for (const binding of bindings) {
      this.addSceneBinding(binding);
    }
  }

  addSceneBinding(binding: SceneBinding): void {
    this.sceneBindings.set(binding.id, binding);

    const rule = sceneBindingToBindingRule(binding);
    this.bindingEngine.registerRule(rule);

    if (!this.pipelines.has(binding.id)) {
      const pipeline = this.createPipelineFromBinding(binding);
      if (pipeline) {
        this.pipelines.set(binding.id, pipeline);
        if (binding.refreshInterval && binding.refreshInterval > 0) {
          pipeline.startAutoRefresh();
        }
      }
    }
  }

  removeSceneBinding(bindingId: string): void {
    const binding = this.sceneBindings.get(bindingId);
    this.sceneBindings.delete(bindingId);
    this.bindingEngine.unregisterRule(bindingId);

    if (binding) {
      const pipeline = this.pipelines.get(bindingId);
      if (pipeline) {
        pipeline.stopAutoRefresh();
        pipeline.destroy();
        this.pipelines.delete(bindingId);
      }
    }
  }

  registerComponentUpdater(componentId: string, updater: ComponentDataUpdater): () => void {
    return this.dataBridge.registerUpdater(componentId, updater);
  }

  pushDataToBinding(bindingId: string, data: DataFrame | unknown): void {
    const binding = this.sceneBindings.get(bindingId);
    if (!binding) return;

    dataSourceEventBus.emit('data:updated', {
      sourceId: binding.dataSource,
      data,
      extracted: data instanceof DataFrame
        ? Object.fromEntries(data.getFields().map(f => [f.name, f.values]))
        : typeof data === 'object' && data !== null ? data as Record<string, unknown> : { value: data },
      timestamp: new Date().toISOString(),
    });
  }

  pushDataToSource(sourceId: string, data: DataFrame | unknown): void {
    const entry = this.sourceRegistry.get(sourceId);
    if (entry) {
      entry.data = data;
      entry.lastUpdated = Date.now();
      entry.subscribers.forEach(handler => {
        try {
          handler(data, sourceId);
        } catch (err) {
          console.error(`[DataOrchestrator] SourceRegistry subscriber error for "${sourceId}":`, err);
        }
      });
    } else {
      this.sourceRegistry.set(sourceId, {
        sourceId,
        data,
        lastUpdated: Date.now(),
        refCount: 1,
        subscribers: new Set(),
      });
    }

    dataSourceEventBus.emit('data:updated', {
      sourceId,
      data,
      extracted: data instanceof DataFrame
        ? Object.fromEntries(data.getFields().map(f => [f.name, f.values]))
        : typeof data === 'object' && data !== null ? data as Record<string, unknown> : { value: data },
      timestamp: new Date().toISOString(),
    });
  }

  getSourceData(sourceId: string): unknown {
    return this.sourceRegistry.get(sourceId)?.data ?? null;
  }

  subscribeToSource(sourceId: string, handler: (data: unknown, sourceId: string) => void): () => void {
    let entry = this.sourceRegistry.get(sourceId);
    if (!entry) {
      entry = {
        sourceId,
        data: null,
        lastUpdated: 0,
        refCount: 0,
        subscribers: new Set(),
      };
      this.sourceRegistry.set(sourceId, entry);
    }
    entry.refCount++;
    entry.subscribers.add(handler);

    if (entry.data !== null) {
      try {
        handler(entry.data, sourceId);
      } catch {}
    }

    return () => {
      entry!.subscribers.delete(handler);
      entry!.refCount = Math.max(0, entry!.refCount - 1);
      if (entry!.refCount <= 0 && entry!.subscribers.size === 0) {
        this.sourceRegistry.delete(sourceId);
      }
    };
  }

  getSourceRefCount(sourceId: string): number {
    return this.sourceRegistry.get(sourceId)?.refCount ?? 0;
  }

  getAllSources(): Array<{ sourceId: string; refCount: number; lastUpdated: number }> {
    return Array.from(this.sourceRegistry.values()).map(entry => ({
      sourceId: entry.sourceId,
      refCount: entry.refCount,
      lastUpdated: entry.lastUpdated,
    }));
  }

  registerPipeline(id: string, pipeline: ManagedDataPipeline): void {
    this.pipelines.set(id, pipeline);
  }

  setVariables(variables: SceneVariable[]): void {
    this.variableEngine.registerVariables(variables);
  }

  setVariable(name: string, value: unknown): void {
    this.variableEngine.setValue(name, value);
  }

  getVariable(name: string): unknown {
    return this.variableEngine.getValue(name);
  }

  getVariableEngine(): VariableTemplateEngine {
    return this.variableEngine;
  }

  resolveTemplate<T extends string | Record<string, unknown> | unknown[]>(input: T): T {
    return this.variableEngine.resolve(input);
  }

  async refreshBindingsForSource(sourceId: string): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [bindingId, binding] of this.sceneBindings) {
      if (binding.dataSource === sourceId) {
        promises.push(this.refreshBinding(bindingId));
      }
    }
    await Promise.all(promises);
  }

  unregisterPipeline(id: string): void {
    const pipeline = this.pipelines.get(id);
    if (pipeline) {
      pipeline.destroy();
      this.pipelines.delete(id);
    }
  }

  getBridge(): ComponentDataBridge {
    return this.dataBridge;
  }

  getBindingEngine(): DataBindingEngine {
    return this.bindingEngine;
  }

  private async refreshBinding(bindingId: string): Promise<void> {
    const binding = this.sceneBindings.get(bindingId);
    if (!binding) return;

    try {
      const pipeline = this.pipelines.get(bindingId);
      if (pipeline) {
        await pipeline.execute();
        return;
      }

      const { adapterRegistry } = await import("../adapters/registry");
      const adapterType = binding.adapterType || 'http';
      try {
        const adapter = adapterRegistry.getAdapter(adapterType as any);
        const dsConfig = binding.dataSourceConfig as unknown as import("../adapters/types").FetchRequestConfig;
        if (dsConfig) {
          const result = await adapter.fetch(dsConfig);
          if (result.extracted) {
            this.pushDataToSource(binding.dataSource, result.extracted);
          }
          return;
        }
      } catch {
        // adapter not available, skip
      }

      console.warn(
        `[DataOrchestrator] Binding "${bindingId}" refresh skipped: no pipeline or adapter configured for dataSource "${binding.dataSource}". ` +
        `Register a pipeline via orchestrator.registerPipeline() or provide dataSourceConfig in the binding.`
      );
    } catch (err) {
      console.error(`[DataOrchestrator] Failed to refresh binding ${bindingId}:`, err);
    }
  }

  private createPipelineFromBinding(binding: SceneBinding): ManagedDataPipeline | null {
    const dsConfig = binding.dataSourceConfig;
    if (!dsConfig || typeof dsConfig !== 'object') return null;

    const adapterType = (binding.adapterType as string) || 'http';

    if (adapterType === 'mqtt' || adapterType === 'websocket') {
      return this.createStreamingPipeline(binding, adapterType);
    }

    if (adapterType === 'database') {
      return this.createDatabasePipeline(binding);
    }

    const url = (dsConfig as Record<string, unknown>).url;
    if (!url || typeof url !== 'string') return null;

    const resolvedUrl = this.variableEngine.resolve(url);
    const resolvedHeaders = this.variableEngine.resolve(
      ((dsConfig as Record<string, unknown>).headers ?? {}) as Record<string, unknown>
    );
    const resolvedParams = this.variableEngine.resolve(
      ((dsConfig as Record<string, unknown>).params ?? []) as unknown[]
    );

    const transforms: DataTransformConfig[] = [];
    if (binding.transform) {
      transforms.push(sceneTransformToDataTransform(binding.transform));
    }

    const pipelineConfig: DataPipelineConfig = {
      id: `pipeline_${binding.id}`,
      name: `Pipeline for binding ${binding.id}`,
      dataSourceId: binding.dataSource,
      dataSourceType: adapterType,
      query: {
        url: resolvedUrl,
        method: (dsConfig as Record<string, unknown>).method ?? 'GET',
        headers: resolvedHeaders,
        params: resolvedParams,
        timeout: (dsConfig as Record<string, unknown>).timeout ?? 30000,
        responseMapping: (dsConfig as Record<string, unknown>).responseMapping ?? [],
      },
      transforms: transforms.length > 0 ? transforms : undefined,
      refreshInterval: binding.refreshInterval ? binding.refreshInterval * 1000 : undefined,
    };

    return new ManagedDataPipelineClass(pipelineConfig);
  }

  private createStreamingPipeline(binding: SceneBinding, adapterType: string): ManagedDataPipeline | null {
    const dsConfig = binding.dataSourceConfig as Record<string, unknown>;
    const transforms: DataTransformConfig[] = [];
    if (binding.transform) {
      transforms.push(sceneTransformToDataTransform(binding.transform));
    }

    const url = dsConfig.url as string | undefined;
    const resolvedUrl = url ? this.variableEngine.resolve(url) : '';
    const pipelineConfig: DataPipelineConfig = {
      id: `pipeline_${binding.id}`,
      name: `Streaming pipeline for binding ${binding.id}`,
      dataSourceId: binding.dataSource,
      dataSourceType: adapterType,
      query: {
        url: resolvedUrl,
        method: 'GET',
        headers: {},
        params: [],
        timeout: 30000,
        responseMapping: (dsConfig.responseMapping ?? []) as any[],
      },
      transforms: transforms.length > 0 ? transforms : undefined,
      refreshInterval: binding.refreshInterval ? binding.refreshInterval * 1000 : undefined,
    };

    const pipeline = new ManagedDataPipelineClass(pipelineConfig);

    this.connectStreamingAdapter(binding, adapterType, dsConfig);

    return pipeline;
  }

  private streamingConnections: Map<string, { adapter: any; dsConfig: Record<string, unknown> }> = new Map();

  private async connectStreamingAdapter(binding: SceneBinding, adapterType: string, dsConfig: Record<string, unknown>): Promise<void> {
    try {
      const { adapterRegistry } = await import("../adapters/registry");
      const adapter = adapterRegistry.getAdapter(adapterType as any);

      const ds: import("../../types/dataSource").DataSource = {
        id: binding.dataSource,
        name: binding.dataSource,
        type: adapterType as any,
        enabled: true,
        status: 'disconnected' as any,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        connection: {
          url: (dsConfig.url as string) ?? '',
          headers: [],
          timeout: 30000,
          websocket: adapterType === 'websocket' ? {
            reconnect: true,
            reconnectInterval: 5000,
          } : undefined,
          mqtt: adapterType === 'mqtt' ? {
            protocol: 'mqtt' as const,
            host: (dsConfig.host as string) ?? (() => { try { return new URL((dsConfig.url as string) || 'mqtt://localhost').hostname; } catch { return 'localhost'; } })(),
            port: (dsConfig.port as number) ?? 1883,
            clientId: `spatialdata_${binding.id}_${Date.now()}`,
            username: (dsConfig.username as string) ?? '',
            password: (dsConfig.password as string) ?? '',
            cleanSession: true,
            keepAlive: 60,
            version: '3.1.1' as const,
            reconnect: true,
            reconnectInterval: 5000,
            reconnectAttempts: 10,
          } : undefined,
        },
        testApis: [],
        responseMapping: (dsConfig.responseMapping ?? []) as any[],
      };

      adapter.connect(ds, {
        onStatusChange: (status, error) => {
          console.log(`[DataOrchestrator] Streaming adapter ${adapterType} status: ${status}${error ? ` - ${error}` : ''}`);
        },
        onData: (result) => {
          this.pushDataToSource(binding.dataSource, result.extracted);
        },
      });

      this.streamingConnections.set(binding.id, { adapter, dsConfig });
    } catch (err) {
      console.error(`[DataOrchestrator] Failed to connect streaming adapter ${adapterType}:`, err);
    }
  }

  private createDatabasePipeline(binding: SceneBinding): ManagedDataPipeline | null {
    const dsConfig = binding.dataSourceConfig as Record<string, unknown>;
    const transforms: DataTransformConfig[] = [];
    if (binding.transform) {
      transforms.push(sceneTransformToDataTransform(binding.transform));
    }

    const pipelineConfig: DataPipelineConfig = {
      id: `pipeline_${binding.id}`,
      name: `Database pipeline for binding ${binding.id}`,
      dataSourceId: binding.dataSource,
      dataSourceType: 'database',
      query: {
        url: '',
        method: 'POST',
        headers: {},
        params: [],
        timeout: 30000,
        responseMapping: (dsConfig.responseMapping ?? []) as any[],
        body: (dsConfig.query as string) ?? 'SELECT 1',
        databaseConfig: dsConfig.databaseConfig as any,
        databaseQuery: (dsConfig.query as string) ?? 'SELECT 1',
      },
      transforms: transforms.length > 0 ? transforms : undefined,
      refreshInterval: binding.refreshInterval ? binding.refreshInterval * 1000 : undefined,
    };

    return new ManagedDataPipelineClass(pipelineConfig);
  }

  clearAll(): void {
    this.sceneBindings.forEach((_, id) => {
      this.bindingEngine.unregisterRule(id);
    });
    this.sceneBindings.clear();

    this.pipelines.forEach(pipeline => pipeline.destroy());
    this.pipelines.clear();

    this.streamingConnections.forEach(({ adapter }) => {
      try {
        if (typeof adapter.disconnect === 'function') {
          adapter.disconnect();
        }
      } catch {}
    });
    this.streamingConnections.clear();

    this.sourceRegistry.forEach(entry => entry.subscribers.clear());
    this.sourceRegistry.clear();

    this.dataBridge.clear();
  }

  destroy(): void {
    if (this.dataUpdateUnsub) {
      this.dataUpdateUnsub();
      this.dataUpdateUnsub = null;
    }
    this.clearAll();
  }
}
