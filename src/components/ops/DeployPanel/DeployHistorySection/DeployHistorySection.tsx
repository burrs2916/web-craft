import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import { HistoryToolbar } from './HistoryToolbar';
import { ContinuityOverview } from './ContinuityOverview';
import { TriggerFilterChips } from './TriggerFilterChips';
import { HistoryTable } from './HistoryTable';
import type { DeployHistorySectionProps } from './types';

export function DeployHistorySection({
  deployments,
  total,
  loading,
  error,
  selectedIds,
  menuAnchor,
  setMenuAnchor,
  continuityOverview,
  triggerCounts,
  triggerFilter,
  onTriggerFilterChange,
  filteredDeployments,
  pagedDeployments,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  allSelected,
  someSelected,
  siteMap,
  onToggleSelect,
  onToggleSelectAll,
  onDeleteBatch,
  onCleanup,
  onDeleteFailed,
  onRefresh,
  onViewDetail,
  onRollback,
  onDeleteSingle,
}: DeployHistorySectionProps) {
  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <HistoryToolbar
        deploymentsCount={deployments.length}
        total={total}
        selectedCount={selectedIds.size}
        loading={loading}
        menuAnchor={menuAnchor}
        setMenuAnchor={setMenuAnchor}
        onDeleteBatch={onDeleteBatch}
        onCleanup={onCleanup}
        onDeleteFailed={onDeleteFailed}
        onRefresh={onRefresh}
      />

      {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}

      {/* 部署「工作连续性」概览（基于 backend 真实全量统计，覆盖所有历史）：成功率 / 自动化占比 / 连续成功 / 最近一次部署(含手动) / 最近一次自动部署 */}
      <ContinuityOverview overview={continuityOverview} />

      {/* 部署历史运维筛选：按触发方式分组，突出自动化部署（工作连续性） */}
      <TriggerFilterChips
        triggerFilter={triggerFilter}
        triggerCounts={triggerCounts}
        onTriggerFilterChange={onTriggerFilterChange}
      />

      <HistoryTable
        loading={loading}
        filteredDeployments={filteredDeployments}
        pagedDeployments={pagedDeployments}
        siteMap={siteMap}
        selectedIds={selectedIds}
        allSelected={allSelected}
        someSelected={someSelected}
        page={page}
        pageSize={pageSize}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        onToggleSelect={onToggleSelect}
        onToggleSelectAll={onToggleSelectAll}
        onViewDetail={onViewDetail}
        onRollback={onRollback}
        onDeleteSingle={onDeleteSingle}
      />
    </Box>
  );
}