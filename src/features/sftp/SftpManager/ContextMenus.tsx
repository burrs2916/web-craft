import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useTranslation } from 'react-i18next';
import {
  ArrowClockwiseIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  LockKeyIcon,
  PencilSimpleIcon,
  SelectionAllIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import type { SftpEntry } from '../../../core/services/sftp.service';
import { isNavigable } from '../utils';
import type { SftpBrowser } from './types';

const itemTextSx = { primary: { sx: { fontSize: 13 } } };

/** Right-click menu for a table row (open / download / rename / chmod / delete…). */
export function RowContextMenu({
  browser: s,
  menu,
  onClose,
  subtle,
  onCopyPath,
}: {
  browser: SftpBrowser;
  menu: { entry: SftpEntry; x: number; y: number } | null;
  onClose: () => void;
  subtle: string;
  onCopyPath: (entry: SftpEntry) => void;
}) {
  const { t } = useTranslation('fileTransfer');

  return (
    <Menu
      open={!!menu}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={menu ? { top: menu.y, left: menu.x } : undefined}
    >
      <MenuItem
        dense
        onClick={() => {
          const en = menu!.entry;
          onClose();
          void s.openEntry(en);
        }}
      >
        <ListItemIcon sx={{ minWidth: 26 }}>
          {menu && isNavigable(menu.entry) ? (
            <FolderOpenIcon size={15} color={subtle} />
          ) : (
            <DownloadIcon size={15} color={subtle} />
          )}
        </ListItemIcon>
        <ListItemText slotProps={itemTextSx}>
          {menu && isNavigable(menu.entry) ? t('context_open') : t('context_download')}
        </ListItemText>
      </MenuItem>
      {/* For a single file the first item already downloads it — only offer
          the plain download again when it means something different. */}
      {((menu && isNavigable(menu.entry)) || s.selected.size > 1) && (
        <MenuItem
          dense
          onClick={() => {
            onClose();
            void s.downloadEntries(s.selectedEntries, false);
          }}
        >
          <ListItemIcon sx={{ minWidth: 26 }}>
            <DownloadIcon size={15} color={subtle} />
          </ListItemIcon>
          <ListItemText slotProps={itemTextSx}>{t('context_download')}</ListItemText>
        </MenuItem>
      )}
      <MenuItem
        dense
        onClick={() => {
          onClose();
          void s.downloadEntries(s.selectedEntries, true);
        }}
      >
        <ListItemIcon sx={{ minWidth: 26 }}>
          <FolderIcon size={15} color={subtle} />
        </ListItemIcon>
        <ListItemText slotProps={itemTextSx}>{t('download_to')}</ListItemText>
      </MenuItem>
      <MenuItem
        dense
        onClick={() => {
          const en = menu!.entry;
          onClose();
          void onCopyPath(en);
        }}
      >
        <ListItemIcon sx={{ minWidth: 26 }}>
          <CopyIcon size={15} color={subtle} />
        </ListItemIcon>
        <ListItemText slotProps={itemTextSx}>{t('copy_path')}</ListItemText>
      </MenuItem>
      <MenuItem
        dense
        disabled={s.selected.size !== 1}
        onClick={() => {
          const en = menu!.entry;
          onClose();
          s.startRename(en);
        }}
      >
        <ListItemIcon sx={{ minWidth: 26 }}>
          <PencilSimpleIcon size={15} color={subtle} />
        </ListItemIcon>
        <ListItemText slotProps={itemTextSx}>{t('context_rename')}</ListItemText>
      </MenuItem>
      <MenuItem
        dense
        disabled={s.selected.size < 2}
        onClick={() => {
          onClose();
          s.startBatchRename(s.selectedEntries);
        }}
      >
        <ListItemIcon sx={{ minWidth: 26 }}>
          <PencilSimpleIcon size={15} color={subtle} />
        </ListItemIcon>
        <ListItemText slotProps={itemTextSx}>{t('context_batch_rename')}</ListItemText>
      </MenuItem>
      <MenuItem
        dense
        disabled={s.selected.size === 0}
        onClick={() => {
          onClose();
          s.startChmod(s.selectedEntries);
        }}
      >
        <ListItemIcon sx={{ minWidth: 26 }}>
          <LockKeyIcon size={15} color={subtle} />
        </ListItemIcon>
        <ListItemText slotProps={itemTextSx}>{t('context_chmod')}</ListItemText>
      </MenuItem>
      <MenuItem
        dense
        onClick={() => {
          const names = s.selected.size > 0 ? Array.from(s.selected) : [menu!.entry.name];
          onClose();
          s.requestDelete(names);
        }}
      >
        <ListItemIcon sx={{ minWidth: 26 }}>
          <TrashIcon size={15} color="#e5484d" />
        </ListItemIcon>
        <ListItemText slotProps={{ primary: { sx: { fontSize: 13, color: '#e5484d' } } }}>
          {t('context_delete')}
        </ListItemText>
      </MenuItem>
    </Menu>
  );
}

/** Right-click menu for the empty area behind the file table. */
export function BackgroundContextMenu({
  browser: s,
  menu,
  onClose,
  subtle,
}: {
  browser: SftpBrowser;
  menu: { x: number; y: number } | null;
  onClose: () => void;
  subtle: string;
}) {
  const { t } = useTranslation('fileTransfer');

  return (
    <Menu
      open={!!menu}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={menu ? { top: menu.y, left: menu.x } : undefined}
    >
      <MenuItem
        dense
        onClick={() => {
          onClose();
          void s.pickAndUpload('files');
        }}
      >
        <ListItemIcon sx={{ minWidth: 26 }}>
          <FileIcon size={15} color={subtle} />
        </ListItemIcon>
        <ListItemText slotProps={itemTextSx}>{t('upload_files')}</ListItemText>
      </MenuItem>
      <MenuItem
        dense
        onClick={() => {
          onClose();
          void s.pickAndUpload('folder');
        }}
      >
        <ListItemIcon sx={{ minWidth: 26 }}>
          <FolderIcon size={15} color={subtle} />
        </ListItemIcon>
        <ListItemText slotProps={itemTextSx}>{t('upload_folder')}</ListItemText>
      </MenuItem>
      <MenuItem
        dense
        onClick={() => {
          onClose();
          s.setNewFolderOpen(true);
        }}
      >
        <ListItemIcon sx={{ minWidth: 26 }}>
          <FolderPlusIcon size={15} color={subtle} />
        </ListItemIcon>
        <ListItemText slotProps={itemTextSx}>{t('new_folder')}</ListItemText>
      </MenuItem>
      <MenuItem
        dense
        onClick={() => {
          onClose();
          s.selectAll();
        }}
      >
        <ListItemIcon sx={{ minWidth: 26 }}>
          <SelectionAllIcon size={15} color={subtle} />
        </ListItemIcon>
        <ListItemText slotProps={itemTextSx}>{t('select_all')}</ListItemText>
      </MenuItem>
      <MenuItem
        dense
        onClick={() => {
          onClose();
          s.toggleHidden();
        }}
      >
        <ListItemIcon sx={{ minWidth: 26 }}>
          <EyeIcon size={15} color={subtle} />
        </ListItemIcon>
        <ListItemText slotProps={itemTextSx}>{s.showHidden ? t('hide_hidden') : t('show_hidden')}</ListItemText>
      </MenuItem>
      <MenuItem
        dense
        onClick={() => {
          onClose();
          s.refresh();
        }}
      >
        <ListItemIcon sx={{ minWidth: 26 }}>
          <ArrowClockwiseIcon size={15} color={subtle} />
        </ListItemIcon>
        <ListItemText slotProps={itemTextSx}>{t('refresh')}</ListItemText>
      </MenuItem>
    </Menu>
  );
}