import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemText,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { TagIcon, PlusIcon, PencilSimpleIcon, CheckIcon, XIcon, TrashIcon } from '@phosphor-icons/react';
import { listTagSummaries, createTag, renameTag, deleteTag } from '../../core/services/cms.service';
import type { ContentTagSummary } from '../../proto';

/// 标签管理对话框（FR-C8）：站点标签的增删改查 + 内容计数，
/// 点击标签可回调父级按标签筛选内容列表。
export function TagManageDialog({
  open,
  onClose,
  siteId,
  onTagsChanged,
  onFilterTag,
}: {
  open: boolean;
  onClose: () => void;
  siteId: string;
  onTagsChanged?: () => void;
  onFilterTag?: (tag: string) => void;
}) {
  const { t } = useTranslation('cms');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const primaryColor = isDark ? '#60A5FA' : '#1D4ED8';

  const [tags, setTags] = useState<ContentTagSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  /// 正在重命名的标签 id（null = 未编辑）
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTags(await listTagSummaries(siteId));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    if (open) {
      setNewName('');
      setEditingId(null);
      void load();
    }
  }, [open, load]);

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await createTag(siteId, name);
      setNewName('');
      await load();
      onTagsChanged?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [newName, siteId, load, onTagsChanged]);

  const handleRename = useCallback(
    async (id: string) => {
      const name = editName.trim();
      if (!name) return;
      setBusy(true);
      setError(null);
      try {
        await renameTag(id, name);
        setEditingId(null);
        await load();
        onTagsChanged?.();
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
    },
    [editName, load, onTagsChanged]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setBusy(true);
      setError(null);
      try {
        await deleteTag(id);
        await load();
        onTagsChanged?.();
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
    },
    [load, onTagsChanged]
  );

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <TagIcon size={20} color={primaryColor} />
        {t('tags.title')}
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <Typography variant="caption" color="text.secondary">
          {t('tags.subtitle')}
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}

        {/* 新建标签 */}
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            size="small"
            fullWidth
            label={t('tags.new_name')}
            placeholder={t('tags.new_placeholder')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
            }}
            disabled={busy}
          />
          <Button
            variant="contained"
            startIcon={<PlusIcon size={16} weight="bold" />}
            onClick={handleCreate}
            disabled={busy || !newName.trim()}
            sx={{ flexShrink: 0 }}
          >
            {t('tags.action_create')}
          </Button>
        </Box>

        {/* 标签列表 */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : tags.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
            {t('tags.empty')}
          </Typography>
        ) : (
          <List dense sx={{ maxHeight: 320, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
            {tags.map((tag) => {
              const editing = editingId === tag.id;
              return (
                <ListItem
                  key={tag.id}
                  sx={{ px: 1.5, gap: 1 }}
                  secondaryAction={
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      {editing ? (
                        <>
                          <Tooltip title={t('tags.action_save')}>
                            <IconButton size="small" color="primary" onClick={() => void handleRename(tag.id)} disabled={busy || !editName.trim()}>
                              <CheckIcon size={16} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={t('tags.action_cancel')}>
                            <IconButton size="small" onClick={() => setEditingId(null)} disabled={busy}>
                              <XIcon size={16} />
                            </IconButton>
                          </Tooltip>
                        </>
                      ) : (
                        <>
                          <Tooltip title={t('tags.action_rename')}>
                            <IconButton
                              size="small"
                              onClick={() => {
                                setEditingId(tag.id);
                                setEditName(tag.name);
                              }}
                              disabled={busy}
                            >
                              <PencilSimpleIcon size={16} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={t('tags.action_delete')}>
                            <IconButton size="small" color="error" onClick={() => void handleDelete(tag.id)} disabled={busy}>
                              <TrashIcon size={16} />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                    </Box>
                  }
                >
                  {editing ? (
                    <TextField
                      size="small"
                      fullWidth
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleRename(tag.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      disabled={busy}
                    />
                  ) : (
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip
                            size="small"
                            label={tag.name}
                            onClick={() => {
                              onFilterTag?.(tag.name);
                              onClose();
                            }}
                            sx={{
                              cursor: 'pointer',
                              height: 22,
                              fontSize: 12,
                              bgcolor: isDark ? 'rgba(45,212,191,0.14)' : 'rgba(15,118,110,0.10)',
                              color: primaryColor,
                              '&:hover': { filter: 'brightness(1.1)' },
                            }}
                          />
                          <Typography variant="caption" color="text.secondary">
                            {t('tags.count', { count: tag.count })}
                          </Typography>
                        </Box>
                      }
                    />
                  )}
                </ListItem>
              );
            })}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t('common:action.close')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
