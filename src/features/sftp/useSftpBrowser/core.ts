import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { SshConnectionInfo } from '../../../proto/connection';
import { sftpDisconnect, sftpList, type SftpEntry } from '../../../core/services/sftp.service';
import { useNotify } from '../../../core/notification';
import { localizeBackendError } from '../../../core/backendError';
import type { ConfirmState } from '../SftpDialogs';
import {
  formatSize,
  isHiddenName,
  parentPath,
  readPref,
  sortEntries,
  writePref,
  type SortDir,
  type SortKey,
} from '../utils';
import { SHOW_HIDDEN_KEY, SORT_KEY, isSftpMissingError, readSort, type HistoryState } from './helpers';
import { useSftpTransfers } from './useSftpTransfers';
import { useSftpMutations } from './useSftpMutations';

/**
 * Everything stateful about browsing one remote host: listing, navigation
 * history, selection, transfers and the destructive-action queue. Keeping it
 * out of the view makes the render tree readable and the logic testable.
 *
 * 本文件保留列表/导航/派生数据/选择/对话框等共享状态，传输子系统与变更子系统
 * 分别抽到 useSftpTransfers / useSftpMutations；对外返回结构与拆分前一致。
 */
export function useSftpBrowser(ssh: SshConnectionInfo) {
  const { t } = useTranslation('fileTransfer');
  const notify = useNotify().notify;

  const [path, setPath] = useState('.');
  /** Absolute home directory, learned the first time `.` is resolved. */
  const [homePath, setHomePath] = useState<string | null>(null);
  const [entries, setEntries] = useState<SftpEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sftpMissing, setSftpMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>(() => readSort().key);
  const [sortDir, setSortDir] = useState<SortDir>(() => readSort().dir);
  const [showHidden, setShowHidden] = useState(() => readPref(SHOW_HIDDEN_KEY) === '1');
  const [search, setSearch] = useState('');

  const [renaming, setRenaming] = useState<SftpEntry | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [chmodTargets, setChmodTargets] = useState<SftpEntry[] | null>(null);
  const [chmodValue, setChmodValue] = useState('644');
  const [batchRename, setBatchRename] = useState<SftpEntry[] | null>(null);

  const [history, setHistory] = useState<HistoryState>({ canBack: false, canForward: false });

  const sshRef = useRef(ssh);
  sshRef.current = ssh;
  const pathRef = useRef(path);
  pathRef.current = path;
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  /** Anchor row for Shift range selection — must survive the click extending it. */
  const anchorRef = useRef<number>(-1);
  const histRef = useRef<{ stack: string[]; idx: number }>({ stack: [], idx: -1 });

  const syncHistory = useCallback(() => {
    const h = histRef.current;
    setHistory({ canBack: h.idx > 0, canForward: h.idx >= 0 && h.idx < h.stack.length - 1 });
  }, []);

  const pushHistory = useCallback(
    (resolved: string) => {
      const h = histRef.current;
      if (h.stack[h.idx] === resolved) return;
      h.stack = h.stack.slice(0, h.idx + 1);
      h.stack.push(resolved);
      h.idx = h.stack.length - 1;
      syncHistory();
    },
    [syncHistory],
  );

  /** Fetch a directory. `record` is false when replaying the history stack. */
  const load = useCallback(
    async (target: string, record = true) => {
      setLoading(true);
      setError(null);
      setSftpMissing(false);
      try {
        const res = await sftpList(sshRef.current, target);
        setEntries(res.entries);
        setPath(res.path);
        pathRef.current = res.path;
        // `.` is the only target the server expands into the login directory,
        // so this is the one chance to learn where "home" actually is.
        if (target === '.' && res.path.startsWith('/')) setHomePath(res.path);
        if (record) pushHistory(res.path);
        return true;
      } catch (e) {
        if (isSftpMissingError(e)) setSftpMissing(true);
        else setError(localizeBackendError(e));
        return false;
      } finally {
        setLoading(false);
      }
    },
    [pushHistory],
  );

  const resetViewState = useCallback(() => {
    setSelected(new Set());
    setFocused(null);
    setSearch('');
    anchorRef.current = -1;
  }, []);

  const navigate = useCallback(
    (target: string) => {
      resetViewState();
      void load(target, true);
    },
    [load, resetViewState],
  );

  const refresh = useCallback(() => {
    void load(pathRef.current, false);
  }, [load]);

  const goBack = useCallback(() => {
    const h = histRef.current;
    if (h.idx <= 0) return;
    h.idx -= 1;
    syncHistory();
    resetViewState();
    void load(h.stack[h.idx], false);
  }, [load, resetViewState, syncHistory]);

  const goForward = useCallback(() => {
    const h = histRef.current;
    if (h.idx >= h.stack.length - 1) return;
    h.idx += 1;
    syncHistory();
    resetViewState();
    void load(h.stack[h.idx], false);
  }, [load, resetViewState, syncHistory]);

  // ---- derived view data ---------------------------------------------------

  const hiddenCount = useMemo(
    () => entries.filter((e) => isHiddenName(e.name)).length,
    [entries],
  );

  const displayed = useMemo(() => {
    let list = entries;
    if (!showHidden) list = list.filter((e) => !isHiddenName(e.name));
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((e) => e.name.toLowerCase().includes(q));
    return sortEntries(list, sortKey, sortDir);
  }, [entries, showHidden, search, sortKey, sortDir]);

  const selectedEntries = useMemo(
    () => entries.filter((e) => selected.has(e.name)),
    [entries, selected],
  );

  const selectedSizeLabel = useMemo(() => {
    const bytes = selectedEntries.reduce((sum, e) => sum + (e.is_dir ? 0 : e.size), 0);
    return bytes > 0 ? formatSize(bytes) : '';
  }, [selectedEntries]);

  // ---- selection -----------------------------------------------------------

  const handleRowClick = useCallback(
    (entry: SftpEntry, index: number, e: MouseEvent) => {
      setFocused(entry.name);
      if (e.shiftKey && anchorRef.current >= 0) {
        const a = Math.min(anchorRef.current, index);
        const b = Math.max(anchorRef.current, index);
        setSelected(new Set(displayed.slice(a, b + 1).map((x) => x.name)));
        return;
      }
      anchorRef.current = index;
      if (e.metaKey || e.ctrlKey) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(entry.name)) next.delete(entry.name);
          else next.add(entry.name);
          return next;
        });
      } else {
        setSelected(new Set([entry.name]));
      }
    },
    [displayed],
  );

  const selectAll = useCallback(() => {
    setSelected(new Set(displayed.map((x) => x.name)));
  }, [displayed]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setFocused(null);
    anchorRef.current = -1;
  }, []);

  const moveFocus = useCallback(
    (delta: number | 'first' | 'last') => {
      if (displayed.length === 0) return;
      const idx = displayed.findIndex((x) => x.name === focused);
      let next: number;
      if (delta === 'first') next = 0;
      else if (delta === 'last') next = displayed.length - 1;
      else if (idx < 0) next = delta > 0 ? 0 : displayed.length - 1;
      else next = Math.min(displayed.length - 1, Math.max(0, idx + delta));
      const entry = displayed[next];
      setFocused(entry.name);
      setSelected(new Set([entry.name]));
      anchorRef.current = next;
    },
    [displayed, focused],
  );

  const toggleHidden = useCallback(() => {
    setShowHidden((v) => {
      writePref(SHOW_HIDDEN_KEY, v ? '0' : '1');
      return !v;
    });
  }, []);

  const handleSort = useCallback(
    (k: SortKey) => {
      const dir: SortDir = k === sortKey ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc';
      setSortKey(k);
      setSortDir(dir);
      writePref(SORT_KEY, `${k}:${dir}`);
      anchorRef.current = -1;
    },
    [sortKey, sortDir],
  );

  const startRename = useCallback((entry: SftpEntry) => {
    setRenaming(entry);
    setRenameValue(entry.name);
  }, []);

  const requestDelete = useCallback((names: string[]) => {
    if (names.length === 0) return;
    setConfirm({ kind: 'delete', names });
  }, []);

  // ---- subsystems ----------------------------------------------------------

  const transfers = useSftpTransfers({
    t,
    notify,
    sshRef,
    pathRef,
    entriesRef,
    load,
    confirm,
    setConfirm,
  });

  const mutations = useSftpMutations({
    t,
    notify,
    sshRef,
    pathRef,
    entriesRef,
    load,
    navigate,
    resetViewState,
    pushHistory,
    downloadEntries: transfers.downloadEntries,
    setBusy,
    setSelected,
    setFocused,
    setLoading,
    setEntries,
    setPath,
    renaming,
    renameValue,
    setRenaming,
    setRenameValue,
    newFolderName,
    setNewFolderOpen,
    setNewFolderName,
    chmodTargets,
    chmodValue,
    setChmodValue,
    setChmodTargets,
    batchRename,
    setBatchRename,
  });

  useEffect(() => {
    void load('.', true);
    return () => {
      // Drop anything still waiting: the window is going away, so firing those
      // transfers would move files with nowhere to report the outcome.
      transfers.discardPendingTransfers();
      sftpDisconnect(sshRef.current).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parent = useMemo(() => parentPath(path), [path]);

  return {
    // data
    path,
    homePath,
    parent,
    entries,
    displayed,
    hiddenCount,
    selected,
    selectedEntries,
    selectedSizeLabel,
    focused,
    sortKey,
    sortDir,
    showHidden,
    search,
    loading,
    busy,
    error,
    sftpMissing,
    transfers: transfers.transfers,
    history,
    // dialogs
    renaming,
    renameValue,
    newFolderOpen,
    newFolderName,
    confirm,
    chmodTargets,
    chmodValue,
    batchRename,
    // setters used by the view
    setSearch,
    setRenameValue,
    setNewFolderName,
    setNewFolderOpen,
    setRenaming,
    setConfirm,
    setChmodTargets,
    setChmodValue,
    setBatchRename,
    // actions
    navigate,
    refresh,
    goBack,
    goForward,
    openEntry: mutations.openEntry,
    startUpload: transfers.startUpload,
    pickAndUpload: transfers.pickAndUpload,
    runUpload: transfers.runUpload,
    confirmKeepBoth: transfers.confirmKeepBoth,
    downloadEntries: transfers.downloadEntries,
    downloadRemoteDir: transfers.downloadRemoteDir,
    retryTransfer: transfers.retryTransfer,
    deleteEntries: mutations.deleteEntries,
    requestDelete,
    startRename,
    submitRename: mutations.submitRename,
    submitNewFolder: mutations.submitNewFolder,
    startChmod: mutations.startChmod,
    submitChmod: mutations.submitChmod,
    startBatchRename: mutations.startBatchRename,
    submitBatchRename: mutations.submitBatchRename,
    handleRowClick,
    handleSort,
    selectAll,
    clearSelection,
    moveFocus,
    toggleHidden,
    cancelTransfer: transfers.cancelTransfer,
    dismissTransfer: transfers.dismissTransfer,
    clearFinishedTransfers: transfers.clearFinishedTransfers,
  };
}