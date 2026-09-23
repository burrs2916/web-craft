# web-craft 部署 / 统一架构 现状审计与路线图（2026-08-27）

> 目标：核对用户诉求——「新建站点 / 环境检测 / 部署管理（从底层重构，解决无法部署）/
> 连接·终端·站点统一整体（数据打通、入库为资源）/ 把 `webcraft-server` 部署到连接功能配置的
> 远程云端（unix 或 linux 兼容）/ 部署历史运维 + 自动化任务 + 工作连续性」。

## 0. 一句话结论

**「从底层重构」在代码层已基本完成**（前几轮自动化已落地：P0 二进制自动拉取 + Tier2 跨平台
ServiceCtl + 统一资源模型）。当前 `无法部署` 大概率是**运行期/运维期**问题（站点未绑连接、本地
`dist` 未构建、没有可达的 unix/linux 云端连接、或某一步 SSH 操作失败），而非架构缺陷。剩余工作
集中在 **运维 UI、自动化部署步骤、终端↔站点跳转、以及一次真实云端冒烟测试**。

---

## 1. 已验证可用的能力（附 file:line 证据）

| 能力 | 证据 | 状态 |
|---|---|---|
| 部署目标 = 连接功能配置的 SSH | `deploy_service.rs:506-511`（`run`）、`:1998-2003`（`run_full`）：`site.connection_id → ConnectionRepo::get_by_id → SshConnectionInfo` | ✅ |
| 二进制解析（离线 local / 可选 github） | `deploy_service.rs:593-603` 调 `resolve_binary`；`:3418-3507` `find_binary_path`/`pull_server_binary`；产物已存在：`webcraft-server/dist/{webcraft-server-linux-x86_64,linux-aarch64}` 与 `web-craft/bin/` | ✅ |
| 跨平台服务控制（unix/linux/macOS） | `deploy_platform.rs` 全模块；`run()` 用 `:617-619`、`:1095-1208`；`run_full()` 用 `:2536-2823`（**两条路径都已走 ServiceCtl**） | ✅ |
| 部署历史入库 + 可查 | `deployment_repo.rs`（insert / list_by_site / list_by_connection / count_by_connection）；命令 `deploy.rs:73` `deployment_list`、`:92` `deployment_list_by_connection`、`:146` `deployment_rollback` | ✅ |
| 统一资源模型（连接/站点/部署/终端/自动化 互联） | `resource_service.rs:77-215` `reconcile_all`；`deploy_service.rs:3653` `register_deployment_resource` 被 `deploy():477` **与** `deploy_full():1967` 共同调用；命令 `resource.rs:88` `resource_reconcile` | ✅ |
| 部署失败智能诊断 | `deploy_agent/mod.rs` + `rules.rs`（纯分析层，定位根因+证据+建议） | ✅ |
| 新建站点向导绑定连接 | `SitesPage.tsx:777-782`（createSite 带 connectionId + remotePath） | ✅ |
| 部署触发链路 | `DeployDialog.tsx:33,504`（deploySiteFull / pullServerBinary）→ 命令 `site_deploy_full` / `site_pull_server` | ✅ |

**四关验证信号**：本次 `cargo check` 已在后台运行确认当前树可编译（沿用前几轮「零错误」基线）。

---

## 2. 「无法部署」的真实根因（按概率排序，均为运行期/运维期）

1. **站点未绑定服务器连接** → `deploy_service.rs:507` / `:1999` 抛「站点未绑定服务器，无法部署」。
   新建向导虽能绑连接，但**没有强制**；历史站点可能 connection_id 为空。
2. **本地 `dist` 未构建** → `deploy_service.rs:523-529` 抛「本地构建产物不存在」。
   部署会连同前端 `dist` 一起上传，`local_workdir/dist` 不存在即失败。
3. **没有可达的 unix/linux 云端连接**（凭据/网络/主机不可达）→ SSH 探测架构即报错
   （`:574` / `:2088`「无法连接服务器探测架构」）。**这是最可能需要真实云端才能复现的一环。**
4. **完整版（full）环境不满足** → `run_full():2049` 调 `preflight_via_ops`，不通过则 `:2057-2065` 直接中断，
   提示去运维中心 AI 修复（postgres/redis 未就绪）。
5. **远端某步 SSH 操作失败**（systemd/launchd/nohup 拉起、nginx、迁移等）→ 由 DeployAgent 诊断，
   但用户感知为「部署失败」。

> 注：二进制本身**不缺**（第 1 节已确认），所以不是 P0 那轮的「缺产物」问题了。

---

## 3. 用户 5 项诉求 vs 现状 vs 待办

### 3.1 新建站点 + 环境检测
- 现状：向导齐全、可绑连接（`SitesPage.tsx`）；本地环境检测 `environment_service.rs`；远端预检
  `preflight` / `preflight_via_ops` 已存在。
- 缺口（P1，UX）：向导未**强制**「先构建 dist」「先做远端环境检测再允许部署」；远端环境检测结论
  未在前端显式呈现为可互操作卡片。

### 3.2 部署管理（从底层重构，解决无法部署）
- 现状：**架构层已完成**（见第 1 节）。
- 缺口（**P0，诊断**）：缺一个**部署前就绪检查命令**，把第 2 节的 5 类失败原因一次性结构化返回，
  让「为什么不能部署」对前端/用户一目了然，而不是等到真正 deploy 才报错。→ 见第 4 节推荐动作。
- 缺口（P0，验证）：需在**真实 unix/linux 云端连接**上跑一次端到端冒烟。

### 3.3 连接·终端·站点·部署 统一整体（数据打通、入库为资源）
- 现状：**DB 层已完成**（`reconcile_all` + `register_deployment_resource` 实时登记 + `resource_links`
  互联边：site runs_on connection、deployment deploys_to site / runs_on connection、automation uses connection）。
- 缺口（P1，UI）：① 终端功能**尚未**与站点/连接打通——应能「对一个站点一键打开其绑定服务器的终端会话」
  （SSH over PTY），并登记为 `terminal` 资源且 link 到对应 site/connection；② 资源中心交叉跳转 UI 可能未完全消费 links。

### 3.4 把 `webcraft-server` 部署到远程云端（unix/linux 兼容）
- 现状：**已完成**（`ServiceCtl` 三分支，两条部署路径一致；二进制为 musl，x86_64/aarch64 齐备）。
- 缺口（P0，验证）：需在**非 Linux 的 unix 主机**（如 macOS 远端 / BSD）上验证 `Other` 分支
  （nohup + pid 文件）真实可拉起，当前路径仅被代码覆盖、缺真机验证。

### 3.5 部署历史运维 + 自动化任务 + 工作连续性
- 现状：部署历史**已持久化 + 可按站点/连接查询**（第 1 节）；运维面板 `SiteOpsPanel` / `DeployPanel` 已存在。
- 缺口（P1，运维 UI）：历史记录的可运维性（查看日志、回滚按钮、按连接聚合的运维视图）需增强。
- 缺口（**P2，自动化**）：`automation_tasks` 目前 only `uses` 连接，**尚无「部署」步骤类型**——
  即还不能把「部署站点 X 到连接 Y」编排进定时/周期任务；重试/断点续传也待建。这是「工作连续性」的核心。

---

## 4. 推荐下一步（请确认后实施，遵循「先规划再编码」）

**P0（本轮即可做，零回归、纯增量）：部署前就绪检查命令 `site_deploy_check`**
- 复用既有 `preflight` + `resolve_binary` + 连接可达性测试，返回结构化
  `{ ok, issues[], arch?, binary?, dist?, connection? }`。
- 落点：`deploy_service.rs` 新增 `DeployService::check_readiness(db, site_id)`；
  `interface/commands/deploy.rs` 新增 `site_deploy_check` 并在 `lib.rs` `generate_handler!` 注册；
  `proto/cms.ts` + `cms.service.ts` 暴露类型与调用；`DeployDialog` 在「部署」前先跑检查并展示结论。
- 价值：直接命中用户「解决无法部署」——把模糊失败变为明确、可行动的提示。

**P0（验证）：真实云端冒烟**
- 提供一个 unix 或 linux 的远端 SSH 连接，跑一次 `site_deploy_check` + 一次 `site_deploy`，
  确认 end-to-end（含 `Other`/systemd/launchd 拉起与 healthz）。

**P1：终端↔站点打通**（一键开站点服务器终端 + 登记 terminal 资源并 link）。
**P1：部署历史运维视图增强**（日志/回滚/按连接聚合）。
**P1：新建向导强制「先构建 dist / 先环境检测」**。
**P2：自动化「部署」步骤类型 + 调度 + 失败重试/断点续传**（工作连续性）。

---

## 5. 本轮未改动代码的说明

本轮为**侦察 + 规划**：在 3722 行的 `deploy_service.rs`、资源/连接/部署仓储、前端向导与对话框之间
交叉核对后，确认底层重构已落地，故**不盲目重写可用代码**（遵守「非侵入式、无回归、范围纪律」）。
改码将在用户确认第 4 节 P0 方案后、按「四关验证（cargo check / tsc / vite build）+ 不自动 commit」推进。
