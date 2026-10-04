import { Box, Typography } from '@mui/material';
import { Robot, Sparkle } from '@phosphor-icons/react';
import { useTheme } from '@mui/material/styles';
import type { TFunction } from 'i18next';

interface Props {
  type: 'no_agent' | 'no_messages';
  t: TFunction;
  agentColor: string;
}

export function AgentChatEmptyState({ type, t, agentColor }: Props) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const userColor = isDark ? '#60A5FA' : '#1D4ED8';

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.5, px: 3, opacity: 0.6 }}>
      <Box sx={{
        width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: type === 'no_agent' ? `${agentColor}12` : `${userColor}12`, mb: 0.5,
      }}>
        {type === 'no_agent' ? (
          <Robot size={28} weight="duotone" color={agentColor} />
        ) : (
          <Sparkle size={28} weight="duotone" color={userColor} />
        )}
      </Box>
      <Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'center', fontSize: 14 }}>
        {type === 'no_agent' ? t('chat.select_agent_placeholder') : t('chat.start_conversation')}
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'center', maxWidth: 240 }}>
        {type === 'no_agent' ? 'Select an agent from the dropdown above, or create one in the Agent Manager tab' : t('chat.input_placeholder')}
      </Typography>
    </Box>
  );
}