import { Box, Typography, Paper, IconButton, TextField, Chip, InputAdornment } from '@mui/material';
import { MagnifyingGlassIcon, RobotIcon, TrashIcon } from '@phosphor-icons/react';
import type { TFunction } from 'i18next';
import type { AgentDto, EndpointDto, ModelDto } from '../../../../proto/agent';
import { ALL_AGENT_TOOLS, GRADIENT } from './constants';

interface Props {
  agents: AgentDto[];
  models: ModelDto[];
  endpoints: EndpointDto[];
  filteredAgents: AgentDto[];
  editingId: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  onEdit: (agent: AgentDto) => void;
  onRequestDelete: (agent: AgentDto) => void;
  getToolLabel: (toolId: string) => string;
  t: TFunction;
}

/** 左侧智能体列表：搜索框 + 卡片列表（含模型/端点、工具标签、删除入口）。 */
export function AgentListPanel({
  agents,
  models,
  endpoints,
  filteredAgents,
  editingId,
  search,
  onSearchChange,
  onEdit,
  onRequestDelete,
  getToolLabel,
  t,
}: Props) {
  return (
    <Box sx={{ width: { xs: '100%', md: 280 }, minWidth: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <TextField
        size="small"
        placeholder={t('agent.search_placeholder')}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        sx={{ mb: 1.5 }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <MagnifyingGlassIcon size={16} />
              </InputAdornment>
            ),
          },
        }}
      />
      <Box sx={{ flex: 1, overflow: 'auto', pr: 0.5 }}>
        {filteredAgents.length === 0 ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', mt: 4 }}>
            {agents.length === 0 ? t('agent.no_agents') : t('agent.no_search_result')}
          </Typography>
        ) : (
          filteredAgents.map((agent) => {
            const model = models.find((m) => m.id === agent.modelId);
            const modelEndpoint = model ? endpoints.find((e) => e.id === model.endpointId) : undefined;
            const isSelected = editingId === agent.id;
            return (
              <Paper
                key={agent.id}
                variant="outlined"
                onClick={() => onEdit(agent)}
                className="agent-item"
                sx={{
                  p: 1.5,
                  mb: 1,
                  cursor: 'pointer',
                  borderRadius: 2.5,
                  borderColor: isSelected ? 'primary.main' : 'divider',
                  borderLeft: isSelected ? '3px solid' : '1px solid',
                  borderLeftColor: isSelected ? 'primary.main' : 'divider',
                  bgcolor: isSelected ? 'rgba(45,212,191,0.08)' : 'transparent',
                  transition: 'all 0.2s',
                  '&:hover': {
                    borderColor: 'primary.main',
                    bgcolor: 'rgba(45,212,191,0.04)',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
                  },
                  '&:hover .agent-del': { opacity: 1 },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: 1.5,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: GRADIENT,
                      color: '#fff',
                      flexShrink: 0,
                      boxShadow: '0 2px 6px rgba(45,212,191,0.3)',
                    }}
                  >
                    <RobotIcon size={16} weight="bold" />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {agent.name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10.5 }}>
                      {model?.name || t('agent.no_model')}
                      {modelEndpoint ? ` · ${modelEndpoint.name}` : ''}
                    </Typography>
                  </Box>
                  <IconButton
                    className="agent-del"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestDelete(agent);
                    }}
                    sx={{
                      p: 0.5,
                      opacity: 0.3,
                      transition: 'opacity .15s',
                      '&:hover': { opacity: 1, color: 'error.main' },
                    }}
                  >
                    <TrashIcon size={15} />
                  </IconButton>
                </Box>
                {agent.description && (
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>
                    {agent.description}
                  </Typography>
                )}
                {ALL_AGENT_TOOLS.every((tid) => agent.toolIds.includes(tid)) ? (
                  <Chip label={t('agent.all_tools')} size="small" sx={{ height: 18, fontSize: 10 }} />
                ) : (
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {agent.toolIds.slice(0, 3).map((tid) => (
                      <Chip
                        key={tid}
                        label={getToolLabel(tid)}
                        size="small"
                        sx={{ height: 18, fontSize: 10 }}
                      />
                    ))}
                    {agent.toolIds.length > 3 && (
                      <Chip
                        label={`+${agent.toolIds.length - 3}`}
                        size="small"
                        sx={{ height: 18, fontSize: 10 }}
                      />
                    )}
                  </Box>
                )}
              </Paper>
            );
          })
        )}
      </Box>
    </Box>
  );
}