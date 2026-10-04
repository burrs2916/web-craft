import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import { CheckCircleIcon, ListChecksIcon } from '@phosphor-icons/react';
import type { DeployProgress, DeployStep } from '../../../../proto/cms';

interface Props {
  progress: DeployProgress;
  steps: { key: DeployStep; label: string }[];
}

export function DeployRunningSection({ progress, steps }: Props) {
  return (
    <>
      {/* 头部进度概览 */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 1.5,
          py: 1,
        }}
      >
        <Box sx={{ position: 'relative', width: 72, height: 72 }}>
          <CircularProgress
            variant="determinate"
            value={progress.percent}
            size={72}
            thickness={4}
            sx={{ color: 'primary.main' }}
          />
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 18, lineHeight: 1 }}>
              {progress.percent}%
            </Typography>
          </Box>
        </Box>
        <Box sx={{ textAlign: 'center' }}>
          <Chip
            size="small"
            color="primary"
            label={progress.step}
            sx={{ fontWeight: 600, mb: 0.5 }}
          />
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>
            {progress.message}
          </Typography>
        </Box>
      </Box>

      {/* 进度条 */}
      <Box sx={{ px: 1 }}>
        <LinearProgress
          variant="determinate"
          value={progress.percent}
          sx={{
            height: 6,
            borderRadius: 3,
            bgcolor: 'action.hover',
            '& .MuiLinearProgress-bar': {
              borderRadius: 3,
              transition: 'transform 0.3s ease',
            },
          }}
        />
      </Box>

      {/* 步骤列表 */}
      <Box
        sx={{
          border: 1,
          borderColor: 'divider',
          borderRadius: 1.5,
          overflow: 'hidden',
          bgcolor: 'action.hover',
        }}
      >
          <Box
            sx={{
              px: 1.5,
              py: 1,
              borderBottom: 1,
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
            }}
          >
            <ListChecksIcon size={14} color="#64748B" />
            <Typography variant="caption" sx={{ fontWeight: 600, fontSize: 11, color: 'text.secondary' }}>
              部署步骤
            </Typography>
            <Typography variant="caption" sx={{ fontSize: 10, color: 'text.disabled', ml: 'auto' }}>
              {steps.findIndex((x) => x.key === progress.step) + 1} / {steps.length}
            </Typography>
          </Box>
          <Box sx={{ maxHeight: 200, overflow: 'auto', p: 0.5 }}>
            {steps.map((s, i) => {
              const currentIdx = steps.findIndex((x) => x.key === progress.step);
              let status: 'done' | 'active' | 'pending' = 'pending';
              if (i < currentIdx) status = 'done';
              else if (i === currentIdx) status = 'active';

              return (
                <Box
                  key={s.key}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    py: 0.75,
                    px: 1,
                    borderRadius: 0.75,
                    transition: 'all 0.2s ease',
                    bgcolor: status === 'active' ? 'background.paper' : 'transparent',
                    ...(status === 'active' && {
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    }),
                  }}
                >
                  <Box sx={{ position: 'relative', width: 18, height: 18, flexShrink: 0 }}>
                    {status === 'done' ? (
                      <Box
                        sx={{
                          width: 18,
                          height: 18,
                          borderRadius: '50%',
                          bgcolor: '#66BB6A',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <CheckCircleIcon size={12} weight="fill" color="white" />
                      </Box>
                    ) : status === 'active' ? (
                      <Box
                        sx={{
                          width: 18,
                          height: 18,
                          borderRadius: '50%',
                          border: '2px solid',
                          borderColor: 'primary.main',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Box
                          sx={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            bgcolor: 'primary.main',
                            animation: 'pulse-step 1.2s ease-in-out infinite',
                            '@keyframes pulse-step': {
                              '0%, 100%': { transform: 'scale(1)', opacity: 1 },
                              '50%': { transform: 'scale(1.3)', opacity: 0.7 },
                            },
                          }}
                        />
                      </Box>
                    ) : (
                      <Box
                        sx={{
                          width: 18,
                          height: 18,
                          borderRadius: '50%',
                          border: '2px solid',
                          borderColor: 'divider',
                        }}
                      />
                    )}
                  </Box>
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: 12,
                      fontWeight: status === 'active' ? 600 : status === 'done' ? 500 : 400,
                      color: status === 'done'
                        ? 'text.secondary'
                        : status === 'active'
                          ? 'text.primary'
                          : 'text.disabled',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {s.label}
                  </Typography>
                </Box>
              );
            })}
          </Box>
      </Box>
    </>
  );
}