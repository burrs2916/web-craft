import { create } from "zustand";
import { iconsApi } from "../services/tauri";
import type { SystemIcon } from "../services/tauri";

/**
 * 自定义图标库（平铺展示、无分组概念）。
 * 后端存储仍按 group 组织（图标文件落在 icons/{groupId}/ 下），
 * 这里统一用单个固定分组，首次上传时自动创建。
 */

let rootGroupId: string | null = null;

/** 取（没有则创建）统一存储分组，返回后端真实分组 id */
async function ensureRootGroupId(): Promise<string> {
  if (rootGroupId) return rootGroupId;
  const groups = await iconsApi.listIconGroups();
  if (groups.length > 0) {
    rootGroupId = groups[0].id;
    return rootGroupId;
  }
  const created = await iconsApi.createIconGroup("图标库");
  rootGroupId = created.id;
  return rootGroupId;
}

interface IconStore {
  icons: SystemIcon[];
  /** id → data URL（批量接口只返回小图标，大图标按需补取） */
  urls: Record<string, string>;
  loading: boolean;
  error: string | null;
  loaded: boolean;

  fetchAll: () => Promise<void>;
  /** 上传本地文件到图标库，返回新图标 */
  upload: (file: File) => Promise<SystemIcon>;
  remove: (id: string) => Promise<void>;
  /** 单个图标 data URL（优先缓存，未命中按需加载） */
  getUrl: (id: string) => Promise<string | null>;
}

export const useIconStore = create<IconStore>((set, get) => ({
  icons: [],
  urls: {},
  loading: false,
  error: null,
  loaded: false,

  fetchAll: async () => {
    if (get().loaded || get().loading) return;
    set({ loading: true, error: null });
    try {
      const [icons, urls] = await Promise.all([
        iconsApi.listCustomIcons(),
        iconsApi.getCustomIconUrls(),
      ]);
      set({ icons, urls, loaded: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "加载图标库失败";
      set({ error: errorMessage });
      console.error("[IconStore] fetchAll failed:", error);
    } finally {
      set({ loading: false });
    }
  },

  upload: async (file) => {
    const groupId = await ensureRootGroupId();
    const fileData = new Uint8Array(await file.arrayBuffer());
    const icon = await iconsApi.uploadCustomIcon(
      groupId,
      fileData,
      file.name,
      file.name.replace(/\.[^.]+$/, ""),
    );
    let url: string | null = null;
    try {
      url = await iconsApi.getCustomIconUrl(icon.id);
    } catch {
      // 上传成功但取 URL 失败不阻断，批量刷新时兜底
    }
    set((state) => ({
      icons: [icon, ...state.icons],
      urls: url ? { ...state.urls, [icon.id]: url } : state.urls,
    }));
    return icon;
  },

  remove: async (id) => {
    await iconsApi.deleteCustomIcon(id);
    set((state) => {
      const { [id]: _removed, ...urls } = state.urls;
      return { icons: state.icons.filter((i) => i.id !== id), urls };
    });
  },

  getUrl: async (id) => {
    const cached = get().urls[id];
    if (cached) return cached;
    try {
      const url = await iconsApi.getCustomIconUrl(id);
      if (url) {
        set((state) => ({ urls: { ...state.urls, [id]: url } }));
      }
      return url;
    } catch {
      return null;
    }
  },
}));
