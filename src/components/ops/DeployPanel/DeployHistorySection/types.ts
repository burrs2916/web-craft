import type { Deployment, Site } from '../../../../proto/cms';
import type { ContinuityOverview, TriggerCounts, TriggerFilter } from '../shared';

export interface DeployHistorySectionProps {
  deployments: Deployment[];
  total: number;
  loading: boolean;
  error: string;
  selectedIds: Set<string>;
  menuAnchor: HTMLElement | null;
  setMenuAnchor: (el: HTMLElement | null) => void;
  continuityOverview: ContinuityOverview;
  triggerCounts: TriggerCounts;
  triggerFilter: TriggerFilter;
  onTriggerFilterChange: (t: TriggerFilter) => void;
  filteredDeployments: Deployment[];
  pagedDeployments: Deployment[];
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  allSelected: boolean;
  someSelected: boolean;
  siteMap: Record<string, Site>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onDeleteBatch: () => void;
  onCleanup: () => void;
  onDeleteFailed: () => void;
  onRefresh: () => void;
  onViewDetail: (d: Deployment) => void;
  onRollback: (deploymentId: string, siteId: string) => void;
  onDeleteSingle: (id: string) => void;
}