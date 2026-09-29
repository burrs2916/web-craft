import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActionArea from '@mui/material/CardActionArea';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Divider from '@mui/material/Divider';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import {
  ArrowLeftIcon,
  ListChecksIcon,
  PencilSimpleIcon,
  TrashIcon,
  PlayIcon,
  TerminalWindowIcon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { OpsScript } from '../../../proto/ops';
import type { ConnectionConfig } from '../../../proto/connection';
import { CATEGORY_KEYS, ICON_MAP, DANGER_COLOR, type CategoryKey } from './constants';

/**
 * 脚本分类 + 卡片列表。
 */
export function ScriptsTab({
  connections,
  connectionId,
  category,
  setCategory,
  scripts,
  loading,
  error,
  onOpenScript,
  onEdit,
  onToggle,
  onDelete,
  opErr,
  onBack,
}: {
  connections: ConnectionConfig[];
  connectionId: string;
  category: CategoryKey;
  setCategory: (c: CategoryKey) => void;
  scripts: OpsScript[];
  loading: boolean;
  error: string;
  onOpenScript: (s: OpsScript) => void;
  onEdit: (s: OpsScript) => void;
  onToggle: (s: OpsScript, v: boolean) => void;
  onDelete: (s: OpsScript) => void;
  opErr: string;
  onBack?: () => void;
}) {
  const { t } = useTranslation('ops');
  return (
    <Box sx={{ display: 'flex', flex: 1, minHeight: 0, gap: 2, position: 'relative' }}>
      {onBack && (
        <Tooltip title="返回文件运维">
          <IconButton
            size="small"
            onClick={onBack}
            sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}
          >
            <ArrowLeftIcon size={16} />
          </IconButton>
        </Tooltip>
      )}
      {!connectionId && connections.length > 0 && (
        <Alert severity="info" sx={{ position: 'absolute', top: 0, insetInline: 0 }}>{t('connectionRequired')}</Alert>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      <Box
        sx={{
          width: 168,
          flexShrink: 0,
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          p: 1,
          overflowY: 'auto',
        }}
      >
        {CATEGORY_KEYS.map((key) => (
          <Box
            key={key}
            onClick={() => setCategory(key)}
            sx={{
              px: 1.5,
              py: 1,
              borderRadius: 1.5,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: category === key ? 600 : 400,
              color: category === key ? 'text.primary' : 'text.secondary',
              bgcolor: category === key ? 'action.selected' : 'transparent',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            {t(`category.${key}`)}
          </Box>
        ))}
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 0.5 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={28} />
          </Box>
        ) : scripts.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
            <ListChecksIcon size={40} weight="light" />
            <Typography variant="body2" sx={{ mt: 1 }}>{t('emptyLibrary')}</Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 1.5 }}>
            {scripts.map((s) => (
              <ScriptCard
                key={s.id}
                script={s}
                disabled={!connectionId}
                onClick={() => {
                  if (!s.enabled) return;
                  onOpenScript(s);
                }}
                onEdit={() => onEdit(s)}
                onToggle={(v) => onToggle(s, v)}
                onDelete={() => onDelete(s)}
              />
            ))}
          </Box>
        )}
      </Box>

      {opErr && <Alert severity="error">{opErr}</Alert>}
    </Box>
  );
}

function ScriptCard({
  script,
  disabled,
  onClick,
  onEdit,
  onToggle,
  onDelete,
}: {
  script: OpsScript;
  disabled: boolean;
  onClick: () => void;
  onEdit: () => void;
  onToggle: (v: boolean) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation('ops');
  const Icon = ICON_MAP[script.icon ?? ''] ?? TerminalWindowIcon;
  const runnable = script.enabled && !disabled;
  return (
    <Card variant="outlined" sx={{ opacity: script.enabled ? (disabled ? 0.6 : 1) : 0.55 }}>
      <CardActionArea onClick={onClick} disabled={!runnable} sx={{ height: '100%' }}>
        <CardContent sx={{ p: 1.75, pb: 1.25 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Icon size={26} color={DANGER_COLOR[script.dangerLevel]} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body1" noWrap sx={{ fontSize: 14, fontWeight: 600 }}>
                {script.name}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {script.description}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.75, mt: 1.25, alignItems: 'center' }}>
            <Chip
              label={t(`danger.${script.dangerLevel}`)}
              size="small"
              sx={{
                height: 18,
                fontSize: 10,
                fontWeight: 700,
                bgcolor: `${DANGER_COLOR[script.dangerLevel]}22`,
                color: DANGER_COLOR[script.dangerLevel],
              }}
            />
            {!script.enabled && (
              <Chip
                label={t('disabledLabel')}
                size="small"
                sx={{ height: 18, fontSize: 10, fontWeight: 700, color: 'text.secondary' }}
              />
            )}
            {!script.isBuiltin && (
              <Chip
                label={t('custom')}
                size="small"
                sx={{ height: 18, fontSize: 10, fontWeight: 700, color: 'text.secondary' }}
              />
            )}
            <Box sx={{ flex: 1 }} />
            {script.parameters.length > 0 && (
              <Typography variant="caption" color="text.secondary">
                {script.parameters.length} {t('params')}
              </Typography>
            )}
          </Box>
        </CardContent>
      </CardActionArea>
      <Divider sx={{ my: 0 }} />
      <Box sx={{ p: 1, pl: 1.5, pr: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={script.enabled}
              onChange={(e) => onToggle(e.target.checked)}
              onClick={(e) => e.stopPropagation()}
            />
          }
          label={t(script.enabled ? 'enabledLabel' : 'enable')}
          sx={{ mr: 0, '& .MuiFormControlLabel-label': { fontSize: 12, color: 'text.secondary' } }}
        />
        <Box sx={{ flex: 1 }} />
        {!script.isBuiltin && (
          <IconButton size="small" title={t('edit')} onClick={onEdit}>
            <PencilSimpleIcon size={18} />
          </IconButton>
        )}
        {!script.isBuiltin && (
          <IconButton size="small" color="error" title={t('deleteTitle')} onClick={onDelete}>
            <TrashIcon size={18} />
          </IconButton>
        )}
        <Button
          size="small"
          variant="contained"
          color={DANGER_COLOR[script.dangerLevel] === '#EF5350' ? 'error' : 'primary'}
          startIcon={<PlayIcon size={14} />}
          disabled={!runnable}
          onClick={onClick}
        >
          {t('run')}
        </Button>
      </Box>
    </Card>
  );
}