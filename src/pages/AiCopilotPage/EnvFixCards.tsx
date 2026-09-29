/**
 * 环境修复流程卡片：需要修复 / 一切正常 / 修复中 / 全部成功 / 部分成功 / 全部失败。
 * 从 AiCopilotPage.tsx 迁出，仅做代码搬迁。
 */
import { Box, Typography, Button, Accordion, AccordionSummary, AccordionDetails, LinearProgress, Alert } from '@mui/material';
import {
  CheckCircleIcon, XCircleIcon, ClockIcon, CaretDownIcon, ArrowCounterClockwiseIcon,
} from '@phosphor-icons/react';
import type { TFunction } from 'i18next';
import type { EnvFixStep } from './types';

export function EnvFixCards({
  t,
  agentColor,
  mutedBorder,
  isDark,
  loading,
  sessionDead,
  isEnvFixScene,
  envFixStatus,
  envFixSteps,
  currentFixStep,
  onAgree,
  onDecline,
  onRetry,
}: {
  t: TFunction;
  agentColor: string;
  mutedBorder: string;
  isDark: boolean;
  loading: boolean;
  sessionDead: boolean;
  isEnvFixScene: boolean;
  envFixStatus: null | 'need_fix' | 'all_good' | 'fixing' | 'done' | 'partial' | 'failed';
  envFixSteps: EnvFixStep[];
  currentFixStep: string;
  onAgree: () => void;
  onDecline: () => void;
  onRetry: () => void;
}) {
  return (
    <>
      {/* 环境修复：需要修复 — 确认卡 */}
      {isEnvFixScene && !loading && envFixStatus === 'need_fix' && (
        <Box sx={{
          mx: 2, mb: 1.5, p: 1.5, borderRadius: 2,
          border: `1px solid ${agentColor}55`,
          bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
        }}>
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
            {t('copilot.env_fix_need_fix_title', '检测到环境问题需要修复')}
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 1 }}>
            {t('copilot.env_fix_confirm_desc', '是否让 AI 助手自动修复环境问题？过程会修改远程服务器配置，需要 sudo 权限。')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button size="small" variant="text" onClick={onDecline} disabled={sessionDead}>
              {t('copilot.env_fix_decline', '暂不修复')}
            </Button>
            <Button size="small" variant="contained" onClick={onAgree} sx={{ bgcolor: agentColor }} disabled={sessionDead}>
              {t('copilot.env_fix_agree', '同意，开始修复')}
            </Button>
          </Box>
        </Box>
      )}

      {/* 环境修复：一切正常 */}
      {isEnvFixScene && !loading && envFixStatus === 'all_good' && (
        <Box sx={{
          mx: 2, mb: 1.5, p: 1.5, borderRadius: 2,
          border: `1px solid ${mutedBorder}`,
          bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
        }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('copilot.env_fix_all_good', '环境检测一切正常，无需修复。')}
          </Typography>
        </Box>
      )}

      {/* 环境修复：修复中 — 进度条 + 当前项 + 步骤时间线 */}
      {isEnvFixScene && envFixStatus === 'fixing' && envFixSteps.length > 0 && (
        <Box sx={{
          mx: 2, mb: 1.5, p: 1.5, borderRadius: 2,
          border: `1px solid ${agentColor}55`,
          bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: agentColor }}>
              {t('copilot.env_fix_in_progress', '修复进行中')}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {envFixSteps.filter(s => s.status === 'success' || s.status === 'failed').length} / {envFixSteps[0]?.total || '?'}
            </Typography>
          </Box>
          {currentFixStep && (
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 1 }}>
              {t('copilot.env_fix_current_step', '正在处理：')}{currentFixStep}
            </Typography>
          )}
          <LinearProgress
            variant="determinate"
            value={envFixSteps[0]?.total
              ? Math.round((envFixSteps.filter(s => s.status === 'success' || s.status === 'failed').length / envFixSteps[0].total) * 100)
              : 0}
            sx={{ height: 6, borderRadius: 3, mb: 1.5, bgcolor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
              '& .MuiLinearProgress-bar': { bgcolor: agentColor, borderRadius: 3 } }}
          />
          {/* 步骤时间线折叠面板 */}
          <Accordion
            disableGutters
            sx={{
              bgcolor: 'transparent',
              boxShadow: 'none',
              '&:before': { display: 'none' },
              border: `1px solid ${mutedBorder}`,
              borderRadius: 1.5,
            }}
          >
            <AccordionSummary
              expandIcon={<CaretDownIcon size={14} />}
              sx={{ minHeight: 32, '& .MuiAccordionSummary-content': { my: 0.5 } }}
            >
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {t('copilot.env_fix_step_details', '修复步骤详情')}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0, pb: 1 }}>
              {envFixSteps.map((step) => (
                <Box key={`${step.index}-${step.service}`} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1, '&:last-child': { mb: 0 } }}>
                  <Box sx={{ mt: 0.3, flexShrink: 0 }}>
                    {step.status === 'success' && <CheckCircleIcon size={16} color="success.main" />}
                    {step.status === 'failed' && <XCircleIcon size={16} color="error.main" />}
                    {step.status === 'running' && <ClockIcon size={16} color={agentColor} />}
                    {step.status === 'pending' && <ClockIcon size={16} color="disabled" />}
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="caption" sx={{ fontWeight: 500, display: 'block' }}>
                      {step.index}. {step.service} — {step.description}
                    </Typography>
                    {step.status === 'failed' && step.errorReason && (
                      <Typography variant="caption" sx={{ color: 'error.main', display: 'block', mt: 0.3 }}>
                        {step.errorReason}
                      </Typography>
                    )}
                  </Box>
                </Box>
              ))}
            </AccordionDetails>
          </Accordion>
        </Box>
      )}

      {/* 环境修复：全部成功 */}
      {isEnvFixScene && !loading && envFixStatus === 'done' && (
        <Box sx={{
          mx: 2, mb: 1.5, p: 1.5, borderRadius: 2,
          border: '1px solid',
          borderColor: 'success.main',
          bgcolor: isDark ? 'rgba(46,125,50,0.15)' : 'rgba(46,125,50,0.08)',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <CheckCircleIcon size={18} color="success.main" />
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.main' }}>
              {t('copilot.env_fix_done', '环境修复完成')}
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 1 }}>
            {t('copilot.env_fix_done_desc', '所有环境问题已修复。建议返回环境检测页面重新检测确认。')}
          </Typography>
          {envFixSteps.length > 0 && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {t('copilot.env_fix_success_count', '成功修复 {{count}} 项', { count: envFixSteps.filter(s => s.status === 'success').length })}
            </Typography>
          )}
        </Box>
      )}

      {/* 环境修复：部分成功 */}
      {isEnvFixScene && !loading && envFixStatus === 'partial' && (
        <Box sx={{
          mx: 2, mb: 1.5, p: 1.5, borderRadius: 2,
          border: '1px solid',
          borderColor: 'warning.main',
          bgcolor: isDark ? 'rgba(237,108,2,0.12)' : 'rgba(237,108,2,0.08)',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Alert severity="warning" sx={{ p: 0, '& .MuiAlert-icon': { p: 0 }, '& .MuiAlert-message': { p: 0 } }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {t('copilot.env_fix_partial', '部分修复成功')}
              </Typography>
            </Alert>
          </Box>
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 1 }}>
            {t('copilot.env_fix_partial_desc', '部分环境问题已修复，但有一些项失败了。可以查看失败原因后重试。')}
          </Typography>
          {envFixSteps.length > 0 && (
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 1 }}>
              {t('copilot.env_fix_result_count', '成功 {{success}} 项，失败 {{failed}} 项', {
                success: envFixSteps.filter(s => s.status === 'success').length,
                failed: envFixSteps.filter(s => s.status === 'failed').length,
              })}
            </Typography>
          )}
          {/* 失败项列表 */}
          {envFixSteps.filter(s => s.status === 'failed').length > 0 && (
            <Accordion
              disableGutters
              sx={{
                bgcolor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.5)',
                boxShadow: 'none',
                '&:before': { display: 'none' },
                border: `1px solid ${mutedBorder}`,
                borderRadius: 1.5,
                mb: 1.5,
              }}
            >
              <AccordionSummary
                expandIcon={<CaretDownIcon size={14} />}
                sx={{ minHeight: 32, '& .MuiAccordionSummary-content': { my: 0.5 } }}
              >
                <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 500 }}>
                  {t('copilot.env_fix_failed_items', '失败项复盘')}
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0, pb: 1 }}>
                {envFixSteps.filter(s => s.status === 'failed').map((step) => (
                  <Box key={`${step.index}-${step.service}`} sx={{ mb: 1, '&:last-child': { mb: 0 } }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
                      {step.index}. {step.service} — {step.description}
                    </Typography>
                    {step.errorReason && (
                      <Typography variant="caption" sx={{ color: 'error.main', display: 'block', mt: 0.3 }}>
                        {t('copilot.env_fix_error_reason', '失败原因：')}{step.errorReason}
                      </Typography>
                    )}
                  </Box>
                ))}
              </AccordionDetails>
            </Accordion>
          )}
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button
              size="small"
              variant="contained"
              startIcon={<ArrowCounterClockwiseIcon size={14} />}
              onClick={onRetry}
              sx={{ bgcolor: 'warning.main', color: '#fff', '&:hover': { bgcolor: 'warning.dark' } }}
              disabled={sessionDead}
            >
              {t('copilot.env_fix_retry', '重新修复')}
            </Button>
          </Box>
        </Box>
      )}

      {/* 环境修复：全部失败 */}
      {isEnvFixScene && !loading && envFixStatus === 'failed' && (
        <Box sx={{
          mx: 2, mb: 1.5, p: 1.5, borderRadius: 2,
          border: '1px solid',
          borderColor: 'error.main',
          bgcolor: isDark ? 'rgba(211,47,47,0.12)' : 'rgba(211,47,47,0.08)',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <XCircleIcon size={18} color="error.main" />
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'error.main' }}>
              {t('copilot.env_fix_failed', '修复失败')}
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 1 }}>
            {t('copilot.env_fix_failed_desc', '所有修复项都失败了。可以查看聊天记录中的详细错误信息，或尝试重新修复。')}
          </Typography>
          {/* 失败项列表 */}
          {envFixSteps.filter(s => s.status === 'failed').length > 0 && (
            <Accordion
              disableGutters
              sx={{
                bgcolor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.5)',
                boxShadow: 'none',
                '&:before': { display: 'none' },
                border: `1px solid ${mutedBorder}`,
                borderRadius: 1.5,
                mb: 1.5,
              }}
            >
              <AccordionSummary
                expandIcon={<CaretDownIcon size={14} />}
                sx={{ minHeight: 32, '& .MuiAccordionSummary-content': { my: 0.5 } }}
              >
                <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 500 }}>
                  {t('copilot.env_fix_failed_items', '失败项复盘')}
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0, pb: 1 }}>
                {envFixSteps.filter(s => s.status === 'failed').map((step) => (
                  <Box key={`${step.index}-${step.service}`} sx={{ mb: 1, '&:last-child': { mb: 0 } }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
                      {step.index}. {step.service} — {step.description}
                    </Typography>
                    {step.errorReason && (
                      <Typography variant="caption" sx={{ color: 'error.main', display: 'block', mt: 0.3 }}>
                        {t('copilot.env_fix_error_reason', '失败原因：')}{step.errorReason}
                      </Typography>
                    )}
                  </Box>
                ))}
              </AccordionDetails>
            </Accordion>
          )}
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button
              size="small"
              variant="contained"
              color="error"
              startIcon={<ArrowCounterClockwiseIcon size={14} />}
              onClick={onRetry}
              disabled={sessionDead}
            >
              {t('copilot.env_fix_retry', '重新修复')}
            </Button>
          </Box>
        </Box>
      )}
    </>
  );
}