/**
 * IoT 字段控件与设备状态区块（保留但当前未接入渲染树）。
 * 这些控件在网站编辑器中不再使用（EditorPropertyPanel 的 WEBSITE_UNAVAILABLE_FIELD_TYPES
 * 会过滤掉对应字段类型），但按既有约定保留源码，迁出以缩减属性面板本体体积。
 * 导出仅供后续 IoT 编辑器复用。
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { useEditorStore } from '../../../store/editorStore';
import { useDataSourceStore } from '../../../store/datasourceStore';
import { databaseApi } from '../../../services/tauri';
import { useDeviceStore } from '../../../store/deviceStore';
import { deviceStateMachine, type DeviceStateName } from '../../../store/deviceStateMachine';
import type { ConfigField, SceneComponent } from '../../../types/editor';
import { CollapsibleSection } from './CollapsibleSection';
import { fieldSx, floatedLabelProps } from './sharedStyles';

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
export function DbTableSelectField({
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
  const dataSources = useDataSourceStore((s) => s.dataSources);
  const ds = dataSources.find((d) => d.id === dataSourceId);
  const dbConfig = ds?.connection?.database;

  const [tables, setTables] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // 连接成功后自动加载表列表
  useEffect(() => {
    if (!dbConfig) {
      setTables([]);
      return;
    }
    setLoading(true);
    setError(undefined);
    databaseApi.getTables(dbConfig)
      .then((result) => setTables(result))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [dbConfig?.dbType, dbConfig?.host, dbConfig?.port, dbConfig?.database]);

  if (!dataSourceId || !dbConfig) {
    return (
      <TextField
        label={field.label}
        value={value ?? ''}
        size="small"
        fullWidth
        placeholder="请先选择数据库类型数据源"
        slotProps={{ ...floatedLabelProps }}
        sx={fieldSx}
        disabled
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
      onChange={(e) => onChange(field.key, e.target.value || undefined)}
      sx={fieldSx}
      helperText={loading ? "加载中..." : error ? `错误: ${error}` : tables.length > 0 ? `共 ${tables.length} 张表` : "无可用表"}
    >
      <MenuItem value="" sx={{ fontSize: 11 }}>
        -- 选择表 --
      </MenuItem>
      {tables.map((t) => (
        <MenuItem key={t} value={t} sx={{ fontSize: 11 }}>
          {t}
        </MenuItem>
      ))}
    </TextField>
  );
}

/** 数据库字段选择字段 — 选择表后自动列出所有字段 */
export function DbColumnSelectField({
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
  const tableName = config.dbTable as string | undefined;
  const dataSources = useDataSourceStore((s) => s.dataSources);
  const ds = dataSources.find((d) => d.id === dataSourceId);
  const dbConfig = ds?.connection?.database;

  const [columns, setColumns] = useState<Array<{ name: string; type: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // 选择表后自动加载字段列表
  useEffect(() => {
    if (!dbConfig || !tableName) {
      setColumns([]);
      return;
    }
    setLoading(true);
    setError(undefined);
    databaseApi.getColumns(dbConfig, tableName)
      .then((result) => setColumns(result))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [dbConfig?.dbType, dbConfig?.host, dbConfig?.port, dbConfig?.database, tableName]);

  // 根据 columnFilter 过滤字段
  const filteredColumns = useMemo(() => {
    if (!field.columnFilter) return columns;

    // 时间类型关键词
    const timeTypes = ["datetime", "timestamp", "date", "time", "year"];
    // 数值类型关键词
    const numericTypes = ["int", "bigint", "smallint", "tinyint", "mediumint", "decimal", "float", "double", "numeric", "real", "serial", "bigserial"];

    if (field.columnFilter === "time") {
      return columns.filter(c => {
        const typeLower = c.type.toLowerCase();
        return timeTypes.some(t => typeLower.includes(t));
      });
    }
    if (field.columnFilter === "numeric") {
      return columns.filter(c => {
        const typeLower = c.type.toLowerCase();
        return numericTypes.some(t => typeLower.includes(t));
      });
    }
    return columns;
  }, [columns, field.columnFilter]);

  if (!tableName) {
    return (
      <TextField
        label={field.label}
        value={value ?? ''}
        size="small"
        fullWidth
        placeholder="请先选择表"
        slotProps={{ ...floatedLabelProps }}
        sx={fieldSx}
        disabled
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
      onChange={(e) => onChange(field.key, e.target.value || undefined)}
      sx={fieldSx}
      helperText={loading ? "加载中..." : error ? `错误: ${error}` : filteredColumns.length > 0 ? `共 ${filteredColumns.length} 个${field.columnFilter === "time" ? "时间" : field.columnFilter === "numeric" ? "数值" : ""}字段` : field.columnFilter ? `无${field.columnFilter === "time" ? "时间" : "数值"}字段（共${columns.length}个字段）` : "无可用字段"}
    >
      <MenuItem value="" sx={{ fontSize: 11 }}>
        -- 选择字段 --
      </MenuItem>
      {filteredColumns.map((c) => (
        <MenuItem key={c.name} value={c.name} sx={{ fontSize: 11 }}>
          {c.name} <Typography component="span" variant="caption" sx={{ ml: 0.5, color: "text.secondary", fontSize: 9 }}>{c.type}</Typography>
        </MenuItem>
      ))}
    </TextField>
  );
}

// ─── 滚动状态表格专用：3 个新字段类型组件 ────────────────────────

/**
 * action 字段：点击按钮触发一个动作
 *  - field.action: 动作名（在 actionHandlers 注册的 key）
 *  - 通用实现：调用 useEditorStore 提供的 actionHandlers
 *  - 用途：点击"刷新设备"按钮调 GET /api/devices/
 */
export function ActionField({
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
  // action 字段是纯触发器，不读写 value，void 标记使用避免 ts6133
  void value;
  const [busy, setBusy] = useState(false);
  const handleClick = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      // 通过 editorStore 的 actionHandlers 触发
      // 约定：handler 接受 (config, onChange) 并可写回 config
      const handlers = useEditorStore.getState().actionHandlers;
      if (handlers && field.action && handlers[field.action]) {
        await handlers[field.action](config, onChange);
      } else {
        console.warn("[ActionField] no handler for action:", field.action);
      }
    } catch (e) {
      console.error("[ActionField] error:", e);
    } finally {
      setBusy(false);
    }
  }, [busy, field.action, config, onChange]);

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
      <Typography sx={{ fontSize: 10.5, color: "text.secondary", flex: 1 }}>{field.label}</Typography>
      <Button
        size="small"
        variant="outlined"
        disabled={busy}
        onClick={handleClick}
        sx={{ fontSize: 10.5, py: 0.25, px: 1, minWidth: 0 }}
        startIcon={busy ? <CircularProgress size={10} /> : undefined}
      >
        {field.buttonLabel ?? field.label}
      </Button>
    </Box>
  );
}

/**
 * deviceMultiSelect 字段：设备多选
 *  - 设备列表直接来自 useDeviceStore.devices（已通过 EdgeConductorProvider 加载 + 过滤）
 *  - 选中值以 string[] 存储在 config[field.key]
 *  - 连接状态从 useDataSourceStore.connectionStatuses 读
 *  - 提供"手动刷新"按钮调用 deviceStore.reload()
 *  - 若没设备 / 适配器未配置 → 给出明确提示
 *  - 支持 deviceFilter.productCode 过滤：只显示指定产品码的设备（扁平列表模式）
 *  - 无 deviceFilter 时显示完整设备树（含隶属关系）
 */
export function DeviceMultiSelectField({
  field,
  value,
  onChange,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  config?: Record<string, unknown>;
}) {
  // deviceFilter：控制显示和可选范围
  const deviceFilter = (field as any).deviceFilter as { productCode?: string[] } | undefined;
  const filterProductCodes = deviceFilter?.productCode;
  // 有 productCode 过滤 → 扁平列表模式（只显示匹配设备，不展示子设备树）
  const flatMode = !!filterProductCodes && filterProductCodes.length > 0;

  // 直接从 deviceStore 拿设备（已加载 + 已过滤 + 包含真实字段）
  const devicesMap = useDeviceStore((s) => s.devices) as unknown as Record<string, Record<string, unknown>>;
  const products = useDeviceStore((s) => s.products) as unknown as Record<string, { productName?: string }>;
  const reloadDevices = useDeviceStore((s) => s.reload);
  const activeProvider = useDeviceStore((s) => s.activeProvider);

  // 连接状态：取第一个启用的 http 数据源
  const dataSources = useDataSourceStore((s) => s.dataSources);
  const connectionStatuses = useDataSourceStore((s) => s.connectionStatuses);
  const dataSource = useMemo(
    () => dataSources.find((ds) => ds.type === "http" && ds.enabled),
    [dataSources]
  );
  const connStatus = dataSource ? connectionStatuses[dataSource.id] : undefined;

  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const selected: string[] = Array.isArray(value) ? (value as string[]) : [];

  // 设备列表 = Object.values(devicesMap) — 已经是 DeviceInstance 完整结构
  // flatMode 下只保留匹配 productCode 的设备
  const devices = useMemo(() => {
    const all = Object.values(devicesMap).map((d) => d as unknown as Record<string, unknown>);
    if (flatMode && filterProductCodes) {
      return all.filter(d => filterProductCodes.includes(String(d.productCode ?? "")));
    }
    return all;
  }, [devicesMap, flatMode, filterProductCodes]);

  // 树形结构：父→子的递归
  //  - 根 = parentDeviceId 为空，或 parent 在设备列表里找不到
  //  - 兄弟排序：main → sub → sensor → other；同 category 按 deviceId 字典序
  //  - 搜索时：保留包含匹配子树的根（即使根本身不匹配），子节点递归过滤
  type TreeNode = {
    device: Record<string, unknown>;
    children: TreeNode[];
  };

  const sortDevices = (arr: Array<Record<string, unknown>>) => {
    const catOrder: Record<string, number> = { main: 0, sub: 1, sensor: 2 };
    return arr.sort((a, b) => {
      const ca = catOrder[String(a.category ?? "other")] ?? 9;
      const cb = catOrder[String(b.category ?? "other")] ?? 9;
      if (ca !== cb) return ca - cb;
      return String(a.deviceId).localeCompare(String(b.deviceId));
    });
  };

  const buildTree = useMemo(() => {
    const byId = new Map<string, Record<string, unknown>>();
    for (const d of devices) byId.set(String(d.deviceId), d);

    const childrenOf = new Map<string, Array<Record<string, unknown>>>();
    for (const d of devices) {
      const p = String(d.parentDeviceId ?? "");
      if (p && byId.has(p)) {
        if (!childrenOf.has(p)) childrenOf.set(p, []);
        childrenOf.get(p)!.push(d);
      }
    }
    for (const arr of childrenOf.values()) sortDevices(arr);

    // 根 = 父设备不在设备列表中
    const roots = sortDevices(
      devices.filter((d) => {
        const p = String(d.parentDeviceId ?? "");
        return !p || !byId.has(p);
      })
    );

    const build = (d: Record<string, unknown>): TreeNode => ({
      device: d,
      children: (childrenOf.get(String(d.deviceId)) || []).map(build),
    });

    return roots.map(build);
  }, [devices]);

  // 设备匹配（搜索关键字）
  const matchSelf = (d: Record<string, unknown>, kw: string): boolean => {
    if (!kw) return true;
    return [d.deviceId, d.productName, d.productCode, d.category, d.ip, d.mac, d.parentDeviceId]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(kw));
  };

  // 树形结构 + 搜索过滤
  //  - 节点自身匹配 → 保留整棵子树
  //  - 子孙有匹配 → 保留该节点（即使本身不匹配），子节点递归过滤
  const filterTree = (nodes: TreeNode[], kw: string): TreeNode[] => {
    if (!kw) return nodes;
    const visit = (node: TreeNode): TreeNode | null => {
      const selfMatch = matchSelf(node.device, kw);
      const filteredChildren = node.children.map(visit).filter((c): c is TreeNode => c !== null);
      if (!selfMatch && filteredChildren.length === 0) return null;
      return { device: node.device, children: filteredChildren };
    };
    return nodes.map(visit).filter((n): n is TreeNode => n !== null);
  };

  // 全树统计 = main/sub/sensor
  const groupStats = useMemo(() => {
    const stats: Record<string, number> = { main: 0, sub: 0, sensor: 0, other: 0 };
    for (const d of devices) {
      const c = String(d.category ?? "other");
      stats[c] = (stats[c] ?? 0) + 1;
    }
    return stats;
  }, [devices]);

  // 选中计数 = 已选数 / 全树设备数
  const filteredTree = useMemo(() => {
    return filterTree(buildTree, search.trim().toLowerCase());
  }, [buildTree, search]);

  const collectAllIds = (nodes: TreeNode[]): string[] => {
    const out: string[] = [];
    const walk = (arr: TreeNode[]) => {
      for (const n of arr) {
        out.push(String(n.device.deviceId));
        if (n.children.length > 0) walk(n.children);
      }
    };
    walk(nodes);
    return out;
  };

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(field.key, selected.filter((s) => s !== id));
    } else {
      onChange(field.key, [...selected, id]);
    }
  };

  const selectAll = () => onChange(field.key, collectAllIds(buildTree));
  const clearAll = () => onChange(field.key, []);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      // 优先调 deviceStore.reload()（使用已设置的 provider）
      if (activeProvider) {
        await reloadDevices();
      } else {
        // 没有 provider → 触发自动加载
        const { autoLoadFromAdapters } = useDeviceStore.getState() as unknown as {
          autoLoadFromAdapters: () => Promise<void>;
        };
        await autoLoadFromAdapters();
      }
    } catch (e) {
      console.warn("[DeviceMultiSelectField] refresh failed:", e);
    } finally {
      setRefreshing(false);
    }
  };

  // 连接状态文案
  const statusInfo = (() => {
    if (!dataSource) return { color: "error.main", text: "未找到边缘计算（http 类型）数据源", icon: "⚠" };
    if (!connStatus) return { color: "warning.main", text: "未测试连接（点击刷新自动连接）", icon: "?" };
    switch (connStatus.status) {
      case "connected":    return { color: "success.main", text: `已连接 ${dataSource.connection.url}`, icon: "✓" };
      case "connecting":   return { color: "info.main",    text: "正在连接...", icon: "⟳" };
      case "disconnected": return { color: "warning.main", text: "未连接", icon: "○" };
      case "failed":
      case "error":        return { color: "error.main",   text: `连接失败: ${connStatus.message || "未知错误"}`, icon: "✕" };
      default:             return { color: "text.secondary", text: connStatus.status, icon: "·" };
    }
  })();

  // 隶属关系图（父→子缩进）
  // 设备编号 = productCode + deviceId（例：18001-3），不是 productName 也不是纯 productCode
  const formatDeviceNo = (d: Record<string, unknown>): string => {
    const code = String(d.productCode ?? "").trim();
    const id = String(d.deviceId ?? "").trim();
    if (code && id) return `${code}-${id}`;
    return id || code || "—";
  };

  return (
    <Box>
      {/* 头部：标签 + 计数 */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
        <Typography sx={{ fontSize: 11, color: "text.secondary", fontWeight: 500 }}>{field.label}</Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography sx={{ fontSize: 9, color: "text.disabled" }}>
            已选 {selected.length}/{devices.length}
          </Typography>
          <Button
            size="small"
            variant="text"
            disabled={refreshing}
            onClick={handleRefresh}
            sx={{ fontSize: 9, py: 0, minWidth: 0, px: 0.5 }}
          >
            {refreshing ? "刷新中..." : "刷新"}
          </Button>
        </Box>
      </Box>

      {/* 连接状态 */}
      <Box sx={{
        display: "flex", alignItems: "center", gap: 0.5, mb: 0.75,
        px: 1, py: 0.5, borderRadius: 0.5,
        bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
      }}>
        <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: statusInfo.color, flexShrink: 0 }} />
        <Typography sx={{ fontSize: 10, color: statusInfo.color, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {statusInfo.icon} {statusInfo.text}
        </Typography>
      </Box>

      {flatMode ? (
        // ━━━ 扁平列表模式（deviceFilter 过滤后，只显示匹配设备） ━━━
        <>
          {/* 操作栏 */}
          <Box sx={{ display: "flex", gap: 0.5, mb: 0.5 }}>
            <Button size="small" variant="text" sx={{ fontSize: 9, py: 0, minWidth: 0, px: 0.5 }} onClick={() => onChange(field.key, devices.map(d => String(d.deviceId)))}>
              全选
            </Button>
            <Button size="small" variant="text" sx={{ fontSize: 9, py: 0, minWidth: 0, px: 0.5 }} onClick={() => onChange(field.key, [])}>
              清空
            </Button>
          </Box>

          {/* 扁平设备列表 */}
          <Box sx={{ maxHeight: 200, overflow: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
            {devices.length === 0 ? (
              <Box sx={{ p: 1.5, textAlign: "center" }}>
                <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
                  {dataSource ? "暂无匹配设备，点击「刷新」重新加载" : "未配置边缘计算数据源"}
                </Typography>
              </Box>
            ) : (
              devices.map((d) => {
                const id = String(d.deviceId);
                const checked = selected.includes(id);
                const productDef = products[String(d.productCode ?? "")];
                const displayName = String(d.productName ?? productDef?.productName ?? id);
                return (
                  <Box
                    key={id}
                    onClick={() => toggle(id)}
                    sx={{
                      display: "flex", alignItems: "center", gap: 0.75,
                      px: 1, py: 0.6, cursor: "pointer",
                      bgcolor: checked
                        ? (theme) => theme.palette.mode === "dark" ? "rgba(79,195,247,0.12)" : "rgba(79,195,247,0.08)"
                        : "transparent",
                      "&:hover": { bgcolor: "action.hover" },
                      borderBottom: "1px solid", borderColor: "divider",
                    }}
                  >
                    <Checkbox size="small" checked={checked} sx={{ p: 0, "& .MuiSvgIcon-root": { fontSize: 16 } }} />
                    <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: d.online ? "success.main" : "grey.400", flexShrink: 0 }} />
                    <Typography sx={{ fontSize: 11, fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {displayName}
                    </Typography>
                    <Typography
                      sx={{ fontSize: 9, color: "text.secondary", flexShrink: 0, fontFamily: "monospace" }}
                      title={`设备编号: ${formatDeviceNo(d)}`}
                    >
                      {formatDeviceNo(d)}
                    </Typography>
                    {d.online ? (
                      <Typography sx={{ fontSize: 8, color: "success.main", flexShrink: 0 }}>在线</Typography>
                    ) : (
                      <Typography sx={{ fontSize: 8, color: "text.disabled", flexShrink: 0 }}>离线</Typography>
                    )}
                  </Box>
                );
              })
            )}
          </Box>
        </>
      ) : (
        // ━━━ 完整树形模式（无 deviceFilter，显示全部设备含隶属关系） ━━━
        <>
          {/* 搜索框 */}
          <TextField
            size="small"
            fullWidth
            placeholder="搜索 设备ID/名称/产品码/IP"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{
              ...fieldSx,
              mb: 0.5,
              '& .MuiInputBase-input': { fontSize: 10, py: 0.3, px: 0.75 },
            }}
          />

          {/* 操作栏 */}
          <Box sx={{ display: "flex", gap: 0.5, mb: 0.5, alignItems: "center" }}>
            <Button size="small" variant="text" sx={{ fontSize: 9, py: 0, minWidth: 0, px: 0.5 }} onClick={selectAll}>
              全选
            </Button>
            <Button size="small" variant="text" sx={{ fontSize: 9, py: 0, minWidth: 0, px: 0.5 }} onClick={clearAll}>
              清空
            </Button>
            <Box sx={{ flex: 1 }} />
            <Typography sx={{ fontSize: 9, color: "text.disabled" }}>
              集{groupStats.main} 分{groupStats.sub} 传{groupStats.sensor}
            </Typography>
          </Box>

          {/* 设备列表（按隶属分组） */}
          <Box sx={{ maxHeight: 240, overflow: "auto", border: "1px solid", borderColor: "divider", borderRadius: 0.75 }}>
            {devices.length === 0 ? (
              <Box sx={{ p: 1, textAlign: "center" }}>
                <Typography sx={{ fontSize: 10, color: "text.disabled" }}>
                  {dataSource
                    ? "点击「刷新」加载设备列表"
                    : "未找到边缘计算数据源，请先在「数据源管理」中创建"}
                </Typography>
                {!activeProvider && dataSource && (
                  <Typography sx={{ fontSize: 9, color: "text.disabled", mt: 0.5 }}>
                    提示：还需在「设备适配器」中创建并启用适配器（关联此数据源）
                  </Typography>
                )}
              </Box>
            ) : filteredTree.length === 0 ? (
              <Box sx={{ p: 1, textAlign: "center" }}>
                <Typography sx={{ fontSize: 10, color: "text.disabled" }}>无匹配设备</Typography>
              </Box>
            ) : (
              // 树形结构：每个集控器是一棵独立的子树，子设备用虚线左缩进连接
              (() => {
                // 渲染一行
                const row = (
                  d: Record<string, unknown>,
                  dimmed: boolean, // 搜索时该节点本身不匹配，仅因为有匹配子孙而保留
                  _isLast: boolean
                ) => {
                  const id = String(d.deviceId);
                  const checked = selected.includes(id);
                  const productDef = products[String(d.productCode ?? "")];
                  const displayName = String(d.productName ?? productDef?.productName ?? id);
                  const cat = String(d.category ?? "other");
                  const catColor = cat === "main" ? "#4fc3f7" : cat === "sub" ? "#81c784" : cat === "sensor" ? "#ffb74d" : "#9e9e9e";
                  const dot = d.online ? "success.main" : "grey.400";
                  return (
                    <Box
                      key={id}
                      onClick={() => toggle(id)}
                      sx={{
                        display: "flex", alignItems: "center", gap: 0.5,
                        px: 0.75, py: 0.4, cursor: "pointer",
                        bgcolor: checked ? "action.selected" : "transparent",
                        opacity: dimmed ? 0.55 : 1,
                        "&:hover": { bgcolor: "action.hover" },
                        borderBottom: "1px solid", borderColor: "divider",
                      }}
                    >
                      <Checkbox size="small" checked={checked} sx={{ p: 0, "& .MuiSvgIcon-root": { fontSize: 14 } }} />
                      <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: dot, flexShrink: 0 }} />
                      <Typography sx={{ fontSize: 10, fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {displayName}
                      </Typography>
                      <Typography
                        sx={{ fontSize: 9, color: "text.secondary", flexShrink: 0, fontFamily: "monospace" }}
                        title={`设备编号: ${formatDeviceNo(d)}`}
                      >
                        {formatDeviceNo(d)}
                      </Typography>
                      <Typography sx={{ fontSize: 8, color: catColor, flexShrink: 0, border: `1px solid ${catColor}`, px: 0.4, borderRadius: 0.3, ml: 0.25 }}>
                        {cat}
                      </Typography>
                    </Box>
                  );
                };

                // 递归渲染
                const renderSubTree = (nodes: TreeNode[], depth: number) => {
                  return nodes.map((n) => {
                    const id = String(n.device.deviceId);
                    return (
                      <Box key={id}>
                        {row(n.device, !matchSelf(n.device, search.trim().toLowerCase()) && depth > 0, false)}
                        {n.children.length > 0 && (
                          <Box sx={{
                            ml: 1.25,
                            pl: 1,
                            borderLeft: "1px dashed",
                            borderColor: "divider",
                          }}>
                            {renderSubTree(n.children, depth + 1)}
                          </Box>
                        )}
                      </Box>
                    );
                  });
                };

                return (
                  <Box>
                    {filteredTree.map((root) => {
                      const rootId = String(root.device.deviceId);
                      const rootChildren = root.children.length;
                      return (
                        <Box key={rootId} sx={{ mb: 0.5, border: "1px solid", borderColor: "divider", borderRadius: 0.75, overflow: "hidden" }}>
                          <Box
                            onClick={() => toggle(rootId)}
                            sx={{
                              display: "flex", alignItems: "center", gap: 0.75,
                              px: 0.75, py: 0.5, cursor: "pointer",
                              bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(79,195,247,0.08)" : "rgba(79,195,247,0.12)",
                              borderBottom: "1px solid", borderColor: "divider",
                              "&:hover": { bgcolor: (theme) => theme.palette.mode === "dark" ? "rgba(79,195,247,0.15)" : "rgba(79,195,247,0.2)" },
                            }}
                          >
                            <Checkbox size="small" checked={selected.includes(rootId)} sx={{ p: 0, "& .MuiSvgIcon-root": { fontSize: 14 } }} />
                            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: root.device.online ? "success.main" : "grey.400", flexShrink: 0 }} />
                            <Typography sx={{ fontSize: 11, fontWeight: 600, color: "#4fc3f7", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {String(root.device.productName ?? formatDeviceNo(root.device))}
                            </Typography>
                            <Typography sx={{ fontSize: 9, color: "text.secondary", flexShrink: 0, fontFamily: "monospace" }} title={`设备编号: ${formatDeviceNo(root.device)}`}>
                              {formatDeviceNo(root.device)}
                            </Typography>
                            <Typography sx={{ fontSize: 9, color: "text.disabled", flexShrink: 0 }}>
                              {rootChildren > 0 ? `└ ${rootChildren} 个子设备` : "无子设备"}
                            </Typography>
                          </Box>
                          {rootChildren > 0 && (
                            <Box sx={{ borderLeft: "2px solid", borderColor: "primary.main", ml: 0.5 }}>
                              {renderSubTree(root.children, 1)}
                            </Box>
                          )}
                        </Box>
                      );
                    })}
                  </Box>
                );
              })()
            )}
          </Box>
        </>
      )}
      {field.help && (
        <Typography sx={{ fontSize: 9, color: "text.disabled", mt: 0.5, px: 0.25 }}>{field.help}</Typography>
      )}
    </Box>
  );
}

/**
 * keyValueMapping 字段：键值对列表
 *  - value 存成 Array<{ key: string; value: string }>
 *  - 键=自由输入（表头），值=下拉选（设备字段）
 *  - 用于"列字段映射"：用户自定义表格列+对应设备字段
 */
export function KeyValueMappingField({
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
  const pairs: Array<{ key: string; value: string }> = Array.isArray(value)
    ? (value as Array<{ key: string; value: string }>)
    : [];

  // ── 从 deviceStore 动态获取可用字段 ──
  // 1. 基础字段（所有设备都有）
  // 2. 选中设备的 metadata 字段（含 realtime）
  // 如果 field.valueOptions 有值则优先用静态配置（兼容）
  const devices = useDeviceStore((s) => s.devices);
  const dynamicOptions = useMemo(() => {
    if (field.valueOptions && field.valueOptions.length > 0) return field.valueOptions;

    // 基础字段（固定）
    const baseFields: Array<{ label: string; value: string }> = [
      { label: "设备ID (deviceId)", value: "deviceId" },
      { label: "设备名 (productName)", value: "productName" },
      { label: "产品码 (productCode)", value: "productCode" },
      { label: "分类 (category)", value: "category" },
      { label: "在线状态 (online)", value: "online" },
      { label: "在线文字 (onlineText)", value: "onlineText" },
      { label: "状态机 (stateName)", value: "stateName" },
      { label: "IP地址 (ip)", value: "ip" },
      { label: "MAC地址 (mac)", value: "mac" },
      { label: "父设备 (parentDeviceId)", value: "parentDeviceId" },
    ];

    // 从选中设备的 metadata 收集动态字段
    const selectedIds = (config.selectedDeviceIds as string[]) || [];
    const selSet = new Set(selectedIds);
    const seen = new Set<string>();
    const dynamicFields: Array<{ label: string; value: string }> = [];

    const allDevices = Object.values(devices);
    // 如果没有勾选设备，取所有设备
    const targetDevices = selSet.size > 0 ? allDevices.filter((d) => selSet.has(d.deviceId)) : allDevices;

    for (const d of targetDevices) {
      const meta = (d.metadata as Record<string, unknown> | undefined) || {};
      // metadata 顶层字段（排除 realtime 和内部字段）
      for (const k of Object.keys(meta)) {
        if (k === "realtime" || k.startsWith("_") || seen.has(k)) continue;
        seen.add(k);
        dynamicFields.push({ label: `${k} (${k})`, value: k });
      }
      // realtime 子字段
      const rt = (meta.realtime as Record<string, unknown> | undefined) || {};
      for (const k of Object.keys(rt)) {
        if (seen.has(k)) continue;
        seen.add(k);
        dynamicFields.push({ label: `${k} (${k})`, value: k });
      }
    }

    return [...baseFields, ...dynamicFields];
  }, [field.valueOptions, config.selectedDeviceIds, devices]);

  const keyLabel = field.keyLabel ?? "键";
  const valueLabel = field.valueLabel ?? "值";

  const updatePair = (idx: number, patch: Partial<{ key: string; value: string }>) => {
    const next = pairs.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    onChange(field.key, next);
  };
  const addPair = () => onChange(field.key, [...pairs, { key: "", value: "" }]);
  const removePair = (idx: number) => onChange(field.key, pairs.filter((_, i) => i !== idx));
  const movePair = (idx: number, dir: "up" | "down") => {
    const target = dir === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= pairs.length) return;
    const next = [...pairs];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(field.key, next);
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.25 }}>
        <Typography sx={{ fontSize: 10, color: "text.secondary", fontWeight: 500 }}>{field.label}</Typography>
        <Button size="small" variant="text" sx={{ fontSize: 9, py: 0, minWidth: 0, px: 0.5 }} onClick={addPair}>
          + 添加
        </Button>
      </Box>
      {pairs.length === 0 ? (
        <Box sx={{ p: 0.75, textAlign: "center", border: "1px dashed", borderColor: "divider", borderRadius: 0.75 }}>
          <Typography sx={{ fontSize: 10, color: "text.disabled" }}>暂无映射，点击"添加"新增</Typography>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {pairs.map((p, idx) => (
            <Box key={idx} sx={{ display: "flex", gap: 0.25, alignItems: "center" }}>
              <Box sx={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
                <IconButton
                  size="small"
                  onClick={() => movePair(idx, "up")}
                  disabled={idx === 0}
                  sx={{ p: 0.05, "& .MuiSvgIcon-root": { fontSize: 10 } }}
                >
                  <ArrowUpwardIcon />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => movePair(idx, "down")}
                  disabled={idx === pairs.length - 1}
                  sx={{ p: 0.05, "& .MuiSvgIcon-root": { fontSize: 10 } }}
                >
                  <ArrowDownwardIcon />
                </IconButton>
              </Box>
              <Typography sx={{ fontSize: 9, color: "text.disabled", width: 12, textAlign: "center", flexShrink: 0 }}>
                {idx + 1}
              </Typography>
              <TextField
                size="small"
                placeholder={keyLabel}
                value={p.key}
                onChange={(e) => updatePair(idx, { key: e.target.value })}
                sx={{ ...fieldSx, flex: 1, '& .MuiInputBase-input': { fontSize: 10, py: 0.3, px: 0.75 } }}
              />
              <Typography sx={{ fontSize: 10, color: "text.disabled" }}>→</Typography>
              <TextField
                size="small"
                select
                placeholder={valueLabel}
                value={p.value}
                onChange={(e) => updatePair(idx, { value: e.target.value })}
                sx={{ ...fieldSx, flex: 1.5, '& .MuiInputBase-input': { fontSize: 10, py: 0.3, px: 0.75 } }}
              >
                <MenuItem value="" sx={{ fontSize: 10 }}>-- 选择字段 --</MenuItem>
                {dynamicOptions.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: 10 }}>
                    {opt.label}
                  </MenuItem>
                ))}
              </TextField>
              <IconButton size="small" onClick={() => removePair(idx)} sx={{ p: 0.25 }}>
                <DeleteIcon sx={{ fontSize: 12 }} />
              </IconButton>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

export function DeviceSelectField({
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
  const devices = useDeviceStore((s) => s.devices);
  const productCode = config.productCode as string | undefined;

  const filteredDevices = useMemo(() => {
    const all = Object.values(devices);
    if (!productCode) return all;
    return all.filter((d) => d.productCode === productCode);
  }, [devices, productCode]);

  const selectedDevice = value ? devices[value as string] : undefined;

  return (
    <Box>
      <TextField
        label={field.label}
        value={String(value ?? '')}
        size="small"
        fullWidth
        select
        slotProps={{ ...floatedLabelProps }}
        onChange={(e) => onChange(field.key, e.target.value || undefined)}
        sx={fieldSx}
      >
        <MenuItem value="" sx={{ fontSize: 11 }}>
          {productCode ? `-- 选择${productCode}设备 --` : '-- 请先填写产品识别码 --'}
        </MenuItem>
        {filteredDevices.map((d) => (
          <MenuItem
            key={d.deviceId}
            value={d.deviceId}
            sx={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 0.5 }}
          >
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                bgcolor: d.online ? 'success.main' : 'grey.400',
                flexShrink: 0,
              }}
            />
            <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {d.productName || d.deviceId}
            </Box>
          </MenuItem>
        ))}
      </TextField>
      {selectedDevice && (
        <Box sx={{ mt: 0.25, display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box
            sx={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              bgcolor: selectedDevice.online ? 'success.main' : 'grey.400',
            }}
          />
          <Typography sx={{ fontSize: 9, color: 'text.disabled' }}>
            {selectedDevice.online ? '在线' : '离线'} · {selectedDevice.deviceId}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

export function DeviceStatusSection({ component }: { component: SceneComponent }) {
  const deviceId = component.config.deviceId as string | undefined;
  const productCode = component.config.productCode as string | undefined;
  const device = useDeviceStore((s) => (deviceId ? s.devices[deviceId] : undefined));
  const product = useDeviceStore((s) => (productCode ? s.products[productCode] : undefined));
  const allDevices = useDeviceStore((s) => s.devices);
  const deviceStates = useDeviceStore((s) => s.deviceStates);

  if (!deviceId || !device) return null;

  // ─── 分类推断 ───
  const isAlarm = productCode?.includes('-Alarm-') ?? false;
  const isTouch = productCode?.includes('-Alarm-Touch') ?? false;
  const isInfrared = productCode?.includes('-Alarm-Infrared') ?? false;
  const isDustAlarm = productCode?.includes('-Alarm-Dust') ?? false;
  const md = (device.metadata ?? {}) as Record<string, any>;

  // ─── 报警传感器专属状态 ───
  if (isAlarm) {
    // 触发状态 — 优先读 md.realtime.alarm.value（WS 实时推送），回退到 md.alarm
    const rtAlarm = (md.realtime as Record<string, any>)?.alarm;
    const alarmVal = rtAlarm?.value !== undefined ? rtAlarm.value : md.alarm;
    const triggered = (alarmVal as boolean) === true;
    // 电池预警 — 优先读 md.realtime.batteryWarning.value，回退到 md.batteryWarning
    const rtBw = (md.realtime as Record<string, any>)?.batteryWarning;
    const bwVal = rtBw?.value !== undefined ? rtBw.value : md.batteryWarning;
    const batteryWarn = (bwVal as boolean) === true;
    // 查找父设备（分控器）
    const parentDevice = device.parentDeviceId ? allDevices[device.parentDeviceId] : undefined;

    // 标题与文案分支
    const sectionTitle = isInfrared
      ? '红外对射状态'
      : isTouch
        ? '触控状态'
        : isDustAlarm
          ? '粉尘报警状态'
          : '报警传感器状态';
    // 触发文案 — 协议上粉尘/烟雾/红外/触控都是 alarmSensors 的一位，
    // 差异仅在物理意义（浓度越限 / 光束遮挡 / 已触控 ...）
    const triggerLabel = isInfrared
      ? triggered
        ? '光束遮挡'
        : '对射正常'
      : isTouch
        ? triggered
          ? '已触控'
          : '正常'
        : isDustAlarm
          ? triggered
            ? '浓度越限'
            : '正常'
          : triggered
            ? '已触发'
            : '正常';
    // 触发指示灯颜色：
    //   红外 — 红外红/深红
    //   触控 — 青/琥珀
    //   粉尘 — 棕/橙（区别于烟雾绿红）
    //   其他 — 绿/红
    const ledColor = isInfrared
      ? triggered
        ? '#B71C1C'
        : '#E53935'
      : isTouch
        ? triggered
          ? '#FFB300'
          : '#4A7C8A'
        : isDustAlarm
          ? triggered
            ? '#FF6F00'
            : '#6D4C41'
          : triggered
            ? '#F44336'
            : '#4CAF50';
    const ledShadow = isInfrared
      ? triggered
        ? '0 0 6px rgba(183,28,28,0.7)'
        : '0 0 4px rgba(229,57,53,0.4)'
      : isDustAlarm && triggered
        ? '0 0 6px rgba(255,111,0,0.6)'
        : triggered
          ? '0 0 6px rgba(244,67,54,0.6)'
          : 'none';

    // 告警源细分 — 协议支持 alarm + batteryWarning 两个位独立可读
    const alarmSource: 'alarm' | 'battery' | 'both' | 'normal' =
      triggered && batteryWarn ? 'both' : triggered ? 'alarm' : batteryWarn ? 'battery' : 'normal';
    const alarmSourceLabel =
      alarmSource === 'both'
        ? '浓度越限 + 电池欠压'
        : alarmSource === 'alarm'
          ? '浓度越限'
          : alarmSource === 'battery'
            ? '电池欠压'
            : '—';
    const alarmSourceColor =
      alarmSource === 'normal' ? 'text.disabled' : alarmSource === 'battery' ? 'warning.main' : 'error.main';

    return (
      <CollapsibleSection title={sectionTitle} defaultExpanded>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, pt: 0.25 }}>
          {/* 在线状态 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.15 }}>
            <Box
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: device.online ? 'success.main' : 'grey.400',
                flexShrink: 0,
              }}
            />
            <Typography
              sx={{ fontSize: 10.5, color: device.online ? 'success.main' : 'text.disabled', fontWeight: 500 }}
            >
              {device.online ? '在线' : '离线'}
            </Typography>
            <Typography sx={{ fontSize: 8, color: 'text.disabled', ml: 'auto' }}>继承自分控器</Typography>
          </Box>

          {/* 触发状态 — 核心指标 */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.25 }}>
            <Typography sx={{ fontSize: 9.5, color: 'text.secondary' }}>
              {isInfrared ? '对射状态' : isTouch ? '触控状态' : isDustAlarm ? '浓度状态' : '触发状态'}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: ledColor,
                  boxShadow: ledShadow,
                }}
              />
              <Typography
                sx={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: triggered
                    ? isInfrared
                      ? '#B71C1C'
                      : isDustAlarm
                        ? '#FF6F00'
                        : 'error.main'
                    : isInfrared
                      ? '#E53935'
                      : isDustAlarm
                        ? '#6D4C41'
                        : 'success.main',
                }}
              >
                {triggerLabel}
              </Typography>
            </Box>
          </Box>

          {/* 告警源细分 — 协议支持 alarm + batteryWarning 两路独立位 */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography sx={{ fontSize: 9.5, color: 'text.secondary' }}>告警源</Typography>
            <Typography
              sx={{ fontSize: 9.5, fontWeight: alarmSource === 'normal' ? 400 : 600, color: alarmSourceColor }}
            >
              {alarmSourceLabel}
            </Typography>
          </Box>

          {/* 设备 ID */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography sx={{ fontSize: 9.5, color: 'text.secondary' }}>设备ID</Typography>
            <Typography sx={{ fontSize: 9.5, color: 'text.primary', fontFamily: 'monospace' }}>
              {device.deviceId}
            </Typography>
          </Box>

          {/* 设备名称（用户自定义名 / 别名，协议无此字段，从前端 metadata 读取） */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography sx={{ fontSize: 9.5, color: 'text.secondary' }}>设备名称</Typography>
            <Typography
              sx={{
                fontSize: 9.5,
                color: (md.alias ?? md.deviceName ?? md.displayName) ? 'text.primary' : 'text.disabled',
              }}
            >
              {String(md.alias ?? md.deviceName ?? md.displayName ?? '未命名')}
            </Typography>
          </Box>

          {/* 产品 */}
          {product && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: 9.5, color: 'text.secondary' }}>产品</Typography>
              <Typography sx={{ fontSize: 9.5, color: 'text.primary' }}>{product.productName}</Typography>
            </Box>
          )}

          {/* 状态码（sensorStatusCode，协议通用位域，0x06 系列 / 字段解析规则.json:532-588）
              0=未设置 / 1=读配置错误 / 2=写配置错误 / 3=正常；后端未推送时显示 "—" */}
          {(() => {
            const rtSc = (md.realtime as Record<string, any>)?.sensorStatusCode;
            const rawSc = rtSc?.value !== undefined ? rtSc.value : md.sensorStatusCode;
            const scNum = typeof rawSc === 'number' ? rawSc : parseInt(String(rawSc ?? ''), 10);
            const SENSOR_STATUS_CODE: Record<
              number,
              { label: string; color: 'success.main' | 'error.main' | 'warning.main' | 'text.disabled' }
            > = {
              0: { label: '未设置', color: 'text.disabled' },
              1: { label: '读配置错误', color: 'error.main' },
              2: { label: '写配置错误', color: 'error.main' },
              3: { label: '正常', color: 'success.main' },
            };
            const entry = Number.isFinite(scNum) ? SENSOR_STATUS_CODE[scNum] : undefined;
            return (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ fontSize: 9.5, color: 'text.secondary' }}>状态码</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {entry && Number.isFinite(scNum) && (
                    <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: entry.color, flexShrink: 0 }} />
                  )}
                  <Typography
                    sx={{ fontSize: 9.5, fontWeight: entry ? 600 : 400, color: entry ? entry.color : 'text.disabled' }}
                  >
                    {entry && Number.isFinite(scNum) ? entry.label : '—'}
                  </Typography>
                </Box>
              </Box>
            );
          })()}

          {/* 父设备（分控器） */}
          {parentDevice && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: 9.5, color: 'text.secondary' }}>所属分控器</Typography>
              <Typography sx={{ fontSize: 9.5, color: 'text.primary' }}>
                {parentDevice.productName || parentDevice.deviceId}
              </Typography>
            </Box>
          )}

          {/* 测点标签 */}
          {product?.tags && product.tags.length > 0 && (
            <Box sx={{ mt: 0.25 }}>
              <Typography sx={{ fontSize: 9, color: 'text.disabled', mb: 0.25 }}>测点</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.25 }}>
                {product.tags.map((tag) => (
                  <Chip
                    key={tag.id}
                    label={`${tag.name}${tag.unit ? ` (${tag.unit})` : ''}`}
                    size="small"
                    variant="outlined"
                    sx={{
                      height: 16,
                      fontSize: 8,
                      '& .MuiChip-label': { px: 0.4 },
                      borderColor: tag.id === 'alarm' ? (triggered ? 'error.main' : 'success.main') : undefined,
                      color: tag.id === 'alarm' ? (triggered ? 'error.main' : 'success.main') : undefined,
                    }}
                  />
                ))}
              </Box>
            </Box>
          )}
        </Box>
      </CollapsibleSection>
    );
  }

  // ─── 数值型传感器专属面板（CH4 18012 / CO 18013 / 粉尘 18015 / 温度 18014 / 风速 18010 / 风压 18011）───
  // 协议依据：字段解析规则.json sensorTypeRules + 命令码映射.json 0x061e 实时状态
  //   核心字段：sensorValue（浓度值，单位见 NUMERIC_SENSOR_UNITS）/ sensorFrequency（频率 Hz）/ sensorStatusCode（状态码位域）
  const isNumericSensor = productCode?.includes('-Sensor-') && !isAlarm;
  if (isNumericSensor) {
    // 传感器子类型推断（用于标题和文案差异化）
    const isCH4 = productCode?.includes('-Sensor-CH4') ?? false;
    const isCO = productCode?.includes('-Sensor-CO') ?? false;
    const isDust = productCode?.includes('-Sensor-Dust') ?? false;
    const isTemp = productCode?.includes('-Sensor-Temp') ?? false;
    const isWind = productCode?.includes('-Sensor-Wind') ?? false;
    const isWindPress = productCode?.includes('-Sensor-WindPress') ?? false;

    // 标题与文案
    const sectionTitle = isCH4
      ? '甲烷监测状态'
      : isCO
        ? '一氧化碳监测状态'
        : isDust
          ? '粉尘浓度监测状态'
          : isTemp
            ? '温度监测状态'
            : isWind
              ? '风速监测状态'
              : isWindPress
                ? '风压监测状态'
                : '传感器状态';
    const valueLabel = isCH4
      ? 'CH4 浓度'
      : isCO
        ? 'CO 浓度'
        : isDust
          ? '粉尘浓度'
          : isTemp
            ? '温度'
            : isWind
              ? '风速'
              : isWindPress
                ? '风压'
                : '当前值';

    // 读取实时数据 — 优先 md.realtime.sensorValue.value（WS 推送），回退 md.sensorValue
    const rt = (md.realtime as Record<string, any>) ?? {};
    const sensorValue = rt.sensorValue?.value !== undefined ? rt.sensorValue.value : md.sensorValue;
    const sensorFreq = rt.sensorFrequency?.value !== undefined ? rt.sensorFrequency.value : md.sensorFrequency;
    const rtSc = rt.sensorStatusCode;
    const rawSc = rtSc?.value !== undefined ? rtSc.value : md.sensorStatusCode;
    const scNum = typeof rawSc === 'number' ? rawSc : parseInt(String(rawSc ?? ''), 10);

    // 单位（从 NUMERIC_SENSOR_UNITS 获取，协议规定）
    const unit = product?.tags?.find((t) => t.id === 'sensorValue')?.unit ?? '';

    // 状态码解析（协议 sensorStatusCode 位域）
    const SENSOR_STATUS_CODE: Record<
      number,
      { label: string; color: 'success.main' | 'error.main' | 'warning.main' | 'text.disabled' }
    > = {
      0: { label: '未设置', color: 'text.disabled' },
      1: { label: '读配置错误', color: 'error.main' },
      2: { label: '写配置错误', color: 'error.main' },
      3: { label: '正常', color: 'success.main' },
    };
    const scEntry = Number.isFinite(scNum) ? SENSOR_STATUS_CODE[scNum] : undefined;

    // 查找父设备（分控器）
    const parentDevice = device.parentDeviceId ? allDevices[device.parentDeviceId] : undefined;

    // 数值格式化
    const formatValue = (val: unknown, u: string) => {
      if (val === undefined || val === null || val === '') return '—';
      const n = typeof val === 'number' ? val : parseFloat(String(val));
      if (!Number.isFinite(n)) return '—';
      // CH4/CO 保留 2 位小数，粉尘保留 3 位，温度保留 1 位，风速/风压保留 2 位
      const digits = isDust ? 3 : isTemp ? 1 : 2;
      return `${n.toFixed(digits)} ${u}`;
    };

    return (
      <CollapsibleSection title={sectionTitle} defaultExpanded>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, pt: 0.25 }}>
          {/* 在线状态 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.15 }}>
            <Box
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: device.online ? 'success.main' : 'grey.400',
                flexShrink: 0,
              }}
            />
            <Typography
              sx={{ fontSize: 10.5, color: device.online ? 'success.main' : 'text.disabled', fontWeight: 500 }}
            >
              {device.online ? '在线' : '离线'}
            </Typography>
            <Typography sx={{ fontSize: 8, color: 'text.disabled', ml: 'auto' }}>继承自分控器</Typography>
          </Box>

          {/* 核心指标：当前浓度值（大字显示） */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              py: 0.5,
              mt: 0.25,
              mb: 0.25,
              bgcolor: 'action.hover',
              borderRadius: 0.5,
            }}
          >
            <Typography sx={{ fontSize: 8.5, color: 'text.secondary', mb: 0.15 }}>{valueLabel}</Typography>
            <Typography
              sx={{
                fontSize: 16,
                fontWeight: 700,
                color: device.online ? 'text.primary' : 'text.disabled',
                fontFamily: 'monospace',
                lineHeight: 1.2,
              }}
            >
              {formatValue(sensorValue, unit)}
            </Typography>
          </Box>

          {/* 频率 */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography sx={{ fontSize: 9.5, color: 'text.secondary' }}>采样频率</Typography>
            <Typography sx={{ fontSize: 9.5, color: 'text.primary', fontFamily: 'monospace' }}>
              {sensorFreq !== undefined && sensorFreq !== null && sensorFreq !== ''
                ? `${typeof sensorFreq === 'number' ? sensorFreq : parseFloat(String(sensorFreq))} Hz`
                : '—'}
            </Typography>
          </Box>

          {/* 状态码 */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography sx={{ fontSize: 9.5, color: 'text.secondary' }}>状态码</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {scEntry && Number.isFinite(scNum) && (
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: scEntry.color, flexShrink: 0 }} />
              )}
              <Typography
                sx={{
                  fontSize: 9.5,
                  fontWeight: scEntry ? 600 : 400,
                  color: scEntry ? scEntry.color : 'text.disabled',
                }}
              >
                {scEntry && Number.isFinite(scNum) ? scEntry.label : '—'}
              </Typography>
            </Box>
          </Box>

          {/* 设备 ID */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography sx={{ fontSize: 9.5, color: 'text.secondary' }}>设备ID</Typography>
            <Typography sx={{ fontSize: 9.5, color: 'text.primary', fontFamily: 'monospace' }}>
              {device.deviceId}
            </Typography>
          </Box>

          {/* 设备名称 */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography sx={{ fontSize: 9.5, color: 'text.secondary' }}>设备名称</Typography>
            <Typography
              sx={{
                fontSize: 9.5,
                color: (md.alias ?? md.deviceName ?? md.displayName) ? 'text.primary' : 'text.disabled',
              }}
            >
              {String(md.alias ?? md.deviceName ?? md.displayName ?? '未命名')}
            </Typography>
          </Box>

          {/* 产品 */}
          {product && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: 9.5, color: 'text.secondary' }}>产品</Typography>
              <Typography sx={{ fontSize: 9.5, color: 'text.primary' }}>{product.productName}</Typography>
            </Box>
          )}

          {/* 所属分控器 */}
          {parentDevice && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: 9.5, color: 'text.secondary' }}>所属分控器</Typography>
              <Typography sx={{ fontSize: 9.5, color: 'text.primary' }}>
                {parentDevice.productName || parentDevice.deviceId}
              </Typography>
            </Box>
          )}

          {/* 测点标签 */}
          {product?.tags && product.tags.length > 0 && (
            <Box sx={{ mt: 0.25 }}>
              <Typography sx={{ fontSize: 9, color: 'text.disabled', mb: 0.25 }}>测点</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.25 }}>
                {product.tags.map((tag) => (
                  <Chip
                    key={tag.id}
                    label={`${tag.name}${tag.unit ? ` (${tag.unit})` : ''}`}
                    size="small"
                    variant="outlined"
                    sx={{ height: 16, fontSize: 8, '& .MuiChip-label': { px: 0.4 } }}
                  />
                ))}
              </Box>
            </Box>
          )}
        </Box>
      </CollapsibleSection>
    );
  }

  // ─── 集控器 / 分控器 / 其他 — 通用布局 ───
  return (
    <CollapsibleSection title="设备状态" defaultExpanded>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, pt: 0.25 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.15 }}>
          <Box
            sx={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              bgcolor: device.online ? 'success.main' : 'grey.400',
              flexShrink: 0,
            }}
          />
          <Typography sx={{ fontSize: 10.5, color: device.online ? 'success.main' : 'text.disabled', fontWeight: 500 }}>
            {device.online ? '在线' : '离线'}
          </Typography>
        </Box>
        {/* 设备状态机：统一状态展示（响应式读取） */}
        {(() => {
          const stateName: DeviceStateName = deviceStates[device.deviceId] ?? deviceStateMachine.getDeviceStateName(device.deviceId);
          if (stateName === 'fault') {
            return (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.15 }}>
                <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'error.main', flexShrink: 0, animation: 'fault-blink 1.2s infinite', '@keyframes fault-blink': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } } }} />
                <Typography sx={{ fontSize: 10.5, color: 'error.main', fontWeight: 500 }}>
                  故障{md.faultReason ? `：${md.faultReason}` : ''}
                </Typography>
              </Box>
            );
          }
          if (stateName === 'alarm') {
            return (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.15 }}>
                <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'warning.main', flexShrink: 0 }} />
                <Typography sx={{ fontSize: 10.5, color: 'warning.main', fontWeight: 500 }}>报警中</Typography>
              </Box>
            );
          }
          return null;
        })()}
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography sx={{ fontSize: 9.5, color: 'text.secondary' }}>设备ID</Typography>
          <Typography sx={{ fontSize: 9.5, color: 'text.primary', fontFamily: 'monospace' }}>
            {device.deviceId}
          </Typography>
        </Box>
        {product && (
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography sx={{ fontSize: 9.5, color: 'text.secondary' }}>产品</Typography>
            <Typography sx={{ fontSize: 9.5, color: 'text.primary' }}>{product.productName}</Typography>
          </Box>
        )}
        {product?.tags && product.tags.length > 0 && (
          <Box sx={{ mt: 0.25 }}>
            <Typography sx={{ fontSize: 9, color: 'text.disabled', mb: 0.25 }}>测点</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.25 }}>
              {product.tags.map((tag) => (
                <Chip
                  key={tag.id}
                  label={`${tag.name}${tag.unit ? ` (${tag.unit})` : ''}`}
                  size="small"
                  variant="outlined"
                  sx={{ height: 16, fontSize: 8, '& .MuiChip-label': { px: 0.4 } }}
                />
              ))}
            </Box>
          </Box>
        )}
      </Box>
    </CollapsibleSection>
  );
}
