import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import {
  PlusIcon, PencilSimpleIcon, TrashIcon, CaretUpIcon, CaretDownIcon,
  PlayIcon, CheckCircleIcon, WarningIcon, PlugsIcon,
} from '@phosphor-icons/react';
import type { EndpointDto } from '../../../../proto/agent';
import { ModelRow } from './ModelRow';
import type { useModelConfigState } from './useModelConfigState';

type ModelConfigViewModel = ReturnType<typeof useModelConfigState>;

/** 接入点卡片：头部信息 + 连通性测试，展开后展示其下的模型列表。 */
export function EndpointCard({
  endpoint,
  providerId,
  vm,
}: {
  endpoint: EndpointDto;
  providerId: string;
  vm: ModelConfigViewModel;
}) {
  const {
    t, cardBorder, innerCardBg, hoverBg2, errorColor, successColor,
    agents, expandedEndpoints, toggleEndpoint,
    testResults, testingId, handleTestConnection,
    getModelsForEndpoint, getApiTypeLabel,
    setEndpointDialog, setModelDialog, setDeleteConfirm, closeDeleteConfirm, deleteEndpoint,
  } = vm;

  const endpointModels = getModelsForEndpoint(endpoint.id);
  const isEndpointExpanded = expandedEndpoints.has(endpoint.id);
  const testResult = testResults.get(endpoint.id);
  const isTesting = testingId === endpoint.id;

  return (
    <Card variant="outlined" sx={{ borderRadius: 1.5, borderColor: cardBorder, bgcolor: innerCardBg }}>
      <Box
        sx={{
          p: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          '&:hover': { bgcolor: hoverBg2 },
        }}
        onClick={() => toggleEndpoint(endpoint.id)}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <PlugsIcon size={14} color="#FBBF24" weight="fill" />
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>{endpoint.name}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 9 }}>
              {getApiTypeLabel(endpoint.apiType)} · {endpoint.baseUrl || t('endpoint.no_url')}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }} onClick={(e) => e.stopPropagation()}>
          {testResult && (
            testResult.success
              ? <CheckCircleIcon size={12} color={successColor} weight="fill" />
              : <WarningIcon size={12} color={errorColor} weight="fill" />
          )}
          {isTesting && <CircularProgress size={12} />}
          <Tooltip title={t('endpoint.test_connection')}>
            <IconButton size="small" sx={{ p: 0.25 }} onClick={() => handleTestConnection(endpoint.id)}>
              <PlayIcon size={12} />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('endpoint.edit')}>
            <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setEndpointDialog({ open: true, data: endpoint, providerId })}>
              <PencilSimpleIcon size={12} />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('endpoint.delete')}>
            <IconButton size="small" sx={{ p: 0.25 }} onClick={() => {
              const affectedAgents = agents.filter(a =>
                endpointModels.some(m => m.id === a.modelId || m.id === a.fallbackModelId)
              );
              let msg = t('endpoint.delete_confirm', { name: endpoint.name });
              if (endpointModels.length > 0) {
                msg += '\n\n' + t('endpoint.delete_affected_models', {
                  count: endpointModels.length,
                  defaultValue: `This will also delete ${endpointModels.length} model(s) under this endpoint.`,
                });
              }
              if (affectedAgents.length > 0) {
                msg += '\n\n' + t('provider.delete_affected_agents', {
                  count: affectedAgents.length,
                  names: affectedAgents.map(a => a.name).join(', '),
                  defaultValue: `This will affect ${affectedAgents.length} agent(s): ${affectedAgents.map(a => a.name).join(', ')}`,
                });
              }
              setDeleteConfirm({
                open: true,
                title: t('endpoint.delete'),
                message: msg,
                onConfirm: async () => {
                  await deleteEndpoint(endpoint.id);
                  closeDeleteConfirm();
                },
              });
            }}>
              <TrashIcon size={12} color={errorColor} />
            </IconButton>
          </Tooltip>
          <IconButton size="small" sx={{ p: 0.25 }} onClick={() => toggleEndpoint(endpoint.id)}>
            {isEndpointExpanded ? <CaretUpIcon size={12} /> : <CaretDownIcon size={12} />}
          </IconButton>
        </Box>
      </Box>

      <Collapse in={isEndpointExpanded}>
        <Divider sx={{ borderColor: cardBorder }} />
        <Box sx={{ p: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
            <Typography variant="caption" color="text.secondary">
              {t('model.label')} ({endpointModels.length})
            </Typography>
            <Button
              size="small"
              startIcon={<PlusIcon size={10} weight="bold" />}
              onClick={() => setModelDialog({ open: true, data: null, endpointId: endpoint.id })}
              sx={{ fontSize: 9, borderRadius: 1 }}
            >
              {t('model.add')}
            </Button>
          </Box>

          {endpointModels.length === 0 ? (
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', textAlign: 'center', py: 0.75 }}>
              {t('model.no_models')}
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {endpointModels.map((model) => (
                <ModelRow key={model.id} model={model} endpointId={endpoint.id} vm={vm} />
              ))}
            </Box>
          )}
        </Box>
      </Collapse>
    </Card>
  );
}