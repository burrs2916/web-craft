import { createTheme, ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import type { ReactNode } from 'react';
import { useMemo, useEffect, useState } from 'react';
import { useSettingsStore } from '../engine';
import { brand } from './brand';

const darkPalette = {
  mode: 'dark' as const,
  primary: {
    main: brand.dark.primary,
    light: brand.dark.primaryLight,
    dark: brand.dark.primaryDark,
  },
  secondary: { main: brand.dark.secondary, light: brand.amber300, dark: brand.amber600 },
  success: { main: '#34D399' },
  warning: { main: brand.amber400 },
  error: { main: '#F87171' },
  info: { main: brand.dark.accent },
  background: { default: brand.dark.background, paper: brand.dark.paper },
  text: { primary: brand.dark.text, secondary: brand.dark.textSecondary },
  divider: brand.dark.divider,
};

const lightPalette = {
  mode: 'light' as const,
  primary: {
    main: brand.light.primary,
    light: brand.light.primaryLight,
    dark: brand.light.primaryDark,
  },
  secondary: { main: brand.light.secondary, light: brand.amber500, dark: brand.amber600 },
  success: { main: '#16A34A' },
  warning: { main: brand.amber600 },
  error: { main: '#DC2626' },
  info: { main: brand.light.accent },
  background: { default: brand.light.background, paper: brand.light.paper },
  text: { primary: brand.light.text, secondary: brand.light.textSecondary },
  divider: brand.light.divider,
};

function buildTheme(mode: 'dark' | 'light') {
  const palette = mode === 'dark' ? darkPalette : lightPalette;
  const isDark = mode === 'dark';
  const t = isDark ? brand.dark : brand.light;

  return createTheme({
    palette,
    typography: {
      fontFamily: '"Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      h6: { fontWeight: 600, letterSpacing: '0.02em' },
      subtitle2: { fontWeight: 600 },
    },
    shape: { borderRadius: 10 },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            // 品牌辉光：左上松石青 + 右下天蓝，呼应品牌渐变方向
            background: isDark
              ? `radial-gradient(1100px 560px at 18% -8%, rgba(13,148,136,0.12), transparent 60%),
                 radial-gradient(900px 480px at 92% 108%, rgba(2,132,199,0.10), transparent 60%),
                 ${t.background}`
              : `radial-gradient(1100px 560px at 18% -8%, rgba(20,184,166,0.10), transparent 60%),
                 radial-gradient(900px 480px at 92% 108%, rgba(2,132,199,0.08), transparent 60%),
                 ${t.background}`,
            backgroundAttachment: 'fixed',
          },
          '*::-webkit-scrollbar': { width: 10, height: 10 },
          '*::-webkit-scrollbar-track': { background: 'transparent' },
          '*::-webkit-scrollbar-thumb': {
            background: isDark ? 'rgba(45,212,191,0.22)' : 'rgba(15,118,110,0.22)',
            borderRadius: 6,
            border: '2px solid transparent',
            backgroundClip: 'content-box',
          },
          '*::-webkit-scrollbar-thumb:hover': {
            background: isDark ? 'rgba(45,212,191,0.42)' : 'rgba(15,118,110,0.42)',
            border: '2px solid transparent',
            backgroundClip: 'content-box',
          },
          '*::-webkit-scrollbar-corner': { background: 'transparent' },
          '::selection': {
            background: isDark ? 'rgba(45,212,191,0.32)' : 'rgba(15,118,110,0.22)',
          },
          ':focus-visible': {
            outline: isDark ? '2px solid rgba(45,212,191,0.55)' : '2px solid rgba(15,118,110,0.5)',
            outlineOffset: 1,
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundImage: isDark
              ? 'linear-gradient(135deg, #0B1622 0%, #070B12 100%)'
              : 'linear-gradient(135deg, #ffffff 0%, #f0f9f6 100%)',
            borderBottom: isDark
              ? '1px solid rgba(45, 212, 191, 0.20)'
              : '1px solid rgba(15, 118, 110, 0.14)',
            boxShadow: isDark
              ? '0 1px 4px rgba(0,0,0,0.45)'
              : '0 1px 4px rgba(16,37,31,0.10)',
            color: t.text,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: palette.background.default,
            borderRight: isDark
              ? '1px solid rgba(45, 212, 191, 0.12)'
              : '1px solid rgba(15, 118, 110, 0.1)',
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            mx: 1,
            mb: 0.25,
            '&.Mui-selected': {
              backgroundColor: t.selectedBg,
              boxShadow: isDark ? 'inset 0 0 0 1px rgba(45,212,191,0.25)' : 'inset 0 0 0 1px rgba(15,118,110,0.18)',
              '&:hover': { backgroundColor: isDark ? 'rgba(45,212,191,0.18)' : 'rgba(15,118,110,0.12)' },
            },
            '&:hover': { backgroundColor: t.hoverBg },
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: { textTransform: 'none', fontWeight: 500 },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 500 },
        },
      },
      MuiFormLabel: {
        styleOverrides: {
          asterisk: { color: '#FF7B72', fontSize: '0.85em' },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none' },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            backgroundColor: palette.background.paper,
            border: isDark
              ? '1px solid rgba(45,212,191,0.2)'
              : '1px solid rgba(15,118,110,0.15)',
          },
        },
      },
      MuiDivider: {
        styleOverrides: {
          root: {
            borderColor: palette.divider,
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: isDark ? t.elevated : '#1F2937',
            border: isDark ? '1px solid rgba(45,212,191,0.15)' : 'none',
            fontSize: 12,
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            backgroundColor: palette.background.paper,
            border: isDark
              ? '1px solid rgba(45,212,191,0.15)'
              : '1px solid rgba(15,118,110,0.1)',
            boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.5)' : '0 8px 24px rgba(16,37,31,0.12)',
          },
        },
      },
    },
  });
}

function getSystemTheme(): 'dark' | 'light' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

interface AppThemeProps {
  children: ReactNode;
}

export function AppTheme({ children }: AppThemeProps) {
  const themeMode = useSettingsStore((s) => s.settings.theme);
  const [systemDark, setSystemDark] = useState(getSystemTheme() === 'dark');

  useEffect(() => {
    if (themeMode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [themeMode]);

  const resolvedMode = useMemo(() => {
    if (themeMode === 'system') return systemDark ? 'dark' : 'light';
    return themeMode;
  }, [themeMode, systemDark]);

  const theme = useMemo(() => buildTheme(resolvedMode), [resolvedMode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      {children}
    </ThemeProvider>
  );
}

export { darkPalette, lightPalette };
