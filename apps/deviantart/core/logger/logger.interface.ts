import type { LogLevel, LogEntry } from '../../shared/types';

export interface ILogger {
  debug(message: string, context?: string): void;
  info(message: string, context?: string): void;
  success(message: string, context?: string): void;
  warning(message: string, context?: string): void;
  error(message: string, context?: string): void;
  log(level: LogLevel, message: string, context?: string): void;
  getLogs(): Promise<LogEntry[]>;
  clearLogs(): Promise<void>;
}
