import type { ILogger } from './logger.interface';
import type { LogLevel, LogEntry } from '../../shared/types';
import type { IStorageAdapter } from '../../platform/interfaces';
import type { IEventBus } from '../events/event-bus';
import type { EventMap } from '../events/event-types';
import { STORAGE_KEYS } from '../../shared/constants';

const MAX_LOGS = 500;

const LOG_COLORS: Record<LogLevel, string> = {
  debug: '#888',
  info: '#4fc3f7',
  success: '#66bb6a',
  warning: '#ffa726',
  error: '#ef5350',
};

const LOG_PREFIX = '[DA Stash Helper]';

export class Logger implements ILogger {
  private buffer: LogEntry[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private storage: IStorageAdapter,
    private eventBus?: IEventBus<EventMap>,
  ) {}

  debug(message: string, context?: string): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: string): void {
    this.log('info', message, context);
  }

  success(message: string, context?: string): void {
    this.log('success', message, context);
  }

  warning(message: string, context?: string): void {
    this.log('warning', message, context);
  }

  error(message: string, context?: string): void {
    this.log('error', message, context);
  }

  log(level: LogLevel, message: string, context?: string): void {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      context,
    };

    // Console output with color
    const color = LOG_COLORS[level];
    const prefix = context ? `${LOG_PREFIX} [${context}]` : LOG_PREFIX;
    console.log(`%c${prefix} ${message}`, `color: ${color}`);

    // Buffer for storage (debounced flush)
    this.buffer.push(entry);
    this.scheduleFlush();

    // Emit event for live log viewers
    this.eventBus?.emit('log:entry', { level, message, context });
  }

  async getLogs(): Promise<LogEntry[]> {
    const stored = await this.storage.get<LogEntry[]>(STORAGE_KEYS.LOGS);
    return [...(stored || []), ...this.buffer];
  }

  async clearLogs(): Promise<void> {
    this.buffer = [];
    await this.storage.remove(STORAGE_KEYS.LOGS);
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => this.flush(), 1000);
  }

  private async flush(): Promise<void> {
    this.flushTimer = null;
    if (this.buffer.length === 0) return;

    try {
      const existing = (await this.storage.get<LogEntry[]>(STORAGE_KEYS.LOGS)) || [];
      const combined = [...existing, ...this.buffer].slice(-MAX_LOGS);
      this.buffer = [];
      await this.storage.set(STORAGE_KEYS.LOGS, combined);
    } catch {
      // Storage might be unavailable — keep buffer
    }
  }
}
