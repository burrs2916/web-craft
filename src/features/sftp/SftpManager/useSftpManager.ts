import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { sftpList, sftpListMany, type SftpEntry } from '../../../core/services/sftp.service';
import type { SshConnectionInfo } from '../../../proto/connection';
import { useNotify } from '../../../core/notification';
import { copyText } from '../../../core/services/clipboard.service';
import { useSftpBrowser } from '../useSftpBrowser';
import { joinRemote, readPref, writePref } from '../utils';
import { TREE_MAX, TREE_MIN, TREE_OPEN_KEY, TREE_WIDTH_KEY } from './constants';
import type { DropTarget } from './types';

/**
 * SFTP 管理器的视图状态与交互逻辑：目录树宽度/开关、拖拽上传、键盘快捷键、
 * 右键菜单锚点、路径编辑、传输面板折叠，以及浏览器子系统（useSftpBrowser）的装配。
 * 拆出后 SftpManager/index.tsx 只负责渲染装配。
 */
export function useSftpManager(ssh: SshConnectionInfo) {
  const { t } = useTranslation('fileTransfer');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const notify = useNotify().notify;
  const compact = useMediaQuery('(max-width:720px)');
  const wide = useMediaQuery('(min-width:940px)');

  const s = useSftpBrowser(ssh);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  /** Folder currently under the cursor during a drag, if any. */
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [treeOpen, setTreeOpen] = useState(() => readPref(TREE_OPEN_KEY) !== '0');
  const [treeWidth, setTreeWidth] = useState(() => {
    const raw = Number(readPref(TREE_WIDTH_KEY));
    return Number.isFinite(raw) && raw >= TREE_MIN ? Math.min(raw, TREE_MAX) : 226;
  });
  const [resizing, setResizing] = useState(false);
  const [rowMenu, setRowMenu] = useState<{ entry: SftpEntry; x: number; y: number } | null>(null);
  const [bgMenu, setBgMenu] = useState<{ x: number; y: number } | null>(null);
  const [editingPath, setEditingPath] = useState(false);
  const [pathDraft, setPathDraft] = useState('');
  const [transferCollapsed, setTransferCollapsed] = useState(false);

  const modalOpen =
    !!s.renaming ||
    s.newFolderOpen ||
    !!s.confirm ||
    !!s.chmodTargets ||
    !!s.batchRename ||
    !!rowMenu ||
    !!bgMenu ||
    editingPath;

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  // ---- drag & drop upload --------------------------------------------------

  /**
   * The OS hands us physical screen pixels, so scale them into CSS pixels
   * before hit-testing. Dropping onto a folder — a table row *or* a tree
   * node — uploads straight into it, which is what every desktop file manager
   * does and saves a round trip through the directory.
   */
  const dropTargetAtPoint = useCallback(
    (pos?: { x: number; y: number }): DropTarget | null => {
      if (!pos) return null;
      const ratio = window.devicePixelRatio || 1;
      const el = document.elementFromPoint(pos.x / ratio, pos.y / ratio) as HTMLElement | null;
      if (!el) return null;
      const treeRow = el.closest?.('[data-tree-path]') as HTMLElement | null;
      if (treeRow?.dataset.treePath) return { path: treeRow.dataset.treePath, rowName: null };
      const row = el.closest?.('[data-entry-name]') as HTMLElement | null;
      if (row && row.dataset.isDir === '1' && row.dataset.entryName) {
        return { path: joinRemote(s.path, row.dataset.entryName), rowName: row.dataset.entryName };
      }
      return null;
    },
    [s.path],
  );

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    getCurrentWebviewWindow()
      .onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === 'enter' || payload.type === 'over') {
          setDragOver(true);
          setDropTarget(dropTargetAtPoint(payload.position));
        } else if (payload.type === 'leave') {
          setDragOver(false);
          setDropTarget(null);
        } else if (payload.type === 'drop') {
          const hit = dropTargetAtPoint(payload.position);
          setDragOver(false);
          setDropTarget(null);
          const paths = (payload.paths || []).filter((p) => typeof p === 'string');
          if (paths.length > 0) {
            void s.startUpload(paths as string[], hit?.path);
          }
        }
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => {
      unlisten?.();
    };
  }, [s.startUpload, dropTargetAtPoint]);

  // ---- keyboard ------------------------------------------------------------
  const beginEditPath = useCallback(() => {
    setPathDraft(s.path === '.' ? '' : s.path);
    setEditingPath(true);
  }, [s.path]);

  const commitEditPath = useCallback(() => {
    const target = pathDraft.trim();
    setEditingPath(false);
    if (!target || target === s.path) return;
    s.navigate(target);
  }, [pathDraft, s]);

  const copyPath = useCallback(
    async (p: string) => {
      try {
        await copyText(p);
        notify(t('path_copied'));
      } catch {
        notify(t('copy_failed'), 'error');
      }
    },
    [notify, t],
  );

  const copyEntryPath = useCallback(
    (entry: SftpEntry) => copyPath(joinRemote(s.path, entry.name)),
    [copyPath, s.path],
  );

  /** The tree fetches its own nodes; the browsed directory is passed to it. */
  const listDir = useCallback(async (p: string) => (await sftpList(ssh, p)).entries, [ssh]);

  /** Batched lister feeding the tree's expand cascade. */
  const listManyDir = useCallback(async (paths: string[]) => sftpListMany(ssh, paths), [ssh]);

  const toggleTree = useCallback(() => {
    setTreeOpen((v) => {
      writePref(TREE_OPEN_KEY, v ? '0' : '1');
      return !v;
    });
  }, []);

  const startResize = useCallback(
    (e: ReactPointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = treeWidth;
      setResizing(true);
      const move = (ev: PointerEvent) => {
        setTreeWidth(Math.min(TREE_MAX, Math.max(TREE_MIN, startW + ev.clientX - startX)));
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        setResizing(false);
        // Persist from the setter so the value written is the one on screen.
        setTreeWidth((w) => {
          writePref(TREE_WIDTH_KEY, String(w));
          return w;
        });
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [treeWidth],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || modalOpen) return;
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        beginEditPath();
        return;
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        s.selectAll();
        return;
      }
      if (mod && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        s.toggleHidden();
        return;
      }
      if (mod && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleTree();
        return;
      }
      if ((mod && e.key.toLowerCase() === 'r') || e.key === 'F5') {
        e.preventDefault();
        s.refresh();
        return;
      }
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        s.goBack();
        return;
      }
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        s.goForward();
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          s.moveFocus(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          s.moveFocus(-1);
          break;
        case 'Home':
          e.preventDefault();
          s.moveFocus('first');
          break;
        case 'End':
          e.preventDefault();
          s.moveFocus('last');
          break;
        case 'Enter': {
          const f = s.displayed.find((x) => x.name === s.focused);
          if (f) void s.openEntry(f);
          break;
        }
        case 'Delete':
          s.requestDelete(Array.from(s.selected));
          break;
        case 'Backspace':
          if (s.parent) s.navigate(s.parent);
          break;
        case 'F2': {
          const f = s.entries.find((x) => x.name === s.focused);
          if (f) s.startRename(f);
          break;
        }
        case 'Escape':
          s.clearSelection();
          break;
        default:
          break;
      }
    },
    [s, modalOpen, beginEditPath, toggleTree],
  );

  const handleRowContextMenu = useCallback(
    (entry: SftpEntry, e: MouseEvent) => {
      e.preventDefault();
      if (!s.selected.has(entry.name)) {
        s.handleRowClick(entry, s.displayed.findIndex((x) => x.name === entry.name), {
          shiftKey: false,
          metaKey: false,
          ctrlKey: false,
        } as MouseEvent);
      }
      setRowMenu({ entry, x: e.clientX, y: e.clientY });
    },
    [s],
  );

  const subtle = isDark ? '#8FA3B0' : '#5A6B64';
  const textColor = isDark ? '#C9D1D9' : '#24292F';
  const border = isDark ? 'rgba(240,246,252,0.12)' : 'rgba(27,31,36,0.12)';
  const target = `${ssh.username}@${ssh.host}:${ssh.port}`;

  return {
    t,
    isDark,
    compact,
    wide,
    s,
    containerRef,
    dragOver,
    dropTarget,
    treeOpen,
    treeWidth,
    resizing,
    rowMenu,
    setRowMenu,
    bgMenu,
    setBgMenu,
    editingPath,
    setEditingPath,
    pathDraft,
    setPathDraft,
    transferCollapsed,
    setTransferCollapsed,
    beginEditPath,
    commitEditPath,
    copyPath,
    copyEntryPath,
    listDir,
    listManyDir,
    toggleTree,
    startResize,
    handleKeyDown,
    handleRowContextMenu,
    subtle,
    textColor,
    border,
    target,
  };
}