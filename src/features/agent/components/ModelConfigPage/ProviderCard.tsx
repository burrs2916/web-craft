import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import { PlusIcon, PencilSimpleIcon, TrashIcon, CaretUpIcon, CaretDownIcon } from '@phosphor-icons/react';
import type { ProviderDto } from '../../../../proto/agent';
import { ProviderDot } from './ProviderDot';
import { EndpointCard } from './EndpointCard';
import type { useModelConfigState } from './useModelConfigState';

type ModelConfigViewModel = ReturnType<typeof useModelConfigState>;

/** 供应商卡片：头部信息 + 增删改，展开后展示其下的接入点列表。 */
export function ProviderCard({
  provider,
  vm,
}: {
  provider: ProviderDto;
  vm: ModelConfigViewModel;
}) {
  const {
    t, cardBorder, cardBg, hoverBg, errorColor,
    models, endpoints, agents,
    expandedProviders, toggleProvider,
    getEndpointsForProvider,
    setProviderDialog, setEndpointDialog, setDeleteConfirm, closeDeleteConfirm, deleteProvider,
  } = vm;

  const providerEndpoints = getEndpointsForProvider(provider.id);
  const isExpanded = expandedProviders.has(provider.id);

  return (
    <Card sx={{ border: 1, borderColor: cardBorder, borderRadius: 2, bgcolor: cardBg, overflow: 'visible' }}>
      <Box
        sx={{
          p: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          '&:hover': { bgcolor: hoverBg },
        }}
        onClick={() => toggleProvider(provider.id)}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ProviderDot name={provider.name} size={10} />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{provider.name}</Typography>
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
              <Chip label={`${providerEndpoints.length} ${t('endpoint.count')}`} size="small" variant="outlined" sx={{ fontSize: 9, height: 18 }} />
              <Chip
                label={provider.enabled ? t('agent.enabled') : t('agent.disabled')}
                size="small"
                color={provider.enabled ? 'success' : 'default'}
                sx={{ fontSize: 9, height: 18 }}
              />
            </Box>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }} onClick={(e) => e.stopPropagation()}>
          <Tooltip title={t('provider.edit')}>
            <IconButton size="small" onClick={() => setProviderDialog({ open: true, data: provider })}>
              <PencilSimpleIcon size={14} />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('provider.delete')}>
            <IconButton size="small" onClick={() => {
              const providerModels = models.filter(m =>
                endpoints.some(e => e.providerId === provider.id && e.id === m.endpointId)
              ).map(m => m.id);
              const affectedAgents = agents.filter(a =>
                (a.modelId && providerModels.includes(a.modelId)) ||
                (a.fallbackModelId && providerModels.includes(a.fallbackModelId))
              );
              let msg = t('provider.delete_confirm', { name: provider.name });
              if (affectedAgents.length > 0) {
                msg += '\n\n' + t('provider.delete_affected_agents', {
                  count: affectedAgents.length,
                  names: affectedAgents.map(a => a.name).join(', '),
                  defaultValue: `This will affect ${affectedAgents.length} agent(s): ${affectedAgents.map(a => a.name).join(', ')}`,
                });
              }
              setDeleteConfirm({
                open: true,
                title: t('provider.delete'),
                message: msg,
                onConfirm: async () => {
                  await deleteProvider(provider.id);
                  closeDeleteConfirm();
                },
              });
            }}>
              <TrashIcon size={14} color={errorColor} />
            </IconButton>
          </Tooltip>
          <IconButton size="small" onClick={() => toggleProvider(provider.id)}>
            {isExpanded ? <CaretUpIcon size={14} /> : <CaretDownIcon size={14} />}
          </IconButton>
        </Box>
      </Box>

      <Collapse in={isExpanded}>
        <Divider sx={{ borderColor: cardBorder }} />
        <Box sx={{ p: 1.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              {t('endpoint.label')}
            </Typography>
            <Button
              size="small"
              startIcon={<PlusIcon size={12} weight="bold" />}
              onClick={() => setEndpointDialog({ open: true, data: null, providerId: provider.id })}
              sx={{ fontSize: 10, borderRadius: 1.5 }}
            >
              {t('endpoint.add')}
            </Button>
          </Box>

          {providerEndpoints.length === 0 ? (
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', textAlign: 'center', py: 1.5 }}>
              {t('endpoint.no_endpoints')}
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {providerEndpoints.map((endpoint) => (
                <EndpointCard key={endpoint.id} endpoint={endpoint} providerId={provider.id} vm={vm} />
              ))}
            </Box>
          )}
        </Box>
      </Collapse>
    </Card>
  );
}