import { componentRegistry } from "../../editor/registry";

/** 统一的插件记录 upsert：先 try update，失败则查找后 update/create */
export async function upsertPluginRecord(
  pluginType: string,
  fields: Record<string, unknown>,
  defaults?: { name?: string; category?: string; builtIn?: boolean; enabled?: boolean; icon?: string; description?: string }
): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    await invoke("update_component_plugin", {
      payload: { id: `plugin_pref_${pluginType}`, ...fields },
    });
  } catch {
    const exists = await invoke<{ id: string } | null>("get_component_plugin_by_type", { pluginType });
    if (exists) {
      await invoke("update_component_plugin", {
        payload: { id: exists.id, ...fields },
      });
    } else {
      await invoke("create_component_plugin", {
        payload: {
          pluginType,
          name: defaults?.name ?? componentRegistry.get(pluginType)?.name ?? pluginType,
          category: defaults?.category,
          builtIn: defaults?.builtIn ?? false,
          enabled: defaults?.enabled ?? true,
          icon: defaults?.icon,
          description: defaults?.description ?? null,
          ...fields,
        },
      });
    }
  }
}