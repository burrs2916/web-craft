import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Card from '@mui/material/Card';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TablePagination from '@mui/material/TablePagination';
import Checkbox from '@mui/material/Checkbox';
import {
  ClockIcon,
  ArrowCounterClockwiseIcon,
  EyeIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import type { Deployment, Site } from '../../../../proto/cms';
import {
  STATUS_COLOR,
  STATUS_LABEL,
  MODE_LABEL,
  TRIGGER_LABEL,
  formatBytes,
  formatDuration,
  formatTime,
} from '../shared';

interface Props {
  loading: boolean;
  filteredDeployments: Deployment[];
  pagedDeployments: Deployment[];
  siteMap: Record<string, Site>;
  selectedIds: Set<string>;
  allSelected: boolean;
  someSelected: boolean;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onViewDetail: (d: Deployment) => void;
  onRollback: (deploymentId: string, siteId: string) => void;
  onDeleteSingle: (id: string) => void;
}

export function HistoryTable({
  loading,
  filteredDeployments,
  pagedDeployments,
  siteMap,
  selectedIds,
  allSelected,
  someSelected,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onToggleSelect,
  onToggleSelectAll,
  onViewDetail,
  onRollback,
  onDeleteSingle,
}: Props) {
  return (
    <Card variant="outlined" sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 1.5 }}>
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <Table size="small" stickyHeader sx={{ '& .MuiTableCell-head': { bgcolor: 'action.hover', fontWeight: 600, fontSize: 11, py: 1.5 } }}>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" sx={{ borderBottom: '1px solid', borderColor: 'divider', width: 40 }}>
                <Checkbox
                  size="small"
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={onToggleSelectAll}
                  disabled={pagedDeployments.length === 0}
                  sx={{ p: 0.5 }}
                />
              </TableCell>
              <TableCell sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>站点</TableCell>
              <TableCell sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>模式</TableCell>
              <TableCell sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>触发方式</TableCell>
              <TableCell sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>状态</TableCell>
              <TableCell sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>版本</TableCell>
              <TableCell sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>大小</TableCell>
              <TableCell sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>耗时</TableCell>
              <TableCell sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>开始时间</TableCell>
              <TableCell align="center" sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} align="center" sx={{ py: 6 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
                    <CircularProgress size={28} thickness={2.5} />
                    <Typography variant="body2" color="text.secondary">加载部署记录中...</Typography>
                  </Box>
                </TableCell>
              </TableRow>
            ) : filteredDeployments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} align="center" sx={{ py: 6 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{
                        width: 48,
                        height: 48,
                        borderRadius: '50%',
                        bgcolor: 'action.hover',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <ClockIcon size={22} weight="light" color="#94A3B8" />
                    </Box>
                    <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary' }}>
                      暂无部署记录
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>
                      点击服务卡片上的「部署」按钮开始你的第一次部署
                    </Typography>
                  </Box>
                </TableCell>
              </TableRow>
            ) : (
              pagedDeployments.map((d) => {
                const site = siteMap[d.siteId];
                return (
                  <TableRow
                    key={d.id}
                    hover
                    selected={selectedIds.has(d.id)}
                    sx={{
                      transition: 'background-color 0.15s ease',
                      '&:last-child td': { borderBottom: 'none' },
                    }}
                  >
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={selectedIds.has(d.id)}
                        onChange={() => onToggleSelect(d.id)}
                        sx={{ p: 0.5 }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 500, fontSize: 12 }} noWrap>
                        {site?.name || d.siteId.slice(0, 8)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={MODE_LABEL[d.mode] || d.mode}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: 10,
                          fontWeight: 500,
                          borderRadius: '10px',
                          bgcolor: 'action.hover',
                          border: 'none',
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: 12, color: 'text.secondary' }}>
                        {TRIGGER_LABEL[d.triggerType] || d.triggerType}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={STATUS_LABEL[d.status] || d.status}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: 10,
                          fontWeight: 600,
                          borderRadius: '10px',
                          bgcolor: `${STATUS_COLOR[d.status] || '#94A3B8'}18`,
                          color: STATUS_COLOR[d.status] || '#94A3B8',
                          border: 'none',
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{ fontSize: 11, fontFamily: 'monospace', color: 'text.secondary' }}
                        noWrap
                      >
                        {d.serverVersion || d.versionDir?.slice(0, 20) || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: 12 }}>
                        {formatBytes(d.totalBytes)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: 12 }}>
                        {formatDuration(d.durationMs)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: 11, color: 'text.secondary' }} noWrap>
                        {formatTime(d.startedAt)}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', gap: 0.25, justifyContent: 'center' }}>
                        <Tooltip title="查看详情" placement="top">
                          <IconButton
                            size="small"
                            onClick={() => onViewDetail(d)}
                            sx={{ transition: 'all 0.15s', '&:hover': { transform: 'scale(1.1)' } }}
                          >
                            <EyeIcon size={14} />
                          </IconButton>
                        </Tooltip>
                        {d.status === 'success' && d.versionDir && (
                          <Tooltip title="回滚到此版本" placement="top">
                            <IconButton
                              size="small"
                              color="warning"
                              onClick={() => onRollback(d.id, d.siteId)}
                              sx={{ transition: 'all 0.15s', '&:hover': { transform: 'scale(1.1)' } }}
                            >
                              <ArrowCounterClockwiseIcon size={14} />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="删除记录" placement="top">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => onDeleteSingle(d.id)}
                            sx={{ transition: 'all 0.15s', '&:hover': { transform: 'scale(1.1)' } }}
                          >
                            <TrashIcon size={14} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Box>
      <TablePagination
        component="div"
        count={filteredDeployments.length}
        page={page}
        onPageChange={(_, p) => onPageChange(p)}
        rowsPerPage={pageSize}
        onRowsPerPageChange={(e) => onPageSizeChange(Number(e.target.value))}
        rowsPerPageOptions={[10, 20, 50]}
        sx={{ borderTop: '1px solid', borderColor: 'divider' }}
      />
    </Card>
  );
}