import type { DatabaseConnectionConfig, DatabaseTestConfig } from "./database";
import { createDefaultDatabaseConfig, createDefaultDatabaseTest } from "./database";
import type { MqttConnectionConfig } from "./mqtt";
import { createDefaultMqttConfig } from "./mqtt";
import type { WebSocketConfig } from "./websocket";
import { createDefaultWebSocketConfig } from "./websocket";

export type DataSourceType = "http" | "websocket" | "mqtt" | "database";
export type DataSourceStatus = "disconnected" | "connecting" | "connected" | "failed" | "error";

export interface ConnectionStatusInfo {
  status: DataSourceStatus;
  message?: string;
  testedAt?: string;
}
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface DataSourceHeader {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface DataSourceResponseMapping {
  id: string;
  sourcePath: string;
  targetKey: string;
  saveToCache: boolean;
}

export interface TestApi {
  id: string;
  name: string;
  path: string;
  method: HttpMethod;
  body?: string;
}

export interface DataSourceConnection {
  url: string;
  headers: DataSourceHeader[];
  timeout: number;
  database?: DatabaseConnectionConfig;
  databaseTest?: DatabaseTestConfig;
  mqtt?: MqttConnectionConfig;
  websocket?: WebSocketConfig;
}

export interface DataSource {
  id: string;
  name: string;
  type: DataSourceType;
  description?: string;
  enabled: boolean;
  status: DataSourceStatus;
  createdAt: string;
  updatedAt: string;

  connection: DataSourceConnection;
  responseMapping: DataSourceResponseMapping[];
  testApis: TestApi[];

  lastData?: unknown;
  lastFetchedAt?: string;
  lastError?: string;
}

export function createDefaultDataSource(partial?: Partial<DataSource>): DataSource {
  const now = new Date().toISOString();
  const type = partial?.type || "http";
  return {
    id: `ds_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    name: "",
    type,
    enabled: true,
    status: "disconnected",
    createdAt: now,
    updatedAt: now,
    connection: {
      url: "",
      headers: [],
      timeout: 10000,
      ...(type === "database"
        ? { database: createDefaultDatabaseConfig(), databaseTest: createDefaultDatabaseTest() }
        : type === "mqtt"
        ? { mqtt: createDefaultMqttConfig() }
        : type === "websocket"
        ? { websocket: createDefaultWebSocketConfig() }
        : {}),
    },
    responseMapping: [],
    testApis: [],
    ...partial,
  };
}

export function createDefaultTestApi(partial?: Partial<TestApi>): TestApi {
  return {
    id: `api_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: "",
    path: "",
    method: "POST",
    ...partial,
  };
}

export function buildTestRequest(ds: DataSource, api: TestApi) {
  const baseUrl = ds.connection.url.replace(/\/+$/, "");
  const path = api.path.startsWith("/") ? api.path : `/${api.path}`;
  const url = `${baseUrl}${path}`;

  const headers: Record<string, string> = {};
  ds.connection.headers
    .filter((h) => h.enabled && h.key)
    .forEach((h) => { headers[h.key] = h.value; });

  const body = api.body;

  if (body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  return {
    url,
    method: api.method,
    headers,
    params: [],
    body,
    timeout: ds.connection.timeout,
    responseMapping: ds.responseMapping,
  };
}

export interface PersistedDataSource {
  id: string;
  name: string;
  type: DataSourceType;
  description?: string;
  enabled: boolean;
  connection: DataSourceConnection;
  responseMapping: DataSourceResponseMapping[];
  testApis: TestApi[];
  createdAt: number;
  updatedAt: number;
}

export function toPersistedDataSource(ds: DataSource): PersistedDataSource {
  return {
    id: ds.id,
    name: ds.name,
    type: ds.type,
    description: ds.description,
    enabled: ds.enabled,
    connection: ds.connection,
    responseMapping: ds.responseMapping,
    testApis: ds.testApis,
    createdAt: Math.floor(new Date(ds.createdAt).getTime() / 1000),
    updatedAt: Math.floor(Date.now() / 1000),
  };
}
