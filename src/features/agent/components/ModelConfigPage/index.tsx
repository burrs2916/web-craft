import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import { CloudIcon, PlusIcon } from '@phosphor-icons/react';
import { PROVIDER_PRESET_KEYS } from './constants';
import { ProviderDot } from './ProviderDot';
import { ProviderCard } from './ProviderCard';
import { ProviderDialog } from './ProviderDialog';
import { EndpointDialog } from './EndpointDialog';
import { ModelDialog } from './ModelDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { useModelConfigState } from './useModelConfigState';

/**
 * 模型配置页：供应商 → 接入点 → 模型 三级配置的入口。
 *
 * 拆分说明：常量见 `constants.ts`，颜色圆点见 `ProviderDot.tsx`，
 * 三级卡片见 `ProviderCard.tsx` / `EndpointCard.tsx` / `ModelRow.tsx`，
 * 对话框见 `ProviderDialog.tsx` / `EndpointDialog.tsx` / `ModelDialog.tsx` / `ConfirmDialog.tsx`，
 * Ollama 扫描面板见 `OllamaModelScanner.tsx`，
 * 状态与交互逻辑见 `useModelConfigState.ts`。
 */
export function ModelConfigPage() {
  const vm = useModelConfigState();
  const {
    t, isDark, primaryColor, providers,
    presetAnchor, setPresetAnchor, handleAddPreset,
    providerDialog, setProviderDialog,
    endpointDialog, setEndpointDialog,
    modelDialog, setModelDialog,
    deleteConfirm, closeDeleteConfirm,
    snackbar, setSnackbar,
    saveProvider, saveEndpoint, saveModel,
  } = vm;

  return (
    <Box sx={{ p: 2, height: '100%', width: '100%', overflow: 'auto', minWidth: 0, minHeight: 0 }}>
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: 14 }}>
            {t('config.model_config')}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t('config.model_config_desc')}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<CloudIcon size={14} />}
            onClick={(e) => setPresetAnchor(e.currentTarget)}
            sx={{ borderRadius: 2, fontSize: 11 }}
          >
            {t('config.quick_add')}
          </Button>
          <Button
            size="small"
            variant="contained"
            startIcon={<PlusIcon size={14} weight="bold" />}
            onClick={() => setProviderDialog({ open: true, data: null })}
            sx={{ borderRadius: 2, fontSize: 11, background: `linear-gradient(135deg, ${primaryColor} 0%, ${isDark ? '#93C5FD' : '#3B82F6'} 100%)` }}
          >
            {t('provider.add')}
          </Button>
        </Box>
      </Box>

      <Menu
        open={Boolean(presetAnchor)}
        anchorEl={presetAnchor}
        onClose={() => setPresetAnchor(null)}
      >
        {PROVIDER_PRESET_KEYS.map((preset) => (
          <MenuItem key={preset.nameKey} onClick={() => handleAddPreset(preset)}>
            <ProviderDot name={t(preset.nameKey)} size={10} />
            <Box sx={{ ml: 1.5 }} />
            {t(preset.nameKey)}
          </MenuItem>
        ))}
      </Menu>

      {providers.length === 0 ? (
        <Card sx={{ border: 1, borderColor: 'divider', borderRadius: 2, textAlign: 'center', py: 6, bgcolor: 'rgba(22,27,34,0.6)' }}>
          <CloudIcon size={48} color="#555" style={{ marginBottom: 8 }} />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t('config.no_provider')}
          </Typography>
          <Typography variant="caption" color="text.disabled" sx={{ mb: 2, display: 'block' }}>
            {t('config.no_provider_desc')}
          </Typography>
          <Button variant="outlined" size="small" startIcon={<PlusIcon size={14} weight="bold" />} onClick={() => setProviderDialog({ open: true, data: null })} sx={{ borderRadius: 2 }}>
            {t('provider.add')}
          </Button>
        </Card>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {providers.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} vm={vm} />
          ))}
        </Box>
      )}

      <ProviderDialog
        open={providerDialog.open}
        onClose={() => setProviderDialog({ open: false, data: null })}
        onSave={saveProvider}
        initial={providerDialog.data}
      />

      <EndpointDialog
        open={endpointDialog.open}
        onClose={() => setEndpointDialog({ open: false, data: null, providerId: '' })}
        onSave={saveEndpoint}
        initial={endpointDialog.data}
        providerId={endpointDialog.providerId}
      />

      <ModelDialog
        open={modelDialog.open}
        onClose={() => setModelDialog({ open: false, data: null, endpointId: '' })}
        onSave={saveModel}
        initial={modelDialog.data}
        endpointId={modelDialog.endpointId}
      />

      <ConfirmDialog
        open={deleteConfirm.open}
        title={deleteConfirm.title}
        message={deleteConfirm.message}
        onConfirm={deleteConfirm.onConfirm}
        onCancel={closeDeleteConfirm}
        cancelLabel={t('dialog.cancel')}
        confirmLabel={t('dialog.confirm_delete')}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })} variant="filled" sx={{ fontSize: 12 }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}