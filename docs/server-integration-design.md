# WebCraft 服务端集成设计（Server Integration Design）

> 版本：v0.9
> 状态：评审中（对应 M-x1~M-x3 交付物；FR 编号待 PRD 立项）
> 前置文档：[PRD.md](./PRD.md) · [cms-database-design.md](./cms-database-design.md)（§4.1 deploy_config_json 契约）
> 关联文档：[ssg-engine-design.md](./ssg-engine-design.md) · [automation-ops-plan.md](./automation-ops-plan.md)（agent 执行管道）
> 参考实现：edge-conductor（本机 `/Users/liwenchao/rustpro/edge-conductor`，8-crate workspace / ~53k 行边缘网关）

---

## 1. 范围与关键决策

本设计覆盖两个目标：**AI agent 自动安装服务器环境**（nginx/systemd 等），以及**上传即用的 Rust 动态服务端 `webcraft-server`**（可配置路由与权限）。技术骨架取自 edge-conductor 的工程实践，业务层不引入（MQTT/协议解析/时序库与本场景无关）。

### D-SI1：拆 Cargo workspace，三成员起步

| 维度 | 理由 |
|------|------|
| 现状 | src-tauri 单 crate（`[workspace]` 为空表），分层 app/core/domain/infra/interface 与 edge-conductor 的 DDD 分层同构 |
| 目标 | 根 workspace：`web-craft/src-tauri`（桌面端）+ `server`（webcraft-server）+ `common`（共享契约） |
| 契约单点 | SSG 数据格式、server.toml schema、API DTO 只定义一次（`common`），桌面端与服务端引用同一份 serde 定义，永不漂移 |
| 不学全套 | edge-conductor 拆 8 crate 是边缘网关复杂度使然；我们 3 个够用，抽取起点为 `src-tauri/src/core/types.rs` 的 CMS 类型 |

### D-SI2：webcraft-server 基于 axum 单端口

采用 edge-conductor 验证过的形态：tokio `TcpListener` + `axum::serve` + 优雅关闭（SIGTERM 停止接收→排空连接）+ tower-http CORS。**不搬其 WS 独立端口**（8085 是设备网关刚性需求）。初始能力面：静态文件托管（SSG dist 产物）、`/healthz`、预留 API 层。

### D-SI3：路由与权限进配置文件（server.toml）

edge-conductor 的 HTTP 路由本身是代码静态 nest 的，可配置的只有 auth 角色与 MQTT 地址。本设计补上它没做的部分——**路由表落配置**（见 §4 schema）。未声明 `roles` 的路由一律要求 admin（默认拒绝，配置错误不放大暴露面）。

### D-SI4：鉴权简化为静态 token + 角色白名单

取 edge-conductor 的 `allowed_roles` 白名单模式，砍掉登录流/refresh-token/logout（个人站点无多用户会话场景）。角色收敛为 `admin`/`editor` 两种；初始 token 由桌面端部署时随机生成注入。

### D-SI5：产物 musl 静态链接，部署走三件套

edge-conductor 用 glibc 动态链接（老系统缺库），且目标机需人工跑 install.sh。本设计改为：交叉编译仅保留 linux x86_64/aarch64，**musl 静态链接**（体积换兼容，sqlite bundled 在 musl 下可行）；「人工脚本」替换为现有管道——SFTP 上传三件套（二进制 + server.toml + systemd unit 模板）+ AI agent 经 SSH 会话执行安装剧本。

### D-SI6：数据库不强行统一

桌面端维持 rusqlite + `PRAGMA user_version` 迁移（既有硬约束，见 cms-database-design.md §3）；webcraft-server **M1 零数据库**（纯静态 + 配置驱动）。未来评论/计数/搜索需要数据时引入 sqlx（异步，契合 axum/tokio），两侧各自持有连接，仅共享 DDL 与 serde 类型（放 `common`）。

---

## 2. 技术栈映射总表

| # | edge-conductor 组件 | web-craft 结合点 | 决策 |
|---|---------------------|------------------|------|
| A1 | Cargo workspace 多 crate 分层 | 拆 webcraft-server + common 契约 crate | 采纳·瘦身 |
| A2 | axum 0.7 + tokio 服务端 | webcraft-server 单二进制骨架 | 直接采纳 |
| A3 | config.toml 双层配置（静态加载 + 运行时热改/备份/校验） | deploy_config_json → 部署时生成 server.toml | 改造采纳（热改后置） |
| A4 | Bearer + allowed_roles + provision_keys | 静态 token + admin/editor 白名单 | 简化采纳 |
| A5 | 交叉编译 + install.sh/config 模板 | SFTP 三件套 + AI agent 安装 | 改造采纳 |
| A6 | sqlx 0.8（sqlite+postgres） | 服务端 M1 零 DB，引入时选 sqlx | 延后 |
| A7 | ProcessManager 子进程看守 + 心跳检测 | 本地预览 sidecar + healthz 健康徽标 | 模式借鉴 |
| A8 | ProtocolTrait 插件式运行时 | 动态路由 handler trait + 注册表 | 暂不引入（M1 静态枚举） |
| — | rumqttc / GreptimeDB / goblin / WS 双端口 / 多租户头 | 边缘网关专属，无对应场景 | 不引入 |

互补关系：edge-conductor 有「服务端形态 + 配置/权限/分发体系」但无远程执行管道；web-craft 有「SSH/SFTP/AI agent 管道」但无服务端形态。两者拼接为「桌面端编排 + 服务器端运行」闭环。

---

## 3. Workspace 结构与共享契约

```
GITHUB_PRO/
├── Cargo.toml            # workspace 根：members = ["web-craft/src-tauri", "server", "common"]
├── web-craft/            # 桌面端（现有，src-tauri 加入 members）
├── server/               # webcraft-server：axum 单二进制
└── common/               # 共享契约
    └── src/lib.rs        #   serde 类型：Site/Content 摘要、ServerConfig、路由表、DDL（M2+）
```

**迁移注意**：workspace 化后 Tauri 与服务端共享 target 目录，冷编译变慢；现有测试/CI 命令需加 `--package` 限定（如 `cargo test -p web-craft --lib`）。属一次性成本，越晚做迁移成本越高，故排在 M-x2 首步。

**架构图**（部署数据流）：

```
┌─ GITHUB_PRO workspace ─────────────────────────────┐
│  web-craft ──path──▶ common ◀──path── server       │
│  (桌面端·SSH/SFTP/agent/CMS)   (契约)   (axum 服务端)│
└──────────────┬─────────────────────────▲───────────┘
   交叉编译 musl│                         │ curl /healthz 周期探测
               ▼                         │
      部署三件套 ──SFTP 上传（现有）──▶ 远程服务器
               （二进制+server.toml+unit）  ▲
  web-craft ──SSH 终端+AI agent 安装/排错──┘
```

---

## 4. webcraft-server 设计

### 4.1 server.toml schema（部署时由桌面端生成）

```toml
[server]
port = 8080
static_dir = "dist"           # SSG 构建产物目录

[auth]
token = "<部署时随机生成注入>"
allowed_roles = ["admin", "editor"]

# 可配置路由表：路径前缀 → handler 类型 + 允许角色
# 约束：未列出的路径走静态文件；未声明 roles 的路由一律要求 admin（默认拒绝）
[[route]]
path = "/api/content"
handler = "content_api"
roles = ["admin", "editor"]

[[route]]
path = "/comments"
handler = "comments"
roles = ["admin", "editor", "visitor"]

[[route]]
path = "/healthz"             # 无 roles = 公开
handler = "health"
```

生成来源：站点 `deploy_config_json`（契约见 cms-database-design.md §4.1）已含 `mode`/`remote_path` 等字段，部署时由桌面端转换为 server.toml。桌面端需新增 `toml` crate 依赖（serde 已就位）。

### 4.2 配置加载层次

- **静态层（M1）**：启动加载 server.toml → `common::ServerConfig`，校验失败拒绝启动并输出明确错误；
- **动态层（后置）**：参考 edge-conductor `infrastructure/config`（loader/manager/validator + `backups/` 备份目录 + HTTP 在线改），通过 SIGHUP 或 admin 权限的 `/config` 端点启用热改。

### 4.3 handler 注册（M1 形态）

静态枚举 + 映射表（`content_api` / `comments` / `health` …），配置中的 `handler` 字段查表实例化。A8 的 trait 插件化（edge-conductor ProtocolTrait 模式）为远期演进方向，不过早抽象。

---

## 5. 部署管道（AI agent 剧本）

```
环境探测 ──▶ 计划确认 ──▶ 剧本执行 ──▶ SFTP 三件套 ──▶ systemd 拉起 ──▶ healthz 徽标
(发行版/包管理器/  (桌面端展示  (SSH 会话·   (现有 SFTP      + 健康检查   (站点卡片
 nginx/端口)      待装清单)    白名单命令)   链路)                        回写)
                     ▲              │
                     └── 偏差时 AI 诊断 ─┘
```

- **剧本为主、AI 补救**：AI 不自由发挥。探测→生成计划→用户确认→执行白名单剧本（包管理器安装 / systemctl / ufw / 端口检查）；偏差时 AI 仅做「读输出→判断→提议下一条命令」。
- **安全边界**：任何 `sudo` / `rm` / 网络变更命令必须桌面端二次确认后下发。
- **环境清单由站点形态驱动**：纯静态站 = nginx + 静态文件（**不需要 rust 环境**）；动态形态 = systemd + webcraft-server + 可选 nginx 反代（部署配置二选一生成）。
- **健康检查**：agent 周期 curl `/healthz`，结果回写站点卡片现有服务器连通徽标体系。

---

## 6. 里程碑

| 阶段 | 内容 | 依赖 | 验收标准 |
|------|------|------|----------|
| M-x1 | AI agent 环境剧本（探测→确认→安装→偏差重试，覆盖 nginx/systemd/防火墙/端口） | 现有 agent+终端管道，零新增服务端代码 | 干净 Ubuntu 上剧本化装好 nginx 并通过探测 |
| M-x2 | workspace 化 + webcraft-server（静态托管 / healthz / server.toml 加载含路由表与角色 / 优雅关闭 / musl 交叉编译） | common 契约 crate 抽取 | musl 产物在 linux 直接运行，错误配置拒绝启动 |
| M-x3 | 部署闭环（SFTP 三件套 + systemd 拉起 + 健康徽标 + deploy_config_json→server.toml 生成器 + 本地预览 sidecar） | M-x1 + M-x2 | 一键从站点页部署到 healthz 通过，徽标变绿 |

M-x1 与 M-x2 无相互依赖，可并行。

---

## 7. 风险与边界

| # | 风险 | 缓解 |
|---|------|------|
| R1 | PRD 为纯静态 SSG，动态服务端属产品形态扩展 | PRD 显式立项（新增 FR 编号），避免范围漂移 |
| R2 | 可配置路由+权限 = 配置错误的暴露面 | 默认拒绝、token 部署时随机生成、启动校验 |
| R3 | AI agent 执行边界 | 白名单命令；sudo/rm/网络变更二次确认；AI 只提议不直执 |
| R4 | musl 体积 | 接受（换 glibc 兼容）；sqlite bundled 需在 musl 下回归验证 |
| R5 | workspace 构建扰动 | CI/测试命令加 `--package`；一次性迁移成本 |

---

## 8. 明确不引入清单

rumqttc（MQTT）、GreptimeDB 及其进程管理、goblin 协议解析、WS 独立端口、多租户请求头（tenant-id/user-id/x-provision-id）、8-crate 全套拆分、sqlx（M1 阶段）。
