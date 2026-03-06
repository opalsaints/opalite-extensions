/**
 * ScheduleTab — schedule configuration form with per-item preview.
 *
 * Controls:
 *   - Start Date (date picker)
 *   - Start Hour (AM/PM select dropdown, matching DA's format)
 *   - Interval (select dropdown: 30min, 1hr, 2hr, 3hr, 4hr)
 *   - Time Window start/end (AM/PM select dropdowns)
 *   - Per-item schedule preview list
 *   - Start Scheduling button
 *
 * Emits command:start-schedule when the user clicks Start.
 */

import { BaseComponent } from './base-component';
import type { IEventBus } from '../../core/events/event-bus';
import type { EventMap } from '../../core/events/event-types';
import type { ScheduleConfig, BulkScope } from '../../shared/types';
import { DEFAULTS } from '../../shared/constants';
import { SCOPE_OPTIONS, buildScopeSelector } from './scope-selector';
import {
  todayISO,
  daysNeeded,
  itemsPerDay,
  generateScheduleSlots,
  formatDisplayTime,
} from '../../shared/date-utils';

// Interval presets (value in minutes → display label)
// DA only supports whole-hour scheduling, so no sub-hour options.
const INTERVAL_OPTIONS = [
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: 180, label: '3 hours' },
  { value: 240, label: '4 hours' },
  { value: 360, label: '6 hours' },
  { value: 480, label: '8 hours' },
  { value: 720, label: '12 hours' },
  { value: 1440, label: '1 day' },
  { value: 2880, label: '2 days' },
  { value: 4320, label: '3 days' },
  { value: 10080, label: '1 week' },
];

export class ScheduleTab extends BaseComponent {
  private eventBus: IEventBus<EventMap> | null = null;
  private dateInput!: HTMLInputElement;
  private hourSelect!: HTMLSelectElement;
  private intervalSelect!: HTMLSelectElement;
  private windowStartSelect!: HTMLSelectElement;
  private windowEndSelect!: HTMLSelectElement;
  private summaryText!: HTMLElement;
  private previewList!: HTMLElement;
  private startButton!: HTMLButtonElement;
  private scopeOptionEls: HTMLElement[] = [];
  private currentScope: BulkScope = 'selected';

  constructor() {
    super('div', 'dsh-schedule-tab');
  }

  setEventBus(eventBus: IEventBus<EventMap>): this {
    this.eventBus = eventBus;
    return this;
  }

  protected render(): void {
    // Scope selector (4-option radio list)
    this.renderScopeSelector();

    // Start Date
    this.dateInput = this.createInput('date', 'Start Date', todayISO());

    // Start Hour (AM/PM select)
    this.hourSelect = this.createHourSelect('Start Hour', 9);

    // Interval
    this.intervalSelect = this.createIntervalSelect();

    // Time Window
    const windowRow = document.createElement('div');
    windowRow.style.cssText = 'display: flex; gap: 8px;';

    const winStartGroup = document.createElement('div');
    winStartGroup.style.cssText = 'flex: 1;';
    this.windowStartSelect = this.createHourSelect('Window Start', DEFAULTS.WINDOW_START);
    winStartGroup.appendChild(this.windowStartSelect.parentElement!);

    const winEndGroup = document.createElement('div');
    winEndGroup.style.cssText = 'flex: 1;';
    this.windowEndSelect = this.createHourSelect('Window End', DEFAULTS.WINDOW_END);
    winEndGroup.appendChild(this.windowEndSelect.parentElement!);

    windowRow.appendChild(winStartGroup);
    windowRow.appendChild(winEndGroup);
    this.el.appendChild(windowRow);

    // Summary
    this.summaryText = document.createElement('div');
    this.summaryText.style.cssText = 'font-size: 11px; color: var(--dsh-text-tertiary); margin: 8px 0; padding: 8px; background: var(--dsh-bg-tertiary); border-radius: var(--dsh-radius-sm);';
    this.el.appendChild(this.summaryText);

    // Per-item preview list
    this.previewList = document.createElement('div');
    this.previewList.style.cssText = 'max-height: 200px; overflow-y: auto; margin: 8px 0; font-size: 11px;';
    this.el.appendChild(this.previewList);

    // Start Button
    this.startButton = document.createElement('button');
    this.startButton.textContent = 'Start Scheduling';
    this.startButton.className = 'dsh-btn dsh-btn-primary';
    this.startButton.style.cssText = 'width: 100%; margin-top: 8px;';
    this.el.appendChild(this.startButton);

    this.updateSummary();
  }

  protected onMount(): void {
    // Update on any input change
    this.on(this.dateInput, 'input', () => this.updateSummary());
    this.on(this.hourSelect, 'change', () => this.updateSummary());
    this.on(this.intervalSelect, 'change', () => this.updateSummary());
    this.on(this.windowStartSelect, 'change', () => this.updateSummary());
    this.on(this.windowEndSelect, 'change', () => this.updateSummary());

    // Scope option click handlers
    for (const el of this.scopeOptionEls) {
      this.on(el, 'click', () => {
        const scope = el.dataset.scope as BulkScope;
        if (scope) this.setScope(scope);
      });
    }

    // Start button
    this.on(this.startButton, 'click', () => this.handleStart());

    // Watch selection, items, and pageInfo to update preview
    this.watch(
      (state) => state.selectedIds.length,
      () => this.updateSummary(),
    );
    this.watch(
      (state) => state.items,
      () => this.updateSummary(),
    );
    this.watch(
      (state) => state.pageInfo.totalItems,
      () => this.updateSummary(),
    );
  }

  private handleStart(): void {
    if (!this.eventBus) return;

    const config: ScheduleConfig = {
      startDate: this.dateInput.value,
      startHour: parseInt(this.hourSelect.value, 10),
      intervalMinutes: parseInt(this.intervalSelect.value, 10),
      windowStart: parseInt(this.windowStartSelect.value, 10),
      windowEnd: parseInt(this.windowEndSelect.value, 10),
      setTier: false,
      tierIds: [],
      scope: this.currentScope,
    };

    this.eventBus.emit('command:start-schedule', config);
  }

  private updateSummary(): void {
    const state = this.store?.getState();
    const selectedIds = state?.selectedIds ?? [];
    const items = state?.items ?? [];
    const totalItems = state?.pageInfo?.totalItems ?? 0;

    // Determine item count based on scope
    const isSelected = this.currentScope === 'selected';
    const itemCount = isSelected ? selectedIds.length : totalItems;

    const interval = parseInt(this.intervalSelect.value, 10) || DEFAULTS.INTERVAL_MINUTES;
    const winStart = parseInt(this.windowStartSelect.value, 10) || DEFAULTS.WINDOW_START;
    const winEnd = parseInt(this.windowEndSelect.value, 10) || DEFAULTS.WINDOW_END;

    if (itemCount === 0) {
      this.summaryText.textContent = isSelected
        ? 'Select items to see schedule preview.'
        : 'No items found in the selected scope.';
      clearChildren(this.previewList);
      this.startButton.disabled = true;
      return;
    }

    const perDay = itemsPerDay(winStart, winEnd, interval);
    const days = daysNeeded(itemCount, winStart, winEnd, interval);
    const startHour = parseInt(this.hourSelect.value, 10);

    // Show a sensible summary for both hourly and day-based intervals
    const isDayInterval = interval >= 1440;
    const scopeLabel = SCOPE_OPTIONS.find((o) => o.value === this.currentScope)?.label ?? this.currentScope;
    this.summaryText.textContent = isDayInterval
      ? `${itemCount} items (${scopeLabel}) \u00b7 ${days} day(s) span`
      : `${itemCount} items (${scopeLabel}) \u00b7 ~${perDay}/day \u00b7 ${days} day(s) needed`;

    // Generate preview slots
    const slots = generateScheduleSlots(
      itemCount,
      this.dateInput.value || todayISO(),
      startHour,
      interval,
      winStart,
      winEnd,
    );

    // Build per-item preview (only for selected items mode — other scopes don't have item names yet)
    const selectedItems = items.filter((i) => selectedIds.includes(i.id));
    clearChildren(this.previewList);

    const previewCount = isSelected ? slots.length : Math.min(slots.length, 10);
    for (let i = 0; i < previewCount; i++) {
      const slot = slots[i];
      const item = isSelected ? selectedItems[i] : null;
      const title = item?.title || `Item ${i + 1}`;

      const row = document.createElement('div');
      row.style.cssText = 'display: flex; justify-content: space-between; padding: 3px 4px; border-bottom: 1px solid var(--dsh-border); color: var(--dsh-text-tertiary);';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = title.length > 25 ? title.substring(0, 25) + '...' : title;
      nameSpan.style.cssText = 'flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';

      const dateSpan = document.createElement('span');
      dateSpan.textContent = `${slot.dateString} ${slot.displayTime}`;
      dateSpan.style.cssText = 'flex-shrink: 0; color: var(--dsh-accent); margin-left: 8px;';

      row.appendChild(nameSpan);
      row.appendChild(dateSpan);
      this.previewList.appendChild(row);
    }

    // Show "and X more" for non-selected scopes
    if (!isSelected && slots.length > 10) {
      const moreRow = document.createElement('div');
      moreRow.style.cssText = 'padding: 4px; font-size: 11px; color: var(--dsh-text-muted); text-align: center;';
      moreRow.textContent = `... and ${slots.length - 10} more`;
      this.previewList.appendChild(moreRow);
    }

    this.startButton.disabled = false;
  }

  // ── Scope Selector ──

  private renderScopeSelector(): void {
    const { group, optionEls } = buildScopeSelector(this.currentScope);
    this.scopeOptionEls = optionEls;
    this.el.appendChild(group);
  }

  private setScope(scope: BulkScope): void {
    this.currentScope = scope;
    for (const el of this.scopeOptionEls) {
      el.classList.toggle('active', el.dataset.scope === scope);
    }
    this.updateSummary();
  }

  // ── Form Builders ──

  private createInput(type: string, labelText: string, defaultValue: string): HTMLInputElement {
    const group = document.createElement('div');
    group.className = 'dsh-form-group';

    const label = document.createElement('label');
    label.textContent = labelText;
    label.style.cssText = 'display: block; font-size: 12px; color: var(--dsh-text-secondary); margin-bottom: 4px;';

    const input = document.createElement('input');
    input.type = type;
    input.value = defaultValue;
    input.className = 'dsh-input';

    group.appendChild(label);
    group.appendChild(input);
    this.el.appendChild(group);

    return input;
  }

  private createHourSelect(labelText: string, defaultHour: number): HTMLSelectElement {
    const group = document.createElement('div');
    group.className = 'dsh-form-group';

    const label = document.createElement('label');
    label.textContent = labelText;
    label.style.cssText = 'display: block; font-size: 12px; color: var(--dsh-text-secondary); margin-bottom: 4px;';

    const select = document.createElement('select');
    select.className = 'dsh-input';

    for (let h = 0; h < 24; h++) {
      const opt = document.createElement('option');
      opt.value = String(h);
      opt.textContent = formatDisplayTime(h);
      if (h === defaultHour) opt.selected = true;
      select.appendChild(opt);
    }

    group.appendChild(label);
    group.appendChild(select);
    this.el.appendChild(group);

    return select;
  }

  private createIntervalSelect(): HTMLSelectElement {
    const group = document.createElement('div');
    group.className = 'dsh-form-group';

    const label = document.createElement('label');
    label.textContent = 'Interval';
    label.style.cssText = 'display: block; font-size: 12px; color: var(--dsh-text-secondary); margin-bottom: 4px;';

    const select = document.createElement('select');
    select.className = 'dsh-input';

    for (const opt of INTERVAL_OPTIONS) {
      const option = document.createElement('option');
      option.value = String(opt.value);
      option.textContent = opt.label;
      if (opt.value === DEFAULTS.INTERVAL_MINUTES) option.selected = true;
      select.appendChild(option);
    }

    group.appendChild(label);
    group.appendChild(select);
    this.el.appendChild(group);

    return select;
  }
}

/** Safely remove all child nodes from an element. */
function clearChildren(el: HTMLElement): void {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}
