import type { SftpRemoteItem } from '../../../core/services/sftp.service';
import { readPref, type SortDir, type SortKey } from '../utils';

export const DOWNLOAD_DIR_KEY = 'sftp.downloadDir';
export const SHOW_HIDDEN_KEY = 'sftp.showHidden';
export const SORT_KEY = 'sftp.sort';
/** Three or four octal digits — the only thing `chmod` accepts. */
export const OCTAL_MODE = /^[0-7]{3,4}$/;

/** Notification sink type (structurally matches `useNotify().notify`). */
export type NotifyFn = (message: string, severity?: 'success' | 'error' | 'warning' | 'info') => void;

/**
 * True only when the local OpenSSH client is missing.
 *
 * Matching a bare /sftp/ would swallow every ordinary failure — the backend
 * prefixes those with "SFTP 操作失败" — and replace the file list with a
 * full-screen "please install OpenSSH" page.
 */
export function isSftpMissingError(e: unknown): boolean {
  const msg = typeof e === 'string' ? e : e instanceof Error ? e.message : JSON.stringify(e);
  return /无法定位 sftp 程序|SFTP client .{0,24}not found|OpenSSH\.Client/i.test(msg);
}

/** Names that would silently target the wrong node if we passed them through. */
export function invalidName(name: string): boolean {
  return name.includes('/') || name.includes('\\') || name === '.' || name === '..';
}

/** Restore the saved column ordering, falling back to name ascending. */
export function readSort(): { key: SortKey; dir: SortDir } {
  const raw = readPref(SORT_KEY);
  const [k, d] = (raw ?? '').split(':');
  const key: SortKey = k === 'size' || k === 'mtime' ? k : 'name';
  const dir: SortDir = d === 'desc' ? 'desc' : 'asc';
  return { key, dir };
}

export interface HistoryState {
  canBack: boolean;
  canForward: boolean;
}

/**
 * Everything needed to replay a transfer without asking the user anything
 * again. A failed upload otherwise costs the whole picker dance a second time,
 * and after a dropped connection that is the single most likely next action.
 */
export type RetryPayload =
  | { kind: 'upload'; paths: string[]; dir: string; remoteNames?: string[] }
  | { kind: 'download'; items: SftpRemoteItem[]; dir: string };

/** A transfer that has a row on screen but has not been handed to the backend. */
export interface QueuedTransfer {
  id: string;
  run: () => Promise<void>;
}

/** True for the backend's "you asked me to stop" answer, in either language. */
export function isCancellation(msg: string): boolean {
  return /取消|cancel/i.test(msg);
}

/**
 * Find a remote file name that does not collide with anything already present
 * (or already claimed in this batch). Mirrors what every OS file manager does
 * on a name clash: `report.pdf` -> `report (1).pdf` -> `report (2).pdf`.
 * `taken` is mutated so successive calls in one batch stay unique.
 */
export function uniqueRemoteName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  const dot = base.lastIndexOf('.');
  const hasExt = dot > 0 && dot < base.length - 1;
  const stem = hasExt ? base.slice(0, dot) : base;
  const ext = hasExt ? base.slice(dot) : '';
  let n = 1;
  let candidate: string;
  do {
    candidate = `${stem} (${n})${ext}`;
    n += 1;
  } while (taken.has(candidate));
  taken.add(candidate);
  return candidate;
}