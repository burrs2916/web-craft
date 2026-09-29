import { Button, Typography, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';

export function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  cancelLabel,
  confirmLabel,
}: {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  cancelLabel: string;
  confirmLabel: string;
}) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Typography variant="body2">{message}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>{cancelLabel}</Button>
        <Button onClick={onConfirm} variant="contained" color="error">{confirmLabel}</Button>
      </DialogActions>
    </Dialog>
  );
}