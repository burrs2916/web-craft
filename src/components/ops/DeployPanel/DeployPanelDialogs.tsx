import { DeployDetailDialog } from './DeployDetailDialog';
import { ActionConfirmDialog } from './ActionConfirmDialog';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { DeployDialog } from './DeployDialog';
import type { useDeployPanel } from './useDeployPanel';

interface Props {
  panel: ReturnType<typeof useDeployPanel>;
}

export function DeployPanelDialogs({ panel }: Props) {
  const {
    detailOpen, detailLoading, detailDeployment, siteMap, setDetailOpen, handleRollbackDeployment,
    confirmOpen, confirmAction, actionLoading, actionError, setConfirmOpen, handleConfirmAction,
    deleteDialogOpen, deleteMode, selectedIds, deleteKeepCount, deleting, setDeleteDialogOpen,
    setDeleteKeepCount, handleDeleteConfirm,
    deployOpen, deployPhase, deploySiteId, deployProgress, deployError, deployResult,
    deployShowLog, setDeployShowLog, activeDeploySteps, deployDomains, deployConfigPreview,
    configEditing, configSaving, setConfigEditing, editRemotePath, setEditRemotePath,
    editEnableNginx, setEditEnableNginx, editDomain, setEditDomain, handleSaveDeployConfig,
    envCheckLoading, envReadiness, envCheckError, runEnvCheckInDialog, onGoToEnvCheck,
    handleStartDeploy, handleViewService, setDeployOpen,
  } = panel;

  return (
    <>
      {/* 部署详情弹窗 */}
      <DeployDetailDialog
        open={detailOpen}
        loading={detailLoading}
        deployment={detailDeployment}
        siteMap={siteMap}
        onClose={() => setDetailOpen(false)}
        onRollback={(deploymentId, siteId) => {
          setDetailOpen(false);
          handleRollbackDeployment(deploymentId, siteId);
        }}
      />

      {/* 操作确认弹窗 */}
      <ActionConfirmDialog
        open={confirmOpen}
        action={confirmAction}
        loading={actionLoading}
        error={actionError}
        onClose={() => !actionLoading && setConfirmOpen(false)}
        onConfirm={() => void handleConfirmAction()}
      />

      {/* 删除/清理确认弹窗 */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        mode={deleteMode}
        selectedCount={selectedIds.size}
        keepCount={deleteKeepCount}
        deleting={deleting}
        onClose={() => !deleting && setDeleteDialogOpen(false)}
        onKeepCountChange={setDeleteKeepCount}
        onConfirm={() => void handleDeleteConfirm()}
      />

      {/* 部署弹窗 */}
      <DeployDialog
        open={deployOpen}
        phase={deployPhase}
        siteId={deploySiteId}
        siteName={siteMap[deploySiteId]?.name || ''}
        progress={deployProgress}
        error={deployError}
        result={deployResult}
        showLog={deployShowLog}
        onToggleLog={() => setDeployShowLog((v) => !v)}
        steps={activeDeploySteps}
        domains={deployDomains}
        configPreview={deployConfigPreview}
        configEditing={configEditing}
        configSaving={configSaving}
        onConfigEditingChange={setConfigEditing}
        editRemotePath={editRemotePath}
        onEditRemotePathChange={setEditRemotePath}
        editEnableNginx={editEnableNginx}
        onEditEnableNginxChange={setEditEnableNginx}
        editDomain={editDomain}
        onEditDomainChange={setEditDomain}
        onSaveConfig={() => void handleSaveDeployConfig()}
        envCheckLoading={envCheckLoading}
        envReadiness={envReadiness}
        envCheckError={envCheckError}
        onRunEnvCheck={() => void runEnvCheckInDialog()}
        onGoToEnvCheck={onGoToEnvCheck}
        onStartDeploy={() => void handleStartDeploy()}
        onViewService={handleViewService}
        onClose={() => deployPhase !== 'running' && setDeployOpen(false)}
      />
    </>
  );
}