import type { ServiceStatus, Site } from '../../../../proto/cms';

export interface ServiceStatusSectionProps {
  connectionSites: Site[];
  serviceStatusMap: Record<string, ServiceStatus>;
  statusLoadingMap: Record<string, boolean>;
  onRefreshOne: (siteId: string) => void;
  onDeploy: (site: Site) => void;
  onOpenSftp: (site: Site) => void;
  onServiceAction: (action: 'start' | 'restart' | 'stop', siteId: string) => void;
}