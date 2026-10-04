import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@mui/material/styles';
import { useAgentStore } from '../../store/agentStore';
import { listConversations } from '../../../../core/services/agent.service';
import type { AgentDto } from '../../../../proto/agent';
import { defaultFormData, type AgentFormData } from './types';

export interface SnackbarState {
  open: boolean;
  message: string;
  severity: 'success' | 'error';
}

export interface DeleteConfirmState {
  id: string;
  name: string;
  convCount: number;
}

/**
 * AgentManager 的全部状态与副作用：数据加载、编辑器增删改、删除确认、
 * 搜索过滤与展示用派生数据。组件层只负责渲染。
 */
export function useAgentManager() {
  const {
    agents, models, endpoints, loadAgents, loadModels, loadEndpoints, saveAgent, deleteAgent,
  } = useAgentStore();
  const pendingAgentEditorId = useAgentStore((s) => s.pendingAgentEditorId);
  const clearPendingAgentEditor = useAgentStore((s) => s.clearPendingAgentEditor);
  const { t } = useTranslation('agent');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const [editing, setEditing] = useState<AgentFormData | null>(null);
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);
  const [snackbar, setSnackbar] = useState<SnackbarState>({
    open: false,
    message: '',
    severity: 'success',
  });
  const [nameTouched, setNameTouched] = useState(false);
  const [modelTouched, setModelTouched] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAgents();
    loadModels();
    loadEndpoints();
  }, [loadAgents, loadModels, loadEndpoints]);

  const handleNew = useCallback(() => {
    setEditing({
      ...defaultFormData(),
      id: crypto.randomUUID(),
    });
    setNameTouched(false);
    setModelTouched(false);
  }, []);

  const handleEdit = useCallback((agent: AgentDto) => {
    setEditing({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      modelId: agent.modelId,
      systemPrompt: agent.systemPrompt,
      temperature: agent.temperature,
      maxIterations: agent.maxIterations,
      toolIds: [...agent.toolIds],
      triggerType: agent.triggerType || 'manual',
      autoConfirm: agent.autoConfirm || false,
      permissionMode: agent.permissionMode || 'confirm',
      alwaysAllowedTools: agent.alwaysAllowedTools || [],
      fallbackModelId: agent.fallbackModelId,
      workspaceDir: agent.workspaceDir || '',
      createdAt: agent.createdAt || 0,
    });
  }, []);

  // 从「终端助手」绑定 Tab 跳转过来时，自动打开该智能体编辑器
  useEffect(() => {
    if (!pendingAgentEditorId) return;
    const agent = agents.find((a) => a.id === pendingAgentEditorId);
    if (!agent) return;
    handleEdit(agent);
    clearPendingAgentEditor();
  }, [pendingAgentEditorId, agents, handleEdit, clearPendingAgentEditor]);

  // dialog 打开后自动聚焦名称输入框（自造 OutlinedField 的 input，聚焦即可输入）
  useEffect(() => {
    if (!editing) return;
    const id = window.setTimeout(() => nameInputRef.current?.focus(), 80);
    return () => window.clearTimeout(id);
  }, [editing?.id]);

  const handleSave = useCallback(async () => {
    if (!editing || !editing.name.trim()) {
      setSnackbar({ open: true, message: t('agent.name_required'), severity: 'error' });
      return;
    }
    if (!editing.modelId) {
      setSnackbar({ open: true, message: t('agent.model_required'), severity: 'error' });
      return;
    }

    try {
      await saveAgent({
        id: editing.id,
        name: editing.name,
        description: editing.description,
        modelId: editing.modelId,
        systemPrompt: editing.systemPrompt,
        temperature: editing.temperature,
        maxIterations: editing.maxIterations,
        toolIds: editing.toolIds,
        triggerType: editing.triggerType,
        autoConfirm: editing.autoConfirm,
        permissionMode: editing.permissionMode,
        alwaysAllowedTools: editing.alwaysAllowedTools,
        fallbackModelId: editing.fallbackModelId,
        workspaceDir: editing.workspaceDir,
        createdAt: editing.createdAt || Date.now(),
        updatedAt: Date.now(),
      });
      setSnackbar({ open: true, message: t('agent.save_success'), severity: 'success' });
      setEditing(null);
    } catch (error) {
      setSnackbar({ open: true, message: t('agent.save_error'), severity: 'error' });
    }
  }, [editing, saveAgent, t]);

  const handleCancel = useCallback(() => {
    setEditing(null);
    setNameTouched(false);
    setModelTouched(false);
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteAgent(id);
      setDeleteConfirm(null);
      if (editing?.id === id) {
        setEditing(null);
      }
      setSnackbar({ open: true, message: t('agent.delete_success'), severity: 'success' });
    },
    [deleteAgent, editing, t],
  );

  /** 打开删除确认框前先统计该智能体关联的会话数，用于提示连带删除。 */
  const requestDelete = useCallback((agent: AgentDto) => {
    listConversations(agent.id).then((convs) => {
      setDeleteConfirm({ id: agent.id, name: agent.name, convCount: convs.length });
    }).catch(() => {
      setDeleteConfirm({ id: agent.id, name: agent.name, convCount: 0 });
    });
  }, []);

  const getToolLabel = useCallback(
    (toolId: string) => {
      const key = `agent.tool_${toolId}`;
      const translated = t(key, { defaultValue: toolId });
      return translated === key ? toolId : translated;
    },
    [t],
  );

  const getTriggerTypeLabel = useCallback(
    (value: string) => {
      const key = `agent.trigger_type_${value}`;
      const translated = t(key, { defaultValue: value });
      return translated === key ? value : translated;
    },
    [t],
  );

  const enabledModels = useMemo(() => models.filter((m) => m.enabled), [models]);

  const triggerTypes = useMemo(
    () => [
      { value: 'manual', label: getTriggerTypeLabel('manual') },
      { value: 'auto_failure', label: getTriggerTypeLabel('auto_failure') },
      { value: 'auto_save', label: getTriggerTypeLabel('auto_save') },
      { value: 'auto_both', label: getTriggerTypeLabel('auto_both') },
    ],
    [getTriggerTypeLabel],
  );

  const filteredAgents = useMemo(
    () =>
      agents.filter((a) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return (
          a.name.toLowerCase().includes(q) ||
          (a.description || '').toLowerCase().includes(q)
        );
      }),
    [agents, search],
  );

  return {
    // store data
    agents,
    models,
    endpoints,
    // editor state
    editing,
    setEditing,
    nameTouched,
    setNameTouched,
    modelTouched,
    setModelTouched,
    nameInputRef,
    // list / search
    search,
    setSearch,
    filteredAgents,
    // dialogs
    deleteConfirm,
    setDeleteConfirm,
    snackbar,
    setSnackbar,
    // derived
    enabledModels,
    triggerTypes,
    getToolLabel,
    isDark,
    t,
    // actions
    handleNew,
    handleEdit,
    handleSave,
    handleCancel,
    handleDelete,
    requestDelete,
  };
}