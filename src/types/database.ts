export type DatabaseType =
  | "greptimedb"
  | "mysql"
  | "postgresql"
  | "mongodb"
  | "redis"
  | "influxdb"
  | "clickhouse";

export type GreptimeDBConnectionMode =
  | "postgresql"
  | "mysql"
  | "http-sql"
  | "http-promql";

export interface DatabaseConnectionConfig {
  dbType: DatabaseType;
  connectionMode?: GreptimeDBConnectionMode;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  options: Record<string, string>;
}

export interface DatabaseTestConfig {
  query: string;
}

export const GREPTIMEDB_CONNECTION_MODE_LABELS: Record<GreptimeDBConnectionMode, string> = {
  postgresql: "PostgreSQL 协议 (端口 4003)",
  mysql: "MySQL 协议 (端口 4002)",
  "http-sql": "HTTP SQL API (端口 4000)",
  "http-promql": "HTTP PromQL API (端口 4000)",
};

export const GREPTIMEDB_CONNECTION_MODE_DEFAULTS: Record<GreptimeDBConnectionMode, { port: number; query: string }> = {
  postgresql: { port: 4003, query: "SELECT 1" },
  mysql: { port: 4002, query: "SELECT 1" },
  "http-sql": { port: 4000, query: "SELECT 1" },
  "http-promql": { port: 4000, query: "up" },
};

export const DATABASE_DEFAULTS: Record<DatabaseType, { port: number; query: string }> = {
  greptimedb: { port: 4003, query: "SELECT 1" },
  mysql: { port: 3306, query: "SELECT 1" },
  postgresql: { port: 5432, query: "SELECT 1" },
  mongodb: { port: 27017, query: "db.runCommand({ ping: 1 })" },
  redis: { port: 6379, query: "PING" },
  influxdb: { port: 8086, query: "buckets()" },
  clickhouse: { port: 8123, query: "SELECT 1" },
};

export const DATABASE_LABELS: Record<DatabaseType, string> = {
  greptimedb: "GreptimeDB",
  mysql: "MySQL",
  postgresql: "PostgreSQL",
  mongodb: "MongoDB",
  redis: "Redis",
  influxdb: "InfluxDB",
  clickhouse: "ClickHouse",
};

export function getDatabasePortDefaults(dbType: DatabaseType, connectionMode?: GreptimeDBConnectionMode): { port: number; query: string } {
  if (dbType === "greptimedb" && connectionMode) {
    return GREPTIMEDB_CONNECTION_MODE_DEFAULTS[connectionMode];
  }
  return DATABASE_DEFAULTS[dbType];
}

export function createDefaultDatabaseConfig(dbType?: DatabaseType, connectionMode?: GreptimeDBConnectionMode): DatabaseConnectionConfig {
  const type = dbType || "mysql";
  const mode = type === "greptimedb" ? (connectionMode || "postgresql") : undefined;
  const defaults = getDatabasePortDefaults(type, mode);
  return {
    dbType: type,
    connectionMode: mode,
    host: "localhost",
    port: defaults.port,
    username: "",
    password: "",
    database: type === "greptimedb" ? "public" : "",
    options: {},
  };
}

export function createDefaultDatabaseTest(dbType?: DatabaseType, connectionMode?: GreptimeDBConnectionMode): DatabaseTestConfig {
  const type = dbType || "mysql";
  const defaults = getDatabasePortDefaults(type, connectionMode);
  return {
    query: defaults.query,
  };
}
