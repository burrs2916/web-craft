import { invoke } from "./invoke";
import type { DataSource, PersistedDataSource } from "../../types/dataSource";

export const datasourceApi = {
  async list(): Promise<DataSource[]> {
    const result = await invoke<Record<string, unknown>[]>("get_all_datasources");
    return result.map((ds) => ({
      ...ds,
      createdAt: typeof ds.createdAt === "number" ? new Date(ds.createdAt * 1000).toISOString() : String(ds.createdAt),
      updatedAt: typeof ds.updatedAt === "number" ? new Date(ds.updatedAt * 1000).toISOString() : String(ds.updatedAt),
    })) as DataSource[];
  },

  async get(id: string): Promise<DataSource | null> {
    const result = await invoke<Record<string, unknown> | null>("get_datasource", { id });
    if (!result) return null;
    return {
      ...result,
      createdAt: typeof result.createdAt === "number" ? new Date(result.createdAt * 1000).toISOString() : String(result.createdAt),
      updatedAt: typeof result.updatedAt === "number" ? new Date(result.updatedAt * 1000).toISOString() : String(result.updatedAt),
    } as DataSource;
  },

  async save(ds: PersistedDataSource): Promise<void> {
    return invoke("save_datasource", { ds });
  },

  async delete(id: string): Promise<void> {
    return invoke("delete_datasource", { id });
  },
};