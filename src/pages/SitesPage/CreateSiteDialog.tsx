import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  Alert,
  Divider,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  PlusIcon,
  FileTextIcon,
  CloudIcon,
  MonitorIcon,
  RocketIcon,
  ArrowSquareOutIcon,
} from '@phosphor-icons/react';
import { createSite, initRemoteSite } from '../../core/services/cms.service';
import { listConnections } from '../../core/services/connection.service';
import { opsRunScript } from '../../core/services/ops.service';
import EnvCheckPanel from '../../components/ops/EnvCheckPanel';
import type { EnvCheckResult } from '../../proto/env-check';
import type { Site, ConnectionConfig } from '../../proto';
import { openSiteOpsWindow, openAiCopilotWindow } from '../../core/services/window.service';
import { ServerInfoCard } from './ServerInfoCard';
import { QuickConnDialog } from './QuickConnDialog';

export interface CreateSiteDialogProps {
  open: boolean;
  connections: ConnectionConfig[];
  onClose: () => void;
  onCreated: (site: Site) => void;
  onConnectionsChanged?: () => void;
}

export function CreateSiteDialog({
  open,
  connections,
  onClose,
  onCreated,
  onConnectionsChanged,
}: CreateSiteDialogProps) {
  const { t } = useTranslation('cms');
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [connectionId, setConnectionId] = useState<string>('');
  const [remotePath, setRemotePath] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  /// 打开弹窗时重新拉取连接，避免用户停留在页面期间新增的服务器不生效
  const [connLoading, setConnLoading] = useState(false);
  // 远程初始化进度
  const [initStep, setInitStep] = useState<'idle' | 'creating' | 'init_remote' | 'done'>('idle');
  const [initError, setInitError] = useState<string | null>(null);
  const [createdSite, setCreatedSite] = useState<Site | null>(null);
  // 环境检测（新建站点 → 环境检测 → 部署 统一闭环）
  const [envResult, setEnvResult] = useState<EnvCheckResult | null>(null);
  const [envLoading, setEnvLoading] = useState(false);
  const [envError, setEnvError] = useState('');
  const [envCheckedAt, setEnvCheckedAt] = useState<number | null>(null);

  // 快速新建连接对话框
  const [quickConnOpen, setQuickConnOpen] = useState(false);

  const sshConnections = useMemo(
    () => connections.filter((c) => c.connection_type === 'ssh'),
    [connections],
  );

  // 打开时重置表单，并重新拉取服务器连接（站点必须绑定远程服务器）
  useEffect(() => {
    if (!open) return;
    setName('');
    setDomain('');
    setRemotePath('');
    setFormError(null);
    setSubmitting(false);
    setInitStep('idle');
    setInitError(null);
    setCreatedSite(null);
    setEnvResult(null);
    setEnvLoading(false);
    setEnvError('');
    setEnvCheckedAt(null);

    let cancelled = false;
    void (async () => {
      setConnLoading(true);
      try {
        const latest = await listConnections();
        if (cancelled) return;
        const ssh = latest.filter((c) => c.connection_type === 'ssh');
        setConnectionId(ssh.length > 0 ? ssh[0].id : '');
        onConnectionsChanged?.();
      } catch {
        if (!cancelled) setConnectionId('');
      } finally {
        if (!cancelled) setConnLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // 域名变化时更新远程路径（仅当用户未手动修改过时）
  useEffect(() => {
    if (connectionId && domain.trim()) {
      const defaultPath = `/var/www/${domain.trim()}/html`;
      // 只有当前路径为空或为默认路径时才自动更新
      if (!remotePath || remotePath === '/var/www/' || remotePath.startsWith('/var/www/') && remotePath.endsWith('/html')) {
        setRemotePath(defaultPath);
      }
    }
  }, [domain, connectionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 环境检测：复用运维中心 ops-web-env-check 脚本，把「目标服务器能否部署」结构化返回。
  const runEnvCheck = useCallback(async () => {
    if (!connectionId) return;
    setEnvLoading(true);
    setEnvError('');
    try {
      const params: Record<string, string> = {
        domain: domain || name || '',
        deploy_path: remotePath || '',

      };
      const result = await opsRunScript('ops-web-env-check', params, connectionId);
      if (!result.success) {
        throw new Error(result.stderr || result.stdout || t('sites.envcheck_failed'));
      }
      const stdout = result.stdout.trim();
      const firstBrace = stdout.indexOf('{');
      const lastBrace = stdout.lastIndexOf('}');
      if (firstBrace === -1 || lastBrace === -1) {
        throw new Error(t('sites.envcheck_parse_failed'));
      }
      const data = JSON.parse(stdout.slice(firstBrace, lastBrace + 1)) as EnvCheckResult;
      setEnvResult(data);
      setEnvCheckedAt(Date.now());
    } catch (e) {
      setEnvError(String(e));
      setEnvResult(null);
    } finally {
      setEnvLoading(false);
    }
  }, [connectionId, domain, name, remotePath, t]);

  /// 站点必须绑定远程服务器：名称 + 目标服务器，工作目录绑定网站时自动同步
  const canSubmit =
    name.trim().length > 0 &&
    !!connectionId &&
    !connLoading &&
    !submitting &&
    initStep === 'idle' &&
    !createdSite;

  const submit = useCallback(async () => {
    if (!connectionId) {
      setFormError(t('sites.no_server_required'));
      return;
    }
    setSubmitting(true);
    setFormError(null);
    setInitError(null);
    try {
      setInitStep('creating');
      const site = await createSite({
        name: name.trim(),
        domain: domain.trim(),
        localWorkdir: '',
        connectionId,
        remotePath: remotePath.trim() || undefined,
      });
      setCreatedSite(site);

      // 绑定了远程服务器，自动初始化远程目录
      if (remotePath.trim()) {
        setInitStep('init_remote');
        try {
          await initRemoteSite(site.id);
        } catch (e) {
          // 远程初始化失败不阻塞站点创建，记录错误但保留已创建的站点
          setInitError(String(e));
          setInitStep('idle');
          setSubmitting(false);
          return;
        }
      }

      setInitStep('done');
      // 已绑定服务器：自动跑环境检测，形成「新建站点 → 环境检测 → 部署」闭环。
      if (remotePath.trim()) {
        void runEnvCheck();
      }
    } catch (e) {
      setFormError(String(e));
      setSubmitting(false);
      setInitStep('idle');
    }
  }, [name, domain, connectionId, remotePath, t]);

  const openQuickConn = () => {
    setQuickConnOpen(true);
  };

  const hasServers = sshConnections.length > 0;

  return (
    <>
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('sites.create_title')}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
        {/* —— 分组一：基本信息 —— */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Box sx={{ color: 'text.secondary', display: 'flex' }}>
              <FileTextIcon size={16} weight="fill" />
            </Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary' }}>
              {t('sites.section_basic')}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pl: 0.25 }}>
            <TextField
              label={t('sites.form_name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              fullWidth
              required
              size="small"
            />
            <TextField
              label={t('sites.form_domain')}
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
              fullWidth
              size="small"
            />
          </Box>
        </Box>

        <Divider sx={{ mx: -1 }} />

        {/* —— 分组二：部署目标 —— */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Box sx={{ color: 'text.secondary', display: 'flex' }}>
              <CloudIcon size={16} weight="fill" />
            </Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary' }}>
              {t('sites.section_deploy')}
            </Typography>
            <Typography variant="caption" color="error.main" sx={{ ml: 0.5 }}>
              *
            </Typography>
            {connectionId && (
              <Chip
                label={t('sites.deploy_enabled')}
                size="small"
                color="success"
                variant="outlined"
                sx={{ height: 20, fontSize: 11, ml: 0.5 }}
              />
            )}
          </Box>
          <Box sx={{ pl: 0.25 }}>
            {connLoading ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2.5, justifyContent: 'center' }}>
                <CircularProgress size={18} />
                <Typography variant="caption" color="text.secondary">
                  {t('sites.checking_servers')}
                </Typography>
              </Box>
            ) : connectionId ? (
              /* 已选中服务器：展示服务器信息卡片 */
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <ServerInfoCard
                  connectionId={connectionId}
                  connections={connections}
                  onChange={openQuickConn}
                />
                <TextField
                  label={t('sites.form_remote_path')}
                  value={remotePath}
                  onChange={(e) => setRemotePath(e.target.value)}
                  placeholder="/var/www/example.com/html"
                  fullWidth
                  size="small"
                />
              </Box>
            ) : (
              /* 未选中服务器：阻断态 —— 站点必须部署到远程服务器 */
              <Paper
                variant="outlined"
                sx={{
                  p: 2.5,
                  textAlign: 'center',
                  borderStyle: 'dashed',
                  borderColor: 'warning.main',
                  bgcolor: 'action.hover',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <Box sx={{ color: 'warning.main', display: 'flex' }}>
                  <CloudIcon size={32} weight="thin" />
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {hasServers ? t('sites.pick_server_title') : t('sites.no_server_title')}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 300 }}>
                  {t('sites.no_server_required')}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {hasServers && (
                    <Button
                      variant="contained"
                      size="small"
                      onClick={openQuickConn}
                      startIcon={<PlusIcon size={14} weight="bold" />}
                      sx={{ textTransform: 'none', borderRadius: '8px' }}
                    >
                      {t('sites.choose_server_btn')}
                    </Button>
                  )}
                  <Button
                    variant={hasServers ? 'outlined' : 'contained'}
                    size="small"
                    onClick={() => navigate('/connections')}
                    startIcon={<ArrowSquareOutIcon size={14} weight="bold" />}
                    sx={{ textTransform: 'none', borderRadius: '8px' }}
                  >
                    {t('sites.go_connections')}
                  </Button>
                </Box>
              </Paper>
            )}
          </Box>
        </Box>


        {formError && <Alert severity="error" sx={{ mt: 0.5 }}>{formError}</Alert>}
        {initError && <Alert severity="warning" sx={{ mt: 0.5 }}>
          <strong>远程目录初始化失败：</strong>站点已创建，但服务器目录未初始化。你可以稍后在站点设置中重试。
          <Box sx={{ mt: 0.5, fontSize: 12, opacity: 0.8 }}>{initError}</Box>
        </Alert>}

        {/* 远程初始化进度 */}
        {initStep !== 'idle' && initStep !== 'done' && (
          <Box sx={{ mt: 1, p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
              <CircularProgress size={20} thickness={2.5} />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {initStep === 'creating' && t('sites.init_remote_progress_creating')}
                {initStep === 'init_remote' && t('sites.init_remote_progress_init')}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{
                  width: 8, height: 8, borderRadius: '50%',
                  bgcolor: 'success.main',
                }} />
                <Typography variant="caption" color="text.primary">
                  创建本地站点记录
                </Typography>
              </Box>
              {connectionId && remotePath.trim() && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{
                    width: 8, height: 8, borderRadius: '50%',
                    bgcolor: initStep === 'init_remote' ? 'success.main' : 'grey.300',
                  }} />
                  <Typography variant="caption" color={initStep === 'init_remote' ? 'text.primary' : 'text.secondary'}>
                    初始化远程目录：{remotePath.trim()}
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        )}

        {/* 新建完成 + 环境检测（统一闭环） */}
        {createdSite && connectionId && (
          <Box sx={{ mt: 1, p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Box sx={{ color: 'text.secondary', display: 'flex' }}><MonitorIcon size={16} weight="fill" /></Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                {t('sites.section_envcheck')}
              </Typography>
              {connectionId && (
                <Chip label={t('sites.envcheck_auto')} size="small" color="info" variant="outlined" sx={{ height: 20, fontSize: 11, ml: 0.5 }} />
              )}
            </Box>
            <EnvCheckPanel
              result={envResult}
              loading={envLoading}
              error={envError}
              connectionId={connectionId}
              onRefresh={runEnvCheck}
              siteName={createdSite.name}
              checkedAt={envCheckedAt ?? undefined}
              domain={domain || undefined}
              deployPath={remotePath || undefined}
              onDeploy={() => void openSiteOpsWindow({ siteId: createdSite.id, siteName: createdSite.name, connectionId, tab: 'deploy' })}
              onAiFix={() => {
                let h = ''; let u = '';
                try {
                  const s = JSON.parse((connections.find((c) => c.id === connectionId)?.config_json) || '{}');
                  h = s.host || ''; u = s.username || '';
                } catch { /* ignore */ }
                void openAiCopilotWindow({
                  scene: 'envFix',
                  host: h,
                  username: u,
                  siteName: createdSite.name,
                  domain: domain || undefined,
                  remotePath: remotePath || undefined,
                            checkReport: envResult ? JSON.stringify(envResult) : undefined,
                });
              }}
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        {createdSite ? (
          <>
            <Button
              variant="contained"
              onClick={() => void openSiteOpsWindow({ siteId: createdSite.id, siteName: createdSite.name, connectionId, tab: 'deploy' })}
              startIcon={<RocketIcon size={18} weight="bold" />}
            >
              {t('sites.go_deploy')}
            </Button>
            {/* 关闭时回调 onCreated：刷新站点列表，保证新建的站点立即可见 */}
            <Button onClick={() => onCreated(createdSite)}>{t('common:action.close')}</Button>
          </>
        ) : (
          <>
            <Button onClick={onClose} disabled={submitting && initStep !== 'idle'}>
              {t('common:action.cancel')}
            </Button>
            <Button variant="contained" onClick={submit} disabled={!canSubmit} startIcon={<PlusIcon size={18} weight="bold" />}>
              {submitting ? <CircularProgress size={18} color="inherit" /> : t('sites.action_create')}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>

    {/* 快速新建连接对话框 */}
    <QuickConnDialog
      open={quickConnOpen}
      connections={connections}
      selectedConnectionId={connectionId}
      domain={domain}
      autoFocusHost
      onClose={() => setQuickConnOpen(false)}
      onPicked={(id, path) => {
        setConnectionId(id);
        if (path) setRemotePath(path);
        setQuickConnOpen(false);
      }}
      onConnectionsChanged={onConnectionsChanged}
      onOpenConnManager={() => navigate('/connections')}
    />
    </>
  );
}