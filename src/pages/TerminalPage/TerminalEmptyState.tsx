import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { PlusIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { ConnectionPicker } from '../../features/terminal';
import type { ConnectionPickerResult } from '../../features/terminal';

interface TerminalEmptyStateProps {
  pickerOpen: boolean;
  onConnect: (result: ConnectionPickerResult) => void;
  onClosePicker: () => void;
  onNewTerminal: () => void;
}

/** 无标签时的欢迎页：品牌标识、新建终端按钮与快捷键提示。 */
export function TerminalEmptyState({ pickerOpen, onConnect, onClosePicker, onNewTerminal }: TerminalEmptyStateProps) {
  const { t } = useTranslation('terminal');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          bgcolor: 'background.default',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: isDark
              ? 'radial-gradient(circle at 50% 30%, rgba(45,212,191,0.06) 0%, transparent 60%)'
              : 'radial-gradient(circle at 50% 30%, rgba(15,118,110,0.04) 0%, transparent 60%)',
          },
        }}
      >
        <Box
          sx={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            px: 3,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: isDark
                ? 'rgba(45,212,191,0.08)'
                : 'rgba(15,118,110,0.05)',
              border: '1px solid',
              borderColor: isDark ? 'rgba(45,212,191,0.15)' : 'rgba(15,118,110,0.1)',
            }}
          >
            <Typography
              sx={{
                fontFamily: '"Fira Code", "JetBrains Mono", "Cascadia Code", ui-monospace, monospace',
                fontSize: '2.5rem',
                fontWeight: 700,
                lineHeight: 1,
                background: isDark
                  ? 'linear-gradient(135deg, #60A5FA, #38BDF8)'
                  : 'linear-gradient(135deg, #1D4ED8, #0369A1)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                filter: isDark
                  ? 'drop-shadow(0 0 12px rgba(45,212,191,0.4))'
                  : 'drop-shadow(0 0 8px rgba(15,118,110,0.3))',
              }}
            >
              {`>_`}
            </Typography>
          </Box>

          <Box sx={{ textAlign: 'center', maxWidth: 500 }}>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 700,
                mb: 2,
                background: isDark
                  ? 'linear-gradient(135deg, #60A5FA 0%, #93C5FD 50%, #38BDF8 100%)'
                  : 'linear-gradient(135deg, #1D4ED8 0%, #3B82F6 50%, #0369A1 100%)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {t('page.welcome')}
            </Typography>
            <Typography
              variant="body1"
              color="text.secondary"
              sx={{
                lineHeight: 1.8,
                fontSize: '1.1rem',
              }}
            >
              {t('page.welcome_desc')}
            </Typography>
          </Box>

          <Box
            onClick={onNewTerminal}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              px: 4,
              py: 2,
              borderRadius: 3,
              background: isDark
                ? 'linear-gradient(135deg, #60A5FA 0%, #93C5FD 100%)'
                : 'linear-gradient(135deg, #1D4ED8 0%, #3B82F6 100%)',
              color: '#fff',
              fontWeight: 600,
              fontSize: '1.1rem',
              cursor: 'pointer',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: isDark
                ? '0 4px 20px rgba(45,212,191,0.3)'
                : '0 4px 20px rgba(15,118,110,0.25)',
              '&:hover': {
                transform: 'translateY(-3px) scale(1.02)',
                boxShadow: isDark
                  ? '0 12px 40px rgba(45,212,191,0.4)'
                  : '0 12px 40px rgba(15,118,110,0.35)',
              },
              '&:active': {
                transform: 'translateY(-1px) scale(0.98)',
              },
            }}
          >
            <PlusIcon size={20} weight="bold" />
            {t('page.new_terminal')}
          </Box>

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 2,
              py: 1,
              borderRadius: 2,
              bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              border: '1px solid',
              borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
            }}
          >
            <Typography variant="caption" color="text.secondary">
              {t('page.shortcut_hint')}
            </Typography>
          </Box>
        </Box>
      </Box>

      <ConnectionPicker
        open={pickerOpen}
        onConnect={onConnect}
        onClose={onClosePicker}
      />
    </Box>
  );
}