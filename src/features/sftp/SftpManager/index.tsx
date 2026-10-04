import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { brand } from '../../../theme/brand';
import { EyeIcon, FolderOpenIcon, MagnifyingGlassIcon, WarningIcon } from '@phosphor-icons/react';
import { DirectoryTree } from '../DirectoryTree';
import { FileTable } from '../FileTable';
import { PathBar } from '../PathBar';
import { SftpToolbar } from '../SftpToolbar';
import { StatusBar } from '../StatusBar';
import { TransferQueue } from '../TransferQueue';
import { BackgroundContextMenu, RowContextMenu } from './ContextMenus';
import { DragOverlay } from './DragOverlay';
import { EmptyState } from './EmptyState';
import { FileTableSkeleton } from './FileTableSkeleton';
import { SftpDialogsContainer } from './SftpDialogsContainer';
import type { SftpManagerProps } from './types';
import { useSftpManager } from './useSftpManager';

export function SftpManager({ ssh }: SftpManagerProps) {
  const m = useSftpManager(ssh);
  const { t, isDark, compact, wide, s, subtle, textColor, border, target } = m;

  if (s.sftpMissing) {
    return (
      <Box sx={{ p: 4 }}>
        <Paper sx={{ p: 3, bgcolor: isDark ? '#2d2424' : '#fff4f4', border: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <WarningIcon size={28} color="#ff9800" weight="fill" />
            <Box>
              <Typography variant="h6" sx={{ color: textColor }}>
                {t('sftp_not_found_title')}
              </Typography>
              <Typography variant="body2" sx={{ color: subtle, whiteSpace: 'pre-line', mt: 1 }}>
                {t('sftp_not_found_desc')}
              </Typography>
            </Box>
          </Box>
        </Paper>
      </Box>
    );
  }

  const showSkeleton = s.loading && s.entries.length === 0;
  const filteredOut = s.displayed.length === 0 && s.entries.length > 0;

  return (
    <Box
      ref={m.containerRef}
      tabIndex={0}
      onKeyDown={m.handleKeyDown}
      sx={{
        outline: 'none',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        bgcolor: isDark ? brand.dark.background : '#f6f8fa',
        // While the splitter is held, the whole surface adopts the resize
        // cursor so the pointer never "escapes" the 5px handle.
        ...(m.resizing ? { cursor: 'col-resize', userSelect: 'none' } : null),
      }}
    >
      <SftpToolbar
        isDark={isDark}
        busy={s.busy}
        loading={s.loading}
        canBack={s.history.canBack}
        canForward={s.history.canForward}
        canUp={!!s.parent}
        selectedCount={s.selected.size}
        canRename={s.selected.size === 1}
        showHidden={s.showHidden}
        search={s.search}
        compact={compact}
        treeOpen={m.treeOpen}
        onToggleTree={m.toggleTree}
        labels={{
          showTree: t('show_tree'),
          hideTree: t('hide_tree'),
          back: t('back'),
          forward: t('forward'),
          parent: t('parent'),
          home: t('home'),
          refresh: t('refresh'),
          upload: t('upload'),
          uploadFiles: t('upload_files'),
          uploadFolder: t('upload_folder'),
          download: t('download'),
          downloadTo: t('download_to'),
          newFolder: t('new_folder'),
          rename: t('rename'),
          delete: t('delete'),
          showHidden: t('show_hidden'),
          hideHidden: t('hide_hidden'),
          searchPlaceholder: t('search_placeholder'),
          clearSearch: t('clear_search'),
        }}
        onBack={s.goBack}
        onForward={s.goForward}
        onUp={() => s.parent && s.navigate(s.parent)}
        onHome={() => s.navigate('.')}
        onRefresh={s.refresh}
        onUpload={(mode) => void s.pickAndUpload(mode)}
        onDownload={(ask) => void s.downloadEntries(s.selectedEntries, ask)}
        onNewFolder={() => s.setNewFolderOpen(true)}
        onRename={() => {
          const f = s.entries.find((x) => s.selected.has(x.name));
          if (f) s.startRename(f);
        }}
        onDelete={() => s.requestDelete(Array.from(s.selected))}
        onToggleHidden={s.toggleHidden}
        onSearchChange={s.setSearch}
      />

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {m.treeOpen && (
          <>
            <Box
              sx={{
                width: m.treeWidth,
                maxWidth: '45%',
                flexShrink: 0,
                minHeight: 0,
                borderRight: `1px solid ${border}`,
                bgcolor: isDark ? '#0b0e13' : '#fbfcfd',
              }}
            >
              <DirectoryTree
                isDark={isDark}
                currentPath={s.path}
                homePath={s.homePath}
                currentEntries={s.entries}
                showHidden={s.showHidden}
                dropPath={m.dragOver && m.dropTarget && !m.dropTarget.rowName ? m.dropTarget.path : null}
                labels={{
                  home: t('home'),
                  root: t('root'),
                  refresh: t('refresh'),
                  uploadHere: t('upload_here'),
                  downloadHere: t('download_here'),
                  copyPath: t('copy_path'),
                  loadFailed: t('tree_load_failed'),
                }}
                formatMore={(count) => t('tree_more', { count })}
                list={m.listDir}
                listMany={m.listManyDir}
                onNavigate={s.navigate}
                onUploadTo={(p) => void s.pickAndUpload('files', p)}
                onDownloadNode={(p) => void s.downloadRemoteDir(p)}
                onCopyPath={(p) => void m.copyPath(p)}
              />
            </Box>
            {/* A wide grab strip straddling the hairline: 1px targets are a
                usability tax nobody should pay. */}
            <Box
              onPointerDown={m.startResize}
              sx={{
                width: 5,
                ml: '-3px',
                flexShrink: 0,
                zIndex: 2,
                cursor: 'col-resize',
                '&:hover': { bgcolor: isDark ? 'rgba(88,166,255,0.35)' : 'rgba(9,105,218,0.25)' },
                ...(m.resizing
                  ? { bgcolor: isDark ? 'rgba(88,166,255,0.55)' : 'rgba(9,105,218,0.4)' }
                  : null),
              }}
            />
          </>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0 }}>
          <PathBar
            path={s.path}
            isDark={isDark}
            editing={m.editingPath}
            draft={m.pathDraft}
            labels={{
              home: t('home'),
              root: t('root'),
              edit: t('edit_path'),
              placeholder: t('path_placeholder'),
            }}
            onNavigate={s.navigate}
            onDraftChange={m.setPathDraft}
            onBeginEdit={m.beginEditPath}
            onCancelEdit={() => m.setEditingPath(false)}
            onCommitEdit={m.commitEditPath}
          />

          {/* A hairline instead of a full skeleton keeps navigation from flashing. */}
          <Box sx={{ height: 2, flexShrink: 0 }}>
            {s.loading && !showSkeleton && <LinearProgress sx={{ height: 2 }} />}
          </Box>

          <Box sx={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden' }}>
            {s.error && (
              <Paper sx={{ m: 1, p: 1.5, bgcolor: isDark ? '#2d2424' : '#fff4f4' }}>
                <Typography variant="body2" sx={{ color: '#ff5252', fontSize: 12.5 }}>
                  {s.error}
                </Typography>
              </Paper>
            )}

            {showSkeleton ? (
              <FileTableSkeleton isDark={isDark} />
            ) : s.entries.length === 0 && !s.loading ? (
              <EmptyState
                isDark={isDark}
                icon={<FolderOpenIcon size={30} color={subtle} />}
                title={t('empty')}
                actionLabel={t('upload_files')}
                onAction={() => void s.pickAndUpload('files')}
              />
            ) : filteredOut ? (
              <EmptyState
                isDark={isDark}
                icon={
                  s.search ? (
                    <MagnifyingGlassIcon size={28} color={subtle} />
                  ) : (
                    <EyeIcon size={28} color={subtle} />
                  )
                }
                title={s.search ? t('no_match', { query: s.search }) : t('only_hidden')}
                actionLabel={s.search ? t('clear_search') : t('reveal_hidden')}
                onAction={s.search ? () => s.setSearch('') : s.toggleHidden}
              />
            ) : (
              <FileTable
                entries={s.displayed}
                selected={s.selected}
                focused={s.focused}
                sortKey={s.sortKey}
                sortDir={s.sortDir}
                isDark={isDark}
                compact={compact}
                showOwner={wide}
                resetKey={`${s.path}|${s.search}`}
                dropTargetName={m.dragOver ? (m.dropTarget?.rowName ?? null) : null}
                labels={{
                  name: t('name'),
                  size: t('size'),
                  modified: t('modified'),
                  perms: t('perms'),
                  owner: t('owner'),
                  folder: t('folder'),
                  linkTo: t('link_to'),
                }}
                onSort={s.handleSort}
                onRowClick={s.handleRowClick}
                onRowDoubleClick={(entry) => void s.openEntry(entry)}
                onRowContextMenu={m.handleRowContextMenu}
                onEmptyClick={s.clearSelection}
                onBackgroundContextMenu={(e) => {
                  e.preventDefault();
                  s.clearSelection();
                  m.setBgMenu({ x: e.clientX, y: e.clientY });
                }}
              />
            )}

            {m.dragOver && (
              <DragOverlay
                isDark={isDark}
                dropTarget={m.dropTarget}
                path={s.path}
                textColor={textColor}
                subtle={subtle}
              />
            )}
          </Box>
        </Box>
      </Box>

      <StatusBar
        isDark={isDark}
        hidden={s.showHidden ? 0 : s.hiddenCount}
        selectedCount={s.selected.size}
        selectedSize={s.selectedSizeLabel}
        target={target}
        filtered={s.displayed.length !== s.entries.length}
        labels={{
          items: t('status_items', { count: s.entries.length }),
          hidden: t('status_hidden', { count: s.hiddenCount }),
          selected: t('status_selected', { count: s.selected.size }),
          filtered: t('status_filtered', { shown: s.displayed.length, total: s.entries.length }),
        }}
      />

      <TransferQueue
        items={s.transfers}
        collapsed={m.transferCollapsed}
        isDark={isDark}
        onToggle={() => m.setTransferCollapsed((v) => !v)}
        labels={{
          title: t('transfers'),
          clear: t('transfer_clear'),
          done: t('transfer_done'),
          failed: t('transfer_failed'),
          cancelled: t('cancelled'),
          cancel: t('cancel'),
          collapse: t('transfer_collapse'),
          expand: t('transfer_expand'),
          dismiss: t('transfer_dismiss'),
          retry: t('transfer_retry'),
          resume: t('transfer_resume'),
          resuming: t('transfer_resuming'),
          queued: t('transfer_queued'),
          queuedAt: (pos) => t('transfer_queued_at', { pos }),
        }}
        onClearFinished={s.clearFinishedTransfers}
        onDismiss={s.dismissTransfer}
        onCancel={(id) => void s.cancelTransfer(id)}
        onRetry={(id, resume) => s.retryTransfer(id, resume)}
      />

      <RowContextMenu
        browser={s}
        menu={m.rowMenu}
        onClose={() => m.setRowMenu(null)}
        subtle={subtle}
        onCopyPath={m.copyEntryPath}
      />

      <BackgroundContextMenu
        browser={s}
        menu={m.bgMenu}
        onClose={() => m.setBgMenu(null)}
        subtle={subtle}
      />

      <SftpDialogsContainer browser={s} isDark={isDark} />
    </Box>
  );
}