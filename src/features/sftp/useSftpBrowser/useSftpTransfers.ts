import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { TFunction } from 'i18next';
import { open } from '@tauri-apps/plugin-dialog';
import type { SshConnectionInfo } from '../../../proto/connection';
import {
  onSftpProgress,
  sftpCancel,
  sftpDownload,
  sftpList,
  sftpUpload,
  type SftpEntry,
  type SftpProgressPayload,
  type SftpRemoteItem,
} from '../../../core/services/sftp.service';
import { localizeBackendError } from '../../../core/backendError';
import { isActiveTransfer, type TransferItem } from '../TransferQueue';
import type { ConfirmState } from '../SftpDialogs';
import { basename, isNavigable, joinRemote, newTransferId, readPref, writePref } from '../utils';
import {
  DOWNLOAD_DIR_KEY,
  isCancellation,
  uniqueRemoteName,
  type NotifyFn,
  type QueuedTransfer,
  type RetryPayload,
} from './helpers';

export interface SftpTransfersDeps {
  t: TFunction;
  notify: NotifyFn;
  sshRef: { current: SshConnectionInfo };
  pathRef: { current: string };
  entriesRef: { current: SftpEntry[] };
  load: (target: string, record?: boolean) => Promise<boolean>;
  confirm: ConfirmState;
  setConfirm: Dispatch<SetStateAction<ConfirmState>>;
}

/**
 * 传输子系统：进度订阅、单槽队列（pump）、上传/下载/重试/取消/清理。
 *
 * 从 useSftpBrowser 抽离，逻辑保持不变；仅通过 deps 接收翻译函数、通知、
 * 连接/路径/目录引用、目录加载器与覆盖确认状态。
 */
export function useSftpTransfers(deps: SftpTransfersDeps) {
  const { t, notify, sshRef, pathRef, entriesRef, load, confirm, setConfirm } = deps;

  const [transfers, setTransfers] = useState<TransferItem[]>([]);

  /** Replay data per transfer id, dropped as soon as the row is dismissed. */
  const retryRef = useRef<Map<string, RetryPayload>>(new Map());
  /** Transfers waiting for the single slot, in the order the user asked for them. */
  const queueRef = useRef<QueuedTransfer[]>([]);
  /** Id of the transfer currently talking to the backend, if any. */
  const activeRef = useRef<string | null>(null);
  /** Indirection so the pump can re-enter itself without a stale closure. */
  const pumpRef = useRef<() => void>(() => {});

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    onSftpProgress((p: SftpProgressPayload) => {
      setTransfers((prev) =>
        prev.map((x) => {
          if (x.id !== p.transferId) return x;
          // A new file name on the wire means the previous one finished, which
          // is the only "n of m" signal OpenSSH gives us.
          const advanced = x.currentFile !== undefined && x.currentFile !== p.file;
          return {
            ...x,
            percent: p.percent,
            currentFile: p.file,
            fileNo: advanced ? (x.fileNo ?? 1) + 1 : (x.fileNo ?? 1),
            rate: p.rate,
            eta: p.eta,
          };
        }),
      );
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => {
      unlisten?.();
    };
  }, []);

  /**
   * Add the row, or reset it in place when this is a retry — replacing the
   * whole object is what clears the stale error, rate and per-file counter.
   */
  const openTransferRow = useCallback((row: TransferItem) => {
    setTransfers((prev) =>
      prev.some((x) => x.id === row.id)
        ? prev.map((x) => (x.id === row.id ? row : x))
        : [...prev, row],
    );
  }, []);

  /**
   * Renumber the waiting rows from the queue itself, so the position a user
   * reads is never a stale copy of where the transfer used to be.
   */
  const syncQueuePositions = useCallback(() => {
    const order = new Map(queueRef.current.map((q, i) => [q.id, i + 1]));
    setTransfers((prev) =>
      prev.map((x) => {
        const pos = order.get(x.id);
        if (pos === undefined) return x;
        return x.queuePos === pos ? x : { ...x, queuePos: pos };
      }),
    );
  }, []);

  /**
   * Start the next transfer when the slot is free.
   *
   * One at a time is not a throttle we chose — the backend serialises the
   * transfer lane behind a mutex. Mirroring that here is what lets a waiting
   * row say "queued, 2nd" instead of sitting at "running · 0%" with no rate
   * and no ETA, which is indistinguishable from a hang.
   */
  const pump = useCallback(() => {
    if (activeRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;
    activeRef.current = next.id;
    syncQueuePositions();
    void next.run().finally(() => {
      activeRef.current = null;
      pumpRef.current();
    });
  }, [syncQueuePositions]);
  pumpRef.current = pump;

  const enqueueTransfer = useCallback(
    (id: string, run: () => Promise<void>) => {
      queueRef.current.push({ id, run });
      syncQueuePositions();
      pumpRef.current();
    },
    [syncQueuePositions],
  );

  /** Take a transfer out of the waiting line. Returns false if it already ran. */
  const dequeueTransfer = useCallback(
    (id: string): boolean => {
      const idx = queueRef.current.findIndex((q) => q.id === id);
      if (idx < 0) return false;
      queueRef.current.splice(idx, 1);
      syncQueuePositions();
      return true;
    },
    [syncQueuePositions],
  );

  /** Move a finished transfer's row into its terminal state. */
  const settleTransfer = useCallback((id: string, e: unknown): string => {
    const msg = localizeBackendError(e);
    const cancelled = isCancellation(msg);
    setTransfers((prev) =>
      prev.map((x) =>
        x.id === id
          ? {
              ...x,
              status: cancelled ? 'cancelled' : 'error',
              queuePos: undefined,
              error: cancelled ? undefined : msg,
            }
          : x,
      ),
    );
    return cancelled ? '' : msg;
  }, []);

  const runUpload = useCallback(
    (
      paths: string[],
      dir: string,
      reuseId?: string,
      remoteNames?: string[],
      resume = false,
    ) => {
      const count = paths.length;
      const id = reuseId ?? newTransferId();
      retryRef.current.set(id, { kind: 'upload', paths, dir, remoteNames });
      openTransferRow({
        id,
        kind: 'upload',
        label: count === 1 ? basename(paths[0]) : t('upload_count', { count }),
        count,
        status: 'queued',
        percent: 0,
        startedAt: Date.now(),
        retryable: true,
        resuming: resume,
      });
      enqueueTransfer(id, async () => {
        // `startedAt` is reset here rather than at queue time so the elapsed
        // time reflects the transfer, not the wait.
        setTransfers((prev) =>
          prev.map((x) =>
            x.id === id
              ? { ...x, status: 'running', queuePos: undefined, startedAt: Date.now() }
              : x,
          ),
        );
        try {
          await sftpUpload(sshRef.current, paths, dir, id, remoteNames, resume);
          setTransfers((prev) =>
            prev.map((x) =>
              x.id === id ? { ...x, status: 'done', percent: 100, queuePos: undefined } : x,
            ),
          );
          notify(
            count === 1
              ? t('uploaded', { name: basename(paths[0]) })
              : t('uploaded_count', { count }),
          );
          // Refresh whatever the user is looking at: either the destination
          // itself, or the parent whose folder row just grew.
          await load(pathRef.current, false);
        } catch (e) {
          // A cancel the user asked for is not news; the row already says so.
          const msg = settleTransfer(id, e);
          if (msg) notify(msg, 'error');
        }
      });
    },
    [t, notify, load, openTransferRow, enqueueTransfer, settleTransfer],
  );

  /**
   * Warn about same-name collisions before anything is overwritten.
   *
   * `targetDir` is set when files are dropped straight onto a folder row; that
   * directory is not on screen, so its contents are fetched to keep the
   * overwrite warning as trustworthy as it is for the current directory.
   */
  const startUpload = useCallback(
    async (paths: string[], targetDir?: string) => {
      if (paths.length === 0) return;
      const dir = targetDir ?? pathRef.current;
      let existing: { name: string; isDir: boolean }[];
      // `isNavigable`, because that is what the collision will actually behave
      // like: uploading a folder onto a symlinked folder merges into its
      // target, so the dialog has to say "merge", not "replace this file".
      if (dir === pathRef.current) {
        existing = entriesRef.current.map((e) => ({ name: e.name, isDir: isNavigable(e) }));
      } else {
        try {
          const res = await sftpList(sshRef.current, dir);
          existing = res.entries.map((e) => ({ name: e.name, isDir: isNavigable(e) }));
        } catch {
          // Unreadable target: let the transfer itself report the real reason
          // instead of blocking on a collision check we cannot perform.
          existing = [];
        }
      }
      const dirNames = new Set(existing.filter((e) => e.isDir).map((e) => e.name));
      const names = new Set(existing.map((e) => e.name));
      const conflicts = paths
        .map(basename)
        .filter((n) => names.has(n))
        .map((name) => ({ name, isDir: dirNames.has(name) }));
      if (conflicts.length > 0) {
        // Pre-compute the "keep both" target names so the dialog's third
        // button can act without re-listing the directory. `taken` starts with
        // everything already in the destination and grows as we assign, so two
        // selected files that share a basename also get disambiguated.
        const taken = new Set(existing.map((e) => e.name));
        const keepBothNames = paths.map((p) => uniqueRemoteName(basename(p), taken));
        setConfirm({ kind: 'overwrite', paths, conflicts, dir, keepBothNames });
        return;
      }
      runUpload(paths, dir);
    },
    [runUpload, pathRef, entriesRef, sshRef, setConfirm],
  );

  /** `targetDir` lets the tree upload into a folder the table is not showing. */
  const pickAndUpload = useCallback(
    async (mode: 'files' | 'folder', targetDir?: string) => {
      try {
        const picked = await open(
          mode === 'folder'
            ? { directory: true, multiple: true, title: t('upload_folder') }
            : { multiple: true, title: t('upload_files') },
        );
        if (!picked) return;
        const paths = (Array.isArray(picked) ? picked : [picked]).filter(
          (f): f is string => typeof f === 'string',
        );
        await startUpload(paths, targetDir);
      } catch (e) {
        notify(localizeBackendError(e), 'error');
      }
    },
    [t, notify, startUpload],
  );

  /**
   * Upload every selected item, renaming on a name clash so nothing is
   * overwritten and nothing is silently dropped. The disambiguated names were
   * computed up front in `startUpload`.
   */
  const confirmKeepBoth = useCallback(() => {
    if (confirm?.kind !== 'overwrite') return;
    const { paths, dir, keepBothNames } = confirm;
    setConfirm(null);
    void runUpload(paths, dir, undefined, keepBothNames);
  }, [confirm, runUpload, setConfirm]);

  const pickDownloadDir = useCallback(async (): Promise<string | null> => {
    const previous = readPref(DOWNLOAD_DIR_KEY);
    const dir = await open({
      directory: true,
      title: t('choose_local_dir'),
      defaultPath: previous ?? undefined,
    });
    if (!dir || typeof dir !== 'string') return null;
    writePref(DOWNLOAD_DIR_KEY, dir);
    return dir;
  }, [t]);

  const runDownload = useCallback(
    (items: SftpRemoteItem[], dir: string, reuseId?: string, resume = false) => {
      const count = items.length;
      const id = reuseId ?? newTransferId();
      retryRef.current.set(id, { kind: 'download', items, dir });
      openTransferRow({
        id,
        kind: 'download',
        label: count === 1 ? basename(items[0].path) : t('download_count', { count }),
        count,
        status: 'queued',
        percent: 0,
        startedAt: Date.now(),
        retryable: true,
        resuming: resume,
      });
      enqueueTransfer(id, async () => {
        setTransfers((prev) =>
          prev.map((x) =>
            x.id === id
              ? { ...x, status: 'running', queuePos: undefined, startedAt: Date.now() }
              : x,
          ),
        );
        try {
          await sftpDownload(sshRef.current, items, dir, id, resume);
          setTransfers((prev) =>
            prev.map((x) =>
              x.id === id ? { ...x, status: 'done', percent: 100, queuePos: undefined } : x,
            ),
          );
          notify(t('downloaded_to', { count, dir }));
        } catch (e) {
          const msg = settleTransfer(id, e);
          if (msg) notify(msg, 'error');
        }
      });
    },
    [t, notify, openTransferRow, enqueueTransfer, settleTransfer],
  );

  /**
   * Directories are downloaded recursively — the backend already passes `-r`
   * to sftp, so refusing folders here was pure UI friction.
   */
  const downloadEntries = useCallback(
    async (list: SftpEntry[], ask = false) => {
      if (list.length === 0) {
        notify(t('no_selection'));
        return;
      }
      // Resolve the folder *before* the queue row is created so a cancelled
      // picker never leaves a ghost entry behind.
      const dir = (!ask && readPref(DOWNLOAD_DIR_KEY)) || (await pickDownloadDir());
      if (!dir) return;

      const base = pathRef.current;
      const items: SftpRemoteItem[] = list.map((e) => ({
        // Symlinked folders download recursively, like the target they stand
        // for — `get` without `-r` would just fail with "not a regular file".
        path: joinRemote(base, e.name),
        isDir: isNavigable(e),
      }));
      runDownload(items, dir);
    },
    [t, notify, pickDownloadDir, runDownload, pathRef],
  );

  /**
   * Download an arbitrary remote directory — e.g. a node in the side tree — the
   * same way a table row would: recursively, with a destination picker. The
   * path is absolute (not relative to the browsed table dir), so it is built
   * straight from the argument.
   */
  const downloadRemoteDir = useCallback(
    async (remotePath: string) => {
      const dir = await pickDownloadDir();
      if (!dir) return;
      runDownload([{ path: remotePath, isDir: true }], dir);
    },
    [pickDownloadDir, runDownload],
  );

  /**
   * Replay a finished transfer exactly as it was queued. The remote paths are
   * absolute and the local folder is remembered, so this stays correct even
   * after the user has browsed somewhere else in the meantime.
   *
   * `resume` picks up where the interrupted attempt stopped instead of sending
   * everything again — the difference between minutes and hours once a
   * multi-gigabyte transfer drops at 90%.
   */
  const retryTransfer = useCallback(
    (id: string, resume = false) => {
      const payload = retryRef.current.get(id);
      if (!payload) return;
      if (payload.kind === 'upload') {
        // Deliberately bypasses the overwrite prompt: a retry after a partial
        // upload would collide with its own leftovers every single time. The
        // same remote names (if any) are replayed so "keep both" stays correct.
        runUpload(payload.paths, payload.dir, id, payload.remoteNames, resume);
      } else {
        runDownload(payload.items, payload.dir, id, resume);
      }
    },
    [runUpload, runDownload],
  );

  const markCancelled = useCallback((id: string) => {
    setTransfers((prev) =>
      prev.map((x) =>
        x.id === id && isActiveTransfer(x)
          ? { ...x, status: 'cancelled', queuePos: undefined }
          : x,
      ),
    );
  }, []);

  const cancelTransfer = useCallback(
    async (id: string) => {
      // Still waiting its turn: dropping it from the line is instant and the
      // backend never has to hear about a transfer it was never given.
      if (dequeueTransfer(id)) {
        retryRef.current.delete(id);
        markCancelled(id);
        return;
      }
      const ok = await sftpCancel(id).catch(() => false);
      if (ok) markCancelled(id);
      // A `false` here means the transfer finished between the click and the
      // call; the row is about to settle on its own, so stay quiet.
    },
    [dequeueTransfer, markCancelled],
  );

  const dismissTransfer = useCallback(
    (id: string) => {
      // Closing a waiting row has to cancel it too — otherwise the transfer
      // would still fire with no row left to report it.
      dequeueTransfer(id);
      retryRef.current.delete(id);
      setTransfers((prev) => prev.filter((x) => x.id !== id));
    },
    [dequeueTransfer],
  );

  const clearFinishedTransfers = useCallback(() => {
    setTransfers((prev) => {
      // Drop the replay payloads along with the rows, otherwise a long session
      // keeps every path list it has ever transferred alive. Queued rows stay:
      // they are still going to run.
      for (const x of prev) if (!isActiveTransfer(x)) retryRef.current.delete(x.id);
      return prev.filter(isActiveTransfer);
    });
  }, []);

  /** Drop everything still waiting (used when the window goes away). */
  const discardPendingTransfers = useCallback(() => {
    queueRef.current = [];
  }, []);

  return {
    transfers,
    runUpload,
    startUpload,
    pickAndUpload,
    confirmKeepBoth,
    downloadEntries,
    downloadRemoteDir,
    retryTransfer,
    cancelTransfer,
    dismissTransfer,
    clearFinishedTransfers,
    discardPendingTransfers,
  };
}