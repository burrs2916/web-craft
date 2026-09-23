import type { DataSource, DataSourceStatus } from "../../types/dataSource";
import { adapterRegistry } from "../adapters/registry";
import type { AdapterFetchResult, FetchRequestConfig } from "../adapters/types";
import { dataSourceEventBus } from "../events";
import { adapterResultToDataFrame } from "../pipeline/DataPipeline";

class DataSourceScheduler {
  private onFetchResult: (id: string, result: AdapterFetchResult) => void;
  private onStatusChange: (id: string, status: DataSourceStatus, error?: string) => void;

  constructor(
    onFetchResult: (id: string, result: AdapterFetchResult) => void,
    onStatusChange: (id: string, status: DataSourceStatus, error?: string) => void
  ) {
    this.onFetchResult = onFetchResult;
    this.onStatusChange = onStatusChange;
  }

  private buildFetchConfig(ds: DataSource): FetchRequestConfig {
    return {
      url: ds.connection.url,
      method: "GET",
      headers: Object.fromEntries(
        ds.connection.headers
          .filter((h) => h.enabled && h.key)
          .map((h) => [h.key, h.value])
      ),
      params: [],
      timeout: ds.connection.timeout,
      responseMapping: ds.responseMapping,
    };
  }

  async fetchOnce(ds: DataSource): Promise<AdapterFetchResult | null> {
    if (!ds.enabled || !ds.connection.url) return null;

    try {
      const adapter = adapterRegistry.getAdapter(ds.type);
      this.onStatusChange(ds.id, "connecting");
      const config = this.buildFetchConfig(ds);
      const result = await adapter.fetch(config);
      this.onFetchResult(ds.id, result);
      this.onStatusChange(ds.id, "connected");
      const df = adapterResultToDataFrame(result.raw, result.extracted, ds.name, ds.id);
      dataSourceEventBus.emit("data:updated", {
        sourceId: ds.id,
        data: df,
        extracted: result.extracted,
        timestamp: result.timestamp,
      });
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "未知错误";
      this.onStatusChange(ds.id, "error", errorMsg);
      return null;
    }
  }

  connectStream(ds: DataSource): void {
    try {
      const adapter = adapterRegistry.getAdapter(ds.type);
      adapter.connect(ds, {
        onStatusChange: (status, error) => {
          this.onStatusChange(ds.id, status as DataSourceStatus, error);
          dataSourceEventBus.emit("status:changed", { sourceId: ds.id, status, error });
        },
        onData: (result) => {
          this.onFetchResult(ds.id, result);
          const df = adapterResultToDataFrame(result.raw, result.extracted, ds.name, ds.id);
          dataSourceEventBus.emit("data:updated", {
            sourceId: ds.id,
            data: df,
            extracted: result.extracted,
            timestamp: result.timestamp,
          });
        },
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "连接失败";
      this.onStatusChange(ds.id, "error", errorMsg);
    }
  }

  disconnectStream(dsId: string, type: string): void {
    try {
      const adapter = adapterRegistry.getAdapter(type as DataSource["type"]);
      adapter.disconnect(dsId);
    } catch {
      // adapter may not exist
    }
  }

  destroy(): void {
    // cleanup if needed
  }
}

export { DataSourceScheduler };
