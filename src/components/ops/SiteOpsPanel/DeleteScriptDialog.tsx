import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Alert from '@mui/material/Alert';
import { useTranslation } from 'react-i18next';
import type { OpsScript } from '../../../proto/ops';

/** 删除脚本确认对话框。 */
export function DeleteScriptDialog({
  script,
  error,
  onClose,
  onConfirm,
}: {
  script: OpsScript | null;
  error: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation('ops');
  return (
    <Dialog open={Boolean(script)} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('deleteTitle')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          {t('deleteMessage', { name: script?.name ?? '' })}
        </Typography>
        {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('cancel', { ns: 'common' })}</Button>
        <Button variant="contained" color="error" onClick={onConfirm}>
          {t('delete', { ns: 'common' })}
        </Button>
      </DialogActions>
    </Dialog>
  );
}