import Box from '@mui/material/Box';

export function FileTableSkeleton({ isDark }: { isDark: boolean }) {
  return (
    <Box>
      {Array.from({ length: 14 }).map((_, i) => (
        <Box
          key={i}
          sx={{
            height: 34,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1,
            opacity: 0.5,
          }}
        >
          <Box
            sx={{
              width: 16,
              height: 16,
              borderRadius: 1,
              bgcolor: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)',
            }}
          />
          <Box
            sx={{
              width: `${26 + (i % 5) * 9}%`,
              height: 9,
              borderRadius: 2,
              bgcolor: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)',
            }}
          />
        </Box>
      ))}
    </Box>
  );
}