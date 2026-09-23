import { invoke } from "@tauri-apps/api/core";

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: string;
  module: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp?: number;
}

let logQueue: LogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL = 1000;
const MAX_QUEUE_SIZE = 20;

const isProduction = import.meta.env.PROD;

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await flushLogs();
  }, FLUSH_INTERVAL);
}

async function flushLogs() {
  if (logQueue.length === 0) return;
  const batch = logQueue.splice(0, logQueue.length);
  try {
    // 将 data 对象序列化为 JSON 字符串，与后端 LogEntry.data: Option<String> 对齐
    const entries = batch.map((e) => ({
      ...e,
      data: e.data ? JSON.stringify(e.data) : undefined,
    }));
    await invoke("write_log_batch", { entries });
  } catch {
    // 静默失败，logger 不应阻塞主流程
  }
}

function enqueue(entry: LogEntry) {
  logQueue.push(entry);
  if (logQueue.length >= MAX_QUEUE_SIZE) {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    flushLogs();
  } else {
    scheduleFlush();
  }
}

function createEntry(level: LogLevel, module: string, message: string, data?: Record<string, unknown>): LogEntry {
  return {
    level,
    module,
    message,
    data,
    timestamp: Date.now(),
  };
}

export const logger = {
  debug(module: string, message: string, data?: Record<string, unknown>) {
    if (isProduction) return;
    const entry = createEntry("debug", module, message, data);
    enqueue(entry);
    console.debug(`[${module}] ${message}`, data ?? "");
  },

  info(module: string, message: string, data?: Record<string, unknown>) {
    if (isProduction) return;
    const entry = createEntry("info", module, message, data);
    enqueue(entry);
    console.info(`[${module}] ${message}`, data ?? "");
  },

  warn(module: string, message: string, data?: Record<string, unknown>) {
    const entry = createEntry("warn", module, message, data);
    enqueue(entry);
    console.warn(`[${module}] ${message}`, data ?? "");
  },

  error(module: string, message: string, data?: Record<string, unknown>) {
    const entry = createEntry("error", module, message, data);
    enqueue(entry);
    console.error(`[${module}] ${message}`, data ?? "");
  },

  async flush() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    await flushLogs();
  },

  async getLogDir(): Promise<string> {
    try {
      return await invoke<string>("get_log_dir_path");
    } catch {
      return "";
    }
  },
};

export default logger;
