import {
  Box,
  Typography,
  Paper,
  Button,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { TrashIcon } from '@phosphor-icons/react';
import type { SiteSummary } from '../../proto';

export interface DeleteSiteDialogProps {
  open: boolean;
  site: SiteSummary | null;
  deleting: boolean;
  onClose: () => void;
  onConfirm: (site: SiteSummary) => void;
}

export function DeleteSiteDialog({ open, site, deleting, onClose, onConfirm }: DeleteSiteDialogProps) {
  const { t } = useTranslation('cms');

  return (
    <Dialog
      open={open}
      onClose={() => !deleting && onClose()}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TrashIcon size={20} color="error" weight="fill" />
          {t('sites.delete_confirm_title')}
        </Box>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {t('sites.delete_confirm_hint')}
        </Typography>
        <Paper
          variant="outlined"
          sx={{
            p: 1.5,
            bgcolor: 'error.light',
            borderColor: 'error.main',
            opacity: 0.8,
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'error.dark' }}>
            {site?.name}
          </Typography>
          <Typography variant="caption" color="error.dark" sx={{ opacity: 0.8 }}>
            {site?.domain || t('sites.no_domain')}
          </Typography>
        </Paper>
        <Alert severity="warning" sx={{ mt: 2, fontSize: 12 }}>
          {t('sites.delete_warning')}
        </Alert>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} disabled={deleting}>
          {t('common:action.cancel')}
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={() => site && onConfirm(site)}
          disabled={deleting}
          startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : <TrashIcon size={16} weight="bold" />}
        >
          {t('sites.action_delete')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}