import type { SshConnectionInfo } from '../../../proto/connection';
import type { useSftpBrowser } from '../useSftpBrowser';

/** The full state + actions surface returned by useSftpBrowser. */
export type SftpBrowser = ReturnType<typeof useSftpBrowser>;

/** Where a dragged batch would land, and the table row to highlight (if any). */
export interface DropTarget {
  path: string;
  rowName: string | null;
}

export interface SftpManagerProps {
  ssh: SshConnectionInfo;
}