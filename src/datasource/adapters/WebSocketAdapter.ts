import type { DataSource } from "../../types/dataSource";
import type { DataSourceAdapter, AdapterFetchResult, AdapterConnectOptions, FetchRequestConfig } from "./types";
import { extractData } from "./types";
import { createDefaultWebSocketConfig } from "../../types/websocket";

export class WebSocketAdapter implements DataSourceAdapter {
  readonly type = "websocket";

  private sockets: Record<string, WebSocket> = {};
  private reconnectTimers: Record<string, ReturnType<typeof setTimeout>> = {};
  private dataSources: Record<string, DataSource> = {};
  private connectOptions: Record<string, AdapterConnectOptions> = {};

  connect(ds: DataSource, options: AdapterConnectOptions): void {
    this.disconnect(ds.id);

    if (!ds.connection.url) {
      options.onStatusChange("error", "WebSocket 未配置 URL");
      return;
    }

    this.dataSources[ds.id] = ds;
    this.connectOptions[ds.id] = options;

    this.doConnect(ds.id);
  }

  private doConnect(dsId: string): void {
    const ds = this.dataSources[dsId];
    const options = this.connectOptions[dsId];
    if (!ds || !options) return;

    try {
      const ws = new WebSocket(ds.connection.url);

      ws.onopen = () => {
        options.onStatusChange("connected");
      };

      ws.onmessage = (event) => {
        try {
          const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
          const extracted = extractData(data, ds.responseMapping || []);
          options.onData({
            raw: data,
            extracted,
            timestamp: new Date().toISOString(),
          });
        } catch {
          options.onData({
            raw: event.data,
            extracted: {},
            timestamp: new Date().toISOString(),
          });
        }
      };

      ws.onerror = () => {
        options.onStatusChange("error", "WebSocket 连接错误");
      };

      ws.onclose = () => {
        options.onStatusChange("disconnected");
        this.scheduleReconnect(dsId);
      };

      this.sockets[dsId] = ws;
      options.onStatusChange("connecting");
    } catch (error) {
      options.onStatusChange("error", error instanceof Error ? error.message : "连接失败");
      this.scheduleReconnect(dsId);
    }
  }

  private scheduleReconnect(dsId: string): void {
    const ds = this.dataSources[dsId];
    const options = this.connectOptions[dsId];
    if (!ds || !options) return;

    const wsConfig = ds.connection.websocket || createDefaultWebSocketConfig();
    if (!wsConfig.reconnect) return;

    if (this.reconnectTimers[dsId]) {
      clearTimeout(this.reconnectTimers[dsId]);
    }

    this.reconnectTimers[dsId] = setTimeout(() => {
      delete this.reconnectTimers[dsId];
      this.doConnect(dsId);
    }, wsConfig.reconnectInterval);
  }

  disconnect(dsId: string): void {
    if (this.reconnectTimers[dsId]) {
      clearTimeout(this.reconnectTimers[dsId]);
      delete this.reconnectTimers[dsId];
    }
    delete this.dataSources[dsId];
    delete this.connectOptions[dsId];

    const ws = this.sockets[dsId];
    if (ws) {
      ws.onclose = null;
      ws.close();
      delete this.sockets[dsId];
    }
  }

  async fetch(_config: FetchRequestConfig): Promise<AdapterFetchResult> {
    throw new Error("WebSocket 不支持主动 fetch，请使用 connect 订阅数据");
  }

  isConnected(dsId: string): boolean {
    const ws = this.sockets[dsId];
    return ws?.readyState === WebSocket.OPEN;
  }

  destroy(): void {
    Object.keys(this.sockets).forEach((id) => this.disconnect(id));
  }
}
