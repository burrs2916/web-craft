import { Box, Button, Typography, Chip, Checkbox, Alert, CircularProgress } from '@mui/material';
import { MagnifyingGlassIcon, DownloadSimpleIcon, CheckCircleIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useTheme, alpha } from '@mui/material/styles';
import type { OllamaModelInfo } from '../../../../proto/agent';

/**
 * Ollama 模型扫描 / 导入面板。
 *
 * 纯展示组件：扫描与导入的状态、请求逻辑由 `EndpointDialog` 持有并注入，
 * 以保证切换 apiType 时已扫描结果不会丢失（与拆分前行为一致）。
 */
export function OllamaModelScanner({
  scanning,
  importing,
  scanError,
  importSuccess,
  models,
  selectedModels,
  canImport,
  onScan,
  onToggleModel,
  onToggleAll,
  onImport,
}: {
  scanning: boolean;
  importing: boolean;
  scanError: string;
  importSuccess: number;
  models: OllamaModelInfo[];
  selectedModels: Set<string>;
  canImport: boolean;
  onScan: () => void;
  onToggleModel: (refKey: string) => void;
  onToggleAll: () => void;
  onImport: () => void;
}) {
  const { t } = useTranslation('agent');
  const theme = useTheme();

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, p: 1.5, bgcolor: 'rgba(0,0,0,0.02)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          {t('ollama.scan_title')}
        </Typography>
        <Button
          size="small"
          variant="outlined"
          onClick={onScan}
          disabled={scanning || importing}
          startIcon={scanning ? <CircularProgress size={12} /> : <MagnifyingGlassIcon size={12} />}
          sx={{ fontSize: 10, borderRadius: 1 }}
        >
          {scanning ? t('ollama.scanning') : t('ollama.scan_button')}
        </Button>
      </Box>

      {scanError && (
        <Alert severity="error" sx={{ fontSize: 11, py: 0, mb: 1, '& .MuiAlert-message': { py: 0 } }}>
          {scanError}
        </Alert>
      )}

      {importSuccess > 0 && !models.length && (
        <Alert severity="success" sx={{ fontSize: 11, py: 0, mb: 1, '& .MuiAlert-message': { py: 0 } }}>
          成功导入 {importSuccess} 个模型
        </Alert>
      )}

      {models.length > 0 && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
              {t('ollama.found_models', { count: models.length })}
            </Typography>
          </Box>
          <Box sx={{ maxHeight: 220, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 0.75, mb: 1.5, pr: 0.5 }}>
            {models.map((model, index) => {
              const isSelected = selectedModels.has(model.refKey);
              const itemKey = model.refKey || model.name || `ollama-model-${index}`;
              return (
                <Box
                  key={itemKey}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    p: 1.25,
                    border: 1,
                    borderColor: isSelected ? 'primary.main' : 'divider',
                    borderRadius: 1.5,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    bgcolor: isSelected ? alpha(theme.palette.primary.main, 0.15) : 'background.paper',
                    '&:hover': {
                      borderColor: 'primary.main',
                      bgcolor: isSelected ? alpha(theme.palette.primary.main, 0.25) : 'action.hover',
                    },
                  }}
                  onClick={() => onToggleModel(model.refKey)}
                >
                  <Checkbox
                    size="small"
                    checked={isSelected}
                    disableRipple
                    sx={{ p: 0.25, pointerEvents: 'none' }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 13, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isSelected ? 'primary.main' : 'text.primary' }}>
                      {model.name}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.5 }}>
                      {model.parameterSize && (
                        <Chip
                          label={model.parameterSize}
                          size="small"
                          variant="filled"
                          sx={{
                            fontSize: 10,
                            height: 20,
                            borderRadius: 1,
                            bgcolor: isSelected ? alpha(theme.palette.primary.main, 0.3) : 'action.selected',
                            color: isSelected ? 'primary.main' : 'text.secondary',
                            '& .MuiChip-label': { px: 1, py: 0 },
                          }}
                        />
                      )}
                      {model.quantizationLevel && (
                        <Chip
                          label={model.quantizationLevel}
                          size="small"
                          variant="filled"
                          sx={{
                            fontSize: 10,
                            height: 20,
                            borderRadius: 1,
                            bgcolor: isSelected ? alpha(theme.palette.primary.main, 0.3) : 'action.selected',
                            color: isSelected ? 'primary.main' : 'text.secondary',
                            '& .MuiChip-label': { px: 1, py: 0 },
                          }}
                        />
                      )}
                      <Typography variant="caption" sx={{ fontSize: 11, color: isSelected ? 'primary.main' : 'text.secondary', opacity: isSelected ? 0.9 : 1 }}>
                        {(model.size / (1024 * 1024 * 1024)).toFixed(1)} GB
                      </Typography>
                    </Box>
                  </Box>
                  {isSelected && (
                    <CheckCircleIcon size={18} weight="fill" color={theme.palette.primary.main} />
                  )}
                </Box>
              );
            })}
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              size="small"
              variant="outlined"
              onClick={onToggleAll}
              sx={{ fontSize: 11, borderRadius: 1.5, flex: 1, py: 0.75 }}
            >
              {selectedModels.size === models.length ? t('ollama.deselect_all') : t('ollama.select_all')}
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={onImport}
              disabled={selectedModels.size === 0 || importing || !canImport}
              startIcon={importing ? <CircularProgress size={14} /> : <DownloadSimpleIcon size={14} />}
              sx={{ fontSize: 11, borderRadius: 1.5, flex: 1, py: 0.75 }}
            >
              {importing ? t('ollama.importing') : t('ollama.import_selected', { count: selectedModels.size })}
            </Button>
          </Box>
          {!canImport && (
            <Typography variant="caption" color="warning.main" sx={{ fontSize: 10, display: 'block', mt: 0.5 }}>
              {t('ollama.save_first')}
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}