import { invoke } from '@tauri-apps/api/core';
import type { Site, SiteSummary, Content, ContentListFilter } from '../../proto';

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
