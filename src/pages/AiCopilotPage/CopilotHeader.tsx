/**
 * AI Copilot 顶部栏：侧栏开关、智能体头像与名称、当前模型徽标、新建会话。
 * 从 AiCopilotPage/index.tsx 迁出，仅做代码搬迁。
 */
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { RobotIcon, PlusIcon, ListIcon } from '@phosphor-icons/react';
import type { TFunction } from 'i18next';

export function CopilotHeader({
  t,
  agentColor,
  isDark,
  agentName,
  modelName,
  onToggleSidebar,
  onNewChat,
}: {
  t: TFunction;
  agentColor: string;
  isDark: boolean;
  agentName?: string;
  modelName?: string;
  onToggleSidebar: () => void;
  onNewChat: () => void;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 0.75 }}>
      <IconButton size="small" onClick={onToggleSidebar} sx={{ borderRadius: 2, border: `1px solid ${agentColor}30`, color: agentColor }}>
        <ListIcon size={14} weight="bold" />
      </IconButton>
      <Box sx={{
        width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `linear-gradient(135deg, ${agentColor} 0%, ${isDark ? '#0EA5E9' : '#0277BD'} 100%)`,
        color: '#fff', flexShrink: 0,
      }}>
        <RobotIcon size={12} weight="bold" />
      </Box>
      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 13, flex: 1 }}>
        {agentName || 'AI Copilot'}
      </Typography>
      {modelName != null && (
        <Chip label={modelName} size="small" sx={{ height: 18, fontSize: 9 }} />
      )}
      <Tooltip title={t('copilot.new_chat')} arrow>
        <IconButton size="small" onClick={onNewChat} sx={{ borderRadius: 2, border: `1px solid ${agentColor}30` }}>
          <PlusIcon size={14} weight="bold" color={agentColor} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}