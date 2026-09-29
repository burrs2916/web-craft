import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import {
  RobotIcon, PlayIcon, PencilSimpleIcon, TrashIcon, CheckCircleIcon, WarningIcon,
} from '@phosphor-icons/react';
import type { ModelDto } from '../../../../proto/agent';
import type { useModelConfigState } from './useModelConfigState';

type ModelConfigViewModel = ReturnType<typeof useModelConfigState>;

/** 模型列表中的单行：名称/refKey、能力徽标、连通性测试与增删改操作。 */
export function ModelRow({
  model,
  endpointId,
  vm,
}: {
  model: ModelDto;
  endpointId: string;
  vm: ModelConfigViewModel;
}) {
  const {
    t, cardBorder, primaryColor, disabledColor, errorColor, successColor,
    agents, modelTestResults, testingModelId, handleTestModel,
    setModelDialog, setDeleteConfirm, closeDeleteConfirm, deleteModel,
  } = vm;

  const modelTestResult = modelTestResults.get(model.id);
  const isModelTesting = testingModelId === model.id;

  return (
    <Box
      sx={{
        p: 0.75,
        border: 1,
        borderColor: cardBorder,
        borderRadius: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        '&:hover': { borderColor: `${primaryColor}80` },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, flex: 1 }}>
        <RobotIcon size={12} color={model.enabled ? primaryColor : disabledColor} weight="fill" />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {model.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 8 }}>
            {model.refKey}
          </Typography>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}>
        {model.reasoning && <Chip label={t('model.reasoning_badge')} size="small" color="warning" sx={{ fontSize: 7, height: 12, minWidth: 12 }} />}
        {model.inputTypes.includes('image') && <Chip label={t('model.image_badge')} size="small" color="info" sx={{ fontSize: 7, height: 12, minWidth: 12 }} />}
        {modelTestResult && (
          modelTestResult.success
            ? <CheckCircleIcon size={10} color={successColor} weight="fill" />
            : <WarningIcon size={10} color={errorColor} weight="fill" />
        )}
        {isModelTesting && <CircularProgress size={10} />}
        <Tooltip title={t('model.test')}>
          <IconButton size="small" sx={{ p: 0.15 }} onClick={(e) => { e.stopPropagation(); handleTestModel(model.id); }}>
            <PlayIcon size={10} />
          </IconButton>
        </Tooltip>
        <IconButton size="small" sx={{ p: 0.15 }} onClick={() => setModelDialog({ open: true, data: model, endpointId })}>
          <PencilSimpleIcon size={10} />
        </IconButton>
        <IconButton size="small" sx={{ p: 0.15 }} onClick={() => {
          const affectedAgents = agents.filter(a =>
            a.modelId === model.id || a.fallbackModelId === model.id
          );
          let msg = t('model.delete_confirm', { name: model.name });
          if (affectedAgents.length > 0) {
            msg += '\n\n' + t('provider.delete_affected_agents', {
              count: affectedAgents.length,
              names: affectedAgents.map(a => a.name).join(', '),
              defaultValue: `This will affect ${affectedAgents.length} agent(s): ${affectedAgents.map(a => a.name).join(', ')}`,
            });
          }
          setDeleteConfirm({
            open: true,
            title: t('model.delete'),
            message: msg,
            onConfirm: async () => {
              await deleteModel(model.id);
              closeDeleteConfirm();
            },
          });
        }}>
          <TrashIcon size={10} color={errorColor} />
        </IconButton>
      </Box>
    </Box>
  );
}