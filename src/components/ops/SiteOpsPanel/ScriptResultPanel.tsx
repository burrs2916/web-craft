import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { CheckSquareIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { RemoteExecResult } from '../../../proto/ops';

export function ResultPanel({
  result,
  visible,
  onToggle,
}: {
  result: RemoteExecResult;
  visible: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation('ops');
  return (
    <Box sx={{ mt: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
      <Box
        onClick={onToggle}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 1,
          bgcolor: 'action.hover',
          cursor: 'pointer',
        }}
      >
        {result.success
          ? <CheckSquareIcon size={18} color="#66BB6A" />
          : <AlertCircleIcon size={18} color="#EF5350" />}
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {result.success ? t('result.success') : t('result.failed')}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          · {t('result.exitCode')} {result.exitCode}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          · {t('result.elapsed')} {fmtDurationMs(result.durationMs)}
        </Typography>
        {result.channel && result.channel !== 'error' && result.channel !== 'safety' && (
          <Typography variant="caption" color="text.secondary">
            · {t('result.channel')}: {t(`channel.${result.channel}`, { defaultValue: result.channel })}
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        <Chip label={t('result.title')} size="small" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
      </Box>
      {visible ? (
        <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {result.stdout && (
            <OutBlock label={t('result.stdout')} text={result.stdout} muted={!result.success} />
          )}
          {result.stderr && !result.merged && (
            <OutBlock label={t('result.stderr')} text={result.stderr} isError />
          )}
          {result.stderr && result.merged && !result.stdout && (
            <OutBlock label={t('result.stderr')} text={result.stderr} isError />
          )}
          {!result.stdout && !result.stderr && (
            <Typography variant="body2" color="text.secondary">{t('result.empty')}</Typography>
          )}
          {result.truncated && (
            <Typography variant="caption" color="warning.main">{t('result.truncated')}</Typography>
          )}
        </Box>
      ) : null}
    </Box>
  );
}

function OutBlock({ label, text, isError, muted }: { label: string; text: string; isError?: boolean; muted?: boolean }) {
  const mono = `ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace`;
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Box
        component="pre"
        sx={{
          maxHeight: 260,
          overflow: 'auto',
          p: 1.25,
          borderRadius: 1,
          bgcolor: isError ? 'error.dark' : (muted ? 'background.default' : '#0F172A'),
          color: isError ? '#FFCDD2' : (muted ? 'text.secondary' : '#E2E8F0'),
          fontSize: 12,
          lineHeight: 1.5,
          fontFamily: mono,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          m: 0,
        }}
      >
        {text}
      </Box>
    </Box>
  );
}

function fmtDurationMs(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function AlertCircleIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="none">
      <circle cx="128" cy="128" r="96" stroke={color} strokeWidth="16" />
      <line x1="128" y1="80" x2="128" y2="140" stroke={color} strokeWidth="16" strokeLinecap="round" />
      <line x1="128" y1="172" x2="128" y2="176" stroke={color} strokeWidth="16" strokeLinecap="round" />
    </svg>
  );
}