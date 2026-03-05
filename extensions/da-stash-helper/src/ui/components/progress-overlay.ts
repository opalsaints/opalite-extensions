/**
 * ProgressOverlay — shows automation progress with pause/resume/cancel.
 *
 * Renders a progress bar + status text + control buttons.
 * Subscribes to automation:progress events via EventBus.
 */

import { BaseComponent } from './base-component';
import type { IEventBus } from '../../core/events/event-bus';
import type { EventMap } from '../../core/events/event-types';

export class ProgressOverlay extends BaseComponent {
  private progressBar: HTMLElement;
  private progressFill: HTMLElement;
  private statusText: HTMLElement;
  private itemText: HTMLElement;
  private etaText: HTMLElement;
  private pauseBtn: HTMLButtonElement;
  private cancelBtn: HTMLButtonElement;

  private eventBus: IEventBus<EventMap> | null = null;
  private unsubProgress: (() => void) | null = null;
  private unsubComplete: (() => void) | null = null;
  private isPaused = false;

  constructor() {
    super('div', 'dsh-progress-overlay');

    this.el.style.cssText = `
      padding: 12px;
      background: var(--dsh-bg-secondary);
      border: 1px solid var(--dsh-border);
      border-radius: var(--dsh-radius-lg);
      margin: 8px;
      display: none;
    `;

    this.statusText = document.createElement('div');
    this.statusText.style.cssText = 'font-size: 13px; font-weight: 600; margin-bottom: 8px;';

    this.itemText = document.createElement('div');
    this.itemText.style.cssText = 'font-size: 11px; color: var(--dsh-text-secondary); margin-bottom: 4px;';

    this.etaText = document.createElement('div');
    this.etaText.style.cssText = 'font-size: 11px; color: var(--dsh-text-secondary); margin-bottom: 8px; display: none;';

    this.progressBar = document.createElement('div');
    this.progressBar.style.cssText = `
      width: 100%;
      height: 6px;
      background: var(--dsh-border);
      border-radius: 3px;
      overflow: hidden;
      margin-bottom: 10px;
    `;

    this.progressFill = document.createElement('div');
    this.progressFill.style.cssText = `
      height: 100%;
      width: 0%;
      background: var(--dsh-accent);
      border-radius: 3px;
      transition: width 0.3s ease;
    `;
    this.progressBar.appendChild(this.progressFill);

    this.pauseBtn = document.createElement('button');
    this.pauseBtn.textContent = 'Pause';
    this.pauseBtn.style.cssText = `
      padding: 4px 12px;
      background: var(--dsh-bg-tertiary);
      color: var(--dsh-text-tertiary);
      border: 1px solid var(--dsh-border-hover);
      border-radius: var(--dsh-radius-sm);
      cursor: pointer;
      margin-right: 8px;
      font-size: 12px;
    `;

    this.cancelBtn = document.createElement('button');
    this.cancelBtn.textContent = 'Cancel';
    this.cancelBtn.style.cssText = `
      padding: 4px 12px;
      background: rgba(245, 57, 72, 0.1);
      color: var(--dsh-error);
      border: 1px solid var(--dsh-error);
      border-radius: var(--dsh-radius-sm);
      cursor: pointer;
      font-size: 12px;
    `;
  }

  setEventBus(eventBus: IEventBus<EventMap>): this {
    this.eventBus = eventBus;
    return this;
  }

  protected render(): void {
    this.el.appendChild(this.statusText);
    this.el.appendChild(this.itemText);
    this.el.appendChild(this.etaText);
    this.el.appendChild(this.progressBar);

    const controls = document.createElement('div');
    controls.style.cssText = 'display: flex; gap: 8px;';
    controls.appendChild(this.pauseBtn);
    controls.appendChild(this.cancelBtn);
    this.el.appendChild(controls);
  }

  protected onMount(): void {
    if (!this.eventBus) return;

    // Listen for progress updates
    this.unsubProgress = this.eventBus.on('automation:progress', (data) => {
      this.show();
      this.update(data.current, data.total, data.currentItem, data.status, data.etaMs);
    });

    // Listen for completion
    this.unsubComplete = this.eventBus.on('automation:completed', () => {
      this.hide();
    });

    // Pause/Resume button
    this.on(this.pauseBtn, 'click', () => {
      if (this.isPaused) {
        this.eventBus?.emit('command:resume', undefined);
        this.pauseBtn.textContent = 'Pause';
        this.isPaused = false;
      } else {
        this.eventBus?.emit('command:pause', undefined);
        this.pauseBtn.textContent = 'Resume';
        this.isPaused = true;
      }
    });

    // Cancel button
    this.on(this.cancelBtn, 'click', () => {
      this.eventBus?.emit('command:cancel', undefined);
    });
  }

  protected onUnmount(): void {
    this.unsubProgress?.();
    this.unsubComplete?.();
    this.unsubProgress = null;
    this.unsubComplete = null;
  }

  show(): void {
    this.el.style.display = '';
  }

  hide(): void {
    this.el.style.display = 'none';
    this.isPaused = false;
    this.pauseBtn.textContent = 'Pause';
  }

  private update(current: number, total: number, currentItem?: string, status?: string, etaMs?: number): void {
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    this.progressFill.style.width = `${pct}%`;
    this.statusText.textContent = `${status === 'paused' ? 'Paused' : 'Processing'}: ${current}/${total} (${pct}%)`;
    this.itemText.textContent = currentItem ? `Current: ${currentItem}` : '';

    if (etaMs != null && etaMs > 0) {
      this.etaText.textContent = `~${formatEta(etaMs)} remaining`;
      this.etaText.style.display = '';
    } else {
      this.etaText.style.display = 'none';
    }

    if (status === 'paused') {
      this.progressFill.style.background = 'var(--dsh-warning)';
    } else {
      this.progressFill.style.background = 'var(--dsh-accent)';
    }
  }
}

function formatEta(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return `${hours}h ${remainMinutes}m`;
}
