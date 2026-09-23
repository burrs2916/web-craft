/// CMS 领域类型契约，与 docs/cms-database-design.md 对齐。
/// M0 阶段仅定义类型；M1 起由 core/services/cms.service.ts 封装 invoke 使用。
/// JSON 列（*_json）沿用现有 proto 惯例以 string 传输，由服务层解析。

export type SiteStatus = 'active' | 'archived';
export type ContentType = 'post' | 'page';
export type ContentStatus = 'draft' | 'scheduled' | 'published';
export type DeploymentStatus = 'running' | 'success' | 'failed' | 'cancelled';
export type DeploymentEnv = 'production' | 'staging';
/** 站点数据库类型（路线B：静态托管，固定为 none）。
 *  'postgresql' 仅为历史存量站点保留；新建站点一律 'none'。 */
export type SiteDbType = 'none' | 'postgresql';

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
  db_type: SiteDbType;
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

/// 站点域名记录（site_domains 表）。一个站点可绑定多个域名。
export interface SiteDomain {
  id: string;
  site_id: string;
  domain: string;
  is_primary: boolean;
  created_at: number;
}

/// 域名 DNS 检测结果（通过 SSH 在服务器上执行 DNS 解析比对）。
export interface DomainDnsStatus {
  domain: string;
  /// DNS A 记录解析到的 IP
  resolved_ip: string | null;
  /// 服务器公网 IP
  server_ip: string | null;
  /// matched | mismatch | unresolved | not_checked
  status: 'matched' | 'mismatch' | 'unresolved' | 'not_checked';
  /// 人类可读说明
  detail: string;
}

/// content_list 过滤参数；全部可选，null 表示不过滤。与 Rust ContentListFilter 对齐。
export interface ContentListFilter {
  type?: ContentType;
  status?: ContentStatus;
  keyword?: string;
  /// 按标签名精确过滤（仅正常视图生效）
  tag?: string;
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
  /// 内容已挂标签名（列表批量加载；保存/读取时为空数组）
  tags: string[];
}

/// 站点内容标签（content_tags 表，FR-C8）。
export interface ContentTag {
  id: string;
  site_id: string;
  name: string;
}

/// 标签 + 内容计数聚合视图。
export interface ContentTagSummary extends ContentTag {
  count: number;
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

/// deployment_list 返回记录（camelCase 对齐 Rust DeploymentRow，#[serde(rename_all="camelCase")]）
export interface Deployment {
  id: string;
  siteId: string;
  triggerType: 'manual' | 'scheduled' | 'rollback';
  targetEnv: DeploymentEnv;
  mode: 'simple' | 'full';
  connectionId: string | null;
  remotePath: string;
  versionDir: string;
  serverVersion: string;
  status: DeploymentStatus;
  startedAt: number;
  finishedAt: number | null;
  durationMs: number | null;
  uploadedCount: number;
  deletedCount: number;
  totalBytes: number;
  errorSummary: string;
  manifestJson: string;
  stepsJson: string; // DeploymentStep[] JSON
  logJson: string;   // string[] JSON
  rollbackFrom: string | null;
}

/// 部署「工作连续性」聚合统计（按服务器连接，覆盖全部历史，不限于当前分页）
export interface DeploymentStats {
  total: number;
  successCount: number;
  failedCount: number;
  scheduledCount: number;
  lastDeployedAt: number | null;
  lastScheduledAt: number | null;
  /// 自最近一次部署向前数的连续成功次数（健康度信号）
  consecutiveSuccess: number;
}

export interface DeploymentStep {
  key: string;
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  message: string;
  percent: number;
  startedAt: number | null;
  finishedAt: number | null;
}

/// 服务运行状态（路线B：Nginx 静态托管）
export interface ServiceStatus {
  isRunning: boolean;
  /** HTTP 状态码（200/301/302 视为可达） */
  healthzCode: string;
  /** HTTP 是否可达 */
  healthOk: boolean;
  currentVersion: string;
}

/// 部署步骤标识，与 Rust deploy_service STEP_* 常量对齐。
export type DeployStep =
  | 'validate'
  | 'precheck'
  | 'config'
  | 'upload'
  | 'switch'
  | 'nginx'
  | 'verify'
  | 'cleanup'
  | 'done';

export interface DeployProgress {
  step: DeployStep;
  message: string;
  percent: number;
}

/// deploy-progress 事件负载（含站点 ID，供多站点过滤）。
export interface DeployProgressEvent {
  siteId: string;
  step: DeployStep;
  message: string;
  percent: number;
}

/// 本地预览运行态（site_preview_* 返回，camelCase 对齐 PreviewInfo）。
export interface PreviewInfo {
  siteId: string;
  baseUrl: string;
  healthzUrl: string;
  port: number;
  alive: boolean;
}
export interface DeployOutcome {
  deploymentId: string;
  baseUrl: string;
  uploadedCount: number;
  totalBytes: number;
  durationMs: number;
  log: string[];
}

// ============================================================
// 部署前就绪检查（路线B）
// ============================================================

/// 部署前就绪检查问题项（site_deploy_check 返回，camelCase 对齐 Rust DeployReadinessIssue）。
export interface DeployReadinessIssue {
  level: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  hint: string | null;
}

/// 部署前就绪检查结果（路线B：静态托管）。
/// 前端在「开始部署」前先跑，把「为什么不能部署」结构化呈现为可行动提示。
export interface DeployReadiness {
  ok: boolean;
  siteId: string;
  siteName: string | null;
  connectionId: string | null;
  connectionName: string | null;
  remotePath: string | null;
  localDistExists: boolean;
  /** 远程服务器 Nginx 是否可用 */
  nginxAvailable: boolean | null;
  issues: DeployReadinessIssue[];
}

/// ssg_build / ssg_build_full 返回（camelCase 对齐 Rust BuildReport）。
export interface BuildReport {
  ok: boolean;
  durationMs: number;
  pages: number;
  assets: number;
  /** 增量构建中因内容未变化而跳过的页面数 */
  skipped: number;
  warnings: string[];
  error: string | null;
  distDir: string;
}

/// theme_list 返回的内置主题元数据（camelCase 对齐 Rust ThemeMeta）。
export interface ThemeMeta {
  id: string;
  name: string;
  description: string;
  license: string;
  settings: ThemeSettingMeta[];
}

export interface ThemeSettingMeta {
  key: string;
  label: string;
  kind: 'text' | 'textarea' | 'color' | 'select' | 'toggle' | 'media' | 'nav-list';
  default: string;
  options: { value: string; label: string }[];
}
