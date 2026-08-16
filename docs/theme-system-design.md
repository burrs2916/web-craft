# WebCraft 主题系统设计（Theme System Design）

> 版本：v1.0
> 状态：定稿（对应 PRD 4.3 FR-T1~T4，M1 核心模块）
> 前置文档：[PRD.md](./PRD.md)（决策记录 #2 Tera 模板）
> 关联文档：[ssg-engine-design.md](./ssg-engine-design.md)（渲染引擎） · [cms-database-design.md](./cms-database-design.md)（theme_config 存储）

---

## 1. 主题的定义

一个主题 = **Tera 模板集 + 静态资源 + 设置模型声明（theme.json）**，决定了站点的外观与页面骨架。主题与内容严格分离：换主题不改内容，删主题不影响已构建产物（产物已自包含资源）。

## 2. 目录结构

内置主题随应用分发（打包进二进制资源），自定义主题（M2）从本地目录加载：

```
themes/craft-blog/
├── theme.json              # 清单 + 设置模型（§4）
├── templates/
│   ├── base.html           # 布局骨架（<head>/header/footer 引用）
│   ├── index.html          # 首页 + 文章列表分页
│   ├── post.html           # 文章详情
│   ├── page.html           # 独立页面
│   ├── archive.html        # 归档页
│   ├── category.html       # 分类页
│   ├── tag.html            # 标签页
│   ├── tags.html           # 标签总览
│   ├── 404.html
│   ├── feed.xml            # RSS（atom.xml 同理）
│   └── partials/
│       ├── header.html / footer.html
│       └── pagination.html
└── assets/
    ├── css/main.css        # 纯静态资源，构建期拷入 dist/assets/theme/<id>/
    └── img/
```

模板完整性校验：上列模板为**必需集**，缺失任何一个则加载失败（错误指明缺哪个文件）；`tags.html`/`category.html` 可通过 theme.json `supports` 声明不支持（构建时跳过对应页面生成）。

## 3. 内置主题首发清单（FR-T1）

| 主题 ID | 类型 | 授权 | 定位 | 阶段 |
|---------|------|------|------|------|
| `craft-blog` | 博客 | 免费 | 极简双栏博客，默认主题，SSG v1 验收载体 | M1 |
| `craft-docs` | 文档 | Pro | 侧栏导航 + 全文目录，适合技术文档站 | M2 |
| `craft-portfolio` | 作品集 | Pro | 大图网格 + 项目详情页 | M2 |

免费版可见 `craft-blog` + 灰展示 Pro 主题（点击引导升级，对齐 PRD 4.10 门控"免费 1~2 套基础"）。

## 4. theme.json：清单与设置模型（FR-T2 的数据基础）

```json
{
  "id": "craft-blog",
  "name": "Craft Blog",
  "version": "1.0.0",
  "type": "blog",
  "license": "free",
  "supports": ["categories", "tags", "archive", "rss"],
  "settings": [
    { "key": "site_title",    "type": "text",     "label": "站点标题", "default": "" },
    { "key": "logo_media_id", "type": "media",    "label": "Logo" },
    { "key": "accent_color",  "type": "color",    "label": "强调色", "default": "#2f6fed" },
    { "key": "nav",           "type": "nav-list", "label": "导航菜单",
      "item_schema": { "label": "text", "target": "url-or-page-slug" } },
    { "key": "footer_text",   "type": "textarea", "label": "页脚文字", "default": "" },
    { "key": "posts_style",   "type": "select",   "label": "列表样式",
      "options": ["summary", "full"], "default": "summary" }
  ]
}
```

设置类型全集（v1）：`text / textarea / color / media / nav-list / select / toggle`。前端设置页**由 settings 数组动态渲染表单**（不硬编码主题控件），主题升级新增设置项自动出现在 UI，无需前端发版。

用户设置值存于 `sites.theme_config_json`（键值对），渲染时与 `default` 合并（用户值优先）。

## 5. 渲染上下文契约（Tera Context）

SSG 引擎向每个模板注入的变量结构固定如下（引擎与主题的共同契约，v1 冻结，新增字段只能可选）：

```jsonc
{
  "site":  { "name", "domain", "theme_config": { …合并后设置… } },
  "content": {                        // post.html / page.html
    "title", "slug", "type", "category", "tags": [], "summary",
    "html",                            // pulldown-cmark 渲染产物
    "cover_url", "published_at", "pinned",
    "seo": { "title", "description", "og_image_url" }
  },
  "list": {                            // index/category/tag.html
    "items": [ { "title", "url", "summary", "cover_url", "published_at", "pinned", "tags": [] } ],
    "pagination": { "page", "total_pages", "prev_url", "next_url" },
    "taxonomy": { "name" }             // 分类/标签页的当前项
  },
  "archive": { "groups": [ { "year_month", "items": [] } ] },
  "feeds": { "rss_url", "atom_url" },
  "assets_base": "/assets/theme/craft-blog"
}
```

安全规则：Tera `autoescape` 全开（HTML 模板）；内容 `html` 字段在注入前经 pulldown-cmark 白名单过滤（script/iframe/on* 属性剔除）；模板内禁用 Tera 的 `include` 指向主题目录之外的路径。

## 6. 设置 UI 与即时预览（FR-T2/T4）

- 站点设置页分两个 tab：基本信息（cms-database-design §2.1 字段）与主题设置（settings 动态表单）
- 设置变更 → 写 `theme_config_json` → 触发**全量增量构建**（site_hash 变化）→ `ssg-build-finished` 事件 → 预览 WebView 自动刷新，用户所见即所得
- 主题切换（同站点换 craft-docs）同理；切换前提示"部分设置项不通用"

## 7. 自定义主题与市场（路线）

| 阶段 | 能力 |
|------|------|
| M1 | 仅内置主题；theme.json + 模板以只读资源分发 |
| M2 | **本地目录导入**：`<local_workdir>/themes/<id>/`，加载时校验（必需模板齐全 / theme.json schema 合法 / id 不与内置冲突）；主题编辑器入口（打开本地目录 + 重建按钮） |
| V2 | 主题市场：签名包格式（zip + manifest 签名）、在线目录、一键安装；开发者文档（渲染上下文契约 = §5） |

## 8. Feature Gate 与许可

- `license` 字段决定主题在免费版的表现：可见、可预览（预览产物加水印提示？**不加**——预览即真实渲染，水印会误导设计判断；改为预览页顶部常驻"Pro 主题"提示条），但**构建/部署拦截**并引导升级
- 内置主题随应用更新，无独立版本管理；自定义主题不受 license 限制（用户自己的劳动成果）

## 9. 测试策略

- 每个内置主题带一组 golden 快照（固定 seed 内容 → 产物 HTML 对比），防止引擎改动悄悄破坏主题
- theme.json schema 校验的单元测试（缺字段/未知类型/重复 key）
- 渲染上下文契约的序列化快照测试：引擎注入的 context 结构变化时强制评审（保护第三方主题兼容性，为 V2 市场打基础）
