import {
  Box, Typography, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Alert,
} from '@mui/material';
import { ShieldWarning } from '@phosphor-icons/react';
import type { PermissionRequestPayload } from './types';

interface Props {
  request: PermissionRequestPayload | null;
  onRespond: (approved: boolean, alwaysAllow: boolean) => void;
}

export function PermissionDialog({ request, onRespond }: Props) {
  return (
    <Dialog
      open={request !== null}
      onClose={() => onRespond(false, false)}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <ShieldWarning size={20} weight="fill" color="#FF9800" />
        Permission Request
      </DialogTitle>
      <DialogContent>
        {request && (
          <Box sx={{ pt: 1 }}>
            <Alert severity={request.riskLevel === 'high' ? 'warning' : 'info'} sx={{ mb: 2, '& .MuiAlert-message': { whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.8rem' } }}>
              {request.description}
            </Alert>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Tool: <strong>{request.toolName}</strong>
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Risk Level: <Chip
                label={request.riskLevel}
                size="small"
                color={request.riskLevel === 'high' ? 'warning' : 'info'}
                sx={{ textTransform: 'capitalize' }}
              />
            </Typography>
            {request.arguments && Object.keys(request.arguments).length > 0 && (
              <Box sx={{ mt: 1, p: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                  {JSON.stringify(request.arguments, null, 2)}
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={() => onRespond(false, false)} color="inherit">
          Deny
        </Button>
        <Button onClick={() => onRespond(true, true)} color="info" variant="outlined">
          Always Allow
        </Button>
        <Button onClick={() => onRespond(true, false)} color="primary" variant="contained" autoFocus>
          Allow Once
        </Button>
      </DialogActions>
    </Dialog>
  );
}