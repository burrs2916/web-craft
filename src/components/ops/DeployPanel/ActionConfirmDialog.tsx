import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';

export type ServiceAction = 'restart' | 'stop' | 'start' | 'rollback';

export interface ActionConfirmDialogProps {
  open: boolean;
  action: ServiceAction;
  loading: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => void;
}

export function ActionConfirmDialog({ open, action, loading, error, onClose, onConfirm }: ActionConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={() => !loading && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle>
        {action === 'restart' && '确认重启服务？'}
        {action === 'stop' && '确认停止服务？'}
        {action === 'start' && '确认启动服务？'}
        {action === 'rollback' && '确认回滚版本？'}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          {action === 'restart' && '重启过程中服务将短暂不可用，确定要重启吗？'}
          {action === 'stop' && '停止后站点将无法访问，确定要停止吗？'}
          {action === 'start' && '启动后站点将恢复对外访问，确定要启动吗？'}
          {action === 'rollback' && '回滚将切换到历史版本并重启服务，当前版本的新数据可能丢失，确定要回滚吗？'}
        </Typography>
        {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button disabled={loading} onClick={onClose}>
          取消
        </Button>
        <Button
          variant="contained"
          color={action === 'stop' ? 'error' : action === 'rollback' ? 'warning' : 'primary'}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
          onClick={onConfirm}
        >
          {action === 'restart' && '重启'}
          {action === 'stop' && '停止'}
          {action === 'start' && '启动'}
          {action === 'rollback' && '回滚'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}