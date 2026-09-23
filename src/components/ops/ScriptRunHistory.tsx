import { useCallback, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import { CheckCircleIcon, XCircleIcon, ArrowClockwiseIcon, CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { OpsScriptRun } from '../../proto/ops';
import { opsScriptRuns } from '../../core/services/ops.service';

/**
 * 脚本执行历史（审计留痕）：读取 ops_script_runs 表，倒序展示每次运行的
 * 状态、目标、耗时与可展开的渲染命令 + 结构化输出。
 */
export function ScriptRunHistory() {
  const { t } = useTranslation('ops');
  const [runs, setRuns] = useState<OpsScriptRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRuns(await opsScriptRuns(undefined, 100));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
        {error && <Alert severity="error" sx={{ flex: 1 }}>{error}</Alert>}
        <Tooltip title={t('history.refresh')}>
          <IconButton size="small" onClick={() => void load()} disabled={loading}>
            <ArrowClockwiseIcon size={18} />
          </IconButton>
        </Tooltip>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={28} />
        </Box>
      ) : runs.length === 0 ? (
        <Card variant="outlined">
          <CardContent sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
            <XCircleIcon size={36} weight="light" />
            <Typography variant="body2" sx={{ mt: 1 }}>{t('history.empty')}</Typography>
          </CardContent>
        </Card>
      ) : (
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {runs.map((run) => {
            const ok = run.status === 'success';
            const open = expanded === run.id;
            return (
              <Card key={run.id} variant="outlined" sx={{ flexShrink: 0 }}>
                <Box
                  sx={{ p: 1.25, display: 'flex', alignItems: 'center', gap: 1.25, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                  onClick={() => setExpanded(open ? null : run.id)}
                >
                  {ok ? <CheckCircleIcon size={20} color="#34D399" /> : <XCircleIcon size={20} color="#F87171" />}
                  <Chip
                    label={ok ? t('history.success') : t('history.failed')}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: 11,
                      fontWeight: 700,
                      bgcolor: ok ? 'rgba(52,211,153,0.14)' : 'rgba(248,113,113,0.14)',
                      color: ok ? '#34D399' : '#F87171',
                    }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 600, fontSize: 13 }}>
                      {run.scriptName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {new Date(run.startedAt).toLocaleString()}
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {run.connectionName || '—'}
                  </Typography>
                  <Chip
                    label={`${t('result.exitCode')} ${run.exitCode}`}
                    size="small"
                    variant="outlined"
                    sx={{ height: 18, fontSize: 10 }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {fmtDurationMs(run.durationMs)}
                  </Typography>
                  {open ? <CaretDownIcon size={15} /> : <CaretRightIcon size={15} />}
                </Box>
                {open && (
                  <>
                    <Divider sx={{ my: 0 }} />
                    <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      {run.commandRendered && (
                        <Block label={t('history.command')} text={run.commandRendered} />
                      )}
                      {run.paramsJson && run.paramsJson !== '{}' && (
                        <Block label={t('history.params')} text={prettyParams(run.paramsJson)} />
                      )}
                      {run.stdout
                        ? <Block label={t('result.stdout')} text={run.stdout} muted={!ok} />
                        : null}
                      {run.stderr && !run.merged
                        ? <Block label={t('result.stderr')} text={run.stderr} isError />
                        : null}
                      {run.stderr && run.merged && !run.stdout
                        ? <Block label={t('result.stderr')} text={run.stderr} isError />
                        : null}
                      {!run.stdout && !run.stderr && (
                        <Typography variant="caption" color="text.secondary">{t('history.noOutput')}</Typography>
                      )}
                      {run.truncated && (
                        <Typography variant="caption" color="warning.main">{t('result.truncated')}</Typography>
                      )}
                    </Box>
                  </>
                )}
              </Card>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

function Block({ label, text, isError, muted }: { label: string; text: string; isError?: boolean; muted?: boolean }) {
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
          bgcolor: isError ? 'error.dark' : muted ? 'background.default' : '#0F172A',
          color: isError ? '#FFCDD2' : muted ? 'text.secondary' : '#E2E8F0',
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

function prettyParams(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

function fmtDurationMs(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}