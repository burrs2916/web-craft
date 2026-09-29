import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import { TrashIcon } from '@phosphor-icons/react';

export type DeleteMode = 'single' | 'batch' | 'cleanup' | 'failed';

export interface DeleteConfirmDialogProps {
  open: boolean;
  mode: DeleteMode;
  selectedCount: number;
  keepCount: number;
  deleting: boolean;
  onClose: () => void;
  onKeepCountChange: (n: number) => void;
  onConfirm: () => void;
}

export function DeleteConfirmDialog({
  open,
  mode,
  selectedCount,
  keepCount,
  deleting,
  onClose,
  onKeepCountChange,
  onConfirm,
}: DeleteConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={() => !deleting && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle>
        {mode === 'single' && '确认删除部署记录？'}
        {mode === 'batch' && `确认删除 ${selectedCount} 条部署记录？`}
        {mode === 'cleanup' && '清理旧部署记录'}
        {mode === 'failed' && '清理失败部署记录'}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">
          {mode === 'single' && '删除后无法恢复，确定要删除这条部署记录吗？'}
          {mode === 'batch' && '删除后无法恢复，确定要删除选中的部署记录吗？'}
          {mode === 'cleanup' && '将删除所有站点中除最近 N 条以外的部署记录，此操作不可恢复。'}
          {mode === 'failed' && '将删除所有状态为"失败"的部署记录，此操作不可恢复。'}
        </Typography>
        {mode === 'cleanup' && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" sx={{ mb: 1, fontWeight: 500 }}>
              保留最近的记录数：
            </Typography>
            <FormControl size="small" fullWidth>
              <Select
                value={keepCount}
                onChange={(e) => onKeepCountChange(Number(e.target.value))}
              >
                <MenuItem value={5}>保留最近 5 条</MenuItem>
                <MenuItem value={10}>保留最近 10 条</MenuItem>
                <MenuItem value={20}>保留最近 20 条</MenuItem>
                <MenuItem value={50}>保留最近 50 条</MenuItem>
                <MenuItem value={100}>保留最近 100 条</MenuItem>
              </Select>
            </FormControl>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button disabled={deleting} onClick={onClose}>
          取消
        </Button>
        <Button
          variant="contained"
          color="error"
          disabled={deleting}
          startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : <TrashIcon size={16} />}
          onClick={onConfirm}
        >
          {deleting ? '删除中...' : '确认删除'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}