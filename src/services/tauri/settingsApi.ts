import { invoke } from "./invoke";

export const settingsApi = {
  async get(key: string): Promise<string | null> {
    return invoke("get_setting", { key });
  },

  async set(key: string, value: string): Promise<void> {
    return invoke("set_setting", { key, value });
  },

  async delete(key: string): Promise<void> {
    return invoke("delete_setting", { key });
  },
};