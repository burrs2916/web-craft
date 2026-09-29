import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { RocketIcon, ArrowCounterClockwiseIcon } from '@phosphor-icons/react';
import type { Deployment, Site } from '../../../proto/cms';
import { STATUS_COLOR, STATUS_LABEL, MODE_LABEL, TRIGGER_LABEL, formatBytes, formatDuration, formatTime, parseSteps, parseLogs } from './shared';
import { InfoItem, StepRow } from './primitives';

export interface DeployDetailDialogProps {
  open: boolean;
  loading: boolean;
  deployment: Deployment | null;
  siteMap: Record<string, Site>;
  onClose: () => void;
  onRollback: (deploymentId: string, siteId: string) => void;
}

export function DeployDetailDialog({ open, loading, deployment, siteMap, onClose, onRollback }: DeployDetailDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <RocketIcon size={20} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>部署详情</Typography>
          <Chip
            label={STATUS_LABEL[deployment?.status || ''] || deployment?.status}
            size="small"
            sx={{
              height: 22,
              fontSize: 11,
              fontWeight: 600,
              bgcolor: `${STATUS_COLOR[deployment?.status || ''] || '#94A3B8'}22`,
              color: STATUS_COLOR[deployment?.status || ''] || '#94A3B8',
            }}
          />
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : deployment ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* 基本信息 */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
              <InfoItem label="站点" value={siteMap[deployment.siteId]?.name || deployment.siteId} />
              <InfoItem label="部署模式" value={MODE_LABEL[deployment.mode] || deployment.mode} />
              <InfoItem label="触发方式" value={TRIGGER_LABEL[deployment.triggerType] || deployment.triggerType} />
              <InfoItem label="版本目录" value={deployment.versionDir || '—'} mono />
              <InfoItem label="上传文件" value={`${deployment.uploadedCount} 个`} />
              <InfoItem label="总大小" value={formatBytes(deployment.totalBytes)} />
              <InfoItem label="开始时间" value={formatTime(deployment.startedAt)} />
              <InfoItem label="结束时间" value={deployment.finishedAt ? formatTime(deployment.finishedAt) : '—'} />
              <InfoItem label="耗时" value={formatDuration(deployment.durationMs)} />
            </Box>

            {deployment.rollbackFrom && (
              <Alert severity="info">
                回滚自版本：{deployment.rollbackFrom}
              </Alert>
            )}

            {/* 部署步骤 */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>部署步骤</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {parseSteps(deployment.stepsJson).map((step, idx) => (
                  <StepRow key={step.key || idx} step={step} />
                ))}
                {parseSteps(deployment.stepsJson).length === 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>
                    无步骤信息
                  </Typography>
                )}
              </Box>
            </Box>

            {/* 部署日志 */}
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>部署日志</Typography>
              <Box
                sx={{
                  maxHeight: 200,
                  overflow: 'auto',
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: '#0F172A',
                  color: '#E2E8F0',
                  fontSize: 12,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  lineHeight: 1.5,
                }}
              >
                {parseLogs(deployment.logJson).length > 0 ? (
                  parseLogs(deployment.logJson).map((log, i) => (
                    <Box key={i} sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {log}
                    </Box>
                  ))
                ) : (
                  <Typography variant="body2" sx={{ color: '#64748B', fontSize: 12 }}>
                    无日志记录
                  </Typography>
                )}
              </Box>
            </Box>

            {/* 错误信息 */}
            {deployment.errorSummary && (
              <Alert severity="error">
                <Typography variant="body2" sx={{ fontWeight: 600 }}>错误信息</Typography>
                <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                  {deployment.errorSummary}
                </Typography>
              </Alert>
            )}
          </Box>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        {deployment?.status === 'success' && deployment?.versionDir && (
          <Button
            variant="outlined"
            color="warning"
            startIcon={<ArrowCounterClockwiseIcon size={16} />}
            onClick={() => onRollback(deployment.id, deployment.siteId)}
          >
            回滚到此版本
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
    </Dialog>
  );
}