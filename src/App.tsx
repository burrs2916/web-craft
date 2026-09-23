import { Suspense, lazy, useEffect } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { HashRouter, useLocation } from 'react-router-dom';
import { AppTheme } from './theme';
import { NotificationProvider } from './core/notification';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useSettingsStore } from './engine';
import i18n from './core/i18n';
import { LicenseProvider, UpgradeDialog } from './features/licensing';

// 布局级代码分割：主窗口与独立窗口各自按需加载。
// 独立窗口（site-ops / sftp / remote-desktop / ai-copilot）不再加载
// 主窗口的编辑器、终端、站点管理等全部页面模块与 90 个组件注册。
const AppLayout = lazy(() => import('./components/layout/AppLayout').then((m) => ({ default: m.AppLayout })));
const StandaloneLayout = lazy(() => import('./components/layout/StandaloneLayout').then((m) => ({ default: m.StandaloneLayout })));

function RootLoading() {
  return (
    <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <CircularProgress size={32} />
    </Box>
  );
}

function RootRouter() {
  const location = useLocation();
  // HashRouter: path-only urls (e.g. "/category-notes") are loaded as pathname "/" with hash "#/..."
  // WebviewWindow urls (e.g. "/#/category-notes") are loaded as pathname "/<any>" with hash "#/category-notes"
  // So we need to inspect both pathname AND hash to determine if we are in a standalone window.
  const checkPath = (location.hash.replace(/^#/, '') || location.pathname);
  const isStandalone = checkPath.startsWith('/ai-copilot') || checkPath.startsWith('/ai-editor') || checkPath.startsWith('/remote-desktop') || checkPath.startsWith('/sftp') || checkPath.startsWith('/site-ops');

  return (
    <Suspense fallback={<RootLoading />}>
      {isStandalone ? <StandaloneLayout /> : <AppLayout />}
    </Suspense>
  );
}

export default function App() {
  const initSettings = useSettingsStore((s) => s.init);
  const language = useSettingsStore((s) => s.settings.language);

  useEffect(() => {
    initSettings();
  }, [initSettings]);

  useEffect(() => {
    if (language && i18n.language !== language) {
      i18n.changeLanguage(language);
    }
  }, [language]);

  return (
    <HashRouter>
      <AppTheme>
        <LicenseProvider>
          <NotificationProvider>
            <ErrorBoundary>
              <RootRouter />
              <UpgradeDialog />
            </ErrorBoundary>
          </NotificationProvider>
        </LicenseProvider>
      </AppTheme>
    </HashRouter>
  );
}
