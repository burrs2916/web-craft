import { useEffect } from 'react';
import { writeToTerminal, getTerminalCwd } from '../../core/services/terminal.service';
import { parseCommand } from '../../core/services/command.service';
import { localizeBackendError } from '../../core/backendError';
import { useNotify } from '../../core/notification';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { Tab } from './types';

interface UseTerminalShortcutsParams {
  tabs: Tab[];
  tabsRef: React.MutableRefObject<Tab[]>;
  onNewTerminal: () => void;
  onCloseTab: (id: string) => void;
  onSelectTab: (id: string) => void;
  onFind: () => void;
  setPaletteOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * 全局输入副作用：窗口级键盘快捷键，以及来自后端的 `execute-command` Tauri 事件监听。
 */
export function useTerminalShortcuts({
  tabs,
  tabsRef,
  onNewTerminal,
  onCloseTab,
  onSelectTab,
  onFind,
  setPaletteOpen,
}: UseTerminalShortcutsParams) {
  const notify = useNotify().notify;

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
        onNewTerminal();
        return;
      }

      if (mod && e.key === 'w') {
        e.preventDefault();
        const active = tabs.find((t) => t.isActive);
        if (active) onCloseTab(active.id);
        return;
      }

      if (mod && e.key === 'f') {
        e.preventDefault();
        onFind();
        return;
      }

      if (mod && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        if (idx < tabs.length) {
          onSelectTab(tabs[idx].id);
        }
        return;
      }

      if (mod && e.shiftKey && e.key === ']') {
        e.preventDefault();
        const activeIdx = tabs.findIndex((t) => t.isActive);
        const nextIdx = (activeIdx + 1) % tabs.length;
        onSelectTab(tabs[nextIdx].id);
        return;
      }

      if (mod && e.shiftKey && e.key === '[') {
        e.preventDefault();
        const activeIdx = tabs.findIndex((t) => t.isActive);
        const prevIdx = (activeIdx - 1 + tabs.length) % tabs.length;
        onSelectTab(tabs[prevIdx].id);
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tabs, onNewTerminal, onCloseTab, onSelectTab, onFind, setPaletteOpen]);

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
}