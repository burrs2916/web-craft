import type { DataSource, DataSourceStatus } from "../../types/dataSource";
import type { DataSourceAdapter, AdapterFetchResult, AdapterConnectOptions, FetchRequestConfig } from "./types";
import type { MqttSubscription, MqttPublishOptions, QoS } from "../../types/mqtt";
import { mqttApi } from "../../services/tauri";
import type { UnlistenFn } from "@tauri-apps/api/event";

type MessageHandler = (result: AdapterFetchResult) => void;
type StatusHandler = (status: DataSourceStatus, error?: string) => void;

interface MqttConnectionCallbacks {
  onData: MessageHandler;
  onStatus: StatusHandler;
}

export class MqttAdapter implements DataSourceAdapter {
  readonly type = "mqtt";

  private subscriptions: Record<string, Map<string, QoS>> = {};
  private callbacks: Record<string, MqttConnectionCallbacks> = {};
  private connectionStatus: Record<string, DataSourceStatus> = {};
  private messageUnlisten: UnlistenFn | null = null;
  private statusUnlisten: UnlistenFn | null = null;
  private initialized = false;

  private async ensureListeners(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    this.messageUnlisten = await mqttApi.onMessage((msg) => {
      const cbs = this.callbacks[msg.sourceId];
      if (cbs) {
        cbs.onData({
          raw: msg,
          extracted: { topic: msg.topic, payload: msg.payload },
          timestamp: new Date().toISOString(),
        });
      }
    });

    this.statusUnlisten = await mqttApi.onStatusChange((evt) => {
      const cbs = this.callbacks[evt.sourceId];
      if (cbs) {
        if (evt.connected) {
          this.connectionStatus[evt.sourceId] = "connected";
          cbs.onStatus("connected");
        } else {
          this.connectionStatus[evt.sourceId] = "error";
          cbs.onStatus("error", evt.error);
        }
      }
    });
  }

  private getSubs(dsId: string): Map<string, QoS> {
    if (!this.subscriptions[dsId]) {
      this.subscriptions[dsId] = new Map();
    }
    return this.subscriptions[dsId];
  }

  async connect(ds: DataSource, options: AdapterConnectOptions): Promise<void> {
    await this.ensureListeners();

    const config = ds.connection.mqtt;
    if (!config) {
      options.onStatusChange("error", "MQTT 未配置连接参数");
      return;
    }

    this.callbacks[ds.id] = {
      onData: options.onData,
      onStatus: options.onStatusChange,
    };

    try {
      options.onStatusChange("connecting");
      this.connectionStatus[ds.id] = "connecting";

      const result = await mqttApi.connect(ds.id, config);

      if (result.success) {
        options.onStatusChange("connected");
        this.connectionStatus[ds.id] = "connected";

        const subs = this.getSubs(ds.id);
        for (const [topic, qos] of subs) {
          try {
            await mqttApi.subscribe(ds.id, topic, qos);
          } catch (e) {
            console.error(`[MqttAdapter] 订阅 ${topic} 失败:`, e);
          }
        }
      } else {
        options.onStatusChange("error", result.message);
        this.connectionStatus[ds.id] = "error";
      }
    } catch (error) {
      options.onStatusChange("error", error instanceof Error ? error.message : "MQTT 连接失败");
      this.connectionStatus[ds.id] = "error";
    }
  }

  async disconnect(dsId: string): Promise<void> {
    try {
      await mqttApi.disconnect(dsId);
    } catch {
      // ignore
    }
    delete this.subscriptions[dsId];
    delete this.callbacks[dsId];
    delete this.connectionStatus[dsId];
  }

  async subscribe(dsId: string, topic: string, qos: QoS = 0): Promise<void> {
    const subs = this.getSubs(dsId);
    subs.set(topic, qos);

    try {
      await mqttApi.subscribe(dsId, topic, qos);
    } catch (e) {
      console.error(`[MqttAdapter] 订阅 ${topic} 失败:`, e);
    }
  }

  async unsubscribe(dsId: string, topic: string): Promise<void> {
    const subs = this.getSubs(dsId);
    subs.delete(topic);

    try {
      await mqttApi.unsubscribe(dsId, topic);
    } catch (e) {
      console.error(`[MqttAdapter] 取消订阅 ${topic} 失败:`, e);
    }
  }

  async publish(dsId: string, options: MqttPublishOptions): Promise<void> {
    await mqttApi.publish(dsId, options.topic, options.payload, options.qos, options.retain);
  }

  getSubscriptions(dsId: string): MqttSubscription[] {
    const subs = this.getSubs(dsId);
    return Array.from(subs.entries()).map(([topic, qos]) => ({
      topic,
      qos,
    }));
  }

  async fetch(_config: FetchRequestConfig): Promise<AdapterFetchResult> {
    throw new Error("MQTT 不支持主动 fetch，请使用 connect 订阅数据");
  }

  isConnected(dsId: string): boolean {
    return this.connectionStatus[dsId] === "connected";
  }

  async destroy(): Promise<void> {
    for (const dsId of Object.keys(this.subscriptions)) {
      await this.disconnect(dsId);
    }
    if (this.messageUnlisten) {
      this.messageUnlisten();
      this.messageUnlisten = null;
    }
    if (this.statusUnlisten) {
      this.statusUnlisten();
      this.statusUnlisten = null;
    }
    this.initialized = false;
  }
}
