import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import {
  CheckCircleIcon,
  XCircleIcon,
  CopyIcon,
  ClockIcon,
  PlayIcon,
} from '@phosphor-icons/react';

import type { OpsScript, RemoteExecResult, OpsScriptRun } from '../../../proto/ops';
import { ScriptParamField } from './primitives';
import { DANGER_COLOR } from './shared';

interface ScriptRunDialogProps {
  activeScript: OpsScript | null;
  scriptRunning: boolean;
  scriptResult: RemoteExecResult | null;
  paramValues: Record<string, string>;
  onParamChange: (name: string, value: string) => void;
  runConfirmed: boolean;
  onConfirm: () => void;
  runDialogTab: number;
  onTabChange: (value: number) => void;
  runHistory: OpsScriptRun[];
  runHistoryLoading: boolean;
  selectedHistoryItem: OpsScriptRun | null;
  onSelectHistoryItem: (item: OpsScriptRun | null) => void;
  onClose: () => void;
  onRun: () => void;
  onCopyText: (text: string) => void;
  onRerunWithParams: (item: OpsScriptRun) => void;
}

export function ScriptRunDialog({
  activeScript,
  scriptRunning,
  scriptResult,
  paramValues,
  onParamChange,
  runConfirmed,
  onConfirm,
  runDialogTab,
  onTabChange,
  runHistory,
  runHistoryLoading,
  selectedHistoryItem,
  onSelectHistoryItem,
  onClose,
  onRun,
  onCopyText,
  onRerunWithParams,
}: ScriptRunDialogProps) {
  return (
    <Dialog
      open={Boolean(activeScript)}
      onClose={() => { if (!scriptRunning) onClose(); }}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {activeScript && (
            <Chip
              label={activeScript.dangerLevel === 'safe' ? '安全' : activeScript.dangerLevel === 'careful' ? '谨慎' : '危险'}
              size="small"
              sx={{
                height: 20,
                fontSize: 10,
                fontWeight: 700,
                bgcolor: `${DANGER_COLOR[activeScript.dangerLevel]}22`,
                color: DANGER_COLOR[activeScript.dangerLevel],
              }}
            />
          )}
          <Typography variant="h6" sx={{ fontWeight: 700 }}>{activeScript?.name}</Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">
          {activeScript?.description}
        </Typography>
      </DialogTitle>

      <Tabs
        value={runDialogTab}
        onChange={(_, v) => onTabChange(v)}
        variant="fullWidth"
        sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 36 }}
      >
        <Tab label="运行" sx={{ minHeight: 36, py: 0.5, fontSize: 13 }} />
        <Tab
          label={`历史 ${runHistory.length > 0 ? `(${runHistory.length})` : ''}`}
          sx={{ minHeight: 36, py: 0.5, fontSize: 13 }}
        />
      </Tabs>

      <DialogContent dividers sx={{ p: 0 }}>
        {runDialogTab === 0 && (
          <Box sx={{ p: 3, pb: 2 }}>
            {activeScript && activeScript.dangerLevel !== 'safe' && !runConfirmed && (
              <Alert severity={activeScript.dangerLevel === 'dangerous' ? 'error' : 'warning'} sx={{ mb: 2 }}>
                {activeScript.dangerLevel === 'dangerous'
                  ? '⚠️ 此为危险级别操作，可能造成数据丢失或服务中断，请确认后再执行'
                  : '此操作为谨慎级别，请确认后再执行'}
              </Alert>
            )}

            {activeScript && activeScript.parameters.length > 0 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Typography variant="overline" color="text.secondary" sx={{ mb: -1 }}>
                  脚本参数
                </Typography>
                {activeScript.parameters.map((p) => (
                  <ScriptParamField
                    key={p.name}
                    param={p}
                    value={paramValues[p.name] ?? ''}
                    onChange={(v) => onParamChange(p.name, v)}
                  />
                ))}
              </Box>
            )}

            {scriptResult && (
              <Box sx={{ mt: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
                <Box sx={{
                  display: 'flex', alignItems: 'center', gap: 1,
                  px: 1.5, py: 1, bgcolor: 'action.hover',
                }}>
                  {scriptResult.success
                    ? <CheckCircleIcon size={18} color="#66BB6A" weight="fill" />
                    : <XCircleIcon size={18} color="#EF5350" weight="fill" />}
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {scriptResult.success ? '执行成功' : '执行失败'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    · 退出码 {scriptResult.exitCode}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    · 用时 {scriptResult.durationMs >= 1000 ? `${(scriptResult.durationMs / 1000).toFixed(1)}s` : `${scriptResult.durationMs}ms`}
                  </Typography>
                </Box>
                <Box sx={{ p: 1.5 }}>
                  {scriptResult.stdout && (
                    <Box sx={{ mb: 1 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">标准输出</Typography>
                        <IconButton
                          size="small"
                          sx={{ p: 0.2 }}
                          onClick={() => onCopyText(scriptResult.stdout)}
                          title="复制输出"
                        >
                          <CopyIcon size={13} />
                        </IconButton>
                      </Box>
                      <pre style={{
                        margin: 0,
                        padding: 10,
                        borderRadius: 6,
                        background: '#0F172A',
                        color: '#E2E8F0',
                        fontSize: 12,
                        lineHeight: 1.5,
                        fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        maxHeight: 280,
                        overflow: 'auto',
                      }}>
                        {scriptResult.stdout}
                      </pre>
                    </Box>
                  )}
                  {scriptResult.stderr && !scriptResult.merged && (
                    <Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">错误输出</Typography>
                        <IconButton
                          size="small"
                          sx={{ p: 0.2 }}
                          onClick={() => onCopyText(scriptResult.stderr)}
                          title="复制错误"
                        >
                          <CopyIcon size={13} />
                        </IconButton>
                      </Box>
                      <pre style={{
                        margin: 0,
                        padding: 10,
                        borderRadius: 6,
                        background: '#450a0a',
                        color: '#fecaca',
                        fontSize: 12,
                        lineHeight: 1.5,
                        fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        maxHeight: 200,
                        overflow: 'auto',
                      }}>
                        {scriptResult.stderr}
                      </pre>
                    </Box>
                  )}
                </Box>
              </Box>
            )}
          </Box>
        )}

        {runDialogTab === 1 && (
          <Box>
            {runHistoryLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress size={24} />
              </Box>
            ) : runHistory.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
                <ClockIcon size={36} weight="light" />
                <Typography variant="body2" sx={{ mt: 1 }}>暂无执行历史</Typography>
              </Box>
            ) : (
              <Box sx={{ maxHeight: 400, overflowY: 'auto' }}>
                {runHistory.map((item, idx) => (
                  <Box key={item.id}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        px: 2,
                        py: 1.25,
                        cursor: 'pointer',
                        bgcolor: selectedHistoryItem?.id === item.id ? 'action.selected' : 'transparent',
                        '&:hover': { bgcolor: 'action.hover' },
                        transition: 'background 0.15s',
                      }}
                      onClick={() => onSelectHistoryItem(selectedHistoryItem?.id === item.id ? null : item)}
                    >
                      {item.status === 'success'
                        ? <CheckCircleIcon size={16} color="#66BB6A" weight="fill" />
                        : <XCircleIcon size={16} color="#EF5350" weight="fill" />}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontSize: 13, fontWeight: 500 }}>
                          {new Date(item.startedAt).toLocaleString('zh-CN', {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {item.connectionName} · 用时 {item.durationMs >= 1000 ? `${(item.durationMs / 1000).toFixed(1)}s` : `${item.durationMs}ms`}
                        </Typography>
                      </Box>
                      <Chip
                        label={item.status === 'success' ? '成功' : '失败'}
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: 10,
                          fontWeight: 600,
                          bgcolor: item.status === 'success' ? '#66BB6A22' : '#EF535022',
                          color: item.status === 'success' ? '#66BB6A' : '#EF5350',
                        }}
                      />
                    </Box>
                    {selectedHistoryItem?.id === item.id && (
                      <Box sx={{ px: 2, pb: 1.5, bgcolor: 'action.hover' }}>
                        {item.stdout && (
                          <Box sx={{ mb: 1 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                              <Typography variant="caption" color="text.secondary">标准输出</Typography>
                              <IconButton
                                size="small"
                                sx={{ p: 0.2 }}
                                onClick={() => onCopyText(item.stdout)}
                              >
                                <CopyIcon size={12} />
                              </IconButton>
                            </Box>
                            <pre style={{
                              margin: 0,
                              padding: 8,
                              borderRadius: 4,
                              background: '#0F172A',
                              color: '#E2E8F0',
                              fontSize: 11,
                              lineHeight: 1.4,
                              fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              maxHeight: 180,
                              overflow: 'auto',
                            }}>
                              {item.stdout}
                            </pre>
                          </Box>
                        )}
                        {item.stderr && !item.merged && (
                          <Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                              <Typography variant="caption" color="text.secondary">错误输出</Typography>
                              <IconButton
                                size="small"
                                sx={{ p: 0.2 }}
                                onClick={() => onCopyText(item.stderr)}
                              >
                                <CopyIcon size={12} />
                              </IconButton>
                            </Box>
                            <pre style={{
                              margin: 0,
                              padding: 8,
                              borderRadius: 4,
                              background: '#450a0a',
                              color: '#fecaca',
                              fontSize: 11,
                              lineHeight: 1.4,
                              fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              maxHeight: 120,
                              overflow: 'auto',
                            }}>
                              {item.stderr}
                            </pre>
                          </Box>
                        )}
                        <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<PlayIcon size={13} />}
                            onClick={() => onRerunWithParams(item)}
                          >
                            用此参数重跑
                          </Button>
                        </Box>
                      </Box>
                    )}
                    {idx < runHistory.length - 1 && <Divider sx={{ mx: 2 }} />}
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button disabled={scriptRunning} onClick={onClose}>
          关闭
        </Button>
        {activeScript && activeScript.dangerLevel !== 'safe' && !runConfirmed ? (
          <Button
            variant="contained"
            color={activeScript.dangerLevel === 'dangerous' ? 'error' : 'warning'}
            onClick={onConfirm}
          >
            确认执行
          </Button>
        ) : (
          <Button
            variant="contained"
            color="success"
            disabled={scriptRunning}
            startIcon={scriptRunning ? <CircularProgress size={16} color="inherit" /> : <PlayIcon size={16} />}
            onClick={onRun}
          >
            {scriptRunning ? '执行中...' : '运行脚本'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}