import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import { useTheme } from '@mui/material/styles';
import {
  PlusIcon,
} from '@phosphor-icons/react';
import {
  TerminalEmulator,
  TerminalToolbar,
  TerminalStatusBar,
  ConnectionPicker,
  TerminalContextMenu,
  FindBar,
} from '../features/terminal';
import type { TerminalEmulatorHandle, ConnectionPickerResult } from '../features/terminal';
import { TabBar } from '../features/session';
import { SftpManager } from '../features/sftp/SftpManager';
import { CommandPalette } from '../features/command';
import { spawnTerminal, killTerminal, writeToTerminal, getTerminalCwd } from '../core/services/terminal.service';
import { copyText, pasteText } from '../core/services/clipboard.service';
import { parseCommand } from '../core/services/command.service';
import { generateId } from '../core/utils';
import type { PtyConfig } from '../proto';
import { openAiCopilotWindow, openRemoteDesktopWindow } from '../core/services/window.service';
import { useConnectIntent } from '../features/terminal/connectIntent';
import { readPersistedTabs, savePersistedTabs, tabToPersisted, canAutoRestore } from '../features/terminal/sessionPersistence';
import { localizeBackendError } from '../core/backendError';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useSettingsStore } from '../engine';
import { useNotify } from '../core/notification';
import { useTranslation } from 'react-i18next';
import { useLicenseStore } from '../features/licensing/licenseStore';
import { useUpgradeDialogStore } from '../features/licensing/upgradeDialogStore';
import type { ProFeature } from '../proto/licensing';

interface Tab {
  id: string;
  kind: 'terminal' | 'sftp';
  title: string;
  isActive: boolean;
  connectionType: 'local' | 'ssh';
  ssh?: { host: string; port: number; username: string; authMethod: string; privateKeyPath?: string; password?: string };
  disconnected?: boolean;
  profileId?: string;
  /** 来自既有 SSH 连接的 id，用于在连接管理页标记"使用中" */
  connectionId?: string;
}

export function TerminalPage() {
  const { t } = useTranslation('terminal');
  const { t: tCommon } = useTranslation('common');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [, setFindQuery] = useState('');
  const [findResultCount, setFindResultCount] = useState<{ resultIndex: number; resultCount: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number; hasSelection: boolean } | null>(null);
  const [activeCwd, setActiveCwd] = useState<string | null>(null);
  const tabsRef = useRef<Tab[]>([]);
  const navigate = useNavigate();
  const terminalRefs = useRef<Map<string, TerminalEmulatorHandle>>(new Map());
  tabsRef.current = tabs;

  const shell = useSettingsStore((s) => s.settings.shell);
  const confirmBeforeClose = useSettingsStore((s) => s.settings.confirmBeforeClose);
  const notify = useNotify().notify;

  // —— 跨重启恢复：仅在首次挂载时执行一次 ——
  const [hydrated, setHydrated] = useState(false);
  const hydrateRef = useRef(false);
  useEffect(() => {
    if (hydrateRef.current) return;
    hydrateRef.current = true;

    if (!useSettingsStore.getState().settings.restoreTabsOnStartup) {
      setHydrated(true);
      return;
    }

    const persisted = readPersistedTabs();
    const size = estimateTerminalSize();
    const restored: Tab[] = [];
    let activeAssigned = false;

    for (const p of persisted) {
      // 密码认证的 SSH 会话因密码永不落盘，无法安全自动重连，跳过
      if (!canAutoRestore(p)) continue;

      const id = generateId();
      const isSftp = p.kind === 'sftp';

      if (!isSftp) {
        const config: PtyConfig = {
          rows: size.rows,
          cols: size.cols,
          shell: useSettingsStore.getState().settings.shell,
          connection_type: p.connectionType,
          ssh: p.ssh
            ? {
                host: p.ssh.host,
                port: p.ssh.port,
                username: p.ssh.username,
                auth_method: p.ssh.authMethod as 'none' | 'password' | 'private_key',
                private_key_path: p.ssh.privateKeyPath,
              }
            : undefined,
        };
        spawnTerminal(id, config).catch((e) => { console.error(e); notify(localizeBackendError(e)); });
      }

      if (p.connectionType === 'ssh' && p.connectionId) {
        useConnectIntent.getState().addActiveConnection(p.connectionId);
      }

      restored.push({
        id,
        kind: p.kind,
        title:
          p.title ||
          (isSftp && p.ssh
            ? `SFTP · ${p.ssh.username}@${p.ssh.host}`
            : p.connectionType === 'ssh' && p.ssh
              ? `${p.ssh.username}@${p.ssh.host}`
              : 'Terminal'),
        isActive: !activeAssigned,
        connectionType: p.connectionType,
        connectionId: p.connectionId,
        ssh: p.ssh ? { ...p.ssh, password: undefined } : undefined,
      });
      activeAssigned = true;
    }

    if (restored.length > 0) {
      setTabs(restored);
      notify(t('restore_restored', { count: restored.length }));
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 标签变化后落盘（仅保留安全元数据，password 不落盘）
  useEffect(() => {
    if (!hydrated) return;
    savePersistedTabs(tabs.map(tabToPersisted));
  }, [tabs, hydrated]);

  useEffect(() => {
    const activeTab = tabsRef.current.find((t) => t.isActive);
    if (!activeTab) {
      setActiveCwd(null);
      return;
    }
    const interval = setInterval(() => {
      getTerminalCwd(activeTab.id).then((cwd) => {
        if (cwd) setActiveCwd(cwd);
      }).catch((e) => notify(localizeBackendError(e)));
    }, 5000);
    getTerminalCwd(activeTab.id).then((cwd) => {
      if (cwd) setActiveCwd(cwd);
    }).catch((e) => notify(localizeBackendError(e)));
    return () => clearInterval(interval);
  }, [tabs]);

  const getActiveTerminal = useCallback((): TerminalEmulatorHandle | undefined => {
    const activeTab = tabsRef.current.find((t) => t.isActive);
    if (!activeTab) return undefined;
    return terminalRefs.current.get(activeTab.id);
  }, []);

  // Pro 功能授权检查：未付费时弹出升级对话框
  const canUseFeature = useLicenseStore((s) => s.canUse);
  const openUpgrade = useUpgradeDialogStore((s) => s.openDialog);
  const guardProFeature = useCallback(
    (feature: ProFeature, action: () => void) => {
      if (canUseFeature(feature)) {
        action();
      } else {
        openUpgrade(feature);
      }
    },
    [canUseFeature, openUpgrade],
  );

  const handleNewTerminal = useCallback(() => {
    setPickerOpen(true);
  }, []);

  const estimateTerminalSize = useCallback(() => {
    const activeTabEl = document.querySelector('[data-terminal-container] > div[style*="visible"]');
    if (activeTabEl) {
      const rect = activeTabEl.getBoundingClientRect();
      const fontSize = useSettingsStore.getState().settings.appearance.fontSize;
      const lineHeight = useSettingsStore.getState().settings.appearance.lineHeight;
      const cellHeight = fontSize * lineHeight;
      const cellWidth = fontSize * 0.6;
      if (rect.width > 0 && rect.height > 0 && cellHeight > 0 && cellWidth > 0) {
        return {
          cols: Math.max(10, Math.floor((rect.width - 16) / cellWidth)),
          rows: Math.max(5, Math.floor((rect.height - 16) / cellHeight)),
        };
      }
    }
    return { rows: 24, cols: 80 };
  }, []);

  const handleConnect = useCallback((result: ConnectionPickerResult) => {
    const id = generateId();
    const count = tabs.length + 1;
    const size = estimateTerminalSize();

    const config: PtyConfig = {
      rows: size.rows,
      cols: size.cols,
      shell,
      cwd: result.connectionType === 'local' ? activeCwd ?? undefined : undefined,
      connection_type: result.connectionType,
      ssh: result.ssh,
    };

    const title =
      result.connectionType === 'ssh' && result.ssh
        ? `${result.ssh.username}@${result.ssh.host}`
        : `Terminal ${count}`;

    spawnTerminal(id, config).catch((e) => { console.error(e); notify(localizeBackendError(e)); });

    if (result.connectionId && result.connectionType === 'ssh') {
      useConnectIntent.getState().addActiveConnection(result.connectionId);
    }

    setTabs((prev) => [
      ...prev.map((t) => ({ ...t, isActive: false })),
      {
        id,
        kind: 'terminal',
        title,
        isActive: true,
        connectionType: result.connectionType,
        connectionId: result.connectionId,
        ssh: result.ssh ? {
          host: result.ssh.host,
          port: result.ssh.port,
          username: result.ssh.username,
          authMethod: result.ssh.auth_method,
          privateKeyPath: result.ssh.private_key_path,
          password: result.ssh.password,
        } : undefined,
      },
    ]);
    setPickerOpen(false);
  }, [tabs.length, shell, activeCwd, estimateTerminalSize]);

  // 消费来自"连接管理"页的连接意图：真正拉起一个 SSH/本地终端会话（复用 handleConnect）
  const handleConnectRef = useRef(handleConnect);
  handleConnectRef.current = handleConnect;
  useEffect(() => {
    const consumeAndConnect = () => {
      const pending = useConnectIntent.getState().consume();
      if (pending) handleConnectRef.current(pending);
    };
    consumeAndConnect();
    const unsub = useConnectIntent.subscribe((state) => {
      if (state.pending) consumeAndConnect();
    });
    return unsub;
  }, []);

  const doCloseTab = useCallback(
    (id: string) => {
      const tab = tabsRef.current.find((t) => t.id === id);
      if (tab?.kind === 'terminal') {
        killTerminal(id).catch((e) => { console.error(e); notify(localizeBackendError(e)); });
        terminalRefs.current.delete(id);
      }
      // SFTP 标签：SftpManager 卸载时自行清理连接
      setTabs((prev) => {
        const closing = prev.find((t) => t.id === id);
        const filtered = prev.filter((t) => t.id !== id);
        // 若该 tab 关联某个连接，且关闭后没有其他同连接 tab，则从活跃集移除
        if (closing?.connectionId && !filtered.some((t) => t.connectionId === closing.connectionId)) {
          useConnectIntent.getState().removeActiveConnection(closing.connectionId);
        }
        if (prev.find((t) => t.id === id)?.isActive && filtered.length > 0) {
          filtered[filtered.length - 1].isActive = true;
        }
        return filtered;
      });
    },
    [],
  );

  const handleCloseTab = useCallback(
    (id: string) => {
      if (confirmBeforeClose) {
        setConfirmCloseId(id);
        return;
      }
      doCloseTab(id);
    },
    [confirmBeforeClose, doCloseTab],
  );

  const handleConfirmClose = useCallback(() => {
    if (!confirmCloseId) return;
    doCloseTab(confirmCloseId);
    setConfirmCloseId(null);
  }, [confirmCloseId, doCloseTab]);

  const handleCancelClose = useCallback(() => {
    setConfirmCloseId(null);
  }, []);

  const handleSelectTab = useCallback((id: string) => {
    setTabs((prev) => prev.map((t) => ({ ...t, isActive: t.id === id })));
  }, []);

  const handleExit = useCallback(
    (sessionId: string) => {
      const tab = tabsRef.current.find((t) => t.id === sessionId);
      if (tab?.connectionType === 'ssh') {
        setTabs((prev) =>
          prev.map((t) => (t.id === sessionId ? { ...t, disconnected: true } : t)),
        );
      } else {
        doCloseTab(sessionId);
      }
    },
    [doCloseTab],
  );

  const handleReconnect = useCallback(
    (tab: Tab) => {
      if (!tab.ssh) return;
      killTerminal(tab.id).catch((e) => notify(localizeBackendError(e)));
      terminalRefs.current.delete(tab.id);
      const newId = generateId();
      const size = estimateTerminalSize();
      const config: PtyConfig = {
        rows: size.rows,
        cols: size.cols,
        shell,
        connection_type: 'ssh',
        ssh: {
          host: tab.ssh.host,
          port: tab.ssh.port,
          username: tab.ssh.username,
          auth_method: tab.ssh.authMethod as 'none' | 'password' | 'private_key',
          private_key_path: tab.ssh.privateKeyPath,
          password: tab.ssh.password,
        },
      };
      spawnTerminal(newId, config).catch((e) => { console.error(e); notify(localizeBackendError(e)); });
      setTabs((prev) =>
        prev.map((t) => (t.id === tab.id ? { ...t, id: newId, disconnected: false } : t)),
      );
    },
    [shell, estimateTerminalSize],
  );

  const handleCommandExecute = useCallback(
    (command: string) => {
      const activeTab = tabs.find((t) => t.isActive);
      if (activeTab) {
        const bytes = new TextEncoder().encode(command + '\n');
        writeToTerminal(activeTab.id, Array.from(bytes)).catch((e) => { console.error(e); notify(localizeBackendError(e)); });
        getTerminalCwd(activeTab.id).then((cwd) => {
          parseCommand(command, activeTab.id, cwd ?? undefined).catch((e) => notify(localizeBackendError(e)));
        }).catch((e) => notify(localizeBackendError(e)));
      }
      setPaletteOpen(false);
    },
    [tabs],
  );

  const handleOpenAiCopilot = useCallback(() => {
    guardProFeature('ai_copilot', () => {
      openAiCopilotWindow().catch((e) => { console.error(e); notify(localizeBackendError(e)); });
    });
  }, [guardProFeature, notify]);

  const handleOpenRemoteDesktop = useCallback(() => {
    guardProFeature('remote_desktop', () => {
      const activeTab = tabsRef.current.find((t) => t.isActive);
      const sshParams = activeTab?.ssh ? {
        host: activeTab.ssh.host,
        port: activeTab.ssh.port,
        username: activeTab.ssh.username,
        authMethod: activeTab.ssh.authMethod,
        privateKeyPath: activeTab.ssh.privateKeyPath,
        password: activeTab.ssh.password,
        connectionId: activeTab.connectionId,
      } : undefined;
      openRemoteDesktopWindow(sshParams, (msg) => notify(msg)).catch((e) => { console.error(e); notify(localizeBackendError(e)); });
    });
  }, [guardProFeature, notify]);

  const handleOpenSftp = useCallback(() => {
    const activeTab = tabsRef.current.find((t) => t.isActive);
    if (!activeTab?.ssh) return;

    // 若当前已是 SFTP 标签，则不重复创建
    if (activeTab.kind === 'sftp') return;

    if (!canUseFeature('sftp')) {
      openUpgrade('sftp');
      return;
    }

    const id = generateId();
    const ssh = activeTab.ssh;
    const title = `SFTP · ${ssh.username}@${ssh.host}`;

    if (activeTab.connectionId) {
      useConnectIntent.getState().addActiveConnection(activeTab.connectionId);
    }

    setTabs((prev) => [
      ...prev.map((t) => ({ ...t, isActive: false })),
      {
        id,
        kind: 'sftp' as const,
        title,
        isActive: true,
        connectionType: 'ssh' as const,
        connectionId: activeTab.connectionId,
        ssh: {
          host: ssh.host,
          port: ssh.port,
          username: ssh.username,
          authMethod: ssh.authMethod,
          privateKeyPath: ssh.privateKeyPath,
          password: ssh.password,
        },
      },
    ]);
  }, [canUseFeature, openUpgrade]);

  const handleClearBuffer = useCallback(() => {
    getActiveTerminal()?.clearBuffer();
  }, [getActiveTerminal]);

  const handleTitleChange = useCallback((sessionId: string, title: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === sessionId ? { ...t, title } : t)),
    );
  }, []);

  const handleCopy = useCallback(() => {
    const terminal = getActiveTerminal();
    if (!terminal) return;
    const selection = terminal.getSelection();
    if (selection) {
      copyText(selection).catch((e) => notify(localizeBackendError(e)));
    }
  }, [getActiveTerminal]);

  const handlePaste = useCallback(() => {
    const terminal = getActiveTerminal();
    if (!terminal) return;
    pasteText().then((text) => {
      if (text) {
        terminal.paste(text);
        // 粘贴的命令也要记录历史（terminal.paste 不触发 onData，无法走正常 lineBuffer 流程）
        // 只记录第一个非空行，避免多行命令被拆成多条历史
        const activeTab = tabsRef.current.find((t) => t.isActive);
        if (activeTab) {
          const firstLine = text.split('\n').map((l) => l.trim()).find(Boolean);
          if (firstLine) {
            getTerminalCwd(activeTab.id).then((cwd) => {
              parseCommand(firstLine, activeTab.id, cwd ?? undefined).catch((e) => notify(localizeBackendError(e)));
            }).catch((e) => notify(localizeBackendError(e)));
          }
        }
      }
    }).catch((e) => notify(localizeBackendError(e)));
  }, [getActiveTerminal]);

  const handleFind = useCallback(() => {
    setFindOpen((prev) => !prev);
  }, []);

  const handleFindNext = useCallback((query: string, options?: { caseSensitive?: boolean }) => {
    if (!query) return;
    setFindQuery(query);
    getActiveTerminal()?.findNext(query, { caseSensitive: options?.caseSensitive ?? false });
  }, [getActiveTerminal]);

  const handleFindPrevious = useCallback((query: string, options?: { caseSensitive?: boolean }) => {
    if (!query) return;
    setFindQuery(query);
    getActiveTerminal()?.findPrevious(query, { caseSensitive: options?.caseSensitive ?? false });
  }, [getActiveTerminal]);

  const handleSelectAll = useCallback(() => {
    getActiveTerminal()?.selectAll();
  }, [getActiveTerminal]);

  const handleScrollToBottom = useCallback(() => {
    getActiveTerminal()?.scrollToBottom();
  }, [getActiveTerminal]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const terminal = getActiveTerminal();
    setContextMenu({
      mouseX: e.clientX,
      mouseY: e.clientY,
      hasSelection: terminal?.hasSelection() ?? false,
    });
  }, [getActiveTerminal]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.shiftKey && e.key === 'p') {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
        return;
      }

      if (mod && e.key === 't') {
        e.preventDefault();
        handleNewTerminal();
        return;
      }

      if (mod && e.key === 'w') {
        e.preventDefault();
        const active = tabs.find((t) => t.isActive);
        if (active) handleCloseTab(active.id);
        return;
      }

      if (mod && e.key === 'f') {
        e.preventDefault();
        handleFind();
        return;
      }

      if (mod && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        if (idx < tabs.length) {
          handleSelectTab(tabs[idx].id);
        }
        return;
      }

      if (mod && e.shiftKey && e.key === ']') {
        e.preventDefault();
        const activeIdx = tabs.findIndex((t) => t.isActive);
        const nextIdx = (activeIdx + 1) % tabs.length;
        handleSelectTab(tabs[nextIdx].id);
        return;
      }

      if (mod && e.shiftKey && e.key === '[') {
        e.preventDefault();
        const activeIdx = tabs.findIndex((t) => t.isActive);
        const prevIdx = (activeIdx - 1 + tabs.length) % tabs.length;
        handleSelectTab(tabs[prevIdx].id);
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tabs, handleNewTerminal, handleCloseTab, handleSelectTab, handleFind]);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    listen<{ command: string }>('execute-command', (event) => {
      const command = event.payload.command;
      if (!command) return;

      const activeTab = tabsRef.current.find((t) => t.isActive);
      if (activeTab) {
        const lines = command.split('\n').filter((l: string) => l.trim());
        for (const line of lines) {
          const bytes = new TextEncoder().encode(line + '\n');
          writeToTerminal(activeTab.id, Array.from(bytes)).catch((e) => { console.error(e); notify(localizeBackendError(e)); });
          getTerminalCwd(activeTab.id).then((cwd) => {
            parseCommand(line, activeTab.id, cwd ?? undefined).catch((e) => notify(localizeBackendError(e)));
          }).catch((e) => notify(localizeBackendError(e)));
        }
      }
    }).then((fn) => {
      unlisten = fn;
    }).catch((e) => { console.error(e); notify(localizeBackendError(e)); });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const activeTab = tabs.find((t) => t.isActive);

  if (tabs.length === 0) {
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
              onClick={handleNewTerminal}
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
          onConnect={handleConnect}
          onClose={() => setPickerOpen(false)}
        />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TerminalToolbar
        onNewTab={handleNewTerminal}
        onCloseTab={() => activeTab && handleCloseTab(activeTab.id)}
        onOpenAiCopilot={handleOpenAiCopilot}
        onOpenRemoteDesktop={handleOpenRemoteDesktop}
        onOpenSftp={handleOpenSftp}
        onClearBuffer={handleClearBuffer}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onFind={handleFind}
        findOpen={findOpen}
        isSshSession={!!activeTab?.ssh}
        activeTabKind={activeTab?.kind ?? 'terminal'}
        onOpenConnections={() => navigate('/connections')}
      />
      <TabBar tabs={tabs} onSelect={handleSelectTab} onClose={handleCloseTab} />

      <FindBar
        open={findOpen}
        onClose={() => setFindOpen(false)}
        onFindNext={handleFindNext}
        onFindPrevious={handleFindPrevious}
        resultInfo={findResultCount}
      />

      <Box sx={{ flex: 1, overflow: 'hidden', position: 'relative' }} data-terminal-container onContextMenu={activeTab?.kind === 'terminal' ? handleContextMenu : undefined}>
        {tabs.map((tab) => {
          const isSftp = tab.kind === 'sftp';
          return (
            <Box
              key={tab.id}
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
                      if (handle) terminalRefs.current.set(tab.id, handle);
                      else terminalRefs.current.delete(tab.id);
                    }}
                    sessionId={tab.id}
                    onExit={handleExit}
                    onTitleChange={handleTitleChange}
                    onFindResultsChange={(resultIndex, resultCount) => {
                      setFindResultCount({ resultIndex, resultCount });
                    }}
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
                        onClick={() => handleReconnect(tab)}
                      >
                        {t('reconnect')}
                      </Button>
                    </Box>
                  )}
                </>
              )}
            </Box>
          );
        })}
      </Box>
      <TerminalStatusBar
        sessionName={activeTab?.title}
        connected={!!activeTab && !activeTab.disconnected}
        cwd={activeCwd ?? undefined}
      />
      <TerminalContextMenu
        menuState={contextMenu}
        onClose={() => setContextMenu(null)}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onSelectAll={handleSelectAll}
        onClearBuffer={handleClearBuffer}
        onFind={handleFind}
        onScrollToBottom={handleScrollToBottom}
      />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onExecute={handleCommandExecute}
      />
      <ConnectionPicker
        open={pickerOpen}
        onConnect={handleConnect}
        onClose={() => setPickerOpen(false)}
      />

      <Dialog open={!!confirmCloseId} onClose={handleCancelClose}>
        <DialogTitle>{t('page.close_terminal')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('page.close_terminal_desc')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelClose}>{tCommon('action.cancel')}</Button>
          <Button onClick={handleConfirmClose} color="error" variant="contained">
            {tCommon('action.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
