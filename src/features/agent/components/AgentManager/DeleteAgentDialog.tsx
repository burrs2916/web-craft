import { Box, Typography, Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';
import { TrashIcon } from '@phosphor-icons/react';
import type { TFunction } from 'i18next';
import type { DeleteConfirmState } from './useAgentManager';

interface Props {
  deleteConfirm: DeleteConfirmState | null;
  onCancel: () => void;
  onConfirm: (id: string) => void;
  t: TFunction;
}

/** 删除智能体确认框：提示将连带删除的会话数量。 */
export function DeleteAgentDialog({ deleteConfirm, onCancel, onConfirm, t }: Props) {
  return (
    <Dialog
      open={!!deleteConfirm}
      onClose={onCancel}
      slotProps={{
        paper: {
          sx: { borderRadius: 3, overflow: 'hidden' },
        },
      }}
    >
      <Box sx={{ height: 3, background: 'linear-gradient(135deg, #FF7B72 0%, #FFB74D 100%)' }} />
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pt: 2.5 }}>
        <Box sx={{ width: 32, height: 32, borderRadius: 1.5, bgcolor: 'rgba(255,123,114,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <TrashIcon size={18} weight="bold" color="#FF7B72" />
        </Box>
        <Typography variant="h6" sx={{ fontSize: 16, fontWeight: 700 }}>{t('agent.delete_confirm_title')}</Typography>
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Typography variant="body2">
          {t('agent.delete_confirm_message_with_info', {
            name: deleteConfirm?.name || '',
            count: deleteConfirm?.convCount || 0,
            convCount: deleteConfirm?.convCount || 0,
            defaultValue: `Are you sure you want to delete agent "${deleteConfirm?.name || ''}"?${deleteConfirm?.convCount ? ` This will also delete ${deleteConfirm.convCount} conversation(s) and all associated messages.` : ''}`,
          })}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, gap: 1.5 }}>
        <Button
          onClick={onCancel}
          sx={{
            textTransform: 'none',
            color: 'text.secondary',
            border: '1px solid',
            borderColor: 'divider',
            fontSize: 13,
            '&:hover': { borderColor: 'text.secondary' },
          }}
        >
          {t('agent.cancel')}
        </Button>
        <Button
          color="error"
          variant="contained"
          onClick={() => deleteConfirm && onConfirm(deleteConfirm.id)}
          sx={{ textTransform: 'none', fontSize: 13, px: 2.5 }}
        >
          {t('agent.delete')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}