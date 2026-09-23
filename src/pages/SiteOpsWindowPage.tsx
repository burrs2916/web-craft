import { useCallback, useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import { HardDriveIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { SiteOpsPanel } from '../components/ops/SiteOpsPanel';
import { listConnections } from '../core/services/connection.service';
import { getSite } from '../core/services/cms.service';
import type { ConnectionConfig } from '../proto/connection';
import type { Site } from '../proto/cms';

/**
 * 运维中心独立窗口页面（WebviewWindow）。
 * 从 URL query 中读取 siteId / connectionId，加载连接列表后渲染 SiteOpsPanel。
 */
export function SiteOpsWindowPage() {
  const { t } = useTranslation('ops');
  const [searchParams] = useSearchParams();
  const siteId = searchParams.get('siteId') || '';
  const connectionId = searchParams.get('connectionId') || '';
  const siteName = searchParams.get('siteName') || '';
  const initialTab = searchParams.get('tab') as 'env' | 'deploy' | 'scripts' | 'tasks' | 'history' | null;

  const [connections, setConnections] = useState<ConnectionConfig[]>([]);
  const [site, setSite] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeConn = useMemo(
    () => connections.find((c) => c.id === connectionId),
    [connections, connectionId],
  );

  // 从站点部署配置解析远程路径
  const siteRemotePath = useMemo(() => {
    if (!site) return '';
    try {
      const deploy = JSON.parse(site.deploy_config_json || '{}');
      return deploy.remote_path || '';
    } catch {
      return '';
    }
  }, [site]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [conns, siteData] = await Promise.all([
        listConnections(),
        siteId ? getSite(siteId).catch(() => null) : Promise.resolve(null),
      ]);
      setConnections(conns);
      setSite(siteData);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // 更新窗口标题
  useEffect(() => {
    const title = siteName ? `${siteName} · 运维中心` : '运维中心';
    document.title = title;
  }, [siteName]);

  if (loading) {
    return (
      <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Alert severity="error" sx={{ maxWidth: 480 }}>{error}</Alert>
      </Box>
    );
  }

  if (!connectionId) {
    return (
      <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 6 }}>
        <HardDriveIcon size={56} weight="thin" style={{ opacity: 0.3, marginBottom: 16 }} />
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
          {t('title')}
        </Typography>
        <Alert severity="info" sx={{ maxWidth: 420 }}>
          未指定服务器连接。请从站点卡片打开运维中心。
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* 顶部标题栏 */}
      <Box
        sx={{
          px: 2.5,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          userSelect: 'none',
          // 支持拖动窗口
          WebkitAppRegion: 'drag' as any,
          appRegion: 'drag' as any,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0, WebkitAppRegion: 'no-drag' as any, appRegion: 'no-drag' as any }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            {site?.name || siteName || t('title')}
          </Typography>
          {activeConn && (
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: 11 }}>
              {(() => {
                try {
                  const s = JSON.parse(activeConn.config_json);
                  return `${s.username || ''}@${s.host || ''}`;
                } catch {
                  return activeConn.name;
                }
              })()}
            </Typography>
          )}
        </Box>
      </Box>

      {/* 运维面板内容 */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <SiteOpsPanel
          connectionId={connectionId}
          connections={connections}
          siteName={site?.name || siteName}
          domain={site?.domain}
          remotePath={siteRemotePath}
          initialTab={initialTab || undefined}
        />
      </Box>
    </Box>
  );
}
