import { create } from "zustand";
import { settingsApi } from "../services/tauri";
import type { ThemeConfig } from "./themeStore";
import type { LayoutConfig } from "./layoutStore";
import { useThemeStore } from "./themeStore";
import { useLayoutStore } from "./layoutStore";

export interface AppearanceProfile {
  id: string;
  name: string;
  description?: string;
  theme: ThemeConfig;
  layout: LayoutConfig;
  isBuiltIn?: boolean;
}

const APPEARANCE_PROFILES_KEY = "appearance_profiles";

const BUILT_IN_PROFILES: AppearanceProfile[] = [
  {
    id: "office",
    name: "标准办公",
    description: "清爽明亮，适合日常办公",
    theme: { mode: "light", preset: "default", fontSize: "medium", borderRadius: "medium" },
    layout: { preset: "default", sidebarCollapsed: false, sidebarWidth: 240, sidebarPosition: "left", contentPadding: "medium", navbarStyle: "standard" },
    isBuiltIn: true,
  },
  {
    id: "monitor",
    name: "大屏监控",
    description: "深色科技风，适合数据监控",
    theme: { mode: "dark", preset: "blue", fontSize: "medium", borderRadius: "small" },
    layout: { preset: "wide", sidebarCollapsed: false, sidebarWidth: 280, sidebarPosition: "left", contentPadding: "large", navbarStyle: "slim" },
    isBuiltIn: true,
  },
  {
    id: "editor",
    name: "编辑模式",
    description: "紧凑布局，高效编辑",
    theme: { mode: "dark", preset: "purple", fontSize: "medium", borderRadius: "small" },
    layout: { preset: "compact", sidebarCollapsed: true, sidebarWidth: 64, sidebarPosition: "left", contentPadding: "small", navbarStyle: "slim" },
    isBuiltIn: true,
  },
  {
    id: "night",
    name: "夜间模式",
    description: "柔和暗色，护眼舒适",
    theme: { mode: "dark", preset: "default", fontSize: "medium", borderRadius: "large" },
    layout: { preset: "compact", sidebarCollapsed: true, sidebarWidth: 64, sidebarPosition: "left", contentPadding: "small", navbarStyle: "slim" },
    isBuiltIn: true,
  },
];

function matchProfile(theme: ThemeConfig, layout: LayoutConfig): string | null {
  for (const profile of BUILT_IN_PROFILES) {
    const t = profile.theme;
    const l = profile.layout;
    if (
      theme.mode === t.mode &&
      theme.preset === t.preset &&
      theme.fontSize === t.fontSize &&
      theme.borderRadius === t.borderRadius &&
      (theme.preset !== "custom" || theme.customPrimary === t.customPrimary) &&
      layout.preset === l.preset &&
      layout.sidebarCollapsed === l.sidebarCollapsed &&
      layout.sidebarWidth === l.sidebarWidth &&
      layout.sidebarPosition === l.sidebarPosition &&
      layout.contentPadding === l.contentPadding &&
      layout.navbarStyle === l.navbarStyle
    ) {
      return profile.id;
    }
  }
  return null;
}

interface AppearanceState {
  profiles: AppearanceProfile[];
  initialized: boolean;
  activeProfileId: string | null;
  baseProfileId: string | null;
  isModified: boolean;

  init: () => Promise<void>;
  getProfile: (id: string) => AppearanceProfile | undefined;
  addProfile: (profile: AppearanceProfile) => void;
  updateProfile: (id: string, updates: Partial<Omit<AppearanceProfile, "id" | "isBuiltIn">>) => void;
  deleteProfile: (id: string) => void;
  detectActiveProfile: (theme: ThemeConfig, layout: LayoutConfig) => void;
  applyProfile: (profileId: string) => void;
}

const _persist = (profiles: AppearanceProfile[]) => {
  const customProfiles = profiles.filter((p) => !p.isBuiltIn);
  settingsApi.set(APPEARANCE_PROFILES_KEY, JSON.stringify(customProfiles)).catch((err) => {
    console.error("[AppearanceStore] 持久化失败:", err);
  });
};

export const useAppearanceStore = create<AppearanceState>((set, get) => ({
  profiles: [...BUILT_IN_PROFILES],
  initialized: false,
  activeProfileId: null,
  baseProfileId: null,
  isModified: false,

  init: async () => {
    try {
      const saved = await settingsApi.get(APPEARANCE_PROFILES_KEY);
      if (saved) {
        const customProfiles = JSON.parse(saved) as AppearanceProfile[];
        const merged = [
          ...BUILT_IN_PROFILES,
          ...customProfiles.map((p) => ({ ...p, isBuiltIn: false })),
        ];
        set({ profiles: merged, initialized: true });
      } else {
        set({ initialized: true });
      }
    } catch (error) {
      console.error("[AppearanceStore] 从后端加载外观方案失败:", error);
      set({ initialized: true });
    }
  },

  getProfile: (id: string) => {
    return get().profiles.find((p) => p.id === id);
  },

  addProfile: (profile: AppearanceProfile) => {
    const profiles = [...get().profiles, { ...profile, isBuiltIn: false }];
    set({ profiles });
    _persist(profiles);
  },

  updateProfile: (id: string, updates: Partial<Omit<AppearanceProfile, "id" | "isBuiltIn">>) => {
    const profiles = get().profiles.map((p) =>
      p.id === id ? { ...p, ...updates } : p
    );
    set({ profiles });
    _persist(profiles);
  },

  deleteProfile: (id: string) => {
    const profiles = get().profiles.filter((p) => p.id !== id || p.isBuiltIn);
    set({ profiles });
    _persist(profiles);
  },

  detectActiveProfile: (theme: ThemeConfig, layout: LayoutConfig) => {
    const matchedId = matchProfile(theme, layout);
    const { baseProfileId } = get();
    const isModified = matchedId === null && baseProfileId !== null;
    set({
      activeProfileId: matchedId,
      isModified,
      ...(matchedId !== null ? { baseProfileId: matchedId } : {}),
    });
  },

  applyProfile: (profileId: string) => {
    const profile = get().profiles.find((p) => p.id === profileId);
    if (!profile) return;
    useThemeStore.getState().setConfig(profile.theme);
    useLayoutStore.getState().applyPreset(profile.layout.preset);
    useLayoutStore.getState().setConfig({
      sidebarPosition: profile.layout.sidebarPosition,
      contentPadding: profile.layout.contentPadding,
      navbarStyle: profile.layout.navbarStyle,
    });
    set({ activeProfileId: profileId, baseProfileId: profileId, isModified: false });
  },
}));

export { BUILT_IN_PROFILES };
