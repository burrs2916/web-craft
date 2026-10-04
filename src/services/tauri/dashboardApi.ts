import { invoke } from "./invoke";
import type { Dashboard, LayoutItem, ComponentConfig } from "../../store";

export const dashboardApi = {
  async list(): Promise<Dashboard[]> {
    return invoke("list_dashboards");
  },

  async get(id: string): Promise<Dashboard> {
    return invoke("get_dashboard", { id });
  },

  async create(data: {
    name: string;
    width: number;
    height: number;
    description?: string;
  }): Promise<Dashboard> {
    return invoke("create_dashboard", data);
  },

  async update(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      width: number;
      height: number;
      layout: LayoutItem[];
      components: ComponentConfig[];
      theme: string;
    }>
  ): Promise<Dashboard> {
    return invoke("update_dashboard", { id, dashboard: data });
  },

  async delete(id: string): Promise<void> {
    return invoke("delete_dashboard", { id });
  },

  async export(id: string, format: "json" | "png" | "pdf"): Promise<string> {
    return invoke("export_dashboard", { id, format });
  },
};