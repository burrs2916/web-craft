import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

export function EmptyState({
  isDark,
  icon,
  title,
  actionLabel,
  onAction,
}: {
  isDark: boolean;
  icon: ReactNode;
  title: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1.25,
      }}
    >
      {icon}
      <Typography sx={{ color: isDark ? '#8FA3B0' : '#5A6B64', fontSize: 13 }}>{title}</Typography>
      <Button size="small" variant="outlined" onClick={onAction} sx={{ textTransform: 'none' }}>
        {actionLabel}
      </Button>
    </Box>
  );
}