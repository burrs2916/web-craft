import type { ReactNode } from 'react';
import type { SxProps } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import LinearProgress from '@mui/material/LinearProgress';
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  PlayIcon,
} from '@phosphor-icons/react';
import type { DeploymentStep } from '../../../proto/cms';
import { STATUS_COLOR, STATUS_LABEL } from './shared';

// 部署「工作连续性」概览卡片：让运维一眼看到 成功率 / 自动化部署占比 / 最近一次自动部署
export function ContinuityStat({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint: string }) {
  return (
    <Box
      sx={{
        flex: '1 1 0',
        minWidth: 180,
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        p: 1.25,
        borderRadius: 1.5,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          flexShrink: 0,
          borderRadius: '50%',
          bgcolor: 'action.hover',
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 11, fontWeight: 500 }}>
          {label}
        </Typography>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.1, color: 'text.primary' }}>
          {value}
        </Typography>
        <Tooltip title={hint}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', fontSize: 10.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'default' }}
          >
            {hint}
          </Typography>
        </Tooltip>
      </Box>
    </Box>
  );
}

export function InfoItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography
        variant="body2"
        sx={{
          fontWeight: 500,
          fontSize: 12,
          fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' : undefined,
        }}
        noWrap
      >
        {value}
      </Typography>
    </Box>
  );
}

export function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Box
      sx={{
        flex: 1,
        textAlign: 'center',
        py: 0.75,
        px: 1,
        borderRadius: 0.75,
        bgcolor: `${color}15`,
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 700, fontSize: 14, color }}>
        {value}
      </Typography>
      <Typography variant="caption" sx={{ fontSize: 10, color: 'text.secondary' }}>
        {label}
      </Typography>
    </Box>
  );
}

export function ConfigGroup({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
        p: 1.25,
        borderRadius: 1.25,
        bgcolor: 'action.hover',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'primary.main' }}>
        {icon}
        <Typography variant="caption" sx={{ fontWeight: 700, fontSize: 11, color: 'text.primary' }}>
          {title}
        </Typography>
      </Box>
      {children}
    </Box>
  );
}

export function ConfigRow({
  label,
  value,
  mono,
  sx,
}: {
  label: string;
  value: string;
  mono?: boolean;
  sx?: SxProps;
}) {
  return (
    <Box sx={{ minWidth: 0, ...sx }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, display: 'block', mb: 0.25 }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          fontWeight: 500,
          fontSize: 12,
          fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' : undefined,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          color: value === '未设置' ? 'text.disabled' : 'text.primary',
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

export function StatusMini({ label, value, color, mono }: { label: string; value: string; color?: string; mono?: boolean }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, display: 'block', mb: 0.25 }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          fontWeight: 600,
          fontSize: 12,
          color: color || 'text.primary',
          fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' : undefined,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={value}
      >
        {value}
      </Typography>
    </Box>
  );
}

export function StepRow({ step }: { step: DeploymentStep }) {
  const statusColor = STATUS_COLOR[step.status] || '#94A3B8';
  const StatusIcon = step.status === 'success' ? CheckCircleIcon
    : step.status === 'failed' ? XCircleIcon
    : step.status === 'running' ? PlayIcon
    : ClockIcon;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        p: 1,
        borderRadius: 1,
        bgcolor: 'action.hover',
      }}
    >
      <StatusIcon size={16} color={statusColor} weight="fill" />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 500, fontSize: 12 }}>
            {step.name || step.key}
          </Typography>
          <Chip
            label={STATUS_LABEL[step.status] || step.status}
            size="small"
            sx={{
              height: 16,
              fontSize: 10,
              fontWeight: 600,
              bgcolor: `${statusColor}22`,
              color: statusColor,
            }}
          />
        </Box>
        {step.message && (
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }} noWrap>
            {step.message}
          </Typography>
        )}
        {step.status === 'running' && (
          <LinearProgress
            variant="determinate"
            value={step.percent}
            sx={{ mt: 0.5, height: 3, borderRadius: 1.5 }}
          />
        )}
      </Box>
      {step.percent > 0 && step.status !== 'running' && (
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
          {step.percent}%
        </Typography>
      )}
    </Box>
  );
}