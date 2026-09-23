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
  LinearProgress,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
  CaretDownIcon,
  CaretUpIcon,
  CheckCircleIcon,
  HammerIcon,
  WarningCircleIcon,
  ArrowsClockwiseIcon,
} from '@phosphor-icons/react';
import { buildSite, buildSiteFull } from '../../core/services/cms.service';
import type { BuildReport } from '../../proto';

/// SSG 本地构建对话框：增量构建（默认）→ 结果报告；可切换全量重建。
/// 构建完成后广播 ssg-build-finished，预览侧可监听刷新。
export function BuildDialog({
  open,
  onClose,
  siteId,
  onBuilt,
}: {
  open: boolean;
  onClose: () => void;
  siteId: string;
  onBuilt?: () => void;
}) {
  const { t } = useTranslation('cms');
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<BuildReport | null>(null);
  const [failedMsg, setFailedMsg] = useState('');
  const [showWarnings, setShowWarnings] = useState(false);

  useEffect(() => {
    if (open) {
      setRunning(false);
      setReport(null);
      setFailedMsg('');
      setShowWarnings(false);
    }
  }, [open]);

  const run = useCallback(
    async (full: boolean) => {
      setRunning(true);
      setReport(null);
      setFailedMsg('');
      try {
        const r = full ? await buildSiteFull(siteId) : await buildSite(siteId);
        setReport(r);
        if (r.ok) onBuilt?.();
      } catch (e) {
        setFailedMsg(String(e));
      } finally {
        setRunning(false);
      }
    },
    [siteId, onBuilt],
  );

  const fmtDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <Dialog open={open} onClose={running ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('contents.build_title')}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        {running && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip size="small" color="primary" variant="outlined" label={t('contents.build_running')} />
              <Typography variant="body2" color="text.secondary">
                {t('contents.build_running_hint')}
              </Typography>
            </Box>
            <LinearProgress sx={{ height: 8, borderRadius: 4 }} />
          </>
        )}

        {!running && report?.ok && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CheckCircleIcon size={22} weight="fill" color="success.main" />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {t('contents.build_success')}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Typography variant="body2">
                {t('contents.build_pages')}: <Box component="span" sx={{ fontWeight: 700 }}>{report.pages}</Box>
              </Typography>
              <Typography variant="body2">
                {t('contents.build_assets')}: <Box component="span" sx={{ fontWeight: 700 }}>{report.assets}</Box>
              </Typography>
              {report.skipped > 0 && (
                <Typography variant="body2" color="text.secondary">
                  {t('contents.build_skipped')}: <Box component="span" sx={{ fontWeight: 700 }}>{report.skipped}</Box>
                </Typography>
              )}
              <Typography variant="body2">
                {t('contents.build_duration')}: <Box component="span" sx={{ fontWeight: 700 }}>{fmtDuration(report.durationMs)}</Box>
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
              {report.distDir}
            </Typography>
            {report.warnings.length > 0 && (
              <>
                <Button
                  size="small"
                  color="inherit"
                  onClick={() => setShowWarnings((v) => !v)}
                  endIcon={showWarnings ? <CaretUpIcon size={14} /> : <CaretDownIcon size={14} />}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  {t('contents.build_warnings', { count: report.warnings.length })}
                </Button>
                <Collapse in={showWarnings}>
                  <Box
                    sx={{
                      maxHeight: 180,
                      overflow: 'auto',
                      bgcolor: 'action.hover',
                      borderRadius: 1,
                      p: 1.5,
                    }}
                  >
                    {report.warnings.map((w, i) => (
                      <Typography key={i} variant="caption" sx={{ display: 'block', fontFamily: 'monospace' }}>
                        {w}
                      </Typography>
                    ))}
                  </Box>
                </Collapse>
              </>
            )}
          </>
        )}

        {!running && report && !report.ok && (
          <Alert severity="error" icon={<WarningCircleIcon size={20} weight="fill" />}>
            {t('contents.build_failed')}
            {report.error ? `: ${report.error}` : ''}
          </Alert>
        )}

        {!running && failedMsg && (
          <Alert severity="error" icon={<WarningCircleIcon size={20} weight="fill" />}>
            {t('contents.build_failed')}: {failedMsg}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={running}>
          {t('common:action.cancel')}
        </Button>
        <Button
          variant="outlined"
          startIcon={<ArrowsClockwiseIcon size={16} weight="bold" />}
          onClick={() => run(true)}
          disabled={running}
        >
          {t('contents.build_full')}
        </Button>
        <Button
          variant="contained"
          startIcon={<HammerIcon size={16} weight="bold" />}
          onClick={() => run(false)}
          disabled={running}
        >
          {running ? t('contents.build_running') : t('contents.build_start')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
