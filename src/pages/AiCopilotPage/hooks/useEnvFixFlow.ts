/**
 * 环境修复流程：解析 ENV_FIX_STATUS / ENV_FIX_STEP 标记，驱动修复确认卡、进度时间线与完成事件，
 * 并在进入 envFix 场景时自动发起诊断消息。
 *
 * 从 AiCopilotPage/index.tsx 迁出，仅做代码搬迁。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { emit } from '@tauri-apps/api/event';
import type { MutableRefObject } from 'react';
import type { MessageDto } from '../../../proto/agent';
import type { EnvFixStatus, EnvFixStep } from '../types';

export function useEnvFixFlow({
  isEnvFixScene,
  loading,
  messages,
  streamingContent,
  conversationId,
  boundAgentId,
  sendMessage,
  userConsentedRef,
}: {
  isEnvFixScene: boolean;
  loading: boolean;
  messages: MessageDto[];
  streamingContent: string;
  conversationId: string | null;
  boundAgentId: string | null | undefined;
  sendMessage: (msg: string) => Promise<void>;
  userConsentedRef: MutableRefObject<boolean>;
}) {
  const { t } = useTranslation('agent');
  // 环境修复流程状态
  // null=未开始 / need_fix=需要修复 / all_good=一切正常 / fixing=修复中
  // done=全部修复成功 / partial=部分成功部分失败 / failed=全部失败
  const [envFixStatus, setEnvFixStatus] = useState<EnvFixStatus>(null);
  // 修复步骤追踪（时间线）
  const [envFixSteps, setEnvFixSteps] = useState<EnvFixStep[]>([]);
  // 当前正在修复的项
  const [currentFixStep, setCurrentFixStep] = useState<string>('');

  const envFixStatusRef = useRef(envFixStatus);
  useEffect(() => { envFixStatusRef.current = envFixStatus; }, [envFixStatus]);

  // 从流式输出中实时提取步骤标记和状态标记，更新进度追踪
  const parseEnvFixMarkers = useCallback((text: string) => {
    if (!isEnvFixScene) return;

    // 解析步骤开始标记: ENV_FIX_STEP: start N/TOTAL Service desc
    const startRegex = /ENV_FIX_STEP:\s*start\s+(\d+)\/(\d+)\s+(\S+)\s+(.+)/g;
    let match;
    while ((match = startRegex.exec(text)) !== null) {
      const index = parseInt(match[1], 10);
      const total = parseInt(match[2], 10);
      const service = match[3];
      const description = match[4].trim();
      setEnvFixSteps((prev) => {
        // 避免重复添加
        if (prev.some((s) => s.index === index && s.service === service)) return prev;
        const newStep: EnvFixStep = { index, total, service, description, status: 'running' };
        const updated = [...prev, newStep];
        // 按序号排序
        updated.sort((a, b) => a.index - b.index);
        return updated;
      });
      setCurrentFixStep(`${service} — ${description}`);
    }

    // 解析步骤完成标记: ENV_FIX_STEP: done N/TOTAL Service success|failed [reason]
    const doneRegex = /ENV_FIX_STEP:\s*done\s+(\d+)\/(\d+)\s+(\S+)\s+(success|failed)(?:\s+(.+))?/g;
    while ((match = doneRegex.exec(text)) !== null) {
      const index = parseInt(match[1], 10);
      const total = parseInt(match[2], 10);
      const service = match[3];
      const status = match[4] as 'success' | 'failed';
      const errorReason = match[5]?.trim();
      setEnvFixSteps((prev) => {
        const updated = prev.map((s) => {
          if (s.index === index && s.service === service) {
            return { ...s, status, errorReason, total };
          }
          return s;
        });
        // 如果步骤不存在（比如流式中先看到 done 再看到 start，极端情况），添加进去
        if (!updated.some((s) => s.index === index && s.service === service)) {
          const newStep: EnvFixStep = { index, total, service, description: errorReason || '', status, errorReason };
          updated.push(newStep);
          updated.sort((a, b) => a.index - b.index);
        }
        return updated;
      });
    }
  }, [isEnvFixScene]);

  useEffect(() => {
    if (loading || !isEnvFixScene) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant || !lastAssistant.content) return;

    // 从完整消息中解析步骤标记（流式过程中可能被截断，完成后再补全）
    parseEnvFixMarkers(lastAssistant.content);

    // PHASE 1: need_fix / all_good（用户同意前显示确认卡）
    if (!userConsentedRef.current) {
      const m = lastAssistant.content.match(/ENV_FIX_STATUS:\s*(need_fix|all_good)/i);
      if (m) {
        setEnvFixStatus(m[1].toLowerCase() as 'need_fix' | 'all_good');
      }
    }

    // PHASE 3: 完成状态（修复完成后触发重新检测）
    const fixCompletedMatch = lastAssistant.content.match(/ENV_FIX_STATUS:\s*fix_completed/i);
    if (fixCompletedMatch && envFixStatusRef.current !== 'done') {
      setEnvFixStatus('done');
      setCurrentFixStep('');
      emit('env-fix-completed', { conversationId, result: 'success' }).catch(() => {});
    }

    const fixPartialMatch = lastAssistant.content.match(/ENV_FIX_STATUS:\s*fix_partial/i);
    if (fixPartialMatch && envFixStatusRef.current !== 'partial') {
      setEnvFixStatus('partial');
      setCurrentFixStep('');
      emit('env-fix-completed', { conversationId, result: 'partial' }).catch(() => {});
    }

    const fixFailedMatch = lastAssistant.content.match(/ENV_FIX_STATUS:\s*fix_failed/i);
    if (fixFailedMatch && envFixStatusRef.current !== 'failed') {
      setEnvFixStatus('failed');
      setCurrentFixStep('');
      emit('env-fix-completed', { conversationId, result: 'failed' }).catch(() => {});
    }
  }, [messages, loading, isEnvFixScene, conversationId, parseEnvFixMarkers]);

  // 流式过程中实时解析步骤标记（让进度条及时更新，不用等整段消息完成）
  useEffect(() => {
    if (!isEnvFixScene || !streamingContent) return;
    parseEnvFixMarkers(streamingContent);
  }, [streamingContent, isEnvFixScene, parseEnvFixMarkers]);

  // 不再打开即自动触发检测：对话未要求安装时不应自动发起该流程。
  // 用户可在助手窗口中主动提问或要求"检测远程桌面环境"，助手仍走「检查→同意→安装」闸门。
  // 环境修复场景：用户主动从检测页点击进来，自动发起诊断（检测报告已在上下文中）。
  useEffect(() => {
    if (!isEnvFixScene || !conversationId || !boundAgentId || loading) return;
    if (messages.length > 0) return;
    // 自动发第一条消息，触发 AI 对检测报告进行分析
    const firstMsg = t('copilot.env_fix_start_message', '请分析环境检测报告，列出需要修复的问题和修复方案。');
    sendMessage(firstMsg);
  }, [isEnvFixScene, conversationId, boundAgentId, loading, messages.length, sendMessage, t]);

  // 环境修复场景的同意/拒绝
  const handleAgreeEnvFix = useCallback(async () => {
    userConsentedRef.current = true;
    setEnvFixStatus('fixing');
    setEnvFixSteps([]);
    setCurrentFixStep('');
    await sendMessage(t('copilot.env_fix_consent_message', '用户已确认：请开始修复环境问题，按优先级逐个修复，sudo 密码会自动填写。修复完成后请验证所有服务状态。'));
  }, [sendMessage, t]);

  const handleDeclineEnvFix = useCallback(async () => {
    setEnvFixStatus(null);
    setEnvFixSteps([]);
    setCurrentFixStep('');
    await sendMessage(t('copilot.env_fix_decline_message', '好的，暂不修复。需要修复环境时再告诉我。'));
  }, [sendMessage, t]);

  // 环境修复失败后重新修复（重新诊断 + 修复）
  const handleRetryEnvFix = useCallback(async () => {
    setEnvFixStatus('fixing');
    setEnvFixSteps([]);
    setCurrentFixStep('');
    await sendMessage(t('copilot.env_fix_retry_message', '请重新诊断环境问题，并针对之前失败的项尝试不同的修复方法。请列出问题、方案，获得确认后开始修复。'));
  }, [sendMessage, t]);

  return {
    envFixStatus,
    envFixSteps,
    currentFixStep,
    handleAgreeEnvFix,
    handleDeclineEnvFix,
    handleRetryEnvFix,
  };
}