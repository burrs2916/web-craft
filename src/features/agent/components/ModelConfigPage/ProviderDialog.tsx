import { useState, useEffect } from 'react';
import {
  TextField, Button, Switch, FormControlLabel,
  Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, InputAdornment,
} from '@mui/material';
import { EyeIcon, EyeSlashIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { genId } from '../../store/agentStore';
import type { ProviderDto } from '../../../../proto/agent';

export function ProviderDialog({
  open,
  onClose,
  onSave,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (p: ProviderDto) => void;
  initial?: ProviderDto | null;
}) {
  const { t } = useTranslation('agent');
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (initial) {
      setName(initial.name);
      setApiKey(initial.apiKey);
      setEnabled(initial.enabled);
    } else {
      setName('');
      setApiKey('');
      setEnabled(true);
    }
  }, [initial, open]);

  const handleSave = () => {
    if (!name.trim()) return;
    const now = Date.now();
    onSave({
      id: initial?.id || genId('pv'),
      name: name.trim(),
      apiKey: apiKey.trim(),
      logo: '',
      enabled,
      createdAt: initial?.createdAt || now,
      updatedAt: now,
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{initial ? t('provider.edit') : t('provider.add')}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        <TextField label={t('provider.name')} value={name} onChange={(e) => setName(e.target.value)} fullWidth size="small" placeholder={t('provider.name_placeholder')} />
        <TextField label={t('provider.api_key')} value={apiKey} onChange={(e) => setApiKey(e.target.value)} fullWidth size="small" type={showApiKey ? 'text' : 'password'} placeholder="sk-..." slotProps={{ input: { endAdornment: (<InputAdornment position="end"><IconButton aria-label={t('provider.toggle_password_visibility')} onClick={() => setShowApiKey((v) => !v)} edge="end" size="small">{showApiKey ? <EyeSlashIcon size={18} /> : <EyeIcon size={18} />}</IconButton></InputAdornment>) } }} />
        <FormControlLabel control={<Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />} label={t('agent.enabled')} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('dialog.cancel')}</Button>
        <Button onClick={handleSave} variant="contained" disabled={!name.trim()}>{t('dialog.save')}</Button>
      </DialogActions>
    </Dialog>
  );
}