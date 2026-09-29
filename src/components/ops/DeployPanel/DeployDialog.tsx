import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import IconButton from '@mui/material/IconButton';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import LinearProgress from '@mui/material/LinearProgress';
import TextField from '@mui/material/TextField';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import {
  RocketIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ArrowCounterClockwiseIcon,
  InfoIcon,
  HardDriveIcon,
  WarningCircleIcon,
  ListChecksIcon,
  PencilIcon,
  CheckIcon,
  ArrowsClockwiseIcon,
} from '@phosphor-icons/react';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { DeployOutcome, DeployProgress, DeployStep, SiteDomain } from '../../../proto/cms';
import { type DeployConfigPreview, type DeployPhase, type EnvReadiness } from './shared';
import { ConfigGroup, ConfigRow, MiniStat } from './primitives';

export interface DeployDialogProps {
  open: boolean;
  phase: DeployPhase;
  siteId: string;
  siteName: string;
  progress: DeployProgress | null;
  error: string;
  result: DeployOutcome | null;
  showLog: boolean;
  onToggleLog: () => void;
  steps: { key: DeployStep; label: string }[];
  domains: SiteDomain[];
  configPreview: DeployConfigPreview | null;
  configEditing: boolean;
  configSaving: boolean;
  onConfigEditingChange: (editing: boolean) => void;
  editRemotePath: string;
  onEditRemotePathChange: (v: string) => void;
  editEnableNginx: boolean;
  onEditEnableNginxChange: (v: boolean) => void;
  editDomain: string;
  onEditDomainChange: (v: string) => void;
  onSaveConfig: () => void;
  envCheckLoading: boolean;
  envReadiness: EnvReadiness | null;
  envCheckError: string;
  onRunEnvCheck: () => void;
  onGoToEnvCheck?: () => void;
  onStartDeploy: () => void;
  onViewService: () => void;
  onClose: () => void;
}

export function DeployDialog({
  open,
  phase,
  siteId,
  siteName,
  progress,
  error,
  result,
  showLog,
  onToggleLog,
  steps,
  domains,
  configPreview,
  configEditing,
  configSaving,
  onConfigEditingChange,
  editRemotePath,
  onEditRemotePathChange,
  editEnableNginx,
  onEditEnableNginxChange,
  editDomain,
  onEditDomainChange,
  onSaveConfig,
  envCheckLoading,
  envReadiness,
  envCheckError,
  onRunEnvCheck,
  onGoToEnvCheck,
  onStartDeploy,
  onViewService,
  onClose,
}: DeployDialogProps) {
  return (
    <Dialog open={open} onClose={() => phase !== 'running' && onClose()} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <RocketIcon size={20} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>部署服务</Typography>
          {phase === 'idle' && (
            <Chip
              size="small"
              color="primary"
              label="完整版"
              sx={{ ml: 1 }}
            />
          )}
        </Box>
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {/* 确认页 */}
        {phase === 'idle' && (
          <>
            {/* 站点信息摘要 */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                p: 1.5,
                borderRadius: 1.5,
                bgcolor: 'action.hover',
              }}
            >
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: 1,
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <RocketIcon size={20} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  {siteName || siteId}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {domains.length > 0
                    ? `${domains.map(d => d.domain).join(', ')} · ${configPreview?.remotePath}`
                    : `${configPreview?.domain || '未绑定域名'} · ${configPreview?.remotePath}`}
                </Typography>
              </Box>
              <Chip
                size="small"
                color="primary"
                label="完整版"
              />
            </Box>

            {/* 环境检测卡片 */}
            <Box
              sx={{
                border: 1,
                borderColor: 'divider',
                borderRadius: 1.5,
                overflow: 'hidden',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1.5,
                  py: 1,
                  bgcolor: 'action.hover',
                  borderBottom: 1,
                  borderColor: 'divider',
                }}
              >
                  <CheckCircleIcon size={14} color={envReadiness?.isReady ? '#66BB6A' : '#94A3B8'} />
                  <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 12, flex: 1 }}>
                    环境检测
                  </Typography>
                  {envCheckLoading ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <CircularProgress size={12} thickness={3} />
                      <Typography variant="caption" color="text.secondary">检测中...</Typography>
                    </Box>
                  ) : envReadiness ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip
                        size="small"
                        label={`${envReadiness.score} 分`}
                        sx={{
                          height: 18,
                          fontSize: 10,
                          fontWeight: 600,
                          bgcolor: envReadiness.isReady
                            ? 'rgba(102, 187, 106, 0.15)'
                            : envReadiness.failed > 0
                              ? 'rgba(239, 83, 80, 0.15)'
                              : 'rgba(255, 167, 38, 0.15)',
                          color: envReadiness.isReady
                            ? '#66BB6A'
                            : envReadiness.failed > 0
                              ? '#EF5350'
                              : '#FFA726',
                        }}
                      />
                      <IconButton size="small" onClick={onRunEnvCheck} title="重新检测">
                        <ArrowsClockwiseIcon size={12} />
                      </IconButton>
                    </Box>
                  ) : (
                    <Button size="small" onClick={onRunEnvCheck}>
                      开始检测
                    </Button>
                  )}
                </Box>

                {envCheckError && (
                  <Box sx={{ px: 1.5, py: 1 }}>
                    <Alert severity="error" sx={{ py: 0 }}>
                      <Typography variant="caption">{envCheckError}</Typography>
                    </Alert>
                  </Box>
                )}

                {envReadiness && (
                  <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <MiniStat label="通过" value={envReadiness.passed} color="#66BB6A" />
                      <MiniStat label="警告" value={envReadiness.warning} color="#FFA726" />
                      <MiniStat label="失败" value={envReadiness.failed} color="#EF5350" />
                    </Box>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {envReadiness.nginxOk ? (
                          <CheckCircleIcon size={12} color="#66BB6A" weight="fill" />
                        ) : (
                          <XCircleIcon size={12} color="#EF5350" weight="fill" />
                        )}
                        <Typography variant="caption" sx={{ fontSize: 11 }}>Nginx</Typography>
                      </Box>
                    </Box>
                    {!envReadiness.isReady && (
                      <Alert severity="warning" sx={{ py: 0.5 }} icon={<WarningCircleIcon size={14} />}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                          <Typography variant="caption">
                            环境未满足部署要求
                          </Typography>
                          {onGoToEnvCheck && (
                            <Button
                              size="small"
                              variant="outlined"
                              color="warning"
                              onClick={() => {
                                onClose();
                                onGoToEnvCheck();
                              }}
                              sx={{ py: 0, fontSize: 11, minWidth: 'auto' }}
                            >
                              去修复
                            </Button>
                          )}
                        </Box>
                      </Alert>
                    )}
                  </Box>
                )}
            </Box>

            {/* 部署配置（可编辑） */}
            {configPreview && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, fontSize: 12 }}>
                    部署配置
                  </Typography>
                  {!configEditing ? (
                    <Button
                      size="small"
                      startIcon={<PencilIcon size={12} weight="bold" />}
                      onClick={() => onConfigEditingChange(true)}
                      sx={{ textTransform: 'none', fontSize: 11, py: 0, minWidth: 'auto' }}
                    >
                      编辑
                    </Button>
                  ) : (
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Button
                        size="small"
                        color="inherit"
                        onClick={() => onConfigEditingChange(false)}
                        disabled={configSaving}
                        sx={{ textTransform: 'none', fontSize: 11, py: 0, minWidth: 'auto' }}
                      >
                        取消
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        onClick={onSaveConfig}
                        disabled={configSaving}
                        startIcon={configSaving ? <CircularProgress size={12} color="inherit" /> : <CheckIcon size={12} weight="bold" />}
                        sx={{ textTransform: 'none', fontSize: 11, py: 0, minWidth: 'auto' }}
                      >
                        保存
                      </Button>
                    </Box>
                  )}
                </Box>
                {!configEditing ? (
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1.25,
                      p: 1.5,
                      border: 1,
                      borderColor: 'divider',
                      borderRadius: 1.5,
                      bgcolor: 'background.paper',
                    }}
                  >
                    {/* 基础配置 */}
                    <ConfigGroup title="基础配置" icon={
                      <svg width="14" height="14" viewBox="0 0 256 256" fill="none"><path d="M128,88a40,40,0,1,0,40,40A40,40,0,0,0,128,88Zm0,64a24,24,0,1,1,24-24A24,24,0,0,1,128,152Zm93.13-59.42a8,8,0,0,0-7-5.66l-28.19-4.1-12.6-25.53a8,8,0,0,0-10.33-3.77l-25.23,10.6a88.36,88.36,0,0,0-29.52,0L82.99,53.62a8,8,0,0,0-10.33,3.77L60.06,82.82,31.87,86.92a8,8,0,0,0-6.39,13.65L45,120.7,25.48,140.87a8,8,0,0,0,5.31,13.7l28.27,4.11,12.6,25.53a8,8,0,0,0,11.3,4.18l24.12-10.13a88.46,88.46,0,0,0,29.52,0l24.12,10.13a8,8,0,0,0,11.3-4.18l12.6-25.53,28.27-4.11a8,8,0,0,0,5.31-13.7L211,120.7l19.51-20.13A8,8,0,0,0,221.13,92.58ZM195.3,147.78a8,8,0,0,0-2.49,1.81l-.18.18-23.13,20.75a8,8,0,0,0-1.87,6.9l3.83,27.85a8,8,0,0,0-12.34,7l-4-27.74a8,8,0,0,0-3.08-5.67l-23.58-17.27a8,8,0,0,0-7.72-.69l-27.34,9.79a8,8,0,0,0-5.69,5.13l-7.6,26.48a8,8,0,0,0-15.11-4.34l7.55-26.31a8,8,0,0,0-3.81-5.35L68.58,147a8,8,0,0,0-9-.13L38.32,158.16,56.56,140a8,8,0,0,0,2.49-1.81l.18-.18,23.13-20.75a8,8,0,0,0,1.87-6.9l-3.83-27.85a8,8,0,0,0,12.34-7l4,27.74a8,8,0,0,0,3.08,5.67l23.58,17.27a8,8,0,0,0,7.72.69l27.34-9.79a8,8,0,0,0,5.69-5.13l7.6-26.48a8,8,0,0,0,15.11,4.34l-7.55,26.31a8,8,0,0,0,3.81,5.35l22.57,16.54a8,8,0,0,0,9,.13l21.26-11.29L199.44,140A8,8,0,0,0,195.3,147.78Z" fill="currentColor"/></svg>
                    }>
                      <Box>
                        <ConfigRow label="远程路径" value={configPreview.remotePath} mono />
                      </Box>
                    </ConfigGroup>

                    {/* Nginx & 域名 */}
                    <ConfigGroup title="Nginx & 域名" icon={
                      <svg width="14" height="14" viewBox="0 0 256 256" fill="none"><circle cx="128" cy="128" r="96" style={{fill:'none',stroke:'currentColor',strokeWidth:'16'}}/><path d="M92,148l36-72,36,72" style={{fill:'none',stroke:'currentColor',strokeWidth:'16',strokeLinecap:'round',strokeLinejoin:'round'}}/><line x1="100" y1="128" x2="156" y2="128" style={{fill:'none',stroke:'currentColor',strokeWidth:'16',strokeLinecap:'round'}}/></svg>
                    }>
                      <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 2, alignItems: 'center' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                            Nginx
                          </Typography>
                          <Chip
                            size="small"
                            variant="filled"
                            color={configPreview.enableNginx ? 'success' : 'default'}
                            label={configPreview.enableNginx ? '已启用' : '已禁用'}
                            sx={{ height: 20, fontSize: 10, '& .MuiChip-label': { px: 1, py: 0 } }}
                          />
                        </Box>
                        <ConfigRow label="域名" value={
                          domains.length > 0
                            ? domains.map(d => d.domain + (d.is_primary ? ' (主)' : '')).join(', ')
                            : (configPreview.domain || '未设置')
                        } mono={!!configPreview.domain} />
                        {domains.length > 1 && (
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, pl: 1 }}>
                            共 {domains.length} 个域名，Nginx server_name 将包含全部域名
                          </Typography>
                        )}
                      </Box>
                    </ConfigGroup>

                    {/* 提示 */}
                    <Alert severity="info" sx={{ py: 0.5, '& .MuiAlert-message': { py: 0 } }}>
                      <Typography variant="caption" sx={{ lineHeight: 1.4 }}>
                        以上配置将在<strong>下次部署</strong>时生效，修改后点击「开始部署」即可应用
                      </Typography>
                    </Alert>
                  </Box>
                ) : (
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1.5,
                      p: 1.5,
                      border: 1,
                      borderColor: 'primary.light',
                      borderRadius: 1,
                      bgcolor: 'background.paper',
                    }}
                  >
                    {/* 基础配置 */}
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <TextField
                        label="远程路径"
                        value={editRemotePath}
                        onChange={(e) => onEditRemotePathChange(e.target.value)}
                        size="small"
                        sx={{ flex: 1 }}
                        placeholder="/var/www/example.com/html"
                      />
                    </Box>
                    {/* Nginx + 域名 */}
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 1.5, alignItems: 'center' }}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={editEnableNginx}
                            onChange={(e) => onEditEnableNginxChange(e.target.checked)}
                            size="small"
                          />
                        }
                        label={<Typography variant="body2">启用 Nginx</Typography>}
                      />
                      <TextField
                        label="域名"
                        value={editDomain}
                        onChange={(e) => onEditDomainChange(e.target.value)}
                        size="small"
                        placeholder="example.com"
                      />
                    </Box>
                  </Box>
                )}
              </Box>
            )}
          </>
        )}

        {/* 运行中 */}
        {phase === 'running' && progress && (
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
        )}

        {/* 成功页 - 二进制部署 */}
        {phase === 'success' && result && (
          <>
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
                py: 1,
              }}
            >
              <Box
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  bgcolor: 'rgba(102, 187, 106, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CheckCircleIcon size={32} weight="fill" color="#66BB6A" />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>部署成功</Typography>
              <Typography variant="caption" color="text.secondary">
                二进制已上传并拉起 · 总耗时 {(result.durationMs / 1000).toFixed(0)} 秒
              </Typography>
            </Box>

            {/* 访问地址 */}
            <Box
              sx={{
                p: 1.5,
                borderRadius: 1.5,
                bgcolor: 'action.hover',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary">访问地址</Typography>
                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: 'monospace',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {result.baseUrl}
                </Typography>
              </Box>
              <Button
                size="small"
                variant="contained"
                startIcon={<RocketIcon size={14} />}
                onClick={() => openUrl(result.baseUrl).catch(() => {})}
              >
                打开
              </Button>
            </Box>

            {/* 统计 */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 1,
              }}
            >
              <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: 'action.hover' }}>
                <Typography variant="caption" color="text.secondary">已上传文件</Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.25 }}>
                  {result.uploadedCount} 个
                </Typography>
              </Box>
              <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: 'action.hover' }}>
                <Typography variant="caption" color="text.secondary">传输体积</Typography>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.25 }}>
                  {(result.totalBytes / 1024 / 1024).toFixed(1)} MB
                </Typography>
              </Box>
            </Box>

            {/* 快捷操作 */}
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<ClockIcon size={14} />}
                onClick={onToggleLog}
                sx={{ flex: 1 }}
              >
                {showLog ? '收起日志' : '部署日志'}
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<HardDriveIcon size={14} />}
                onClick={onViewService}
                sx={{ flex: 1 }}
              >
                查看服务
              </Button>
            </Box>

            {showLog && result.log.length > 0 && (
              <Box
                sx={{
                  maxHeight: 160,
                  overflow: 'auto',
                  bgcolor: '#0F172A',
                  borderRadius: 1,
                  p: 1.5,
                  color: '#E2E8F0',
                  fontSize: 10.5,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  lineHeight: 1.5,
                }}
              >
                {result.log.map((line, i) => (
                  <Box key={i} sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {line}
                  </Box>
                ))}
              </Box>
            )}
          </>
        )}


        {/* 失败页 */}
        {phase === 'failed' && (
          <>
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
                py: 1,
              }}
            >
              <Box
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  bgcolor: 'rgba(239, 83, 80, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <XCircleIcon size={32} weight="fill" color="#EF5350" />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>部署失败</Typography>
            </Box>

            <Box
              sx={{
                maxHeight: 200,
                overflow: 'auto',
                p: 1.5,
                borderRadius: 1.5,
                bgcolor: 'rgba(239, 83, 80, 0.08)',
                border: 1,
                borderColor: 'error.main',
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  whiteSpace: 'pre-wrap',
                  fontSize: 12,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  color: 'error.main',
                  lineHeight: 1.5,
                }}
              >
                {error}
              </Typography>
            </Box>

            {error.includes('环境未满足') && (
              <Alert severity="info" sx={{ py: 0.5 }} icon={<InfoIcon size={14} />}>
                <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 12 }}>
                  前往「环境检测」页签，使用 AI 智能修复自动安装依赖
                </Typography>
              </Alert>
            )}

            {error.includes('未找到') && error.includes('二进制') && (
              <Alert severity="info" sx={{ py: 0.5 }} icon={<InfoIcon size={14} />}>
                <Typography variant="body2" sx={{ fontSize: 12 }}>
                  请将 webcraft-server 二进制文件放入项目 bin/ 目录
                </Typography>
              </Alert>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        {phase === 'idle' && (
          <>
            <Button onClick={onClose}>取消</Button>
            {/* 静态部署（路线B：上传 dist/ → Nginx 提供服务） */}
            <Button
              variant="contained"
              startIcon={<RocketIcon size={16} weight="bold" />}
              onClick={onStartDeploy}
              disabled={
                envReadiness != null && !envReadiness.isReady
              }
            >
              开始部署
            </Button>
          </>
        )}
        {phase === 'running' && (
          <Button disabled startIcon={<CircularProgress size={16} color="inherit" />}>
            部署中...
          </Button>
        )}
        {phase === 'success' && (
          <Button variant="contained" onClick={onClose}>
            完成
          </Button>
        )}
        {phase === 'failed' && (
          <>
            <Button onClick={onClose}>关闭</Button>
            <Button variant="contained" startIcon={<ArrowCounterClockwiseIcon size={16} />} onClick={onStartDeploy}>
              重试
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}