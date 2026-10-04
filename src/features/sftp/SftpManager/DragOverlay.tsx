import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { FolderOpenIcon, UploadIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { DropTarget } from './types';

/**
 * A dashed frame plus a floating pill instead of a dimming curtain: the
 * highlighted destination row has to stay readable while the pointer is
 * still holding the files.
 */
export function DragOverlay({
  isDark,
  dropTarget,
  path,
  textColor,
  subtle,
}: {
  isDark: boolean;
  dropTarget: DropTarget | null;
  path: string;
  textColor: string;
  subtle: string;
}) {
  const { t } = useTranslation('fileTransfer');

  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 5,
        pointerEvents: 'none',
        border: `2px dashed ${dropTarget ? (isDark ? 'rgba(63,185,80,0.9)' : '#1F883D') : isDark ? 'rgba(88,166,255,0.7)' : '#0969DA'}`,
        borderRadius: 1,
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          left: '50%',
          bottom: 16,
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          maxWidth: '86%',
          px: 1.75,
          py: 1,
          borderRadius: 999,
          bgcolor: isDark ? 'rgba(22,27,34,0.96)' : 'rgba(255,255,255,0.97)',
          border: '1px solid',
          borderColor: dropTarget
            ? isDark
              ? 'rgba(63,185,80,0.6)'
              : 'rgba(31,136,61,0.45)'
            : 'divider',
          boxShadow: isDark ? '0 8px 26px rgba(0,0,0,0.55)' : '0 8px 26px rgba(31,35,40,0.16)',
        }}
      >
        {dropTarget ? (
          <FolderOpenIcon size={18} color={isDark ? '#3FB950' : '#1F883D'} weight="fill" />
        ) : (
          <UploadIcon size={18} color={isDark ? '#58A6FF' : '#0969DA'} weight="bold" />
        )}
        <Typography sx={{ color: textColor, fontWeight: 600, fontSize: 13 }}>{t('drop_hint')}</Typography>
        <Typography
          sx={{
            color: subtle,
            fontSize: 12,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {dropTarget?.path ?? path}
        </Typography>
      </Box>
    </Box>
  );
}