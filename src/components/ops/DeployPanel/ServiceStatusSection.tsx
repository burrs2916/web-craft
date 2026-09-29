import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import {
  RocketIcon,
  ArrowCounterClockwiseIcon,
  StopIcon,
  PlayIcon,
  InfoIcon,
  FolderOpenIcon,
  ArrowsClockwiseIcon,
  HardDriveIcon,
  UploadIcon,
} from '@phosphor-icons/react';
import type { ServiceStatus } from '../../../proto/cms';
import type { Site } from '../../../proto/cms';
import { StatusMini } from './primitives';

export interface ServiceStatusSectionProps {
  connectionSites: Site[];
  serviceStatusMap: Record<string, ServiceStatus>;
  statusLoadingMap: Record<string, boolean>;
  onRefreshOne: (siteId: string) => void;
  onDeploy: (site: Site) => void;
  onOpenSftp: (site: Site) => void;
  onServiceAction: (action: 'start' | 'restart' | 'stop', siteId: string) => void;
}

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
        {connectionSites.map((site) => {
          const status = serviceStatusMap[site.id];
          const loading = statusLoadingMap[site.id];
          const isRunning = status?.isRunning;
          const isHealthy = status?.healthOk;
          return (
            <Card
              key={site.id}
              variant="outlined"
              sx={{
                position: 'relative',
                overflow: 'hidden',
                transition: 'all 0.2s ease',
                '&:hover': {
                  borderColor: 'primary.main',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  transform: 'translateY(-1px)',
                },
              }}
            >
              {/* 左侧状态条 */}
              <Box
                sx={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 3,
                  bgcolor: loading
                    ? 'divider'
                    : isRunning
                      ? isHealthy
                        ? '#66BB6A'
                        : '#FFA726'
                      : status
                        ? '#94A3B8'
                        : 'divider',
                  transition: 'background-color 0.3s ease',
                }}
              />
              <CardContent sx={{ p: 2, pb: 1.5, pl: 2.25 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.25 }}>
                  {/* 图标 + 状态脉冲 */}
                  <Box sx={{ position: 'relative' }}>
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: loading
                          ? 'action.hover'
                          : isRunning
                            ? isHealthy
                              ? 'rgba(102, 187, 106, 0.12)'
                              : 'rgba(255, 167, 38, 0.12)'
                            : status
                              ? 'rgba(148, 163, 184, 0.12)'
                              : 'action.hover',
                        transition: 'all 0.3s ease',
                      }}
                    >
                      <RocketIcon
                        size={18}
                        color={isRunning ? (isHealthy ? '#66BB6A' : '#FFA726') : status ? '#94A3B8' : '#CBD5E1'}
                        weight={isRunning ? 'fill' : 'regular'}
                      />
                    </Box>
                    {/* 运行状态脉冲点 */}
                    {isRunning && !loading && (
                      <Box
                        sx={{
                          position: 'absolute',
                          top: -2,
                          right: -2,
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          bgcolor: isHealthy ? '#66BB6A' : '#FFA726',
                          animation: 'pulse-dot 2s ease-in-out infinite',
                          '@keyframes pulse-dot': {
                            '0%, 100%': {
                              boxShadow: `0 0 0 0 ${isHealthy ? 'rgba(102, 187, 106, 0.5)' : 'rgba(255, 167, 38, 0.5)'}`,
                            },
                            '50%': {
                              boxShadow: `0 0 0 6px ${isHealthy ? 'rgba(102, 187, 106, 0)' : 'rgba(255, 167, 38, 0)'}`,
                            },
                          },
                        }}
                      />
                    )}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3 }} noWrap>
                      {site.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: 11 }}>
                      {site.domain || '未绑定域名'}{site.domain ? '' : '（仅 IP 可达）'}
                    </Typography>
                  </Box>
                  {loading ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <CircularProgress size={14} thickness={3} />
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>检测中</Typography>
                    </Box>
                  ) : status ? (
                    <Chip
                      label={isRunning ? '运行中' : '已停止'}
                      size="small"
                      sx={{
                        height: 22,
                        fontSize: 11,
                        fontWeight: 600,
                        borderRadius: '11px',
                        bgcolor: isRunning
                          ? isHealthy
                            ? 'rgba(102, 187, 106, 0.12)'
                            : 'rgba(255, 167, 38, 0.12)'
                          : 'rgba(148, 163, 184, 0.12)',
                        color: isRunning
                          ? isHealthy
                            ? '#66BB6A'
                            : '#FFA726'
                          : '#94A3B8',
                        border: 'none',
                      }}
                    />
                  ) : (
                    <Chip
                      label="未部署"
                      size="small"
                      variant="outlined"
                      sx={{ height: 22, fontSize: 11, fontWeight: 500, borderRadius: '11px' }}
                    />
                  )}
                </Box>

                {status && (
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: 1,
                      pt: 1.25,
                      borderTop: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <StatusMini label="端口" value="80" />
                    <StatusMini
                      label="HTTP 可达"
                      value={isHealthy ? '正常' : `异常(${status.healthzCode})`}
                      color={isHealthy ? '#66BB6A' : '#EF5350'}
                    />
                    <StatusMini label="版本" value={status.currentVersion || '未知'} mono />
                  </Box>
                )}

                {!status && !loading && (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.75,
                      pt: 1.25,
                      borderTop: '1px dashed',
                      borderColor: 'divider',
                    }}
                  >
                    <InfoIcon size={12} color="#94A3B8" />
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                      服务尚未部署，点击右侧按钮开始部署
                    </Typography>
                  </Box>
                )}

                <Box sx={{ display: 'flex', gap: 0.25, mt: 1.25, justifyContent: 'flex-end' }}>
                  <Tooltip title="部署服务" placement="top">
                    <IconButton
                      size="small"
                      color="primary"
                      sx={{
                        transition: 'all 0.2s',
                        '&:hover': {
                          bgcolor: 'primary.main',
                          color: 'primary.contrastText',
                          transform: 'scale(1.05)',
                        },
                      }}
                      onClick={() => onDeploy(site)}
                    >
                      <UploadIcon size={16} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="SFTP 文件管理">
                    <IconButton
                      size="small"
                      onClick={() => onOpenSftp(site)}
                    >
                      <FolderOpenIcon size={16} />
                    </IconButton>
                  </Tooltip>
                  {status && !status.isRunning && (
                    <Tooltip title="启动服务">
                      <IconButton
                        size="small"
                        color="success"
                        onClick={() => onServiceAction('start', site.id)}
                      >
                        <PlayIcon size={16} />
                      </IconButton>
                    </Tooltip>
                  )}
                  {status?.isRunning && (
                    <Tooltip title="重启服务">
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => onServiceAction('restart', site.id)}
                      >
                        <ArrowCounterClockwiseIcon size={16} />
                      </IconButton>
                    </Tooltip>
                  )}
                  {status?.isRunning && (
                    <Tooltip title="停止服务">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => onServiceAction('stop', site.id)}
                      >
                        <StopIcon size={16} />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title="刷新状态">
                    <IconButton size="small" onClick={() => onRefreshOne(site.id)}>
                      <ArrowsClockwiseIcon size={16} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </CardContent>
            </Card>
          );
        })}
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