import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  LinearProgress,
  Link,
  List,
  ListItem,
  ListItemIcon,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
  CheckCircleIcon,
  HourglassIcon,
  RocketIcon,
  WarningCircleIcon,
  WrenchIcon,
} from '@phosphor-icons/react';
import { deploySite, deployCheck, onDeployProgress } from '../../core/services/cms.service';
import { openUrl } from '@tauri-apps/plugin-opener';
import { openSiteOpsWindow } from '../../core/services/window.service';
import type {
  DeployProgress,
  DeployReadiness,
  DeployStep,
  Site,
  SshConnectionInfo,
} from '../../proto';

type Phase = 'confirm' | 'running' | 'success' | 'failed';

/// 部署步骤定义（顺序即执行顺序，路线B：静态托管）
const DEPLOY_STEPS: { key: DeployStep; label: string }[] = [
  { key: 'validate', label: '校验配置' },
  { key: 'precheck', label: '环境预检' },
  { key: 'config', label: '生成配置' },
  { key: 'upload', label: '上传文件' },
  { key: 'switch', label: '蓝绿切换' },
  { key: 'nginx', label: 'Nginx 配置' },
  { key: 'verify', label: '可达性验证' },
  { key: 'cleanup', label: '清理旧版本' },
  { key: 'done', label: '部署完成' },
];

export function DeployDialog({
  open,
  onClose,
  site,
  sshInfo,
  onDeployed,
}: {
  open: boolean;
  onClose: () => void;
  site: Site;
  sshInfo: SshConnectionInfo | null;
  onDeployed?: () => void;
}) {
  const { t } = useTranslation('cms');
  const [phase, setPhase] = useState<Phase>('confirm');
  const [progress, setProgress] = useState<DeployProgress>({
    step: 'validate',
    message: '',
    percent: 0,
  });
  const [failedMsg, setFailedMsg] = useState('');
  const [readiness, setReadiness] = useState<DeployReadiness | null>(null);
  const [checking, setChecking] = useState(false);

  const deployConfig = useMemo(() => {
    try {
      return JSON.parse(site.deploy_config_json || '{}');
    } catch {
      return {};
    }
  }, [site.deploy_config_json]);
  const remotePath: string = typeof deployConfig.remote_path === 'string' ? deployConfig.remote_path : '';

  /// 部署前就绪检查：把「为什么不能部署」结构化呈现，避免在真正 deploy 时才模糊失败。
  const runDeployCheck = useCallback(async () => {
    setChecking(true);
    try {
      const r = await deployCheck(site.id);
      setReadiness(r);
    } catch (e) {
      setReadiness({
        ok: false,
        siteId: site.id,
        siteName: site.name,
        connectionId: null,
        connectionName: null,
        remotePath: null,
        localDistExists: false,
        nginxAvailable: null,
        issues: [{ level: 'error', code: 'CHECK_ERROR', message: String(e), hint: null }],
      });
    } finally {
      setChecking(false);
    }
  }, [site.id, site.name]);

  useEffect(() => {
    if (open) {
      setPhase('confirm');
      setProgress({ step: 'validate', message: '', percent: 0 });
      setFailedMsg('');
      setReadiness(null);
      void runDeployCheck();
    }
  }, [open, runDeployCheck]);

  const startDeploy = useCallback(async () => {
    setPhase('running');
    setProgress({ step: 'validate', message: '', percent: 0 });
    const unsubscribe = await onDeployProgress(site.id, (p) => setProgress(p));
    try {
      await deploySite(site.id);
      setPhase('success');
      onDeployed?.();
    } catch (e) {
      setFailedMsg(String(e));
      setPhase('failed');
    } finally {
      unsubscribe();
    }
  }, [site.id, onDeployed]);

  const start = useCallback(() => {
    startDeploy();
  }, [startDeploy]);

  const stepLabel = (step: string) => {
    const found = DEPLOY_STEPS.find((s) => s.key === step);
    return found?.label || step;
  };

  const isEnvFailed = phase === 'failed' && failedMsg.includes('环境未满足');

  const openOpsCenter = useCallback((targetTab?: 'env' | 'deploy' | 'scripts' | 'tasks' | 'history') => {
    openSiteOpsWindow({
      siteId: site.id,
      siteName: site.name,
      connectionId: site.connection_id || '',
      tab: targetTab || 'env',
    });
  }, [site.id, site.name, site.connection_id]);

  return (
    <Dialog open={open} onClose={phase === 'running' ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {t('contents.deploy_title')}
          {phase === 'confirm' && (
            <Chip size="small" color="primary" label="静态托管" sx={{ ml: 1 }} />
          )}
        </Box>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        {/* 确认页 */}
        {phase === 'confirm' && (
          <>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="body2">
                <Typography component="span" variant="body2" color="text.secondary">
                  {t('contents.deploy_target')}:{' '}
                </Typography>
                {sshInfo ? `${sshInfo.username}@${sshInfo.host} → ${remotePath}` : remotePath}
              </Typography>
            </Box>

            <Alert severity="info" icon={<RocketIcon size={20} />}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>静态托管部署（路线B）</Typography>
              <Typography variant="caption" color="text.secondary">
                Nginx 直接提供静态文件服务，无需数据库/Redis/后端进程，安全且高性能
              </Typography>
              <Box
                sx={{
                  mt: 1,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 0.5,
                }}
              >
                <Chip size="small" variant="outlined" label="Nginx 静态服务" />
                <Chip size="small" variant="outlined" label="蓝绿部署" />
                <Chip size="small" variant="outlined" label="SSL/HTTPS" />
                <Chip size="small" variant="outlined" label="原子切换" />
              </Box>
            </Alert>

            <Alert severity="warning">{t('contents.deploy_warn', { path: remotePath })}</Alert>

            <DeployReadinessPanel
              readiness={readiness}
              checking={checking}
              onRefresh={runDeployCheck}
            />
          </>
        )}

        {/* 运行中：步骤列表 + 进度条 */}
        {phase === 'running' && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Chip size="small" color="primary" variant="outlined" label={stepLabel(progress.step)} />
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {progress.message}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {progress.percent}%
              </Typography>
            </Box>
            <LinearProgress variant="determinate" value={progress.percent} sx={{ height: 6, borderRadius: 3 }} />

            <Box sx={{ maxHeight: 280, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
              <List dense disablePadding>
                {DEPLOY_STEPS.map((s, i) => {
                  const currentIdx = DEPLOY_STEPS.findIndex((x) => x.key === progress.step);
                  let status: 'done' | 'active' | 'pending' = 'pending';
                  if (i < currentIdx) status = 'done';
                  else if (i === currentIdx) status = 'active';

                  return (
                    <ListItem key={s.key} sx={{ py: 0.25, px: 1.5 }}>
                      <ListItemIcon sx={{ minWidth: 28 }}>
                        {status === 'done' ? (
                          <CheckCircleIcon size={16} weight="fill" color="success.main" />
                        ) : status === 'active' ? (
                          <HourglassIcon size={16} weight="fill" color="primary.main" />
                        ) : (
                          <Box sx={{ width: 16, height: 16, borderRadius: '50%', border: 2, borderColor: 'divider' }} />
                        )}
                      </ListItemIcon>
                      <Typography
                        variant="body2"
                        color={
                          status === 'done'
                            ? 'text.secondary'
                            : status === 'active'
                              ? 'text.primary'
                              : 'text.disabled'
                        }
                        sx={{ fontWeight: status === 'active' ? 600 : 400 }}
                      >
                        {s.label}
                      </Typography>
                    </ListItem>
                  );
                })}
              </List>
            </Box>
          </>
        )}

        {/* 成功页 */}
        {phase === 'success' && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CheckCircleIcon size={22} weight="fill" color="success.main" />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                部署成功
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {/* 访问地址 */}
              <Box>
                <Typography variant="caption" color="text.secondary">访问地址</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Link component="button" variant="body2" onClick={() => openUrl(progress.message || '').catch(() => undefined)}>
                    点击访问站点
                  </Link>
                </Box>
              </Box>

              <Divider />

              {/* 统计 */}
              <Typography variant="caption" color="text.secondary">
                静态文件部署完成
              </Typography>
            </Box>

            <Alert severity="info" icon={<RocketIcon size={20} />} sx={{ mt: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                部署成功！站点已上线
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                查看部署历史、服务状态、回滚等操作
              </Typography>
              <Button
                size="small"
                variant="contained"
                startIcon={<RocketIcon size={14} />}
                onClick={() => openOpsCenter('deploy')}
              >
                打开部署管理
              </Button>
            </Alert>
          </>
        )}

        {/* 失败页 */}
        {phase === 'failed' && (
          <>
            <Alert severity="error" icon={<WarningCircleIcon size={20} weight="fill" />}>
              {t('contents.deploy_failed')}
            </Alert>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {failedMsg}
            </Typography>

            {/* 环境检测失败时的 AI 修复引导 */}
            {isEnvFailed && (
              <Alert severity="info" icon={<WrenchIcon size={20} />} sx={{ mt: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                  环境未满足要求？用 AI 智能修复一键搞定
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  运维中心的 AI 环境修复助手可以自动安装 Nginx 等依赖
                </Typography>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<WrenchIcon size={14} weight="bold" />}
                  onClick={() => openOpsCenter('env')}
                >
                  前往运维中心修复
                </Button>
              </Alert>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        {phase === 'confirm' && (
          <>
            <Button onClick={onClose}>{t('common:action.cancel')}</Button>
            <Button
              variant="contained"
              startIcon={<RocketIcon size={16} weight="bold" />}
              onClick={start}
              disabled={!!readiness && !readiness.ok}
            >
              开始部署
            </Button>
          </>
        )}
        {phase === 'running' && (
          <Button disabled startIcon={<RocketIcon size={16} weight="bold" />}>
            {t('contents.deploy_running')}
          </Button>
        )}
        {phase === 'success' && (
          <Button variant="contained" onClick={onClose}>
            {t('contents.deploy_close')}
          </Button>
        )}
        {phase === 'failed' && (
          <>
            <Button onClick={onClose}>{t('contents.deploy_close')}</Button>
            <Button variant="contained" startIcon={<RocketIcon size={16} weight="bold" />} onClick={start}>
              {t('contents.deploy_retry')}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

/// 部署前就绪检查面板：把「为什么不能部署」结构化呈现为可行动提示。
/// readiness.ok=false 时父级「开始部署」按钮会被禁用，避免模糊失败。
function DeployReadinessPanel({
  readiness,
  checking,
  onRefresh,
}: {
  readiness: DeployReadiness | null;
  checking: boolean;
  onRefresh: () => void;
}) {
  if (checking && !readiness) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <LinearProgress sx={{ flex: 1, height: 4, borderRadius: 2 }} />
        <Typography variant="caption" color="text.secondary">检查部署前置条件…</Typography>
      </Box>
    );
  }
  if (!readiness) return null;

  const colorOf = (level: string) =>
    level === 'error' ? 'error' : level === 'warning' ? 'warning' : 'info';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Chip
          size="small"
          color={readiness.ok ? 'success' : 'error'}
          label={readiness.ok ? '部署就绪' : '存在阻断项'}
        />
        {readiness.nginxAvailable !== null && (
          <Chip
            size="small"
            variant="outlined"
            color={readiness.nginxAvailable ? 'success' : 'error'}
            label={readiness.nginxAvailable ? 'Nginx 可用' : 'Nginx 未安装'}
          />
        )}
        <Box sx={{ flex: 1 }} />
        <Button size="small" color="inherit" disabled={checking} onClick={onRefresh}>
          重新检查
        </Button>
      </Box>

      {readiness.issues.length === 0 ? (
        <Alert severity="success">全部前置条件通过，可以部署。</Alert>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {readiness.issues.map((it, i) => (
            <Alert key={`${it.code}-${i}`} severity={colorOf(it.level)} sx={{ py: 0.25 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {it.message}
              </Typography>
              {it.hint && (
                <Typography variant="caption" color="text.secondary">
                  {it.hint}
                </Typography>
              )}
            </Alert>
          ))}
        </Box>
      )}
    </Box>
  );
}
