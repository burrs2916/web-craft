import { Box, Typography, Paper, IconButton, Button, Select, MenuItem, Slider, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Tooltip, Switch, Divider } from '@mui/material';
import {
  RobotIcon, XIcon, FloppyDiskIcon, FolderOpenIcon,
  IdentificationCardIcon, CpuIcon, TextAlignLeftIcon,
} from '@phosphor-icons/react';
import { open } from '@tauri-apps/plugin-dialog';
import type { ReactNode, Ref } from 'react';
import type { TFunction } from 'i18next';
import type { EndpointDto, ModelDto } from '../../../../proto/agent';
import { OutlinedField } from './OutlinedField';
import { BRAND, GRADIENT, fieldControlStyle, selectSx } from './constants';
import type { AgentFormData } from './types';

interface Props {
  editing: AgentFormData | null;
  isExisting: boolean;
  models: ModelDto[];
  endpoints: EndpointDto[];
  enabledModels: ModelDto[];
  triggerTypes: { value: string; label: string }[];
  nameTouched: boolean;
  modelTouched: boolean;
  nameInputRef: Ref<HTMLInputElement>;
  onChange: (next: AgentFormData) => void;
  onCancel: () => void;
  onSave: () => void;
  onNameTouched: () => void;
  onModelTouched: () => void;
  isDark: boolean;
  t: TFunction;
}

/** 分区卡片：顶部 3px 渐变条 + 浅品牌色背景 + 圆角，与连接面板 conn-card 视觉一致。 */
function SectionCard({
  icon,
  title,
  description,
  isDark,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string | undefined;
  isDark: boolean;
  children: ReactNode;
}) {
  return (
    <Box sx={{ mb: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1.2 }}>
        <Box sx={{ width: 4, height: 16, borderRadius: 2, background: GRADIENT, alignSelf: 'center' }} />
        {icon}
        <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: 14 }}>
          {title}
        </Typography>
        {description && (
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 11 }}>
            {description}
          </Typography>
        )}
      </Box>
      <Paper
        variant="outlined"
        sx={{
          borderRadius: 2.5,
          overflow: 'hidden',
          borderColor: 'divider',
          bgcolor: isDark ? 'rgba(45,212,191,0.04)' : 'rgba(45,212,191,0.025)',
        }}
      >
        <Box sx={{ height: 3, background: GRADIENT }} />
        <Box sx={{ p: 2.5 }}>{children}</Box>
      </Paper>
    </Box>
  );
}

/** 滑块小工具：极值 + 当前值 Chip。 */
function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <Box sx={{ mb: 0.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {label}
        </Typography>
        <Chip
          label={value}
          size="small"
          sx={{
            height: 20,
            fontSize: 11,
            fontWeight: 700,
            fontFamily: 'monospace',
            bgcolor: 'rgba(45,212,191,0.10)',
            color: BRAND,
          }}
        />
      </Box>
      <Slider
        value={value}
        onChange={(_, v) => onChange(v as number)}
        min={min}
        max={max}
        step={step}
        size="small"
        marks={[
          { value: min, label: <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>{min}</Typography> },
          { value: max, label: <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>{max}</Typography> },
        ]}
        sx={{ color: BRAND, mt: 1 }}
      />
    </Box>
  );
}

/** 智能体编辑器对话框：基本信息 / 模型与执行 / 系统提示词。 */
export function AgentEditorDialog({
  editing,
  isExisting,
  models,
  endpoints,
  enabledModels,
  triggerTypes,
  nameTouched,
  modelTouched,
  nameInputRef,
  onChange,
  onCancel,
  onSave,
  onNameTouched,
  onModelTouched,
  isDark,
  t,
}: Props) {
  return (
    <Dialog
      open={!!editing}
      onClose={onCancel}
      maxWidth="md"
      fullWidth
      scroll="paper"
      slotProps={{
        paper: {
          sx: {
            borderRadius: 3,
            overflow: 'hidden',
            backgroundImage: 'none',
            maxHeight: { xs: '92vh', md: '88vh' },
          },
        },
      }}
    >
      <DialogTitle sx={{ p: 0, position: 'relative' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 3, pt: 2.5, pb: 2 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              background: GRADIENT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(45,212,191,0.35)',
              flexShrink: 0,
            }}
          >
            <RobotIcon size={22} weight="bold" color="#fff" />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontSize: 17, fontWeight: 700, lineHeight: 1.2 }}>
              {isExisting ? t('agent.edit_agent') : t('agent.new_agent')}
            </Typography>
            {isExisting && editing?.name && (
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {editing.name}
              </Typography>
            )}
          </Box>
          <IconButton size="small" onClick={onCancel} sx={{ color: 'text.secondary' }}>
            <XIcon size={18} />
          </IconButton>
        </Box>
        <Box sx={{ height: 3, background: GRADIENT }} />
      </DialogTitle>

      <DialogContent sx={{ p: 3 }}>
        {/* 基本信息 */}
        <SectionCard
          icon={<IdentificationCardIcon size={16} color={BRAND} />}
          title={t('agent.basic_info')}
          description={t('agent.basic_info_desc')}
          isDark={isDark}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <OutlinedField
              label={t('agent.name_label')}
              required
              htmlFor="agent-name-input"
              error={nameTouched && !editing?.name.trim()}
              helperText={
                nameTouched && !editing?.name.trim()
                  ? t('agent.name_required')
                  : ' '
              }
            >
              <input
                id="agent-name-input"
                ref={nameInputRef}
                value={editing?.name ?? ''}
                onChange={(e) => onChange({ ...editing!, name: e.target.value })}
                onBlur={onNameTouched}
                placeholder={t('agent.name_placeholder')}
                style={fieldControlStyle}
              />
            </OutlinedField>
            <OutlinedField
              label={t('agent.model_label')}
              required
              error={modelTouched && !editing?.modelId}
              helperText={
                modelTouched && !editing?.modelId
                  ? t('agent.model_required')
                  : ' '
              }
            >
              <Select
                value={editing?.modelId || ''}
                displayEmpty
                variant="standard"
                disableUnderline
                onChange={(e) => {
                  onChange({ ...editing!, modelId: e.target.value || null });
                  onModelTouched();
                }}
                onOpen={onModelTouched}
                sx={selectSx}
              >
                <MenuItem value="" disabled>
                  {t('agent.select_model')}
                </MenuItem>
                {endpoints.flatMap((ep) => {
                  const epModels = enabledModels.filter((m) => m.endpointId === ep.id);
                  if (epModels.length === 0) return [];
                  return [
                    <MenuItem
                      key={`ep-${ep.id}`}
                      disabled
                      sx={{
                        opacity: 1,
                        fontSize: 11,
                        fontWeight: 700,
                        color: 'text.secondary',
                        py: 0.6,
                        borderTop: '1px solid',
                        borderColor: 'divider',
                        mt: 0.5,
                        cursor: 'default',
                      }}
                    >
                      {ep.name}
                      {ep.baseUrl ? ` · ${ep.baseUrl.replace(/^https?:\/\//, '')}` : ''}
                    </MenuItem>,
                    ...epModels.map((model) => (
                      <MenuItem
                        key={model.id}
                        value={model.id}
                        title={`${ep.name}${ep.baseUrl ? ` · ${ep.baseUrl}` : ''}`}
                        sx={{ fontSize: 13 }}
                      >
                        {model.name} ({model.refKey})
                      </MenuItem>
                    )),
                  ];
                })}
              </Select>
            </OutlinedField>
            <OutlinedField label={t('agent.description_label')}>
              <textarea
                value={editing?.description ?? ''}
                onChange={(e) => onChange({ ...editing!, description: e.target.value })}
                placeholder={t('agent.description_placeholder')}
                rows={4}
                style={{ ...fieldControlStyle, resize: 'vertical', minHeight: 92, lineHeight: 1.5 }}
              />
            </OutlinedField>
          </Box>
        </SectionCard>

        {/* 模型与执行 */}
        <SectionCard
          icon={<CpuIcon size={16} color={BRAND} />}
          title={t('agent.model_config')}
          description={undefined}
          isDark={isDark}
        >
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 calc(50% - 8px)' } }}>
              <OutlinedField label={t('agent.trigger_type_label')}>
                <Select
                  value={editing?.triggerType ?? 'manual'}
                  variant="standard"
                  disableUnderline
                  onChange={(e) => onChange({ ...editing!, triggerType: e.target.value })}
                  sx={selectSx}
                >
                  {triggerTypes.map((tt) => (
                    <MenuItem key={tt.value} value={tt.value}>
                      {tt.label}
                    </MenuItem>
                  ))}
                </Select>
              </OutlinedField>
            </Box>
            <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 calc(50% - 8px)' }, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
              <Typography variant="body2" sx={{ color: 'text.primary', fontSize: 13 }}>
                {t('agent.auto_confirm_label')}
              </Typography>
              <Switch
                checked={!!editing?.autoConfirm}
                onChange={(e) => onChange({ ...editing!, autoConfirm: e.target.checked })}
                size="small"
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': { color: BRAND },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: BRAND },
                }}
              />
            </Box>
            <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 calc(50% - 8px)' } }}>
              <OutlinedField label={t('agent.permission_mode')}>
                <Select
                  value={editing?.permissionMode ?? 'confirm'}
                  variant="standard"
                  disableUnderline
                  onChange={(e) => onChange({ ...editing!, permissionMode: e.target.value })}
                  sx={selectSx}
                >
                  <MenuItem value="confirm">{t('agent.permission_confirm')}</MenuItem>
                  <MenuItem value="auto">{t('agent.permission_auto')}</MenuItem>
                </Select>
              </OutlinedField>
            </Box>
            <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 calc(50% - 8px)' } }}>
              <OutlinedField label={t('agent.fallback_model')}>
                <Select
                  value={editing?.fallbackModelId || ''}
                  displayEmpty
                  variant="standard"
                  disableUnderline
                  onChange={(e) => onChange({ ...editing!, fallbackModelId: e.target.value || null })}
                  sx={selectSx}
                >
                  <MenuItem value="">
                    <em>{t('agent.none')}</em>
                  </MenuItem>
                  {endpoints.flatMap((ep) => {
                    const epModels = models.filter((m) => m.endpointId === ep.id && m.id !== editing?.modelId);
                    if (epModels.length === 0) return [];
                    return [
                      <MenuItem
                        key={`fb-ep-${ep.id}`}
                        disabled
                        sx={{
                          opacity: 1,
                          fontSize: 11,
                          fontWeight: 700,
                          color: 'text.secondary',
                          py: 0.6,
                          borderTop: '1px solid',
                          borderColor: 'divider',
                          mt: 0.5,
                          cursor: 'default',
                        }}
                      >
                        {ep.name}
                        {ep.baseUrl ? ` · ${ep.baseUrl.replace(/^https?:\/\//, '')}` : ''}
                      </MenuItem>,
                      ...epModels.map((m) => (
                        <MenuItem key={m.id} value={m.id} sx={{ fontSize: 13 }}>
                          {m.name || m.refKey}
                        </MenuItem>
                      )),
                    ];
                  })}
                </Select>
              </OutlinedField>
            </Box>
            <Box sx={{ flex: '1 1 100%' }}>
              <OutlinedField
                label={t('agent.workspace_dir')}
                helperText={t('agent.workspace_dir_helper')}
              >
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <input
                    value={editing?.workspaceDir ?? ''}
                    onChange={(e) => onChange({ ...editing!, workspaceDir: e.target.value })}
                    placeholder={t('agent.workspace_dir_placeholder')}
                    style={{ ...fieldControlStyle, flex: 1 }}
                  />
                  <Tooltip title={t('agent.select_workspace_dir')}>
                    <IconButton
                      size="small"
                      sx={{ mr: 0.5 }}
                      onClick={async () => {
                        try {
                          const selected = await open({
                            directory: true,
                            title: t('agent.select_workspace_dir'),
                          });
                          if (selected && typeof selected === 'string') {
                            onChange({ ...editing!, workspaceDir: selected });
                          }
                        } catch (err) { console.error('AgentManager: operation failed', err); }
                      }}
                    >
                      <FolderOpenIcon size={18} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </OutlinedField>
            </Box>
            <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 calc(50% - 8px)' } }}>
              <SliderField
                label={t('agent.temperature_label')}
                value={editing?.temperature ?? 0.7}
                min={0}
                max={2}
                step={0.1}
                onChange={(v) => onChange({ ...editing!, temperature: v })}
              />
            </Box>
            <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 calc(50% - 8px)' } }}>
              <SliderField
                label={t('agent.max_iterations_label')}
                value={editing?.maxIterations ?? 10}
                min={1}
                max={50}
                step={1}
                onChange={(v) => onChange({ ...editing!, maxIterations: v })}
              />
            </Box>
          </Box>
        </SectionCard>

        {/* 系统提示词 */}
        <SectionCard
          icon={<TextAlignLeftIcon size={16} color={BRAND} />}
          title={t('agent.system_prompt_label')}
          description={undefined}
          isDark={isDark}
        >
          <OutlinedField label={t('agent.system_prompt_label')}>
            <Box sx={{ position: 'relative' }}>
              <textarea
                value={editing?.systemPrompt ?? ''}
                onChange={(e) => onChange({ ...editing!, systemPrompt: e.target.value })}
                placeholder={t('agent.system_prompt_placeholder')}
                rows={6}
                style={{ ...fieldControlStyle, fontFamily: 'monospace', fontSize: 12.5, lineHeight: 1.65, resize: 'vertical', minHeight: 132 }}
              />
              <Typography
                variant="caption"
                sx={{
                  position: 'absolute',
                  right: 8,
                  bottom: 6,
                  fontSize: 10,
                  color: 'text.disabled',
                  bgcolor: 'background.paper',
                  px: 0.5,
                  pointerEvents: 'none',
                }}
              >
                {(editing?.systemPrompt ?? '').length} chars
              </Typography>
            </Box>
          </OutlinedField>
        </SectionCard>
      </DialogContent>

      <Divider />
      <DialogActions sx={{ px: 3, py: 2, gap: 1.5 }}>
        <Button
          onClick={onCancel}
          sx={{
            textTransform: 'none',
            color: 'text.secondary',
            border: '1px solid',
            borderColor: 'divider',
            fontSize: 13,
            px: 2.5,
            py: 0.8,
            '&:hover': { borderColor: 'text.secondary', bgcolor: 'action.hover' },
          }}
        >
          {t('agent.cancel')}
        </Button>
        <Button
          variant="contained"
          startIcon={<FloppyDiskIcon size={16} weight="bold" />}
          onClick={onSave}
          disabled={!editing || !editing.name.trim() || !editing.modelId}
          sx={{
            background: GRADIENT,
            textTransform: 'none',
            fontSize: 13,
            px: 3,
            py: 1,
            boxShadow: '0 4px 14px rgba(45,212,191,0.35)',
            '&:hover': { boxShadow: '0 6px 18px rgba(45,212,191,0.5)', background: GRADIENT },
            '&:disabled': { opacity: 0.5, boxShadow: 'none' },
          }}
        >
          {t('agent.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}