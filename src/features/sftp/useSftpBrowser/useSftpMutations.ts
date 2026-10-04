import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { TFunction } from 'i18next';
import type { SshConnectionInfo } from '../../../proto/connection';
import {
  sftpChmod,
  sftpList,
  sftpMkdir,
  sftpRemove,
  sftpRename,
  type SftpEntry,
  type SftpRemoteItem,
} from '../../../core/services/sftp.service';
import { localizeBackendError } from '../../../core/backendError';
import { isNavigable, joinRemote, permsToOctal } from '../utils';
import { OCTAL_MODE, invalidName, type NotifyFn } from './helpers';

export interface SftpMutationsDeps {
  t: TFunction;
  notify: NotifyFn;
  sshRef: { current: SshConnectionInfo };
  pathRef: { current: string };
  entriesRef: { current: SftpEntry[] };
  load: (target: string, record?: boolean) => Promise<boolean>;
  navigate: (target: string) => void;
  resetViewState: () => void;
  pushHistory: (resolved: string) => void;
  downloadEntries: (list: SftpEntry[], ask?: boolean) => Promise<void>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setSelected: Dispatch<SetStateAction<Set<string>>>;
  setFocused: Dispatch<SetStateAction<string | null>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setEntries: Dispatch<SetStateAction<SftpEntry[]>>;
  setPath: Dispatch<SetStateAction<string>>;
  renaming: SftpEntry | null;
  renameValue: string;
  setRenaming: Dispatch<SetStateAction<SftpEntry | null>>;
  setRenameValue: Dispatch<SetStateAction<string>>;
  newFolderName: string;
  setNewFolderOpen: Dispatch<SetStateAction<boolean>>;
  setNewFolderName: Dispatch<SetStateAction<string>>;
  chmodTargets: SftpEntry[] | null;
  chmodValue: string;
  setChmodValue: Dispatch<SetStateAction<string>>;
  setChmodTargets: Dispatch<SetStateAction<SftpEntry[] | null>>;
  batchRename: SftpEntry[] | null;
  setBatchRename: Dispatch<SetStateAction<SftpEntry[] | null>>;
}

/**
 * 变更子系统：删除、重命名、新建目录、权限修改、批量重命名、打开条目。
 *
 * 从 useSftpBrowser 抽离，逻辑保持不变；通过 deps 接收共享引用、目录加载器、
 * 导航函数、视图 setter 与对话框状态。
 */
export function useSftpMutations(deps: SftpMutationsDeps) {
  const {
    t,
    notify,
    sshRef,
    pathRef,
    entriesRef,
    load,
    navigate,
    resetViewState,
    pushHistory,
    downloadEntries,
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
  } = deps;

  const deleteEntries = useCallback(
    async (names: string[]) => {
      if (names.length === 0) return;
      const base = pathRef.current;
      const items: SftpRemoteItem[] = names.map((n) => {
        const e = entriesRef.current.find((x) => x.name === n);
        // `is_dir`, never `isNavigable`: deleting a symlinked folder must
        // unlink the link, not walk through it and empty the real directory.
        return { path: joinRemote(base, n), isDir: e?.is_dir ?? false };
      });
      try {
        setBusy(true);
        await sftpRemove(sshRef.current, items);
        notify(names.length === 1 ? t('deleted', { name: names[0] }) : t('deleted_count', { count: names.length }));
        setSelected(new Set());
        setFocused(null);
        await load(base, false);
      } catch (e) {
        notify(localizeBackendError(e), 'error');
      } finally {
        setBusy(false);
      }
    },
    [t, notify, load, pathRef, entriesRef, sshRef, setBusy, setSelected, setFocused],
  );

  const submitRename = useCallback(async () => {
    const next = renameValue.trim();
    if (!renaming || !next) return;
    if (next === renaming.name) {
      setRenaming(null);
      return;
    }
    if (invalidName(next)) {
      notify(t('invalid_name'), 'error');
      return;
    }
    if (entriesRef.current.some((e) => e.name === next)) {
      notify(t('name_taken', { name: next }), 'error');
      return;
    }
    const base = pathRef.current;
    try {
      setBusy(true);
      await sftpRename(sshRef.current, joinRemote(base, renaming.name), joinRemote(base, next));
      notify(t('renamed'));
      setRenaming(null);
      setRenameValue('');
      setSelected(new Set([next]));
      setFocused(next);
      await load(base, false);
    } catch (e) {
      notify(localizeBackendError(e), 'error');
    } finally {
      setBusy(false);
    }
  }, [renaming, renameValue, t, notify, load, pathRef, entriesRef, sshRef, setBusy, setRenaming, setRenameValue, setSelected, setFocused]);

  const submitNewFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name) return;
    if (invalidName(name)) {
      notify(t('invalid_name'), 'error');
      return;
    }
    if (entriesRef.current.some((e) => e.name === name)) {
      notify(t('name_taken', { name }), 'error');
      return;
    }
    const base = pathRef.current;
    try {
      setBusy(true);
      await sftpMkdir(sshRef.current, joinRemote(base, name));
      notify(t('folder_created'));
      setNewFolderOpen(false);
      setNewFolderName('');
      setSelected(new Set([name]));
      setFocused(name);
      await load(base, false);
    } catch (e) {
      notify(localizeBackendError(e), 'error');
    } finally {
      setBusy(false);
    }
  }, [newFolderName, t, notify, load, pathRef, entriesRef, sshRef, setBusy, setNewFolderOpen, setNewFolderName, setSelected, setFocused]);

  const startChmod = useCallback((list: SftpEntry[]) => {
    if (list.length === 0) return;
    // Seed with the first target's current bits so a single-file edit starts
    // from the truth instead of a guess.
    setChmodValue(permsToOctal(list[0].perms) || (list[0].is_dir ? '755' : '644'));
    setChmodTargets(list);
  }, [setChmodValue, setChmodTargets]);

  /**
   * Apply POSIX permission bits. Windows remotes answer with a plain refusal,
   * which is surfaced as-is rather than dressed up as success.
   */
  const submitChmod = useCallback(async () => {
    if (!chmodTargets || chmodTargets.length === 0) return;
    const mode = chmodValue.trim();
    if (!OCTAL_MODE.test(mode)) {
      notify(t('invalid_mode'), 'error');
      return;
    }
    const base = pathRef.current;
    const targets = chmodTargets.map((e) => joinRemote(base, e.name));
    try {
      setBusy(true);
      await sftpChmod(sshRef.current, targets, mode);
      notify(
        targets.length === 1
          ? t('perms_changed', { name: chmodTargets[0].name, mode })
          : t('perms_changed_count', { count: targets.length, mode }),
      );
      setChmodTargets(null);
      await load(base, false);
    } catch (e) {
      notify(localizeBackendError(e), 'error');
    } finally {
      setBusy(false);
    }
  }, [chmodTargets, chmodValue, t, notify, load, pathRef, sshRef, setBusy, setChmodTargets]);

  /**
   * Open the batch-rename dialog over a selection. Entries are sorted by name
   * so the `{n}` sequence placeholder is deterministic no matter how the user
   * assembled the selection.
   */
  const startBatchRename = useCallback((list: SftpEntry[]) => {
    if (list.length < 1) return;
    setBatchRename(
      [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    );
  }, [setBatchRename]);

  const submitBatchRename = useCallback(
    async (newNames: string[]) => {
      const targets = batchRename;
      if (!targets || targets.length === 0 || newNames.length !== targets.length) {
        setBatchRename(null);
        return;
      }
      const base = pathRef.current;
      let done = 0;
      try {
        setBusy(true);
        for (let i = 0; i < targets.length; i++) {
          const oldName = targets[i].name;
          const newName = (newNames[i] ?? '').trim();
          if (!newName || newName === oldName) continue;
          if (invalidName(newName)) {
            notify(t('batch_rename_invalid', { name: newName }), 'error');
            break;
          }
          await sftpRename(sshRef.current, joinRemote(base, oldName), joinRemote(base, newName));
          done++;
        }
        if (done > 0) notify(t('renamed_count', { count: done }));
      } catch (e) {
        notify(localizeBackendError(e), 'error');
      } finally {
        setBusy(false);
        setBatchRename(null);
        setSelected(new Set());
        setFocused(null);
        await load(base, false);
      }
    },
    [batchRename, t, notify, load, pathRef, sshRef, setBusy, setBatchRename, setSelected, setFocused],
  );

  /**
   * Open whatever the row points at.
   *
   * Symlinked folders are resolved by the listing probe, so they navigate
   * straight away. The listing-based fallback below still matters: when the
   * probe could not run (an sftp client too old for `ls -1`, a directory the
   * glob cannot read) a symlink arrives unresolved, and trying the listing is
   * the difference between "walks in" and "dead end".
   */
  const openEntry = useCallback(
    async (entry: SftpEntry) => {
      const target = joinRemote(pathRef.current, entry.name);
      if (isNavigable(entry)) {
        navigate(target);
        return;
      }
      if (entry.is_symlink) {
        setLoading(true);
        try {
          const res = await sftpList(sshRef.current, target);
          resetViewState();
          setEntries(res.entries);
          setPath(res.path);
          pathRef.current = res.path;
          pushHistory(res.path);
          return;
        } catch {
          notify(t('link_not_dir'));
        } finally {
          setLoading(false);
        }
      }
      void downloadEntries([entry]);
    },
    [navigate, resetViewState, pushHistory, downloadEntries, notify, t, sshRef, pathRef, setLoading, setEntries, setPath],
  );

  return {
    deleteEntries,
    submitRename,
    submitNewFolder,
    startChmod,
    submitChmod,
    startBatchRename,
    submitBatchRename,
    openEntry,
  };
}