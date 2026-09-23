//! 部署故障诊断规则引擎
//!
//! 基于错误模式匹配的确定性诊断。覆盖 90% 以上的常见部署失败场景。
//! 规则按场景分组，每个规则接收诊断上下文，返回匹配到的诊断结果。
//!
//! 设计原则：
//! - 规则是纯函数，不产生副作用
//! - 高置信度（≥ 0.9）的规则可以直接触发自动修复
//! - 低置信度的规则只作为诊断建议，不自动修复

use crate::app::deploy_agent::types::{
    AlternativeCause, Diagnosis, EvidenceItem, FixAction, FixStep, RiskLevel,
};

/// 诊断输入：规则引擎的"原料"
///
/// 每个字段都是 Option / Vec — 不同阶段能收集到的信息不一样，
/// 规则只看自己关心的字段，拿不到就跳过。
#[derive(Debug, Clone, Default)]
pub struct DiagnosticInput {
    /// 失败的步骤标识（如 "db_setup"、"migrate"、"service_start"、"healthz"）
    pub failed_step: String,
    /// 原始错误信息
    pub error_message: String,
    /// 部署日志（完整或部分）
    pub deploy_log: String,
    /// journalctl 输出（如果收集了）
    pub journal_output: Option<String>,
    /// 前台手动启动输出（如果收集了）
    pub manual_start_output: Option<String>,
    /// systemctl status 输出
    pub systemctl_status: Option<String>,
    /// PostgreSQL 相关信息
    pub pg_info: Option<PgDiagnosticInfo>,
    /// 端口占用信息
    pub port_info: Option<PortDiagnosticInfo>,
    /// healthz 检查结果
    pub healthz_info: Option<HealthzDiagnosticInfo>,
    /// 迁移相关信息
    pub migration_info: Option<MigrationDiagnosticInfo>,
}

/// PostgreSQL 诊断信息
#[derive(Debug, Clone, Default)]
pub struct PgDiagnosticInfo {
    pub version: Option<String>,
    pub password_encryption: Option<String>,
    pub pg_hba_rules: Vec<String>,
    pub roles: Vec<String>,
    pub database_exists: Option<bool>,
    pub connection_works: Option<bool>,
}

/// 端口诊断信息
#[derive(Debug, Clone, Default)]
pub struct PortDiagnosticInfo {
    pub port: u16,
    pub is_occupied: bool,
    pub occupant: Option<String>,
}

/// healthz 诊断信息
#[derive(Debug, Clone, Default)]
pub struct HealthzDiagnosticInfo {
    pub http_code: String,
    pub response_body: Option<String>,
    pub connection_refused: bool,
}

/// 迁移诊断信息
#[derive(Debug, Clone, Default)]
pub struct MigrationDiagnosticInfo {
    pub failed_version: Option<String>,
    pub failed_name: Option<String>,
    pub db_error_detail: Option<String>,
    pub applied_migrations: Vec<String>,
}

/// 诊断规则
trait DiagnosticRule {
    /// 规则名称（用于调试和日志）
    fn name(&self) -> &'static str;

    /// 是否适用于当前失败步骤
    fn applies_to(&self, step: &str) -> bool;

    /// 尝试匹配，返回诊断结果
    fn diagnose(&self, input: &DiagnosticInput) -> Option<Diagnosis>;
}

// ─── 辅助函数 ────────────────────────────────────────────────────────

fn contains_any(haystack: &str, needles: &[&str]) -> bool {
    needles.iter().any(|n| haystack.to_lowercase().contains(&n.to_lowercase()))
}

fn ev(source: impl Into<String>, content: impl Into<String>) -> EvidenceItem {
    EvidenceItem {
        source: source.into(),
        content: content.into(),
    }
}

// ─── 1. PostgreSQL 认证失败规则 ──────────────────────────────────────

struct PgAuthMismatchRule;

impl DiagnosticRule for PgAuthMismatchRule {
    fn name(&self) -> &'static str {
        "pg_auth_mismatch"
    }

    fn applies_to(&self, step: &str) -> bool {
        step == "db_setup"
    }

    fn diagnose(&self, input: &DiagnosticInput) -> Option<Diagnosis> {
        let err = &input.error_message;
        if !contains_any(err, &["password authentication failed", "密码认证失败"]) {
            return None;
        }

        let pg = input.pg_info.as_ref()?;
        let enc = pg.password_encryption.as_deref()?;
        let enc_lower = enc.to_lowercase();

        let has_scram = pg.pg_hba_rules.iter().any(|r| {
            r.contains("scram-sha-256") && (r.contains("127.0.0.1") || r.contains("::1"))
        });
        let has_md5 = pg.pg_hba_rules.iter().any(|r| {
            r.contains("md5") && (r.contains("127.0.0.1") || r.contains("::1"))
        });

        // scram 规则 + md5 加密 → 不匹配
        if has_scram && enc_lower.contains("md5") && !has_md5 {
            return Some(Diagnosis {
                failed_step: input.failed_step.clone(),
                original_error: input.error_message.clone(),
                root_cause: "pg_hba.conf 配置了 scram-sha-256 认证方式，\
                    但 PostgreSQL 的 password_encryption 是 md5，密码哈希方式不匹配，导致认证失败。"
                    .into(),
                confidence: 0.95,
                evidence: vec![
                    ev("password_encryption", enc),
                    ev("pg_hba 规则", pg.pg_hba_rules.join("\n")),
                ],
                suggested_fix: Some(FixAction {
                    id: "pg_hba_md5_fix".into(),
                    description: "将 pg_hba.conf 中本地 TCP 连接的认证方式改为 md5，与 password_encryption 一致，然后 reload PostgreSQL。".into(),
                    risk_level: RiskLevel::Low,
                    steps: vec![
                        FixStep {
                            description: "修改 pg_hba.conf，将 127.0.0.1 和 ::1 的认证方式改为 md5".into(),
                            command: None,
                            executed: false,
                            result: None,
                        },
                        FixStep {
                            description: "reload PostgreSQL 使配置生效".into(),
                            command: None,
                            executed: false,
                            result: None,
                        },
                    ],
                }),
                alternatives: vec![],
                engine: "rule",
            });
        }

        // md5 规则 + scram 加密 → 不匹配
        if has_md5 && enc_lower.contains("scram") && !has_scram {
            return Some(Diagnosis {
                failed_step: input.failed_step.clone(),
                original_error: input.error_message.clone(),
                root_cause: "pg_hba.conf 配置了 md5 认证方式，\
                    但 PostgreSQL 的 password_encryption 是 scram-sha-256，密码哈希方式不匹配，导致认证失败。"
                    .into(),
                confidence: 0.95,
                evidence: vec![
                    ev("password_encryption", enc),
                    ev("pg_hba 规则", pg.pg_hba_rules.join("\n")),
                ],
                suggested_fix: Some(FixAction {
                    id: "pg_hba_scram_fix".into(),
                    description: "将 pg_hba.conf 中本地 TCP 连接的认证方式改为 scram-sha-256，与 password_encryption 一致，然后 reload PostgreSQL。".into(),
                    risk_level: RiskLevel::Low,
                    steps: vec![
                        FixStep {
                            description: "修改 pg_hba.conf，将 127.0.0.1 和 ::1 的认证方式改为 scram-sha-256".into(),
                            command: None,
                            executed: false,
                            result: None,
                        },
                        FixStep {
                            description: "reload PostgreSQL 使配置生效".into(),
                            command: None,
                            executed: false,
                            result: None,
                        },
                    ],
                }),
                alternatives: vec![],
                engine: "rule",
            });
        }

        None
    }
}

// ─── 2. PostgreSQL 密码错误规则 ──────────────────────────────────────

struct PgWrongPasswordRule;

impl DiagnosticRule for PgWrongPasswordRule {
    fn name(&self) -> &'static str {
        "pg_wrong_password"
    }

    fn applies_to(&self, step: &str) -> bool {
        step == "db_setup"
    }

    fn diagnose(&self, input: &DiagnosticInput) -> Option<Diagnosis> {
        let err = &input.error_message;
        if !contains_any(err, &["password authentication failed"]) {
            return None;
        }

        let pg = input.pg_info.as_ref()?;
        let enc = pg.password_encryption.as_deref().unwrap_or("");

        // 密码认证失败，但 pg_hba 和加密方式是匹配的 → 可能是密码本身不对
        let has_matching_md5 =
            enc.to_lowercase().contains("md5") && pg.pg_hba_rules.iter().any(|r| r.contains("md5"));
        let has_matching_scram =
            enc.to_lowercase().contains("scram") && pg.pg_hba_rules.iter().any(|r| r.contains("scram"));

        if has_matching_md5 || has_matching_scram {
            return Some(Diagnosis {
                failed_step: input.failed_step.clone(),
                original_error: input.error_message.clone(),
                root_cause: "PostgreSQL 密码认证失败。认证方式与 password_encryption 配置一致，\
                    大概率是密码本身不匹配（可能是旧密码残留、或者密码设置时出了问题）。"
                    .into(),
                confidence: 0.8,
                evidence: vec![
                    ev("password_encryption", enc.to_string()),
                    ev("pg_hba 规则", pg.pg_hba_rules.join("\n")),
                ],
                suggested_fix: Some(FixAction {
                    id: "pg_reset_password".into(),
                    description: "通过 peer 认证方式（sudo -u postgres）重置 postgres 用户的密码。".into(),
                    risk_level: RiskLevel::Low,
                    steps: vec![FixStep {
                        description: "重置 postgres 密码".into(),
                        command: None,
                        executed: false,
                        result: None,
                    }],
                }),
                alternatives: vec![
                    AlternativeCause {
                        description: "pg_hba.conf 中存在更优先的 peer/ident 规则拦截了密码认证".into(),
                        confidence: 0.3,
                    },
                    AlternativeCause {
                        description: "连接的不是预期的 PostgreSQL 实例（多实例端口混淆）".into(),
                        confidence: 0.2,
                    },
                ],
                engine: "rule",
            });
        }

        None
    }
}

// ─── 3. 数据库已存在规则 ────────────────────────────────────────────

struct PgDbExistsRule;

impl DiagnosticRule for PgDbExistsRule {
    fn name(&self) -> &'static str {
        "pg_db_exists"
    }

    fn applies_to(&self, step: &str) -> bool {
        step == "db_setup"
    }

    fn diagnose(&self, input: &DiagnosticInput) -> Option<Diagnosis> {
        if !contains_any(&input.error_message, &["database \"", "already exists", "数据库已存在"]) {
            return None;
        }

        Some(Diagnosis {
            failed_step: input.failed_step.clone(),
            original_error: input.error_message.clone(),
            root_cause: "目标数据库已经存在。这通常不是错误——可能是之前部署时创建的，\
                或者是手动创建的。只需要验证数据库可用即可继续部署。"
                .into(),
            confidence: 0.9,
            evidence: vec![],
            suggested_fix: Some(FixAction {
                id: "pg_skip_create_db".into(),
                description: "跳过数据库创建步骤，直接验证现有数据库是否可用。".into(),
                risk_level: RiskLevel::Low,
                steps: vec![FixStep {
                    description: "验证现有数据库连接".into(),
                    command: None,
                    executed: false,
                    result: None,
                }],
            }),
            alternatives: vec![
                AlternativeCause {
                    description: "数据库是别的应用创建的，表结构可能冲突".into(),
                    confidence: 0.3,
                },
            ],
            engine: "rule",
        })
    }
}

// ─── 4. 迁移错误：表/列已存在 ────────────────────────────────────────

struct MigrationAlreadyExistsRule;

impl DiagnosticRule for MigrationAlreadyExistsRule {
    fn name(&self) -> &'static str {
        "migration_already_exists"
    }

    fn applies_to(&self, step: &str) -> bool {
        step == "migrate"
    }

    fn diagnose(&self, input: &DiagnosticInput) -> Option<Diagnosis> {
        if !contains_any(&input.error_message, &["already exists", "relation", "duplicate key"]) {
            return None;
        }

        let mig = input.migration_info.as_ref();
        let version = mig.and_then(|m| m.failed_version.clone()).unwrap_or_default();
        let name = mig.and_then(|m| m.failed_name.clone()).unwrap_or_default();

        Some(Diagnosis {
            failed_step: input.failed_step.clone(),
            original_error: input.error_message.clone(),
            root_cause: format!(
                "数据库迁移 [{}] {} 失败：表/列/约束已存在。\
                这通常意味着迁移之前被部分执行过（比如上次迁移中断了），\
                或者数据库里已经有同名的表。",
                version, name
            ),
            confidence: 0.75,
            evidence: mig
                .and_then(|m| m.db_error_detail.clone())
                .map(|d| vec![ev("PostgreSQL 错误详情", d)])
                .unwrap_or_default(),
            suggested_fix: None, // 不能自动修，需要人工判断
            alternatives: vec![
                AlternativeCause {
                    description: "迁移记录表里没有记录，但表实际已存在（手动建过表）".into(),
                    confidence: 0.5,
                },
                AlternativeCause {
                    description: "上次迁移中断，事务没回滚干净".into(),
                    confidence: 0.4,
                },
            ],
            engine: "rule",
        })
    }
}

// ─── 5. 迁移错误：权限不足 ──────────────────────────────────────────

struct MigrationPermissionRule;

impl DiagnosticRule for MigrationPermissionRule {
    fn name(&self) -> &'static str {
        "migration_permission_denied"
    }

    fn applies_to(&self, step: &str) -> bool {
        step == "migrate"
    }

    fn diagnose(&self, input: &DiagnosticInput) -> Option<Diagnosis> {
        if !contains_any(&input.error_message, &["permission denied", "must be owner", "insufficient privilege"]) {
            return None;
        }

        Some(Diagnosis {
            failed_step: input.failed_step.clone(),
            original_error: input.error_message.clone(),
            root_cause: "数据库迁移失败：权限不足。数据库用户没有创建表/修改 schema 的权限，\
                或者表的所有者不是当前用户。".into(),
            confidence: 0.9,
            evidence: vec![],
            suggested_fix: Some(FixAction {
                id: "pg_grant_permissions".into(),
                description: "给数据库用户授予 schema 所有权和全部权限。".into(),
                risk_level: RiskLevel::Medium,
                steps: vec![FixStep {
                    description: "授予 schema 和表的所有权/权限".into(),
                    command: None,
                    executed: false,
                    result: None,
                }],
            }),
            alternatives: vec![],
            engine: "rule",
        })
    }
}

// ─── 6. 迁移错误：列不存在 / 字段缺失 ───────────────────────────────

struct MigrationMissingColumnRule;

impl DiagnosticRule for MigrationMissingColumnRule {
    fn name(&self) -> &'static str {
        "migration_missing_column"
    }

    fn applies_to(&self, step: &str) -> bool {
        step == "migrate"
    }

    fn diagnose(&self, input: &DiagnosticInput) -> Option<Diagnosis> {
        let err_detail = input
            .migration_info
            .as_ref()
            .and_then(|m| m.db_error_detail.clone())
            .unwrap_or_else(|| input.error_message.clone());

        if !contains_any(&err_detail, &["column", "does not exist", "不存在"]) {
            return None;
        }

        Some(Diagnosis {
            failed_step: input.failed_step.clone(),
            original_error: input.error_message.clone(),
            root_cause: "数据库迁移失败：引用了不存在的列。\
                这通常是迁移 SQL 写错了——INSERT/UPDATE 引用了表定义里没有的字段，\
                或者上一个迁移没执行成功导致缺表/缺列。".into(),
            confidence: 0.85,
            evidence: vec![ev("PostgreSQL 错误详情", err_detail)],
            suggested_fix: None, // 代码 bug，不能自动修
            alternatives: vec![
                AlternativeCause {
                    description: "迁移顺序不对，后面的迁移引用了前面还没建的列".into(),
                    confidence: 0.4,
                },
            ],
            engine: "rule",
        })
    }
}

// ─── 7. 服务启动：端口被占用 ────────────────────────────────────────

struct PortOccupiedRule;

impl DiagnosticRule for PortOccupiedRule {
    fn name(&self) -> &'static str {
        "port_occupied"
    }

    fn applies_to(&self, step: &str) -> bool {
        step == "service_start" || step == "healthz"
    }

    fn diagnose(&self, input: &DiagnosticInput) -> Option<Diagnosis> {
        let port_info = input.port_info.as_ref()?;
        if !port_info.is_occupied {
            return None;
        }

        let occupant = port_info
            .occupant
            .clone()
            .unwrap_or_else(|| "未知进程".into());

        // 判断是不是 Nginx 自己占着端口（上一个版本的进程）
        // 这种情况下端口占用是结果不是原因——是因为新版本起不来，旧版本还在跑
        let is_own_service = occupant.to_lowercase().contains("nginx");

        // 如果日志里有更根本的错误（panic、配置缺失等），
        // 端口占用大概率是副作用，不是根因，置信度大幅降低
        let has_deeper_error = contains_any(
            &input
                .journal_output
                .clone()
                .unwrap_or_default(),
            &["panic", "panicked", "thread 'main'"],
        ) || contains_any(
            &input
                .manual_start_output
                .clone()
                .unwrap_or_default(),
            &["panic", "panicked", "thread 'main'", "missing field"],
        );

        let confidence = if is_own_service {
            // 自己占的，几乎可以确定不是根因
            0.2
        } else if has_deeper_error {
            // 有更深层错误，端口占用可能是副作用
            0.5
        } else {
            // 被其他进程占了，高置信度
            0.95
        };

        let root_cause = if is_own_service {
            format!(
                "端口 {} 被 Nginx 旧版本进程占用（{}）。\
                这通常不是根因——而是新版本启动失败后，旧版本仍在运行的表现。\
                请查看日志中的 panic / error 信息找真正原因。",
                port_info.port, occupant
            )
        } else {
            format!(
                "端口 {} 已被其他进程占用（{}），服务无法绑定该端口。",
                port_info.port, occupant
            )
        };

        Some(Diagnosis {
            failed_step: input.failed_step.clone(),
            original_error: input.error_message.clone(),
            root_cause,
            confidence,
            evidence: vec![ev("端口占用进程", occupant)],
            suggested_fix: if is_own_service {
                None // 自己占的，不用给修复方案，让别的规则来
            } else {
                Some(FixAction {
                    id: "port_conflict".into(),
                    description: format!("端口 {} 被占用，建议：1）更换服务端口；2）杀掉占用进程（高风险）。", port_info.port),
                    risk_level: RiskLevel::High,
                    steps: vec![FixStep {
                        description: "确认占用进程并选择处理方式".into(),
                        command: None,
                        executed: false,
                        result: None,
                    }],
                })
            },
            alternatives: vec![],
            engine: "rule",
        })
    }
}

// ─── 8. 服务启动：panic / 崩溃 ─────────────────────────────────────

struct ServicePanicRule;

impl DiagnosticRule for ServicePanicRule {
    fn name(&self) -> &'static str {
        "service_panic"
    }

    fn applies_to(&self, step: &str) -> bool {
        step == "service_start"
    }

    fn diagnose(&self, input: &DiagnosticInput) -> Option<Diagnosis> {
        let log_text = input
            .journal_output
            .as_deref()
            .or_else(|| input.manual_start_output.as_deref())
            .unwrap_or("");

        if !contains_any(log_text, &["panic", "panicked", "thread 'main'"]) {
            return None;
        }

        // 提取 panic 消息行
        let panic_line = log_text
            .lines()
            .find(|l| l.contains("panic") || l.contains("panicked"))
            .unwrap_or("")
            .trim()
            .to_string();

        // 提取完整的 panic 消息（包括下一行的具体错误内容）
        let mut panic_lines: Vec<String> = Vec::new();
        let mut capture = false;
        for line in log_text.lines() {
            if line.contains("panic") || line.contains("panicked") {
                capture = true;
            }
            if capture {
                panic_lines.push(line.trim().to_string());
                if panic_lines.len() >= 5 {
                    break;
                }
            }
        }
        let panic_full = panic_lines.join("\n");

        // 检查是否是路由加载器的 panic（router/loader.rs）
        let is_router_panic = log_text.contains("router/loader.rs")
            || log_text.contains("route collision")
            || log_text.contains("overlapping route")
            || log_text.contains("路由");

        let (root_cause, confidence, suggested_fix, alternatives) = if is_router_panic {
            // 进一步判断路由 panic 的具体原因
            let is_static_wildcard = log_text.contains("static.serve")
                || log_text.contains("/*path")
                || log_text.contains("静态文件");

            let is_duplicate_route = log_text.contains("duplicate")
                || log_text.contains("重复")
                || log_text.contains("already exists");

            let cause = if is_static_wildcard {
                "路由加载器 panic：静态文件服务的通配路径（/*path）与其他路由冲突。\
                这通常是因为 sys_routes 表中配置了多条 static.serve 路由，\
                或者 static.serve 路由的路径与 API 路由重叠。".to_string()
            } else if is_duplicate_route {
                "路由加载器 panic：数据库中存在重复的路由配置（相同 method + path），\
                导致 axum 路由注册时冲突。".to_string()
            } else {
                format!(
                    "路由加载器 panic（router/loader.rs）：路由注册时发生冲突。\n\
                    panic 信息：{}",
                    panic_line
                )
            };

            let fix = Some(FixAction {
                id: "router_panic_db_fix".into(),
                description: "检查并清理 sys_routes 表中的重复/冲突路由配置，\
                    特别是 static.serve 类型的路由（会额外注册 /*path 通配路径）。\
                    建议：删除重复路由，确保 static.serve 路由只有一条且路径为 /。".into(),
                risk_level: RiskLevel::Medium,
                steps: vec![
                    FixStep {
                        description: "登录数据库，查询 sys_routes 表".into(),
                        command: Some("SELECT method, path, handler, enabled, sort_order FROM sys_routes ORDER BY sort_order, id;".into()),
                        executed: false,
                        result: None,
                    },
                    FixStep {
                        description: "检查是否有重复的 (method, path) 组合".into(),
                        command: Some("SELECT method, path, COUNT(*) as cnt FROM sys_routes WHERE enabled = true GROUP BY method, path HAVING COUNT(*) > 1;".into()),
                        executed: false,
                        result: None,
                    },
                    FixStep {
                        description: "检查是否有多条 static.serve 路由（会产生通配路径冲突）".into(),
                        command: Some("SELECT * FROM sys_routes WHERE handler = 'static.serve' AND enabled = true;".into()),
                        executed: false,
                        result: None,
                    },
                    FixStep {
                        description: "删除或禁用重复/冲突的路由，只保留一条 static.serve 且 sort_order 最大".into(),
                        command: Some("-- 根据查询结果手动处理".into()),
                        executed: false,
                        result: None,
                    },
                ],
            });

            let mut alts = vec![
                AlternativeCause {
                    description: "数据库中 sys_routes 表数据异常（重复路由或路径冲突）".into(),
                    confidence: 0.7,
                },
                AlternativeCause {
                    description: "静态文件通配路径 /*path 与 API 路由重叠".into(),
                    confidence: 0.6,
                },
            ];
            if is_static_wildcard {
                alts.reverse(); // 静态文件冲突的可能性更高
            }

            (cause, 0.92, fix, alts)
        } else {
            // 通用 panic
            (
                format!("服务启动时发生 panic（崩溃）。错误信息：{}", panic_line),
                0.95,
                None,
                vec![
                    AlternativeCause {
                        description: "配置文件格式错误导致解析 panic".into(),
                        confidence: 0.4,
                    },
                    AlternativeCause {
                        description: "依赖的外部资源（数据库/Redis）连不上导致启动 panic".into(),
                        confidence: 0.3,
                    },
                    AlternativeCause {
                        description: "代码 bug 导致的启动崩溃".into(),
                        confidence: 0.2,
                    },
                ],
            )
        };

        Some(Diagnosis {
            failed_step: input.failed_step.clone(),
            original_error: input.error_message.clone(),
            root_cause,
            confidence,
            evidence: vec![ev("panic 输出", panic_full)],
            suggested_fix,
            alternatives,
            engine: "rule",
        })
    }
}

// ─── 9. 服务启动：配置缺失字段 ──────────────────────────────────────

struct ConfigMissingFieldRule;

impl DiagnosticRule for ConfigMissingFieldRule {
    fn name(&self) -> &'static str {
        "config_missing_field"
    }

    fn applies_to(&self, step: &str) -> bool {
        step == "service_start"
    }

    fn diagnose(&self, input: &DiagnosticInput) -> Option<Diagnosis> {
        let log_text = input
            .manual_start_output
            .as_deref()
            .or_else(|| input.journal_output.as_deref())
            .unwrap_or("");

        if !contains_any(log_text, &["missing field", "no field", "未找到字段"]) {
            return None;
        }

        // 提取字段名
        let field_line = log_text
            .lines()
            .find(|l| l.contains("missing field") || l.contains("no field"))
            .unwrap_or("")
            .trim()
            .to_string();

        Some(Diagnosis {
            failed_step: input.failed_step.clone(),
            original_error: input.error_message.clone(),
            root_cause: format!("server.toml 配置缺少必填字段：{}", field_line),
            confidence: 0.9,
            evidence: vec![ev("错误行", field_line)],
            suggested_fix: Some(FixAction {
                id: "config_add_missing_field".into(),
                description: "在 server.toml 中补全缺失的配置字段，使用默认值。".into(),
                risk_level: RiskLevel::Medium,
                steps: vec![FixStep {
                    description: "补全缺失的配置字段".into(),
                    command: None,
                    executed: false,
                    result: None,
                }],
            }),
            alternatives: vec![],
            engine: "rule",
        })
    }
}

// ─── 10. healthz：404 路由未注册 ────────────────────────────────────

struct Healthz404Rule;

impl DiagnosticRule for Healthz404Rule {
    fn name(&self) -> &'static str {
        "healthz_404"
    }

    fn applies_to(&self, step: &str) -> bool {
        step == "healthz"
    }

    fn diagnose(&self, input: &DiagnosticInput) -> Option<Diagnosis> {
        let hz = input.healthz_info.as_ref()?;
        if hz.http_code != "404" {
            return None;
        }

        Some(Diagnosis {
            failed_step: input.failed_step.clone(),
            original_error: input.error_message.clone(),
            root_cause: "/healthz 端点返回 404。这意味着服务虽然启动了，但健康检查路由没有注册成功。\
                常见原因：路由表为空（数据库迁移失败导致没有路由）、中间件拦截了请求、\
                或者服务版本不兼容。"
                .into(),
            confidence: 0.8,
            evidence: vec![ev("HTTP 状态码", hz.http_code.clone())],
            suggested_fix: None,
            alternatives: vec![
                AlternativeCause {
                    description: "数据库迁移失败，sys_routes 表为空或不存在".into(),
                    confidence: 0.7,
                },
                AlternativeCause {
                    description: "服务启动了但路由加载器 panic 了".into(),
                    confidence: 0.4,
                },
                AlternativeCause {
                    description: "healthz 路径被中间件（如认证中间件）拦截".into(),
                    confidence: 0.3,
                },
            ],
            engine: "rule",
        })
    }
}

// ─── 11. healthz：连接被拒绝 ───────────────────────────────────────

struct HealthzConnRefusedRule;

impl DiagnosticRule for HealthzConnRefusedRule {
    fn name(&self) -> &'static str {
        "healthz_connection_refused"
    }

    fn applies_to(&self, step: &str) -> bool {
        step == "healthz"
    }

    fn diagnose(&self, input: &DiagnosticInput) -> Option<Diagnosis> {
        let hz = input.healthz_info.as_ref()?;
        if !hz.connection_refused {
            return None;
        }

        Some(Diagnosis {
            failed_step: input.failed_step.clone(),
            original_error: input.error_message.clone(),
            root_cause: "healthz 连接被拒绝。服务根本没有在监听端口——\
                要么是服务启动后立即崩溃了，要么是端口配置不对，要么是服务压根没起来。"
                .into(),
            confidence: 0.9,
            evidence: vec![],
            suggested_fix: None,
            alternatives: vec![
                AlternativeCause {
                    description: "服务启动后立即 panic/崩溃".into(),
                    confidence: 0.7,
                },
                AlternativeCause {
                    description: "端口配置错误，服务监听的端口不是检测的端口".into(),
                    confidence: 0.4,
                },
                AlternativeCause {
                    description: "systemd 服务没有真正启动（exec 路径错了）".into(),
                    confidence: 0.3,
                },
            ],
            engine: "rule",
        })
    }
}

// ─── 12. healthz：500 内部错误 ─────────────────────────────────────

struct Healthz500Rule;

impl DiagnosticRule for Healthz500Rule {
    fn name(&self) -> &'static str {
        "healthz_500"
    }

    fn applies_to(&self, step: &str) -> bool {
        step == "healthz"
    }

    fn diagnose(&self, input: &DiagnosticInput) -> Option<Diagnosis> {
        let hz = input.healthz_info.as_ref()?;
        if !["500", "502", "503"].contains(&hz.http_code.as_str()) {
            return None;
        }

        Some(Diagnosis {
            failed_step: input.failed_step.clone(),
            original_error: input.error_message.clone(),
            root_cause: format!(
                "/healthz 返回 HTTP {}。服务在运行但内部出错了——\
                很可能是数据库连不上、Redis 连不上、或者其他依赖出了问题。",
                hz.http_code
            ),
            confidence: 0.75,
            evidence: vec![
                ev("HTTP 状态码", hz.http_code.clone()),
                ev("响应体", hz.response_body.clone().unwrap_or_default()),
            ],
            suggested_fix: None,
            alternatives: vec![
                AlternativeCause {
                    description: "数据库连接池耗尽或连接失败".into(),
                    confidence: 0.6,
                },
                AlternativeCause {
                    description: "Redis 连接失败".into(),
                    confidence: 0.4,
                },
                AlternativeCause {
                    description: "健康检查逻辑本身有 bug".into(),
                    confidence: 0.2,
                },
            ],
            engine: "rule",
        })
    }
}

// ─── 13. Nginx 配置语法错误 ────────────────────────────────────────

struct NginxConfigSyntaxRule;

impl DiagnosticRule for NginxConfigSyntaxRule {
    fn name(&self) -> &'static str {
        "nginx_syntax_error"
    }

    fn applies_to(&self, step: &str) -> bool {
        step == "nginx"
    }

    fn diagnose(&self, input: &DiagnosticInput) -> Option<Diagnosis> {
        if !contains_any(&input.error_message, &["nginx -t", "test failed", "syntax is wrong", "emerg"]) {
            return None;
        }

        Some(Diagnosis {
            failed_step: input.failed_step.clone(),
            original_error: input.error_message.clone(),
            root_cause: "Nginx 配置语法错误。nginx -t 测试未通过，\
                说明生成的 Nginx 配置文件有语法问题。".into(),
            confidence: 0.9,
            evidence: vec![],
            suggested_fix: Some(FixAction {
                id: "nginx_rollback".into(),
                description: "回滚 Nginx 配置，跳过 Nginx 步骤，不影响服务本身运行。".into(),
                risk_level: RiskLevel::Low,
                steps: vec![FixStep {
                    description: "删除新生成的 Nginx 配置，reload nginx".into(),
                    command: None,
                    executed: false,
                    result: None,
                }],
            }),
            alternatives: vec![],
            engine: "rule",
        })
    }
}

// ─── 规则注册表 ──────────────────────────────────────────────────────

/// 获取所有诊断规则（按优先级排序，高置信度的在前）
fn all_rules() -> Vec<Box<dyn DiagnosticRule + Send + Sync>> {
    vec![
        // 端口占用（最容易确认，置信度最高）
        Box::new(PortOccupiedRule),
        // PostgreSQL 认证不匹配
        Box::new(PgAuthMismatchRule),
        // PostgreSQL 密码错误
        Box::new(PgWrongPasswordRule),
        // 数据库已存在
        Box::new(PgDbExistsRule),
        // 服务 panic
        Box::new(ServicePanicRule),
        // 配置缺失字段
        Box::new(ConfigMissingFieldRule),
        // 迁移权限不足
        Box::new(MigrationPermissionRule),
        // 迁移列不存在
        Box::new(MigrationMissingColumnRule),
        // 迁移表/列已存在
        Box::new(MigrationAlreadyExistsRule),
        // healthz 连接被拒绝
        Box::new(HealthzConnRefusedRule),
        // healthz 404
        Box::new(Healthz404Rule),
        // healthz 5xx
        Box::new(Healthz500Rule),
        // Nginx 语法错误
        Box::new(NginxConfigSyntaxRule),
    ]
}

/// 运行规则引擎，返回匹配到的所有诊断结果（按置信度降序）
pub fn run_diagnostic_rules(input: &DiagnosticInput) -> Vec<Diagnosis> {
    let mut results: Vec<Diagnosis> = all_rules()
        .iter()
        .filter(|r| r.applies_to(&input.failed_step))
        .filter_map(|r| r.diagnose(input))
        .collect();

    // 按置信度降序
    results.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap_or(std::cmp::Ordering::Equal));
    results
}

/// 获取最佳诊断结果（置信度最高的那个），如果没有匹配则返回 None
pub fn best_diagnosis(input: &DiagnosticInput) -> Option<Diagnosis> {
    run_diagnostic_rules(input).into_iter().next()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pg_auth_mismatch() {
        let input = DiagnosticInput {
            failed_step: "db_setup".into(),
            error_message: "password authentication failed for user \"postgres\"".into(),
            pg_info: Some(PgDiagnosticInfo {
                password_encryption: Some("md5".into()),
                pg_hba_rules: vec![
                    "host all all 127.0.0.1/32 scram-sha-256".into(),
                    "host all all ::1/128 scram-sha-256".into(),
                ],
                ..Default::default()
            }),
            ..Default::default()
        };

        let diag = best_diagnosis(&input).expect("should match");
        assert!(diag.confidence > 0.9);
        assert!(diag.root_cause.contains("不匹配"));
        assert!(diag.suggested_fix.is_some());
    }

    #[test]
    fn test_port_occupied() {
        let input = DiagnosticInput {
            failed_step: "service_start".into(),
            error_message: "服务启动超时".into(),
            port_info: Some(PortDiagnosticInfo {
                port: 18080,
                is_occupied: true,
                occupant: Some("java".into()),
            }),
            ..Default::default()
        };

        let diag = best_diagnosis(&input).expect("should match");
        assert!(diag.confidence >= 0.95);
        assert!(diag.root_cause.contains("占用"));
    }

    #[test]
    fn test_healthz_404() {
        let input = DiagnosticInput {
            failed_step: "healthz".into(),
            error_message: "healthz returned 404".into(),
            healthz_info: Some(HealthzDiagnosticInfo {
                http_code: "404".into(),
                response_body: None,
                connection_refused: false,
            }),
            ..Default::default()
        };

        let diag = best_diagnosis(&input).expect("should match");
        assert!(diag.root_cause.contains("404"));
    }

    #[test]
    fn test_no_match_returns_none() {
        let input = DiagnosticInput {
            failed_step: "upload".into(),
            error_message: "sftp connection failed".into(),
            ..Default::default()
        };

        assert!(best_diagnosis(&input).is_none());
    }

    #[test]
    fn test_migration_missing_column() {
        let input = DiagnosticInput {
            failed_step: "migrate".into(),
            error_message: "migration failed".into(),
            migration_info: Some(MigrationDiagnosticInfo {
                failed_version: Some("001".into()),
                failed_name: Some("init".into()),
                db_error_detail: Some("column \"description\" of relation \"sys_routes\" does not exist".into()),
                ..Default::default()
            }),
            ..Default::default()
        };

        let diag = best_diagnosis(&input).expect("should match");
        assert!(diag.root_cause.contains("不存在的列"));
    }
}
