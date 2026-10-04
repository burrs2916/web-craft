import { useState, useCallback, useEffect, useRef } from 'react';
import { spawnTerminal, killTerminal, getTerminalCwd } from '../../core/services/terminal.service';
import { generateId } from '../../core/utils';
import type { PtyConfig } from '../../proto';
import { useConnectIntent } from '../../features/terminal/connectIntent';
import { readPersistedTabs, savePersistedTabs, tabToPersisted, canAutoRestore } from '../../features/terminal/sessionPersistence';
import { localizeBackendError } from '../../core/backendError';
import { useSettingsStore } from '../../engine';
import { useNotify } from '../../core/notification';
import { useTranslation } from 'react-i18next';
import { useLicenseStore } from '../../features/licensing/licenseStore';
import { useUpgradeDialogStore } from '../../features/licensing/upgradeDialogStore';
import type { TerminalEmulatorHandle, ConnectionPickerResult } from '../../features/terminal';
import type { Tab } from './types';

/**
 * 终端页标签与会话生命周期的核心状态：
 * 标签增删改选、跨重启恢复、落盘、cwd 轮询、连接意图消费。
 * 剪贴板/查找等「作用于当前终端」的动作在 useTerminalActions 中，
 * 全局快捷键与 Tauri 事件监听在 useTerminalShortcuts 中。
 */
export function useTerminalTabs() {
  const { t } = useTranslation('terminal');
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findResultCount, setFindResultCount] = useState<{ resultIndex: number; resultCount: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number; hasSelection: boolean } | null>(null);
  const [activeCwd, setActiveCwd] = useState<string | null>(null);
  const tabsRef = useRef<Tab[]>([]);
  const terminalRefs = useRef<Map<string, TerminalEmulatorHandle>>(new Map());
  tabsRef.current = tabs;

  const shell = useSettingsStore((s) => s.settings.shell);
  const confirmBeforeClose = useSettingsStore((s) => s.settings.confirmBeforeClose);
  const notify = useNotify().notify;

  // —— 跨重启恢复：仅在首次挂载时执行一次 ——
  const [hydrated, setHydrated] = useState(false);
  const hydrateRef = useRef(false);

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

  const handleNewTerminal = useCallback(() => {
    setPickerOpen(true);
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

  const canUseFeature = useLicenseStore((s) => s.canUse);
  const openUpgrade = useUpgradeDialogStore((s) => s.openDialog);

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

  const handleTitleChange = useCallback((sessionId: string, title: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === sessionId ? { ...t, title } : t)),
    );
  }, []);

  const activeTab = tabs.find((t) => t.isActive);

  return {
    tabs,
    activeTab,
    activeCwd,
    tabsRef,
    terminalRefs,
    getActiveTerminal,
    notify,
    pickerOpen,
    setPickerOpen,
    paletteOpen,
    setPaletteOpen,
    confirmCloseId,
    findOpen,
    setFindOpen,
    findResultCount,
    setFindResultCount,
    contextMenu,
    setContextMenu,
    handleNewTerminal,
    handleConnect,
    handleCloseTab,
    handleConfirmClose,
    handleCancelClose,
    handleSelectTab,
    handleExit,
    handleReconnect,
    handleOpenSftp,
    handleTitleChange,
  };
}