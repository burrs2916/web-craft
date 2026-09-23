import { useMemo } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import { XIcon, HardDriveIcon } from '@phosphor-icons/react';
import { SiteOpsPanel } from './SiteOpsPanel';
import type { ConnectionConfig } from '../../proto/connection';
import type { SiteSummary } from '../../proto/cms';

interface SiteOpsDialogProps {
  open: boolean;
  onClose: () => void;
  site: SiteSummary | null;
  connections: ConnectionConfig[];
}

export function SiteOpsDialog({ open, onClose, site, connections }: SiteOpsDialogProps) {
  const connectionId = site?.connection_id || '';
  const conn = useMemo(
    () => connections.find((c) => c.id === connectionId),
    [connections, connectionId],
  );

  let host = '';
  let username = '';
  try {
    if (conn) {
      const s = JSON.parse(conn.config_json);
      host = s.host || '';
      username = s.username || '';
    }
  } catch {
    // ignore
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xl"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            height: 'calc(100vh - 64px)',
            maxHeight: 'calc(100vh - 64px)',
            display: 'flex',
            flexDirection: 'column',
          },
        },
      }}
    >
      <DialogTitle sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        pb: 1.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            {site?.name ?? '运维中心'}
          </Typography>
          {conn && (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.25 }}>
              <Chip
                label={`${username}@${host}`}
                size="small"
                variant="outlined"
                sx={{ height: 22, '& .MuiChip-label': { fontSize: 11, fontFamily: 'monospace' } }}
              />
            </Box>
          )}
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: 'text.secondary' }}>
          <XIcon size={18} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        p: 0,
        '&.MuiDialogContent-root': { paddingTop: 0 },
      }}>
        {!connectionId ? (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 6 }}>
            <HardDriveIcon size={48} weight="thin" style={{ opacity: 0.3, marginBottom: 16 }} />
            <Alert severity="info" sx={{ maxWidth: 420 }}>
              该站点尚未绑定服务器，请先在站点设置中配置目标服务器后使用运维功能。
            </Alert>
          </Box>
        ) : (
          <SiteOpsPanel connectionId={connectionId} connections={connections} />
        )}
      </DialogContent>
    </Dialog>
  );
}
