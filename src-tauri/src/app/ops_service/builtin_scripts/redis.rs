use crate::core::types::Danger::{Careful, Dangerous, Safe};
use crate::core::types::OpsScript;
use super::{param, select_param};

pub(super) fn scripts() -> Vec<OpsScript> {
    vec![
        OpsScript {
            id: "ops-redis-status".into(),
            name: "Redis 运行状态".into(),
            description: "检查 Redis 服务状态、版本、内存使用、连接数等信息".into(),
            category: "database".into(),
            icon: Some("database".into()),
            script: "if command -v redis-cli >/dev/null 2>&1; then \
  echo '=== Redis 服务状态 ==='; \
  if redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' ping 2>/dev/null | grep -q PONG; then \
    echo '状态: ✅ 运行中'; \
  else \
    echo '状态: ❌ 无法连接'; \
  fi; \
  echo ''; \
  echo '=== INFO 概览 ==='; \
  redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' INFO server 2>/dev/null | grep -E 'redis_version|os|tcp_port|process_id|uptime_in_days'; \
  echo ''; \
  redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' INFO memory 2>/dev/null | grep -E 'used_memory_human|used_memory_peak_human|maxmemory_human|mem_fragmentation_ratio'; \
  echo ''; \
  redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' INFO stats 2>/dev/null | grep -E 'total_connections_received|total_commands_processed|instantaneous_ops_per_sec|keyspace_hits|keyspace_misses'; \
  echo ''; \
  echo '=== Key 统计 ==='; \
  redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' INFO keyspace 2>/dev/null; \
else \
  echo '❌ redis-cli 未安装'; \
fi".into(),
            parameters: vec![
                param("redis_host", "主机"),
                param("redis_port", "端口"),
                param("redis_password", "密码"),
            ],
            danger_level: Safe,
            timeout_secs: 15,
            confirm_required: false,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
        OpsScript {
            id: "ops-redis-flushdb".into(),
            name: "Redis 清空数据库".into(),
            description: "清空指定 Redis 数据库的所有 key（危险操作，请谨慎使用）".into(),
            category: "database".into(),
            icon: Some("archive".into()),
            script: "if command -v redis-cli >/dev/null 2>&1; then \
  echo '⚠️  即将清空 Redis DB {{redis_db}} 的所有数据！'; \
  echo ''; \
  KEY_COUNT=$(redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' -n {{redis_db}} DBSIZE 2>/dev/null); \
  echo \"当前 key 数量: $KEY_COUNT\"; \
  echo ''; \
  redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' -n {{redis_db}} FLUSHDB 2>&1; \
  echo ''; \
  echo '✅ 已清空'; \
  NEW_COUNT=$(redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' -n {{redis_db}} DBSIZE 2>/dev/null); \
  echo \"清空后 key 数量: $NEW_COUNT\"; \
else \
  echo '❌ redis-cli 未安装'; \
fi".into(),
            parameters: vec![
                param("redis_host", "主机"),
                param("redis_port", "端口"),
                param("redis_password", "密码"),
                param("redis_db", "数据库编号"),
            ],
            danger_level: Dangerous,
            timeout_secs: 30,
            confirm_required: true,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
        OpsScript {
            id: "ops-redis-slowlog".into(),
            name: "Redis 慢查询".into(),
            description: "查看 Redis 慢查询日志，定位耗时命令".into(),
            category: "database".into(),
            icon: Some("clock".into()),
            script: "if command -v redis-cli >/dev/null 2>&1; then \
  echo '=== 慢查询配置 ==='; \
  redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' CONFIG GET slowlog-log-slower-than 2>/dev/null; \
  redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' CONFIG GET slowlog-max-len 2>/dev/null; \
  echo ''; \
  echo \"=== 最近 {{count}} 条慢查询 ===\"; \
  redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' SLOWLOG GET {{count}} 2>/dev/null; \
else \
  echo '❌ redis-cli 未安装'; \
fi".into(),
            parameters: vec![
                param("redis_host", "主机"),
                param("redis_port", "端口"),
                param("redis_password", "密码"),
                select_param("count", "显示条数", &["10", "20", "50"]),
            ],
            danger_level: Safe,
            timeout_secs: 15,
            confirm_required: false,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
        OpsScript {
            id: "ops-redis-memory".into(),
            name: "Redis 内存分析".into(),
            description: "分析 Redis 内存使用、大 key 分布和碎片率".into(),
            category: "database".into(),
            icon: Some("pulse".into()),
            script: "if command -v redis-cli >/dev/null 2>&1; then \
  echo '=== 内存概览 ==='; \
  redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' INFO memory 2>/dev/null | grep -E 'used_memory_human|used_memory_rss_human|used_memory_peak_human|used_memory_lua_human|maxmemory_human|maxmemory_policy|mem_fragmentation_ratio'; \
  echo ''; \
  echo '=== 数据库 key 分布 ==='; \
  redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' INFO keyspace 2>/dev/null; \
  echo ''; \
  echo '=== 客户端连接 ==='; \
  redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' INFO clients 2>/dev/null | grep -E 'connected_clients|blocked_clients'; \
  echo ''; \
  echo '=== 统计信息 ==='; \
  redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' INFO stats 2>/dev/null | grep -E 'instantaneous_ops_per_sec|rejected_connections|evicted_keys|keyspace_hits|keyspace_misses'; \
else \
  echo '❌ redis-cli 未安装'; \
fi".into(),
            parameters: vec![
                param("redis_host", "主机"),
                param("redis_port", "端口"),
                param("redis_password", "密码"),
            ],
            danger_level: Safe,
            timeout_secs: 15,
            confirm_required: false,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
        OpsScript {
            id: "ops-redis-restart".into(),
            name: "重启 Redis 服务".into(),
            description: "重启 Redis 服务并验证是否正常启动".into(),
            category: "database".into(),
            icon: Some("arrow-circular-clockwise".into()),
            script: "echo '正在重启 Redis 服务...'; \
if systemctl restart redis 2>/dev/null; then \
  echo '✅ systemctl restart redis 执行成功'; \
elif systemctl restart redis-server 2>/dev/null; then \
  echo '✅ systemctl restart redis-server 执行成功'; \
elif service redis-server restart 2>/dev/null; then \
  echo '✅ service redis-server restart 执行成功'; \
elif service redis restart 2>/dev/null; then \
  echo '✅ service redis restart 执行成功'; \
else \
  echo '❌ 重启失败，未找到 redis 服务'; \
  exit 1; \
fi; \
sleep 2; \
echo ''; \
echo '=== 验证服务状态 ==='; \
if command -v redis-cli >/dev/null 2>&1 && redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' ping 2>/dev/null | grep -q PONG; then \
  echo '✅ Redis 已启动并可正常连接'; \
  redis-cli -h {{redis_host}} -p {{redis_port}} -a '{{redis_password}}' INFO server 2>/dev/null | grep -E 'redis_version|uptime_in_seconds'; \
else \
  echo '⚠️  服务已重启但无法连接，请检查配置'; \
fi".into(),
            parameters: vec![
                param("redis_host", "主机"),
                param("redis_port", "端口"),
                param("redis_password", "密码"),
            ],
            danger_level: Careful,
            timeout_secs: 30,
            confirm_required: true,
            is_builtin: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        },
    ]
}
