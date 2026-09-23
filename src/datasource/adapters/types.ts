import type { DataSource, DataSourceResponseMapping, DataSourceStatus, HttpMethod } from "../../types/dataSource";
import type { DatabaseConnectionConfig } from "../../types/database";

export interface AdapterFetchResult {
  raw: unknown;
  extracted: Record<string, unknown>;
  timestamp: string;
}

export interface FetchRequestConfig {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  params: Array<{ key: string; value: string; location: string }>;
  body?: string;
  timeout: number;
  responseMapping: DataSourceResponseMapping[];
  databaseConfig?: DatabaseConnectionConfig;
  databaseQuery?: string;
}

export interface AdapterConnectOptions {
  onStatusChange: (status: DataSourceStatus, error?: string) => void;
  onData: (result: AdapterFetchResult) => void;
}

export interface DataSourceAdapter {
  readonly type: string;

  connect(ds: DataSource, options: AdapterConnectOptions): void | Promise<void>;
  disconnect(dsId: string): void;
  fetch(config: FetchRequestConfig): Promise<AdapterFetchResult>;
  isConnected(dsId: string): boolean;
  destroy(): void;
}

export function extractData(raw: unknown, mappings: DataSourceResponseMapping[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  mappings.forEach((mapping) => {
    if (mapping.saveToCache && mapping.sourcePath && mapping.targetKey) {
      const value = getNestedValue(raw, mapping.sourcePath);
      if (value !== undefined && value !== null) {
        result[mapping.targetKey] = value;
      }
    }
  });
  return result;
}

export function getNestedValue(obj: unknown, path: string): unknown {
  if (!obj || !path) return undefined;
  const keys = path.replace(/\[(\d+)]/g, ".$1").split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
