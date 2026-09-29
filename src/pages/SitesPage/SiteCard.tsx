import { Box, Typography, Paper, Button, Chip, Tooltip, IconButton } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  GlobeHemisphereWestIcon,
  ArchiveIcon,
  ArrowClockwiseIcon,
  ListChecksIcon,
  ArrowSquareOutIcon,
  PencilIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import type { SiteSummary, Site } from '../../proto';
import { normalizeSiteUrl, openSiteDomain, formatTime } from './shared';

export interface SiteCardProps {
  summary: SiteSummary;
  connStatus?: 'checking' | 'ok' | 'fail';
  /// 已部署站点的 /healthz 状态；有值时优先于 connStatus 展示
  healthz?: 'checking' | 'ok' | 'fail';
  onArchive?: (site: Site) => void;
  onRestore?: (site: Site) => void;
  onDelete?: (site: SiteSummary) => void;
  onEdit?: (site: SiteSummary) => void;
  onOps?: (site: SiteSummary) => void;
}

export function SiteCard({
  summary,
  connStatus,
  healthz,
  onArchive,
  onRestore,
  onDelete,
  onEdit,
  onOps,
}: SiteCardProps) {
  const { t } = useTranslation('cms');
  const navigate = useNavigate();
  const archived = summary.status === 'archived';

  // 已部署站点显示服务健康；否则显示服务器连通
  const dotStatus = healthz ?? connStatus;
  const dotTooltip = healthz
    ? healthz === 'ok'
      ? t('sites.health_ok')
      : healthz === 'checking'
        ? t('sites.health_checking')
        : t('sites.health_fail')
    : connStatus === 'ok'
      ? t('sites.server_ok')
      : connStatus === 'checking'
        ? t('sites.server_checking')
        : t('sites.server_fail');

  return (
    <Paper
      variant="outlined"
      onClick={(e) => {
        // 点击按钮区域不触发卡片点击
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('[role="button"]')) return;
        if (!archived && summary.connection_id) {
          onOps?.(summary);
        } else if (!archived) {
          navigate(`/sites/${summary.id}`);
        }
      }}
      sx={{
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        opacity: archived ? 0.65 : 1,
        cursor: archived ? 'default' : 'pointer',
        transition: 'all 0.15s ease',
        '&:hover': archived ? {} : {
          borderColor: 'primary.main',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          transform: 'translateY(-1px)',
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
        {dotStatus ? (
          <Tooltip
            title={dotTooltip}
          >
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                flexShrink: 0,
                bgcolor:
                  dotStatus === 'ok'
                    ? 'success.main'
                    : dotStatus === 'checking'
                      ? 'text.disabled'
                      : 'error.main',
                animation: dotStatus === 'checking' ? 'pulse 1.2s ease-in-out infinite' : undefined,
                '@keyframes pulse': {
                  '0%, 100%': { opacity: 0.4 },
                  '50%': { opacity: 1 },
                },
              }}
            />
          </Tooltip>
        ) : null}
        <Typography sx={{ fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {summary.name}
        </Typography>
        {!archived && onArchive ? (
          <Tooltip title={t('sites.action_archive')}>
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); onArchive(summary); }}
              sx={{ color: 'text.secondary', '&:hover': { color: 'warning.main' } }}
            >
              <ArchiveIcon size={14} weight="bold" />
            </IconButton>
          </Tooltip>
        ) : null}
        {summary.domain ? (
          <Tooltip title={normalizeSiteUrl(summary.domain)} placement="top">
            <Chip
              clickable
              size="small"
              variant="outlined"
              icon={<ArrowSquareOutIcon size={12} />}
              label={summary.domain}
              onClick={(e) => {
                e.stopPropagation();
                void openSiteDomain(summary.domain);
              }}
              sx={{
                maxWidth: 200,
                height: 24,
                color: 'primary.main',
                '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
                '&:hover': {
                  borderColor: 'primary.main',
                  bgcolor: 'action.hover',
                  textDecoration: 'underline',
                },
              }}
            />
          </Tooltip>
        ) : null}
      </Box>

      {summary.local_workdir ? (
        <Typography variant="caption" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {summary.local_workdir}
        </Typography>
      ) : null}

      <Box sx={{ display: 'flex', gap: 2, color: 'text.secondary', mt: 0.5 }}>
        <Typography variant="body2">
          {t('sites.stat_draft')}: <Box component="span" sx={{ fontWeight: 700 }}>{summary.draft_count}</Box>
        </Typography>
        <Typography variant="body2">
          {t('sites.stat_published')}: <Box component="span" sx={{ fontWeight: 700 }}>{summary.published_count}</Box>
        </Typography>
        {summary.connection_id ? null : (
          <Typography variant="body2">{t('sites.stat_local_only')}</Typography>
        )}
      </Box>

      <Typography variant="caption" color="text.secondary">
        {t('sites.stat_last_deployed')}: {formatTime(summary.last_deployed_at)}
      </Typography>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 1, mt: 0.5 }}>
        {archived ? (
          <>
            <Button
              size="small"
              startIcon={<ArrowClockwiseIcon size={16} weight="bold" />}
              onClick={() => onRestore?.(summary)}
            >
              {t('sites.action_restore')}
            </Button>
            <Button
              size="small"
              color="error"
              startIcon={<TrashIcon size={16} weight="bold" />}
              onClick={(e) => { e.stopPropagation(); onDelete?.(summary); }}
            >
              {t('sites.action_delete')}
            </Button>
          </>
        ) : (
          <>
            <Button
              size="small"
              startIcon={<ListChecksIcon size={16} weight="bold" />}
              onClick={(e) => { e.stopPropagation(); onOps?.(summary); }}
              disabled={!summary.connection_id}
            >
              {t('sites.action_ops')}
            </Button>
            <Button
              size="small"
              startIcon={<GlobeHemisphereWestIcon size={16} weight="bold" />}
              onClick={(e) => { e.stopPropagation(); navigate(`/sites/${summary.id}`); }}
            >
              {t('sites.action_contents')}
            </Button>
            <Button
              size="small"
              startIcon={<PencilIcon size={16} weight="bold" />}
              onClick={(e) => { e.stopPropagation(); onEdit?.(summary); }}
            >
              {t('sites.action_edit')}
            </Button>
            <Button
              size="small"
              color="error"
              startIcon={<TrashIcon size={16} weight="bold" />}
              onClick={(e) => { e.stopPropagation(); onDelete?.(summary); }}
            >
              {t('sites.action_delete')}
            </Button>
          </>
        )}
      </Box>
    </Paper>
  );
}