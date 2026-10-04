// ChatComponents 拆分：流式工具调用卡片（ToolCallDisplay -> 卡片）
// 主文件 ChatComponents.tsx 再导出 ToolCallCard 以保持 import 路径不变。
import { useState } from 'react';
import {
  Box, Paper, Typography, CircularProgress, Collapse, Tooltip,
} from '@mui/material';
import {
  Terminal, Wrench, Package,
  Sparkle,
} from '@phosphor-icons/react';
import {
  ToolCallDisplay,
  formatDuration,
  formatDurationShort,
} from './chatTypes';

export function ToolCallCard({ toolCall }: { toolCall: ToolCallDisplay }) {
  const [expanded, setExpanded] = useState(false);
  const isStreaming = toolCall.status === 'streaming';
  const isRunning = toolCall.status === 'running';
  const isDenied = toolCall.status === 'denied';
  const isSuccess = toolCall.success === true;
  const isPluginManager = toolCall.toolName === 'plugin_manager';

  const toolIcon = toolCall.toolName === 'terminal' ? (
    <Terminal size={14} weight="bold" />
  ) : isPluginManager ? (
    <Package size={14} weight="bold" />
  ) : (
    <Wrench size={14} weight="bold" />
  );

  const statusLabel = isStreaming ? '✨ Generating...' : isRunning ? '⏳ Running' : isDenied ? '⊘ Denied' : isSuccess ? '✓ Done' : '✗ Failed';

  const getActionLabel = () => {
    if (!isPluginManager || !toolCall.arguments) return null;
    const action = toolCall.arguments.action as string;
    if (!action) return null;
    const labels: Record<string, string> = {
      get: 'Reading plugin',
      create: 'Creating plugin',
      refine: 'Refining plugin',
      test: 'Testing plugin',
      delete: 'Deleting plugin',
      list: 'Listing plugins',
      toggle: 'Toggling plugin',
    };
    return labels[action] || action;
  };

  const actionLabel = getActionLabel();

  return (
    <Paper variant="outlined" sx={{
      mb: 0.5, borderRadius: 1.5, overflow: 'hidden',
      borderColor: isStreaming ? 'rgba(103,184,255,0.4)' : isRunning ? 'rgba(255,183,77,0.4)' : isDenied ? 'rgba(255,152,0,0.4)' : isSuccess ? 'rgba(129,199,132,0.4)' : 'rgba(255,123,114,0.4)',
      bgcolor: isStreaming ? 'rgba(103,184,255,0.06)' : isRunning ? 'rgba(255,183,77,0.06)' : isDenied ? 'rgba(255,152,0,0.06)' : isSuccess ? 'rgba(129,199,132,0.06)' : 'rgba(255,123,114,0.06)',
    }}>
      <Box
        sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.5, cursor: 'pointer', fontSize: 12 }}
        onClick={() => setExpanded(!expanded)}
      >
        {isStreaming ? (
          <Sparkle size={12} weight="fill" style={{ color: '#67B8FF' }} />
        ) : isRunning ? (
          <CircularProgress size={12} sx={{ color: '#FFB74D' }} />
        ) : isDenied ? (
          <Box sx={{ color: '#FF9800', display: 'flex' }}>⊘</Box>
        ) : isSuccess ? (
          <Box sx={{ color: '#81C784', display: 'flex' }}>✓</Box>
        ) : (
          <Box sx={{ color: '#FF7B72', display: 'flex' }}>✗</Box>
        )}
        <Box sx={{ color: 'text.secondary', display: 'flex' }}>{toolIcon}</Box>
        <Typography variant="caption" sx={{ fontWeight: 600, flex: 1 }}>
          {actionLabel ? `${actionLabel}...` : toolCall.toolName}
        </Typography>
        {toolCall.arguments && toolCall.toolName === 'terminal' && typeof toolCall.arguments.command === 'string' && (
          <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
            {toolCall.arguments.command}
          </Typography>
        )}
        {isPluginManager && toolCall.arguments && 'name' in toolCall.arguments && toolCall.arguments.name != null && (
          <Typography variant="caption" sx={{ color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>
            {String(toolCall.arguments.name)}
          </Typography>
        )}
        <Typography variant="caption" sx={{ color: isStreaming ? '#67B8FF' : isRunning ? '#FFB74D' : 'text.secondary', fontSize: 10 }}>
          {(isStreaming || isRunning) ? statusLabel : '▼'}
        </Typography>
        {toolCall.durationMs != null && toolCall.durationMs > 0 && (
          <Tooltip title={`执行耗时: ${formatDuration(toolCall.durationMs)}`}>
            <Typography variant="caption" sx={{
              color: 'text.disabled', fontSize: 10, fontFamily: 'monospace',
              ml: 0.5, cursor: 'help',
            }}>
              {formatDurationShort(toolCall.durationMs)}
            </Typography>
          </Tooltip>
        )}
      </Box>
      <Collapse in={expanded}>
        <Box sx={{ px: 1, pb: 0.75, borderTop: '1px solid', borderColor: 'divider' }}>
          {toolCall.arguments && (
            <Box sx={{ mt: 0.5 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10 }}>
                {toolCall.toolName === 'terminal' ? 'Command' : 'Arguments'}
              </Typography>
              <Box sx={{
                fontFamily: 'monospace', fontSize: 11, bgcolor: 'rgba(0,0,0,0.2)',
                p: 0.5, borderRadius: 1, mt: 0.25, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 120, overflow: 'auto',
              }}>
                {toolCall.toolName === 'terminal' && toolCall.arguments.command
                  ? String(toolCall.arguments.command)
                  : JSON.stringify(toolCall.arguments, null, 2)}
              </Box>
            </Box>
          )}
          {toolCall.result && (
            <Box sx={{ mt: 0.5 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10 }}>Output</Typography>
              <Box sx={{
                fontFamily: 'monospace', fontSize: 11, bgcolor: 'rgba(0,0,0,0.2)',
                p: 0.5, borderRadius: 1, mt: 0.25, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflow: 'auto',
                color: isSuccess ? '#81C784' : '#FF7B72',
              }}>
                {toolCall.result.length > 500 ? toolCall.result.slice(0, 500) + '...' : toolCall.result}
              </Box>
            </Box>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}
