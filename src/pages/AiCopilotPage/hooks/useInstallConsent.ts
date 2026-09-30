/**
 * 安装流程同意闸门：解析助手返回的 RD_STATUS / SRV_ENV_STATUS 标记，驱动远程桌面（VNC）
 * 与服务器环境（nginx）安装确认卡，并提供同意/拒绝回调。
 *
 * 从 AiCopilotPage/index.tsx 迁出，仅做代码搬迁。
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MutableRefObject } from 'react';
import type { MessageDto } from '../../../proto/agent';
import type { RdStatus, SrvEnvStatus } from '../types';

export function useInstallConsent({
  loading,
  hasRdContext,
  isSrvEnvScene,
  messages,
  sendMessage,
  userConsentedRef,
}: {
  loading: boolean;
  hasRdContext: boolean;
  isSrvEnvScene: boolean;
  messages: MessageDto[];
  sendMessage: (msg: string) => Promise<void>;
  userConsentedRef: MutableRefObject<boolean>;
}) {
  const { t } = useTranslation('agent');
  // 远程桌面安装流程状态：null=未检测 / 'installed'=已装 / 'not_installed'=未装待用户确认
  const [rdStatus, setRdStatus] = useState<RdStatus>(null);
  // 服务器环境安装流程状态：null=未检测 / ready=就绪 / partial=已装未就绪 / missing=未安装
  const [srvEnvStatus, setSrvEnvStatus] = useState<SrvEnvStatus>(null);

  // 解析助手返回的检查结论（RD_STATUS: installed|not_installed），决定何时弹出安装确认。
  useEffect(() => {
    if (loading || !hasRdContext || isSrvEnvScene || userConsentedRef.current) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant || !lastAssistant.content) return;
    const m = lastAssistant.content.match(/RD_STATUS:\s*(installed|not_installed)/i);
    if (m) {
      setRdStatus(m[1].toLowerCase() === 'installed' ? 'installed' : 'not_installed');
    }
  }, [messages, loading, hasRdContext, isSrvEnvScene]);

  // 服务器环境场景：解析 SRV_ENV_STATUS: ready|partial|missing，驱动环境安装确认卡。
  useEffect(() => {
    if (loading || !hasRdContext || !isSrvEnvScene || userConsentedRef.current) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant || !lastAssistant.content) return;
    const m = lastAssistant.content.match(/SRV_ENV_STATUS:\s*(ready|partial|missing)/i);
    if (m) {
      setSrvEnvStatus(m[1].toLowerCase() as 'ready' | 'partial' | 'missing');
    }
  }, [messages, loading, hasRdContext, isSrvEnvScene]);

  const handleAgreeInstall = useCallback(async () => {
    userConsentedRef.current = true;
    setRdStatus(null);
    // 发给模型的消息跟随界面语言（英文环境下必须是英文，避免把模型带偏成中文回复）
    await sendMessage(t('copilot.rd_consent_message', '用户已确认：请在远程服务器上安装并配置 VNC 远程桌面（按标准流程执行，sudo 密码会自动填写）。'));
  }, [sendMessage, t]);

  const handleDeclineInstall = useCallback(async () => {
    setRdStatus(null);
    await sendMessage(t('copilot.rd_decline_message', '好的，暂不安装。等你需要在远程服务器上安装 VNC 时再告诉我。'));
  }, [sendMessage, t]);

  // 服务器环境场景的同意/拒绝：与 RD 场景同构，文案不同。
  const handleAgreeEnvInstall = useCallback(async () => {
    userConsentedRef.current = true;
    setSrvEnvStatus(null);
    await sendMessage(t('copilot.srv_consent_message', '用户已确认：请安装并配置部署环境（nginx + systemd 自启 + 防火墙放行 80/443，按标准流程执行，sudo 密码会自动填写）。'));
  }, [sendMessage, t]);

  const handleDeclineEnvInstall = useCallback(async () => {
    setSrvEnvStatus(null);
    await sendMessage(t('copilot.srv_decline_message', '好的，暂不安装。需要准备部署环境时再告诉我。'));
  }, [sendMessage, t]);

  return {
    rdStatus,
    srvEnvStatus,
    handleAgreeInstall,
    handleDeclineInstall,
    handleAgreeEnvInstall,
    handleDeclineEnvInstall,
  };
}