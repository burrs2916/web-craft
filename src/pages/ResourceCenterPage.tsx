import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Typography,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Card,
  CardActionArea,
  CardContent,
  Divider,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  GraphIcon,
  PlugsConnectedIcon,
  GlobeHemisphereWestIcon,
  RocketIcon,
  RobotIcon,
  TerminalIcon,
  ArrowClockwiseIcon,
  ArrowSquareOutIcon,
  ShareNetworkIcon,
} from '@phosphor-icons/react';
import {
  resourceList,
  resourceLinks,
  resourceReconcile,
  parseResourceMeta,
  type ResourceRow,
  type ResourceLinkView,
  type ResourceKind,
  type ReconcileSummary,
} from '../core/services/resource.service';
import { useNotify } from '../core/notification';
import { brand } from '../theme/brand';

const KIND_ORDER: ResourceKind[] = [
  'connection',
  'site',
  'deployment',
  'terminal',
  'automation',
];

const KIND_ICON: Record<string, typeof GraphIcon> = {
  connection: PlugsConnectedIcon,
  site: GlobeHemisphereWestIcon,
  deployment: RocketIcon,
  terminal: TerminalIcon,
  automation: RobotIcon,
};

const KIND_COLOR: Record<string, string> = {
  connection: brand.sky500,
  site: brand.blue500,
  deployment: brand.amber500,
  terminal: '#60A5FA',
  automation: brand.agent,
};

/** 已知 meta 字段 → i18n key，用于在卡片上展示关键属性。 */
const META_FIELDS: Array<{ key: string; labelKey: string; trunc?: boolean }> = [
  { key: 'domain', labelKey: 'metaDomain' },
  { key: 'host', labelKey: 'metaHost' },
  { key: 'status', labelKey: 'metaStatus' },
  { key: 'mode', labelKey: 'metaMode' },
  { key: 'targetEnv', labelKey: 'metaTargetEnv' },
  { key: 'serverVersion', labelKey: 'metaVersion' },
  { key: 'connectionId', labelKey: 'metaConnection', trunc: true },
  { key: 'siteId', labelKey: 'metaSite', trunc: true },
  { key: 'enabled', labelKey: 'metaEnabled' },
];

function truncId(v: unknown): string {
  const s = String(v ?? '');
  return s.length > 10 ? `${s.slice(0, 8)}…` : s;
}

function kindLabelKey(kind: string): string {
  return `resourceCenter.kind${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
}

function relationLabelKey(rel: string): string {
  return `resourceCenter.relation_${rel}`;
}

/** 资源 → 可跳转的站内路由（统一整体内的交叉跳转）。 */
function navigatePathFor(kind: string, refId: string, meta: Record<string, unknown>): string | null {
  switch (kind) {
    case 'site':
      return `/sites/${refId}`;
    case 'connection':
      return '/connections';
    case 'terminal':
      return '/';
    case 'deployment':
      return meta.siteId ? `/sites/${String(meta.siteId)}` : null;
    default:
      return null;
  }
}

export function ResourceCenterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify().notify;

  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [kindFilter, setKindFilter] = useState<ResourceKind | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [links, setLinks] = useState<ResourceLinkView[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await resourceList(undefined, 1000);
      setResources(list);
    } catch (e) {
      notify(typeof e === 'string' ? e : String(e));
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const reconcile = useCallback(async () => {
    setReconciling(true);
    try {
      const sum: ReconcileSummary = await resourceReconcile();
      await load();
      notify(
        t('resourceCenter.reconcileDone', {
          connections: sum.connections,
          sites: sum.sites,
          deployments: sum.deployments,
          terminals: sum.terminals,
          automations: sum.automations,
        }),
      );
    } catch (e) {
      notify(typeof e === 'string' ? e : String(e));
    } finally {
      setReconciling(false);
    }
  }, [load, notify, t]);

  // 挂载即重建统一资源体，保证「连接/终端/站点/部署/自动化」即时打通。
  useEffect(() => {
    void reconcile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of resources) c[r.kind] = (c[r.kind] ?? 0) + 1;
    return c;
  }, [resources]);

  const filtered = useMemo(
    () =>
      kindFilter === 'all'
        ? resources
        : resources.filter((r) => r.kind === kindFilter),
    [resources, kindFilter],
  );

  const selected = useMemo(
    () => resources.find((r) => r.id === selectedId) ?? null,
    [resources, selectedId],
  );

  const selectResource = useCallback(
    async (row: ResourceRow) => {
      setSelectedId(row.id);
      setLinksLoading(true);
      try {
        const lv = await resourceLinks(row.kind as ResourceKind, row.refId);
        setLinks(lv);
      } catch (e) {
        notify(typeof e === 'string' ? e : String(e));
        setLinks([]);
      } finally {
        setLinksLoading(false);
      }
    },
    [notify],
  );

  const openResource = useCallback(
    (row: ResourceRow) => {
      const meta = parseResourceMeta(row);
      const path = navigatePathFor(row.kind, row.refId, meta);
      if (path) navigate(path);
      else void selectResource(row);
    },
    [navigate, selectResource],
  );

  const renderCard = (row: ResourceRow, onClick?: () => void, active = false) => {
    const Icon = KIND_ICON[row.kind] ?? GraphIcon;
    const color = KIND_COLOR[row.kind] ?? brand.blue500;
    const meta = parseResourceMeta(row);
    const fields = META_FIELDS.filter(
      (f) => meta[f.key] !== undefined && meta[f.key] !== null && meta[f.key] !== '',
    ).slice(0, 3);
    const body = (
      <CardContent sx={{ p: 1.5 }}>
        <Stack direction="row" spacing={1.2} sx={{ alignItems: 'center' }}>
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: '9px',
              display: 'grid',
              placeItems: 'center',
              background: `${color}1f`,
              color,
              flexShrink: 0,
            }}
          >
            <Icon size={20} weight="fill" />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              noWrap
              sx={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.2 }}
              title={row.name}
            >
              {row.name}
            </Typography>
            <Chip
              label={t(kindLabelKey(row.kind))}
              size="small"
              sx={{
                height: 18,
                fontSize: 10,
                fontWeight: 700,
                color,
                background: `${color}1f`,
                mt: 0.3,
                '& .MuiChip-label': { px: 0.75 },
              }}
            />
          </Box>
        </Stack>
        {fields.length > 0 && (
          <Stack direction="row" spacing={0.5} sx={{ mt: 1, gap: 0.5, flexWrap: 'wrap' }}>
            {fields.map((f) => (
              <Chip
                key={f.key}
                label={`${t(`resourceCenter.${f.labelKey}`)}: ${
                  f.trunc ? truncId(meta[f.key]) : String(meta[f.key])
                }`}
                size="small"
                variant="outlined"
                sx={{ height: 20, fontSize: 10.5, '& .MuiChip-label': { px: 0.75 } }}
              />
            ))}
          </Stack>
        )}
      </CardContent>
    );
    if (!onClick) {
      return (
        <Card
          variant="outlined"
          sx={{
            borderColor: active ? color : 'divider',
            boxShadow: active ? `0 0 0 1px ${color}` : 'none',
          }}
        >
          {body}
        </Card>
      );
    }
    return (
      <Card
        variant="outlined"
        sx={{
          borderColor: active ? color : 'divider',
          boxShadow: active ? `0 0 0 1px ${color}` : 'none',
          transition: 'all 0.15s',
          '&:hover': { borderColor: color },
        }}
      >
        <CardActionArea onClick={onClick}>{body}</CardActionArea>
      </Card>
    );
  };

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Stack
        direction="row"
        spacing={2}
        sx={{ alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {t('resourceCenter.title')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, maxWidth: 640 }}>
            {t('resourceCenter.subtitle')}
          </Typography>
        </Box>
        <Tooltip title={t('resourceCenter.reconcileTip')}>
          <span>
            <Button
              variant="contained"
              startIcon={
                reconciling ? (
                  <CircularProgress size={16} sx={{ color: 'inherit' }} />
                ) : (
                  <ArrowClockwiseIcon size={16} />
                )
              }
              onClick={() => void reconcile()}
              disabled={reconciling}
              sx={{ background: brand.gradient, whiteSpace: 'nowrap' }}
            >
              {reconciling ? t('resourceCenter.reconciling') : t('resourceCenter.reconcile')}
            </Button>
          </span>
        </Tooltip>
      </Stack>

      {/* 资源概览 */}
      <Stack direction="row" spacing={1} sx={{ mt: 2, gap: 1, flexWrap: 'wrap' }}>
        {KIND_ORDER.map((k) => (
          <Chip
            key={k}
            icon={<Box component={KIND_ICON[k] ?? GraphIcon} sx={{ color: KIND_COLOR[k], ml: 0.5 }} />}
            label={`${t(kindLabelKey(k))} · ${counts[k] ?? 0}`}
            variant="outlined"
            sx={{ height: 28, fontWeight: 600 }}
          />
        ))}
      </Stack>

      {/* 种类筛选 */}
      <Stack direction="row" spacing={0.75} sx={{ mt: 2, gap: 0.75, flexWrap: 'wrap' }}>
        <Chip
          label={t('resourceCenter.kindAll')}
          color={kindFilter === 'all' ? 'primary' : 'default'}
          variant={kindFilter === 'all' ? 'filled' : 'outlined'}
          onClick={() => setKindFilter('all')}
          sx={{ fontWeight: 600 }}
        />
        {KIND_ORDER.map((k) => (
          <Chip
            key={k}
            label={t(kindLabelKey(k))}
            color={kindFilter === k ? 'primary' : 'default'}
            variant={kindFilter === k ? 'filled' : 'outlined'}
            onClick={() => setKindFilter(k)}
            sx={{ fontWeight: 600 }}
          />
        ))}
      </Stack>

      <Box sx={{ display: 'flex', gap: 2, mt: 2, alignItems: 'flex-start' }}>
        {/* 资源列表 */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {loading ? (
            <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
              <CircularProgress />
            </Box>
          ) : filtered.length === 0 ? (
            <Box
              sx={{
                py: 8,
                textAlign: 'center',
                color: 'text.secondary',
                border: '1px dashed',
                borderColor: 'divider',
                borderRadius: 2,
              }}
            >
              <ShareNetworkIcon size={36} style={{ opacity: 0.5 }} />
              <Typography sx={{ mt: 1 }}>{t('resourceCenter.empty')}</Typography>
            </Box>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: 1.5,
              }}
            >
              {filtered.map((r) => (
                <Box key={r.id}>{renderCard(r, () => void selectResource(r), r.id === selectedId)}</Box>
              ))}
            </Box>
          )}
        </Box>

        {/* 互联关系面板 */}
        <Box
          sx={{
            width: 360,
            flexShrink: 0,
            position: 'sticky',
            top: 0,
            alignSelf: 'flex-start',
            display: { xs: 'none', lg: 'block' },
          }}
        >
          <Card variant="outlined" sx={{ p: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              {t('resourceCenter.linksTitle')}
            </Typography>
            {!selected ? (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('resourceCenter.empty')}
              </Typography>
            ) : (
              <>
                {renderCard(selected)}
                <Divider sx={{ my: 1.5 }} />
                {linksLoading ? (
                  <Box sx={{ display: 'grid', placeItems: 'center', py: 3 }}>
                    <CircularProgress size={20} />
                  </Box>
                ) : links.length === 0 ? (
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {t('resourceCenter.noLinks')}
                  </Typography>
                ) : (
                  <Stack spacing={1}>
                    {links.map((lv, i) => {
                      const peer = lv.peer;
                      const peerMeta = parseResourceMeta(peer);
                      const path = navigatePathFor(peer.kind, peer.refId, peerMeta);
                      const relColor =
                        lv.relation === 'runs_on' || lv.relation === 'deploys_to'
                          ? brand.amber500
                          : brand.sky500;
                      return (
                        <Box
                          key={`${lv.relation}-${lv.direction}-${peer.id}-${i}`}
                          sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                        >
                          <Chip
                            label={t('resourceCenter.' + lv.direction)}
                            size="small"
                            sx={{ height: 18, fontSize: 9.5, fontWeight: 700, opacity: 0.8, flexShrink: 0 }}
                          />
                          <Chip
                            label={t(relationLabelKey(lv.relation))}
                            size="small"
                            sx={{
                              height: 18,
                              fontSize: 9.5,
                              fontWeight: 700,
                              color: relColor,
                              background: `${relColor}1f`,
                              flexShrink: 0,
                              '& .MuiChip-label': { px: 0.75 },
                            }}
                          />
                          <Box sx={{ flex: 1, minWidth: 0 }}>{renderCard(peer, () => openResource(peer))}</Box>
                          {path && (
                            <Tooltip title={t('resourceCenter.open')}>
                              <IconButton size="small" onClick={() => navigate(path)} sx={{ flexShrink: 0 }}>
                                <ArrowSquareOutIcon size={16} />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      );
                    })}
                  </Stack>
                )}
              </>
            )}
          </Card>
        </Box>
      </Box>
    </Box>
  );
}
