import type { DataSourceAdapter } from "../adapters/types";
import type { DataSourceType } from "../../types/dataSource";
import { adapterRegistry } from "../adapters/registry";

export interface DataSourcePlugin {
  name: string;
  version: string;
  type: DataSourceType;
  description?: string;
  adapter: DataSourceAdapter;
  initialize?(): void;
  destroy?(): void;
}

class PluginManager {
  private plugins: Map<string, DataSourcePlugin> = new Map();

  register(plugin: DataSourcePlugin): void {
    if (this.plugins.has(plugin.name)) {
      console.warn(`[Plugin] 插件已存在: ${plugin.name}，将覆盖`);
      this.unregister(plugin.name);
    }

    adapterRegistry.registerFactory(plugin.type, () => plugin.adapter);

    plugin.initialize?.();

    this.plugins.set(plugin.name, plugin);
    console.log(`[Plugin] 已注册: ${plugin.name} v${plugin.version} (${plugin.type})`);
  }

  unregister(name: string): void {
    const plugin = this.plugins.get(name);
    if (plugin) {
      plugin.destroy?.();
      this.plugins.delete(name);
    }
  }

  getPlugin(name: string): DataSourcePlugin | undefined {
    return this.plugins.get(name);
  }

  getAllPlugins(): DataSourcePlugin[] {
    return Array.from(this.plugins.values());
  }

  getPluginsByType(type: DataSourceType): DataSourcePlugin[] {
    return Array.from(this.plugins.values()).filter((p) => p.type === type);
  }
}

export const pluginManager = new PluginManager();
