import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Chip from '@mui/material/Chip';
import { CopyIcon } from '@phosphor-icons/react';

import type { ScriptParam } from '../../../proto/ops';

export function InfoRow({
  label,
  value,
  mono,
  small,
  copyable,
  onCopy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  small?: boolean;
  copyable?: boolean;
  onCopy?: () => void;
}) {
  return (
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
      <Typography
        variant="body2"
        sx={{ color: 'text.secondary', width: 80, flexShrink: 0, fontSize: small ? 12 : 13, pt: 0.25 }}
      >
        {label}
      </Typography>
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography
          variant={small ? 'caption' : 'body2'}
          sx={{
            flex: 1,
            wordBreak: 'break-all',
            fontFamily: mono ? 'Menlo, Monaco, Consolas, monospace' : 'inherit',
            fontSize: small ? 11 : 13,
          }}
        >
          {value || '—'}
        </Typography>
        {copyable && value && (
          <Tooltip title="复制">
            <IconButton size="small" sx={{ p: 0.25 }} onClick={onCopy}>
              <CopyIcon size={13} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
}

export function ScriptParamField({
  param,
  value,
  onChange,
}: {
  param: ScriptParam;
  value: string;
  onChange: (v: string) => void;
}) {
  const label = `${param.label}${param.required ? ' *' : ''}`;
  const isMulti = param.kind === 'multiSelect';

  if (param.kind === 'text') {
    return <TextField size="small" label={label} value={value} onChange={(e) => onChange(e.target.value)} fullWidth />;
  }

  if (isMulti) {
    const items = value ? value.split(',') : [];
    const toggleItem = (opt: string) => {
      const next = items.includes(opt) ? items.filter((x) => x !== opt) : [...items, opt];
      onChange(next.join(','));
    };
    return (
      <Box>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.75 }}>
          {param.options?.map((opt) => {
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
      {param.options?.map((opt) => (
        <MenuItem key={opt} value={opt}>{opt}</MenuItem>
      ))}
    </TextField>
  );
}