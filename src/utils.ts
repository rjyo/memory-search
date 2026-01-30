export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

let currentLogLevel: LogLevel = "info";

const levelPriority: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return levelPriority[level] >= levelPriority[currentLogLevel];
}

function formatData(data?: Record<string, unknown>): string {
  if (!data || Object.keys(data).length === 0) return "";
  return " " + JSON.stringify(data);
}

export const log: Logger = {
  debug(message: string, data?: Record<string, unknown>): void {
    if (shouldLog("debug")) {
      console.debug(`[memory-search] ${message}${formatData(data)}`);
    }
  },
  info(message: string, data?: Record<string, unknown>): void {
    if (shouldLog("info")) {
      console.info(`[memory-search] ${message}${formatData(data)}`);
    }
  },
  warn(message: string, data?: Record<string, unknown>): void {
    if (shouldLog("warn")) {
      console.warn(`[memory-search] ${message}${formatData(data)}`);
    }
  },
  error(message: string, data?: Record<string, unknown>): void {
    if (shouldLog("error")) {
      console.error(`[memory-search] ${message}${formatData(data)}`);
    }
  },
};
