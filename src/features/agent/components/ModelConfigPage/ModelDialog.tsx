import { useState, useEffect } from 'react';
import {
  Box, TextField, Button, Switch, FormControlLabel,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { genId } from '../../store/agentStore';
import type { ModelDto } from '../../../../proto/agent';

export function ModelDialog({
  open,
  onClose,
  onSave,
  initial,
  endpointId,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (m: ModelDto) => void;
  initial?: ModelDto | null;
  endpointId: string;
}) {
  const { t } = useTranslation('agent');
  const [name, setName] = useState('');
  const [refKey, setRefKey] = useState('');
  const [reasoning, setReasoning] = useState(false);
  const [contextWindow, setContextWindow] = useState(128000);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [inputTypes, setInputTypes] = useState<string[]>(['text']);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (initial) {
      setName(initial.name);
      setRefKey(initial.refKey);
      setReasoning(initial.reasoning);
      setContextWindow(initial.contextWindow);
      setMaxTokens(initial.maxTokens);
      setInputTypes(initial.inputTypes);
      setEnabled(initial.enabled);
    } else {
      setName('');
      setRefKey('');
      setReasoning(false);
      setContextWindow(128000);
      setMaxTokens(4096);
      setInputTypes(['text']);
      setEnabled(true);
    }
  }, [initial, open]);

  const handleSave = () => {
    if (!name.trim() || !refKey.trim()) return;
    const now = Date.now();
    onSave({
      id: initial?.id || genId('model'),
      name: name.trim(),
      refKey: refKey.trim(),
      endpointId,
      reasoning,
      inputTypes,
      contextWindow,
      maxTokens,
      enabled,
      createdAt: initial?.createdAt || now,
      updatedAt: now,
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{initial ? t('model.edit') : t('model.add')}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        <TextField label={t('model.name')} value={name} onChange={(e) => setName(e.target.value)} fullWidth size="small" placeholder={t('model.name_placeholder')} />
        <TextField label={t('model.ref_key')} value={refKey} onChange={(e) => setRefKey(e.target.value)} fullWidth size="small" placeholder={t('model.ref_key_placeholder')} helperText={t('model.ref_key_helper')} />
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField label={t('model.context_window')} value={contextWindow} onChange={(e) => setContextWindow(Number(e.target.value))} size="small" type="number" sx={{ flex: 1 }} />
          <TextField label={t('model.max_tokens')} value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} size="small" type="number" sx={{ flex: 1 }} />
        </Box>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <FormControlLabel control={<Switch checked={reasoning} onChange={(e) => setReasoning(e.target.checked)} />} label={t('model.reasoning_model')} />
          <FormControlLabel control={<Switch checked={inputTypes.includes('image')} onChange={(e) => {
            if (e.target.checked) {
              setInputTypes([...inputTypes, 'image']);
            } else {
              setInputTypes(inputTypes.filter((t) => t !== 'image'));
            }
          }} />} label={t('model.support_image')} />
        </Box>
        <FormControlLabel control={<Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />} label={t('agent.enabled')} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('dialog.cancel')}</Button>
        <Button onClick={handleSave} variant="contained" disabled={!name.trim() || !refKey.trim()}>{t('dialog.save')}</Button>
      </DialogActions>
    </Dialog>
  );
}