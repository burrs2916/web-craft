import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Link,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
  CaretDownIcon,
  CaretUpIcon,
  CheckCircleIcon,
  CopyIcon,
  RocketIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';
import { deploySite, onDeployProgress } from '../../core/services/cms.service';
import { copyText } from '../../core/services/clipboard.service';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { DeployOutcome, DeployProgress, DeployStep, Site, SshConnectionInfo } from '../../proto';

/// M-x3 一键部署对话框：确认 → 进度（deploy-progress 事件流）→ 结果。
/// 三态单弹窗，运行中不可关闭（后端部署无取消通道）。
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
  const [phase, setPhase] = useState<'confirm' | 'running' | 'success' | 'failed'>('confirm');
  const [progress, setProgress] = useState<DeployProgress>({ step: 'validate', message: '', percent: 0 });
  const [outcome, setOutcome] = useState<DeployOutcome | null>(null);
  const [failedMsg, setFailedMsg] = useState('');
  const [showLog, setShowLog] = useState(false);
  const [copied, setCopied] = useState(false);

  const deployConfig = (() => {
    try {
      return JSON.parse(site.deploy_config_json || '{}');
    } catch {
      return {};
    }
  })();
  const remotePath: string = typeof deployConfig.remote_path === 'string' ? deployConfig.remote_path : '';
  const port: number = typeof deployConfig.server_port === 'number' ? deployConfig.server_port : 18080;

  useEffect(() => {
    if (open) {
      setPhase('confirm');
      setProgress({ step: 'validate', message: '', percent: 0 });
      setOutcome(null);
      setFailedMsg('');
      setShowLog(false);
      setCopied(false);
    }
  }, [open]);

  const start = useCallback(async () => {
    setPhase('running');
    setProgress({ step: 'validate', message: '', percent: 0 });
    const unsubscribe = await onDeployProgress(site.id, setProgress);
    try {
      const result = await deploySite(site.id);
      setOutcome(result);
      setPhase('success');
      onDeployed?.();
    } catch (e) {
      setFailedMsg(String(e));
      setPhase('failed');
    } finally {
      unsubscribe();
    }
  }, [site.id, onDeployed]);

  const copyToken = useCallback(async () => {
    if (!outcome) return;
    await copyText(outcome.token);
    setCopied(true);
  }, [outcome]);

  const fmtBytes = (n: number) => {
    if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${n} B`;
  };

  const stepLabel = (step: DeployStep) => t(`contents.deploy_step_${step}`);

  return (
    <Dialog open={open} onClose={phase === 'running' ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('contents.deploy_title')}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        {phase === 'confirm' && (
          <>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="body2">
                <Typography component="span" variant="body2" color="text.secondary">
                  {t('contents.deploy_target')}:{' '}
                </Typography>
                {sshInfo ? `${sshInfo.username}@${sshInfo.host} → ${remotePath}` : remotePath}
              </Typography>
              <Typography variant="body2">
                <Typography component="span" variant="body2" color="text.secondary">
                  {t('contents.deploy_port')}:{' '}
                </Typography>
                {port}
              </Typography>
            </Box>
            <Alert severity="warning">{t('contents.deploy_warn', { path: remotePath })}</Alert>
          </>
        )}

        {phase === 'running' && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip size="small" color="primary" variant="outlined" label={stepLabel(progress.step)} />
              <Typography variant="body2" color="text.secondary" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {progress.message}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {progress.percent}%
              </Typography>
            </Box>
            <LinearProgress variant="determinate" value={progress.percent} sx={{ height: 8, borderRadius: 4 }} />
          </>
        )}

        {phase === 'success' && outcome && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CheckCircleIcon size={22} weight="fill" color="success.main" />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {t('contents.deploy_success')}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Typography variant="body2">
                <Typography component="span" variant="body2" color="text.secondary">
                  {t('contents.deploy_result_url')}:{' '}
                </Typography>
                <Link component="button" variant="body2" onClick={() => openUrl(outcome.baseUrl).catch(() => undefined)}>
                  {outcome.baseUrl}
                </Link>
              </Typography>
              <Typography variant="body2">
                <Typography component="span" variant="body2" color="text.secondary">
                  {t('contents.deploy_result_healthz')}:{' '}
                </Typography>
                <Link component="button" variant="body2" onClick={() => openUrl(outcome.healthzUrl).catch(() => undefined)}>
                  {outcome.healthzUrl}
                </Link>
              </Typography>
              <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography component="span" variant="body2" color="text.secondary">
                  {t('contents.deploy_result_token')}:{' '}
                </Typography>
                <Typography component="code" variant="body2" sx={{ fontFamily: 'monospace' }} noWrap>
                  {outcome.token.slice(0, 12)}…
                </Typography>
                <IconButton size="small" onClick={copyToken} title={t('contents.deploy_copy_token')}>
                  <CopyIcon size={14} />
                </IconButton>
                {copied ? (
                  <Typography variant="caption" color="success.main">
                    {t('contents.deploy_copied')}
                  </Typography>
                ) : null}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t('contents.deploy_result_stats', {
                  count: outcome.uploadedCount,
                  size: fmtBytes(outcome.totalBytes),
                  sec: (outcome.durationMs / 1000).toFixed(1),
                })}
              </Typography>
            </Box>
            {outcome.log.length > 0 && (
              <>
                <Button
                  size="small"
                  color="inherit"
                  onClick={() => setShowLog((v) => !v)}
                  endIcon={showLog ? <CaretUpIcon size={14} /> : <CaretDownIcon size={14} />}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  {t('contents.deploy_show_log')}
                </Button>
                <Collapse in={showLog}>
                  <Box
                    sx={{
                      maxHeight: 180,
                      overflow: 'auto',
                      bgcolor: 'action.hover',
                      borderRadius: 1,
                      p: 1.5,
                    }}
                  >
                    {outcome.log.map((line, i) => (
                      <Typography key={i} variant="caption" sx={{ display: 'block', fontFamily: 'monospace' }}>
                        {line}
                      </Typography>
                    ))}
                  </Box>
                </Collapse>
              </>
            )}
          </>
        )}

        {phase === 'failed' && (
          <Alert severity="error" icon={<WarningCircleIcon size={20} weight="fill" />}>
            {t('contents.deploy_failed')}
            {failedMsg ? `: ${failedMsg}` : ''}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        {phase === 'confirm' && (
          <>
            <Button onClick={onClose}>{t('common:action.cancel')}</Button>
            <Button variant="contained" startIcon={<RocketIcon size={16} weight="bold" />} onClick={start}>
              {t('contents.deploy_start')}
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
