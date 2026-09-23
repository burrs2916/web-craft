import type { DataSource, DataSourceStatus } from "../../types/dataSource";
import type { DataSourceAdapter, AdapterFetchResult, AdapterConnectOptions, FetchRequestConfig } from "./types";
import { extractData } from "./types";
import type { DatabaseConnectionConfig } from "../../types/database";
import { invoke } from "@tauri-apps/api/core";

interface DbCheckResult {
  success: boolean;
  message: string;
  data?: unknown;
}

interface DbQueryResult {
  success: boolean;
  message: string;
  data?: unknown;
  columns?: string[];
  rows?: Record<string, unknown>[];
}

export class DatabaseAdapter implements DataSourceAdapter {
  readonly type = "database";

  private connectionStatus: Record<string, DataSourceStatus> = {};

  async connect(ds: DataSource, options: AdapterConnectOptions): Promise<void> {
    this.disconnect(ds.id);
    this.connectionStatus[ds.id] = "connecting";
    options.onStatusChange("connecting");

    const config = ds.connection.database;
    if (!config) {
      this.connectionStatus[ds.id] = "error";
      options.onStatusChange("error", "数据库未配置连接参数");
      return;
    }

    try {
      const result = await this.testConnection(config);
      if (result.success) {
        this.connectionStatus[ds.id] = "connected";
        options.onStatusChange("connected");
      } else {
        this.connectionStatus[ds.id] = "failed";
        options.onStatusChange("failed", result.message);
      }
    } catch (error) {
      this.connectionStatus[ds.id] = "error";
      options.onStatusChange("error", error instanceof Error ? error.message : "连接测试失败");
    }
  }

  disconnect(dsId: string): void {
    this.connectionStatus[dsId] = "disconnected";
    delete this.connectionStatus[dsId];
  }

  async testConnection(config: DatabaseConnectionConfig): Promise<DbCheckResult> {
    try {
      const result = await invoke<DbCheckResult>("db_test_connection", { config });
      return result;
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async executeQuery(config: DatabaseConnectionConfig, query: string): Promise<DbQueryResult> {
    try {
      const result = await invoke<DbQueryResult>("db_execute_query", { config, query });
      return result;
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async fetch(config: FetchRequestConfig): Promise<AdapterFetchResult> {
    const dbConfig = config.databaseConfig;
    if (!dbConfig) {
      throw new Error("数据库请求缺少连接配置");
    }

    const query = config.body || config.databaseQuery || "SELECT 1";
    const result = await this.executeQuery(dbConfig, query);

    if (!result.success) {
      throw new Error(result.message);
    }

    const responseData = result.data || result.rows || result;
    const extracted = extractData(responseData, config.responseMapping);

    return {
      raw: responseData,
      extracted,
      timestamp: new Date().toISOString(),
    };
  }

  isConnected(dsId: string): boolean {
    return this.connectionStatus[dsId] === "connected";
  }

  getStatus(dsId: string): DataSourceStatus | undefined {
    return this.connectionStatus[dsId];
  }

  destroy(): void {
    this.connectionStatus = {};
  }
}
