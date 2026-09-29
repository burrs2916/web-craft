import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import { FileTextIcon } from '@phosphor-icons/react';

import { SYSTEM_QUICK_FILES } from './shared';

interface SystemQuickViewProps {
  onOpenFile: (path: string) => void;
}

export function SystemQuickView({ onOpenFile }: SystemQuickViewProps) {
  return (
    <Box sx={{ flex: 1, overflowY: 'auto', p: 2.5 }}>
      <Typography variant="h6" sx={{ fontSize: 16, fontWeight: 600, mb: 0.5 }}>
        系统文件
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        常用系统配置文件快捷访问
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 1.5 }}>
        {SYSTEM_QUICK_FILES.map((item) => (
          <Card
            key={item.path}
            variant="outlined"
            sx={{
              cursor: 'pointer',
              transition: 'all 0.15s',
              '&:hover': {
                borderColor: 'primary.main',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                transform: 'translateY(-1px)',
              },
            }}
            onClick={() => onOpenFile(item.path)}
          >
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                <Box sx={{
                  width: 36, height: 36, borderRadius: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  bgcolor: 'warning.lighter',
                  color: 'warning.main',
                }}>
                  <FileTextIcon size={20} weight="fill" />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2" sx={{
                    fontSize: 13, fontWeight: 600,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    fontFamily: 'monospace',
                  }}>
                    {item.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {item.desc}
                  </Typography>
                </Box>
              </Box>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  fontFamily: 'monospace',
                  fontSize: 11,
                  color: 'text.secondary',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.path}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
  );
}