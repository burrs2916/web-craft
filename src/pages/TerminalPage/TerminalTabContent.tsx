import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { TerminalEmulator } from '../../features/terminal';
import type { TerminalEmulatorHandle } from '../../features/terminal';
import { SftpManager } from '../../features/sftp/SftpManager';
import type { Tab } from './types';

interface TerminalTabContentProps {
  tab: Tab;
  onExit: (sessionId: string) => void;
  onTitleChange: (sessionId: string, title: string) => void;
  onFindResultsChange: (resultIndex: number, resultCount: number) => void;
  onReconnect: (tab: Tab) => void;
  setTerminalRef: (id: string, handle: TerminalEmulatorHandle | null) => void;
}

/**
 * 单个标签的内容层：SFTP 标签渲染 SftpManager，终端标签渲染 TerminalEmulator，
 * 并在 SSH 断开时叠加「已断开 / 重连」覆盖层。所有标签同时挂载，仅切换可见性。
 */
export function TerminalTabContent({
  tab,
  onExit,
  onTitleChange,
  onFindResultsChange,
  onReconnect,
  setTerminalRef,
}: TerminalTabContentProps) {
  const { t } = useTranslation('terminal');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isSftp = tab.kind === 'sftp';

  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        visibility: tab.isActive ? 'visible' : 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {isSftp && tab.ssh ? (
        <SftpManager
          ssh={{
            host: tab.ssh.host,
            port: tab.ssh.port,
            username: tab.ssh.username,
            auth_method: tab.ssh.authMethod as 'none' | 'password' | 'private_key',
            private_key_path: tab.ssh.privateKeyPath,
            password: tab.ssh.password,
          }}
        />
      ) : (
        <>
          <TerminalEmulator
            ref={(handle) => {
              if (handle) setTerminalRef(tab.id, handle);
              else setTerminalRef(tab.id, null);
            }}
            sessionId={tab.id}
            onExit={onExit}
            onTitleChange={onTitleChange}
            onFindResultsChange={onFindResultsChange}
            visible={tab.isActive}
            profileId={tab.profileId}
          />
          {tab.disconnected && (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: isDark ? 'rgba(13,17,23,0.85)' : 'rgba(255,255,255,0.85)',
                zIndex: 10,
                gap: 2,
              }}
            >
              <Typography variant="body1" sx={{ color: 'text.secondary' }}>
                {t('disconnected')}
              </Typography>
              <Button
                variant="contained"
                size="small"
                onClick={() => onReconnect(tab)}
              >
                {t('reconnect')}
              </Button>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}