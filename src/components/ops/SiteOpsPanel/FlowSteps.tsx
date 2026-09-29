import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { MonitorIcon, RocketIcon, ListChecksIcon } from '@phosphor-icons/react';
import type { OpsTab } from './constants';

const FLOW_STEPS: { key: string; label: string; tab: OpsTab; icon: typeof MonitorIcon }[] = [
  { key: 'env', label: '环境检测', tab: 'env', icon: MonitorIcon },
  { key: 'deploy', label: '部署服务', tab: 'deploy', icon: RocketIcon },
  { key: 'scripts', label: '运维脚本', tab: 'scripts', icon: ListChecksIcon },
];

/** 流程步骤指示器：环境检测 → 部署服务 → 运维脚本。 */
export function FlowSteps({ tab, onSelect }: { tab: OpsTab; onSelect: (tab: OpsTab) => void }) {
  return (
    <Box
      sx={{
        px: 2.5,
        pt: 1.5,
        pb: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'action.hover',
      }}
    >
      {FLOW_STEPS.map((step, i) => {
        const isActive = tab === step.tab;
        const isDone = FLOW_STEPS.slice(0, i).some((s) => s.tab === tab)
          || (tab === 'deploy' && step.tab === 'env');
        return (
          <Box key={step.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box
              onClick={() => onSelect(step.tab)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                cursor: 'pointer',
                px: 1,
                py: 0.25,
                borderRadius: 0.5,
                '&:hover': { bgcolor: 'action.selected' },
              }}
            >
              <Box
                sx={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: isDone
                    ? '#66BB6A'
                    : isActive
                      ? 'primary.main'
                      : 'divider',
                  color: 'white',
                  fontSize: 11,
                  fontWeight: 700,
                  transition: 'all 0.2s',
                }}
              >
                {isDone ? <step.icon size={12} weight="fill" /> : i + 1}
              </Box>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: isActive ? 700 : isDone ? 600 : 400,
                  fontSize: 11,
                  color: isActive ? 'text.primary' : isDone ? 'success.main' : 'text.secondary',
                }}
              >
                {step.label}
              </Typography>
            </Box>
            {i < FLOW_STEPS.length - 1 && (
              <Box
                sx={{
                  width: 32,
                  height: 2,
                  borderRadius: 1,
                  bgcolor: isDone ? '#66BB6A' : 'divider',
                  mx: 0.25,
                }}
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
}