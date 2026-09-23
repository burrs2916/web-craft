import { create } from "zustand";
import type {
  DataSource,
  DataSourceHeader,
  DataSourceResponseMapping,
  DataSourceStatus,
  ConnectionStatusInfo,
  TestApi,
} from "../types/dataSource";
import {
  createDefaultDataSource,
  createDefaultTestApi,
  buildTestRequest,
  toPersistedDataSource,
} from "../types/dataSource";
import type { DatabaseConnectionConfig, DatabaseTestConfig } from "../types/database";
import { createDefaultDatabaseConfig, createDefaultDatabaseTest } from "../types/database";
import type { MqttConnectionConfig } from "../types/mqtt";
import { createDefaultMqttConfig } from "../types/mqtt";
import type { WebSocketConfig } from "../types/websocket";
import { createDefaultWebSocketConfig } from "../types/websocket";
import { adapterRegistry } from "../datasource/adapters/registry";
import { dataSourceEventBus } from "../datasource/events";
import type { AdapterFetchResult } from "../datasource/adapters/types";
import { DataSourceScheduler } from "../datasource/scheduler";
import { datasourceApi, databaseApi, mqttApi } from "../services/tauri";

let scheduler: DataSourceScheduler | null = null;

function getScheduler(): DataSourceScheduler {
  if (!scheduler) {
    scheduler = new DataSourceScheduler(
      (id, result) => { useDataSourceStore.getState()._handleFetchResult(id, result); },
      (id, status, error) => { useDataSourceStore.getState()._handleStatusChange(id, status, error); },
    );
  }
  return scheduler;
}

export interface MetricData {
  sourceId: string;
  metricName: string;
  value: number | string;
  timestamp: string;
  tags?: Record<string, string>;
}

interface DataSourceState {
  dataSources: DataSource[];
  connectionStatuses: Record<string, ConnectionStatusInfo>;
  dataCache: Record<string, Record<string, unknown>>;
  metrics: Map<string, MetricData>;
  isLoading: boolean;
  error: string | null;

  loadFromBackend: () => Promise<void>;
  addDataSource: (ds?: Partial<DataSource>) => Promise<DataSource>;
  updateDataSource: (id: string, updates: Partial<DataSource>) => void;
  deleteDataSource: (id: string) => Promise<void>;
  setDataSourceEnabled: (id: string, enabled: boolean) => void;

  addHeader: (dsId: string) => void;
  updateHeader: (dsId: string, headerId: string, updates: Partial<DataSourceHeader>) => void;
  removeHeader: (dsId: string, headerId: string) => void;

  addResponseMapping: (dsId: string) => void;
  updateResponseMapping: (dsId: string, mappingId: string, updates: Partial<DataSourceResponseMapping>) => void;
  removeResponseMapping: (dsId: string, mappingId: string) => void;

  testConnection: (dsId: string) => Promise<unknown>;
  testAllConnections: () => Promise<void>;

  testDatabaseConnection: (dsId: string) => Promise<unknown>;
  testMqttConnection: (dsId: string) => Promise<unknown>;
  updateDatabaseConfig: (dsId: string, updates: Partial<DatabaseConnectionConfig>) => void;
  updateDatabaseTest: (dsId: string, updates: Partial<DatabaseTestConfig>) => void;
  updateMqttConfig: (dsId: string, updates: Partial<MqttConnectionConfig>) => void;
  updateWebSocketConfig: (dsId: string, updates: Partial<WebSocketConfig>) => void;

  addTestApi: (dsId: string, partial?: Partial<TestApi>) => void;
  updateTestApi: (dsId: string, apiId: string, updates: Partial<TestApi>) => void;
  removeTestApi: (dsId: string, apiId: string) => void;
  executeTestApi: (dsId: string, apiId: string) => Promise<unknown>;

  getConnectionStatus: (id: string) => ConnectionStatusInfo | undefined;

  getDataSourceData: (id: string) => Record<string, unknown> | undefined;
  getDataSource: (id: string) => DataSource | undefined;
  updateMetric: (key: string, data: MetricData) => void;

  _persist: (dsId: string) => void;
  _handleFetchResult: (id: string, result: AdapterFetchResult) => void;
  _handleStatusChange: (id: string, status: DataSourceStatus, error?: string) => void;

  fetchViaScheduler: (dsId: string) => Promise<AdapterFetchResult | null>;
  connectViaScheduler: (dsId: string) => void;
  disconnectViaScheduler: (dsId: string) => void;
  _updateConnectionStatus: (id: string, info: ConnectionStatusInfo) => void;

  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useDataSourceStore = create<DataSourceState>()((set, get) => ({
  dataSources: [],
  connectionStatuses: {},
  dataCache: {},
  metrics: new Map(),
  isLoading: false,
  error: null,

  _persist: (dsId: string) => {
    const ds = get().dataSources.find((s) => s.id === dsId);
    if (!ds) return;
    datasourceApi.save(toPersistedDataSource(ds)).catch((err) =>
      console.error("[DataSource] 持久化失败:", err)
    );
  },

  _updateConnectionStatus: (id: string, info: ConnectionStatusInfo) => {
    set((state) => ({
      connectionStatuses: {
        ...state.connectionStatuses,
        [id]: info,
      },
      dataSources: state.dataSources.map((s) =>
        s.id === id ? { ...s, status: info.status, lastError: info.message || undefined } : s
      ),
    }));
  },

  loadFromBackend: async () => {
    try {
      set({ isLoading: true });
      const sources = await datasourceApi.list();
      const existingStatuses = get().connectionStatuses;
      set({
        dataSources: sources.map((ds) => {
          const connection = { ...ds.connection };
          if (ds.type === "database" && !connection.database) {
            connection.database = createDefaultDatabaseConfig();
            connection.databaseTest = connection.databaseTest || createDefaultDatabaseTest();
          }
          if (ds.type === "mqtt" && !connection.mqtt) {
            connection.mqtt = createDefaultMqttConfig();
          }
          const existingStatus = existingStatuses[ds.id];
          return {
            ...ds,
            connection,
            status: existingStatus?.status || "disconnected" as const,
            lastData: undefined,
            lastFetchedAt: undefined,
            lastError: existingStatus?.message || undefined,
          };
        }),
        isLoading: false,
      });
    } catch (error) {
      console.error("[DataSource] 从后端加载数据源失败:", error);
      set({ isLoading: false, error: "加载数据源失败" });
    }
  },

  addDataSource: async (partial?: Partial<DataSource>) => {
    const ds = createDefaultDataSource(partial);
    await datasourceApi.save(toPersistedDataSource(ds));
    set((state) => ({ dataSources: [...state.dataSources, ds] }));
    dataSourceEventBus.emit("source:created", { sourceId: ds.id });
    return ds;
  },

  updateDataSource: (id, updates) => {
    set((state) => ({
      dataSources: state.dataSources.map((s) => {
        if (s.id !== id) return s;
        const merged = { ...s, ...updates, updatedAt: new Date().toISOString() };
        const finalType = merged.type;
        if (finalType === "database" && !merged.connection.database) {
          merged.connection = {
            ...merged.connection,
            database: createDefaultDatabaseConfig(),
            databaseTest: createDefaultDatabaseTest(),
          };
        }
        if (finalType === "mqtt" && !merged.connection.mqtt) {
          merged.connection = {
            ...merged.connection,
            mqtt: createDefaultMqttConfig(),
          };
        }
        return merged;
      }),
    }));
    get()._persist(id);
    dataSourceEventBus.emit("source:updated", { sourceId: id });
  },

  deleteDataSource: async (id) => {
    await datasourceApi.delete(id);
    set((state) => ({
      dataSources: state.dataSources.filter((s) => s.id !== id),
      connectionStatuses: (() => {
        const statuses = { ...state.connectionStatuses };
        delete statuses[id];
        return statuses;
      })(),
      dataCache: (() => {
        const cache = { ...state.dataCache };
        delete cache[id];
        return cache;
      })(),
    }));
    dataSourceEventBus.emit("source:deleted", { sourceId: id });
  },

  setDataSourceEnabled: (id, enabled) => {
    get().updateDataSource(id, { enabled });
  },

  addHeader: (dsId) => {
    const header: DataSourceHeader = {
      id: `h_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      key: "",
      value: "",
      enabled: true,
    };
    set((state) => ({
      dataSources: state.dataSources.map((s) =>
        s.id === dsId
          ? { ...s, connection: { ...s.connection, headers: [...s.connection.headers, header] } }
          : s
      ),
    }));
    get()._persist(dsId);
  },

  updateHeader: (dsId, headerId, updates) => {
    set((state) => ({
      dataSources: state.dataSources.map((s) =>
        s.id === dsId
          ? {
              ...s,
              connection: {
                ...s.connection,
                headers: s.connection.headers.map((h) =>
                  h.id === headerId ? { ...h, ...updates } : h
                ),
              },
            }
          : s
      ),
    }));
    get()._persist(dsId);
  },

  removeHeader: (dsId, headerId) => {
    set((state) => ({
      dataSources: state.dataSources.map((s) =>
        s.id === dsId
          ? {
              ...s,
              connection: {
                ...s.connection,
                headers: s.connection.headers.filter((h) => h.id !== headerId),
              },
            }
          : s
      ),
    }));
    get()._persist(dsId);
  },

  addResponseMapping: (dsId) => {
    const mapping: DataSourceResponseMapping = {
      id: `m_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sourcePath: "",
      targetKey: "",
      saveToCache: true,
    };
    set((state) => ({
      dataSources: state.dataSources.map((s) =>
        s.id === dsId
          ? { ...s, responseMapping: [...s.responseMapping, mapping] }
          : s
      ),
    }));
    get()._persist(dsId);
  },

  updateResponseMapping: (dsId, mappingId, updates) => {
    set((state) => ({
      dataSources: state.dataSources.map((s) =>
        s.id === dsId
          ? {
              ...s,
              responseMapping: s.responseMapping.map((m) =>
                m.id === mappingId ? { ...m, ...updates } : m
              ),
            }
          : s
      ),
    }));
    get()._persist(dsId);
  },

  removeResponseMapping: (dsId, mappingId) => {
    set((state) => ({
      dataSources: state.dataSources.map((s) =>
        s.id === dsId
          ? { ...s, responseMapping: s.responseMapping.filter((m) => m.id !== mappingId) }
          : s
      ),
    }));
    get()._persist(dsId);
  },

  testConnection: async (dsId) => {
    const ds = get().dataSources.find((s) => s.id === dsId);
    if (!ds) return null;

    if (!adapterRegistry.hasAdapter(ds.type)) {
      console.warn("[DataSource] 未注册的适配器类型:", ds.type);
      return null;
    }

    if (ds.type === "database") {
      return get().testDatabaseConnection(dsId);
    }

    if (ds.type === "mqtt") {
      try {
        get()._updateConnectionStatus(dsId, { status: "connecting", testedAt: new Date().toISOString() });
        const adapter = adapterRegistry.getAdapter("mqtt") as import("../datasource/adapters/MqttAdapter").MqttAdapter;
        adapter.connect(ds, {
          onStatusChange: (status, error) => {
            get()._handleStatusChange(dsId, status, error);
          },
          onData: (result) => {
            get()._handleFetchResult(dsId, result);
            dataSourceEventBus.emit("data:updated", {
              sourceId: dsId,
              data: result.raw,
              extracted: result.extracted,
              timestamp: result.timestamp,
            });
          },
        });
        return { connected: true };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "MQTT 连接失败";
        get()._updateConnectionStatus(dsId, { status: "failed", message: errorMsg, testedAt: new Date().toISOString() });
        return null;
      }
    }

    if (!ds.connection.url) return null;

    const baseUrl = ds.connection.url.replace(/\/+$/, "");
    const testApi = ds.testApis.length > 0 ? ds.testApis[0] : null;
    const testPath = testApi?.path
      ? (testApi.path.startsWith("/") ? testApi.path : `/${testApi.path}`)
      : "";
    const fullUrl = testPath ? `${baseUrl}${testPath}` : baseUrl;

    const method = testApi?.method || "GET";
    const body = testApi?.body;

    const headers = Object.fromEntries(
      ds.connection.headers
        .filter((h) => h.enabled && h.key)
        .map((h) => [h.key, h.value])
    );
    if (body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    try {
      get()._updateConnectionStatus(dsId, { status: "connecting", testedAt: new Date().toISOString() });

      const adapter = adapterRegistry.getAdapter(ds.type);
      const result = await adapter.fetch({
        url: fullUrl,
        method,
        headers,
        params: [],
        body,
        timeout: ds.connection.timeout,
        responseMapping: ds.responseMapping,
      });

      get()._handleFetchResult(dsId, result);
      get()._updateConnectionStatus(dsId, { status: "connected", testedAt: new Date().toISOString() });
      dataSourceEventBus.emit("data:updated", {
        sourceId: dsId,
        data: result.raw,
        extracted: result.extracted,
        timestamp: result.timestamp,
      });
      return result.raw;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "未知错误";
      get()._updateConnectionStatus(dsId, { status: "failed", message: errorMsg, testedAt: new Date().toISOString() });
      return null;
    }
  },

  testAllConnections: async () => {
    const { dataSources } = get();
    const enabledSources = dataSources.filter((ds) => ds.enabled);

    for (const ds of enabledSources) {
      try {
        if (ds.type === "database") {
          await get().testDatabaseConnection(ds.id);
        } else if (ds.type === "mqtt") {
          await get().testMqttConnection(ds.id);
        } else {
          await get().testConnection(ds.id);
        }
      } catch (e) {
        console.error(`[DataSource] 自动测试 ${ds.name}(${ds.id}) 失败:`, e);
      }
    }
  },

  testDatabaseConnection: async (dsId) => {
    const ds = get().dataSources.find((s) => s.id === dsId);
    if (!ds || !ds.connection.database) return null;

    try {
      get()._updateConnectionStatus(dsId, { status: "connecting", testedAt: new Date().toISOString() });
      const result = await databaseApi.testConnection(ds.connection.database, ds.connection.databaseTest?.query);
      if (result.success) {
        get()._updateConnectionStatus(dsId, { status: "connected", testedAt: new Date().toISOString() });
        get()._handleFetchResult(dsId, {
          raw: result.data ?? { success: true, message: result.message },
          extracted: {},
          timestamp: new Date().toISOString(),
        });
      } else {
        get()._updateConnectionStatus(dsId, { status: "failed", message: result.message, testedAt: new Date().toISOString() });
      }
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "未知错误";
      get()._updateConnectionStatus(dsId, { status: "error", message: errorMsg, testedAt: new Date().toISOString() });
      return null;
    }
  },

  updateDatabaseConfig: (dsId, updates) => {
    set((state) => ({
      dataSources: state.dataSources.map((s) => {
        if (s.id !== dsId) return s;
        const existing = s.connection.database || createDefaultDatabaseConfig();
        return {
          ...s,
          connection: {
            ...s.connection,
            database: { ...existing, ...updates },
          },
        };
      }),
    }));
    get()._persist(dsId);
  },

  updateDatabaseTest: (dsId, updates) => {
    set((state) => ({
      dataSources: state.dataSources.map((s) => {
        if (s.id !== dsId) return s;
        const existing = s.connection.databaseTest || createDefaultDatabaseTest();
        return {
          ...s,
          connection: {
            ...s.connection,
            databaseTest: { ...existing, ...updates },
          },
        };
      }),
    }));
    get()._persist(dsId);
  },

  updateMqttConfig: (dsId, updates) => {
    set((state) => ({
      dataSources: state.dataSources.map((s) => {
        if (s.id !== dsId) return s;
        const existing = s.connection.mqtt || createDefaultMqttConfig();
        return {
          ...s,
          connection: {
            ...s.connection,
            mqtt: { ...existing, ...updates },
          },
        };
      }),
    }));
    get()._persist(dsId);
  },

  updateWebSocketConfig: (dsId, updates) => {
    set((state) => ({
      dataSources: state.dataSources.map((s) => {
        if (s.id !== dsId) return s;
        const existing = s.connection.websocket || createDefaultWebSocketConfig();
        return {
          ...s,
          connection: {
            ...s.connection,
            websocket: { ...existing, ...updates },
          },
        };
      }),
    }));
    get()._persist(dsId);
  },

  testMqttConnection: async (dsId) => {
    const ds = get().dataSources.find((s) => s.id === dsId);
    if (!ds || !ds.connection.mqtt) return null;

    try {
      get()._updateConnectionStatus(dsId, { status: "connecting", testedAt: new Date().toISOString() });
      const result = await mqttApi.testConnection(ds.connection.mqtt);
      if (result.success) {
        get()._updateConnectionStatus(dsId, { status: "connected", testedAt: new Date().toISOString() });
        get()._handleFetchResult(dsId, {
          raw: result.data ?? { success: true, message: result.message },
          extracted: {},
          timestamp: new Date().toISOString(),
        });
      } else {
        get()._updateConnectionStatus(dsId, { status: "failed", message: result.message, testedAt: new Date().toISOString() });
      }
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "未知错误";
      get()._updateConnectionStatus(dsId, { status: "error", message: errorMsg, testedAt: new Date().toISOString() });
      return null;
    }
  },

  addTestApi: (dsId, partial) => {
    const api = createDefaultTestApi(partial);
    set((state) => ({
      dataSources: state.dataSources.map((s) =>
        s.id === dsId
          ? { ...s, testApis: [...s.testApis, api] }
          : s
      ),
    }));
    get()._persist(dsId);
  },

  updateTestApi: (dsId, apiId, updates) => {
    set((state) => ({
      dataSources: state.dataSources.map((s) =>
        s.id === dsId
          ? { ...s, testApis: s.testApis.map((a) => a.id === apiId ? { ...a, ...updates } : a) }
          : s
      ),
    }));
    get()._persist(dsId);
  },

  removeTestApi: (dsId, apiId) => {
    set((state) => ({
      dataSources: state.dataSources.map((s) =>
        s.id === dsId
          ? { ...s, testApis: s.testApis.filter((a) => a.id !== apiId) }
          : s
      ),
    }));
    get()._persist(dsId);
  },

  executeTestApi: async (dsId, apiId) => {
    const ds = get().dataSources.find((s) => s.id === dsId);
    if (!ds) return null;

    const api = ds.testApis.find((a) => a.id === apiId);
    if (!api) return null;

    if (!adapterRegistry.hasAdapter(ds.type)) {
      console.warn("[DataSource] 未注册的适配器类型:", ds.type);
      return null;
    }

    const req = buildTestRequest(ds, api);

    try {
      get()._updateConnectionStatus(dsId, { status: "connecting", testedAt: new Date().toISOString() });

      const adapter = adapterRegistry.getAdapter(ds.type);
      const result = await adapter.fetch(req);

      get()._handleFetchResult(dsId, result);
      get()._updateConnectionStatus(dsId, { status: "connected", testedAt: new Date().toISOString() });
      dataSourceEventBus.emit("data:updated", {
        sourceId: dsId,
        data: result.raw,
        extracted: result.extracted,
        timestamp: result.timestamp,
      });
      return result.raw;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "未知错误";
      get()._updateConnectionStatus(dsId, { status: "failed", message: errorMsg, testedAt: new Date().toISOString() });
      return null;
    }
  },

  getConnectionStatus: (id) => {
    return get().connectionStatuses[id];
  },

  getDataSourceData: (id) => {
    return get().dataCache[id];
  },

  getDataSource: (id) => {
    return get().dataSources.find((s) => s.id === id);
  },

  updateMetric: (key, data) => {
    set((state) => {
      const newMetrics = new Map(state.metrics);
      newMetrics.set(key, data);
      return { metrics: newMetrics };
    });
  },

  _handleFetchResult: (id, result) => {
    set((state) => ({
      dataSources: state.dataSources.map((s) =>
        s.id === id
          ? {
              ...s,
              lastData: result.raw,
              lastFetchedAt: result.timestamp,
              lastError: undefined,
              updatedAt: result.timestamp,
            }
          : s
      ),
      dataCache: { ...state.dataCache, [id]: result.extracted },
    }));
  },

  _handleStatusChange: (id, status, error) => {
    get()._updateConnectionStatus(id, {
      status,
      message: error,
      testedAt: new Date().toISOString(),
    });
  },

  fetchViaScheduler: (dsId) => {
    const ds = get().dataSources.find((s) => s.id === dsId);
    if (!ds) return Promise.resolve(null);
    return getScheduler().fetchOnce(ds);
  },

  connectViaScheduler: (dsId) => {
    const ds = get().dataSources.find((s) => s.id === dsId);
    if (!ds) return;
    getScheduler().connectStream(ds);
  },

  disconnectViaScheduler: (dsId) => {
    const ds = get().dataSources.find((s) => s.id === dsId);
    if (!ds) return;
    getScheduler().disconnectStream(dsId, ds.type);
  },

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
