/**
 * AI Copilot 左侧会话列表（可折叠）。
 * 从 AiCopilotPage.tsx 迁出，仅做代码搬迁。
 */
import { Box, Typography, IconButton, Tooltip, TextField, InputAdornment } from '@mui/material';
import { PlusIcon, TrashIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import type { TFunction } from 'i18next';
import type { ConversationDto } from '../../proto/agent';

export function ConversationSidebar({
  open,
  mutedBorder,
  isDark,
  agentColor,
  t,
  searchKeyword,
  onSearchChange,
  conversations,
  activeId,
  onSelect,
  onDelete,
  onNewChat,
}: {
  open: boolean;
  mutedBorder: string;
  isDark: boolean;
  agentColor: string;
  t: TFunction;
  searchKeyword: string;
  onSearchChange: (value: string) => void;
  conversations: ConversationDto[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNewChat: () => void;
}) {
  if (!open) return null;
  return (
    <Box sx={{
      width: 240, flexShrink: 0, borderRight: `1px solid ${mutedBorder}`,
      display: 'flex', flexDirection: 'column',
      bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, py: 1, borderBottom: `1px solid ${mutedBorder}` }}>
        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: 11 }}>
          {t('copilot.sessions_title')}
        </Typography>
        <Tooltip title={t('copilot.new_chat')} arrow>
          <IconButton size="small" onClick={onNewChat} sx={{ borderRadius: 2, border: `1px solid ${agentColor}30`, color: agentColor }}>
            <PlusIcon size={14} weight="bold" />
          </IconButton>
        </Tooltip>
      </Box>
      {/* 搜索框 */}
      <Box sx={{ px: 1, py: 0.75, borderBottom: `1px solid ${mutedBorder}` }}>
        <TextField
          size="small"
          fullWidth
          placeholder="搜索会话..."
          value={searchKeyword}
          onChange={(e) => onSearchChange(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <MagnifyingGlassIcon size={14} style={{ color: 'text.secondary' }} />
                </InputAdornment>
              ),
            },
          }}
          sx={{
            '& .MuiInputBase-input': { fontSize: 12, py: 0.5 },
            '& .MuiOutlinedInput-root': { borderRadius: 1.5 },
          }}
        />
      </Box>
      <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
        {conversations.length === 0 ? (
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', textAlign: 'center', mt: 2, fontSize: 11 }}>
            {searchKeyword.trim() ? '没有匹配的会话' : t('copilot.no_sessions')}
          </Typography>
        ) : (
          conversations.map((c) => (
            <Box
              key={c.id}
              onClick={() => onSelect(c.id)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.5, p: 1, mb: 0.5, borderRadius: 2, cursor: 'pointer',
                bgcolor: c.id === activeId ? `${agentColor}18` : 'transparent',
                border: c.id === activeId ? `1px solid ${agentColor}40` : '1px solid transparent',
                '&:hover': { bgcolor: `${agentColor}10` },
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontSize: 12, fontWeight: c.id === activeId ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.title || 'AI Copilot'}
                </Typography>
                <Typography variant="caption" sx={{ fontSize: 10, color: 'text.secondary' }}>
                  {new Date(c.updatedAt).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </Typography>
              </Box>
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
                sx={{ p: 0.25, opacity: 0.5, '&:hover': { opacity: 1, color: 'error.main' } }}
              >
                <TrashIcon size={14} />
              </IconButton>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}