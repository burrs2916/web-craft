import { useState, useEffect } from 'react';
import {
  TextField, Button, Switch, FormControlLabel,
  Dialog, DialogTitle, DialogContent, DialogActions,
  MenuItem, Select, FormControl, InputLabel,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useAgentStore, genId } from '../../store/agentStore';
import type { EndpointDto, OllamaModelInfo } from '../../../../proto/agent';
import { localizeBackendError } from '../../../../core/backendError';
import { API_TYPE_KEYS, AUTH_TYPE_KEYS } from './constants';
import { OllamaModelScanner } from './OllamaModelScanner';

export function EndpointDialog({
  open,
  onClose,
  onSave,
  initial,
  providerId,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (e: EndpointDto) => void;
  initial?: EndpointDto | null;
  providerId: string;
}) {
  const { t } = useTranslation('agent');
  const { scanOllamaModels, saveModel, loadModels } = useAgentStore();
  const [name, setName] = useState('');
  const [apiType, setApiType] = useState('openai-completions');
  const [baseUrl, setBaseUrl] = useState('');
  const [authType, setAuthType] = useState('bearer');
  const [customAuthHeader, setCustomAuthHeader] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<OllamaModelInfo[]>([]);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [scanError, setScanError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(0);

  useEffect(() => {
    if (initial) {
      setName(initial.name);
      setApiType(initial.apiType);
      setBaseUrl(initial.baseUrl);
      setAuthType(initial.authType);
      setCustomAuthHeader(initial.customAuthHeader);
      setEnabled(initial.enabled);
    } else {
      setName('');
      setApiType('openai-completions');
      setBaseUrl('');
      setAuthType('bearer');
      setCustomAuthHeader('');
      setEnabled(true);
    }
    setOllamaModels([]);
    setSelectedModels(new Set());
    setScanError('');
    setImportSuccess(0);
  }, [initial, open]);

  useEffect(() => {
    if (!initial && open) {
      if (apiType === 'ollama') {
        setBaseUrl('http://localhost:11434/v1/');
        setAuthType('bearer');
      } else if (apiType === 'anthropic-messages') {
        setAuthType('x-api-key');
      } else {
        setAuthType('bearer');
      }
    }
  }, [apiType, initial, open]);

  const handleScanOllama = async () => {
    setScanning(true);
    setScanError('');
    setOllamaModels([]);
    setSelectedModels(new Set());
    try {
      // Ollama API 直接用根地址（不带 /v1）调用 /api/tags
      const apiBase = baseUrl.trim().replace(/\/v1\/?$/, '') || 'http://localhost:11434';
      const models = await scanOllamaModels(apiBase);
      setOllamaModels(models);
      if (models.length > 0) {
        setSelectedModels(new Set(models.map((m) => m.refKey)));
      }
    } catch (e) {
      setScanError(localizeBackendError(e));
    } finally {
      setScanning(false);
    }
  };

  const toggleModelSelection = (refKey: string) => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(refKey)) next.delete(refKey);
      else next.add(refKey);
      return next;
    });
  };

  const handleImportModels = async () => {
    if (!initial?.id || selectedModels.size === 0) return;
    setImporting(true);
    setScanError('');
    setImportSuccess(0);
    let successCount = 0;
    let failCount = 0;
    try {
      for (const model of ollamaModels) {
        if (!selectedModels.has(model.refKey)) continue;
        try {
          await saveModel({
            id: genId('model'),
            endpointId: initial.id,
            name: model.name,
            refKey: model.refKey,
            reasoning: false,
            inputTypes: ['text'],
            contextWindow: 8192,
            maxTokens: 4096,
            enabled: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          successCount++;
        } catch (err) {
          failCount++;
          console.error('Failed to import model:', model.name, err);
        }
      }
      await loadModels();
      setImportSuccess(successCount);
      if (successCount > 0) {
        setOllamaModels([]);
        setSelectedModels(new Set());
      }
      if (failCount > 0) {
        setScanError(`成功导入 ${successCount} 个，失败 ${failCount} 个`);
      }
    } catch (e) {
      setScanError(localizeBackendError(e));
    } finally {
      setImporting(false);
    }
  };

  const handleSave = () => {
    if (!name.trim()) return;
    const now = Date.now();
    onSave({
      id: initial?.id || genId('ep'),
      providerId,
      name: name.trim(),
      apiType,
      baseUrl: baseUrl.trim(),
      authType,
      customAuthHeader: customAuthHeader.trim(),
      enabled,
      createdAt: initial?.createdAt || now,
      updatedAt: now,
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{initial ? t('endpoint.edit') : t('endpoint.add')}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        <TextField label={t('endpoint.name')} value={name} onChange={(e) => setName(e.target.value)} fullWidth size="small" placeholder={t('endpoint.name_placeholder')} />
        <FormControl size="small" fullWidth>
          <InputLabel>{t('api.type_label')}</InputLabel>
          <Select value={apiType} label={t('api.type_label')} onChange={(e) => setApiType(e.target.value)}>
            {API_TYPE_KEYS.map((o) => (
              <MenuItem key={o.value} value={o.value}>{t(o.labelKey)}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField label={t('provider.base_url')} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} fullWidth size="small" placeholder="https://api.openai.com/v1/" />
        <FormControl size="small" fullWidth>
          <InputLabel>{t('api.auth_type')}</InputLabel>
          <Select value={authType} label={t('api.auth_type')} onChange={(e) => setAuthType(e.target.value)}>
            {AUTH_TYPE_KEYS.map((o) => (
              <MenuItem key={o.value} value={o.value}>{t(o.labelKey)}</MenuItem>
            ))}
          </Select>
        </FormControl>
        {authType === 'custom' && (
          <TextField label={t('api.custom_auth_header')} value={customAuthHeader} onChange={(e) => setCustomAuthHeader(e.target.value)} fullWidth size="small" placeholder="X-Custom-Auth" />
        )}

        {apiType === 'ollama' && (
          <OllamaModelScanner
            scanning={scanning}
            importing={importing}
            scanError={scanError}
            importSuccess={importSuccess}
            models={ollamaModels}
            selectedModels={selectedModels}
            canImport={!!initial?.id}
            onScan={handleScanOllama}
            onToggleModel={toggleModelSelection}
            onToggleAll={() => setSelectedModels(selectedModels.size === ollamaModels.length ? new Set() : new Set(ollamaModels.map((m) => m.refKey)))}
            onImport={handleImportModels}
          />
        )}

        <FormControlLabel control={<Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />} label={t('agent.enabled')} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('dialog.cancel')}</Button>
        <Button onClick={handleSave} variant="contained" disabled={!name.trim()}>{t('dialog.save')}</Button>
      </DialogActions>
    </Dialog>
  );
}