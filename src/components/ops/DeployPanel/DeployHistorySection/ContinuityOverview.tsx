import Box from '@mui/material/Box';
import { CheckCircleIcon, ClockIcon, ArrowsClockwiseIcon } from '@phosphor-icons/react';
import { ContinuityStat } from '../primitives';
import { formatRelativeTime, type ContinuityOverview as ContinuityOverviewData } from '../shared';

interface Props {
  overview: ContinuityOverviewData;
}

export function ContinuityOverview({ overview }: Props) {
  if (overview.total === 0) return null;

  return (
    <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}>
      <ContinuityStat
        icon={
          <CheckCircleIcon
            size={18}
            weight="fill"
            color={overview.successRate >= 80 ? '#66BB6A' : overview.successRate >= 50 ? '#FFA726' : '#EF5350'}
          />
        }
        label="部署成功率"
        value={`${overview.successRate}%`}
        hint={`${overview.successCount} 成功 · ${overview.failedCount} 失败 · 共 ${overview.total} 次`}
      />
      <ContinuityStat
        icon={<ArrowsClockwiseIcon size={18} weight="fill" color="#42A5F5" />}
        label="自动化部署占比"
        value={`${overview.autoRatio}%`}
        hint={`${overview.scheduledCount} 次定时/启动自动部署`}
      />
      <ContinuityStat
        icon={<CheckCircleIcon size={18} weight="fill" color={overview.consecutiveSuccess > 0 ? '#66BB6A' : '#EF5350'} />}
        label="连续成功"
        value={`${overview.consecutiveSuccess} 次`}
        hint={overview.consecutiveSuccess > 0 ? '最近部署连续成功，链路健康' : '最近一次部署未成功'}
      />
      <ContinuityStat
        icon={<ClockIcon size={18} weight="fill" color="#26A69A" />}
        label="最近一次部署"
        value={formatRelativeTime(overview.lastDeployedAt)}
        hint={
          overview.lastDeployedAt
            ? new Date(overview.lastDeployedAt).toLocaleString()
            : '尚无部署记录'
        }
      />
      <ContinuityStat
        icon={<ClockIcon size={18} weight="fill" color="#AB47BC" />}
        label="最近一次自动部署"
        value={formatRelativeTime(overview.lastScheduledAt)}
        hint={
          overview.lastScheduledAt
            ? new Date(overview.lastScheduledAt).toLocaleString()
            : '尚未触发自动化部署'
        }
      />
    </Box>
  );
}