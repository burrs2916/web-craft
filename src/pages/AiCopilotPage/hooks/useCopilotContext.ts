/**
 * AI Copilot 场景上下文：从窗口 URL 读取初始上下文（会话/主机/站点/检测报告等），
 * 监听窗口复用推送的上下文更新，检测终端会话存活状态，并构造建会话时写入的 metadata。
 *
 * 从 AiCopilotPage/index.tsx 迁出，仅做代码搬迁。
 */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { createConversation } from '../../../core/services/agent.service';
import { terminalSessionAlive } from '../../../core/services/terminal.service';
import type { ConversationDto } from '../../../proto/agent';

export function useCopilotContext() {
  const { t, i18n } = useTranslation('agent');
  const [searchParams] = useSearchParams();
  const urlAgentId = searchParams.get('agentId');
  const scene = searchParams.get('scene');
  // 上下文用 state 管理，支持窗口复用时通过事件动态更新
  // （URL 只作为初始值，第二次打开窗口时 sessionId 会过期）
  const [ctxSessionId, setCtxSessionId] = useState<string | null>(searchParams.get('sessionId'));
  const [ctxHost, setCtxHost] = useState<string | null>(searchParams.get('host'));
  const [ctxUsername, setCtxUsername] = useState<string | null>(searchParams.get('username'));
  const ctxInstallMode = searchParams.get('installMode') || 'basic';
  const [ctxSiteName, setCtxSiteName] = useState<string | null>(searchParams.get('siteName'));
  const [ctxRemotePath, setCtxRemotePath] = useState<string | null>(searchParams.get('remotePath'));
  const [ctxDomain, setCtxDomain] = useState<string | null>(searchParams.get('domain'));
  const [ctxCheckReport, setCtxCheckReport] = useState<string | null>(searchParams.get('checkReport'));
  // envFix 场景下终端会话存活状态：null=检查中 / true=存活 / false=已断开
  const [sessionAlive, setSessionAlive] = useState<boolean | null>(null);

  const rdSessionId = ctxSessionId;
  const rdHost = ctxHost;
  const rdUsername = ctxUsername;
  const rdInstallMode = ctxInstallMode;
  const siteName = ctxSiteName;
  const srvRemotePath = ctxRemotePath;
  const domain = ctxDomain;
  const checkReport = ctxCheckReport;
  // 场景：'rd'=远程桌面安装 / 'srvEnv'=服务器环境安装 / 'ops'=运维助手 / 'envFix'=环境修复。
  const isSrvEnvScene = scene === 'srvEnv';
  const isOpsScene = scene === 'ops';
  const isEnvFixScene = scene === 'envFix';
  const hasRdContext = !!rdSessionId;
  const hasOpsContext = isOpsScene && !!rdSessionId;
  // 会话是否已断开（需要终端的场景 + 检测结果为 false 或无 sessionId）
  const needsTerminalSession = isEnvFixScene || isOpsScene || isSrvEnvScene || hasRdContext;
  const sessionDead = needsTerminalSession && (sessionAlive === false || !ctxSessionId);
  const sessionDeadReason = !ctxSessionId
    ? t('copilot.session_missing', '终端会话不存在，请从运维中心重新打开')
    : t('copilot.session_lost', 'SSH 会话已断开，请从运维中心重新打开以建立新连接');

  // 远程桌面设置指南携带的上下文：建会话时写入 metadata，供后端 run_agent 注入 system prompt。
  // lang 字段让后端按用户界面语言选择提示词版本（智能体提示词国际化）。
  const buildContextMetadata = useCallback((): Record<string, unknown> | undefined => {
    if (isEnvFixScene) {
      return { envFix: { sessionId: rdSessionId ?? '', host: rdHost ?? '', username: rdUsername ?? '', siteName: siteName ?? '', remotePath: srvRemotePath ?? '', domain: domain ?? '', checkReport: checkReport ?? '', lang: i18n.language || 'zh-CN' } };
    }
    if (isOpsScene) {
      return { ops: { sessionId: rdSessionId ?? '', host: rdHost ?? '', username: rdUsername ?? '', siteName: siteName ?? '', remotePath: srvRemotePath ?? '', lang: i18n.language || 'zh-CN' } };
    }
    if (!hasRdContext) return undefined;
    if (isSrvEnvScene) {
      return { srvEnvSetup: { sessionId: rdSessionId as string, host: rdHost ?? '', username: rdUsername ?? '', siteName: siteName ?? '', remotePath: srvRemotePath ?? '', lang: i18n.language || 'zh-CN' } };
    }
    return { rdSetup: { sessionId: rdSessionId as string, host: rdHost ?? '', username: rdUsername ?? '', installMode: rdInstallMode, lang: i18n.language || 'zh-CN' } };
  }, [isEnvFixScene, isOpsScene, hasRdContext, isSrvEnvScene, rdSessionId, rdHost, rdUsername, rdInstallMode, siteName, srvRemotePath, domain, checkReport, i18n.language]);

  const createConversationWithContext = useCallback(async (agentId: string, title: string): Promise<ConversationDto> => {
    // 所有会话都带界面语言（lang），后端据此锁定输出语言（对自定义 prompt 的智能体同样生效）；
    // 各场景再叠加对应上下文。
    const meta: Record<string, unknown> = { lang: i18n.language || 'zh-CN' };
    const ctxMeta = buildContextMetadata();
    if (ctxMeta) Object.assign(meta, ctxMeta);
    return createConversation(agentId, title, meta);
  }, [buildContextMetadata, i18n.language]);

  // 监听窗口复用推送的上下文更新（第二次打开时 sessionId 等可能变了）
  useEffect(() => {
    let unlistener: (() => void) | null = null;
    (async () => {
      unlistener = await listen<Record<string, unknown>>('ai-copilot:context-update', (event) => {
        const data = event.payload;
        if (typeof data.sessionId === 'string') setCtxSessionId(data.sessionId);
        if (typeof data.host === 'string') setCtxHost(data.host);
        if (typeof data.username === 'string') setCtxUsername(data.username);
        if (typeof data.siteName === 'string') setCtxSiteName(data.siteName);
        if (typeof data.remotePath === 'string') setCtxRemotePath(data.remotePath);
        if (typeof data.domain === 'string') setCtxDomain(data.domain);
        if (typeof data.checkReport === 'string') setCtxCheckReport(data.checkReport);
      });
    })();
    return () => { unlistener?.(); };
  }, []);

  // envFix / ops / srvEnv 场景：检查终端会话是否存活
  useEffect(() => {
    if (!isEnvFixScene && !isOpsScene && !isSrvEnvScene) { setSessionAlive(null); return; }
    if (!ctxSessionId) { setSessionAlive(false); return; }
    setSessionAlive(null); // 重置为检查中
    let cancelled = false;
    (async () => {
      const alive = await terminalSessionAlive(ctxSessionId);
      if (!cancelled) setSessionAlive(alive);
    })();
    return () => { cancelled = true; };
  }, [isEnvFixScene, isOpsScene, isSrvEnvScene, ctxSessionId]);

  return {
    t,
    i18n,
    urlAgentId,
    rdSessionId,
    rdHost,
    rdUsername,
    rdInstallMode,
    siteName,
    srvRemotePath,
    domain,
    checkReport,
    isSrvEnvScene,
    isOpsScene,
    isEnvFixScene,
    hasRdContext,
    hasOpsContext,
    sessionAlive,
    sessionDead,
    sessionDeadReason,
    createConversationWithContext,
  };
}