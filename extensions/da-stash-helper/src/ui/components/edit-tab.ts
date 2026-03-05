/**
 * EditTab — bulk edit form with template support.
 *
 * Provides field selector (title/description), mode selector,
 * template input with variable hints, and preview.
 * Emits command:start-edit when the user clicks Apply.
 */

import { BaseComponent } from './base-component';
import type { IEventBus } from '../../core/events/event-bus';
import type { EventMap } from '../../core/events/event-types';
import type { EditConfig, BulkScope } from '../../shared/types';
import { SCOPE_OPTIONS, buildScopeSelector } from './scope-selector';
import { applyTemplate } from '../../shared/template-engine';

export class EditTab extends BaseComponent {
  private eventBus: IEventBus<EventMap> | null = null;
  private fieldSelect!: HTMLSelectElement;
  private modeSelect!: HTMLSelectElement;
  private templateInput!: HTMLTextAreaElement;
  private previewText!: HTMLElement;
  private hintsText!: HTMLElement;
  private applyButton!: HTMLButtonElement;
  private scopeOptionEls: HTMLElement[] = [];
  private currentScope: BulkScope = 'selected';

  constructor() {
    super('div', 'dsh-edit-tab');
  }

  setEventBus(eventBus: IEventBus<EventMap>): this {
    this.eventBus = eventBus;
    return this;
  }

  protected render(): void {
    // Scope selector (4-option radio list)
    this.renderScopeSelector();

    // Field selector
    this.fieldSelect = this.createSelect('Field', [
      { value: 'title', label: 'Title' },
      { value: 'description', label: 'Description' },
    ]);

    // Mode selector
    this.modeSelect = this.createSelect('Mode', [
      { value: 'prepend', label: 'Insert at beginning' },
      { value: 'append', label: 'Insert at end' },
      { value: 'replace', label: 'Replace entirely' },
    ]);

    // Template input
    const templateGroup = document.createElement('div');
    templateGroup.className = 'dsh-form-group';

    const templateLabel = document.createElement('label');
    templateLabel.textContent = 'Template';
    templateLabel.style.cssText = 'display: block; font-size: 12px; color: var(--dsh-text-secondary); margin-bottom: 4px;';

    this.templateInput = document.createElement('textarea');
    this.templateInput.className = 'dsh-input';
    this.templateInput.rows = 3;
    this.templateInput.placeholder = 'e.g., {filename} - watercolor #{n}';
    this.templateInput.style.cssText = 'width: 100%; resize: vertical; padding: 6px 8px; background: var(--dsh-bg-input); color: var(--dsh-text-primary); border: 1px solid var(--dsh-border); border-radius: var(--dsh-radius-sm); font-size: 13px; font-family: inherit;';

    templateGroup.appendChild(templateLabel);
    templateGroup.appendChild(this.templateInput);
    this.el.appendChild(templateGroup);

    // Variable hints
    this.hintsText = document.createElement('div');
    this.hintsText.style.cssText = 'font-size: 10px; color: var(--dsh-text-muted); margin-bottom: 8px; line-height: 1.6;';
    this.hintsText.textContent = 'Variables: {filename} {n} {n:3} {total} {title} {date} {date:short} {time}';
    this.el.appendChild(this.hintsText);

    // Preview
    const previewLabel = document.createElement('div');
    previewLabel.textContent = 'Preview:';
    previewLabel.style.cssText = 'font-size: 11px; color: var(--dsh-text-secondary); margin-bottom: 2px;';
    this.el.appendChild(previewLabel);

    this.previewText = document.createElement('div');
    this.previewText.style.cssText = 'font-size: 12px; color: var(--dsh-accent); padding: 6px 8px; background: var(--dsh-bg-tertiary); border-radius: var(--dsh-radius-sm); margin-bottom: 8px; min-height: 20px; word-break: break-word;';
    this.el.appendChild(this.previewText);

    // Apply button
    this.applyButton = document.createElement('button');
    this.applyButton.textContent = 'Apply Edit';
    this.applyButton.className = 'dsh-btn dsh-btn-primary';
    this.applyButton.style.cssText = 'width: 100%; margin-top: 4px;';
    this.el.appendChild(this.applyButton);
  }

  protected onMount(): void {
    // Scope option click handlers
    for (const el of this.scopeOptionEls) {
      this.on(el, 'click', () => {
        const scope = el.dataset.scope as BulkScope;
        if (scope) this.setScope(scope);
      });
    }

    // Live preview
    this.on(this.templateInput, 'input', () => this.updatePreview());

    // Apply button
    this.on(this.applyButton, 'click', () => this.handleApply());

    // Disable when no items available for scope
    this.watch(
      (state) => state.selectedIds.length,
      () => this.updateButtonState(),
    );

    this.watch(
      (state) => state.pageInfo.totalItems,
      () => this.updateButtonState(),
    );

    this.updatePreview();
    this.updateButtonState();
  }

  private handleApply(): void {
    if (!this.eventBus) return;

    const template = this.templateInput.value.trim();
    if (!template) return;

    const config: EditConfig = {
      field: this.fieldSelect.value as 'title' | 'description',
      template,
      mode: this.modeSelect.value as 'prepend' | 'append' | 'replace',
      scope: this.currentScope,
    };

    this.eventBus.emit('command:start-edit', config);
  }

  private updatePreview(): void {
    const template = this.templateInput.value;
    if (!template) {
      this.previewText.textContent = '(enter a template above)';
      return;
    }

    const preview = applyTemplate(template, {
      filename: 'my_artwork',
      n: 1,
      total: 10,
      title: 'Original Title',
    });
    this.previewText.textContent = preview;
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
    this.updateButtonState();
  }

  private updateButtonState(): void {
    const state = this.store?.getState();

    if (this.currentScope === 'selected') {
      const count = state?.selectedIds.length ?? 0;
      this.applyButton.disabled = count === 0;
    } else {
      const totalItems = state?.pageInfo.totalItems ?? 0;
      this.applyButton.disabled = totalItems === 0;
    }
  }

  private createSelect(labelText: string, options: Array<{ value: string; label: string }>): HTMLSelectElement {
    const group = document.createElement('div');
    group.className = 'dsh-form-group';

    const label = document.createElement('label');
    label.textContent = labelText;
    label.style.cssText = 'display: block; font-size: 12px; color: var(--dsh-text-secondary); margin-bottom: 4px;';

    const select = document.createElement('select');
    select.className = 'dsh-select';

    for (const opt of options) {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      select.appendChild(option);
    }

    group.appendChild(label);
    group.appendChild(select);
    this.el.appendChild(group);

    return select;
  }
}
