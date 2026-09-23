import { create } from 'zustand';
import type { AppearanceConfig } from '../proto';

export type ThemeMode = 'dark' | 'light' | 'system';
export type BellStyle = 'none' | 'visual' | 'sound';
export type CursorStyle = 'block' | 'underline' | 'bar';

export interface AppSettings {
  theme: ThemeMode;
  language: 'zh-CN' | 'en-US';
  showStatusBar: boolean;
  confirmBeforeClose: boolean;
  /** 应用启动时自动恢复上次的终端标签（仅本地与私钥/无密码 SSH；密码会话不落盘、不自动重建） */
  restoreTabsOnStartup: boolean;

  appearance: AppearanceConfig;
  bellStyle: BellStyle;
  webglRenderer: boolean;
  scrollback: number;
  copyOnSelect: boolean;
  pasteOnMiddleClick: boolean;
  shell: string;
}

export const DARK_APPEARANCE: AppearanceConfig = {
  fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, Menlo, Monaco, monospace',
  fontSize: 14,
  lineHeight: 1.2,
  cursorStyle: 'block',
  cursorBlink: true,
  cursorColor: '#60A5FA',
  foreground: '#E8F1EC',
  background: '#0A0F1A',
  selectionForeground: '#E8F1EC',
  selectionBackground: 'rgba(45, 212, 191, 0.3)',
  colors: [
    '#0A0F1A', '#FF7B72', '#34D399', '#FBBF24',
    '#38BDF8', '#CE93D8', '#38BDF8', '#E8F1EC',
    '#8FA3B0', '#FF8A80', '#93C5FD', '#FFE57F',
    '#7DD3FC', '#EA80FC', '#67E8F9', '#FFFFFF',
  ],
};

export const LIGHT_APPEARANCE: AppearanceConfig = {
  fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, Menlo, Monaco, monospace',
  fontSize: 14,
  lineHeight: 1.2,
  cursorStyle: 'block',
  cursorBlink: true,
  cursorColor: '#1D4ED8',
  foreground: '#0E241D',
  background: '#FFFFFF',
  selectionForeground: '#FFFFFF',
  selectionBackground: 'rgba(15, 118, 110, 0.25)',
  colors: [
    '#0E241D', '#DC2626', '#16A34A', '#D97706',
    '#0284C7', '#9333EA', '#0369A1', '#374151',
    '#5A6B64', '#F87171', '#22C55E', '#F59E0B',
    '#38BDF8', '#A855F7', '#38BDF8', '#FFFFFF',
  ],
};

export const DEFAULT_APPEARANCE = DARK_APPEARANCE;

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  language: 'zh-CN',
  showStatusBar: true,
  confirmBeforeClose: true,
  restoreTabsOnStartup: true,
  appearance: DEFAULT_APPEARANCE,
  bellStyle: 'none',
  webglRenderer: true,
  scrollback: 10000,
  copyOnSelect: true,
  pasteOnMiddleClick: true,
  // Default to empty string so the Tauri backend can pick the appropriate shell
  // (pwsh.exe / powershell.exe / cmd.exe on Windows, $SHELL on macOS/Linux).
  // An empty value is treated as "use platform default" by the backend.
  shell: '',
};

const STORAGE_KEY = 'webcraft-settings';

function loadFromStorage(): AppSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Older builds hard-coded the macOS-only default '/bin/zsh' which fails on
      // Windows. Reset to empty so the backend picks the correct shell for the
      // current platform. Users who deliberately configured a custom shell keep it.
      let persistedShell: string = parsed.shell ?? '';
      if (persistedShell === '/bin/zsh' || persistedShell === '/bin/bash') {
        persistedShell = '';
      }
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        shell: persistedShell,
        appearance: { ...DEFAULT_APPEARANCE, ...parsed.appearance },
      };
    }
  } catch (err) { console.error('settingsStore: JSON parse failed', err); }
  return DEFAULT_SETTINGS;
}

function saveToStorage(settings: AppSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function getThemeAppearance(theme: ThemeMode): AppearanceConfig {
  if (theme === 'light') return LIGHT_APPEARANCE;
  if (theme === 'dark') return DARK_APPEARANCE;
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return isDark ? DARK_APPEARANCE : LIGHT_APPEARANCE;
}

interface SettingsState {
  settings: AppSettings;
  initialized: boolean;
  init: () => void;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  updateAppearance: <K extends keyof AppearanceConfig>(key: K, value: AppearanceConfig[K]) => void;
  reset: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  initialized: false,

  init: () => {
    if (get().initialized) return;
    const loaded = loadFromStorage();
    set({ settings: loaded, initialized: true });
  },

  update: (key, value) => {
    const next = { ...get().settings, [key]: value };
    saveToStorage(next);
    set({ settings: next });
  },

  updateAppearance: (key, value) => {
    const next = {
      ...get().settings,
      appearance: { ...get().settings.appearance, [key]: value },
    };
    saveToStorage(next);
    set({ settings: next });
  },

  reset: () => {
    saveToStorage(DEFAULT_SETTINGS);
    set({ settings: DEFAULT_SETTINGS });
  },
}));
