import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import { RocketIcon } from '@phosphor-icons/react';
import type { DeployDialogProps } from './types';
import { DeployIdleSection } from './DeployIdleSection';
import { DeployRunningSection } from './DeployRunningSection';
import { DeploySuccessSection } from './DeploySuccessSection';
import { DeployFailedSection } from './DeployFailedSection';
import { DeployDialogActions } from './DeployDialogActions';

export function DeployDialog({
  open,
  phase,
  siteId,
  siteName,
  progress,
  error,
  result,
  showLog,
  onToggleLog,
  steps,
  domains,
  configPreview,
  configEditing,
  configSaving,
  onConfigEditingChange,
  editRemotePath,
  onEditRemotePathChange,
  editEnableNginx,
  onEditEnableNginxChange,
  editDomain,
  onEditDomainChange,
  onSaveConfig,
  envCheckLoading,
  envReadiness,
  envCheckError,
  onRunEnvCheck,
  onGoToEnvCheck,
  onStartDeploy,
  onViewService,
  onClose,
}: DeployDialogProps) {
  return (
    <Dialog open={open} onClose={() => phase !== 'running' && onClose()} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <RocketIcon size={20} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>部署服务</Typography>
          {phase === 'idle' && (
            <Chip
              size="small"
              color="primary"
              label="完整版"
              sx={{ ml: 1 }}
            />
          )}
        </Box>
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {/* 确认页 */}
        {phase === 'idle' && (
          <DeployIdleSection
            siteId={siteId}
            siteName={siteName}
            domains={domains}
            configPreview={configPreview}
            configEditing={configEditing}
            configSaving={configSaving}
            onConfigEditingChange={onConfigEditingChange}
            editRemotePath={editRemotePath}
            onEditRemotePathChange={onEditRemotePathChange}
            editEnableNginx={editEnableNginx}
            onEditEnableNginxChange={onEditEnableNginxChange}
            editDomain={editDomain}
            onEditDomainChange={onEditDomainChange}
            onSaveConfig={onSaveConfig}
            envCheckLoading={envCheckLoading}
            envReadiness={envReadiness}
            envCheckError={envCheckError}
            onRunEnvCheck={onRunEnvCheck}
            onGoToEnvCheck={onGoToEnvCheck}
            onClose={onClose}
          />
        )}

        {/* 运行中 */}
        {phase === 'running' && progress && (
          <DeployRunningSection progress={progress} steps={steps} />
        )}

        {/* 成功页 - 二进制部署 */}
        {phase === 'success' && result && (
          <DeploySuccessSection
            result={result}
            showLog={showLog}
            onToggleLog={onToggleLog}
            onViewService={onViewService}
          />
        )}

        {/* 失败页 */}
        {phase === 'failed' && (
          <DeployFailedSection error={error} />
        )}
      </DialogContent>
      <DeployDialogActions
        phase={phase}
        envReadiness={envReadiness}
        onClose={onClose}
        onStartDeploy={onStartDeploy}
      />
    </Dialog>
  );
}