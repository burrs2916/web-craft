import { useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputAdornment from '@mui/material/InputAdornment';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { PlusIcon, TrashIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { OpsDanger, OpsScript, ParamKind } from '../../proto/ops';
import { opsSaveScript } from '../../core/services/ops.service';

const CATEGORY_OPTIONS = ['web', 'cert', 'system', 'db', 'backup', 'deploy', 'general'] as const;

const DANGER_OPTIONS: { value: OpsDanger; color: string }[] = [
  { value: 'safe', color: '#66BB6A' },
  { value: 'careful', color: '#FFA726' },
  { value: 'dangerous', color: '#EF5350' },
];

const ICON_OPTIONS = [
  'arrow-circular-clockwise',
  'file-text',
  'check-square',
  'shield-check',
  'clock',
  'hard-drive',
  'cpu',
  'plug',
  'database',
  'archive',
  'pulse',
];

const KIND_OPTIONS: ParamKind[] = ['text', 'select', 'multiSelect'];

interface ParamDraft {
  fakeId: string;
  name: string;
  label: string;
  kind: ParamKind;
  options: string;
  defaultValue: string;
  required: boolean;
}

function emptyOf(script: OpsScript | null): OpsScript {
  return {
    id: script?.id ?? '',
    name: script?.name ?? '',
    description: script?.description ?? '',
    category: script?.category && script.category !== 'all' ? script.category : 'general',
    icon: script?.icon ?? '',
    script: script?.script ?? '',
    parameters: script?.parameters ?? [],
    dangerLevel: script?.dangerLevel ?? 'safe',
    timeoutSecs: script?.timeoutSecs ?? 60,
    confirmRequired: script?.confirmRequired ?? false,
    isBuiltin: script?.isBuiltin ?? false,
    enabled: script?.enabled ?? true,
    createdAt: script?.createdAt ?? 0,
    updatedAt: script?.updatedAt ?? 0,
  };
}

export function ScriptEditorDialog({
  open,
  script,
  onClose,
  onSaved,
}: {
  open: boolean;
  script: OpsScript | null;
  onClose: () => void;
  onSaved: (script: OpsScript) => void;
}) {
  const { t } = useTranslation('ops');
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [draft, setDraft] = useState<OpsScript>(() => emptyOf(script));
  const [params, setParams] = useState<ParamDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (open) {
      const s = emptyOf(script);
      setDraft(s);
      setParams(
        s.parameters.map((p) => ({
          fakeId: String(Math.random()),
          name: p.name,
          label: p.label,
          kind: p.kind,
          options: (p.options ?? []).join(','),
          defaultValue: p.defaultValue ?? '',
          required: p.required,
        })),
      );
      setError('');
      setNotice('');
    }
  }, [open, script]);

  const isBuiltin = script?.isBuiltin ?? false;

  const errors = useMemo<Record<string, string>>(() => {
    const e: Record<string, string> = {};
    if (!draft.name.trim()) e.name = t('editor.requireName');
    if (!draft.script.trim()) e.script = t('editor.requireScript');
    const names = params.map((p) => p.name.trim()).filter(Boolean);
    const seen = new Set<string>();
    for (const n of names) {
      if (seen.has(n)) { e.paramDup = t('editor.dupParamName'); break; }
      seen.add(n);
    }
    return e;
  }, [draft.name, draft.script, params, t]);

  const canSave = Object.keys(errors).length === 0 && !isBuiltin;

  const handleSave = async () => {
    if (isBuiltin) return;
    setSaving(true);
    setError('');
    setNotice('');
    const trimmed = params
      .filter((p) => p.name.trim())
      .map((p) => ({
        name: p.name.trim(),
        label: p.label.trim() || p.name.trim(),
        kind: p.kind,
        defaultValue:
          p.kind === 'select' || p.kind === 'multiSelect'
            ? (p.defaultValue.trim() || p.options.split(',').map((x) => x.trim()).filter(Boolean)[0] || '')
            : p.defaultValue.trim(),
        options: p.kind === 'select' || p.kind === 'multiSelect'
          ? p.options.split(',').map((x) => x.trim()).filter(Boolean)
          : [],
        required: p.required,
      }));
    try {
      const saved = await opsSaveScript({ ...draft, parameters: trimmed });
      setNotice(t('editor.saved'));
      onSaved(saved);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const set = (patch: Partial<OpsScript>) => setDraft((d) => ({ ...d, ...patch }));

  const addParam = () =>
    setParams((ps) => [
      ...ps,
      { fakeId: String(Math.random()), name: '', label: '', kind: 'text', options: '', defaultValue: '', required: false },
    ]);

  const removeParam = (id: string) => setParams((ps) => ps.filter((p) => p.fakeId !== id));

  const updateParam = (id: string, patch: Partial<ParamDraft>) =>
    setParams((ps) => ps.map((p) => (p.fakeId === id ? { ...p, ...patch } : p)));

  const insertPlaceholder = (p: ParamDraft) => {
    const ph = `{{${p.name.trim()}}}`;
    if (p.name.trim() && !draft.script.includes(ph)) {
      set({ script: draft.script + (draft.script.endsWith('\n') || !draft.script ? '' : '\n') + ph });
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="md" fullScreen={fullScreen}>
      <DialogTitle sx={{ pb: 0.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {isBuiltin
            ? t('editor.viewTitle')
            : script?.id
              ? t('editor.editTitle')
              : t('editor.newTitle')}
        </Typography>
        {isBuiltin && (
          <Alert severity="info" sx={{ mt: 1 }}>{t('editor.builtinReadonly')}</Alert>
        )}
      </DialogTitle>

      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          <TextField
            size="small"
            label={t('editor.name')}
            value={draft.name}
            disabled={isBuiltin}
            error={Boolean(errors.name)}
            helperText={errors.name}
            onChange={(e) => set({ name: e.target.value })}
          />
          <TextField
            size="small"
            label={t('editor.category')}
            select
            disabled={isBuiltin}
            value={draft.category}
            onChange={(e) => set({ category: e.target.value })}
          >
            {CATEGORY_OPTIONS.map((c) => (
              <MenuItem key={c} value={c}>{t(`category.${c}`)}</MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label={t('editor.description')}
            value={draft.description}
            disabled={isBuiltin}
            onChange={(e) => set({ description: e.target.value })}
            sx={{ gridColumn: { xs: 'span 1', sm: 'span 2' } }}
          />
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr 1fr' }, gap: 2, alignItems: 'center' }}>
          <TextField
            size="small"
            label={t('editor.icon')}
            select
            disabled={isBuiltin}
            value={draft.icon ?? ''}
            onChange={(e) => set({ icon: e.target.value || null })}
          >
            <MenuItem value=""><em>—</em></MenuItem>
            {ICON_OPTIONS.map((i) => (
              <MenuItem key={i} value={i}>{i}</MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label={t('editor.danger')}
            select
            disabled={isBuiltin}
            value={draft.dangerLevel}
            onChange={(e) => {
              const lvl = e.target.value as OpsDanger;
              set({
                dangerLevel: lvl,
                confirmRequired: lvl === 'dangerous' ? true : draft.confirmRequired,
              });
            }}
          >
            {DANGER_OPTIONS.map((d) => (
              <MenuItem key={d.value} value={d.value}>{t(`danger.${d.value}`)}</MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            type="number"
            label={t('editor.timeoutSecs')}
            value={draft.timeoutSecs}
            disabled={isBuiltin}
            slotProps={{
              htmlInput: { min: 1, max: 600 },
              input: { endAdornment: <InputAdornment position="end">s</InputAdornment> },
            }}
            onChange={(e) => set({ timeoutSecs: Math.max(1, Math.min(600, Number(e.target.value) || 60)) })}
          />
          <FormControlLabel
            control={
              <Switch
                checked={draft.confirmRequired}
                disabled={isBuiltin}
                onChange={(e) => set({ confirmRequired: e.target.checked })}
              />
            }
            label={t('editor.confirmRequired')}
            sx={{ justifyContent: 'flex-end' }}
          />
        </Box>

        <TextField
          label={t('editor.script')}
          multiline
          minRows={7}
          maxRows={14}
          disabled={isBuiltin}
          error={Boolean(errors.script)}
          helperText={errors.script || t('editor.scriptHint')}
          value={draft.script}
          onChange={(e) => set({ script: e.target.value })}
          sx={{
            '& textarea': {
              fontFamily: `ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace`,
              fontSize: 12.5,
              lineHeight: 1.55,
            },
          }}
        />

        {!isBuiltin && (
          <>
            <Divider />
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{t('editor.parameters')}</Typography>
              <Button size="small" startIcon={<PlusIcon size={16} />} onClick={addParam}>
                {t('editor.addParam')}
              </Button>
            </Box>

            {params.length === 0 && (
              <Typography variant="body2" color="text.secondary">{t('editor.noParams')}</Typography>
            )}

            {params.map((p, idx) => (
              <Box key={p.fakeId} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr 1fr' }, gap: 1.5 }}>
                  <TextField
                    size="small"
                    label={t('editor.param.name')}
                    value={p.name}
                    onChange={(e) => updateParam(p.fakeId, { name: e.target.value })}
                  />
                  <TextField
                    size="small"
                    label={t('editor.param.label')}
                    value={p.label}
                    onChange={(e) => updateParam(p.fakeId, { label: e.target.value })}
                  />
                  <TextField
                    size="small"
                    select
                    label={t('editor.param.kind')}
                    value={p.kind}
                    onChange={(e) => updateParam(p.fakeId, { kind: e.target.value as ParamKind })}
                  >
                    {KIND_OPTIONS.map((k) => (
                      <MenuItem key={k} value={k}>{t(`paramKind.${k}`)}</MenuItem>
                    ))}
                  </TextField>
                  {p.name.trim() ? (
                    <Button
                      size="small"
                      variant="outlined"
                      color="info"
                      onClick={() => insertPlaceholder(p)}
                      sx={{ alignSelf: 'stretch' }}
                    >
                      {'{{' + p.name.trim() + '}}'}
                    </Button>
                  ) : (
                    <Box />
                  )}
                </Box>

                {(p.kind === 'select' || p.kind === 'multiSelect') && (
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                    <TextField
                      size="small"
                      label={t('editor.param.options')}
                      value={p.options}
                      placeholder="opt1,opt2,opt3"
                      onChange={(e) => updateParam(p.fakeId, { options: e.target.value })}
                      helperText={t('editor.param.optionsHint')}
                    />
                    <TextField
                      size="small"
                      label={t('editor.param.default')}
                      value={p.defaultValue}
                      onChange={(e) => updateParam(p.fakeId, { defaultValue: e.target.value })}
                    />
                  </Box>
                )}

                {p.kind === 'text' && (
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                    <TextField
                      size="small"
                      label={t('editor.param.default')}
                      value={p.defaultValue}
                      onChange={(e) => updateParam(p.fakeId, { defaultValue: e.target.value })}
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          checked={p.required}
                          onChange={(e) => updateParam(p.fakeId, { required: e.target.checked })}
                        />
                      }
                      label={t('editor.param.required')}
                    />
                  </Box>
                )}

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {errors.paramDup && idx === 0 && (
                    <Typography variant="caption" color="error">{errors.paramDup}</Typography>
                  )}
                  <Box sx={{ flex: 1 }} />
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={p.required}
                        onChange={(e) => updateParam(p.fakeId, { required: e.target.checked })}
                      />
                    }
                    label={t('editor.param.required')}
                  />
                  <IconButton size="small" onClick={() => removeParam(p.fakeId)}>
                    <TrashIcon size={18} />
                  </IconButton>
                </Box>
              </Box>
            ))}
          </>
        )}

        {error && <Alert severity="error">{error}</Alert>}
        {notice && <Alert severity="success">{notice}</Alert>}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button disabled={saving} onClick={onClose}>{t('close', { ns: 'common' })}</Button>
        <Box sx={{ flex: 1 }} />
        {!isBuiltin && (
          <Button variant="contained" color="primary" disabled={!canSave || saving} onClick={handleSave}>
            {saving ? t('editor.saving') : t('editor.save')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}