import {
  Box, IconButton, Typography, Chip, Tooltip,
  Select, MenuItem, FormControl, CircularProgress,
} from '@mui/material';
import {
  Robot, Plus as PlusIcon, TrashIcon,
  ChatCircleDotsIcon, WarningCircle as WarningCircleIcon,
} from '@phosphor-icons/react';
import { useAgentStore } from '../../store/agentStore';
import type { AgentDto, ModelDto, ConversationDto } from '../../../../proto/agent';
import type { TFunction } from 'i18next';

interface Props {
  agents: AgentDto[];
  models: ModelDto[];
  conversations: ConversationDto[];
  activeAgentId: string | null;
  activeConversationId: string | null;
  agentColor: string;
  isDark: boolean;
  cleaningUp: boolean;
  onNewChat: () => void;
  onCleanupConversations: () => void;
  onRequestDeleteConversation: (convId: string) => void;
  t: TFunction;
}

export function AgentChatHeader({
  agents, models, conversations, activeAgentId, activeConversationId,
  agentColor, isDark, cleaningUp,
  onNewChat, onCleanupConversations, onRequestDeleteConversation, t,
}: Props) {
  return (
    <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <FormControl size="small" sx={{ flex: 1 }}>
          <Select
            value={activeAgentId || ''}
            displayEmpty
            onChange={(e) => {
              if (e.target.value) {
                useAgentStore.getState().setActiveAgent(e.target.value);
              }
            }}
            renderValue={(value) => {
              if (!value) {
                return (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                    <ChatCircleDotsIcon size={16} />
                    <Typography variant="body2" sx={{ fontSize: 13 }}>
                      {t('chat.select_agent_placeholder')}
                    </Typography>
                  </Box>
                );
              }
              const agent = agents.find((a) => a.id === value);
              const model = agent ? models.find((m) => m.id === agent.modelId) : null;
              return (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{
                    width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `linear-gradient(135deg, ${agentColor} 0%, ${isDark ? '#EA80FC' : '#9C27B0'} 100%)`, color: '#fff', flexShrink: 0,
                  }}>
                    <Robot size={11} weight="bold" />
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 13 }}>
                    {agent?.name || ''}
                  </Typography>
                  {model && (
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10, bgcolor: `${agentColor}10`, px: 0.75, py: 0.25, borderRadius: 1 }}>
                      {model.name}
                    </Typography>
                  )}
                </Box>
              );
            }}
            sx={{
              borderRadius: 2, bgcolor: `${agentColor}08`,
              '& .MuiSelect-select': { py: 0.75, pr: 3 },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: `${agentColor}20` },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: `${agentColor}40` },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: `${agentColor}60` },
            }}
          >
            {agents.length === 0 && (
              <MenuItem disabled value="">
                <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 12 }}>
                  {t('agent.no_agents')}
                </Typography>
              </MenuItem>
            )}
            {agents.map((agent) => {
              const model = models.find((m) => m.id === agent.modelId);
              return (
                <MenuItem key={agent.id} value={agent.id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                    <Box sx={{
                      width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: `linear-gradient(135deg, ${agentColor} 0%, ${isDark ? '#EA80FC' : '#9C27B0'} 100%)`, color: '#fff', flexShrink: 0,
                    }}>
                      <Robot size={12} weight="bold" />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 13 }}>{agent.name}</Typography>
                      {agent.description && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10, display: 'block' }} noWrap>{agent.description}</Typography>
                      )}
                    </Box>
                    {model && <Chip label={model.name} size="small" sx={{ height: 18, fontSize: 9, flexShrink: 0 }} />}
                  </Box>
                </MenuItem>
              );
            })}
          </Select>
        </FormControl>
        <IconButton
          size="small" onClick={onNewChat} disabled={!activeAgentId}
          sx={{
            borderRadius: 2, border: `1px solid ${agentColor}30`, bgcolor: `${agentColor}08`,
            '&:hover': { bgcolor: `${agentColor}15`, borderColor: `${agentColor}40` },
            '&.Mui-disabled': { opacity: 0.3 },
          }}
        >
          <PlusIcon size={16} weight="bold" color={agentColor} />
        </IconButton>
      </Box>

      {conversations.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
          <Box sx={{ flex: 1, minWidth: 0, overflow: 'auto', '&::-webkit-scrollbar': { height: 3 } }}>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {conversations.map((conv) => (
                <Chip
                  key={conv.id}
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {conv.status === 'interrupted' && (
                        <WarningCircleIcon size={12} weight="fill" color="#FF9800" />
                      )}
                      {conv.status === 'running' && (
                        <CircularProgress size={10} sx={{ color: '#4CAF50' }} />
                      )}
                      <span>{conv.title}</span>
                    </Box>
                  }
                  size="small"
                  variant={activeConversationId === conv.id ? 'filled' : 'outlined'}
                  color={activeConversationId === conv.id ? 'secondary' : 'default'}
                  onClick={() => useAgentStore.getState().setActiveConversation(conv.id)}
                  onDelete={conversations.length > 1 ? () => onRequestDeleteConversation(conv.id) : undefined}
                  deleteIcon={<TrashIcon size={12} />}
                  sx={{
                    height: 24, fontSize: 11, borderRadius: 1.5, flexShrink: 0,
                    '& .MuiChip-deleteIcon': { color: 'rgba(255,123,114,0.5)', '&:hover': { color: '#FF7B72' } },
                  }}
                />
              ))}
            </Box>
          </Box>
          <Tooltip title="清理旧会话（保留最近 20 个）">
            <IconButton
              size="small"
              onClick={onCleanupConversations}
              disabled={cleaningUp || conversations.length <= 5}
              sx={{
                borderRadius: 1.5, p: 0.25,
                bgcolor: 'rgba(156, 39, 176, 0.08)',
                '&:hover': { bgcolor: 'rgba(156, 39, 176, 0.15)' },
                '&.Mui-disabled': { opacity: 0.3 },
              }}
            >
              <TrashIcon size={14} color="#9C27B0" />
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>
  );
}