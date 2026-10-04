import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { CheckCircleIcon, RocketIcon, ClockIcon, HardDriveIcon } from '@phosphor-icons/react';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { DeployOutcome } from '../../../../proto/cms';

interface Props {
  result: DeployOutcome;
  showLog: boolean;
  onToggleLog: () => void;
  onViewService: () => void;
}

export function DeploySuccessSection({ result, showLog, onToggleLog, onViewService }: Props) {
  return (
    <>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 1,
          py: 1,
        }}
      >
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            bgcolor: 'rgba(102, 187, 106, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CheckCircleIcon size={32} weight="fill" color="#66BB6A" />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>部署成功</Typography>
        <Typography variant="caption" color="text.secondary">
          二进制已上传并拉起 · 总耗时 {(result.durationMs / 1000).toFixed(0)} 秒
        </Typography>
      </Box>

      {/* 访问地址 */}
      <Box
        sx={{
          p: 1.5,
          borderRadius: 1.5,
          bgcolor: 'action.hover',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary">访问地址</Typography>
          <Typography
            variant="body2"
            sx={{
              fontFamily: 'monospace',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {result.baseUrl}
          </Typography>
        </Box>
        <Button
          size="small"
          variant="contained"
          startIcon={<RocketIcon size={14} />}
          onClick={() => openUrl(result.baseUrl).catch(() => {})}
        >
          打开
        </Button>
      </Box>

      {/* 统计 */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 1,
        }}
      >
        <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: 'action.hover' }}>
          <Typography variant="caption" color="text.secondary">已上传文件</Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.25 }}>
            {result.uploadedCount} 个
          </Typography>
        </Box>
        <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: 'action.hover' }}>
          <Typography variant="caption" color="text.secondary">传输体积</Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.25 }}>
            {(result.totalBytes / 1024 / 1024).toFixed(1)} MB
          </Typography>
        </Box>
      </Box>

      {/* 快捷操作 */}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<ClockIcon size={14} />}
          onClick={onToggleLog}
          sx={{ flex: 1 }}
        >
          {showLog ? '收起日志' : '部署日志'}
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<HardDriveIcon size={14} />}
          onClick={onViewService}
          sx={{ flex: 1 }}
        >
          查看服务
        </Button>
      </Box>

      {showLog && result.log.length > 0 && (
        <Box
          sx={{
            maxHeight: 160,
            overflow: 'auto',
            bgcolor: '#0F172A',
            borderRadius: 1,
            p: 1.5,
            color: '#E2E8F0',
            fontSize: 10.5,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            lineHeight: 1.5,
          }}
        >
          {result.log.map((line, i) => (
            <Box key={i} sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {line}
            </Box>
          ))}
        </Box>
      )}
    </>
  );
}