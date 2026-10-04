import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import { ServiceStatusSection } from './ServiceStatusSection';
import { DeployHistorySection } from './DeployHistorySection';
import { DeployPanelDialogs } from './DeployPanelDialogs';
import { useDeployPanel } from './useDeployPanel';
import type { DeployPanelProps } from './types';

export type { DeployPanelProps } from './types';

export function DeployPanel(props: DeployPanelProps) {
  const panel = useDeployPanel(props);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minHeight: 0 }}>
      {/* 服务状态卡片区域 */}
      <ServiceStatusSection
        connectionSites={panel.connectionSites}
        serviceStatusMap={panel.serviceStatusMap}
        statusLoadingMap={panel.statusLoadingMap}
        onRefreshOne={panel.loadServiceStatus}
        onDeploy={panel.handleOpenDeployDialog}
        onOpenSftp={(site) => void panel.handleOpenSftp(site)}
        onServiceAction={panel.handleServiceAction}
      />

      <Divider />

      {/* 部署历史列表 */}
      <DeployHistorySection
        deployments={panel.deployments}
        total={panel.total}
        loading={panel.loading}
        error={panel.error}
        selectedIds={panel.selectedIds}
        menuAnchor={panel.menuAnchor}
        setMenuAnchor={panel.setMenuAnchor}
        continuityOverview={panel.continuityOverview}
        triggerCounts={panel.triggerCounts}
        triggerFilter={panel.triggerFilter}
        onTriggerFilterChange={(t) => { panel.setTriggerFilter(t); panel.setPage(0); }}
        filteredDeployments={panel.filteredDeployments}
        pagedDeployments={panel.pagedDeployments}
        page={panel.page}
        pageSize={panel.pageSize}
        onPageChange={panel.setPage}
        onPageSizeChange={(size) => { panel.setPageSize(size); panel.setPage(0); }}
        allSelected={panel.allSelected}
        someSelected={panel.someSelected}
        siteMap={panel.siteMap}
        onToggleSelect={panel.toggleSelect}
        onToggleSelectAll={panel.toggleSelectAll}
        onDeleteBatch={panel.handleDeleteBatch}
        onCleanup={panel.handleCleanup}
        onDeleteFailed={panel.handleDeleteFailed}
        onRefresh={panel.loadDeployments}
        onViewDetail={(d) => void panel.handleViewDetail(d)}
        onRollback={panel.handleRollbackDeployment}
        onDeleteSingle={panel.handleDeleteSingle}
      />

      <DeployPanelDialogs panel={panel} />
    </Box>
  );
}