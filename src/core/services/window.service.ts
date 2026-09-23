import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

const openWindows = new Map<string, WebviewWindow>();

export interface OpenSiteOpsOptions {
  siteId: string;
  siteName?: string;
  connectionId: string;
  /** 初始打开的 Tab，默认 env（环境检测） */
  tab?: 'env' | 'deploy' | 'scripts' | 'tasks' | 'history';
}

export async function openSiteOpsWindow(opts: OpenSiteOpsOptions): Promise<WebviewWindow | null> {
  const key = `site-ops-${opts.siteId}`;

  const existing = await reuseOrRecreate(key);
  if (existing) return existing;

  const params = new URLSearchParams();
  params.set('siteId', opts.siteId);
  params.set('connectionId', opts.connectionId);
  if (opts.siteName) params.set('siteName', opts.siteName);
  if (opts.tab) params.set('tab', opts.tab);

  const title = opts.siteName ? `${opts.siteName} · 运维中心` : '运维中心';

  const webview = new WebviewWindow(key, {
    url: `/#/site-ops?${params.toString()}`,
    title,
    width: 1100,
    height: 750,
    minWidth: 720,
    minHeight: 500,
    center: true,
    resizable: true,
    decorations: true,
    focus: true,
  });

  openWindows.set(key, webview);

  webview.once('tauri://destroyed', () => {
    openWindows.delete(key);
  });

  webview.once('tauri://error', (e) => {
    console.error('[window] failed to create site ops window:', e);
    openWindows.delete(key);
  });

  return webview;
}

interface SshWindowParams {
  host: string;
  port?: number;
  username: string;
  authMethod: string;
  privateKeyPath?: string;
  password?: string;
  /** 来源连接的 id，用于把安装档位等偏好持久化到该连接。 */
  connectionId?: string;
}

/**
 * Resolve an existing window by label, but only if it is actually usable.
 *
 * `WebviewWindow.getByLabel` can keep returning a window that failed to load or
 * was destroyed but not yet released by the runtime. If we then keep
 * `setFocus()`-ing that dead handle, clicking the toolbar button looks like it
 * "does nothing" — no new window, no error. So: if the window can't be focused
 * or isn't visible, destroy it and let the caller create a fresh one.
 */
/**
 * 给预览 URL 追加时间戳查询参数，绕过 WebView/HTTP 缓存，
 * 确保复用时加载的是最新生成的 preview.html 而非旧缓存。
 */
function refreshUrl(url: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${Date.now()}`;
}

async function reuseOrRecreate(key: string): Promise<WebviewWindow | null> {
  try {
    const existing = await WebviewWindow.getByLabel(key);
    if (!existing) return null;
    let alive = true;
    try {
      await existing.setFocus();
      const visible = await existing.isVisible().catch(() => false);
      alive = !!visible;
    } catch {
      alive = false;
    }
    if (alive) return existing;
    try {
      await existing.destroy();
    } catch {
      /* ignore */
    }
    return null;
  } catch {
    return null;
  }
}

function buildSshUrl(path: string, sshParams?: SshWindowParams): string {
  if (!sshParams) return `/#/${path}`;
  const params = new URLSearchParams();
  params.set('host', sshParams.host);
  if (sshParams.port) params.set('port', String(sshParams.port));
  params.set('username', sshParams.username);
  params.set('authMethod', sshParams.authMethod);
  if (sshParams.privateKeyPath) params.set('privateKeyPath', sshParams.privateKeyPath);
  if (sshParams.password) params.set('password', sshParams.password);
  if (sshParams.connectionId) params.set('connectionId', sshParams.connectionId);
  return `/#/${path}?${params.toString()}`;
}

export async function openRemoteDesktopWindow(
  sshParams?: SshWindowParams,
  onError?: (msg: string) => void,
): Promise<WebviewWindow | null> {
  const key = 'remote-desktop';

  const existing = await reuseOrRecreate(key);
  if (existing) return existing;

  const webview = new WebviewWindow(key, {
    url: buildSshUrl('remote-desktop', sshParams),
    title: 'Remote Desktop',
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    center: true,
    resizable: true,
    decorations: true,
    focus: true,
  });

  openWindows.set(key, webview);

  webview.once('tauri://destroyed', () => {
    openWindows.delete(key);
  });

  webview.once('tauri://error', (e: any) => {
    console.error('[window] failed to create remote desktop window:', e);
    openWindows.delete(key);
    const raw = e?.payload?.message ?? e?.payload ?? e;
    onError?.(typeof raw === 'string' ? raw : JSON.stringify(raw));
  });

  return webview;
}

export async function openSftpWindow(
  sshParams?: SshWindowParams,
  onError?: (msg: string) => void,
): Promise<WebviewWindow | null> {
  const key = 'sftp';

  const existing = await reuseOrRecreate(key);
  if (existing) return existing;

  const webview = new WebviewWindow(key, {
    url: buildSshUrl('sftp', sshParams),
    title: 'SFTP File Transfer',
    width: 900,
    height: 650,
    minWidth: 600,
    minHeight: 400,
    center: true,
    resizable: true,
    decorations: true,
    focus: true,
  });

  openWindows.set(key, webview);

  webview.once('tauri://destroyed', () => {
    openWindows.delete(key);
  });

  webview.once('tauri://error', (e: any) => {
    console.error('[window] failed to create sftp window:', e);
    openWindows.delete(key);
    const raw = e?.payload?.message ?? e?.payload ?? e;
    onError?.(typeof raw === 'string' ? raw : JSON.stringify(raw));
  });

  return webview;
}

export interface OpenAiCopilotOptions {
  /// 绑定到指定 Agent（如远程桌面安装助手），不传则沿用用户已绑定的 copilot Agent。
  agentId?: string;
  /// 场景：'rd'（远程桌面安装）| 'srvEnv'（站点服务器环境安装）| 'ops'（运维助手）| 'envFix'（环境修复）。
  /// 决定窗口 label 与 AiCopilotPage 组装的会话 metadata 类型。
  scene?: 'rd' | 'srvEnv' | 'ops' | 'envFix';
  /// 设置指南携带的上下文，写入窗口 URL，供 AiCopilotPage 解析。
  sessionId?: string;
  host?: string;
  username?: string;
  /// 远程桌面安装模式：headless（无桌面版）/ basic（基础桌面版）/ full（全量安装）。
  installMode?: string;
  /// srvEnv / ops / envFix 场景：站点名与部署远程路径。
  siteName?: string;
  remotePath?: string;
  /// envFix 场景：站点域名。
  domain?: string;
  /// envFix 场景：环境检测报告 JSON 字符串。
  checkReport?: string;
}

export async function openAiCopilotWindow(opts?: OpenAiCopilotOptions): Promise<WebviewWindow | null> {
  // 带上下文的助手（远程桌面 / 服务器环境安装 / 运维）必须是独立窗口，
  // 否则会与普通 AI 对话共用 `ai-copilot` label，导致普通对话复用其窗口、
  // 继承安装上下文并误触发安装指令。
  const hasContext = !!(opts?.agentId || opts?.sessionId || opts?.host || opts?.username);
  const key = opts?.scene === 'srvEnv'
    ? 'ai-copilot-srv-env'
    : opts?.scene === 'ops'
      ? 'ai-copilot-ops'
      : opts?.scene === 'envFix'
        ? 'ai-copilot-env-fix'
        : hasContext ? 'ai-copilot-rd-setup' : 'ai-copilot';

  const existing = await WebviewWindow.getByLabel(key);
  if (existing) {
    // 窗口已存在时通过事件推送最新上下文，前端收到后刷新 metadata。
    // 避免 URL 中 session_id 过期导致 Agent 拿不到有效终端会话。
    if (opts) {
      try {
        await existing.emit('ai-copilot:context-update', opts);
      } catch (e) {
        console.warn('[window] failed to emit context-update to copilot window:', e);
      }
    }
    await existing.setFocus();
    return existing;
  }

  // 把上下文编码进 hash 路由的 query，供 AiCopilotPage 通过 useSearchParams 读取。
  const params = new URLSearchParams();
  if (opts?.scene) params.set('scene', opts.scene);
  if (opts?.agentId) params.set('agentId', opts.agentId);
  if (opts?.sessionId) params.set('sessionId', opts.sessionId);
  if (opts?.host) params.set('host', opts.host);
  if (opts?.username) params.set('username', opts.username);
  if (opts?.installMode) params.set('installMode', opts.installMode);
  if (opts?.siteName) params.set('siteName', opts.siteName);
  if (opts?.remotePath) params.set('remotePath', opts.remotePath);
  if (opts?.domain) params.set('domain', opts.domain);
  if (opts?.checkReport) params.set('checkReport', opts.checkReport);
  const query = params.toString();
  const url = query ? `/#/ai-copilot?${query}` : '/#/ai-copilot';

  const webview = new WebviewWindow(key, {
    url,
    title: 'AI Copilot',
    width: 880,
    height: 760,
    minWidth: 480,
    minHeight: 560,
    center: true,
    resizable: true,
    decorations: true,
    focus: true,
  });

  openWindows.set(key, webview);

  webview.once('tauri://destroyed', () => {
    openWindows.delete(key);
  });

  webview.once('tauri://error', (e) => {
    console.error('[window] failed to create ai copilot window:', e);
    openWindows.delete(key);
  });

  return webview;
}

export interface OpenAiEditorOptions {
  sceneId: string;
  sceneName?: string;
}

export async function openAiEditorWindow(opts: OpenAiEditorOptions): Promise<WebviewWindow | null> {
  const key = `ai-editor-${opts.sceneId}`;

  const existing = await reuseOrRecreate(key);
  if (existing) return existing;

  const params = new URLSearchParams();
  params.set('sceneId', opts.sceneId);
  if (opts.sceneName) params.set('sceneName', opts.sceneName);

  const title = opts.sceneName ? `AI 编辑器 — ${opts.sceneName}` : 'AI 编辑器';

  const webview = new WebviewWindow(key, {
    url: `/#/ai-editor?${params.toString()}`,
    title,
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    center: true,
    resizable: true,
    decorations: true,
    focus: true,
  });

  openWindows.set(key, webview);

  webview.once('tauri://destroyed', () => {
    openWindows.delete(key);
  });

  webview.once('tauri://error', (e) => {
    console.error('[window] failed to create ai editor window:', e);
    openWindows.delete(key);
  });

  return webview;
}

export interface OpenPreviewWindowOptions {
  /** 预览 URL（本地 HTTP 服务器地址） */
  url: string;
  /** 网站名称，用于窗口标题 */
  sceneName?: string;
  /** 画布宽度，用于窗口默认宽度 */
  width?: number;
  /** 画布高度，用于窗口默认高度 */
  height?: number;
}

/**
 * 打开网站预览窗口 — 弹出一个完整的独立应用窗口显示渲染后的网站。
 *
 * 与其他窗口不同：预览窗口加载的是本地 HTTP 服务器 URL（http://127.0.0.1:port），
 * 而非应用内路由。窗口尺寸基于画布大小，可自由缩放。
 */
export async function openPreviewWindow(opts: OpenPreviewWindowOptions): Promise<WebviewWindow | null> {
  // 用 sceneName 做安全的 label，去掉 URL 中的特殊字符避免 Tauri label 解析问题
  const safeName = (opts.sceneName ?? 'window').replace(/[^a-zA-Z0-9_-]/g, '-');
  const key = `preview-${safeName}`;

  // 加版本号查询参数，强制 WebView/HTTP 缓存失效，确保每次都加载最新生成的 preview.html
  const url = refreshUrl(opts.url);

  const existing = await reuseOrRecreate(key);
  if (existing) {
    // 窗口复用时：仅置前而不重新加载会导致停留在旧的 preview.html 上，
    // 即使 codegen 已修复仍不断看到旧产物错误。这里强制导航到最新 URL。
    await existing.setFocus();
    try {
      await (existing as WebviewWindow & { navigate?: (u: string) => Promise<void> }).navigate?.(url);
    } catch {
      // 忽略导航失败
    }
    return existing;
  }

  const w = Math.min(opts.width ?? 1920, 1920);
  const h = Math.min(opts.height ?? 1080, 1080);
  const title = opts.sceneName ? `预览 — ${opts.sceneName}` : '网站预览';

  const webview = new WebviewWindow(key, {
    url,
    title,
    width: w,
    height: h,
    minWidth: 320,
    minHeight: 240,
    center: true,
    resizable: true,
    decorations: true,
    focus: true,
  });

  openWindows.set(key, webview);

  webview.once('tauri://destroyed', () => {
    openWindows.delete(key);
  });

  webview.once('tauri://error', (e) => {
    console.error('[window] failed to create preview window:', e);
    openWindows.delete(key);
  });

  return webview;
}
