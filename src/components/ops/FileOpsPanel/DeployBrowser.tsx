import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import {
  HouseIcon,
  CaretRightIcon,
  ArrowCounterClockwiseIcon,
  FolderIcon,
  FolderOpenIcon,
  FileTextIcon,
} from '@phosphor-icons/react';

import type { RemoteFileItem } from '../../../proto/ops';
import { formatSize } from './shared';

export interface Breadcrumb {
  label: string;
  path: string;
}

interface DeployBrowserProps {
  breadcrumbs: Breadcrumb[];
  loading: boolean;
  fileList: RemoteFileItem[];
  onEnterDir: (item: RemoteFileItem) => void;
  onOpenFile: (path: string) => void;
  onRefresh: () => void;
}

export function DeployBrowser({
  breadcrumbs,
  loading,
  fileList,
  onEnterDir,
  onOpenFile,
  onRefresh,
}: DeployBrowserProps) {
  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* 面包屑 + 工具栏 */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 2.5,
        py: 1.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        flexShrink: 0,
      }}>
        <HouseIcon size={14} color="#666" style={{ flexShrink: 0 }} />
        {breadcrumbs.map((crumb, i) => (
          <Box key={crumb.path} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <CaretRightIcon size={12} color="#999" weight="bold" />
            <Typography
              variant="body2"
              sx={{
                fontSize: 12,
                fontFamily: 'monospace',
                color: i === breadcrumbs.length - 1 ? 'text.primary' : 'text.secondary',
                cursor: 'pointer',
                fontWeight: i === breadcrumbs.length - 1 ? 600 : 400,
                '&:hover': { color: 'primary.main' },
              }}
              onClick={() => {
                if (i === breadcrumbs.length - 1) return;
                onEnterDir({
                  name: crumb.label,
                  path: crumb.path,
                  isDir: true,
                  size: 0, modifiedAt: 0,
                  permissions: '', owner: '', group: '',
                });
              }}
            >
              {crumb.label}
            </Typography>
          </Box>
        ))}
        <Box sx={{ flex: 1 }} />
        <Tooltip title="刷新">
          <IconButton size="small" onClick={onRefresh}>
            <ArrowCounterClockwiseIcon size={15} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* 文件列表 */}
      <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={28} />
          </Box>
        ) : fileList.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
            <FolderOpenIcon size={40} weight="light" />
            <Typography variant="body2" sx={{ mt: 1 }}>目录为空</Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
            {fileList.map((item) => {
              const Icon = item.isDir ? FolderIcon : FileTextIcon;
              return (
                <Box
                  key={item.path}
                  onClick={() => item.isDir ? onEnterDir(item) : onOpenFile(item.path)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    px: 1.5,
                    py: 1,
                    borderRadius: 1,
                    cursor: 'pointer',
                    transition: 'all 0.1s',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <Icon size={16} color={item.isDir ? '#1976d2' : '#666'} />
                  <Box
                    sx={{
                      flex: 1,
                      fontSize: 13,
                      fontFamily: item.isDir ? 'inherit' : 'Menlo, Monaco, Consolas, monospace',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.name}
                  </Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0, fontSize: 11, minWidth: 60, textAlign: 'right' }}>
                    {item.isDir ? '—' : formatSize(item.size)}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
    </Box>
  );
}