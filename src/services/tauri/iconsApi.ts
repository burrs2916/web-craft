import { invoke } from "./invoke";
import type { SystemIcon } from "./types";

export const iconsApi = {
  async listCustomIcons(groupId?: string): Promise<SystemIcon[]> {
    return invoke("list_custom_icons", { groupId: groupId ?? null });
  },

  async listIconGroups(): Promise<Array<{ id: string; name: string }>> {
    return invoke("list_icon_groups");
  },

  async createIconGroup(name: string): Promise<{ id: string; name: string }> {
    return invoke("create_icon_group", { name, parentId: null, sortOrder: 0 });
  },

  async uploadCustomIcon(
    groupId: string,
    fileData: Uint8Array,
    fileName: string,
    name?: string,
    description?: string | null
  ): Promise<SystemIcon> {
    return invoke("upload_custom_icon", {
      name: name ?? fileName,
      description: description ?? null,
      groupId,
      fileData,
      fileName,
    });
  },

  async deleteCustomIcon(id: string): Promise<void> {
    return invoke("delete_custom_icon", { id });
  },

  /** 单个图标 → data URL（懒加载用，大图标按需取） */
  async getCustomIconUrl(id: string): Promise<string | null> {
    return invoke("get_custom_icon_url", { id });
  },

  /** 批量图标 → data URL 表（小图标打包返回，大图标跳过需按需再取） */
  async getCustomIconUrls(): Promise<Record<string, string>> {
    return invoke("get_custom_icon_urls");
  },
};