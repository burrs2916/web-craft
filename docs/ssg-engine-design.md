# WebCraft SSG 引擎技术方案（SSG Engine Design）

> 版本：v1.0
> 状态：定稿（对应 PRD 4.4 FR-B1~B6，M1 核心模块）
> 前置文档：[PRD.md](./PRD.md)（决策记录 #1 纯静态路线、#2 Tera 模板）
> 关联文档：[cms-database-design.md](./cms-database-design.md) · [theme-system-design.md](./theme-system-design.md)

---

## 1. 目标与非目标

**目标**

- Markdown 内容 + 主题模板 → 标准 HTML/CSS/JS 静态产物（FR-B1），输出目录结构可直接被 Nginx/Apache 托管（FR-B4）
- 本地预览服务器（FR-B2），应用内 WebView 即时查看
- 增量构建：只重建变化部分，万级内容 < 2s（FR-B3 + PRD 非功能需求）
- 自动生成 sitemap.xml / robots.txt / RSS / Atom、分类页 / 标签页 / 归档页 / 分页（FR-B5/B6）

**非目标**

- 不做动态站点渲染（PRD 决策 #1）
- 不做客户端搜索/评论等运行时组件（M4 前不引入 JS 运行时依赖，主题可自带）

---

## 2. 技术选型（已拍板）

| 组件 | 选型 | 版本基线 | 理由 |
|------|------|---------|------|
| 模板引擎 | **Tera** | ^1 | PRD 决策 #2：Rust 生态 Jinja2 引擎，autoescape 防 XSS，模板继承/宏满足主题需求 |
| Markdown | **pulldown-cmark** | ^0.13 | 纯 Rust 事实标准，支持 GFM（表格/任务列表/删除线），事件流 API 便于自定义处理 |
| 代码高亮 | **syntect** | ^5 | 渲染期生成带高亮标记的 HTML，产物零 JS 依赖；Tera + pulldown-cmark 组合成熟 |
| RSS/Atom | 手写 XML 模板 | - | 结构固定，不值得引库 |
| 预览服务器 | **tiny_http** | ^0.12 | 单依赖轻量 HTTP 服务，符合本项目"最小依赖"哲学；不用 axum/hyper 全家桶 |
| 图片处理（M2） | **image** | ^0.25 | 媒体库压缩/WebP/缩略图（FR-M2），M1 不引入 |

新增依赖总计 4 个（M1 为 3 个），全部纯 Rust、无系统库依赖，不破坏 Windows/MSIX 打包。

---

## 3. 数据流水线

```
TipTap 编辑器
  │ content_json（ProseMirror JSON，编辑真源）
  │ 保存时：@tiptap/markdown 序列化
  ▼
contents.content_md（Markdown）+ content_hash ──存于 SQLite──▶ SSG 输入集（仅 status=published）
  │
  │  ssg_build(site_id)
  ▼
pulldown-cmark ──▶ HTML 片段（syntect 高亮代码块、媒体相对路径校验）
  ▼
Tera 渲染（templates/*.html + 渲染上下文，见 theme-system-design.md §4）
  ▼
dist/ 静态产物 + 构建缓存更新 ──manifest──▶ 部署流水线（SFTP mirror）
```

关键点：

- **后端只吃 Markdown**：构建不依赖前端运行，也无 TipTap JSON→HTML 的 Rust 实现负担
- **Front Matter 双视图（FR-C5）**：元数据存在 contents 表字段（非 Markdown 头部），切换 Markdown 视图时由前端在文件头拼接显示，保存时剥离——数据库始终是结构化真源
- **内部链接校验**：渲染期扫描相对链接与图片引用，指向不存在 slug 或未发布内容时产生 warning（不阻塞构建，进构建报告）

## 4. 模块结构

```
src-tauri/src/ssg/
├── mod.rs          # 对外接口：build / build_full / preview
├── builder.rs      # 构建编排：收集输入 → 渲染 → 写产物 → 更新缓存
├── markdown.rs     # pulldown-cmark 封装：GFM、syntect 高亮、链接/媒体校验
├── taxonomy.rs     # 分类/标签/归档/分页数据组装
├── feeds.rs        # sitemap.xml / robots.txt / RSS / Atom 生成
├── incremental.rs  # 缓存读写与变更检测（§5）
└── preview.rs      # tiny_http 预览服务器（§7）
```

调用方：`app/ssg_service.rs`（IPC 层）→ `ssg::` 模块；SSG 内部不访问数据库以外状态，纯函数化便于测试。

## 5. 增量构建

**缓存文件**：`<local_workdir>/.webcraft/build-cache.json`

```json
{
  "engine_version": 1,
  "site_hash": "sha256(theme_id + theme_config + build_config)",
  "entries": {
    "content-abc": { "hash": "…", "outputs": ["posts/hello/index.html"] },
    "taxonomy:tags": { "hash": "…", "outputs": ["tags/*/index.html", "index.html"] }
  }
}
```

**重建策略（三层）**

| 触发 | 范围 | 判断依据 |
|------|------|---------|
| 单篇内容变更 | 该篇详情页 + 依赖它的列表页（首页/分类/标签/归档/RSS/sitemap） | `contents.content_hash` 变化 |
| 主题/配置变更 | **全量重建**（清空 dist） | `site_hash` 变化 |
| 应用升级 | 全量重建 | `engine_version` 变化 |

**产物写入**：先写 `dist-new/` 临时目录，全部成功后原子交换 `dist/`——构建中途失败不污染上一次可部署产物；diff 两版目录即得部署清单（`deployments.manifest_json` 的 upload/delete 集合）。

**性能预算与达标手段**

- 单篇重建：读缓存 + 1 篇渲染 + ≤10 个列表页重渲染，目标 < 100ms
- 万级内容全量：列表页渲染是热点，采用 `tokio::task::spawn_blocking` + 分批写盘；若仍超 2s 预算，引入 rayon 并行渲染（预留，M1 不加）
- 缓存加载失败（JSON 损坏）= 自动降级全量重建，不报错阻塞

## 6. 产物目录结构（FR-B4）

```
dist/
├── index.html                        # 首页 = 第 1 页文章列表
├── page/2/index.html                 # 列表分页（/page/N/，N≥2）
├── posts/<slug>/index.html           # 文章（目录式 URL，便于相对路径）
├── pages/<slug>/index.html           # 独立页面（关于我等）
├── category/<name>/index.html        # 分类页（含分页）
├── tags/index.html                   # 标签总览
├── tags/<tag>/index.html             # 标签页（含分页）
├── archive/index.html                # 按年月归档
├── 404.html                          # Nginx error_page 指向
├── feed.xml / atom.xml
├── sitemap.xml / robots.txt
└── assets/                           # 主题资源 + media 同步
    └── media/2026/08/<hash>.webp     # 媒体按引用同步（FR-M4）
```

分页规则：每页条数取 `build_config.posts_per_page`（默认 10）；末页不足不生成空页；`prev/next` 由渲染上下文注入模板。

## 7. 本地预览服务器（FR-B2 / FR-T4）

- `127.0.0.1` 随机可用端口启动 tiny_http，serve `dist/`
- 每次构建完成发 `ssg-build-finished` 事件 → 预览 WebView 自动刷新（注入 `<script>reload>` 仅在预览模式，产物本身干净）
- 同时提供 `shell: open` 外部浏览器入口
- 应用退出/预览关闭即停服务；端口与句柄记录在预览会话管理中，防泄漏

## 8. IPC 命令与事件

```
ssg_build(site_id) -> BuildReport            # 增量构建；无缓存时自动全量
ssg_build_full(site_id) -> BuildReport       # 强制全量（清缓存）
ssg_preview_start(site_id) -> { url }        # 启动预览服务器
ssg_preview_stop(site_id)
ssg_get_build_report(site_id) -> BuildReport # 最近一次报告（警告/内部链接检查结果）
```

```
ssg-build-progress   { site_id, phase, current, total, message }   # 全量构建进度条
ssg-build-finished   { site_id, ok, duration_ms, stats { pages, assets, warnings[] } }
```

BuildReport 的 warnings（内部链接失效、图片缺失、slug 重复尝试修复等）在预览页顶部以非阻塞条展示——对齐"构建失败必须可定位"的可靠性要求。

## 9. 错误处理与诊断

| 错误类型 | 行为 |
|---------|------|
| 模板语法错误 | 构建失败；错误含模板文件名+行号，直达主题编辑入口 |
| Markdown 解析错误 | pulldown-cmark 容错性强，实际以"渲染中断"兜底，错误定位 content_id |
| 磁盘写入失败 | 保留旧 dist，报告错误路径与 errno |
| 内容缺失（0 篇 published） | 正常构建（空站也是合法站点），首页显示主题空态 |

所有错误写 debug.log（沿用现有诊断体系），BuildReport 序列化存 `.webcraft/last-report.json` 供 UI 复查。

## 10. 与部署流水线的衔接

`ssg_build` 成功后不自动部署。一键部署（FR-D1）= 运维方案 L3 任务的预置模板：

```
build(本引擎) → diff(dist_new vs dist / 远端清单) → sftp_transfer(mirror) → post_deploy_commands(nginx reload) → verify(curl 200)
```

差异对比（FR-D2）直接消费 §5 的两版产物 diff；M1 首版允许"整站上传 + 部署历史"简化路径（PRD M1 已界定），差异同步在 M2 落地（运维方案 Phase B）。

## 11. 测试策略

- 单元：markdown.rs（GFM 边界、代码高亮、链接校验）、incremental.rs（缓存命中/降级）
- 集成：固定 seed 站点（100 篇内容 + 内置主题）→ 构建产物快照对比（golden files）
- 性能基准：10,000 篇随机内容的全量与单篇增量构建计时，纳入 CI 阈值检查（增量 < 2s）
