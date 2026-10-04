import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import {
  ClockIcon,
  XCircleIcon,
  TrashIcon,
  DotsThreeVerticalIcon,
  ArrowsClockwiseIcon,
} from '@phosphor-icons/react';

interface Props {
  deploymentsCount: number;
  total: number;
  selectedCount: number;
  loading: boolean;
  menuAnchor: HTMLElement | null;
  setMenuAnchor: (el: HTMLElement | null) => void;
  onDeleteBatch: () => void;
  onCleanup: () => void;
  onDeleteFailed: () => void;
  onRefresh: () => void;
}

export function HistoryToolbar({
  deploymentsCount,
  total,
  selectedCount,
  loading,
  menuAnchor,
  setMenuAnchor,
  onDeleteBatch,
  onCleanup,
  onDeleteFailed,
  onRefresh,
}: Props) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
        <ClockIcon size={16} style={{ verticalAlign: -3, marginRight: 6 }} />
        部署历史
        {deploymentsCount > 0 && (
          <Chip
            size="small"
            label={total}
            sx={{ ml: 1, height: 18, fontSize: 10, fontWeight: 600, bgcolor: 'action.hover' }}
          />
        )}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {selectedCount > 0 && (
          <Chip
            size="small"
            label={`已选 ${selectedCount} 条`}
            color="primary"
            variant="outlined"
            sx={{ height: 24, fontSize: 11, fontWeight: 500 }}
          />
        )}
        <Button
          size="small"
          variant="text"
          startIcon={<TrashIcon size={14} />}
          onClick={onDeleteBatch}
          disabled={selectedCount === 0}
          color="error"
        >
          删除选中
        </Button>
        <Button
          size="small"
          variant="text"
          endIcon={<DotsThreeVerticalIcon size={14} />}
          onClick={(e) => setMenuAnchor(e.currentTarget)}
        >
          更多操作
        </Button>
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <MenuItem onClick={onCleanup}>
            <ListItemIcon sx={{ minWidth: 32 }}>
              <TrashIcon size={15} />
            </ListItemIcon>
            <ListItemText primary="清理旧记录" secondary="保留最近 N 条" />
          </MenuItem>
          <MenuItem onClick={onDeleteFailed}>
            <ListItemIcon sx={{ minWidth: 32 }}>
              <XCircleIcon size={15} />
            </ListItemIcon>
            <ListItemText primary="清理失败记录" secondary="删除所有失败的部署" />
          </MenuItem>
        </Menu>
        <Button
          size="small"
          variant="text"
          startIcon={loading ? <CircularProgress size={14} thickness={3} /> : <ArrowsClockwiseIcon size={14} />}
          onClick={onRefresh}
          disabled={loading}
        >
          刷新
        </Button>
      </Box>
    </Box>
  );
}