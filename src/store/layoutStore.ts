import { create } from "zustand";
import { settingsApi } from "../services/tauri";

export type LayoutPreset = "default" | "compact" | "wide";
export type SidebarPosition = "left" | "right";
export type ContentPadding = "none" | "small" | "medium" | "large";
export type NavbarStyle = "standard" | "slim";

export interface LayoutConfig {
  preset: LayoutPreset;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  sidebarPosition: SidebarPosition;
  contentPadding: ContentPadding;
  navbarStyle: NavbarStyle;
}

const LAYOUT_SETTINGS_KEY = "layout";

const LAYOUT_PRESET_DEFAULTS: Record<LayoutPreset, Omit<LayoutConfig, "preset">> = {
  default: {
    sidebarCollapsed: false,
    sidebarWidth: 240,
    sidebarPosition: "left",
    contentPadding: "medium",
    navbarStyle: "standard",
  },
  compact: {
    sidebarCollapsed: true,
    sidebarWidth: 64,
    sidebarPosition: "left",
    contentPadding: "small",
    navbarStyle: "slim",
  },
  wide: {
    sidebarCollapsed: false,
    sidebarWidth: 280,
    sidebarPosition: "left",
    contentPadding: "large",
    navbarStyle: "standard",
  },
};

const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  preset: "default",
  ...LAYOUT_PRESET_DEFAULTS.default,
};

interface LayoutState {
  config: LayoutConfig;
  initialized: boolean;

  init: () => Promise<void>;
  applyPreset: (preset: LayoutPreset) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarPosition: (position: SidebarPosition) => void;
  setContentPadding: (padding: ContentPadding) => void;
  setNavbarStyle: (style: NavbarStyle) => void;
  setConfig: (config: Partial<LayoutConfig>) => void;
  resetLayout: () => void;
}

const _persist = (config: LayoutConfig) => {
  settingsApi.set(LAYOUT_SETTINGS_KEY, JSON.stringify(config)).catch((err) => {
    console.error("[LayoutStore] 持久化失败:", err);
  });
};

const migrateConfig = (parsed: Partial<LayoutConfig>): LayoutConfig => {
  let preset: LayoutPreset = (parsed.preset as string) === "focus" ? "default" : (parsed.preset || DEFAULT_LAYOUT_CONFIG.preset);
  let navbarStyle: NavbarStyle = (parsed.navbarStyle as string) === "hidden" ? "standard" : (parsed.navbarStyle || DEFAULT_LAYOUT_CONFIG.navbarStyle);

  return {
    preset,
    sidebarCollapsed: parsed.sidebarCollapsed ?? DEFAULT_LAYOUT_CONFIG.sidebarCollapsed,
    sidebarWidth: parsed.sidebarWidth ?? DEFAULT_LAYOUT_CONFIG.sidebarWidth,
    sidebarPosition: parsed.sidebarPosition || DEFAULT_LAYOUT_CONFIG.sidebarPosition,
    contentPadding: parsed.contentPadding || DEFAULT_LAYOUT_CONFIG.contentPadding,
    navbarStyle,
  };
};

export const useLayoutStore = create<LayoutState>((set, get) => ({
  config: { ...DEFAULT_LAYOUT_CONFIG },
  initialized: false,

  init: async () => {
    try {
      const saved = await settingsApi.get(LAYOUT_SETTINGS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<LayoutConfig>;
        set({ config: migrateConfig(parsed), initialized: true });
      } else {
        set({ initialized: true });
      }
    } catch (error) {
      console.error("[LayoutStore] 从后端加载布局配置失败:", error);
      set({ initialized: true });
    }
  },

  applyPreset: (preset: LayoutPreset) => {
    const defaults = LAYOUT_PRESET_DEFAULTS[preset];
    const config: LayoutConfig = { preset, ...defaults };
    set({ config });
    _persist(config);
  },

  toggleSidebar: () => {
    const { config } = get();
    const collapsed = !config.sidebarCollapsed;
    const width = collapsed ? 64 : (config.preset === "wide" ? 280 : 240);
    const newConfig = { ...config, sidebarCollapsed: collapsed, sidebarWidth: width, preset: "default" as LayoutPreset };
    set({ config: newConfig });
    _persist(newConfig);
  },

  setSidebarCollapsed: (collapsed: boolean) => {
    const { config } = get();
    const width = collapsed ? 64 : (config.preset === "wide" ? 280 : 240);
    const newConfig = { ...config, sidebarCollapsed: collapsed, sidebarWidth: width, preset: "default" as LayoutPreset };
    set({ config: newConfig });
    _persist(newConfig);
  },

  setSidebarPosition: (position: SidebarPosition) => {
    const config = { ...get().config, sidebarPosition: position, preset: "default" as LayoutPreset };
    set({ config });
    _persist(config);
  },

  setContentPadding: (padding: ContentPadding) => {
    const config = { ...get().config, contentPadding: padding, preset: "default" as LayoutPreset };
    set({ config });
    _persist(config);
  },

  setNavbarStyle: (style: NavbarStyle) => {
    const config = { ...get().config, navbarStyle: style, preset: "default" as LayoutPreset };
    set({ config });
    _persist(config);
  },

  setConfig: (partial: Partial<LayoutConfig>) => {
    const config = { ...get().config, ...partial };
    set({ config });
    _persist(config);
  },

  resetLayout: () => {
    set({ config: { ...DEFAULT_LAYOUT_CONFIG } });
    _persist(DEFAULT_LAYOUT_CONFIG);
  },
}));

export { LAYOUT_PRESET_DEFAULTS };
