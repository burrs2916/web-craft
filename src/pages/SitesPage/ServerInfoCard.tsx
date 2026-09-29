import { Box, Typography, Paper, Tooltip, IconButton } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { LightningIcon, PencilIcon, TrashIcon } from '@phosphor-icons/react';
import type { ConnectionConfig } from '../../proto';

export interface ServerInfoCardProps {
  connectionId: string;
  connections: ConnectionConfig[];
  onChange: () => void;
  /// 站点必须绑定服务器，新建流程不再提供「移除」入口，故此回调可选
  onRemove?: () => void;
}

/* —— 服务器信息卡片（选中后展示） —— */
export function ServerInfoCard({
  connectionId,
  connections,
  onChange,
  onRemove,
}: ServerInfoCardProps) {
  const { t } = useTranslation('cms');
  const conn = connections.find((c) => c.id === connectionId);

  if (!conn) return null;

  let host = '';
  let username = '';
  let port = 22;
  try {
    const s = JSON.parse(conn.config_json);
    host = s.host || '';
    username = s.username || '';
    port = s.port || 22;
  } catch {}

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.75,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        borderRadius: '10px',
        bgcolor: 'background.paper',
      }}
    >
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: '8px',
          bgcolor: 'primary.main',
          opacity: 0.1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: 'primary.main',
        }}
      >
        <LightningIcon size={18} weight="fill" />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
          {conn.name}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontFamily: 'monospace', fontSize: 11 }}
        >
          {username}@{host}:{port}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        <Tooltip title={t('sites.change_server')}>
          <IconButton size="small" onClick={onChange} sx={{ borderRadius: '6px' }}>
            <PencilIcon size={14} />
          </IconButton>
        </Tooltip>
        {onRemove && (
          <Tooltip title={t('sites.remove_server')}>
            <IconButton size="small" onClick={onRemove} sx={{ borderRadius: '6px', color: 'text.secondary' }}>
              <TrashIcon size={14} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Paper>
  );
}