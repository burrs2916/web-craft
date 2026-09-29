import { useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { TerminalWindowIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { OpsScript, RemoteExecResult, ScriptParam } from '../../../proto/ops';
import { DANGER_COLOR, dangerLabel } from './constants';
import { ResultPanel } from './ScriptResultPanel';

export function ScriptRunDialog({
  open,
  script,
  loading,
  result,
  host,
  onClose,
  onRun,
}: {
  open: boolean;
  script: OpsScript | null;
  loading: boolean;
  result: RemoteExecResult | null;
  host: string;
  onClose: () => void;
  onRun: (params: Record<string, string>) => void;
}) {
  const { t } = useTranslation('ops');
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [values, setValues] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [resultHidden, setResultHidden] = useState(false);

  useEffect(() => {
    if (script) {
      const init: Record<string, string> = {};
      for (const p of script.parameters) {
        init[p.name] = p.defaultValue ?? p.options[0] ?? '';
      }
      setValues(init);
      setConfirmed(script.dangerLevel === 'safe');
      setResultHidden(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script]);

  const validated = useMemo(() => {
    if (!script) return true;
    return script.parameters.every((p) => {
      if (!p.required) return true;
      const v = (values[p.name] ?? '').trim();
      if (p.kind === 'multiSelect') return v.length > 0;
      return v.length > 0;
    });
  }, [script, values]);

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {script && (
            <Chip
              label={t(`danger.${script.dangerLevel}`)}
              size="small"
              sx={{
                height: 20,
                fontSize: 10,
                fontWeight: 700,
                bgcolor: `${DANGER_COLOR[script.dangerLevel]}22`,
                color: DANGER_COLOR[script.dangerLevel],
              }}
            />
          )}
          <Typography variant="h6" sx={{ fontWeight: 700 }}>{script?.name}</Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">
          {t('selectConnection')}: {host || '—'}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        {!confirmed && script ? (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {t('confirmMessage', { level: dangerLabel(script.dangerLevel), host: host || '—' })}
          </Alert>
        ) : null}

        {script && script.parameters.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="overline" color="text.secondary" sx={{ mb: -1 }}>
              {t('params')}
            </Typography>
            {script.parameters.map((p) => (
              <ParamField key={p.name} param={p} value={values[p.name] ?? ''} onChange={(v) => setValues((s) => ({ ...s, [p.name]: v }))} />
            ))}
          </Box>
        )}

        {result && (
          <ResultPanel result={result} visible={resultHidden} onToggle={() => setResultHidden((v) => !v)} />
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button disabled={loading} onClick={onClose}>{t('close', { ns: 'common' })}</Button>
        {!confirmed ? (
          <Button variant="contained" color="warning" disabled={!validated} onClick={() => setConfirmed(true)}>
            {t('confirmTitle')}
          </Button>
        ) : (
          <Button
            variant="contained"
            color="success"
            disabled={!validated || loading}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <TerminalWindowIcon size={16} />}
            onClick={() => onRun(values)}
          >
            {loading ? t('running') : t('run')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

function ParamField({
  param,
  value,
  onChange,
}: {
  param: ScriptParam;
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation('ops');
  const label = `${param.label}${param.required ? ` ${t('required')}` : ''}`;
  const isMulti = param.kind === 'multiSelect';
  const items = isMulti ? (value ? value.split(',') : []) : [];
  const toggleItem = (opt: string) => {
    const next = items.includes(opt) ? items.filter((x) => x !== opt) : [...items, opt];
    onChange(next.join(','));
  };

  if (param.kind === 'text') {
    return <TextField size="small" label={label} value={value} onChange={(e) => onChange(e.target.value)} fullWidth />;
  }

  if (isMulti) {
    return (
      <Box>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.75 }}>
          {param.options.map((opt) => {
            const on = items.includes(opt);
            return (
              <Chip
                key={opt}
                label={opt}
                onClick={() => toggleItem(opt)}
                color={on ? 'primary' : 'default'}
                variant={on ? 'filled' : 'outlined'}
                size="small"
              />
            );
          })}
        </Box>
      </Box>
    );
  }

  return (
    <TextField
      select
      size="small"
      label={label}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      fullWidth
    >
      {param.options.map((opt) => (
        <MenuItem key={opt} value={opt}>{opt}</MenuItem>
      ))}
    </TextField>
  );
}