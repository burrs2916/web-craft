import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Box, Typography, Divider, Chip, IconButton, Tooltip, Button, TextField, InputAdornment,
  LinearProgress, Alert, Accordion, AccordionSummary, AccordionDetails,
} from '@mui/material';
import {
  RobotIcon, SparkleIcon, PlusIcon, ListIcon, TrashIcon,
  CheckCircleIcon, XCircleIcon, ClockIcon, CaretDownIcon,
  ArrowCounterClockwiseIcon, MagnifyingGlassIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';
import { useAgentStore } from '../features/agent/store/agentStore';
import { runAgent, saveMessage, listMessages, createConversation, listConversations, stopAgent, updateConversationTitle, deleteConversation, appendEnvOpsLog } from '../core/services/agent.service';
import { terminalSessionAlive } from '../core/services/terminal.service';
import type { MessageDto, ConversationDto } from '../proto/agent';
import { listen, emit } from '@tauri-apps/api/event';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useNotify } from '../core/notification';
import { ChatMessagesArea, ChatInputArea, type FileAttachment } from '../components/chat/ChatComponents';
import type { ToolCallDisplay } from '../components/chat/ChatComponents';
import { useFeatureGate, LockedScreen } from '../features/licensing';
import { localizeBackendError } from '../core/backendError';

const STORAGE_KEY = 'webcraft_terminal_copilot_agent_id';

export function getTerminalCopilotAgentId(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setTerminalCopilotAgentId(id: string | null) {
  if (id) {
    localStorage.setItem(STORAGE_KEY, id);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

interface StreamChunk { conversationId: string; chunk: string }
interface StreamDone { conversationId: string; response: string }
interface StreamError { conversationId: string; error: string }
interface ToolCallEvent {
  tool_name: string;
  arguments: Record<string, unknown>;
  result: string | null;
  success: boolean | null;
  status: 'running' | 'done';
}
interface ToolCallPayload { conversationId: string; toolCall: ToolCallEvent }

// 环境修复步骤追踪
interface EnvFixStep {
  index: number;        // 序号，从 1 开始
  total: number;        // 总步骤数
  service: string;      // 服务名
  description: string;  // 简短描述
  status: 'pending' | 'running' | 'success' | 'failed';
  errorReason?: string; // 失败原因
}

export function AiCopilotPage() {
  // Pro 功能：未付费时显示锁定页
  const featureGate = useFeatureGate('ai_copilot');

  const { t, i18n } = useTranslation('agent');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const agentColor = isDark ? '#38BDF8' : '#0284C7';
  const userColor = isDark ? '#60A5FA' : '#1D4ED8';
  const mutedBorder = isDark ? 'rgba(48,54,61,0.6)' : 'rgba(0,0,0,0.08)';

  const { agents, models, endpoints, loadAgents, loadModels, loadEndpoints, checkOllamaStatus } = useAgentStore();

  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingReasoning, setStreamingReasoning] = useState('');
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCallDisplay[]>([]);
  const [streamingToolCalls, setStreamingToolCalls] = useState<Array<{
    index: number;
    id?: string;
    name: string;
    arguments: string;
    isStreaming: boolean;
  }>>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [convList, setConvList] = useState<ConversationDto[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [agentStatus, setAgentStatus] = useState<{
    status: string;
    iteration: number;
    maxIterations: number;
    detail?: string;
    streamStats?: {
      charsTotal: number;
      tokensEstimated: number;
      charsPerSec: number;
      tokensPerSec: number;
      elapsedMs: number;
    } | null;
    contextUsage?: {
      tokensUsed: number;
      contextWindow: number;
      usageRatio: number;
    } | null;
    isOllama?: boolean;
  } | null>(null);
  const streamingMsgIdRef = useRef<string | null>(null);
  const toolCallCounterRef = useRef(0);

  // ===== 长耗时命令倒计时等待 =====
  const [longRunningTask, setLongRunningTask] = useState<{
    description: string;
    totalSeconds: number;
    remainingSeconds: number;
    active: boolean;
  } | null>(null);
  const longRunningTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendMessageRef = useRef<((msg: string) => Promise<void>) | null>(null);
  const longRunningDetectedRef = useRef(false); // 流式检测去重

  // 倒计时 debug log 便捷函数
  const logCountdown = useCallback((event: string, detail: string) => {
    const runId = conversationId ?? 'unknown';
    appendEnvOpsLog('DEBUG', runId, 'countdown', event, detail).catch(() => {});
    console.log(`[countdown][${event}] ${detail}`);
  }, [conversationId]);

  // 从消息中检测 LONG_RUNNING 标记
  const detectLongRunning = useCallback((content: string, source: 'stream' | 'final' = 'final') => {
    if (longRunningDetectedRef.current) return; // 已经检测到过，跳过
    const match = content.match(/LONG_RUNNING:\s*wait\s+(\d+)\s+(.+)/i);
    if (match) {
      const seconds = parseInt(match[1], 10);
      const description = match[2].trim();
      if (seconds > 0 && seconds < 3600) { // 合理范围：1秒~1小时
        longRunningDetectedRef.current = true;
        logCountdown('detected', `source=${source} seconds=${seconds} description=${description}`);
        setLongRunningTask({
          description,
          totalSeconds: seconds,
          remainingSeconds: seconds,
          active: true,
        });
      }
    }
  }, [logCountdown]);

  // 倒计时逻辑：每秒减 1，到 0 时自动触发 Agent 检查结果
  useEffect(() => {
    if (!longRunningTask?.active) return;
    if (longRunningTask.remainingSeconds <= 0) return;

    logCountdown('start', `description=${longRunningTask.description} totalSeconds=${longRunningTask.totalSeconds}`);

    longRunningTimerRef.current = setInterval(() => {
      setLongRunningTask((prev) => {
        if (!prev || !prev.active) return prev;
        const next = prev.remainingSeconds - 1;
        if (next <= 0) {
          // 倒计时结束，清除定时器
          if (longRunningTimerRef.current) {
            clearInterval(longRunningTimerRef.current);
            longRunningTimerRef.current = null;
          }
          logCountdown('completed', `description=${prev.description} totalSeconds=${prev.totalSeconds}`);
          // 自动发送消息让 Agent 检查结果并继续
          const autoMsg = `⏱️ 等待时间已到（${prev.totalSeconds}秒）。请检查「${prev.description}」的执行结果，确认是否成功。如果成功了就继续下一步；如果失败了，分析原因并修复。`;
          setTimeout(() => sendMessageRef.current?.(autoMsg), 100);
          return { ...prev, remainingSeconds: 0, active: false };
        }
        return { ...prev, remainingSeconds: next };
      });
    }, 1000);

    return () => {
      if (longRunningTimerRef.current) {
        clearInterval(longRunningTimerRef.current);
        longRunningTimerRef.current = null;
      }
    };
  }, [longRunningTask?.active, longRunningTask?.description, longRunningTask?.totalSeconds, logCountdown]);

  // 手动跳过等待
  const handleSkipWait = useCallback(() => {
    if (longRunningTimerRef.current) {
      clearInterval(longRunningTimerRef.current);
      longRunningTimerRef.current = null;
    }
    if (longRunningTask) {
      logCountdown('skipped', `description=${longRunningTask.description} remaining=${longRunningTask.remainingSeconds}s`);
      const autoMsg = `⏭️ 用户跳过了等待。请检查「${longRunningTask.description}」的执行结果，确认是否成功。如果成功了就继续下一步；如果失败了，分析原因并修复。`;
      setLongRunningTask(null);
      longRunningDetectedRef.current = false; // 重置检测标记，允许后续再次检测
      setTimeout(() => sendMessageRef.current?.(autoMsg), 100);
    }
  }, [longRunningTask, logCountdown]);

  // 秒数格式化为 mm:ss
  const formatTimeLeft = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // 切换会话时清除倒计时状态
  useEffect(() => {
    if (longRunningTask?.active) {
      const prevDesc = longRunningTask.description;
      const prevRemain = longRunningTask.remainingSeconds;
      const prevRunId = conversationId ?? 'unknown';
      appendEnvOpsLog('DEBUG', prevRunId, 'countdown', 'cleared_on_switch', `description=${prevDesc} remaining=${prevRemain}s`).catch(() => {});
      console.log(`[countdown][cleared_on_switch] description=${prevDesc} remaining=${prevRemain}s`);
    }
    setLongRunningTask(null);
    longRunningDetectedRef.current = false;
    if (longRunningTimerRef.current) {
      clearInterval(longRunningTimerRef.current);
      longRunningTimerRef.current = null;
    }
  }, [conversationId]);

  // 合并流式工具调用和执行中工具调用
  const combinedToolCalls = useMemo<ToolCallDisplay[]>(() => {
    const streaming: ToolCallDisplay[] = streamingToolCalls.map((stc, idx) => ({
      id: `streaming-${stc.index}-${idx}`,
      toolName: stc.name || '...',
      arguments: (() => {
        try {
          return stc.arguments ? JSON.parse(stc.arguments) : {};
        } catch {
          return { _raw: stc.arguments };
        }
      })(),
      result: null,
      success: null,
      status: stc.isStreaming ? 'streaming' : 'done',
    }));
    return [...streaming, ...toolCalls];
  }, [streamingToolCalls, toolCalls]);

  // Ollama 本地模型状态检测
  const [ollamaStatus, setOllamaStatus] = useState<{
    checking: boolean;
    available: boolean;
    modelLoaded: boolean;
    version: string;
    error: string | null;
  } | null>(null);

  // 过滤后的会话列表（按标题搜索）
  const filteredConvList = useMemo(() => {
    if (!searchKeyword.trim()) return convList;
    const keyword = searchKeyword.toLowerCase().trim();
    return convList.filter((c) =>
      c.title?.toLowerCase().includes(keyword)
    );
  }, [convList, searchKeyword]);

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
  // 远程桌面安装流程状态：null=未检测 / 'installed'=已装 / 'not_installed'=未装待用户确认
  const [rdStatus, setRdStatus] = useState<null | 'installed' | 'not_installed'>(null);
  // 服务器环境安装流程状态：null=未检测 / ready=就绪 / partial=已装未就绪 / missing=未安装
  const [srvEnvStatus, setSrvEnvStatus] = useState<null | 'ready' | 'partial' | 'missing'>(null);
  // 环境修复流程状态
  // null=未开始 / need_fix=需要修复 / all_good=一切正常 / fixing=修复中
  // done=全部修复成功 / partial=部分成功部分失败 / failed=全部失败
  const [envFixStatus, setEnvFixStatus] = useState<null | 'need_fix' | 'all_good' | 'fixing' | 'done' | 'partial' | 'failed'>(null);
  // 修复步骤追踪（时间线）
  const [envFixSteps, setEnvFixSteps] = useState<EnvFixStep[]>([]);
  // 当前正在修复的项
  const [currentFixStep, setCurrentFixStep] = useState<string>('');
  // 两场景互斥（由窗口 URL 决定），共用一个同意标记即可。
  const userConsentedRef = useRef(false);

  const storedAgentId = getTerminalCopilotAgentId();
  const boundAgentId = urlAgentId ?? storedAgentId;
  const boundAgent = agents.find((a) => a.id === boundAgentId);
  const boundModel = boundAgent ? models.find((m) => m.id === boundAgent.modelId) : null;
  // 绑定 id 残留但对应智能体已不存在（被删/改）时，给出明确提示，而非运行期崩溃
  const boundAgentMissing = boundAgentId != null && agents.length > 0 && !boundAgent;
  const notify = useNotify().notify;

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

  // 若回退发生了，持久化新选择，保证后续加载稳定。
  // 注：来自设置指南的临时绑定（URL 带 agentId）不覆盖用户常驻的 copilot 绑定。
  useEffect(() => {
    if (urlAgentId) return;
    if (boundAgentId && boundAgentId !== storedAgentId) {
      setTerminalCopilotAgentId(boundAgentId);
    }
  }, [boundAgentId, storedAgentId, urlAgentId]);

  useEffect(() => {
    loadAgents();
    loadModels();
    loadEndpoints();
  }, [loadAgents, loadModels, loadEndpoints]);

  // 判断当前模型是否为 Ollama 本地模型
  const isOllamaModel = useMemo(() => {
    if (!boundModel) return false;
    const endpoint = endpoints.find((e) => e.id === boundModel.endpointId);
    return endpoint?.apiType === 'ollama';
  }, [boundModel, endpoints]);

  // 获取当前模型对应的 endpoint
  const currentEndpoint = useMemo(() => {
    if (!boundModel) return null;
    return endpoints.find((e) => e.id === boundModel.endpointId) || null;
  }, [boundModel, endpoints]);

  // Ollama 模型：进入页面时自动检测服务状态
  useEffect(() => {
    if (!isOllamaModel || !currentEndpoint || !boundModel) return;

    let cancelled = false;
    const checkStatus = async () => {
      setOllamaStatus({ checking: true, available: false, modelLoaded: false, version: '', error: null });
      try {
        const status = await checkOllamaStatus(currentEndpoint.baseUrl, boundModel.refKey);
        if (cancelled) return;
        setOllamaStatus({
          checking: false,
          available: status.serviceAvailable,
          modelLoaded: status.modelLoaded,
          version: status.version,
          error: status.error,
        });
      } catch (err) {
        if (cancelled) return;
        setOllamaStatus({
          checking: false,
          available: false,
          modelLoaded: false,
          version: '',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    checkStatus();
    return () => { cancelled = true; };
  }, [isOllamaModel, currentEndpoint, boundModel, checkOllamaStatus]);

  const loadConversations = useCallback(async (): Promise<ConversationDto[]> => {
    if (!boundAgentId) return [];
    try {
      const convs = await listConversations(boundAgentId);
      const sorted = [...convs].sort((a, b) => b.updatedAt - a.updatedAt);
      setConvList(sorted);
      return sorted;
    } catch (err) { console.error('AiCopilotPage: operation failed', err); return []; }
  }, [boundAgentId]);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // envFix/ops/srvEnv 场景下，等 session 检查完成再加载对话
      if ((isEnvFixScene || isOpsScene || isSrvEnvScene) && sessionAlive === null) return;
      const sorted = await loadConversations();
      if (cancelled) return;
      if (sorted.length > 0) {
        const conv = sorted[0];
        setConversationId(conv.id);
        try {
          const msgs = await listMessages(conv.id);
          if (!cancelled) setMessages(msgs);
        } catch (e) { console.error('AiCopilotPage: operation failed', e); }
      } else {
        try {
          const conv = await createConversationWithContext(boundAgentId!, 'AI Copilot');
          if (!cancelled) {
            setConversationId(conv.id);
            setMessages([]);
            setConvList([conv]);
          }
        } catch (e) { console.error('AiCopilotPage: operation failed', e); }
      }
    })();
    return () => { cancelled = true; };
  }, [boundAgentId, loadConversations, isEnvFixScene, isOpsScene, isSrvEnvScene, sessionAlive]);

  const selectConversation = useCallback(async (id: string) => {
    setConversationId(id);
    setMessages([]);
    try {
      const msgs = await listMessages(id);
      setMessages(msgs);
    } catch (e) { console.error('AiCopilotPage: operation failed', e); }
  }, []);

  const handleNewChat = async () => {
    if (!boundAgentId) return;
    try {
      const conv = await createConversationWithContext(boundAgentId, 'AI Copilot');
      setConvList((prev) => [conv, ...prev].sort((a, b) => b.updatedAt - a.updatedAt));
      setConversationId(conv.id);
      setMessages([]);
    } catch (err) { console.error('AiCopilotPage: operation failed', err); }
  };

  const handleDeleteConv = async (id: string) => {
    try {
      await deleteConversation(id);
      setConvList((prev) => {
        const next = prev.filter((c) => c.id !== id);
        if (conversationId === id) {
          if (next.length > 0) {
            const recent = next[0];
            setConversationId(recent.id);
            listMessages(recent.id).then((msgs) => setMessages(msgs)).catch(() => {});
          } else {
            setConversationId(null);
            setMessages([]);
          }
        }
        return next;
      });
    } catch (err) { console.error('AiCopilotPage: operation failed', err); }
  };

  useEffect(() => {
    if (!conversationId) return;

    const unlistenChunk = listen<StreamChunk>('agent-chunk', (event) => {
      if (event.payload.conversationId === conversationId) {
        const chunk = event.payload.chunk;
        // 工具调用流式增量（\x02 前缀 + JSON）
        if (chunk.startsWith('\x02')) {
          try {
            const deltas: Array<{
              index: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }> = JSON.parse(chunk.slice(1));
            setStreamingToolCalls((prev) => {
              const next = [...prev];
              for (const delta of deltas) {
                const idx = next.findIndex((tc) => tc.index === delta.index);
                if (idx === -1) {
                  next.push({
                    index: delta.index,
                    id: delta.id,
                    name: delta.function?.name ?? '',
                    arguments: delta.function?.arguments ?? '',
                    isStreaming: true,
                  });
                } else {
                  const tc = next[idx];
                  next[idx] = {
                    ...tc,
                    id: delta.id ?? tc.id,
                    name: (tc.name + (delta.function?.name ?? '')).trim(),
                    arguments: tc.arguments + (delta.function?.arguments ?? ''),
                    isStreaming: true,
                  };
                }
              }
              return next;
            });
          } catch (e) {
            // 静默忽略解析错误
          }
        }
        // 完成原因（\x03 前缀）
        else if (chunk.startsWith('\x03')) {
          const reason = chunk.slice(1);
          if (reason === 'tool_calls' || reason === 'tool_use') {
            setStreamingToolCalls((prev) => prev.map((tc) => ({ ...tc, isStreaming: false })));
          }
        }
        // 思考过程（\x04 前缀）
        else if (chunk.startsWith('\x04')) {
          const reasoningText = chunk.slice(1);
          if (reasoningText) {
            setStreamingReasoning((prev) => prev + reasoningText);
          }
        }
        // 普通文本内容
        else {
          setStreamingContent((prev) => {
            const next = prev + chunk;
            // 流式中检测 LONG_RUNNING 标记，提前启动倒计时
            if (!longRunningDetectedRef.current) {
              detectLongRunning(next, 'stream');
            }
            return next;
          });
        }
      }
    });

    const unlistenDone = listen<StreamDone>('agent-done', async (event) => {
      if (event.payload.conversationId === conversationId) {
        const msgId = streamingMsgIdRef.current;
        const responseText = event.payload.response || '';
        if (msgId) {
          setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, content: responseText } : m));
        }
        try {
          const allMsgs = await listMessages(conversationId);
          setMessages(allMsgs);
          const firstUserMsg = allMsgs.find((m) => m.role === 'user');
          if (firstUserMsg) {
            const autoTitle = firstUserMsg.content.replace(/\[(?:附件|Attachment):.*?\]\s*/g, '').trim().slice(0, 40);
            if (autoTitle) {
              updateConversationTitle(conversationId, autoTitle).catch((e) => notify(localizeBackendError(e)));
              setConvList((prev) => prev.map((c) => c.id === conversationId ? { ...c, title: autoTitle } : c));
            }
          }
        } catch (err) { console.error('AiCopilotPage: operation failed', err); }

        // 检测 LONG_RUNNING 标记：Agent 执行了长耗时命令，前端倒计时等待
        detectLongRunning(responseText, 'final');

        // 安装助手：同意过安装的会话结束时，通知发起窗口刷新状态，
        // 省去用户手动点「重新检查」。事件名按场景区分。
        if (hasRdContext && userConsentedRef.current && !isOpsScene) {
          emit(isSrvEnvScene ? 'srv-env-setup-completed' : 'rd-setup-completed', { conversationId }).catch(() => {});
        }
        // 环境修复场景：用户同意修复并完成后，通知刷新环境检测
        if (isEnvFixScene && userConsentedRef.current) {
          emit('env-fix-completed', { conversationId }).catch(() => {});
        }
        setStreamingContent('');
        setStreamingReasoning('');
        setStreamingToolCalls([]);
        setLoading(false);
        setAgentStatus(null);
        streamingMsgIdRef.current = null;
      }
    });

    const unlistenError = listen<StreamError>('agent-error', (event) => {
      if (event.payload.conversationId === conversationId) {
        const msgId = streamingMsgIdRef.current;
        if (msgId) {
          setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, content: `❌ ${event.payload.error}` } : m));
        }
        setStreamingContent('');
        setStreamingReasoning('');
        setStreamingToolCalls([]);
        setLoading(false);
        // 设置错误状态（保持显示，不清除状态栏）
        setAgentStatus({
          status: 'error',
          iteration: 0,
          maxIterations: 0,
          detail: event.payload.error,
          streamStats: null,
          contextUsage: null,
          isOllama: isOllamaModel,
        });
        streamingMsgIdRef.current = null;
      }
    });

    const unlistenPanic = listen<{ message: string; location: string }>('app-panic', (event) => {
      // 后端命令 panic 时 invoke Promise 永远不会 resolve/reject，
      // 必须靠此事件解除 loading，否则界面永远"思考中"。
      const msgId = streamingMsgIdRef.current;
      const panicText = `❌ 后端内部错误（已恢复）：${event.payload.location || '未知位置'}`;
      if (msgId) {
        setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, content: panicText } : m));
      }
      if (streamingMsgIdRef.current !== null) {
        setStreamingContent('');
        setStreamingReasoning('');
        setStreamingToolCalls([]);
        setLoading(false);
        streamingMsgIdRef.current = null;
        console.error('[AiCopilotPage] backend panic:', event.payload.message);
      }
    });

    const unlistenToolCall = listen<ToolCallPayload>('agent-tool-call', (event) => {
      if (event.payload.conversationId === conversationId) {
        const tc = event.payload.toolCall;
        if (tc.status === 'running') {
          toolCallCounterRef.current += 1;
          const id = `tc-${toolCallCounterRef.current}`;
          setToolCalls((prev) => [...prev, {
            id, toolName: tc.tool_name, arguments: tc.arguments,
            result: null, success: null, status: 'running',
          }]);
        } else {
          setToolCalls((prev) => {
            const last = prev.length - 1;
            if (last >= 0 && prev[last].status === 'running') {
              const updated = [...prev];
              updated[last] = { ...updated[last], result: tc.result, success: tc.success, status: 'done' };
              return updated;
            }
            return prev;
          });
        }
      }
    });

    const unlistenStatus = listen<{
      conversationId: string;
      status: string;
      iteration: number;
      maxIterations: number;
      detail?: string;
      streamStats?: {
        charsTotal: number;
        tokensEstimated: number;
        charsPerSec: number;
        tokensPerSec: number;
        elapsedMs: number;
      } | null;
      contextUsage?: {
        tokensUsed: number;
        contextWindow: number;
        usageRatio: number;
      } | null;
    }>('agent-status', (event) => {
      if (event.payload.conversationId === conversationId) {
        setAgentStatus({
          status: event.payload.status,
          iteration: event.payload.iteration,
          maxIterations: event.payload.maxIterations,
          detail: event.payload.detail,
          streamStats: event.payload.streamStats || null,
          contextUsage: event.payload.contextUsage || null,
          isOllama: isOllamaModel,
        });
        if (event.payload.status === 'done') {
          setTimeout(() => setAgentStatus(null), 1500);
        } else if (event.payload.status === 'error') {
          // 错误状态：停止 loading，保持错误状态显示
          setLoading(false);
        }
      }
    });

    return () => {
      unlistenChunk.then((fn) => fn());
      unlistenDone.then((fn) => fn());
      unlistenError.then((fn) => fn());
      unlistenPanic.then((fn) => fn());
      unlistenToolCall.then((fn) => fn());
      unlistenStatus.then((fn) => fn());
    };
  }, [conversationId]);

  const sendMessage = useCallback(async (messageText: string) => {
    if (!messageText.trim() || !conversationId || !boundAgentId) return;

    const userMsg: MessageDto = {
      id: crypto.randomUUID(), conversationId, role: 'user',
      content: messageText.trim(), toolCalls: '', isError: 0, createdAt: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    setToolCalls([]);
    setStreamingToolCalls([]);
    toolCallCounterRef.current = 0;

    try { await saveMessage(userMsg); } catch (err) { console.error('AiCopilotPage: operation failed', err); }

    const assistantMsgId = crypto.randomUUID();
    streamingMsgIdRef.current = assistantMsgId;

    const assistantMsg: MessageDto = {
      id: assistantMsgId, conversationId, role: 'assistant',
      content: '', toolCalls: '', isError: 0, createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, assistantMsg]);
    setStreamingContent('');
    setStreamingReasoning('');
    setStreamingToolCalls([]);
    longRunningDetectedRef.current = false; // 新对话重置检测标记

    try {
      await runAgent(boundAgentId, messageText.trim(), conversationId);
    } catch (e) {
      setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, content: `❌ ${localizeBackendError(e)}` } : m));
      setStreamingContent('');
      setStreamingReasoning('');
      setStreamingToolCalls([]);
      setLoading(false);
      streamingMsgIdRef.current = null;
    }
  }, [conversationId, boundAgentId]);

  // 同步到 ref，供倒计时等场景使用（避免循环依赖）
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  const handleSend = useCallback(async () => {
    if (!input.trim()) return;
    let messageContent = input.trim();
    if (attachments.length > 0) {
      const attachmentText = attachments.map((f) => t('copilot.attachment_prefix', { path: f.path })).join('\n');
      messageContent = `${attachmentText}\n\n${messageContent}`;
    }
    setInput('');
    setAttachments([]);
    await sendMessage(messageContent);
  }, [input, attachments, sendMessage]);

  useEffect(() => {
    if (!boundAgentId || !conversationId) return;

    const triggerType = boundAgent?.triggerType || 'manual';
    if (triggerType === 'manual') return;

    const supportsFailure = triggerType === 'auto_failure' || triggerType === 'auto_both';
    const supportsSave = triggerType === 'auto_save' || triggerType === 'auto_both';

    const unlisteners: (() => void)[] = [];

    if (supportsFailure) {
      listen<{ triggerType: string; command: string; exitCode: number; sessionId: string }>('auto-trigger-agent', (event) => {
        if (event.payload.triggerType !== 'auto_failure') return;
        if (loading) return;
        const autoMessage = t('copilot.auto_failure_prompt', { command: event.payload.command, exitCode: event.payload.exitCode });
        sendMessage(autoMessage);
      }).then((fn) => { unlisteners.push(fn); });
    }

    if (supportsSave) {
      listen<{ triggerType: string; noteId: string; noteTitle: string; action: string }>('auto-trigger-agent', (event) => {
        if (event.payload.triggerType !== 'auto_save') return;
        if (loading) return;
        const actionText = event.payload.action === 'create' ? t('copilot.auto_save_create') : t('copilot.auto_save_update');
        const autoMessage = t('copilot.auto_save_prompt', { action: actionText, title: event.payload.noteTitle });
        sendMessage(autoMessage);
      }).then((fn) => { unlisteners.push(fn); });
    }

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, [boundAgentId, conversationId, boundAgent?.triggerType, loading, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

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

  // 环境修复场景：解析 ENV_FIX_STATUS 标记，驱动修复确认卡和完成事件。
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

  const handleStop = async () => {
    if (conversationId) {
      try {
        await stopAgent(conversationId);
      } catch (err) { console.error('AiCopilotPage: operation failed', err); }
    }
    setLoading(false);
    setStreamingContent('');
    setStreamingReasoning('');
    setStreamingToolCalls([]);
    streamingMsgIdRef.current = null;
  };

  if (!boundAgentId || boundAgentMissing) {
    return (
      <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, p: 3, bgcolor: 'background.default' }}>
        <SparkleIcon size={48} weight="duotone" color="#60A5FA" />
        <Typography variant="body1" sx={{ fontWeight: 600, textAlign: 'center' }}>
          {boundAgentMissing ? t('copilot.agent_missing') : t('copilot.no_agent_bound')}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', maxWidth: 320, lineHeight: 1.6 }}>
          {boundAgentMissing ? t('copilot.agent_missing_desc') : t('copilot.no_agent_bound_desc')}
        </Typography>
      </Box>
    );
  }

  // 未付费用户显示锁定页
  if (!featureGate.canUse) {
    return <LockedScreen feature="ai_copilot" />;
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'row', bgcolor: 'background.default' }}>
      {sidebarOpen && (
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
              <IconButton size="small" onClick={handleNewChat} sx={{ borderRadius: 2, border: `1px solid ${agentColor}30`, color: agentColor }}>
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
              onChange={(e) => setSearchKeyword(e.target.value)}
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
            {filteredConvList.length === 0 ? (
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', textAlign: 'center', mt: 2, fontSize: 11 }}>
                {searchKeyword.trim() ? '没有匹配的会话' : t('copilot.no_sessions')}
              </Typography>
            ) : (
              filteredConvList.map((c) => (
                <Box
                  key={c.id}
                  onClick={() => selectConversation(c.id)}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 0.5, p: 1, mb: 0.5, borderRadius: 2, cursor: 'pointer',
                    bgcolor: c.id === conversationId ? `${agentColor}18` : 'transparent',
                    border: c.id === conversationId ? `1px solid ${agentColor}40` : '1px solid transparent',
                    '&:hover': { bgcolor: `${agentColor}10` },
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontSize: 12, fontWeight: c.id === conversationId ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.title || 'AI Copilot'}
                    </Typography>
                    <Typography variant="caption" sx={{ fontSize: 10, color: 'text.secondary' }}>
                      {new Date(c.updatedAt).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </Typography>
                  </Box>
                  <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); handleDeleteConv(c.id); }}
                    sx={{ p: 0.25, opacity: 0.5, '&:hover': { opacity: 1, color: 'error.main' } }}
                  >
                    <TrashIcon size={14} />
                  </IconButton>
                </Box>
              ))
            )}
          </Box>
        </Box>
      )}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 0.75 }}>
          <IconButton size="small" onClick={() => setSidebarOpen((o) => !o)} sx={{ borderRadius: 2, border: `1px solid ${agentColor}30`, color: agentColor }}>
            <ListIcon size={14} weight="bold" />
          </IconButton>
          <Box sx={{
            width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `linear-gradient(135deg, ${agentColor} 0%, ${isDark ? '#0EA5E9' : '#0277BD'} 100%)`,
            color: '#fff', flexShrink: 0,
          }}>
            <RobotIcon size={12} weight="bold" />
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 13, flex: 1 }}>
            {boundAgent?.name || 'AI Copilot'}
          </Typography>
          {boundModel && (
            <Chip label={boundModel.name} size="small" sx={{ height: 18, fontSize: 9 }} />
          )}
          <Tooltip title={t('copilot.new_chat')} arrow>
            <IconButton size="small" onClick={handleNewChat} sx={{ borderRadius: 2, border: `1px solid ${agentColor}30` }}>
              <PlusIcon size={14} weight="bold" color={agentColor} />
            </IconButton>
          </Tooltip>
        </Box>
        <Divider sx={{ borderColor: mutedBorder }} />
        {/* Ollama 服务状态检测提示 */}
        {isOllamaModel && ollamaStatus && !ollamaStatus.checking && !ollamaStatus.available && (
          <Box sx={{ mx: 2, mt: 1, mb: 0.5 }}>
            <Alert
              severity="warning"
              icon={<WarningCircleIcon size={18} />}
              sx={{
                fontSize: 12,
                '& .MuiAlert-message': { p: 0 },
                '& .MuiAlert-icon': { p: 0, mr: 1 },
              }}
              action={
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  sx={{ fontSize: 11, py: 0.25 }}
                  onClick={async () => {
                    if (!currentEndpoint || !boundModel) return;
                    setOllamaStatus({ checking: true, available: false, modelLoaded: false, version: '', error: null });
                    try {
                      const status = await checkOllamaStatus(currentEndpoint.baseUrl, boundModel.refKey);
                      setOllamaStatus({
                        checking: false,
                        available: status.serviceAvailable,
                        modelLoaded: status.modelLoaded,
                        version: status.version,
                        error: status.error,
                      });
                    } catch (err) {
                      setOllamaStatus({
                        checking: false,
                        available: false,
                        modelLoaded: false,
                        version: '',
                        error: err instanceof Error ? err.message : String(err),
                      });
                    }
                  }}
                >
                  重新检测
                </Button>
              }
            >
              <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
                无法连接到 Ollama 本地服务
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
                请确保 Ollama 已启动（运行 <code style={{ fontFamily: 'monospace', fontSize: 10 }}>ollama serve</code>），
                并确认模型 <strong>{boundModel?.name}</strong> 已通过 <code style={{ fontFamily: 'monospace', fontSize: 10 }}>ollama pull {boundModel?.refKey}</code> 下载。
              </Typography>
            </Alert>
          </Box>
        )}
        {/* Ollama 服务可用但模型未加载提示 */}
        {isOllamaModel && ollamaStatus && !ollamaStatus.checking && ollamaStatus.available && !ollamaStatus.modelLoaded && (
          <Box sx={{ mx: 2, mt: 1, mb: 0.5 }}>
            <Alert
              severity="info"
              icon={<ClockIcon size={18} />}
              sx={{
                fontSize: 12,
                '& .MuiAlert-message': { p: 0 },
                '& .MuiAlert-icon': { p: 0, mr: 1 },
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 500, display: 'block' }}>
                Ollama 服务正常（v{ollamaStatus.version}）
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
                模型 <strong>{boundModel?.name}</strong> 尚未加载到内存，首次对话可能需要较长加载时间。
              </Typography>
            </Alert>
          </Box>
        )}
        {/* 会话已断开警告横幅 */}
        {sessionDead && (
          <Alert
            severity="error"
            icon={<WarningCircleIcon size={20} weight="fill" />}
            sx={{ mx: 2, mt: 1.5, mb: 1, borderRadius: 2 }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {t('copilot.session_lost_title', '终端会话已丢失')}
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
              {sessionDeadReason}
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', mt: 0.5, opacity: 0.8 }}>
              {t('copilot.session_lost_hint', '请从运维中心重新打开环境修复/部署工具，系统会自动建立新的 SSH 连接。')}
            </Typography>
          </Alert>
        )}

        {/* 长耗时命令倒计时等待 */}
        {longRunningTask && (
          <Box sx={{ mx: 2, mt: 1.5, mb: 1, p: 2, borderRadius: 2,
            bgcolor: isDark ? 'rgba(99, 102, 241, 0.12)' : 'rgba(99, 102, 241, 0.08)',
            border: `1px solid ${agentColor}30`,
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
              <ClockIcon size={20} weight="fill" color={agentColor} />
              <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
                {longRunningTask.description}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace', color: agentColor }}>
                {formatTimeLeft(longRunningTask.remainingSeconds)}
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={((longRunningTask.totalSeconds - longRunningTask.remainingSeconds) / longRunningTask.totalSeconds) * 100}
              sx={{ height: 6, borderRadius: 3, bgcolor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
              <Typography variant="caption" sx={{ opacity: 0.7 }}>
                正在等待命令执行完成，请勿关闭窗口
              </Typography>
              <Button size="small" variant="text" onClick={handleSkipWait} sx={{ minWidth: 'auto', py: 0, fontSize: 12 }}>
                跳过等待
              </Button>
            </Box>
          </Box>
        )}

        <ChatMessagesArea
          messages={messages}
          streamingContent={streamingContent}
          streamingReasoning={streamingReasoning}
          streamingMsgId={streamingMsgIdRef.current}
          loading={loading}
          toolCalls={combinedToolCalls}
          agentColor={agentColor}
          userColor={userColor}
          isDark={isDark}
          conversationId={conversationId ?? undefined}
          emptyIcon={<RobotIcon size={40} weight="duotone" color={agentColor} />}
          emptyText={isEnvFixScene ? t('copilot.env_fix_empty_hint') : hasOpsContext ? t('copilot.ops_empty_hint') : hasRdContext ? (isSrvEnvScene ? t('copilot.srv_empty_hint') : t('copilot.rd_empty_hint')) : t('copilot.empty_hint')}
          thinkingText={t('copilot.thinking')}
          agentStatus={agentStatus}
        />
        <ChatInputArea
          input={input}
          setInput={setInput}
          handleSend={handleSend}
          handleKeyDown={handleKeyDown}
          loading={loading}
          conversationId={conversationId}
          agentName={boundAgent?.name}
          agentColor={agentColor}
          userColor={userColor}
          isDark={isDark}
          placeholder={isEnvFixScene ? t('copilot.env_fix_input_placeholder') : hasOpsContext ? t('copilot.ops_input_placeholder') : hasRdContext ? (isSrvEnvScene ? t('copilot.srv_input_placeholder') : t('copilot.rd_input_placeholder')) : t('copilot.input_placeholder')}
          onStop={handleStop}
          attachments={attachments}
          onAttachmentsChange={setAttachments}
          disabled={sessionDead || longRunningTask?.active}
          disabledReason={sessionDead ? sessionDeadReason : longRunningTask?.active ? '⏳ 长耗时命令执行中，请等待倒计时结束或跳过等待' : undefined}
        />
        {hasRdContext && !isSrvEnvScene && !loading && rdStatus === 'not_installed' && (
          <Box sx={{
            mx: 2, mb: 1.5, p: 1.5, borderRadius: 2,
            border: `1px solid ${agentColor}55`,
            bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
          }}>
            <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
              {t('copilot.rd_install_confirm_title', '检测到远程服务器尚未安装 VNC 远程桌面')}
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 1 }}>
              {t('copilot.rd_install_confirm_desc', '是否让 AI 助手辅助安装并配置？安装过程会修改远程服务器（非交互式安装 TigerVNC 与桌面环境）。')}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button size="small" variant="text" onClick={handleDeclineInstall} disabled={sessionDead}>
                {t('copilot.rd_install_decline', '暂不安装')}
              </Button>
              <Button size="small" variant="contained" onClick={handleAgreeInstall} sx={{ bgcolor: agentColor }} disabled={sessionDead}>
                {t('copilot.rd_install_agree', '同意，开始安装')}
              </Button>
            </Box>
          </Box>
        )}
        {hasRdContext && !isSrvEnvScene && !loading && rdStatus === 'installed' && (
          <Box sx={{
            mx: 2, mb: 1.5, p: 1.5, borderRadius: 2,
            border: `1px solid ${mutedBorder}`,
            bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
          }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('copilot.rd_already_installed', '已检测到 VNC 远程桌面，可直接连接使用。')}
            </Typography>
          </Box>
        )}
        {hasRdContext && isSrvEnvScene && !loading && (srvEnvStatus === 'missing' || srvEnvStatus === 'partial') && (
          <Box sx={{
            mx: 2, mb: 1.5, p: 1.5, borderRadius: 2,
            border: `1px solid ${agentColor}55`,
            bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
          }}>
            <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
              {srvEnvStatus === 'missing'
                ? t('copilot.srv_missing_title', '服务器尚未安装 nginx')
                : t('copilot.srv_partial_title', 'nginx 已安装但尚未就绪（未运行或端口未监听）')}
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 1 }}>
              {t('copilot.srv_install_confirm_desc', '是否让 AI 助手安装并配置部署环境（nginx + systemd 自启 + 防火墙放行 80/443）？过程会修改远程服务器。')}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button size="small" variant="text" onClick={handleDeclineEnvInstall} disabled={sessionDead}>
                {t('copilot.srv_install_decline', '暂不安装')}
              </Button>
              <Button size="small" variant="contained" onClick={handleAgreeEnvInstall} sx={{ bgcolor: agentColor }} disabled={sessionDead}>
                {t('copilot.srv_install_agree', '同意，开始安装')}
              </Button>
            </Box>
          </Box>
        )}
        {hasRdContext && isSrvEnvScene && !loading && srvEnvStatus === 'ready' && (
          <Box sx={{
            mx: 2, mb: 1.5, p: 1.5, borderRadius: 2,
            border: `1px solid ${mutedBorder}`,
            bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
          }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('copilot.srv_already_ready', '部署环境已就绪（nginx 运行中），可以开始部署站点。')}
            </Typography>
          </Box>
        )}
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
              <Button size="small" variant="text" onClick={handleDeclineEnvFix} disabled={sessionDead}>
                {t('copilot.env_fix_decline', '暂不修复')}
              </Button>
              <Button size="small" variant="contained" onClick={handleAgreeEnvFix} sx={{ bgcolor: agentColor }} disabled={sessionDead}>
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
                onClick={handleRetryEnvFix}
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
                onClick={handleRetryEnvFix}
                disabled={sessionDead}
              >
                {t('copilot.env_fix_retry', '重新修复')}
              </Button>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
