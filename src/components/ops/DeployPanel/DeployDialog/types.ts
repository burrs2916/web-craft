import type { DeployOutcome, DeployProgress, DeployStep, SiteDomain } from '../../../../proto/cms';
import type { DeployConfigPreview, DeployPhase, EnvReadiness } from '../shared';

export interface DeployDialogProps {
  open: boolean;
  phase: DeployPhase;
  siteId: string;
  siteName: string;
  progress: DeployProgress | null;
  error: string;
  result: DeployOutcome | null;
  showLog: boolean;
  onToggleLog: () => void;
  steps: { key: DeployStep; label: string }[];
  domains: SiteDomain[];
  configPreview: DeployConfigPreview | null;
  configEditing: boolean;
  configSaving: boolean;
  onConfigEditingChange: (editing: boolean) => void;
  editRemotePath: string;
  onEditRemotePathChange: (v: string) => void;
  editEnableNginx: boolean;
  onEditEnableNginxChange: (v: boolean) => void;
  editDomain: string;
  onEditDomainChange: (v: string) => void;
  onSaveConfig: () => void;
  envCheckLoading: boolean;
  envReadiness: EnvReadiness | null;
  envCheckError: string;
  onRunEnvCheck: () => void;
  onGoToEnvCheck?: () => void;
  onStartDeploy: () => void;
  onViewService: () => void;
  onClose: () => void;
}