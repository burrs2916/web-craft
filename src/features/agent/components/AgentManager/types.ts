import { ALL_AGENT_TOOLS } from './constants';

export interface AgentFormData {
  id: string;
  name: string;
  description: string;
  modelId: string | null;
  systemPrompt: string;
  temperature: number;
  maxIterations: number;
  toolIds: string[];
  triggerType: string;
  autoConfirm: boolean;
  permissionMode: string;
  alwaysAllowedTools: string[];
  fallbackModelId: string | null;
  workspaceDir: string;
  createdAt: number;
}

export function defaultFormData(): AgentFormData {
  return {
    id: '',
    name: '',
    description: '',
    modelId: null,
    systemPrompt: '',
    temperature: 0.7,
    maxIterations: 10,
    toolIds: [...ALL_AGENT_TOOLS],
    triggerType: 'manual',
    autoConfirm: false,
    permissionMode: 'confirm',
    alwaysAllowedTools: [],
    fallbackModelId: null,
    workspaceDir: '',
    createdAt: 0,
  };
}