/// CMS 领域类型契约，与 docs/cms-database-design.md 对齐。
/// M0 阶段仅定义类型；M1 起由 core/services/cms.service.ts 封装 invoke 使用。
/// JSON 列（*_json）沿用现有 proto 惯例以 string 传输，由服务层解析。

export type SiteStatus = 'active' | 'archived';
export type ContentType = 'post' | 'page';
export type ContentStatus = 'draft' | 'scheduled' | 'published';
export type DeploymentStatus = 'running' | 'success' | 'failed' | 'cancelled';
export type DeploymentEnv = 'production' | 'staging';

export interface DeployEnvironment {
  id: string;
  remote_path: string;
}

export interface SiteDeployConfig {
  mode: 'sftp';
  remote_path: string;
  delete_orphaned: boolean;
  backup_dir?: string;
  post_deploy_commands: string[];
  /// M2 多环境预留；出现时优先于 remote_path
  environments: DeployEnvironment[];
}

export interface SiteBuildConfig {
  dist_dir: string;
  posts_per_page: number;
  exclude: string[];
  generate: {
    rss: boolean;
    sitemap: boolean;
    robots: boolean;
    archive: boolean;
    tags: boolean;
  };
}

export interface Site {
  id: string;
  name: string;
  domain: string;
  local_workdir: string;
  connection_id: string | null;
  deploy_config_json: string;
  build_config_json: string;
  theme_id: string;
  theme_config_json: string;
  status: SiteStatus;
  last_deployed_at: number | null;
  created_at: number;
  updated_at: number;
}

/// site_list 返回的聚合视图（FR-S2）
export interface SiteSummary extends Site {
  draft_count: number;
  published_count: number;
  /// null = 未绑定服务器（仅本地站点）
  connection_online: boolean | null;
}

/// content_list 过滤参数；全部可选，null 表示不过滤。与 Rust ContentListFilter 对齐。
export interface ContentListFilter {
  type?: ContentType;
  status?: ContentStatus;
  keyword?: string;
  /// true = 回收站视图（deleted_at 非空）；默认 false = 正常内容
  include_deleted?: boolean;
}

export interface Content {
  id: string;
  site_id: string;
  type: ContentType;
  title: string;
  slug: string;
  category: string;
  summary: string;
  cover_media_id: string | null;
  /// TipTap ProseMirror JSON（编辑态真源）
  content_json: string;
  /// Markdown（构建输入，保存时生成）
  content_md: string;
  /// sha256(title + content_md + 元数据)，增量构建指纹
  content_hash: string;
  seo_title: string;
  seo_description: string;
  og_image_media_id: string | null;
  status: ContentStatus;
  scheduled_at: number | null;
  published_at: number | null;
  pinned: boolean;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface ContentVersion {
  id: string;
  content_id: string;
  version_no: number;
  snapshot_json: string;
  trigger: 'manual' | 'publish' | 'rollback';
  comment: string;
  created_at: number;
}

export interface MediaAsset {
  id: string;
  site_id: string;
  filename: string;
  /// 站点工作区内相对路径 media/YYYY/MM/<hash>.<ext>
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  file_hash: string;
  thumb_path: string | null;
  created_at: number;
}

export type ManifestAction = 'upload' | 'keep' | 'delete';

export interface DeploymentManifestEntry {
  path: string;
  hash?: string;
  size?: number;
  action: ManifestAction;
}

export interface Deployment {
  id: string;
  site_id: string;
  trigger_type: 'manual' | 'scheduled' | 'rollback';
  target_env: DeploymentEnv;
  status: DeploymentStatus;
  started_at: number;
  finished_at: number | null;
  duration_ms: number | null;
  uploaded_count: number;
  deleted_count: number;
  total_bytes: number;
  error_summary: string;
  manifest_json: string;
}
