import { create } from "zustand";
import { settingsApi } from "../services/tauri";

export type ThemeMode = "light" | "dark" | "system";
export type ThemePreset = "default" | "blue" | "green" | "orange" | "purple" | "custom";
export type FontSize = "small" | "medium" | "large";
export type BorderRadius = "none" | "small" | "medium" | "large" | "round";

export interface ThemeConfig {
  mode: ThemeMode;
  preset: ThemePreset;
  customPrimary?: string;
  fontSize: FontSize;
  borderRadius: BorderRadius;
}

const DEFAULT_THEME_CONFIG: ThemeConfig = {
  mode: "system",
  preset: "default",
  fontSize: "medium",
  borderRadius: "medium",
};

const THEME_SETTINGS_KEY = "theme";

interface ThemeState {
  config: ThemeConfig;
  initialized: boolean;

  init: () => Promise<void>;
  setMode: (mode: ThemeMode) => void;
  setPreset: (preset: ThemePreset) => void;
  setCustomPrimary: (color: string) => void;
  setFontSize: (fontSize: FontSize) => void;
  setBorderRadius: (borderRadius: BorderRadius) => void;
  setConfig: (config: Partial<ThemeConfig>) => void;
  resetConfig: () => void;
}

const _persist = (config: ThemeConfig) => {
  settingsApi.set(THEME_SETTINGS_KEY, JSON.stringify(config)).catch((err) => {
    console.error("[ThemeStore] 持久化失败:", err);
  });
};

export const useThemeStore = create<ThemeState>((set, get) => ({
  config: { ...DEFAULT_THEME_CONFIG },
  initialized: false,

  init: async () => {
    try {
      const saved = await settingsApi.get(THEME_SETTINGS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ThemeConfig;
        set({
          config: {
            mode: parsed.mode || DEFAULT_THEME_CONFIG.mode,
            preset: parsed.preset || DEFAULT_THEME_CONFIG.preset,
            customPrimary: parsed.customPrimary || DEFAULT_THEME_CONFIG.customPrimary,
            fontSize: parsed.fontSize || DEFAULT_THEME_CONFIG.fontSize,
            borderRadius: parsed.borderRadius || DEFAULT_THEME_CONFIG.borderRadius,
          },
          initialized: true,
        });
      } else {
        set({ initialized: true });
      }
    } catch (error) {
      console.error("[ThemeStore] 从后端加载主题配置失败:", error);
      set({ initialized: true });
    }
  },

  setMode: (mode: ThemeMode) => {
    const config = { ...get().config, mode };
    set({ config });
    _persist(config);
  },

  setPreset: (preset: ThemePreset) => {
    const config = { ...get().config, preset };
    set({ config });
    _persist(config);
  },

  setCustomPrimary: (color: string) => {
    const config: ThemeConfig = { ...get().config, customPrimary: color, preset: "custom" as ThemePreset };
    set({ config });
    _persist(config);
  },

  setFontSize: (fontSize: FontSize) => {
    const config = { ...get().config, fontSize };
    set({ config });
    _persist(config);
  },

  setBorderRadius: (borderRadius: BorderRadius) => {
    const config = { ...get().config, borderRadius };
    set({ config });
    _persist(config);
  },

  setConfig: (partial: Partial<ThemeConfig>) => {
    const config = { ...get().config, ...partial };
    set({ config });
    _persist(config);
  },

  resetConfig: () => {
    set({ config: { ...DEFAULT_THEME_CONFIG } });
    _persist(DEFAULT_THEME_CONFIG);
  },
}));
