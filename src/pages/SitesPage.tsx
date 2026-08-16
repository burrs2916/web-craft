import { Box, Typography, Paper } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { GlobeHemisphereWestIcon } from '@phosphor-icons/react';

/// CMS 站点页骨架（PRD M0：导航骨架）。
/// M1 接入 site_list 数据后，此空态替换为站点列表（FR-S2）。
export function SitesPage() {
  const { t } = useTranslation('cms');

  return (
    <Box sx={{ p: 3, maxWidth: 960, width: '100%' }}>
      <Typography variant="h5" sx={{ mb: 0.5, fontWeight: 700 }}>
        {t('sites.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t('sites.subtitle')}
      </Typography>

      <Paper
        variant="outlined"
        sx={{
          p: 6,
          textAlign: 'center',
          borderStyle: 'dashed',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <GlobeHemisphereWestIcon size={44} weight="thin" color="text.secondary" />
        <Typography sx={{ fontWeight: 600 }}>{t('sites.empty_title')}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
          {t('sites.empty_hint')}
        </Typography>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            mt: 1.5,
            color: 'text.secondary',
            '& svg': { verticalAlign: 'middle' },
          }}
        >
          <Typography variant="caption">{t('sites.step_create')}</Typography>
          <Typography variant="caption">{t('sites.step_separator')}</Typography>
          <Typography variant="caption">{t('sites.step_build')}</Typography>
          <Typography variant="caption">{t('sites.step_separator')}</Typography>
          <Typography variant="caption">{t('sites.step_deploy')}</Typography>
        </Box>
      </Paper>
    </Box>
  );
}
