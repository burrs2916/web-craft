import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import { XCircleIcon, InfoIcon } from '@phosphor-icons/react';

interface Props {
  error: string;
}

export function DeployFailedSection({ error }: Props) {
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
            bgcolor: 'rgba(239, 83, 80, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <XCircleIcon size={32} weight="fill" color="#EF5350" />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>部署失败</Typography>
      </Box>

      <Box
        sx={{
          maxHeight: 200,
          overflow: 'auto',
          p: 1.5,
          borderRadius: 1.5,
          bgcolor: 'rgba(239, 83, 80, 0.08)',
          border: 1,
          borderColor: 'error.main',
        }}
      >
        <Typography
          variant="body2"
          sx={{
            whiteSpace: 'pre-wrap',
            fontSize: 12,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            color: 'error.main',
            lineHeight: 1.5,
          }}
        >
          {error}
        </Typography>
      </Box>

      {error.includes('环境未满足') && (
        <Alert severity="info" sx={{ py: 0.5 }} icon={<InfoIcon size={14} />}>
          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 12 }}>
            前往「环境检测」页签，使用 AI 智能修复自动安装依赖
          </Typography>
        </Alert>
      )}

      {error.includes('未找到') && error.includes('二进制') && (
        <Alert severity="info" sx={{ py: 0.5 }} icon={<InfoIcon size={14} />}>
          <Typography variant="body2" sx={{ fontSize: 12 }}>
            请将 webcraft-server 二进制文件放入项目 bin/ 目录
          </Typography>
        </Alert>
      )}
    </>
  );
}