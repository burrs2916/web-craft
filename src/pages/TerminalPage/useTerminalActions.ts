import { useState, useCallback } from 'react';
import { writeToTerminal, getTerminalCwd } from '../../core/services/terminal.service';
import { copyText, pasteText } from '../../core/services/clipboard.service';
import { parseCommand } from '../../core/services/command.service';
import { openAiCopilotWindow, openRemoteDesktopWindow } from '../../core/services/window.service';
import { localizeBackendError } from '../../core/backendError';
import { useNotify } from '../../core/notification';
import { useLicenseStore } from '../../features/licensing/licenseStore';
import { useUpgradeDialogStore } from '../../features/licensing/upgradeDialogStore';
import type { ProFeature } from '../../proto/licensing';
import type { TerminalEmulatorHandle } from '../../features/terminal';
import type { Tab } from './types';

interface UseTerminalActionsParams {
  tabs: Tab[];
  tabsRef: React.MutableRefObject<Tab[]>;
  getActiveTerminal: () => TerminalEmulatorHandle | undefined;
  setFindOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setContextMenu: React.Dispatch<React.SetStateAction<{ mouseX: number; mouseY: number; hasSelection: boolean } | null>>;
  setPaletteOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * 作用于「当前激活终端」的动作：剪贴板、查找、滚动、右键菜单、命令执行，
 * 以及需要 Pro 授权的窗口启动（AI Copilot / 远程桌面）。
 */
export function useTerminalActions({
  tabs,
  tabsRef,
  getActiveTerminal,
  setFindOpen,
  setContextMenu,
  setPaletteOpen,
}: UseTerminalActionsParams) {
  const notify = useNotify().notify;
  const [, setFindQuery] = useState('');

  const canUseFeature = useLicenseStore((s) => s.canUse);
  const openUpgrade = useUpgradeDialogStore((s) => s.openDialog);

  // Pro 功能授权检查：未付费时弹出升级对话框
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

  const handleClearBuffer = useCallback(() => {
    getActiveTerminal()?.clearBuffer();
  }, [getActiveTerminal]);

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
  }, [setFindOpen]);

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
  }, [getActiveTerminal, setContextMenu]);

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
    [tabs, setPaletteOpen],
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

  return {
    handleClearBuffer,
    handleCopy,
    handlePaste,
    handleFind,
    handleFindNext,
    handleFindPrevious,
    handleSelectAll,
    handleScrollToBottom,
    handleContextMenu,
    handleCommandExecute,
    handleOpenAiCopilot,
    handleOpenRemoteDesktop,
  };
}