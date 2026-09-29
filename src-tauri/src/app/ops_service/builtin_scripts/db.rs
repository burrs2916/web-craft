use crate::core::types::Danger::{Careful, Dangerous, Safe};
use crate::core::types::OpsScript;
use super::{param, select_param};

pub(super) fn scripts() -> Vec<OpsScript> {
    vec![
        // ---------- 数据库：PostgreSQL ----------
        OpsScript {
            id: "ops-db-pg-status".into(),
            name: "PostgreSQL 运行状态".into(),
            description: "检查 PostgreSQL 服务状态、连接数、版本".into(),
            category: "db".into(),
            icon: Some("database".into()),
            script: "echo '=== 服务状态 ==='; \
pg_isready -U {{pg_user}} -h {{pg_host}} -p {{pg_port}} 2>&1 && echo '✅ PostgreSQL 服务正常' || { echo '❌ PostgreSQL 不可达'; exit 1; }; \
echo ''; echo '=== 版本信息 ==='; \
psql -U {{pg_user}} -h {{pg_host}} -p {{pg_port}} -tc 'SELECT version();' 2>/dev/null | head -1 | sed 's/^[ ]*//'; \
echo ''; echo '=== 连接情况 ==='; \
psql -U {{pg_user}} -h {{pg_host}} -p {{pg_port}} -tc \"SELECT count(*) as connections FROM pg_stat_activity WHERE datname = '{{db_name}}';\" 2>/dev/null | awk 'NR==1{print \"当前连接数: \" $1}'; \
echo ''; echo '=== 数据库大小 ==='; \
psql -U {{pg_user}} -h {{pg_host}} -p {{pg_port}} -tc \"SELECT pg_size_pretty(pg_database_size('{{db_name}}'));\" 2>/dev/null | awk 'NR==1{print \"数据库大小: \" $1}'".into(),
            parameters: vec![
                param("pg_host", "主机"),
                param("pg_port", "端口"),
                param("pg_user", "用户名"),
                param("db_name", "数据库名"),
            ],
            danger_level: Safe,
            timeout_secs: 30,
            confirm_required: false,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
        OpsScript {
            id: "ops-db-pg-backup".into(),
            name: "PostgreSQL 数据库备份".into(),
            description: "使用 pg_dump 备份指定数据库为 .sql 或 .sql.gz 文件".into(),
            category: "db".into(),
            icon: Some("archive".into()),
            script: "mkdir -p \"$(dirname '{{output_path}}')\"; \
if [ '{{format}}' = 'sql' ]; then \
  pg_dump -U {{pg_user}} -h {{pg_host}} -p {{pg_port}} -Fc '{{db_name}}' > '{{output_path}}' && echo '✅ 备份完成: {{output_path}}' && ls -lh '{{output_path}}' | awk '{print \"文件大小: \" $5}'; \
else \
  pg_dump -U {{pg_user}} -h {{pg_host}} -p {{pg_port}} -Fc '{{db_name}}' | gzip > '{{output_path}}' && echo '✅ 备份完成: {{output_path}}' && ls -lh '{{output_path}}' | awk '{print \"文件大小: \" $5}'; \
fi".into(),
            parameters: vec![
                param("pg_host", "主机"),
                param("pg_port", "端口"),
                param("pg_user", "用户名"),
                param("db_name", "数据库名"),
                param("output_path", "输出路径"),
                select_param("format", "备份格式", &["gz", "sql"]),
            ],
            danger_level: Careful,
            timeout_secs: 300,
            confirm_required: true,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
        OpsScript {
            id: "ops-db-pg-restore".into(),
            name: "PostgreSQL 数据库恢复".into(),
            description: "从 .sql 或 .sql.gz 备份文件恢复数据库（危险操作）".into(),
            category: "db".into(),
            icon: Some("database".into()),
            script: "if [ ! -f '{{backup_path}}' ]; then echo '❌ 备份文件不存在: {{backup_path}}'; exit 1; fi; \
echo '⚠️  即将恢复数据库: {{db_name}}'; echo '备份文件: {{backup_path}}'; echo ''; \
if echo '{{backup_path}}' | grep -q '\\.gz$'; then \
  gunzip -c '{{backup_path}}' | psql -U {{pg_user}} -h {{pg_host}} -p {{pg_port}} -d '{{db_name}}' 2>&1 && echo '✅ 恢复完成'; \
else \
  psql -U {{pg_user}} -h {{pg_host}} -p {{pg_port}} -d '{{db_name}}' -f '{{backup_path}}' 2>&1 && echo '✅ 恢复完成'; \
fi".into(),
            parameters: vec![
                param("pg_host", "主机"),
                param("pg_port", "端口"),
                param("pg_user", "用户名"),
                param("db_name", "目标数据库"),
                param("backup_path", "备份文件路径"),
            ],
            danger_level: Dangerous,
            timeout_secs: 300,
            confirm_required: true,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
        OpsScript {
            id: "ops-db-pg-slow".into(),
            name: "PostgreSQL 慢查询".into(),
            description: "查看执行时间最慢的 N 条 SQL 查询".into(),
            category: "db".into(),
            icon: Some("clock".into()),
            script: "psql -U {{pg_user}} -h {{pg_host}} -p {{pg_port}} -d '{{db_name}}' <<'EOF'\nSELECT \n  round(total_exec_time::numeric, 2) as total_ms,\n  calls,\n  round(mean_exec_time::numeric, 2) as mean_ms,\n  left(query, 120) as query\nFROM pg_stat_statements\nORDER BY mean_exec_time DESC\nLIMIT {{limit}};\nEOF".into(),
            parameters: vec![
                param("pg_host", "主机"),
                param("pg_port", "端口"),
                param("pg_user", "用户名"),
                param("db_name", "数据库名"),
                select_param("limit", "显示条数", &["10", "20", "50"]),
            ],
            danger_level: Safe,
            timeout_secs: 30,
            confirm_required: false,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
        OpsScript {
            id: "ops-db-pg-vacuum".into(),
            name: "PostgreSQL VACUUM 分析".into(),
            description: "对指定数据库执行 VACUUM ANALYZE，优化查询性能".into(),
            category: "db".into(),
            icon: Some("hard-drive".into()),
            script: "echo '开始 VACUUM ANALYZE: {{db_name}} (模式: {{mode}})'; \
start_time=$(date +%s); \
if [ '{{mode}}' = 'full' ]; then \
  psql -U {{pg_user}} -h {{pg_host}} -p {{pg_port}} -d '{{db_name}}' -c 'VACUUM FULL ANALYZE;' 2>&1; \
else \
  psql -U {{pg_user}} -h {{pg_host}} -p {{pg_port}} -d '{{db_name}}' -c 'VACUUM ANALYZE;' 2>&1; \
fi; \
end_time=$(date +%s); \
echo \"✅ 完成，耗时 $((end_time - start_time)) 秒\"".into(),
            parameters: vec![
                param("pg_host", "主机"),
                param("pg_port", "端口"),
                param("pg_user", "用户名"),
                param("db_name", "数据库名"),
                select_param("mode", "模式", &["normal", "full"]),
            ],
            danger_level: Careful,
            timeout_secs: 600,
            confirm_required: true,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
    ]
}
