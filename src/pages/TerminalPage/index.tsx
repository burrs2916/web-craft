import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import { TerminalToolbar, TerminalStatusBar, TerminalContextMenu, FindBar, ConnectionPicker } from '../../features/terminal';
import type { TerminalEmulatorHandle } from '../../features/terminal';
import { TabBar } from '../../features/session';
import { CommandPalette } from '../../features/command';
import { useTerminalTabs } from './useTerminalTabs';
import { useTerminalActions } from './useTerminalActions';
import { useTerminalShortcuts } from './useTerminalShortcuts';
import { TerminalEmptyState } from './TerminalEmptyState';
import { TerminalTabContent } from './TerminalTabContent';
import { CloseConfirmDialog } from './CloseConfirmDialog';

export function TerminalPage() {
  const navigate = useNavigate();

  const {
    tabs,
    activeTab,
    activeCwd,
    tabsRef,
    terminalRefs,
    getActiveTerminal,
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
  } = useTerminalTabs();

  const {
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
  } = useTerminalActions({
    tabs,
    tabsRef,
    getActiveTerminal,
    setFindOpen,
    setContextMenu,
    setPaletteOpen,
  });

  useTerminalShortcuts({
    tabs,
    tabsRef,
    onNewTerminal: handleNewTerminal,
    onCloseTab: handleCloseTab,
    onSelectTab: handleSelectTab,
    onFind: handleFind,
    setPaletteOpen,
  });

  const setTerminalRef = useCallback((id: string, handle: TerminalEmulatorHandle | null) => {
    if (handle) terminalRefs.current.set(id, handle);
    else terminalRefs.current.delete(id);
  }, [terminalRefs]);

  if (tabs.length === 0) {
    return (
      <TerminalEmptyState
        pickerOpen={pickerOpen}
        onConnect={handleConnect}
        onClosePicker={() => setPickerOpen(false)}
        onNewTerminal={handleNewTerminal}
      />
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
        {tabs.map((tab) => (
          <TerminalTabContent
            key={tab.id}
            tab={tab}
            onExit={handleExit}
            onTitleChange={handleTitleChange}
            onFindResultsChange={(resultIndex, resultCount) => {
              setFindResultCount({ resultIndex, resultCount });
            }}
            onReconnect={handleReconnect}
            setTerminalRef={setTerminalRef}
          />
        ))}
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

      <CloseConfirmDialog
        open={!!confirmCloseId}
        onCancel={handleCancelClose}
        onConfirm={handleConfirmClose}
      />
    </Box>
  );
}