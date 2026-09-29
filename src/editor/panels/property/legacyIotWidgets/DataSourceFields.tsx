/**
 * 数据源相关字段：数据源信息、数据源选择、数据字段选择。
 * 从 legacyIotWidgets.tsx 迁出，仅做代码搬迁。
 */
import { useCallback, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { useDataSourceStore } from '../../../../store/datasourceStore';
import { useDeviceStore } from '../../../../store/deviceStore';
import type { ConfigField } from '../../../../types/editor';
import { fieldSx, floatedLabelProps } from '../sharedStyles';

export function DataSourceInfoField({ field }: { field: ConfigField }) {
  const activeDataSourceId = useDeviceStore((s) => s.activeDataSourceId);
  const dataSources = useDataSourceStore((s) => s.dataSources);
  const connectionStatuses = useDataSourceStore((s) => s.connectionStatuses);

  const ds = useMemo(() => {
    if (!activeDataSourceId) return null;
    return dataSources.find((d) => d.id === activeDataSourceId) ?? null;
  }, [activeDataSourceId, dataSources]);

  if (!ds) {
    return (
      <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>
        <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>
          {field.label || '数据源'}：未配置
        </Typography>
        <Typography sx={{ fontSize: 9, color: 'text.disabled', mt: 0.25 }}>
         请在系统设置 &gt; 数据源管理中添加并启用数据源
        </Typography>
      </Box>
    );
  }

  const status = connectionStatuses[ds.id]?.status;
  const statusColor = status === "connected" ? "#4caf50" : status === "connecting" ? "#ff9800" : status === "failed" ? "#f44336" : "#999";
  const statusText = status === "connected" ? "已连接" : status === "connecting" ? "连接中" : status === "failed" ? "连接失败" : "未连接";

  // 构建数据库连接信息
  const db = ds.connection.database;
  let dbTypeLabel = "";
  let connectionStr = "";
  let dbName = "";
  let dbUser = "";

  if (db) {
    const labels: Record<string, string> = {
      greptimedb: "GreptimeDB", mysql: "MySQL", postgresql: "PostgreSQL",
      mongodb: "MongoDB", redis: "Redis", influxdb: "InfluxDB", clickhouse: "ClickHouse",
    };
    const modes: Record<string, string> = {
      postgresql: "PostgreSQL协议", mysql: "MySQL协议",
      "http-sql": "HTTP SQL API", "http-promql": "HTTP PromQL API",
    };
    dbTypeLabel = labels[db.dbType] ?? db.dbType;
    if (db.dbType === "greptimedb" && db.connectionMode) {
      dbTypeLabel += ` (${modes[db.connectionMode] ?? db.connectionMode})`;
    }
    connectionStr = `${db.host}:${db.port}`;
    dbName = db.database || "默认";
    dbUser = db.username || "匿名";
  } else if (ds.connection.url) {
    dbTypeLabel = "HTTP API";
    connectionStr = ds.connection.url;
  }

  return (
    <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: ds.enabled ? statusColor : '#999', boxShadow: `0 0 4px ${statusColor}66` }} />
        <Typography sx={{ fontSize: 11, fontWeight: 600, color: 'text.primary' }}>
          {ds.name}
        </Typography>
        <Typography sx={{ fontSize: 9, color: statusColor, ml: 'auto' }}>
          {statusText}
        </Typography>
      </Box>
      {dbTypeLabel && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.15 }}>
          <Typography sx={{ fontSize: 9, color: 'text.secondary' }}>数据库</Typography>
          <Typography sx={{ fontSize: 9, color: 'text.primary', fontWeight: 500 }}>{dbTypeLabel}</Typography>
        </Box>
      )}
      {connectionStr && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.15 }}>
          <Typography sx={{ fontSize: 9, color: 'text.secondary' }}>连接地址</Typography>
          <Typography sx={{ fontSize: 9, color: 'text.primary', fontFamily: 'monospace' }}>{connectionStr}</Typography>
        </Box>
      )}
      {dbName && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.15 }}>
          <Typography sx={{ fontSize: 9, color: 'text.secondary' }}>数据库</Typography>
          <Typography sx={{ fontSize: 9, color: 'text.primary', fontFamily: 'monospace' }}>{dbName}</Typography>
        </Box>
      )}
      {dbUser && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.15 }}>
          <Typography sx={{ fontSize: 9, color: 'text.secondary' }}>用户</Typography>
          <Typography sx={{ fontSize: 9, color: 'text.primary', fontFamily: 'monospace' }}>{dbUser}</Typography>
        </Box>
      )}
      {ds.connection.url && db && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.15 }}>
          <Typography sx={{ fontSize: 9, color: 'text.secondary' }}>API</Typography>
          <Typography sx={{ fontSize: 9, color: 'text.primary', fontFamily: 'monospace', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ds.connection.url}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

export function DataSourceSelectField({
  field,
  value,
  onChange,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}) {
  const dataSources = useDataSourceStore((s) => s.dataSources);
  const connectionStatuses = useDataSourceStore((s) => s.connectionStatuses);
  const testConnection = useDataSourceStore((s) => s.testConnection);
  const fetchViaScheduler = useDataSourceStore((s) => s.fetchViaScheduler);

  // 可选过滤：只列符合条件的数据源
  // 用法: { key: "dataSourceId", type: "datasource", filter: (ds) => ds.type === "http" && ds.enabled }
  const filteredSources = useMemo(() => {
    const filterFn = (field as ConfigField & { filter?: (ds: { type: string; enabled: boolean }) => boolean }).filter;
    if (typeof filterFn !== "function") return dataSources;
    return dataSources.filter(filterFn);
  }, [dataSources, field]);

  // 选择数据源时自动测试连接
  const handleSelect = useCallback(async (dsId: string) => {
    onChange(field.key, dsId || undefined);
    if (!dsId) return;

    // 自动测试连接
    try {
      await testConnection(dsId);
      // 测试成功后主动拉取一次数据，填充 dataCache 以便列举字段
      await fetchViaScheduler(dsId);
    } catch (err) {
      console.warn('[DataSourceSelectField] 测试连接失败:', err);
    }
  }, [field.key, onChange, testConnection, fetchViaScheduler]);

  const selectedId = value as string | undefined;
  const status = selectedId ? connectionStatuses[selectedId]?.status : undefined;

  // 状态颜色映射
  const statusColor = status === "connected" ? "#4caf50" : status === "connecting" ? "#ff9800" : status === "failed" || status === "error" ? "#f44336" : undefined;

  return (
    <Box>
      <TextField
        label={field.label}
        value={String(value ?? '')}
        size="small"
        fullWidth
        select
        slotProps={{ ...floatedLabelProps }}
        onChange={(e) => handleSelect(e.target.value)}
        sx={fieldSx}
      >
        <MenuItem value="" sx={{ fontSize: 11 }}>
          -- 无数据源 --
        </MenuItem>
        {filteredSources.map((ds) => {
          const dsStatus = connectionStatuses[ds.id]?.status;
          const dsColor = dsStatus === "connected" ? "#4caf50" : dsStatus === "failed" ? "#f44336" : "#999";
          return (
            <MenuItem key={ds.id} value={ds.id} sx={{ fontSize: 11 }}>
              <Box component="span" sx={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", bgcolor: dsColor, mr: 0.75 }} />
              {ds.name || ds.id}
              <Typography component="span" variant="caption" sx={{ ml: 0.5, color: "text.secondary", fontSize: 9 }}>
                {ds.type.toUpperCase()}
              </Typography>
            </MenuItem>
          );
        })}
      </TextField>
      {status && (
        <Typography variant="caption" sx={{ fontSize: 9, color: statusColor, display: "block", mt: 0.25, ml: 0.5 }}>
          {status === "connected" ? "● 连接正常" : status === "connecting" ? "● 连接中..." : status === "failed" ? "● 连接失败" : `● ${status}`}
        </Typography>
      )}
    </Box>
  );
}

export function DataFieldSelectField({
  field,
  value,
  onChange,
  config,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  config: Record<string, unknown>;
}) {
  const dataSourceId = config.dataSourceId as string | undefined;
  const cache = useDataSourceStore((s) => (dataSourceId ? s.dataCache[dataSourceId] : undefined));
  const connectionStatuses = useDataSourceStore((s) => s.connectionStatuses);
  const status = dataSourceId ? connectionStatuses[dataSourceId]?.status : undefined;

  // 递归提取所有可用字段路径（支持嵌套对象）
  const fields = useMemo(() => {
    if (!cache || typeof cache !== 'object') return [];
    const result: Array<{ key: string; label: string; isArray: boolean }> = [];

    function extract(obj: Record<string, unknown>, prefix: string = "") {
      for (const [k, v] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (Array.isArray(v)) {
          result.push({ key: path, label: `${path} (数组${v.length}项)`, isArray: true });
          // 如果数组元素是对象，递归提取
          if (v.length > 0 && typeof v[0] === "object" && v[0] !== null) {
            extract(v[0] as Record<string, unknown>, `${path}[0]`);
          }
        } else if (typeof v === "object" && v !== null) {
          extract(v as Record<string, unknown>, path);
        } else {
          result.push({ key: path, label: `${path} (${typeof v})`, isArray: false });
        }
      }
    }

    extract(cache);
    return result;
  }, [cache]);

  if (!dataSourceId) {
    return (
      <TextField
        label={field.label}
        value={value ?? ''}
        size="small"
        fullWidth
        placeholder="请先选择数据源"
        slotProps={{ ...floatedLabelProps }}
        onChange={(e) => onChange(field.key, e.target.value)}
        sx={fieldSx}
        disabled
      />
    );
  }

  if (status !== "connected" && !cache) {
    return (
      <TextField
        label={field.label}
        value={value ?? ''}
        size="small"
        fullWidth
        placeholder={status === "connecting" ? "连接中..." : status === "failed" ? "连接失败，请检查数据源" : "等待连接..."}
        slotProps={{ ...floatedLabelProps }}
        onChange={(e) => onChange(field.key, e.target.value)}
        sx={fieldSx}
        disabled
      />
    );
  }

  if (fields.length === 0) {
    return (
      <TextField
        label={field.label}
        value={value ?? ''}
        size="small"
        fullWidth
        placeholder="连接成功，暂无数据字段（请检查响应映射配置）"
        slotProps={{ ...floatedLabelProps }}
        onChange={(e) => onChange(field.key, e.target.value)}
        sx={fieldSx}
      />
    );
  }

  return (
    <TextField
      label={field.label}
      value={String(value ?? '')}
      size="small"
      fullWidth
      select
      slotProps={{ ...floatedLabelProps }}
      onChange={(e) => onChange(field.key, e.target.value)}
      sx={fieldSx}
      helperText={`共 ${fields.length} 个字段可用`}
    >
      <MenuItem value="" sx={{ fontSize: 11 }}>
        -- 选择字段 --
      </MenuItem>
      {fields.map((f) => (
        <MenuItem key={f.key} value={f.key} sx={{ fontSize: 11 }}>
          {f.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

/** 数据库表选择字段 — 连接成功后自动列出所有表 */
