import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Card from '@mui/material/Card';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TablePagination from '@mui/material/TablePagination';
import Checkbox from '@mui/material/Checkbox';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ArrowCounterClockwiseIcon,
  EyeIcon,
  TrashIcon,
  DotsThreeVerticalIcon,
  ArrowsClockwiseIcon,
} from '@phosphor-icons/react';
import type { Deployment, Site } from '../../../proto/cms';
import {
  STATUS_COLOR,
  STATUS_LABEL,
  MODE_LABEL,
  TRIGGER_LABEL,
  formatBytes,
  formatDuration,
  formatTime,
  formatRelativeTime,
  type ContinuityOverview,
  type TriggerCounts,
  type TriggerFilter,
} from './shared';
import { ContinuityStat } from './primitives';

export interface DeployHistorySectionProps {
  deployments: Deployment[];
  total: number;
  loading: boolean;
  error: string;
  selectedIds: Set<string>;
  menuAnchor: HTMLElement | null;
  setMenuAnchor: (el: HTMLElement | null) => void;
  continuityOverview: ContinuityOverview;
  triggerCounts: TriggerCounts;
  triggerFilter: TriggerFilter;
  onTriggerFilterChange: (t: TriggerFilter) => void;
  filteredDeployments: Deployment[];
  pagedDeployments: Deployment[];
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  allSelected: boolean;
  someSelected: boolean;
  siteMap: Record<string, Site>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onDeleteBatch: () => void;
  onCleanup: () => void;
  onDeleteFailed: () => void;
  onRefresh: () => void;
  onViewDetail: (d: Deployment) => void;
  onRollback: (deploymentId: string, siteId: string) => void;
  onDeleteSingle: (id: string) => void;
}

export function DeployHistorySection({
  deployments,
  total,
  loading,
  error,
  selectedIds,
  menuAnchor,
  setMenuAnchor,
  continuityOverview,
  triggerCounts,
  triggerFilter,
  onTriggerFilterChange,
  filteredDeployments,
  pagedDeployments,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  allSelected,
  someSelected,
  siteMap,
  onToggleSelect,
  onToggleSelectAll,
  onDeleteBatch,
  onCleanup,
  onDeleteFailed,
  onRefresh,
  onViewDetail,
  onRollback,
  onDeleteSingle,
}: DeployHistorySectionProps) {
  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
          <ClockIcon size={16} style={{ verticalAlign: -3, marginRight: 6 }} />
          部署历史
          {deployments.length > 0 && (
            <Chip
              size="small"
              label={total}
              sx={{ ml: 1, height: 18, fontSize: 10, fontWeight: 600, bgcolor: 'action.hover' }}
            />
          )}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {selectedIds.size > 0 && (
            <Chip
              size="small"
              label={`已选 ${selectedIds.size} 条`}
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
            disabled={selectedIds.size === 0}
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

      {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}

      {/* 部署「工作连续性」概览（基于 backend 真实全量统计，覆盖所有历史）：成功率 / 自动化占比 / 连续成功 / 最近一次部署(含手动) / 最近一次自动部署 */}
      {continuityOverview.total > 0 && (
        <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}>
          <ContinuityStat
            icon={
              <CheckCircleIcon
                size={18}
                weight="fill"
                color={continuityOverview.successRate >= 80 ? '#66BB6A' : continuityOverview.successRate >= 50 ? '#FFA726' : '#EF5350'}
              />
            }
            label="部署成功率"
            value={`${continuityOverview.successRate}%`}
            hint={`${continuityOverview.successCount} 成功 · ${continuityOverview.failedCount} 失败 · 共 ${continuityOverview.total} 次`}
          />
          <ContinuityStat
            icon={<ArrowsClockwiseIcon size={18} weight="fill" color="#42A5F5" />}
            label="自动化部署占比"
            value={`${continuityOverview.autoRatio}%`}
            hint={`${continuityOverview.scheduledCount} 次定时/启动自动部署`}
          />
          <ContinuityStat
            icon={<CheckCircleIcon size={18} weight="fill" color={continuityOverview.consecutiveSuccess > 0 ? '#66BB6A' : '#EF5350'} />}
            label="连续成功"
            value={`${continuityOverview.consecutiveSuccess} 次`}
            hint={continuityOverview.consecutiveSuccess > 0 ? '最近部署连续成功，链路健康' : '最近一次部署未成功'}
          />
          <ContinuityStat
            icon={<ClockIcon size={18} weight="fill" color="#26A69A" />}
            label="最近一次部署"
            value={formatRelativeTime(continuityOverview.lastDeployedAt)}
            hint={
              continuityOverview.lastDeployedAt
                ? new Date(continuityOverview.lastDeployedAt).toLocaleString()
                : '尚无部署记录'
            }
          />
          <ContinuityStat
            icon={<ClockIcon size={18} weight="fill" color="#AB47BC" />}
            label="最近一次自动部署"
            value={formatRelativeTime(continuityOverview.lastScheduledAt)}
            hint={
              continuityOverview.lastScheduledAt
                ? new Date(continuityOverview.lastScheduledAt).toLocaleString()
                : '尚未触发自动化部署'
            }
          />
        </Box>
      )}

      {/* 部署历史运维筛选：按触发方式分组，突出自动化部署（工作连续性） */}
      <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
        {(['all', 'manual', 'scheduled', 'rollback'] as const).map((t) => {
          const label = t === 'all' ? '全部' : TRIGGER_LABEL[t];
          const count = t === 'all' ? triggerCounts.all : triggerCounts[t];
          const active = triggerFilter === t;
          return (
            <Chip
              key={t}
              label={`${label} ${count}`}
              size="small"
              clickable
              onClick={() => onTriggerFilterChange(t)}
              sx={{
                height: 24,
                fontSize: 11,
                fontWeight: active ? 700 : 500,
                borderRadius: '12px',
                cursor: 'pointer',
                bgcolor: active ? 'primary.main' : 'action.hover',
                color: active ? 'primary.contrastText' : 'text.secondary',
                border: 'none',
                '&:hover': { bgcolor: active ? 'primary.main' : 'action.selected' },
              }}
            />
          );
        })}
      </Box>

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
    </Box>
  );
}