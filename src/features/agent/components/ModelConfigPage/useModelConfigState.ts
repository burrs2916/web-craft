import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@mui/material/styles';
import { useAgentStore, genId } from '../../store/agentStore';
import type { ProviderDto, EndpointDto, ModelDto } from '../../../../proto/agent';
import { localizeBackendError } from '../../../../core/backendError';
import { API_TYPE_KEYS } from './constants';

export interface ProviderDialogState {
  open: boolean;
  data: ProviderDto | null;
}

export interface EndpointDialogState {
  open: boolean;
  data: EndpointDto | null;
  providerId: string;
}

export interface ModelDialogState {
  open: boolean;
  data: ModelDto | null;
  endpointId: string;
}

export interface DeleteConfirmState {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}

export interface SnackbarState {
  open: boolean;
  message: string;
  severity: 'success' | 'error';
}

/**
 * 模型配置页的状态与交互逻辑：供应商/接入点/模型三级的展开、增删改、连通性测试，
 * 以及各对话框与提示条状态。
 *
 * 视图部分见 index.tsx 与 ProviderCard / EndpointCard / ModelRow，
 * 对话框见 ProviderDialog / EndpointDialog / ModelDialog / ConfirmDialog。
 */
export function useModelConfigState() {
  const { t } = useTranslation('agent');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const primaryColor = isDark ? '#60A5FA' : '#1D4ED8';
  const cardBorder = isDark ? 'rgba(45,212,191,0.12)' : 'rgba(0,0,0,0.08)';
  const cardBg = isDark ? 'rgba(20,31,46,0.6)' : 'rgba(255,255,255,0.8)';
  const innerCardBg = isDark ? 'rgba(7,11,18,0.5)' : 'rgba(245,245,245,0.6)';
  const hoverBg = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';
  const hoverBg2 = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)';
  const errorColor = isDark ? '#F87171' : '#DC2626';
  const successColor = isDark ? '#34D399' : '#16A34A';
  const disabledColor = isDark ? '#555' : '#9E9E9E';
  const {
    providers,
    endpoints,
    models,
    loadProviders,
    loadEndpoints,
    loadModels,
    saveProvider,
    deleteProvider,
    saveEndpoint,
    deleteEndpoint,
    saveModel,
    deleteModel,
    testEndpointConnection,
    testModelChat,
    agents,
    error,
  } = useAgentStore();

  const [providerDialog, setProviderDialog] = useState<ProviderDialogState>({ open: false, data: null });
  const [endpointDialog, setEndpointDialog] = useState<EndpointDialogState>({ open: false, data: null, providerId: '' });
  const [modelDialog, setModelDialog] = useState<ModelDialogState>({ open: false, data: null, endpointId: '' });
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>({ open: false, title: '', message: '', onConfirm: () => {} });
  const [snackbar, setSnackbar] = useState<SnackbarState>({ open: false, message: '', severity: 'success' });
  const [testResults, setTestResults] = useState<Map<string, { success: boolean; message: string }>>(new Map());
  const [testingId, setTestingId] = useState<string | null>(null);
  const [modelTestResults, setModelTestResults] = useState<Map<string, { success: boolean; message: string }>>(new Map());
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set(providers.map((p) => p.id)));
  const [expandedEndpoints, setExpandedEndpoints] = useState<Set<string>>(new Set());
  const [presetAnchor, setPresetAnchor] = useState<HTMLElement | null>(null);

  // Show store-level errors to user
  useEffect(() => {
    if (error) {
      setSnackbar({ open: true, message: error, severity: 'error' });
    }
  }, [error]);

  useEffect(() => {
    loadProviders();
    loadEndpoints();
    loadModels();
  }, [loadProviders, loadEndpoints, loadModels]);

  const closeDeleteConfirm = useCallback(() => {
    setDeleteConfirm({ open: false, title: '', message: '', onConfirm: () => {} });
  }, []);

  const toggleProvider = useCallback((id: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleEndpoint = useCallback((id: string) => {
    setExpandedEndpoints((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleTestConnection = useCallback(async (endpointId: string) => {
    setTestingId(endpointId);
    try {
      const result = await testEndpointConnection(endpointId);
      setTestResults((prev) => {
        const next = new Map(prev);
        next.set(endpointId, { success: true, message: result });
        return next;
      });
      setSnackbar({ open: true, message: result, severity: 'success' });
    } catch (e) {
      setTestResults((prev) => {
        const next = new Map(prev);
        next.set(endpointId, { success: false, message: localizeBackendError(e) });
        return next;
      });
      setSnackbar({ open: true, message: localizeBackendError(e), severity: 'error' });
    } finally {
      setTestingId(null);
    }
  }, [testEndpointConnection]);

  const handleTestModel = useCallback(async (modelId: string) => {
    setTestingModelId(modelId);
    try {
      const result = await testModelChat(modelId);
      setModelTestResults((prev) => {
        const next = new Map(prev);
        next.set(modelId, { success: true, message: result });
        return next;
      });
      setSnackbar({ open: true, message: result, severity: 'success' });
    } catch (e) {
      setModelTestResults((prev) => {
        const next = new Map(prev);
        next.set(modelId, { success: false, message: localizeBackendError(e) });
        return next;
      });
      setSnackbar({ open: true, message: localizeBackendError(e), severity: 'error' });
    } finally {
      setTestingModelId(null);
    }
  }, [testModelChat]);

  const handleAddPreset = useCallback((preset: { nameKey: string; logo: string }) => {
    const now = Date.now();
    const providerId = genId('pv');
    const provider: ProviderDto = {
      id: providerId,
      name: t(preset.nameKey),
      apiKey: '',
      logo: preset.logo,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    saveProvider(provider);

    // Ollama 预设：自动创建默认接入点，方便用户直接使用本地模型检测
    if (preset.nameKey === 'preset.ollama') {
      saveEndpoint({
        id: genId('ep'),
        providerId,
        name: 'Default',
        apiType: 'ollama',
        baseUrl: 'http://localhost:11434/v1/',
        authType: 'bearer',
        customAuthHeader: '',
        enabled: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    setExpandedProviders((prev) => new Set(prev).add(providerId));
    setPresetAnchor(null);
    setSnackbar({ open: true, message: `${t('config.provider_added')}: ${t(preset.nameKey)}`, severity: 'success' });
  }, [saveProvider, saveEndpoint, t]);

  const getEndpointsForProvider = useCallback((providerId: string) => {
    return endpoints.filter((e) => e.providerId === providerId);
  }, [endpoints]);

  const getModelsForEndpoint = useCallback((endpointId: string) => {
    return models.filter((m) => m.endpointId === endpointId);
  }, [models]);

  const getApiTypeLabel = (apiType: string) => {
    const key = API_TYPE_KEYS.find((o) => o.value === apiType)?.labelKey;
    return key ? t(key) : apiType;
  };

  return {
    // i18n / theme
    t,
    theme,
    isDark,
    primaryColor,
    cardBorder,
    cardBg,
    innerCardBg,
    hoverBg,
    hoverBg2,
    errorColor,
    successColor,
    disabledColor,
    // store data
    providers,
    endpoints,
    models,
    agents,
    saveProvider,
    deleteProvider,
    saveEndpoint,
    deleteEndpoint,
    saveModel,
    deleteModel,
    // dialog state
    providerDialog,
    setProviderDialog,
    endpointDialog,
    setEndpointDialog,
    modelDialog,
    setModelDialog,
    deleteConfirm,
    setDeleteConfirm,
    closeDeleteConfirm,
    snackbar,
    setSnackbar,
    // test state
    testResults,
    testingId,
    modelTestResults,
    testingModelId,
    // expansion state
    expandedProviders,
    expandedEndpoints,
    presetAnchor,
    setPresetAnchor,
    // handlers / derived helpers
    toggleProvider,
    toggleEndpoint,
    handleTestConnection,
    handleTestModel,
    handleAddPreset,
    getEndpointsForProvider,
    getModelsForEndpoint,
    getApiTypeLabel,
  };
}