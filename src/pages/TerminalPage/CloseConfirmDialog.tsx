import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import { useTranslation } from 'react-i18next';

interface CloseConfirmDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** 关闭终端前的二次确认对话框。 */
export function CloseConfirmDialog({ open, onCancel, onConfirm }: CloseConfirmDialogProps) {
  const { t } = useTranslation('terminal');
  const { t: tCommon } = useTranslation('common');

  return (
    <Dialog open={open} onClose={onCancel}>
      <DialogTitle>{t('page.close_terminal')}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {t('page.close_terminal_desc')}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>{tCommon('action.cancel')}</Button>
        <Button onClick={onConfirm} color="error" variant="contained">
          {tCommon('action.confirm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}