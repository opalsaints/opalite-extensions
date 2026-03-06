/**
 * LogsDrawer — collapsible log viewer at the bottom of the sidebar.
 *
 * Toggle bar shows "Logs" + error count badge.
 * Expanding mounts the existing LogsTab inside.
 * Uses CSS max-height transition for smooth open/close.
 */

import { BaseComponent } from './base-component';
import { LogsTab } from './logs-tab';
import type { IEventBus } from '../../core/events/event-bus';
import type { EventMap } from '../../core/events/event-types';
import type { IStorageAdapter } from '../../platform/interfaces';

export class LogsDrawer extends BaseComponent {
  private toggleBar: HTMLElement;
  private toggleLabel: HTMLSpanElement;
  private toggleArrow: HTMLSpanElement;
  private errorBadge: HTMLSpanElement;
  private drawerContent: HTMLElement;
  private logsTab: LogsTab;
  private isOpen = false;
  private isLogsMounted = false;
  private eventBus: IEventBus<EventMap> | null = null;
  private storage: IStorageAdapter | null = null;
  private unsubLog: (() => void) | null = null;
  private errorCount = 0;

  constructor() {
    super('div', 'dsh-logs-drawer');

    this.el.style.cssText = `
      border-top: 1px solid var(--dsh-border);
      margin-top: auto;
    `;

    // Toggle bar
    this.toggleBar = document.createElement('div');
    this.toggleBar.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 12px;
      background: var(--dsh-bg-secondary);
      cursor: pointer;
      user-select: none;
    `;

    const leftSide = document.createElement('div');
    leftSide.style.cssText = 'display: flex; align-items: center; gap: 6px;';

    this.toggleLabel = document.createElement('span');
    this.toggleLabel.textContent = 'Logs';
    this.toggleLabel.style.cssText = 'font-size: 11px; font-weight: 600; color: var(--dsh-text-secondary); text-transform: uppercase; letter-spacing: 0.5px;';

    this.errorBadge = document.createElement('span');
    this.errorBadge.style.cssText = `
      display: none;
      padding: 1px 6px;
      border-radius: 8px;
      font-size: 9px;
      font-weight: 700;
      background: rgba(245, 57, 72, 0.2);
      color: var(--dsh-error);
    `;

    leftSide.appendChild(this.toggleLabel);
    leftSide.appendChild(this.errorBadge);

    this.toggleArrow = document.createElement('span');
    this.toggleArrow.textContent = '\u25B2';
    this.toggleArrow.style.cssText = `
      font-size: 8px;
      color: var(--dsh-text-secondary);
      transition: transform 0.2s;
      transform: rotate(180deg);
    `;

    this.toggleBar.appendChild(leftSide);
    this.toggleBar.appendChild(this.toggleArrow);

    // Drawer content area
    this.drawerContent = document.createElement('div');
    this.drawerContent.style.cssText = `
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s ease;
    `;

    // Create logs tab instance
    this.logsTab = new LogsTab();
  }

  setEventBus(eventBus: IEventBus<EventMap>): this {
    this.eventBus = eventBus;
    return this;
  }

  setStorage(storage: IStorageAdapter): this {
    this.storage = storage;
    return this;
  }

  protected render(): void {
    this.el.appendChild(this.toggleBar);
    this.el.appendChild(this.drawerContent);
  }

  protected onMount(): void {
    // Toggle drawer on click
    this.on(this.toggleBar, 'click', () => this.toggle());

    // Track error count from log events
    if (this.eventBus) {
      this.unsubLog = this.eventBus.on('log:entry', (data) => {
        if (data.level === 'error') {
          this.errorCount++;
          this.updateErrorBadge();
        }
      });
    }
  }

  protected onUnmount(): void {
    if (this.unsubLog) {
      this.unsubLog();
      this.unsubLog = null;
    }
    if (this.isLogsMounted) {
      this.logsTab.unmount();
      this.isLogsMounted = false;
    }
  }

  private toggle(): void {
    this.isOpen = !this.isOpen;

    if (this.isOpen) {
      // Mount logs tab on first open
      if (!this.isLogsMounted) {
        if (this.eventBus) this.logsTab.setEventBus(this.eventBus);
        if (this.storage) this.logsTab.setStorage(this.storage);
        if (this.store) this.logsTab.setStore(this.store);
        this.logsTab.mount(this.drawerContent);
        this.isLogsMounted = true;
      }
      this.drawerContent.style.maxHeight = '250px';
      this.toggleArrow.style.transform = 'rotate(0deg)';

      // Clear error badge when opened
      this.errorCount = 0;
      this.updateErrorBadge();
    } else {
      this.drawerContent.style.maxHeight = '0';
      this.toggleArrow.style.transform = 'rotate(180deg)';
    }
  }

  private updateErrorBadge(): void {
    if (this.errorCount > 0) {
      this.errorBadge.textContent = String(this.errorCount);
      this.errorBadge.style.display = '';
    } else {
      this.errorBadge.style.display = 'none';
    }
  }
}
