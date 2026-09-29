/**
 * 数据库相关字段：数据表选择、数据列选择。
 * 从 legacyIotWidgets.tsx 迁出，仅做代码搬迁。
 */
import { useEffect, useMemo, useState } from 'react';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { useDataSourceStore } from '../../../../store/datasourceStore';
import { databaseApi } from '../../../../services/tauri';
import type { ConfigField } from '../../../../types/editor';
import { fieldSx, floatedLabelProps } from '../sharedStyles';

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
