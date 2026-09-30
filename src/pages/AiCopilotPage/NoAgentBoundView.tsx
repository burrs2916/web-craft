/**
 * 未绑定智能体（或绑定已失效）时的占位页。
 * 从 AiCopilotPage/index.tsx 迁出，仅做代码搬迁。
 */
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { SparkleIcon } from '@phosphor-icons/react';
import type { TFunction } from 'i18next';

export function NoAgentBoundView({ t, missing }: { t: TFunction; missing: boolean }) {
  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, p: 3, bgcolor: 'background.default' }}>
      <SparkleIcon size={48} weight="duotone" color="#60A5FA" />
      <Typography variant="body1" sx={{ fontWeight: 600, textAlign: 'center' }}>
        {missing ? t('copilot.agent_missing') : t('copilot.no_agent_bound')}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', maxWidth: 320, lineHeight: 1.6 }}>
        {missing ? t('copilot.agent_missing_desc') : t('copilot.no_agent_bound_desc')}
      </Typography>
    </Box>
  );
}