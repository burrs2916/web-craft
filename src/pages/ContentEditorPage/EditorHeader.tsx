import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import {
  ArrowLeftIcon,
  FileTextIcon,
  FloppyDiskIcon,
  PaperPlaneRightIcon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { Content } from '../../proto';

/** 内容编辑器顶栏：返回、标题、类型/状态标签、保存与发布按钮。 */
export function EditorHeader({
  siteName,
  title,
  typeLabel,
  statusLabel,
  status,
  dirty,
  saving,
  publishing,
  onBack,
  onSave,
  onPublish,
}: {
  siteName: string;
  title: string;
  typeLabel: string;
  statusLabel: string;
  status: Content['status'];
  dirty: boolean;
  saving: boolean;
  publishing: boolean;
  onBack: () => void;
  onSave: () => void;
  onPublish: () => void;
}) {
  const { t } = useTranslation('cms');

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexShrink: 0 }}>
      <IconButton onClick={onBack} size="small">
        <ArrowLeftIcon size={20} />
      </IconButton>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }} noWrap>
          {title || t('editor.untitled')}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap>
          {siteName} · {typeLabel}
        </Typography>
      </Box>
      <Chip
        icon={<FileTextIcon size={14} />}
        label={typeLabel}
        size="small"
        variant="outlined"
      />
      <Chip
        label={statusLabel}
        size="small"
        variant="outlined"
        color={status === 'published' ? 'success' : status === 'scheduled' ? 'warning' : 'default'}
      />
      <Tooltip title={t('editor.save_hint')}>
        <span>
          <Button
            variant="contained"
            startIcon={<FloppyDiskIcon size={16} weight="bold" />}
            onClick={onSave}
            disabled={saving || !dirty}
          >
            {saving ? <CircularProgress size={16} /> : null}
            {t('editor.save')}
          </Button>
        </span>
      </Tooltip>
      {status !== 'published' ? (
        <Tooltip title={t('editor.publish_hint')}>
          <span>
            <Button
              variant="outlined"
              color="success"
              startIcon={<PaperPlaneRightIcon size={16} weight="bold" />}
              onClick={onPublish}
              disabled={publishing}
            >
              {publishing ? <CircularProgress size={16} /> : null}
              {t('editor.publish')}
            </Button>
          </span>
        </Tooltip>
      ) : null}
    </Box>
  );
}