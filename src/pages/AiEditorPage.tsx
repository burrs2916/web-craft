/**
 * AiEditorPage - AI 网站编辑器独立窗口页面
 *
 * 作为 Tauri WebviewWindow 独立窗口运行，通过 URL 参数接收 sceneId / sceneName
 * 左侧画布预览（EditorCanvas previewMode）+ 右侧 AI 对话面板
 * 用户描述修改需求 -> AI 返回修改后的 SceneDSL JSON -> 自动更新画布
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import { useTheme } from '@mui/material/styles';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useSearchParams } from 'react-router-dom';
import { SparkleIcon } from '@phosphor-icons/react';
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import PublicIcon from '@mui/icons-material/Public';
import { ChatMessagesArea, ChatInputArea } from '../components/chat/ChatComponents';
import type { ToolCallDisplay, AgentStatusInfo } from '../components/chat/ChatComponents';
import { EditorCanvas } from '../editor/canvas/EditorCanvas';
import { useSceneStore } from '../store/sceneStore';
import { useEditorStore, useDirtyStore } from '../store/editorStore';
import { useAgentStore } from '../features/agent/store/agentStore';
import {
  runAgent,
  saveMessage,
  listMessages,
  createConversation,
  stopAgent,
} from '../core/services/agent.service';
import { localizeBackendError } from '../core/backendError';
import type { MessageDto, ConversationDto } from '../proto/agent';
import type { SceneDSL, SceneView } from '../types/scene';
import { createDefaultLayer } from '../types/editor';
import logger from '../utils/logger';

// --- 流式事件接口 ---
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

const STORAGE_KEY = 'webcraft_ai_editor_agent_id';

export function getAiEditorAgentId(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setAiEditorAgentId(id: string | null) {
  if (id) localStorage.setItem(STORAGE_KEY, id);
  else localStorage.removeItem(STORAGE_KEY);
}

export function AiEditorPage() {
  const [searchParams] = useSearchParams();
  const sceneId = searchParams.get('sceneId');
  const sceneName = searchParams.get('sceneName') || '未命名';

  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const agentColor = isDark ? '#38BDF8' : '#0284C7';
  const userColor = isDark ? '#A78BFA' : '#7C3AED';

  // --- AI 对话状态 ---
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [input, setInput] = useState('');
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingReasoning, setStreamingReasoning] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingToolCalls, setStreamingToolCalls] = useState<ToolCallDisplay[]>([]);
  const [agentStatus, setAgentStatus] = useState<AgentStatusInfo | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [noAgent, setNoAgent] = useState(false);
  const [applyStatus, setApplyStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [boundSiteId, setBoundSiteId] = useState<string | null>(null);

  const isDirty = useDirtyStore((s) => s.isDirty);

  const streamingMsgIdRef = useRef<string | null>(null);
  const toolCallCounterRef = useRef(0);

  // --- 场景加载到 editorStore ---
  const loadSceneToEditor = useCallback((scene: SceneDSL) => {
    const state = useEditorStore.getState();
    state.clearScene();

    const hasViews = scene.views && scene.views.length > 0;
    const hasComponents = scene.editorComponents && scene.editorComponents.length > 0;
    const hasLayers = scene.editorLayers && scene.editorLayers.length > 0;

    if (hasViews) {
      const activeVId = scene.activeViewId || scene.views![0].id;
      state.loadSceneWithViews(scene.views!, scene.globalComponents || [], activeVId);
    } else if (hasComponents || hasLayers) {
      const defaultLayer = hasLayers
        ? scene.editorLayers!
        : [createDefaultLayer('默认图层', 'layer', null, true)];
      const canvasConfig = scene.canvasConfig ? { ...scene.canvasConfig } : undefined;
      const views: SceneView[] = [{
        id: 'default',
        name: scene.name || '未命名页面',
        components: scene.editorComponents || [],
        layers: defaultLayer,
        canvasConfig,
      }];
      state.loadSceneWithViews(views, [], 'default');
      const defaultLayerId = defaultLayer.find((l) => l.isDefault)?.id || defaultLayer[0]?.id;
      if (defaultLayerId) state.setActiveLayer(defaultLayerId);
    } else {
      const defaultLayer = createDefaultLayer('默认图层', 'layer', null, true);
      const canvasConfig = scene.canvasConfig ? { ...scene.canvasConfig } : undefined;
      const views: SceneView[] = [{
        id: 'default',
        name: scene.name || '未命名页面',
        components: [],
        layers: [defaultLayer],
        canvasConfig,
      }];
      state.loadSceneWithViews(views, [], 'default');
    }
  }, []);

  // --- 解析 AI 返回的 SceneDSL 更新 ---
  const tryApplySceneUpdate = useCallback((responseText: string) => {
    const match = responseText.match(/```scene-dsl\s*\n([\s\S]*?)\n\s*```/);
    if (!match) return;

    try {
      const updatedData = JSON.parse(match[1]);
      if (!updatedData.views || !Array.isArray(updatedData.views)) {
        logger.warn('AiEditorPage', 'Scene DSL update missing views');
        return;
      }

      const state = useEditorStore.getState();
      state.loadSceneWithViews(
        updatedData.views,
        updatedData.globalComponents || [],
        updatedData.activeViewId || updatedData.views[0]?.id || 'default',
      );

      useDirtyStore.getState().markDirty();
      setApplyStatus({ type: 'success', msg: '场景已更新' });
    } catch (e) {
      logger.error('AiEditorPage', 'Failed to parse scene DSL update', { error: e });
      setApplyStatus({ type: 'error', msg: '场景更新解析失败' });
    }
  }, []);

  // --- 构建场景上下文 ---
  const buildSceneContext = useCallback((): string => {
    const { views, globalComponents, activeViewId } = useEditorStore.getState().exportSceneWithViews();
    return JSON.stringify({ views, globalComponents, activeViewId }, null, 2);
  }, []);

  // --- 初始化 ---
  useEffect(() => {
    if (!sceneId) return;

    // 1. 设置 active scene + 加载场景列表
    const sceneStore = useSceneStore.getState();
    sceneStore.setActiveScene(sceneId);

    let scene = sceneStore.scenes.find((s) => s.id === sceneId);
    if (!scene) {
      sceneStore.loadScenes().then(() => {
        const s = useSceneStore.getState().scenes.find((x) => x.id === sceneId);
        if (s) {
          setBoundSiteId((s.metadata.boundSiteId as string) || null);
          loadSceneToEditor(s);
        }
      }).catch((err) => {
        logger.error('AiEditorPage', 'Failed to load scenes', { error: err });
      });
    } else {
      setBoundSiteId((scene.metadata.boundSiteId as string) || null);
      loadSceneToEditor(scene);
    }

    // 2. 初始化 AI agent
    let aid = getAiEditorAgentId();
    if (!aid) {
      const agents = useAgentStore.getState().agents;
      if (agents.length > 0) {
        aid = agents[0].id;
        setAiEditorAgentId(aid);
      }
    }

    if (!aid) {
      setNoAgent(true);
      return;
    }
    setAgentId(aid);
    setNoAgent(false);

    // 3. 创建新会话
    createConversation(aid, `AI 编辑: ${sceneName}`, { lang: 'zh-CN' })
      .then((conv: ConversationDto) => {
        setConversationId(conv.id);
      })
      .catch((err) => {
        logger.error('AiEditorPage', 'createConversation failed', { error: err });
      });
  }, [sceneId, sceneName, loadSceneToEditor]);

  // --- 流式事件监听 ---
  useEffect(() => {
    if (!conversationId) return;

    const unlistenChunk = listen<StreamChunk>('agent-chunk', (event) => {
      if (event.payload.conversationId !== conversationId) return;
      const chunk = event.payload.chunk;
      if (chunk.startsWith('\x02') || chunk.startsWith('\x03')) return;
      if (chunk.startsWith('\x01')) {
        const reasoningText = chunk.slice(1);
        if (reasoningText) {
          setStreamingReasoning((prev) => prev + reasoningText);
        }
      } else {
        setStreamingContent((prev) => prev + chunk);
      }
    });

    const unlistenDone = listen<StreamDone>('agent-done', async (event) => {
      if (event.payload.conversationId !== conversationId) return;
      const responseText = event.payload.response || '';
      const msgId = streamingMsgIdRef.current;
      if (msgId) {
        setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, content: responseText } : m)));
      }
      try {
        const allMsgs = await listMessages(conversationId);
        setMessages(allMsgs);
      } catch (err) {
        logger.error('AiEditorPage', 'listMessages failed', { error: err });
      }

      tryApplySceneUpdate(responseText);

      setStreamingContent('');
      setStreamingReasoning('');
      setStreamingToolCalls([]);
      setLoading(false);
      setAgentStatus(null);
      streamingMsgIdRef.current = null;
    });

    const unlistenError = listen<StreamError>('agent-error', (event) => {
      if (event.payload.conversationId !== conversationId) return;
      const msgId = streamingMsgIdRef.current;
      if (msgId) {
        setMessages((prev) => prev.map((m) =>
          m.id === msgId ? { ...m, content: `❌ ${event.payload.error}`, isError: 1 } : m,
        ));
      }
      setStreamingContent('');
      setStreamingReasoning('');
      setStreamingToolCalls([]);
      setLoading(false);
      setAgentStatus(null);
      streamingMsgIdRef.current = null;
    });

    const unlistenToolCall = listen<ToolCallPayload>('agent-tool-call', (event) => {
      if (event.payload.conversationId !== conversationId) return;
      const tc = event.payload.toolCall;
      setStreamingToolCalls((prev) => {
        if (tc.status === 'done') {
          for (let i = prev.length - 1; i >= 0; i--) {
            if (prev[i].toolName === tc.tool_name && prev[i].status === 'running') {
              const next = [...prev];
              next[i] = { ...next[i], result: tc.result, success: tc.success, status: 'done' };
              return next;
            }
          }
        }
        const id = `tc-${toolCallCounterRef.current++}`;
        const newTc: ToolCallDisplay = {
          id,
          toolName: tc.tool_name,
          arguments: tc.arguments,
          result: tc.result,
          success: tc.success,
          status: tc.status === 'done' ? 'done' : 'running',
        };
        return [...prev, newTc];
      });
    });

    const unlistenStatus = listen('agent-status', (event: { payload: Record<string, unknown> }) => {
      const payload = event.payload;
      if (payload?.conversationId !== conversationId) return;
      setAgentStatus({
        status: (payload.status as string) || '',
        iteration: (payload.iteration as number) ?? 0,
        maxIterations: (payload.maxIterations as number) ?? 0,
        detail: payload.detail as string | undefined,
        streamStats: (payload.streamStats as AgentStatusInfo['streamStats']) ?? null,
        contextUsage: (payload.contextUsage as AgentStatusInfo['contextUsage']) ?? null,
        isOllama: (payload.isOllama as boolean) ?? false,
      });
    });

    return () => {
      unlistenChunk.then((fn) => fn());
      unlistenDone.then((fn) => fn());
      unlistenError.then((fn) => fn());
      unlistenToolCall.then((fn) => fn());
      unlistenStatus.then((fn) => fn());
    };
  }, [conversationId, tryApplySceneUpdate]);

  // --- 发送消息 ---
  const sendMessage = useCallback(async (messageText: string) => {
    if (!messageText.trim() || !conversationId || !agentId) return;

    const sceneContext = buildSceneContext();
    const fullMessage = `[当前网站 SceneDSL]
${sceneContext}

[编辑指令]
你是网站编辑助手。用户会描述修改需求，你需要理解当前 SceneDSL 结构，返回修改后的完整 SceneDSL JSON。
返回格式：在回复末尾用以下标记包裹修改后的 SceneDSL JSON：
\`\`\`scene-dsl
{修改后的完整 SceneDSL JSON，包含 views、globalComponents、activeViewId 三个字段}
\`\`\`
如果用户的问题不需要修改场景（如只是询问信息），正常回答即可，无需返回 JSON。

[用户请求]
${messageText.trim()}`;

    const userMsg: MessageDto = {
      id: crypto.randomUUID(),
      conversationId,
      role: 'user',
      content: messageText.trim(),
      toolCalls: '',
      isError: 0,
      createdAt: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    setStreamingToolCalls([]);
    toolCallCounterRef.current = 0;

    try {
      await saveMessage(userMsg);
    } catch (err) {
      logger.error('AiEditorPage', 'saveMessage failed', { error: err });
    }

    const assistantMsgId = crypto.randomUUID();
    streamingMsgIdRef.current = assistantMsgId;

    const assistantMsg: MessageDto = {
      id: assistantMsgId,
      conversationId,
      role: 'assistant',
      content: '',
      toolCalls: '',
      isError: 0,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, assistantMsg]);
    setStreamingContent('');
    setStreamingReasoning('');
    setStreamingToolCalls([]);

    try {
      await runAgent(agentId, fullMessage, conversationId);
    } catch (e) {
      setMessages((prev) => prev.map((m) =>
        m.id === assistantMsgId ? { ...m, content: `❌ ${localizeBackendError(e)}` } : m,
      ));
      setStreamingContent('');
      setStreamingReasoning('');
      setStreamingToolCalls([]);
      setLoading(false);
      streamingMsgIdRef.current = null;
    }
  }, [conversationId, agentId, buildSceneContext]);

  const handleSend = useCallback(async () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput('');
    await sendMessage(text);
  }, [input, sendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleStop = useCallback(() => {
    if (conversationId) {
      stopAgent(conversationId).catch((err) => {
        logger.error('AiEditorPage', 'stopAgent failed', { error: err });
      });
    }
  }, [conversationId]);

  const handleSave = useCallback(async () => {
    if (!sceneId) return;
    const { views, globalComponents, activeViewId } = useEditorStore.getState().exportSceneWithViews();
    const activeView = views.find((v) => v.id === activeViewId);
    const canvasConfig = activeView?.canvasConfig;
    try {
      await useSceneStore.getState().updateScene(sceneId, {
        canvasConfig,
        views,
        globalComponents,
        activeViewId,
      });
      useDirtyStore.getState().markClean();
      setApplyStatus({ type: 'success', msg: '保存成功' });
    } catch (err) {
      logger.error('AiEditorPage', 'save failed', { error: err });
      setApplyStatus({ type: 'error', msg: '保存失败' });
    }
  }, [sceneId]);

  const handleClose = useCallback(() => {
    if (conversationId && loading) {
      stopAgent(conversationId).catch(() => {});
    }
    getCurrentWindow().close();
  }, [conversationId, loading]);

  const handleRefresh = useCallback(() => {
    if (!sceneId) return;
    const sceneStore = useSceneStore.getState();
    const scene = sceneStore.scenes.find((s) => s.id === sceneId);
    if (scene) {
      loadSceneToEditor(scene);
    } else {
      sceneStore.loadScenes().then(() => {
        const s = useSceneStore.getState().scenes.find((x) => x.id === sceneId);
        if (s) loadSceneToEditor(s);
      }).catch(() => {});
    }
    setRefreshKey((k) => k + 1);
  }, [sceneId, loadSceneToEditor]);

  const streamingMsgId = streamingMsgIdRef.current;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* 顶部工具栏 */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1,
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <SparkleIcon size={20} weight="fill" color={agentColor} />
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          AI 编辑器 — {sceneName}
        </Typography>
        {boundSiteId ? (
          <Chip
            size="small"
            label={`已绑定站点`}
            color="success"
            variant="outlined"
            sx={{ ml: 0.5, height: 22, fontSize: 11 }}
          />
        ) : (
          <Chip
            size="small"
            label="未绑定站点"
            color="warning"
            sx={{ ml: 0.5, height: 22, fontSize: 11 }}
          />
        )}
        {isDirty && (
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: 'warning.main',
              ml: 0.5,
            }}
          />
        )}
        <Box sx={{ flex: 1 }} />
        <Tooltip title="保存场景">
          <span>
            <Button
              size="small"
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSave}
              disabled={!isDirty}
            >
              保存
            </Button>
          </span>
        </Tooltip>
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </Box>

      {/* 主体区域：左画布 + 右 AI 对话 */}
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* 左侧浏览器预览 */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'relative',
            bgcolor: 'background.default',
          }}
        >
          {/* 浏览器地址栏 */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              px: 1,
              py: 0.75,
              borderBottom: 1,
              borderColor: 'divider',
              flexShrink: 0,
              bgcolor: 'background.paper',
            }}
          >
            <Tooltip title="刷新预览">
              <IconButton size="small" onClick={handleRefresh} disabled={loading}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1.5,
                py: 0.5,
                borderRadius: 5,
                bgcolor: 'action.hover',
                minHeight: 32,
              }}
            >
              <PublicIcon fontSize="small" sx={{ color: 'text.secondary' }} />
              <Typography
                variant="body2"
                sx={{
                  color: 'text.secondary',
                  fontSize: '0.8125rem',
                  userSelect: 'none',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {`https://webcraft.app/preview/${encodeURIComponent(sceneName)}`}
              </Typography>
            </Box>
          </Box>

          {/* 浏览器内容区域 */}
          <Box
            sx={{
              flex: 1,
              overflow: 'hidden',
              position: 'relative',
              bgcolor: 'background.paper',
            }}
          >
            <EditorCanvas key={refreshKey} previewMode />
          </Box>
        </Box>

        {/* 右侧 AI 对话 */}
        <Box
          sx={{
            width: 420,
            display: 'flex',
            flexDirection: 'column',
            borderLeft: 1,
            borderColor: 'divider',
            flexShrink: 0,
            minHeight: 0,
            bgcolor: 'background.default',
          }}
        >
          {noAgent ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                尚未配置 AI Agent。请先在 AI 设置中创建一个 Agent。
              </Typography>
            </Box>
          ) : (
            <>
              <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <ChatMessagesArea
                  messages={messages}
                  streamingContent={streamingContent}
                  streamingReasoning={streamingReasoning}
                  streamingMsgId={streamingMsgId}
                  loading={loading}
                  toolCalls={streamingToolCalls}
                  agentColor={agentColor}
                  userColor={userColor}
                  isDark={isDark}
                  conversationId={conversationId ?? undefined}
                  emptyText="描述你想要的修改，AI 会自动调整场景…"
                  thinkingText="AI 正在分析场景结构…"
                  agentStatus={agentStatus}
                />
              </Box>
              <Box sx={{ flexShrink: 0 }}>
                <ChatInputArea
                  input={input}
                  setInput={setInput}
                  handleSend={handleSend}
                  handleKeyDown={handleKeyDown}
                  loading={loading}
                  conversationId={conversationId}
                  agentName="AI 编辑助手"
                  agentColor={agentColor}
                  userColor={userColor}
                  isDark={isDark}
                  placeholder="描述你想要的修改…"
                  onStop={handleStop}
                  hasFileTool={false}
                />
              </Box>
            </>
          )}
        </Box>
      </Box>

      {/* 应用状态提示 */}
      <Snackbar
        open={!!applyStatus}
        autoHideDuration={3000}
        onClose={() => setApplyStatus(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={applyStatus?.type === 'success' ? 'success' : 'error'}
          onClose={() => setApplyStatus(null)}
        >
          {applyStatus?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
