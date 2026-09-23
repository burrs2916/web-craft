import { Suspense, lazy, useEffect } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AppShell, Sidebar, Header, StatusBar } from './index';
import { useSettingsStore } from '../../engine';
import { useSceneStore } from '../../store/sceneStore';

// 路由级代码分割：每个页面按需加载，
// 避免主窗口启动时加载全部页面模块（编辑器、站点、终端等）。
const TerminalPage = lazy(() => import('../../pages/TerminalPage').then((m) => ({ default: m.TerminalPage })));
const SitesPage = lazy(() => import('../../pages/SitesPage').then((m) => ({ default: m.SitesPage })));
const SiteDetailPage = lazy(() => import('../../pages/SiteDetailPage').then((m) => ({ default: m.SiteDetailPage })));
const ContentEditorPage = lazy(() => import('../../pages/ContentEditorPage').then((m) => ({ default: m.ContentEditorPage })));
const ConnectionPage = lazy(() => import('../../pages/ConnectionPage').then((m) => ({ default: m.ConnectionPage })));
const SettingsPage = lazy(() => import('../../pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const AgentPage = lazy(() => import('../../pages/AgentPage').then((m) => ({ default: m.AgentPage })));
const ProfilePage = lazy(() => import('../../pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const NotFoundPage = lazy(() => import('../../pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));
const ResourceCenterPage = lazy(() => import('../../pages/ResourceCenterPage').then((m) => ({ default: m.ResourceCenterPage })));
const WebsiteEditorPage = lazy(() => import('../../pages/WebsiteEditorPage').then((m) => ({ default: m.WebsiteEditorPage })));
const PublishedSitesPage = lazy(() => import('../../pages/PublishedSitesPage').then((m) => ({ default: m.PublishedSitesPage })));
const WebsitesPage = lazy(() => import('../../pages/WebsitesPage').then((m) => ({ default: m.WebsitesPage })));

function PageLoading() {
  return (
    <Box sx={{ flex: 1, minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <CircularProgress size={28} />
    </Box>
  );
}

export function AppLayout() {
  const showStatusBar = useSettingsStore((s) => s.settings.showStatusBar);
  const initScenes = useSceneStore((s) => s.init);
  const location = useLocation();
  const isTerminal = location.pathname === '/terminal';

  // 场景数据只有主窗口（编辑器/站点页）需要，
  // 独立窗口（site-ops/sftp 等）不渲染本组件，因而不会加载场景、
  // 也不会触发 90 个内置组件注册与插件库同步。
  useEffect(() => {
    void initScenes();
  }, [initScenes]);

  return (
    <AppShell>
      <Header />
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', mt: '48px' }}>
        <Sidebar />
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              inset: isTerminal ? 0 : undefined,
              width: isTerminal ? 'auto' : 0,
              height: isTerminal ? 'auto' : 0,
              overflow: 'hidden',
              visibility: isTerminal ? 'visible' : 'hidden',
              display: 'flex',
              flexDirection: 'column',
              zIndex: isTerminal ? 1 : -1,
            }}
          >
            <Suspense fallback={<PageLoading />}>
              <TerminalPage />
            </Suspense>
          </Box>

          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              visibility: isTerminal ? 'hidden' : 'visible',
              position: isTerminal ? 'absolute' : 'relative',
              inset: isTerminal ? 0 : undefined,
              width: isTerminal ? 0 : 'auto',
              overflow: isTerminal ? 'hidden' : 'visible',
              zIndex: isTerminal ? -1 : 1,
            }}
          >
            <Suspense fallback={<PageLoading />}>
              <Routes>
                <Route path="/" element={<Navigate to="/editor" replace />} />
                <Route path="/terminal" element={<div />} />
                <Route path="/sites" element={<SitesPage />} />
                <Route path="/sites/:siteId" element={<SiteDetailPage />} />
                <Route path="/sites/:siteId/content/:contentId" element={<ContentEditorPage />} />
                <Route path="/agent" element={<AgentPage />} />
                <Route path="/connections" element={<ConnectionPage />} />
                <Route path="/resources" element={<ResourceCenterPage />} />
                <Route path="/editor" element={<WebsiteEditorPage />} />
                <Route path="/websites" element={<WebsitesPage />} />
                <Route path="/published" element={<PublishedSitesPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </Box>
        </Box>
      </Box>
      {showStatusBar && <StatusBar />}
    </AppShell>
  );
}
