import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import DialogActions from '@mui/material/DialogActions';
import { RocketIcon, ArrowCounterClockwiseIcon } from '@phosphor-icons/react';
import type { DeployPhase, EnvReadiness } from '../shared';

interface Props {
  phase: DeployPhase;
  envReadiness: EnvReadiness | null;
  onClose: () => void;
  onStartDeploy: () => void;
}

export function DeployDialogActions({ phase, envReadiness, onClose, onStartDeploy }: Props) {
  return (
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
  );
}