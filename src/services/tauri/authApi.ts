import { invoke } from "./invoke";
import type { AuthConfig } from "./types";

export const authApi = {
  async getConfig(): Promise<AuthConfig> {
    return invoke("get_auth_config");
  },

  async updateConfig(config: AuthConfig): Promise<void> {
    return invoke("update_auth_config", { config });
  },

  async resetConfig(): Promise<void> {
    return invoke("reset_auth_config");
  },

  async getPresetConfig(preset: string): Promise<AuthConfig | null> {
    return invoke("get_preset_config", { preset });
  },

  async savePresetConfig(preset: string, config: AuthConfig): Promise<void> {
    return invoke("save_preset_config", { preset, config });
  },

  async deletePresetConfig(preset: string): Promise<void> {
    return invoke("delete_preset_config", { preset });
  },
};