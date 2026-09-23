/// 版本化迁移（docs/cms-database-design.md §3）。
///
/// 规则：
/// - 每个版本号对应一个只追加、不修改的迁移步骤；禁止改动已发布版本的函数
/// - 新增表/列 = SCHEMA_VERSION + 1，并追加新的 `if current < N` 分支
/// - v1 是版本化机制引入前的存量逻辑收编（v1_initialize + v1_migrate），其内部
///   已含自管理事务，因此不包外层事务；v2 起每个版本在单事务内执行
use rusqlite::Connection;

use crate::core::error::{Error, Result};

/// 当前 schema 版本。新增迁移步骤时 +1。
const SCHEMA_VERSION: i64 = 17;

pub fn run_migrations(conn: &mut Connection) -> Result<()> {
    let current: i64 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap_or(0);

    if current > SCHEMA_VERSION {
        // 来自更新版本二进制的库被当前版本打开：拒绝降级，避免把新库误判为待迁移
        return Err(Error::Internal(format!(
            "database schema version {} is newer than supported {}",
            current, SCHEMA_VERSION
        )));
    }

    tracing::info!(
        "[migrations] schema version {} -> {}",
        current,
        SCHEMA_VERSION
    );

    if current < 1 {
        super::database::Database::v1_initialize(conn)?;
        super::database::Database::v1_migrate(conn)?;
        set_version(conn, 1)?;
    }
    if current < 2 {
        let tx = conn.transaction()?;
        create_cms_tables(&tx)?;
        set_version(&tx, 2)?;
        tx.commit()?;
    }
    if current < 3 {
        let tx = conn.transaction()?;
        create_ops_tables(&tx)?;
        set_version(&tx, 3)?;
        tx.commit()?;
    }
    if current < 4 {
        let tx = conn.transaction()?;
        create_automation_tables(&tx)?;
        set_version(&tx, 4)?;
        tx.commit()?;
    }
    if current < 5 {
        let tx = conn.transaction()?;
        create_ops_run_tables(&tx)?;
        set_version(&tx, 5)?;
        tx.commit()?;
    }
    if current < 6 {
        let tx = conn.transaction()?;
        migrate_ai_agent_columns(&tx)?;
        set_version(&tx, 6)?;
        tx.commit()?;
    }
    if current < 7 {
        let tx = conn.transaction()?;
        migrate_site_db_type(&tx)?;
        set_version(&tx, 7)?;
        tx.commit()?;
    }
    if current < 8 {
        let tx = conn.transaction()?;
        create_permission_requests_table(&tx)?;
        set_version(&tx, 8)?;
        tx.commit()?;
    }
    if current < 9 {
        let tx = conn.transaction()?;
        migrate_conversation_status(&tx)?;
        set_version(&tx, 9)?;
        tx.commit()?;
    }
    if current < 10 {
        let tx = conn.transaction()?;
        migrate_conversation_message_count(&tx)?;
        set_version(&tx, 10)?;
        tx.commit()?;
    }
    if current < 11 {
        let tx = conn.transaction()?;
        migrate_deployments_v2(&tx)?;
        set_version(&tx, 11)?;
        tx.commit()?;
    }
    if current < 12 {
        let tx = conn.transaction()?;
        create_resource_tables(&tx)?;
        set_version(&tx, 12)?;
        tx.commit()?;
    }
    if current < 13 {
        let tx = conn.transaction()?;
        migrate_automation_schedule(&tx)?;
        set_version(&tx, 13)?;
        tx.commit()?;
    }
    if current < 14 {
        let tx = conn.transaction()?;
        migrate_content_blocks(&tx)?;
        set_version(&tx, 14)?;
        tx.commit()?;
    }
    if current < 15 {
        let tx = conn.transaction()?;
        create_scene_tables(&tx)?;
        set_version(&tx, 15)?;
        tx.commit()?;
    }
    if current < 16 {
        let tx = conn.transaction()?;
        migrate_scene_published_at(&tx)?;
        set_version(&tx, 16)?;
        tx.commit()?;
    }
    if current < 17 {
        let tx = conn.transaction()?;
        create_site_domains_table(&tx)?;
        set_version(&tx, 17)?;
        tx.commit()?;
    }

    Ok(())
}

fn set_version(conn: &Connection, version: i64) -> Result<()> {
    conn.pragma_update(None, "user_version", version).map_err(|e| {
        Error::Internal(format!("failed to set user_version = {}: {}", version, e))
    })
}

/// v2：CMS 表（docs/cms-database-design.md §2，7 张表）
fn create_cms_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS sites (
            id                 TEXT PRIMARY KEY,
            name               TEXT NOT NULL,
            domain             TEXT NOT NULL DEFAULT '',
            local_workdir      TEXT NOT NULL,
            connection_id      TEXT,
            deploy_config_json TEXT NOT NULL DEFAULT '{}',
            build_config_json  TEXT NOT NULL DEFAULT '{}',
            theme_id           TEXT NOT NULL DEFAULT 'craft-blog',
            theme_config_json  TEXT NOT NULL DEFAULT '{}',
            status             TEXT NOT NULL DEFAULT 'active',
            last_deployed_at   INTEGER,
            created_at         INTEGER NOT NULL,
            updated_at         INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sites_connection ON sites(connection_id);

        CREATE TABLE IF NOT EXISTS contents (
            id                TEXT PRIMARY KEY,
            site_id           TEXT NOT NULL,
            type              TEXT NOT NULL DEFAULT 'post',
            title             TEXT NOT NULL,
            slug              TEXT NOT NULL,
            category          TEXT NOT NULL DEFAULT '',
            summary           TEXT NOT NULL DEFAULT '',
            cover_media_id    TEXT,
            content_json      TEXT NOT NULL DEFAULT '',
            content_md        TEXT NOT NULL DEFAULT '',
            content_hash      TEXT NOT NULL DEFAULT '',
            seo_title         TEXT NOT NULL DEFAULT '',
            seo_description   TEXT NOT NULL DEFAULT '',
            og_image_media_id TEXT,
            status            TEXT NOT NULL DEFAULT 'draft',
            scheduled_at      INTEGER,
            published_at      INTEGER,
            pinned            INTEGER NOT NULL DEFAULT 0,
            deleted_at        INTEGER,
            created_at        INTEGER NOT NULL,
            updated_at        INTEGER NOT NULL,
            FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_contents_slug
            ON contents(site_id, type, slug) WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_contents_site_status
            ON contents(site_id, status, deleted_at, published_at DESC);
        CREATE INDEX IF NOT EXISTS idx_contents_scheduled ON contents(status, scheduled_at);

        CREATE TABLE IF NOT EXISTS content_versions (
            id            TEXT PRIMARY KEY,
            content_id    TEXT NOT NULL,
            version_no    INTEGER NOT NULL,
            snapshot_json TEXT NOT NULL,
            trigger       TEXT NOT NULL DEFAULT 'manual',
            comment       TEXT NOT NULL DEFAULT '',
            created_at    INTEGER NOT NULL,
            FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE,
            UNIQUE (content_id, version_no)
        );

        CREATE TABLE IF NOT EXISTS content_tags (
            id      TEXT PRIMARY KEY,
            site_id TEXT NOT NULL,
            name    TEXT NOT NULL,
            FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
            UNIQUE (site_id, name)
        );

        CREATE TABLE IF NOT EXISTS content_tag_links (
            content_id TEXT NOT NULL,
            tag_id     TEXT NOT NULL,
            PRIMARY KEY (content_id, tag_id),
            FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES content_tags(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS deployments (
            id             TEXT PRIMARY KEY,
            site_id        TEXT NOT NULL,
            trigger_type   TEXT NOT NULL,
            target_env     TEXT NOT NULL DEFAULT 'production',
            status         TEXT NOT NULL,
            started_at     INTEGER NOT NULL,
            finished_at    INTEGER,
            duration_ms    INTEGER,
            uploaded_count INTEGER NOT NULL DEFAULT 0,
            deleted_count  INTEGER NOT NULL DEFAULT 0,
            total_bytes    INTEGER NOT NULL DEFAULT 0,
            error_summary  TEXT NOT NULL DEFAULT '',
            manifest_json  TEXT NOT NULL DEFAULT '[]',
            FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_deployments_site ON deployments(site_id, started_at DESC);

        CREATE TABLE IF NOT EXISTS media_assets (
            id           TEXT PRIMARY KEY,
            site_id      TEXT NOT NULL,
            filename     TEXT NOT NULL,
            storage_path TEXT NOT NULL,
            mime_type    TEXT NOT NULL,
            size_bytes   INTEGER NOT NULL,
            width        INTEGER,
            height       INTEGER,
            file_hash    TEXT NOT NULL,
            thumb_path   TEXT,
            created_at   INTEGER NOT NULL,
            FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_media_site ON media_assets(site_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_media_hash ON media_assets(site_id, file_hash);
        ",
    )
    .map_err(|e| Error::Internal(format!("create_cms_tables failed: {}", e)))?;
    Ok(())
}

/// v3：参数化运维脚本库（docs/automation-ops-plan.md §9，`ops_scripts` 表）。
fn create_ops_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS ops_scripts (
            id                 TEXT PRIMARY KEY,
            name               TEXT NOT NULL,
            description        TEXT NOT NULL DEFAULT '',
            category           TEXT NOT NULL DEFAULT 'general',
            icon               TEXT,
            script             TEXT NOT NULL,
            parameters_json    TEXT NOT NULL DEFAULT '[]',
            danger_level       TEXT NOT NULL DEFAULT 'Safe',
            timeout_secs       INTEGER NOT NULL DEFAULT 60,
            confirm_required   INTEGER NOT NULL DEFAULT 0,
            is_builtin         INTEGER NOT NULL DEFAULT 0,
            enabled            INTEGER NOT NULL DEFAULT 1,
            created_at         INTEGER NOT NULL,
            updated_at         INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ops_scripts_category ON ops_scripts(category, enabled);
        ",
    )
    .map_err(|e| Error::Internal(format!("create_ops_tables failed: {}", e)))?;
    Ok(())
}

/// v4：任务编排（docs/automation-ops-plan.md §9）。任务定义 + 运行总表 + 步骤级日志。
fn create_automation_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS automation_tasks (
            id                   TEXT PRIMARY KEY,
            name                 TEXT NOT NULL,
            description          TEXT NOT NULL DEFAULT '',
            connection_ids_json  TEXT NOT NULL DEFAULT '[]',
            steps_json           TEXT NOT NULL,
            retry_json           TEXT,
            notify               INTEGER NOT NULL DEFAULT 0,
            run_on_startup       INTEGER NOT NULL DEFAULT 0,
            permission_mode      TEXT NOT NULL DEFAULT 'Manual',
            last_run_at          INTEGER,
            enabled              INTEGER NOT NULL DEFAULT 1,
            created_at           INTEGER NOT NULL,
            updated_at           INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS task_runs (
            id             TEXT PRIMARY KEY,
            task_id        TEXT NOT NULL,
            trigger_type   TEXT NOT NULL,
            connection_id  TEXT,
            status         TEXT NOT NULL,
            started_at     INTEGER NOT NULL,
            finished_at    INTEGER,
            duration_ms    INTEGER,
            error_summary  TEXT NOT NULL DEFAULT '',
            FOREIGN KEY (task_id) REFERENCES automation_tasks(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_task_runs_task ON task_runs(task_id, started_at DESC);

        CREATE TABLE IF NOT EXISTS task_run_steps (
            id               TEXT PRIMARY KEY,
            run_id           TEXT NOT NULL,
            step_index       INTEGER NOT NULL,
            step_id          TEXT NOT NULL,
            step_type        TEXT NOT NULL,
            command_rendered TEXT NOT NULL DEFAULT '',
            status           TEXT NOT NULL,
            exit_code        INTEGER,
            stdout           TEXT NOT NULL DEFAULT '',
            stderr           TEXT NOT NULL DEFAULT '',
            assertion_passed INTEGER,
            attempt          INTEGER NOT NULL DEFAULT 1,
            duration_ms      INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (run_id) REFERENCES task_runs(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_run_steps_run ON task_run_steps(run_id, step_index);
        ",
    )
    .map_err(|e| Error::Internal(format!("create_automation_tables failed: {}", e)))?;
    Ok(())
}

/// v5：运维脚本执行历史（ops_script_runs 表，脚本审计留痕，docs/automation-ops-plan.md §9）。
fn create_ops_run_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS ops_script_runs (
            id               TEXT PRIMARY KEY,
            script_id        TEXT NOT NULL,
            script_name      TEXT NOT NULL,
            category         TEXT NOT NULL DEFAULT 'general',
            connection_id    TEXT,
            connection_name  TEXT NOT NULL DEFAULT '',
            command_rendered TEXT NOT NULL DEFAULT '',
            params_json      TEXT NOT NULL DEFAULT '{}',
            status           TEXT NOT NULL,
            exit_code        INTEGER,
            stdout           TEXT NOT NULL DEFAULT '',
            stderr           TEXT NOT NULL DEFAULT '',
            merged           INTEGER NOT NULL DEFAULT 0,
            truncated        INTEGER NOT NULL DEFAULT 0,
            channel          TEXT NOT NULL DEFAULT '',
            danger_level     TEXT NOT NULL DEFAULT 'Safe',
            duration_ms      INTEGER NOT NULL DEFAULT 0,
            started_at       INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ops_runs_script ON ops_script_runs(script_id, started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_ops_runs_started ON ops_script_runs(started_at DESC);
        ",
    )
    .map_err(|e| Error::Internal(format!("create_ops_run_tables failed: {}", e)))?;
    Ok(())
}

/// v6：补齐 AI Agent/Chat 相关列（auto_confirm、permission_mode、always_allowed_tools、
/// fallback_model_id、workspace_dir、metadata、is_error、compaction_summary）。
/// 这些列原本散落在 v1_migrate 中，但 v1_migrate 只在 user_version < 1 时运行，
/// 导致早期版本用户升级后缺失这些列。v6 对全部列做幂等性检查后补齐。
fn migrate_ai_agent_columns(conn: &Connection) -> Result<()> {
    // ai_agents: trigger_type
    let has_trigger_type: bool = conn
        .prepare("SELECT trigger_type FROM ai_agents LIMIT 1")
        .is_ok();
    if !has_trigger_type {
        conn.execute_batch(
            "ALTER TABLE ai_agents ADD COLUMN trigger_type TEXT NOT NULL DEFAULT 'manual';",
        )
        .map_err(|e| Error::Internal(format!("add trigger_type failed: {}", e)))?;
    }

    // ai_agents: auto_confirm
    let has_auto_confirm: bool = conn
        .prepare("SELECT auto_confirm FROM ai_agents LIMIT 1")
        .is_ok();
    if !has_auto_confirm {
        conn.execute_batch(
            "ALTER TABLE ai_agents ADD COLUMN auto_confirm INTEGER NOT NULL DEFAULT 0;",
        )
        .map_err(|e| Error::Internal(format!("add auto_confirm failed: {}", e)))?;
    }

    // ai_agents: permission_mode
    let has_permission_mode: bool = conn
        .prepare("SELECT permission_mode FROM ai_agents LIMIT 1")
        .is_ok();
    if !has_permission_mode {
        conn.execute_batch(
            "ALTER TABLE ai_agents ADD COLUMN permission_mode TEXT NOT NULL DEFAULT 'confirm';",
        )
        .map_err(|e| Error::Internal(format!("add permission_mode failed: {}", e)))?;
    }

    // ai_agents: always_allowed_tools
    let has_always_allowed: bool = conn
        .prepare("SELECT always_allowed_tools FROM ai_agents LIMIT 1")
        .is_ok();
    if !has_always_allowed {
        conn.execute_batch(
            "ALTER TABLE ai_agents ADD COLUMN always_allowed_tools TEXT NOT NULL DEFAULT '[]';",
        )
        .map_err(|e| Error::Internal(format!("add always_allowed_tools failed: {}", e)))?;
    }

    // ai_agents: fallback_model_id
    let has_fallback: bool = conn
        .prepare("SELECT fallback_model_id FROM ai_agents LIMIT 1")
        .is_ok();
    if !has_fallback {
        conn.execute_batch(
            "ALTER TABLE ai_agents ADD COLUMN fallback_model_id TEXT NOT NULL DEFAULT '';",
        )
        .map_err(|e| Error::Internal(format!("add fallback_model_id failed: {}", e)))?;
    }

    // ai_agents: workspace_dir
    let has_workspace: bool = conn
        .prepare("SELECT workspace_dir FROM ai_agents LIMIT 1")
        .is_ok();
    if !has_workspace {
        conn.execute_batch(
            "ALTER TABLE ai_agents ADD COLUMN workspace_dir TEXT NOT NULL DEFAULT '';",
        )
        .map_err(|e| Error::Internal(format!("add workspace_dir failed: {}", e)))?;
    }

    // ai_conversations: metadata
    let has_conv_metadata: bool = conn
        .prepare("SELECT metadata FROM ai_conversations LIMIT 1")
        .is_ok();
    if !has_conv_metadata {
        conn.execute_batch(
            "ALTER TABLE ai_conversations ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}';",
        )
        .map_err(|e| Error::Internal(format!("add metadata failed: {}", e)))?;
    }

    // ai_messages: is_error
    let has_msg_is_error: bool = conn
        .prepare("SELECT is_error FROM ai_messages LIMIT 1")
        .is_ok();
    if !has_msg_is_error {
        conn.execute_batch(
            "ALTER TABLE ai_messages ADD COLUMN is_error INTEGER NOT NULL DEFAULT 0;",
        )
        .map_err(|e| Error::Internal(format!("add is_error failed: {}", e)))?;
    }

    // ai_conversations: compaction_summary
    let has_compaction: bool = conn
        .prepare("SELECT compaction_summary FROM ai_conversations LIMIT 1")
        .is_ok();
    if !has_compaction {
        conn.execute_batch(
            "ALTER TABLE ai_conversations ADD COLUMN compaction_summary TEXT NOT NULL DEFAULT '';",
        )
        .map_err(|e| Error::Internal(format!("add compaction_summary failed: {}", e)))?;
    }

    // ai_agents: 修复外键约束为 ON DELETE SET NULL（删除模型时不级联删除 Agent）
    let has_correct_fk: bool = {
        let result: String = conn
            .query_row(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name='ai_agents'",
                [],
                |row| row.get(0),
            )
            .unwrap_or_default();
        result.contains("model_id) REFERENCES ai_models(id) ON DELETE SET NULL")
    };

    if !has_correct_fk {
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS ai_agents_new (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                model_id TEXT,
                system_prompt TEXT NOT NULL DEFAULT '',
                temperature REAL NOT NULL DEFAULT 0.7,
                max_iterations INTEGER NOT NULL DEFAULT 10,
                tool_ids TEXT NOT NULL DEFAULT '[]',
                trigger_type TEXT NOT NULL DEFAULT 'manual',
                auto_confirm INTEGER NOT NULL DEFAULT 0,
                permission_mode TEXT NOT NULL DEFAULT 'confirm',
                always_allowed_tools TEXT NOT NULL DEFAULT '[]',
                fallback_model_id TEXT,
                workspace_dir TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (model_id) REFERENCES ai_models(id) ON DELETE SET NULL,
                FOREIGN KEY (fallback_model_id) REFERENCES ai_models(id) ON DELETE SET NULL
            );
            INSERT INTO ai_agents_new (
                id, name, description, model_id, system_prompt, temperature,
                max_iterations, tool_ids, trigger_type, auto_confirm,
                permission_mode, always_allowed_tools, fallback_model_id,
                workspace_dir, created_at, updated_at
            )
            SELECT 
                id, name, description,
                CASE WHEN model_id = '' THEN NULL ELSE model_id END,
                system_prompt, temperature, max_iterations, tool_ids, trigger_type,
                COALESCE(auto_confirm, 0),
                COALESCE(permission_mode, 'confirm'),
                COALESCE(always_allowed_tools, '[]'),
                CASE WHEN fallback_model_id = '' THEN NULL ELSE fallback_model_id END,
                COALESCE(workspace_dir, ''),
                created_at, updated_at
            FROM ai_agents;
            DROP TABLE ai_agents;
            ALTER TABLE ai_agents_new RENAME TO ai_agents;
            ",
        )
        .map_err(|e| Error::Internal(format!("fix ai_agents FK failed: {}", e)))?;
    }

    Ok(())
}

/// v7：站点增加 db_type 字段，标识站点使用的数据库类型（none/postgresql）。
/// 环境检测和 AI 修复将根据此字段决定是否检查/修复对应数据库。
fn migrate_site_db_type(conn: &Connection) -> Result<()> {
    let has_db_type: bool = conn
        .prepare("SELECT db_type FROM sites LIMIT 1")
        .is_ok();
    if !has_db_type {
        conn.execute_batch(
            "ALTER TABLE sites ADD COLUMN db_type TEXT NOT NULL DEFAULT 'none';",
        )
        .map_err(|e| Error::Internal(format!("add db_type failed: {}", e)))?;
    }
    Ok(())
}

/// v8：新增 ai_permission_requests 表，持久化 AI Agent 的权限请求历史。
/// 用于审计、复盘、以及应用重启后的请求恢复。
fn create_permission_requests_table(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS ai_permission_requests (
            id              TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            agent_id        TEXT NOT NULL,
            tool_name       TEXT NOT NULL,
            arguments       TEXT NOT NULL,
            risk_level      TEXT NOT NULL,
            description     TEXT NOT NULL,
            status          TEXT NOT NULL DEFAULT 'pending',
            always_allow    INTEGER NOT NULL DEFAULT 0,
            created_at      INTEGER NOT NULL,
            responded_at    INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_ai_perm_conv ON ai_permission_requests(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_ai_perm_agent ON ai_permission_requests(agent_id);
        CREATE INDEX IF NOT EXISTS idx_ai_perm_status ON ai_permission_requests(status);
        "#,
    )
    .map_err(|e| Error::Internal(format!("create ai_permission_requests failed: {}", e)))?;
    Ok(())
}

/// v9：给 ai_conversations 表增加 status 字段，用于会话持久化恢复
/// 状态：idle（空闲/已完成）、running（正在运行）、interrupted（异常中断）
/// 应用启动时将 running 状态的会话重置为 interrupted，供前端提示用户恢复
fn migrate_conversation_status(conn: &Connection) -> Result<()> {
    // 检查列是否已存在（幂等）
    let col_exists = conn
        .prepare("SELECT status FROM ai_conversations LIMIT 1")
        .is_ok();
    if !col_exists {
        conn.execute(
            "ALTER TABLE ai_conversations ADD COLUMN status TEXT NOT NULL DEFAULT 'idle'",
            [],
        )
        .map_err(|e| Error::Internal(format!("add status to ai_conversations failed: {}", e)))?;
    }

    // 增加索引加速状态查询
    let idx_exists = conn
        .prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_ai_conv_status'")
        .is_ok();
    if !idx_exists {
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_ai_conv_status ON ai_conversations(status)",
            [],
        )
        .map_err(|e| Error::Internal(format!("create idx_ai_conv_status failed: {}", e)))?;
    }

    Ok(())
}

/// v10：给 ai_conversations 表增加 message_count 冗余字段
/// 避免会话列表每次都要 COUNT 全表，提升列表页性能
/// 新增消息时同步 +1，删除消息时同步 -1
fn migrate_conversation_message_count(conn: &Connection) -> Result<()> {
    // 检查列是否已存在（幂等）
    let col_exists = conn
        .prepare("SELECT message_count FROM ai_conversations LIMIT 1")
        .is_ok();
    if !col_exists {
        conn.execute(
            "ALTER TABLE ai_conversations ADD COLUMN message_count INTEGER NOT NULL DEFAULT 0",
            [],
        )
        .map_err(|e| Error::Internal(format!("add message_count to ai_conversations failed: {}", e)))?;

        // 回填已有会话的消息数
        conn.execute(
            "UPDATE ai_conversations SET message_count = (
                SELECT COUNT(*) FROM ai_messages WHERE ai_messages.conversation_id = ai_conversations.id
            )",
            [],
        )
        .map_err(|e| Error::Internal(format!("backfill message_count failed: {}", e)))?;
    }

    Ok(())
}

/// v11：扩展 deployments 表，补齐运维中心部署管理需要的字段。
/// - mode: 部署模式（simple/full）
/// - connection_id: 服务器连接 ID
/// - remote_path: 远程部署路径
/// - version_dir: 版本目录名
/// - server_version: 静态文件版本标识（路线B，不再使用 webcraft-server）
/// - steps_json: 每步的详细状态
/// - log_json: 部署日志（截断存储）
/// - rollback_from: 从哪个版本回滚
fn migrate_deployments_v2(conn: &Connection) -> Result<()> {
    let add_col = |col: &str, def: &str| -> Result<()> {
        let exists = conn
            .prepare(&format!("SELECT {} FROM deployments LIMIT 1", col))
            .is_ok();
        if !exists {
            conn.execute(
                &format!("ALTER TABLE deployments ADD COLUMN {} {}", col, def),
                [],
            )
            .map_err(|e| Error::Internal(format!("add {} to deployments failed: {}", col, e)))?;
        }
        Ok(())
    };

    add_col("mode", "TEXT NOT NULL DEFAULT 'simple'")?;
    add_col("connection_id", "TEXT")?;
    add_col("remote_path", "TEXT NOT NULL DEFAULT ''")?;
    add_col("version_dir", "TEXT NOT NULL DEFAULT ''")?;
    add_col("server_version", "TEXT NOT NULL DEFAULT ''")?;
    add_col("steps_json", "TEXT NOT NULL DEFAULT '[]'")?;
    add_col("log_json", "TEXT NOT NULL DEFAULT '[]'")?;
    add_col("rollback_from", "TEXT")?;

    // 新增索引：connection_id + started_at DESC
    let idx_exists = conn
        .prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_deployments_conn'")
        .is_ok();
    if !idx_exists {
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_deployments_conn ON deployments(connection_id, started_at DESC)",
            [],
        )
        .map_err(|e| Error::Internal(format!("create idx_deployments_conn failed: {}", e)))?;
    }

    Ok(())
}

/// v13：自动化任务周期调度字段（docs/automation-ops-plan.md §10）。
/// schedule_kind / schedule_interval_secs / schedule_at_minute 用于驱动后台调度器，
/// 让部署等任务按周期/启动自动运行，保证工作连续性。
fn migrate_automation_schedule(conn: &Connection) -> Result<()> {
    let add_col = |col: &str, def: &str| -> Result<()> {
        let exists = conn
            .prepare(&format!("SELECT {} FROM automation_tasks LIMIT 1", col))
            .is_ok();
        if !exists {
            conn.execute(
                &format!("ALTER TABLE automation_tasks ADD COLUMN {} {}", col, def),
                [],
            )
            .map_err(|e| Error::Internal(format!("add {} to automation_tasks failed: {}", col, e)))?;
        }
        Ok(())
    };
    add_col("schedule_kind", "TEXT NOT NULL DEFAULT 'off'")?;
    add_col("schedule_interval_secs", "INTEGER NOT NULL DEFAULT 0")?;
    add_col("schedule_at_minute", "INTEGER NOT NULL DEFAULT 0")?;
    Ok(())
}

/// v14：区块化页面构建——contents 表加 blocks_json 字段。
/// 页面（type='page'）可通过 blocks_json 存储区块序列 JSON，
/// SSG 引擎解析后走区块渲染路径（替代/补充传统 Markdown 渲染）。
fn migrate_content_blocks(conn: &Connection) -> Result<()> {
    let exists = conn
        .prepare("SELECT blocks_json FROM contents LIMIT 1")
        .is_ok();
    if !exists {
        conn.execute(
            "ALTER TABLE contents ADD COLUMN blocks_json TEXT NOT NULL DEFAULT ''",
            [],
        )
        .map_err(|e| Error::Internal(format!("add blocks_json to contents failed: {}", e)))?;
    }
    Ok(())
}

/// v15：场景表（场景 = 网站）。
/// scenes 存储网站编辑器的完整 DSL（组件、图层、画布配置等以 JSON 字符串存 TEXT 列）。
/// scene_categories 存储场景分类。
fn create_scene_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS scenes (
            id                   TEXT PRIMARY KEY,
            name                 TEXT NOT NULL,
            description          TEXT,
            coordinate_system    TEXT NOT NULL DEFAULT 'EPSG:3857',
            camera               TEXT NOT NULL DEFAULT '{}',
            bounds               TEXT,
            layers               TEXT NOT NULL DEFAULT '[]',
            bindings             TEXT NOT NULL DEFAULT '[]',
            variables            TEXT,
            layout               TEXT NOT NULL DEFAULT '[]',
            editor_components    TEXT,
            editor_layers        TEXT,
            canvas_config        TEXT,
            global_components   TEXT,
            views                TEXT,
            active_view_id       TEXT,
            viewport_sync_rules  TEXT,
            category_id          TEXT,
            tags                 TEXT NOT NULL DEFAULT '[]',
            thumbnail            TEXT,
            status               TEXT NOT NULL DEFAULT 'draft',
            published_at         INTEGER,
            metadata             TEXT NOT NULL DEFAULT '{}',
            created_at           INTEGER NOT NULL,
            updated_at           INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_scenes_category ON scenes(category_id);
        CREATE INDEX IF NOT EXISTS idx_scenes_status ON scenes(status);

        CREATE TABLE IF NOT EXISTS scene_categories (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            icon        TEXT,
            color       TEXT,
            sort_order  INTEGER NOT NULL DEFAULT 0,
            parent_id   TEXT,
            description TEXT,
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        );
        ",
    )
    .map_err(|e| Error::Internal(format!("create_scene_tables failed: {}", e)))?;
    Ok(())
}

/// v16：为已运行的 v15 数据库补 published_at 列。
/// v15 CREATE TABLE 已含此列时，ALTER 会失败（列已存在），忽略即可。
fn migrate_scene_published_at(conn: &Connection) -> Result<()> {
    // 先检查列是否已存在（v15 新建库已包含此列）
    let has_col = conn
        .prepare("SELECT published_at FROM scenes LIMIT 1")
        .is_ok();
    if !has_col {
        conn.execute(
            "ALTER TABLE scenes ADD COLUMN published_at INTEGER",
            [],
        )
        .map_err(|e| Error::Internal(format!("add published_at to scenes failed: {}", e)))?;
    }
    Ok(())
}

/// v17：站点多域名表。
/// 将 `sites.domain`（单值）迁移到 `site_domains` 表（多值），
/// 原有 domain 非空的记录搬入 site_domains 并标记为 is_primary=1。
/// `sites.domain` 字段保留作为主域名冗余缓存，向后兼容。
fn create_site_domains_table(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS site_domains (
            id          TEXT PRIMARY KEY,
            site_id     TEXT NOT NULL,
            domain      TEXT NOT NULL,
            is_primary  INTEGER NOT NULL DEFAULT 0,
            created_at  INTEGER NOT NULL,
            FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
            UNIQUE(site_id, domain)
        );
        CREATE INDEX IF NOT EXISTS idx_site_domains_site ON site_domains(site_id);

        -- 迁移：把 sites.domain 非空的记录搬入 site_domains
        INSERT OR IGNORE INTO site_domains (id, site_id, domain, is_primary, created_at)
        SELECT 'domain-mig-' || s.id, s.id, s.domain, 1, s.created_at
        FROM sites s WHERE s.domain != '';
        ",
    )
    .map_err(|e| Error::Internal(format!("create_site_domains_table failed: {}", e)))?;
    Ok(())
}

/// v12：统一资源注册表（docs/unified-resource-model.md）。
/// 连接 / 站点 / 部署 / 终端 / 自动化 等原本各自独立存储的领域对象，
/// 在此登记为可互链、可查询、可互相调用的「资源」，构成 web-craft 的统一整体。
/// `resources` 为资源目录，`resource_links` 为资源间的有向关系边。
fn create_resource_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS resources (
            id          TEXT PRIMARY KEY,
            kind        TEXT NOT NULL,            -- connection | site | deployment | terminal | automation | command | media | content
            ref_id      TEXT NOT NULL,            -- 源表主键（connections.id / sites.id / ...）
            name        TEXT NOT NULL DEFAULT '',
            meta_json   TEXT NOT NULL DEFAULT '{}',
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_resources_kind_ref ON resources(kind, ref_id);
        CREATE INDEX IF NOT EXISTS idx_resources_ref ON resources(ref_id);

        CREATE TABLE IF NOT EXISTS resource_links (
            id          TEXT PRIMARY KEY,
            from_kind   TEXT NOT NULL,
            from_ref    TEXT NOT NULL,
            to_kind     TEXT NOT NULL,
            to_ref      TEXT NOT NULL,
            relation    TEXT NOT NULL DEFAULT 'related',  -- runs_on | deploys_to | belongs_to | uses | links
            created_at  INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_reslinks_from ON resource_links(from_kind, from_ref);
        CREATE INDEX IF NOT EXISTS idx_reslinks_to ON resource_links(to_kind, to_ref);
        ",
    )
    .map_err(|e| Error::Internal(format!("create_resource_tables failed: {}", e)))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open_test_db() -> Connection {
        let mut conn = Connection::open_in_memory().expect("open in-memory db");
        conn.execute_batch("PRAGMA foreign_keys = OFF;").unwrap();
        conn
    }

    fn table_exists(conn: &Connection, name: &str) -> bool {
        conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
            [name],
            |r| r.get::<_, i64>(0),
        )
        .unwrap()
            == 1
    }

    fn current_version(conn: &Connection) -> i64 {
        conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap()
    }

    #[test]
    fn fresh_db_reaches_latest_with_cms_tables() {
        let mut conn = open_test_db();
        run_migrations(&mut conn).expect("fresh install migrations");
        assert_eq!(current_version(&conn), SCHEMA_VERSION);
        for table in [
            "sites",
            "contents",
            "content_versions",
            "content_tags",
            "content_tag_links",
            "deployments",
            "media_assets",
            "ops_scripts",
            "ops_script_runs",
            "automation_tasks",
            "task_runs",
            "task_run_steps",
            "resources",
            "resource_links",
        ] {
            assert!(table_exists(&conn, table), "table {} should exist", table);
        }
        // v11: deployments 新列
        for col in [
            "mode",
            "connection_id",
            "remote_path",
            "version_dir",
            "server_version",
            "steps_json",
            "log_json",
            "rollback_from",
        ] {
            let exists = conn
                .prepare(&format!("SELECT {} FROM deployments LIMIT 1", col))
                .is_ok();
            assert!(exists, "deployments.{} should exist after v11", col);
        }
    }

    #[test]
    fn rerun_is_noop() {
        let mut conn = open_test_db();
        run_migrations(&mut conn).unwrap();
        run_migrations(&mut conn).unwrap();
        assert_eq!(current_version(&conn), SCHEMA_VERSION);
    }

    #[test]
    fn downgrade_is_rejected() {
        let mut conn = open_test_db();
        conn.pragma_update(None, "user_version", SCHEMA_VERSION + 1)
            .unwrap();
        assert!(run_migrations(&mut conn).is_err());
    }

    #[test]
    fn v1_upgrade_adds_ai_agent_columns() {
        // Simulate a v1 database that has base ai_agents table but no newer columns
        let mut conn = open_test_db();
        // Run v1 only
        super::super::database::Database::v1_initialize(&conn).unwrap();
        conn.pragma_update(None, "user_version", 1).unwrap();

        // Verify auto_confirm is missing (simulating old v1 schema)
        let has_auto_confirm_before = conn
            .prepare("SELECT auto_confirm FROM ai_agents LIMIT 1")
            .is_ok();
        // Note: v1_migrate is not called in this old-v1 simulation,
        // so columns like auto_confirm truly are missing.
        // Actually v1_initialize creates ai_agents with base columns only,
        // and v1_migrate adds the extra columns. But v1_migrate runs as
        // part of "current < 1". Let's instead test the v6 migration directly.

        // Run v6 migration on its own
        migrate_ai_agent_columns(&conn).expect("v6 migration");

        // Verify all ai_agents columns exist now
        for col in [
            "trigger_type",
            "auto_confirm",
            "permission_mode",
            "always_allowed_tools",
            "fallback_model_id",
            "workspace_dir",
        ] {
            let exists = conn
                .prepare(&format!("SELECT {} FROM ai_agents LIMIT 1", col))
                .is_ok();
            assert!(exists, "column {} should exist after v6 migration", col);
        }

        // Verify ai_conversations columns
        for col in ["metadata", "compaction_summary"] {
            let exists = conn
                .prepare(&format!("SELECT {} FROM ai_conversations LIMIT 1", col))
                .is_ok();
            assert!(
                exists,
                "column {} should exist after v6 migration",
                col
            );
        }

        // Verify ai_messages columns
        let has_is_error = conn
            .prepare("SELECT is_error FROM ai_messages LIMIT 1")
            .is_ok();
        assert!(has_is_error, "column is_error should exist after v6 migration");
    }
}
