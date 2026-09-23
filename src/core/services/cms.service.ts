import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  Site,
  SiteSummary,
  SiteDomain,
  DomainDnsStatus,
  Content,
  ContentListFilter,
  ContentTag,
  ContentTagSummary,
  ContentVersion,
  Deployment,
  ServiceStatus,
  DeployOutcome,
  DeployProgress,
  DeployProgressEvent,
  PreviewInfo,
  BuildReport,
  ThemeMeta,
  DeployReadiness,
  DeploymentStats,
} from '../../proto';

/// CMS 站点/内容命令封装，与 interface/commands/cms.rs 一一对应。
/// 字段命名遵循 proto/cms.ts 契约（snake_case），Rust 侧同名字段直传。

export async function createSite(input: {
  name: string;
  domain: string;
  localWorkdir: string;
  connectionId: string | null;
  remotePath?: string;
  /** 路线B固定 none；保留参数兼容旧调用方 */
  dbType?: 'none' | 'postgresql';
}): Promise<Site> {
  return invoke('site_create', { input });
}

/// 在远程服务器上初始化站点目录结构（创建站点根目录、dist/、systemd 目录等）。
export async function initRemoteSite(siteId: string): Promise<void> {
  return invoke('site_init_remote', { siteId });
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

export async function deleteSite(id: string): Promise<void> {
  return invoke('site_delete', { id });
}

// ---------- 站点域名管理 ----------

export async function listSiteDomains(siteId: string): Promise<SiteDomain[]> {
  return invoke('site_domain_list', { siteId });
}

export async function addSiteDomain(siteId: string, domain: string, isPrimary: boolean): Promise<SiteDomain> {
  return invoke('site_domain_add', { siteId, domain, isPrimary });
}

export async function removeSiteDomain(domainId: string): Promise<void> {
  return invoke('site_domain_remove', { domainId });
}

export async function checkDomainDns(siteId: string): Promise<DomainDnsStatus[]> {
  return invoke('site_domain_dns_check', { siteId });
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

/// 站点标签列表（FR-C8）。
export async function listTags(siteId: string): Promise<ContentTag[]> {
  return invoke('tag_list', { siteId });
}

/// 标签 + 内容计数（标签管理视图）。
export async function listTagSummaries(siteId: string): Promise<ContentTagSummary[]> {
  return invoke('tag_list_summaries', { siteId });
}

export async function createTag(siteId: string, name: string): Promise<ContentTag> {
  return invoke('tag_create', { siteId, name });
}

export async function renameTag(tagId: string, name: string): Promise<ContentTag> {
  return invoke('tag_rename', { tagId, name });
}

export async function deleteTag(tagId: string): Promise<void> {
  return invoke('tag_delete', { tagId });
}

/// 内容已挂标签（名称数组，编辑器回显）。
export async function listContentTags(contentId: string): Promise<string[]> {
  return invoke('content_list_tags', { contentId });
}

/// 全量替换内容标签。
export async function setContentTags(contentId: string, tagIds: string[]): Promise<void> {
  return invoke('content_set_tags', { contentId, tagIds });
}

/// 手动"存版本"（FR-C7）。
export async function saveContentVersion(contentId: string, comment: string): Promise<ContentVersion> {
  return invoke('content_save_version', { contentId, comment });
}

/// 内容版本列表（最新在前）。
export async function listContentVersions(contentId: string): Promise<ContentVersion[]> {
  return invoke('content_list_versions', { contentId });
}

/// 回滚到指定版本（回滚前自动存当前态）。
export async function rollbackContent(contentId: string, versionNo: number): Promise<Content> {
  return invoke('content_rollback', { contentId, versionNo });
}

/// 部署站点（路线B：静态托管，Nginx + 静态文件）。
/// 进度经 `deploy-progress` 事件流推送（onDeployProgress 订阅）。
export async function deploySite(siteId: string): Promise<DeployOutcome> {
  return invoke('site_deploy', { siteId });
}

/// 部署前就绪检查：把「为什么不能部署」结构化返回，前端据此在「部署」前显式呈现阻断点。
export async function deployCheck(siteId: string): Promise<DeployReadiness> {
  return invoke('site_deploy_check', { siteId });
}

export async function listDeployments(siteId: string): Promise<Deployment[]> {
  return invoke('deployment_list', { siteId });
}

/// 获取单个部署记录详情
export async function getDeployment(id: string): Promise<Deployment | null> {
  return invoke('deployment_get', { id });
}

/// 按服务器连接查询部署记录（运维中心用）
export interface DeploymentListResult {
  items: Deployment[];
  total: number;
}
export async function listDeploymentsByConnection(
  connectionId: string,
  page = 1,
  pageSize = 20,
): Promise<DeploymentListResult> {
  return invoke('deployment_list_by_connection', { connectionId, page, pageSize });
}

/// 聚合某服务器连接下全部部署记录的「工作连续性」指标（覆盖所有历史，不限于当前分页）
export async function deploymentStats(connectionId: string): Promise<DeploymentStats> {
  return invoke('deployment_stats', { connectionId });
}

/// 查询站点服务运行状态
export async function getServiceStatus(siteId: string): Promise<ServiceStatus> {
  return invoke('service_get_status', { siteId });
}

/// 重启站点服务
export async function restartService(siteId: string): Promise<void> {
  return invoke('service_restart', { siteId });
}

/// 停止站点服务
export async function stopService(siteId: string): Promise<void> {
  return invoke('service_stop', { siteId });
}

/// 启动站点服务
export async function startService(siteId: string): Promise<void> {
  return invoke('service_start', { siteId });
}

/// 回滚到指定部署版本
export async function rollbackDeployment(siteId: string, deploymentId: string): Promise<void> {
  return invoke('deployment_rollback', { siteId, deploymentId });
}

/// 删除单条部署记录
export async function deleteDeployment(id: string): Promise<void> {
  return invoke('deployment_delete', { id });
}

/// 批量删除部署记录
export async function batchDeleteDeployments(ids: string[]): Promise<number> {
  return invoke('deployment_batch_delete', { ids });
}

/// 清理站点部署历史：保留最近 keepCount 条，删除其余
export async function cleanupDeployments(siteId: string, keepCount: number): Promise<number> {
  return invoke('deployment_cleanup_site', { siteId, keepCount });
}

/// 按状态删除部署记录（如清理所有失败的）
export async function deleteDeploymentsByStatus(siteId: string, status: string): Promise<number> {
  return invoke('deployment_delete_by_status', { siteId, status });
}

/// 探测站点 HTTP 可达性（路线B：Nginx 80 端口）。code=200/301/302 即在线。
export async function checkSiteHealthz(siteId: string): Promise<{ code: number | null; url?: string; error?: string }> {
  return invoke('site_healthz', { siteId });
}

/// 启动（或重启）站点的本地预览；返回预览地址与端口。
export async function previewStart(siteId: string): Promise<PreviewInfo> {
  return invoke('site_preview_start', { siteId });
}

/// SSG 增量构建（无缓存自动全量）。返回构建报告，完成后广播 ssg-build-finished。
export async function buildSite(siteId: string): Promise<BuildReport> {
  return invoke('ssg_build', { siteId });
}

/// SSG 强制全量重建（清空 dist）。
export async function buildSiteFull(siteId: string): Promise<BuildReport> {
  return invoke('ssg_build_full', { siteId });
}

/// 列出全部内置主题元数据（主题选择器与动态设置表单）。
export async function listThemes(): Promise<ThemeMeta[]> {
  return invoke('theme_list');
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
