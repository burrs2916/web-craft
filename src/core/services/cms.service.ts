import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  Site,
  SiteSummary,
  Content,
  ContentListFilter,
  Deployment,
  DeployOutcome,
  DeployProgress,
  DeployProgressEvent,
  PreviewInfo,
} from '../../proto';

/// CMS 站点/内容命令封装，与 interface/commands/cms.rs 一一对应。
/// 字段命名遵循 proto/cms.ts 契约（snake_case），Rust 侧同名字段直传。

export async function createSite(input: {
  name: string;
  domain: string;
  localWorkdir: string;
  connectionId: string | null;
  remotePath?: string;
}): Promise<Site> {
  return invoke('site_create', { input });
}

export async function listSites(): Promise<SiteSummary[]> {
  return invoke('site_list');
}

export async function getSite(id: string): Promise<Site | null> {
  return invoke('site_get', { id });
}

export async function updateSite(site: Site): Promise<Site> {
  return invoke('site_update', { site });
}

export async function archiveSite(id: string): Promise<void> {
  return invoke('site_archive', { id });
}

export async function createContent(input: {
  siteId: string;
  type: 'post' | 'page';
  title: string;
}): Promise<Content> {
  return invoke('content_create', { input });
}

export async function listContents(siteId: string, filter?: ContentListFilter): Promise<Content[]> {
  return invoke('content_list', { siteId, filter: filter ?? null });
}

export async function getContent(id: string): Promise<Content | null> {
  return invoke('content_get', { id });
}

export async function saveContent(content: Content): Promise<Content> {
  return invoke('content_save', { content });
}

export async function publishContent(id: string): Promise<Content> {
  return invoke('content_publish', { id });
}

export async function unpublishContent(id: string): Promise<Content> {
  return invoke('content_unpublish', { id });
}

export async function deleteContent(id: string): Promise<void> {
  return invoke('content_delete', { id });
}

export async function restoreContent(id: string): Promise<Content> {
  return invoke('content_restore', { id });
}

export async function purgeContent(id: string): Promise<void> {
  return invoke('content_purge', { id });
}

export async function setContentPinned(id: string, pinned: boolean): Promise<void> {
  return invoke('content_set_pinned', { id, pinned });
}

/// M-x3 一键部署：SSG 产物 + webcraft-server 二进制 → systemd --user 拉起 → healthz 验证。
/// 进度经 `deploy-progress` 事件流推送（onDeployProgress 订阅）。
export async function deploySite(siteId: string): Promise<DeployOutcome> {
  return invoke('site_deploy', { siteId });
}

export async function listDeployments(siteId: string): Promise<Deployment[]> {
  return invoke('deployment_list', { siteId });
}

/// 探测站点部署服务的 /healthz（健康徽标）。code=200 即在线。
export async function checkSiteHealthz(siteId: string): Promise<{ code: number | null; url?: string; error?: string }> {
  return invoke('site_healthz', { siteId });
}

/// 启动（或重启）站点的本地预览；返回预览地址与端口。
export async function previewStart(siteId: string): Promise<PreviewInfo> {
  return invoke('site_preview_start', { siteId });
}

export async function previewStop(siteId: string): Promise<void> {
  return invoke('site_preview_stop', { siteId });
}

export async function previewList(): Promise<PreviewInfo[]> {
  return invoke('site_preview_list');
}

export function onDeployProgress(
  siteId: string,
  cb: (p: DeployProgress) => void,
): Promise<() => void> {
  return listen<DeployProgressEvent>('deploy-progress', (e) => {
    if (e.payload.siteId === siteId) cb(e.payload);
  });
}
