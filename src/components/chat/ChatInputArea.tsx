// ChatComponents 拆分：聊天输入区（导出组件）
import { useCallback } from 'react';
import {
  Box, Typography, Chip, Tooltip, IconButton, TextField,
} from '@mui/material';
import {
  PaperclipIcon, XIcon, Robot, PaperPlaneTilt as SendIcon, Stop,
} from '@phosphor-icons/react';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
import type { ChatInputAreaProps, FileAttachment } from './chatTypes';

export function ChatInputArea({
  input, setInput, handleSend, handleKeyDown, loading, conversationId,
  agentName, agentColor, userColor, isDark, placeholder, onStop,
  attachments = [], onAttachmentsChange, hasFileTool = true,
  disabled = false, disabledReason,
}: ChatInputAreaProps) {
  const { t } = useTranslation('agent');
  const mutedBorder = isDark ? 'rgba(48,54,61,0.6)' : 'rgba(0,0,0,0.08)';
  const mutedBg = isDark ? 'rgba(48,54,61,0.1)' : 'rgba(0,0,0,0.03)';

  const handleAttachFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: true,
        title: t('plugin_page.attach_file'),
      });
      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        const newFiles: FileAttachment[] = paths.map((p) => {
          const parts = p.split(/[/\\]/);
          return { path: p, name: parts[parts.length - 1] || p };
        });
        const existingPaths = new Set(attachments.map((a) => a.path));
        const unique = newFiles.filter((f) => !existingPaths.has(f.path));
        if (unique.length > 0) {
          onAttachmentsChange?.([...attachments, ...unique]);
        }
      }
    } catch (err) { console.error('ChatComponents: operation failed', err); }
  }, [attachments, onAttachmentsChange, t]);

  const handleRemoveAttachment = useCallback((path: string) => {
    onAttachmentsChange?.(attachments.filter((a) => a.path !== path));
  }, [attachments, onAttachmentsChange]);

  return (
    <Box sx={{ px: 2, pb: 1.5, pt: 0.5 }}>
      <Box sx={{
        display: 'flex', flexDirection: 'column', borderRadius: 1.5,
        border: '1px solid', borderColor: conversationId ? `${userColor}25` : mutedBorder,
        bgcolor: conversationId ? `${userColor}05` : mutedBg,
        overflow: 'hidden', transition: 'border-color 0.2s, background-color 0.2s',
        '&:focus-within': { borderColor: `${userColor}50`, bgcolor: `${userColor}08` },
      }}>
        {agentName && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, pt: 1, pb: 0 }}>
            <Box sx={{
              width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `linear-gradient(135deg, ${agentColor} 0%, ${isDark ? '#0EA5E9' : '#0277BD'} 100%)`,
              color: '#fff', flexShrink: 0,
            }}>
              <Robot size={8} weight="bold" />
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10, fontWeight: 500 }}>
              {agentName}
            </Typography>
          </Box>
        )}
        {attachments.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, px: 1.5, pt: 0.5 }}>
            {attachments.map((file) => (
              <Chip
                key={file.path}
                icon={<PaperclipIcon size={10} weight="bold" />}
                label={file.name}
                size="small"
                onDelete={() => handleRemoveAttachment(file.path)}
                deleteIcon={<XIcon size={10} />}
                sx={{ height: 22, fontSize: 10, maxWidth: 200, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
              />
            ))}
          </Box>
        )}
        <Box sx={{ display: 'flex', alignItems: 'flex-end', px: 0.5, py: 0.5 }}>
          <Tooltip title={t('plugin_page.attach_file')} arrow>
            <span>
              <IconButton
                size="small"
                onClick={handleAttachFile}
                disabled={disabled || loading || !conversationId || !hasFileTool}
                sx={{ borderRadius: 2, mb: 0.25, color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)', '&:hover': { color: userColor, bgcolor: `${userColor}10` } }}
              >
                <PaperclipIcon size={16} weight="bold" />
              </IconButton>
            </span>
          </Tooltip>
          <TextField
            fullWidth variant="standard" multiline minRows={1} maxRows={4}
            value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown} placeholder={disabled && disabledReason ? disabledReason : placeholder}
            disabled={disabled || loading || !conversationId}
            slotProps={{ input: { disableUnderline: true } }}
            sx={{
              '& .MuiInputBase-root': { fontSize: 13, px: 1, py: 0.5, minHeight: 28, alignItems: 'flex-start' },
              '& .MuiInputBase-input': { lineHeight: 1.5 },
              '& .MuiInputBase-input::placeholder': { color: 'text.secondary', opacity: 0.6 },
            }}
          />
          {loading ? (
            <IconButton size="small" onClick={onStop} sx={{ borderRadius: 2, mr: 0.5, mb: 0.25, color: '#FF7B72', '&:hover': { bgcolor: 'rgba(255,123,114,0.1)' } }}>
              <Stop size={16} weight="fill" />
            </IconButton>
          ) : (
            <IconButton
              size="small" onClick={handleSend}
              disabled={disabled || !input.trim() || !conversationId}
              sx={{
                borderRadius: 2, mr: 0.5, mb: 0.25,
                bgcolor: !disabled && input.trim() && conversationId
                  ? `${userColor}20`
                  : 'transparent',
                color: !disabled && input.trim() && conversationId
                  ? (isDark ? '#A5A0FF' : userColor)
                  : (isDark ? 'rgba(255,255,255,0.2)' : `${userColor}30`),
                '&:hover': {
                  bgcolor: !disabled && input.trim() && conversationId
                    ? `${userColor}30`
                    : 'transparent',
                },
                '&.Mui-disabled': { color: isDark ? 'rgba(255,255,255,0.15)' : `${userColor}20` },
                transition: 'all 0.2s',
              }}
            >
              <SendIcon size={16} weight="fill" />
            </IconButton>
          )}
        </Box>
      </Box>
    </Box>
  );
}
