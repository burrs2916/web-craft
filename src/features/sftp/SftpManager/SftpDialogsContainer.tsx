import { useTranslation } from 'react-i18next';
import { SftpDialogs } from '../SftpDialogs';
import { basename } from '../utils';
import type { SftpBrowser } from './types';

/**
 * 把 SftpDialogs 的标签与回调从主视图里独立出来：重命名、新建目录、覆盖确认、
 * 权限修改、批量重命名等对话框的编排都集中在这里。
 */
export function SftpDialogsContainer({ browser: s, isDark }: { browser: SftpBrowser; isDark: boolean }) {
  const { t } = useTranslation('fileTransfer');

  return (
    <SftpDialogs
      isDark={isDark}
      busy={s.busy}
      renaming={s.renaming}
      renameValue={s.renameValue}
      newFolderOpen={s.newFolderOpen}
      newFolderName={s.newFolderName}
      confirm={s.confirm}
      chmodTargets={s.chmodTargets}
      chmodValue={s.chmodValue}
      batchRename={s.batchRename}
      existingNames={s.entries.map((e) => e.name)}
      labels={{
        cancel: t('cancel'),
        ok: t('ok'),
        delete: t('delete'),
        renameTitle: t('rename_title'),
        newFolderTitle: t('new_folder_title'),
        folderName: t('folder_name'),
        overwriteTitle: t('overwrite_title'),
        overwriteDesc: t('overwrite_desc'),
        overwriteMergeHint: t('overwrite_merge_hint'),
        overwrite: t('overwrite'),
        overwriteKeepBoth: t('overwrite_keep_both'),
        overwriteKeepBothHint: t('overwrite_keep_both_hint'),
        overwriteSkip: t('overwrite_skip'),
        permsTitle: t('perms_title'),
        permsMode: t('perms_mode'),
        permsSubject: t('perms_subject', { count: s.chmodTargets ? s.chmodTargets.length : 0 }),
        permsOwner: t('perms_owner'),
        permsGroup: t('perms_group'),
        permsOther: t('perms_other'),
        permsRead: t('perms_read'),
        permsWrite: t('perms_write'),
        permsExec: t('perms_exec'),
        permsHint: t('perms_hint'),
        permsInvalid: t('perms_invalid'),
        apply: t('apply'),
        batchRenameTitle: t('batch_rename_title'),
        batchRenameSubject: t('batch_rename_subject', { count: s.batchRename ? s.batchRename.length : 0 }),
        batchRenameDesc: t('batch_rename_desc'),
        batchRenamePattern: t('batch_rename_pattern'),
        batchRenameHint: t('batch_rename_hint'),
        batchRenamePreview: t('batch_rename_preview'),
        batchRenameMore: (count) => t('batch_rename_more', { count }),
        batchRenameApply: t('batch_rename_apply'),
        batchRenameEmpty: t('batch_rename_empty'),
        batchRenameDuplicate: t('batch_rename_duplicate'),
        batchRenameInvalid: (name) => t('batch_rename_invalid', { name }),
        batchRenameConflict: (name) => t('batch_rename_conflict', { name }),
        deleteMessage:
          s.confirm?.kind === 'delete'
            ? s.confirm.names.length === 1
              ? t('delete_confirm', { name: s.confirm.names[0] })
              : t('delete_count_confirm', { count: s.confirm.names.length })
            : '',
      }}
      onRenameChange={s.setRenameValue}
      onRenameCancel={() => s.setRenaming(null)}
      onRenameSubmit={() => void s.submitRename()}
      onFolderChange={s.setNewFolderName}
      onFolderCancel={() => s.setNewFolderOpen(false)}
      onFolderSubmit={() => void s.submitNewFolder()}
      onConfirmCancel={() => s.setConfirm(null)}
      onOverwriteAll={() => {
        if (s.confirm?.kind !== 'overwrite') return;
        const { paths, dir } = s.confirm;
        s.setConfirm(null);
        void s.runUpload(paths, dir);
      }}
      onOverwriteSkip={() => {
        if (s.confirm?.kind !== 'overwrite') return;
        const { paths, conflicts, dir } = s.confirm;
        s.setConfirm(null);
        const taken = new Set(conflicts.map((c) => c.name));
        const keep = paths.filter((p) => !taken.has(basename(p)));
        if (keep.length > 0) void s.runUpload(keep, dir);
      }}
      onOverwriteKeepBoth={() => s.confirmKeepBoth()}
      onDeleteConfirm={() => {
        if (s.confirm?.kind !== 'delete') return;
        const names = s.confirm.names;
        s.setConfirm(null);
        void s.deleteEntries(names);
      }}
      onChmodChange={s.setChmodValue}
      onChmodCancel={() => s.setChmodTargets(null)}
      onChmodSubmit={() => void s.submitChmod()}
      onBatchRenameCancel={() => s.setBatchRename(null)}
      onBatchRenameSubmit={(names) => void s.submitBatchRename(names)}
    />
  );
}