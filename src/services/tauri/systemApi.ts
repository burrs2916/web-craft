import { invoke } from "./invoke";

export const systemApi = {
  async getSettings(): Promise<Record<string, unknown>> {
    return invoke("get_settings");
  },

  async updateSettings(settings: Record<string, unknown>): Promise<void> {
    return invoke("update_settings", { settings });
  },

  async getSystemInfo(): Promise<{
    version: string;
    platform: string;
    memory: number;
    cpu: number;
  }> {
    return invoke("get_system_info");
  },
};