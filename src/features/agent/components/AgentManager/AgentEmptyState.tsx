import { Box, Typography, Paper, Button } from '@mui/material';
import {
  PlusIcon, RobotIcon, IdentificationCardIcon, WrenchIcon, TextAlignLeftIcon,
} from '@phosphor-icons/react';
import type { TFunction } from 'i18next';
import { BRAND, GRADIENT } from './constants';

interface Props {
  hasAgents: boolean;
  onNew: () => void;
  isDark: boolean;
  t: TFunction;
}

/**
 * 右侧空态：无任何智能体时展示三步引导；已有智能体但未选中时展示选择提示。
 */
export function AgentEmptyState({ hasAgents, onNew, isDark, t }: Props) {
  return (
    <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
      {!hasAgents ? (
        <Paper
          variant="outlined"
          sx={{
            maxWidth: 600,
            width: '100%',
            borderRadius: 3,
            overflow: 'hidden',
            borderColor: 'divider',
            bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
          }}
        >
          <Box sx={{ height: 4, background: GRADIENT }} />
          <Box sx={{ p: { xs: 3, sm: 4 }, textAlign: 'center' }}>
            <Box sx={{ width: 72, height: 72, borderRadius: '50%', background: GRADIENT, display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2, boxShadow: '0 6px 20px rgba(45,212,191,0.35)' }}>
              <RobotIcon size={36} weight="bold" color="#fff" />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 20 }}>
              {t('agent.guide_title')}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1, maxWidth: 480, mx: 'auto', lineHeight: 1.7 }}>
              {t('agent.guide_subtitle')}
            </Typography>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2, mt: 3, textAlign: 'left' }}>
              {[
                { icon: <IdentificationCardIcon size={20} color={BRAND} />, title: t('agent.guide_step1_title'), desc: t('agent.guide_step1_desc') },
                { icon: <WrenchIcon size={20} color={BRAND} />, title: t('agent.guide_step2_title'), desc: t('agent.guide_step2_desc') },
                { icon: <TextAlignLeftIcon size={20} color={BRAND} />, title: t('agent.guide_step3_title'), desc: t('agent.guide_step3_desc') },
              ].map((step, i) => (
                <Box key={i} sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.8 }}>
                    <Box sx={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(45,212,191,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {step.icon}
                    </Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: 13 }}>
                      {step.title}
                    </Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 11, lineHeight: 1.5 }}>
                    {step.desc}
                  </Typography>
                </Box>
              ))}
            </Box>

            <Button
              variant="contained"
              startIcon={<PlusIcon size={18} weight="bold" />}
              onClick={onNew}
              sx={{ mt: 3, textTransform: 'none', background: GRADIENT, fontSize: 14, px: 3, py: 1, '&:hover': { boxShadow: '0 4px 14px rgba(45,212,191,0.4)' } }}
            >
              {t('agent.new_agent')}
            </Button>
          </Box>
        </Paper>
      ) : (
        <Paper
          variant="outlined"
          sx={{
            maxWidth: 420,
            width: '100%',
            borderRadius: 3,
            p: { xs: 3, sm: 4 },
            textAlign: 'center',
            borderColor: 'divider',
            bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
          }}
        >
          <Box sx={{ width: 64, height: 64, borderRadius: '50%', background: GRADIENT, display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2, boxShadow: '0 6px 20px rgba(45,212,191,0.3)' }}>
            <RobotIcon size={32} weight="bold" color="#fff" />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 18 }}>
            {t('agent.empty_hint_title')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1, lineHeight: 1.7 }}>
            {t('agent.empty_hint_desc')}
          </Typography>
        </Paper>
      )}
    </Box>
  );
}