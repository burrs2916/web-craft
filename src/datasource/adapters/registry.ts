import type { DataSourceAdapter } from "./types";
import { HttpAdapter } from "./HttpAdapter";
import { WebSocketAdapter } from "./WebSocketAdapter";
import { DatabaseAdapter } from "./DatabaseAdapter";
import { MqttAdapter } from "./MqttAdapter";
import type { DataSourceType } from "../../types/dataSource";

class AdapterRegistry {
  private adapters: Map<string, DataSourceAdapter> = new Map();
  private factories: Map<string, () => DataSourceAdapter> = new Map();

  constructor() {
    this.registerFactory("http", () => new HttpAdapter());
    this.registerFactory("websocket", () => new WebSocketAdapter());
    this.registerFactory("database", () => new DatabaseAdapter());
    this.registerFactory("mqtt", () => new MqttAdapter());
  }

  registerFactory(type: string, factory: () => DataSourceAdapter): void {
    this.factories.set(type, factory);
  }

  getAdapter(type: DataSourceType): DataSourceAdapter {
    let adapter = this.adapters.get(type);
    if (!adapter) {
      const factory = this.factories.get(type);
      if (!factory) {
        throw new Error(`未注册的适配器类型: ${type}`);
      }
      adapter = factory();
      this.adapters.set(type, adapter);
    }
    return adapter;
  }

  hasAdapter(type: string): boolean {
    return this.factories.has(type);
  }

  getRegisteredTypes(): string[] {
    return Array.from(this.factories.keys());
  }

  destroyAll(): void {
    this.adapters.forEach((adapter) => adapter.destroy());
    this.adapters.clear();
  }
}

export const adapterRegistry = new AdapterRegistry();
