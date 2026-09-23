import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { MediaAsset } from '../../proto/cms';

/**
 * 媒体资源服务，对应 Rust 端 `interface::commands::media` 模块。
 *
 * 设计约定：
 * - 所有变更操作（上传/删除）后，前端统一监听 `media-changed` 事件刷新列表
 * - 文件上传走本地路径拷贝（由前端先通过文件选择对话框拿到路径）
 */

export interface MediaListResult {
  items: MediaAsset[];
  total: number;
}

/** 上传单个文件到站点媒体库（从本地路径拷贝）。
 *  若同站点同哈希已存在，直接返回已有记录（秒传）。
 */
export async function mediaUpload(params: {
  siteId: string;
  sourcePath: string;
  filename: string;
}): Promise<MediaAsset> {
  return invoke('media_upload', {
    siteId: params.siteId,
    sourcePath: params.sourcePath,
    filename: params.filename,
  });
}

/** 列出站点媒体资源（按创建时间倒序，分页）。 */
export async function mediaList(params: {
  siteId: string;
  limit?: number;
  offset?: number;
}): Promise<MediaListResult> {
  return invoke('media_list', {
    siteId: params.siteId,
    limit: params.limit,
    offset: params.offset,
  });
}

/** 根据 ID 获取单个媒体资产。 */
export async function mediaGet(params: {
  assetId: string;
}): Promise<MediaAsset | null> {
  return invoke('media_get', {
    assetId: params.assetId,
  });
}

/** 删除媒体资源（同时删除数据库记录和物理文件）。 */
export async function mediaDelete(params: {
  siteId: string;
  assetId: string;
}): Promise<void> {
  return invoke('media_delete', {
    siteId: params.siteId,
    assetId: params.assetId,
  });
}

/** 监听媒体资源变更事件（上传/删除后触发）。 */
export async function onMediaChanged(handler: () => void): Promise<() => void> {
  const unlisten = await listen('media-changed', () => handler());
  return () => unlisten();
}
