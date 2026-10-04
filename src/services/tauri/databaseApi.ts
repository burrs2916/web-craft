import { invoke } from "./invoke";
import type { DatabaseConnectionConfig } from "../../types/database";

export const databaseApi = {
  async testConnection(config: DatabaseConnectionConfig, testQuery?: string): Promise<{ success: boolean; message: string; data?: unknown }> {
    return invoke("db_test_connection", { config, testQuery: testQuery || null });
  },

  async executeQuery(config: DatabaseConnectionConfig, query: string): Promise<{ success: boolean; message: string; data?: unknown; rows?: Record<string, unknown>[]; columns?: string[] }> {
    const result = await invoke<{ success: boolean; message: string; data?: unknown }>("db_execute_query", { config, query });
    // 后端返回 { success, message, data: { rows, columns, rowsAffected } }
    // 提取 rows 和 columns 到顶层，方便调用方使用
    const data = result.data as Record<string, unknown> | undefined;
    return {
      ...result,
      rows: (data?.rows as Record<string, unknown>[]) || (Array.isArray(data) ? data as Record<string, unknown>[] : undefined),
      columns: data?.columns as string[] | undefined,
    };
  },

  /** 获取数据库所有表列表 */
  async getTables(config: DatabaseConnectionConfig): Promise<string[]> {
    const dbType = config.dbType;
    // 不同数据库的表列表查询 SQL
    const tableQueries: Record<string, string> = {
      mysql: `SHOW TABLES`,
      postgresql: `SELECT tablename as name FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
      greptimedb: `SHOW TABLES`,
      clickhouse: `SHOW TABLES`,
      influxdb: `SHOW MEASUREMENTS`,
      mongodb: `SELECT name FROM system.collections`,
      redis: `SELECT 1`,
    };
    const query = tableQueries[dbType] || tableQueries.mysql;
    console.log('[getTables] dbType:', dbType, 'query:', query);
    const result = await this.executeQuery(config, query);
    console.log('[getTables] result:', JSON.stringify(result).slice(0, 500));
    if (!result.success) return [];

    // executeQuery 已将 rows 提取到顶层
    const rows = result.rows || [];
    console.log('[getTables] rows count:', rows.length, 'first row:', rows[0] ? JSON.stringify(rows[0]) : 'empty');

    return rows.map((row) => {
      // SHOW TABLES 返回格式：MySQL 返回 { "Tables_in_xxx": "tablename" }
      // 尝试所有可能的字段名
      const name = row.name || row.TABLE_NAME || row.tablename || row.measurement ||
        row.Tables_in_database || row[`Tables_in_${config.database}`] ||
        Object.values(row)[0];
      return String(name);
    }).filter(Boolean);
  },

  /** 获取表的所有字段列表 */
  async getColumns(config: DatabaseConnectionConfig, table: string): Promise<Array<{ name: string; type: string }>> {
    const dbType = config.dbType;
    const columnQueries: Record<string, string> = {
      mysql: `SHOW COLUMNS FROM \`${table}\``,
      postgresql: `SELECT column_name as name, data_type as type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${table}' ORDER BY ordinal_position`,
      greptimedb: `DESC ${table}`,
      clickhouse: `DESC ${table}`,
      influxdb: `SHOW FIELD KEYS FROM ${table}`,
      mongodb: `SELECT * FROM ${table} LIMIT 1`,
      redis: `SELECT 1`,
    };
    const query = columnQueries[dbType] || columnQueries.mysql;
    console.log('[getColumns] dbType:', dbType, 'table:', table, 'query:', query);
    const result = await this.executeQuery(config, query);
    console.log('[getColumns] result:', JSON.stringify(result).slice(0, 500));
    if (!result.success) return [];

    // executeQuery 已将 rows 提取到顶层
    const rows = result.rows || [];
    console.log('[getColumns] rows count:', rows.length, 'first row:', rows[0] ? JSON.stringify(rows[0]) : 'empty');

    return rows.map((row) => {
      // SHOW COLUMNS FROM 返回：{ Field: "id", Type: "int(11)", ... }
      // INFORMATION_SCHEMA 返回：{ name: "id", type: "int" }
      const name = String(row.name || row.column_name || row.COLUMN_NAME || row.Field || row.field || Object.keys(row)[0] || "");
      const type = String(row.type || row.data_type || row.DATA_TYPE || row.Type || "unknown");
      return { name, type };
    }).filter(c => c.name);
  },
};