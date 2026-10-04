import {
  Typography, Dialog, DialogTitle, DialogContent, DialogActions, Button,
} from '@mui/material';
import type { TFunction } from 'i18next';

interface Props {
  deleteConvConfirm: string | null;
  conversationTitle: string;
  onCancel: () => void;
  onConfirm: (id: string) => void;
  t: TFunction;
}

export function DeleteConversationDialog({ deleteConvConfirm, conversationTitle, onCancel, onConfirm, t }: Props) {
  return (
    <Dialog
      open={deleteConvConfirm !== null}
      onClose={onCancel}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle>{t('chat.delete_confirm_title')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">
          {t('chat.delete_confirm_message', {
            name: conversationTitle,
            defaultValue: `Are you sure you want to delete this conversation? All messages will be permanently lost.`,
          })}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>{t('chat.cancel', { defaultValue: 'Cancel' })}</Button>
        <Button
          color="error"
          variant="contained"
          onClick={() => deleteConvConfirm && onConfirm(deleteConvConfirm)}
        >
          {t('chat.delete', { defaultValue: 'Delete' })}
        </Button>
      </DialogActions>
    </Dialog>
  );
}