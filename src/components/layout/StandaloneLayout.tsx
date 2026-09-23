import { Suspense, lazy } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { Routes, Route } from 'react-router-dom';

// 独立窗口（WebviewWindow）路由。每个窗口只加载自己页面的模块，
// 不再连带主窗口的编辑器/终端/站点管理等大模块。
const AiCopilotPage = lazy(() => import('../../pages/AiCopilotPage').then((m) => ({ default: m.AiCopilotPage })));
const AiEditorPage = lazy(() => import('../../pages/AiEditorPage').then((m) => ({ default: m.AiEditorPage })));
const RemoteDesktopPage = lazy(() => import('../../pages/RemoteDesktopPage').then((m) => ({ default: m.RemoteDesktopPage })));
const SftpPage = lazy(() => import('../../pages/SftpPage').then((m) => ({ default: m.SftpPage })));
const SiteOpsWindowPage = lazy(() => import('../../pages/SiteOpsWindowPage').then((m) => ({ default: m.SiteOpsWindowPage })));
const NotFoundPage = lazy(() => import('../../pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));

function PageLoading() {
  return (
    <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <CircularProgress size={28} />
    </Box>
  );
}

export function StandaloneLayout() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/ai-copilot" element={<AiCopilotPage />} />
        <Route path="/ai-editor" element={<AiEditorPage />} />
        <Route path="/remote-desktop" element={<RemoteDesktopPage />} />
        <Route path="/sftp" element={<SftpPage />} />
        <Route path="/site-ops" element={<SiteOpsWindowPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
