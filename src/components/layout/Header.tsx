import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import { SparkleIcon, CrownIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@mui/material/styles';
import { useSettingsStore } from '../../engine';
import { useLicenseStore, useUpgradeDialogStore } from '../../features/licensing';
import { brand } from '../../theme/brand';
import logo from '../../assets/logo.svg?url';

export function Header() {
  const { i18n, t } = useTranslation();
  const theme = useTheme();
  const currentLang = i18n.language?.startsWith('zh') ? 'zh-CN' : 'en-US';
  const isDark = theme.palette.mode === 'dark';
  const licenseStatus = useLicenseStore((s) => s.status);
  const openUpgrade = useUpgradeDialogStore((s) => s.openDialog);

  const toggleLanguage = () => {
    const nextLang = currentLang === 'zh-CN' ? 'en-US' : 'zh-CN';
    useSettingsStore.getState().update('language', nextLang);
    i18n.changeLanguage(nextLang);
  };

  const renderLicenseChip = () => {
    if (!licenseStatus) return null;
    // macOS / Linux 平台：后端返回 isPro=true 但 proUnlockedAt 为空且无 trial 信息，
    // 此时不应显示授权角标，避免用户误以为是付费版。
    const isPlatformFreePro =
      licenseStatus.isPro && !licenseStatus.proUnlockedAt && !licenseStatus.trialStartedAt;
    if (isPlatformFreePro) {
      return null;
    }
    if (licenseStatus.isPro) {
      return (
        <Chip
          icon={<CrownIcon size={14} weight="fill" />}
          label="Pro"
          size="small"
          sx={{
            height: 24,
            fontSize: 11,
            fontWeight: 700,
            background: 'linear-gradient(135deg, #FBBF24 0%, #FFA726 100%)',
            color: '#0E241D',
            '& .MuiChip-icon': { color: '#0E241D', ml: '6px' },
          }}
        />
      );
    }
    if (licenseStatus.isTrial) {
      return (
        <Button
          size="small"
          startIcon={<SparkleIcon size={14} weight="fill" />}
          onClick={() => openUpgrade()}
          sx={{
            height: 24,
            minWidth: 0,
            px: 1.25,
            fontSize: 11,
            fontWeight: 700,
            color: '#fff',
            background: brand.gradient,
            '&:hover': { background: brand.gradientHover },
          }}
        >
          {t('license.header.trialDaysLeft', {
            defaultValue: `Trial · ${licenseStatus.trialDaysRemaining}d`,
            count: licenseStatus.trialDaysRemaining,
          })}
        </Button>
      );
    }
    // Expired or free
    return (
      <Button
        size="small"
        startIcon={<SparkleIcon size={14} weight="fill" />}
        onClick={() => openUpgrade()}
        sx={{
          height: 24,
          minWidth: 0,
          px: 1.25,
          fontSize: 11,
          fontWeight: 700,
          color: '#fff',
          background: 'linear-gradient(135deg, #60A5FA 0%, #38BDF8 100%)',
          '&:hover': { background: 'linear-gradient(135deg, #1D4ED8 0%, #0EA5E9 100%)' },
        }}
      >
        {t('license.header.upgrade', { defaultValue: 'Upgrade' })}
      </Button>
    );
  };

  return (
    <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
      <Toolbar variant="dense" sx={{ gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1 }}>
          <Box
            component="img"
            src={logo}
            alt="WebCraft"
            sx={{
              width: 24,
              height: 24,
              borderRadius: '6px',
              objectFit: 'contain',
              filter: isDark ? 'drop-shadow(0 0 6px rgba(45,212,191,0.35))' : 'none',
            }}
          />
          <Typography variant="h6" noWrap component="div" sx={{ fontSize: 15 }}>
            {t('app.name')}
          </Typography>
        </Box>
        {renderLicenseChip()}
        <Button
          color="inherit"
          size="small"
          onClick={toggleLanguage}
          sx={{
            minWidth: 52,
            fontSize: 12,
            fontWeight: 600,
            border: isDark
              ? '1px solid rgba(255,255,255,0.15)'
              : '1px solid rgba(0,0,0,0.15)',
            borderRadius: 2,
            px: 1.5,
          }}
        >
          {currentLang === 'zh-CN' ? `🌐 ${t('app.lang_en')}` : `🌐 ${t('app.lang_zh')}`}
        </Button>
      </Toolbar>
      {/* 品牌渐变分隔线：松石青 → 天蓝，呼应 Logo 与业务闭环 */}
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 2,
          background: 'linear-gradient(90deg, #60A5FA 0%, #38BDF8 55%, #FBBF24 100%)',
          opacity: isDark ? 0.55 : 0.7,
        }}
      />
    </AppBar>
  );
}
