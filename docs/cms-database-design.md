# WebCraft CMS 数据库设计（CMS Database Design）

> 版本：v1.0
> 状态：定稿（对应 PRD M0 交付物）
> 前置文档：[PRD.md](./PRD.md)（FR-S1~S5 / FR-C1~C8 / FR-D6 / FR-M1~M4）
> 关联文档：[ssg-engine-design.md](./ssg-engine-design.md) · [theme-system-design.md](./theme-system-design.md) · [automation-ops-plan.md](./automation-ops-plan.md)

---

## 1. 范围与关键决策

本设计覆盖 CMS 新增的 7 张表：`sites`、`contents`、`content_versions`、`content_tags`、`content_tag_links`、`deployments`、`media_assets`。运维自动化的 4 张表（ops_scripts / automation_tasks / task_runs / task_run_steps）见 automation-ops-plan.md §9，与本文档共用 §3 的迁移机制。

### D-DB1：新建 `contents` 表，不演进现有 `notes` 表

| 维度 | 理由 |
|------|------|
| 数据安全 | notes 表已有用户数据，原地加列（slug/status/SEO…）会让"个人笔记"承担"发布内容"的全部字段，语义混杂 |
| 模型差异 | 笔记是私有知识管理（分组/分类/无发布语义）；内容是面向公开 Web 的资源（slug 唯一性、状态机、版本快照、定时发布） |
| 编辑器复用 | 前端仍复用 TipTap 编辑器组件（NoteEditor 拆分后），仅数据存储分离 |
| 演进路径 | 提供"笔记转内容"单向导入工具（M2），不做双向同步 |

### D-DB2：主键用 `TEXT` 业务 ID（`site-<uuid>` 风格）

与现有 connections/notes 等表一致（前端生成 UUID，离线可用、便于调试），不引入自增整型主键。

### D-DB3：时间统一 `INTEGER` Unix 毫秒时间戳

沿用现有表的约定，避免 SQLite 无原生日期类型带来的解析分歧。

---

## 2. 表结构

### 2.1 sites — 站点（CMS 的组织单元）

```sql
CREATE TABLE sites (
  id                 TEXT PRIMARY KEY,        -- site-<uuid>
  name               TEXT NOT NULL,           -- 站点显示名
  domain             TEXT NOT NULL DEFAULT '',-- 主域名（用于 sitemap/RSS 绝对链接）
  local_workdir      TEXT NOT NULL,           -- 本地工作目录（站点根，含 content/media/dist）
  connection_id      TEXT,                    -- 目标服务器（→ connections.id；NULL = 仅本地）
  deploy_config_json TEXT NOT NULL DEFAULT '{}',  -- 部署目标（见 §4.1）
  build_config_json  TEXT NOT NULL DEFAULT '{}',  -- 构建配置（见 §4.2）
  theme_id           TEXT NOT NULL DEFAULT 'craft-blog',
  theme_config_json  TEXT NOT NULL DEFAULT '{}',  -- 主题设置（键值由主题 theme.json 定义）
  status             TEXT NOT NULL DEFAULT 'active',  -- active | archived
  last_deployed_at   INTEGER,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);
CREATE INDEX idx_sites_connection ON sites(connection_id);
```

约束：`local_workdir` 唯一性由服务层校验（同目录两站点会互相污染构建产物）；免费版站点数量上限由 Feature Gate 在服务层拦截（Pro: 无限 / Free: 1，见 PRD 4.10）。

### 2.2 contents — 内容（文章/页面）

```sql
CREATE TABLE contents (
  id               TEXT PRIMARY KEY,          -- content-<uuid>
  site_id          TEXT NOT NULL,
  type             TEXT NOT NULL DEFAULT 'post',  -- post | page
  title            TEXT NOT NULL,
  slug             TEXT NOT NULL,             -- URL 路径段，小写字母数字连字符
  category         TEXT NOT NULL DEFAULT '',  -- 单分类（空 = 未分类）
  summary          TEXT NOT NULL DEFAULT '',
  cover_media_id   TEXT,                      -- → media_assets.id
  content_json     TEXT NOT NULL DEFAULT '',  -- TipTap ProseMirror JSON（编辑态源数据）
  content_md       TEXT NOT NULL DEFAULT '',  -- Markdown（保存时由前端 @tiptap/markdown 生成）
  content_hash     TEXT NOT NULL DEFAULT '',  -- sha256(title+content_md+元数据)，增量构建指纹
  seo_title        TEXT NOT NULL DEFAULT '',
  seo_description  TEXT NOT NULL DEFAULT '',
  og_image_media_id TEXT,
  status           TEXT NOT NULL DEFAULT 'draft',   -- draft | scheduled | published
  scheduled_at     INTEGER,                   -- 定时发布时间（status=scheduled 时必填）
  published_at     INTEGER,                   -- 首次上线时间
  pinned           INTEGER NOT NULL DEFAULT 0,
  deleted_at       INTEGER,                   -- 回收站软删除（FR-C8）
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_contents_slug ON contents(site_id, type, slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_contents_site_status ON contents(site_id, status, deleted_at, published_at DESC);
CREATE INDEX idx_contents_scheduled ON contents(status, scheduled_at);
```

设计说明：

- **slug 唯一性只对未删除内容生效**（部分索引）：回收站里的同名 slug 不阻塞新建；恢复时若冲突则要求改名
- **`content_json` 与 `content_md` 双存储**：JSON 是编辑器真源（无损往返），Markdown 是构建输入（后端 pulldown-cmark 渲染）。两者都在保存时写入，构建器只读 `content_md`，不依赖前端运行
- **`content_hash`** 是增量构建的核心：内容未变则跳过重建（详见 ssg-engine-design.md §5）
- **跨站点复制（FR-C4）**：服务层实现 `content_copy_to_site`，复制时重算 slug 冲突

### 2.3 content_versions — 内容版本快照（FR-C7）

```sql
CREATE TABLE content_versions (
  id           TEXT PRIMARY KEY,
  content_id   TEXT NOT NULL,
  version_no   INTEGER NOT NULL,             -- 站点内自增
  snapshot_json TEXT NOT NULL,               -- 全量快照（title/slug/category/summary/content_md/SEO/状态）
  trigger      TEXT NOT NULL DEFAULT 'manual', -- manual | publish | rollback
  comment      TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL,
  FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE,
  UNIQUE (content_id, version_no)
);
```

快照时机：手动"存版本"、每次发布（`trigger=publish`）、回滚前自动存当前态。保留策略：每篇内容最近 50 个版本，超出由后台任务清理。

### 2.4 content_tags / content_tag_links — 标签（多对多）

```sql
CREATE TABLE content_tags (
  id      TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  name    TEXT NOT NULL,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  UNIQUE (site_id, name)
);

CREATE TABLE content_tag_links (
  content_id TEXT NOT NULL,
  tag_id     TEXT NOT NULL,
  PRIMARY KEY (content_id, tag_id),
  FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES content_tags(id) ON DELETE CASCADE
);
```

标签按站点隔离（不同于笔记的全局 note_tags）；空标签（无内容引用）在解除最后一个关联时清理。

### 2.5 deployments — 部署历史（FR-D6）

```sql
CREATE TABLE deployments (
  id            TEXT PRIMARY KEY,
  site_id       TEXT NOT NULL,
  trigger_type  TEXT NOT NULL,               -- manual | scheduled | rollback
  target_env    TEXT NOT NULL DEFAULT 'production',  -- production | staging（M2 多环境）
  status        TEXT NOT NULL,               -- running | success | failed | cancelled
  started_at    INTEGER NOT NULL,
  finished_at   INTEGER,
  duration_ms   INTEGER,
  uploaded_count INTEGER NOT NULL DEFAULT 0, -- 实际上传文件数
  deleted_count INTEGER NOT NULL DEFAULT 0,  -- 远端删除文件数
  total_bytes   INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT NOT NULL DEFAULT '',
  manifest_json TEXT NOT NULL DEFAULT '[]',  -- 完整清单（见 §4.3）
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);
CREATE INDEX idx_deployments_site ON deployments(site_id, started_at DESC);
```

回滚（`trigger_type=rollback`）= 取目标历史版本的 `manifest_json`，以"镜像同步到该清单"的方式执行一次新部署，不在原地改历史记录。

### 2.6 media_assets — 媒体库（FR-M1~M3）

```sql
CREATE TABLE media_assets (
  id           TEXT PRIMARY KEY,
  site_id      TEXT NOT NULL,
  filename     TEXT NOT NULL,                -- 原始文件名（展示用）
  storage_path TEXT NOT NULL,                -- 站点工作区内相对路径 media/2026/08/<hash>.webp
  mime_type    TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL,
  width        INTEGER,
  height       INTEGER,
  file_hash    TEXT NOT NULL,                -- 内容寻址：同图重复上传直接复用
  thumb_path   TEXT,                         -- 缩略图（Pro 图片处理产物）
  created_at   INTEGER NOT NULL,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);
CREATE INDEX idx_media_site ON media_assets(site_id, created_at DESC);
CREATE INDEX idx_media_hash ON media_assets(site_id, file_hash);
```

存储约定：文件落在 `<local_workdir>/media/YYYY/MM/`，数据库只存相对路径——站点目录整体拷贝/备份即带走全部资产。

---

## 3. 迁移机制：`PRAGMA user_version` 版本化（D-DB4）

现有 `database.rs::migrate()` 的 check-column-then-ALTER 手工链在 22 张表规模已显疲态，新增 11 张表（本设计 7 + 运维 4）前必须先引入版本化迁移。

```rust
// infra/storage/migrations.rs（新文件）
const SCHEMA_VERSION: i64 = 2;

pub fn run_migrations(conn: &Connection) -> Result<()> {
    let current: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    // 引导：现有库（22 张表齐全但 user_version=0）视为 v1
    if current < 1 && has_table(conn, "connections")? {
        conn.pragma_update(None, "user_version", 1)?;
    }
    if current < 1 {
        create_v1_baseline(conn)?;   // 全新安装：现有 initialize() 全部建表逻辑
    }
    if current < 2 {
        create_cms_tables(conn)?;    // 本设计 7 张表 + 索引
        create_ops_tables(conn)?;    // 运维方案 4 张表
        conn.pragma_update(None, "user_version", 2)?;
    }
    Ok(())
}
```

规则：

- 每个版本号对应一个**只追加、不修改**的迁移函数；禁止在已发布版本函数内改 SQL
- 迁移在单个事务内执行，失败整体回滚并写 debug.log
- 现有 `initialize()` 与手工 `migrate()` 逻辑整体收编为 `create_v1_baseline()`，此后不再向 v1 函数添加任何表

---

## 4. JSON 字段结构契约

JSON 列的结构由本节固定，前后端共享类型（放 `src/proto/cms.ts` 与 `src-tauri/src/infra/storage/types.rs`）。

### 4.1 sites.deploy_config_json

```json
{
  "mode": "sftp",
  "remote_path": "/var/www/mysite",
  "delete_orphaned": false,
  "backup_dir": "/var/www/mysite.bak",
  "post_deploy_commands": ["sudo nginx -s reload"],
  "environments": [
    { "id": "production", "remote_path": "/var/www/mysite" },
    { "id": "staging", "remote_path": "/var/www/mysite-staging" }
  ]
}
```

（M1 只实现单环境 `remote_path`；`environments` 为 M2 多环境预留，出现即优先。）

### 4.2 sites.build_config_json

```json
{
  "dist_dir": "dist",
  "posts_per_page": 10,
  "exclude": ["drafts/**"],
  "generate": { "rss": true, "sitemap": true, "robots": true, "archive": true, "tags": true }
}
```

### 4.3 deployments.manifest_json（差异部署与回滚的依据）

```json
[
  { "path": "posts/hello-world/index.html", "hash": "sha256:…", "size": 8213, "action": "upload" },
  { "path": "assets/css/main.css", "hash": "sha256:…", "size": 15204, "action": "keep" },
  { "path": "posts/old-post/index.html", "action": "delete" }
]
```

---

## 5. 内容状态机

```
 draft ──发布──▶ published
   │  ▲              │ 再次编辑仍为 published（产生新版本快照）
   │  └──撤回────────┘
   └──设置定时──▶ scheduled ──到点（应用运行中）──▶ published
                     │ 定时前可取消 → draft
  任意状态 ──删除──▶ (deleted_at 非空，回收站) ──恢复──▶ 原状态 / ──彻底删除──▶ 物理删除
```

- `scheduled` 到点检查由应用内调度器驱动（见 PRD 决策 #4：应用未运行不触发、不补发；启动时扫描 `idx_contents_scheduled` 提示用户手动处理过期项）
- 只有 `published` 内容进入 SSG 构建输入集；`draft/scheduled` 不产出文件

---

## 6. IPC 命令清单（Tauri Commands）

```
# 站点
site_create(site) -> Site                      # 免费版第 2 个站点在此被 Feature Gate 拦截
site_list() -> Vec<SiteSummary>                # 含草稿数/已发布数/最近部署/连通性
site_get(id) / site_update(site) / site_archive(id)
site_health_check(id) -> HealthReport          # FR-S5：远程可写/磁盘/服务状态
site_copy(from_id, name) -> Site               # M2

# 内容
content_create(site_id, type) -> Content
content_list(site_id, { type?, status?, tag?, keyword?, page? }) -> PageResult
content_get(id) / content_save(content) -> Content          # 保存时计算 content_hash
content_delete(id) / content_restore(id) / content_purge(id)
content_publish(id) / content_schedule(id, at) / content_unschedule(id)
content_copy_to_site(id, target_site_id) -> Content         # FR-C4
content_save_version(id, comment) / content_list_versions(id) / content_rollback(id, version_no)

# 部署
deployment_list(site_id, limit?) -> Vec<Deployment>
deployment_get(id) -> DeploymentDetail          # 含完整 manifest
deployment_rollback(site_id, deployment_id) -> deployment_id

# 媒体
media_upload(site_id, { path | bytes, filename }) -> MediaAsset   # hash 去重
media_list(site_id, { type?, keyword? }) / media_delete(id)
media_process(id, { compress | webp | thumbnail }) -> MediaAsset  # Pro 门控（FR-M2）
```

事件（kebab-case，沿用现有规范）：`sites-changed`、`contents-changed`、`deployment-progress`、`deployment-finished`、`media-uploaded`。

---

## 7. 与现有系统的关系

| 现有资产 | 关系 |
|---------|------|
| `connections` 表 | `sites.connection_id` 外键引用；站点健康检查/部署复用其认证信息与 ControlMaster 池 |
| `notes` 系 5 张表 | 互不影响；M2 提供"笔记导入为内容"工具 |
| `note_tags/note_tag_links` 模式 | `content_tags` 参照其结构，但按站点隔离 |
| licensing Feature Gate | `site_create`、`media_process`、`deployment_run`（流水线）为门控点 |
| debug.log 体系 | 迁移、构建、部署失败全部落日志，错误信息含表名/站点 ID 便于定位 |
