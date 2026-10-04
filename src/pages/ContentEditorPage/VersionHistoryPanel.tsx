import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import {
  CaretDownIcon,
  CaretUpIcon,
  ClockCounterClockwiseIcon,
  ArrowCounterClockwiseIcon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { ContentVersion } from '../../proto';

/** 版本历史面板（FR-C7）：手动存快照 + 列表 + 回滚。 */
export function VersionHistoryPanel({
  isDark,
  primaryColor,
  open,
  onToggle,
  versions,
  loading,
  comment,
  setComment,
  saving,
  rollingBack,
  onSaveVersion,
  onRollback,
}: {
  isDark: boolean;
  primaryColor: string;
  open: boolean;
  onToggle: () => void;
  versions: ContentVersion[];
  loading: boolean;
  comment: string;
  setComment: (value: string) => void;
  saving: boolean;
  rollingBack: number | null;
  onSaveVersion: () => void;
  onRollback: (versionNo: number) => void;
}) {
  const { t } = useTranslation('cms');

  return (
    <Paper
      variant="outlined"
      sx={{ width: '100%', borderRadius: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
    >
      <Box
        sx={{
          px: 2, py: 1.25,
          display: 'flex', alignItems: 'center', gap: 1,
          cursor: 'pointer',
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: isDark ? 'rgba(45,212,191,0.04)' : 'rgba(15,118,110,0.04)',
        }}
        onClick={onToggle}
      >
        <ClockCounterClockwiseIcon size={16} color={primaryColor} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
          {t('editor.version_title')}
        </Typography>
        {open ? <CaretUpIcon size={14} /> : <CaretDownIcon size={14} />}
      </Box>
      {open ? (
        <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 360, overflow: 'auto' }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              size="small"
              fullWidth
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t('editor.version_save_placeholder')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void onSaveVersion();
                }
              }}
            />
            <Button
              size="small"
              variant="outlined"
              startIcon={saving ? <CircularProgress size={14} /> : <ClockCounterClockwiseIcon size={14} />}
              onClick={onSaveVersion}
              disabled={saving}
              sx={{ flexShrink: 0 }}
            >
              {t('editor.version_save')}
            </Button>
          </Box>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={22} />
            </Box>
          ) : versions.length === 0 ? (
            <Typography variant="caption" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              {t('editor.version_empty')}
            </Typography>
          ) : (
            versions.map((v) => (
              <Box
                key={v.id}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1,
                  py: 0.75, px: 0.5, borderRadius: 1,
                  '&:hover': { bgcolor: isDark ? 'rgba(45,212,191,0.06)' : 'rgba(15,118,110,0.05)' },
                }}
              >
                <Chip
                  label={`v${v.version_no}`}
                  size="small"
                  sx={{
                    height: 20, fontSize: 11, fontWeight: 700,
                    bgcolor: isDark ? 'rgba(45,212,191,0.14)' : 'rgba(15,118,110,0.10)',
                    color: primaryColor,
                  }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      display: 'block', fontWeight: 600,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}
                  >
                    {v.comment || t(`editor.version_trigger_${v.trigger}`, { defaultValue: v.trigger })}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(v.created_at).toLocaleString()}
                  </Typography>
                </Box>
                <Tooltip title={t('editor.version_restore')}>
                  <IconButton
                    size="small"
                    onClick={() => onRollback(v.version_no)}
                    disabled={rollingBack === v.version_no}
                  >
                    {rollingBack === v.version_no ? <CircularProgress size={14} /> : <ArrowCounterClockwiseIcon size={15} />}
                  </IconButton>
                </Tooltip>
              </Box>
            ))
          )}
        </Box>
      ) : null}
    </Paper>
  );
}