import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import { FolderOpenIcon, FileTextIcon } from '@phosphor-icons/react';

import type { NginxQuickItem } from './shared';

interface NginxQuickViewProps {
  items: NginxQuickItem[];
  onOpenFile: (path: string) => void;
  onOpenDir: (path: string, name: string) => void;
}

export function NginxQuickView({ items, onOpenFile, onOpenDir }: NginxQuickViewProps) {
  return (
    <Box sx={{ flex: 1, overflowY: 'auto', p: 2.5 }}>
      <Typography variant="h6" sx={{ fontSize: 16, fontWeight: 600, mb: 0.5 }}>
        Nginx 配置
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        快速访问常用的 Nginx 配置文件和目录
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 1.5 }}>
        {items.map((item) => {
          const Icon = item.type === 'dir' ? FolderOpenIcon : FileTextIcon;
          return (
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
              onClick={() => item.type === 'dir' ? onOpenDir(item.path, item.name) : onOpenFile(item.path)}
            >
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                  <Box sx={{
                    width: 36, height: 36, borderRadius: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    bgcolor: item.type === 'dir' ? 'info.lighter' : 'primary.lighter',
                    color: item.type === 'dir' ? 'info.main' : 'primary.main',
                  }}>
                    <Icon size={20} weight="fill" />
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
          );
        })}
      </Box>
    </Box>
  );
}