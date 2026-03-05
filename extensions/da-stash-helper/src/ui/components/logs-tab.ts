/**
 * LogsTab — real-time log viewer component.
 *
 * Displays logger output in a scrollable list.
 * Subscribes to log:entry events via EventBus.
 */

import { BaseComponent } from './base-component';
import type { IEventBus } from '../../core/events/event-bus';
import type { EventMap } from '../../core/events/event-types';
import type { IStorageAdapter } from '../../platform/interfaces';
import type { LogEntry } from '../../shared/types';
import { STORAGE_KEYS } from '../../shared/constants';

const LOG_COLORS: Record<string, string> = {
  debug: 'var(--dsh-text-secondary)',
  info: 'var(--dsh-info)',
  success: 'var(--dsh-success)',
  warning: 'var(--dsh-warning)',
  error: 'var(--dsh-error)',
};

const MAX_VISIBLE_LOGS = 200;

export class LogsTab extends BaseComponent {
  private logList: HTMLElement;
  private clearButton: HTMLButtonElement;
  private eventBus: IEventBus<EventMap> | null = null;
  private storage: IStorageAdapter | null = null;
  private unsubLog: (() => void) | null = null;
  private logCount = 0;

  constructor() {
    super('div', 'dsh-logs-tab');

    this.logList = document.createElement('div');
    this.logList.className = 'dsh-log-list';
    this.logList.style.cssText = `
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 11px;
      line-height: 1.5;
      padding: 8px;
      overflow-y: auto;
      max-height: calc(100vh - 140px);
    `;

    this.clearButton = document.createElement('button');
    this.clearButton.textContent = 'Clear Logs';
    this.clearButton.className = 'dsh-clear-logs';
    this.clearButton.style.cssText = `
      margin: 8px;
      padding: 4px 12px;
      background: var(--dsh-bg-tertiary);
      color: var(--dsh-text-tertiary);
      border: 1px solid var(--dsh-border-hover);
      border-radius: var(--dsh-radius-sm);
      cursor: pointer;
      font-size: 12px;
    `;
  }

  /**
   * Provide an EventBus for log event subscription.
   */
  setEventBus(eventBus: IEventBus<EventMap>): this {
    this.eventBus = eventBus;
    return this;
  }

  /**
   * Provide a StorageAdapter to load historical logs on mount.
   */
  setStorage(storage: IStorageAdapter): this {
    this.storage = storage;
    return this;
  }

  protected render(): void {
    this.el.appendChild(this.clearButton);
    this.el.appendChild(this.logList);
  }

  protected onMount(): void {
    // Load historical logs from storage
    this.loadHistory();

    // Listen for live log events
    if (this.eventBus) {
      this.unsubLog = this.eventBus.on('log:entry', (data) => {
        this.addLogEntry(data.level, data.message, data.context, Date.now());
      });
    }

    // Clear button — clears display and storage
    this.on(this.clearButton, 'click', () => {
      while (this.logList.firstChild) {
        this.logList.removeChild(this.logList.firstChild);
      }
      this.logCount = 0;
      this.storage?.remove(STORAGE_KEYS.LOGS).catch(() => {});
    });
  }

  private async loadHistory(): Promise<void> {
    if (!this.storage) return;

    try {
      const entries = await this.storage.get<LogEntry[]>(STORAGE_KEYS.LOGS);
      if (!entries || entries.length === 0) return;

      // Render last MAX_VISIBLE_LOGS entries
      const recent = entries.slice(-MAX_VISIBLE_LOGS);
      for (const entry of recent) {
        this.addLogEntry(entry.level, entry.message, entry.context, entry.timestamp);
      }
    } catch {
      // Storage unavailable — skip history
    }
  }

  protected onUnmount(): void {
    if (this.unsubLog) {
      this.unsubLog();
      this.unsubLog = null;
    }
  }

  private addLogEntry(level: string, message: string, context?: string, timestamp?: number): void {
    // Trim old logs
    if (this.logCount >= MAX_VISIBLE_LOGS) {
      const first = this.logList.firstChild;
      if (first) this.logList.removeChild(first);
    } else {
      this.logCount++;
    }

    const entry = document.createElement('div');
    entry.style.cssText = `
      padding: 2px 0;
      border-bottom: 1px solid var(--dsh-border);
      word-break: break-word;
    `;

    const time = document.createElement('span');
    time.style.color = 'var(--dsh-text-muted)';
    time.textContent = new Date(timestamp ?? Date.now()).toLocaleTimeString() + ' ';

    const levelSpan = document.createElement('span');
    levelSpan.style.color = LOG_COLORS[level] ?? 'var(--dsh-text-secondary)';
    levelSpan.textContent = `[${level.toUpperCase()}] `;

    const contextSpan = document.createElement('span');
    if (context) {
      contextSpan.style.color = 'var(--dsh-text-secondary)';
      contextSpan.textContent = `[${context}] `;
    }

    const msgSpan = document.createElement('span');
    msgSpan.style.color = 'var(--dsh-text-primary)';
    msgSpan.textContent = message;

    entry.appendChild(time);
    entry.appendChild(levelSpan);
    if (context) entry.appendChild(contextSpan);
    entry.appendChild(msgSpan);

    this.logList.appendChild(entry);

    // Auto-scroll to bottom
    this.logList.scrollTop = this.logList.scrollHeight;
  }
}
