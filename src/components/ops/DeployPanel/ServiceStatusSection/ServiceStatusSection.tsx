import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import { HardDriveIcon, ArrowsClockwiseIcon } from '@phosphor-icons/react';
import { ServiceStatusCard } from './ServiceStatusCard';
import type { ServiceStatusSectionProps } from './types';

export function ServiceStatusSection({
  connectionSites,
  serviceStatusMap,
  statusLoadingMap,
  onRefreshOne,
  onDeploy,
  onOpenSftp,
  onServiceAction,
}: ServiceStatusSectionProps) {
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
          <HardDriveIcon size={16} style={{ verticalAlign: -3, marginRight: 6 }} />
          服务运行状态
          <Chip
            size="small"
            label={connectionSites.length}
            sx={{ ml: 1, height: 18, fontSize: 10, fontWeight: 600, bgcolor: 'action.hover' }}
          />
        </Typography>
        <Button
          size="small"
          variant="text"
          startIcon={<ArrowsClockwiseIcon size={14} />}
          onClick={() => connectionSites.forEach((s) => onRefreshOne(s.id))}
        >
          全部刷新
        </Button>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 1.5 }}>
        {connectionSites.map((site) => (
          <ServiceStatusCard
            key={site.id}
            site={site}
            status={serviceStatusMap[site.id]}
            loading={!!statusLoadingMap[site.id]}
            onRefreshOne={onRefreshOne}
            onDeploy={onDeploy}
            onOpenSftp={onOpenSftp}
            onServiceAction={onServiceAction}
          />
        ))}
        {connectionSites.length === 0 && (
          <Box
            sx={{
              gridColumn: '1 / -1',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              py: 6,
              color: 'text.secondary',
            }}
          >
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                bgcolor: 'action.hover',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 2,
              }}
            >
              <HardDriveIcon size={28} weight="light" />
            </Box>
            <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary' }}>
              当前服务器未绑定任何站点
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, textAlign: 'center', maxWidth: 360 }}>
              请先在站点设置中绑定服务器，然后即可在此进行部署和运维操作
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}