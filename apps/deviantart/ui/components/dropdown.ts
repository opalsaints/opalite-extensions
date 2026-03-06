/**
 * Dropdown — reusable dropdown populated from store data.
 *
 * Used for gallery selection, tier selection, preset templates, etc.
 * Can be populated with static items or watched from store.
 */

import { BaseComponent } from './base-component';
import type { StashState } from '../../core/state/store.types';

export interface DropdownItem {
  value: string;
  label: string;
  description?: string;
}

export interface DropdownConfig {
  placeholder?: string;
  multiple?: boolean;
  label?: string;
}

export class Dropdown extends BaseComponent {
  private labelEl: HTMLLabelElement | null = null;
  private selectEl: HTMLSelectElement;
  private items: DropdownItem[] = [];
  private config: DropdownConfig;
  private onChangeCallback: ((values: string[]) => void) | null = null;

  constructor(config: DropdownConfig = {}) {
    super('div', 'dsh-dropdown');
    this.config = config;

    this.selectEl = document.createElement('select');
    this.selectEl.className = 'dsh-select';
    this.selectEl.style.cssText = `
      width: 100%;
      padding: 6px 8px;
      background: var(--dsh-bg-input);
      color: var(--dsh-text-primary);
      border: 1px solid var(--dsh-border);
      border-radius: var(--dsh-radius-sm);
      font-size: 13px;
      cursor: pointer;
    `;

    if (config.multiple) {
      this.selectEl.multiple = true;
      this.selectEl.size = 4;
    }
  }

  /**
   * Set dropdown items.
   */
  setItems(items: DropdownItem[]): this {
    this.items = items;
    this.renderOptions();
    return this;
  }

  /**
   * Watch a store selector to auto-populate items.
   */
  watchItems(selector: (state: StashState) => DropdownItem[]): this {
    this.watch(selector, (items) => {
      this.items = items;
      this.renderOptions();
    });
    return this;
  }

  /**
   * Set change callback.
   */
  onChange(callback: (values: string[]) => void): this {
    this.onChangeCallback = callback;
    return this;
  }

  /**
   * Get currently selected value(s).
   */
  getSelectedValues(): string[] {
    const values: string[] = [];
    for (let i = 0; i < this.selectEl.options.length; i++) {
      if (this.selectEl.options[i].selected) {
        values.push(this.selectEl.options[i].value);
      }
    }
    return values;
  }

  protected render(): void {
    if (this.config.label) {
      this.labelEl = document.createElement('label');
      this.labelEl.textContent = this.config.label;
      this.labelEl.style.cssText = `
        display: block;
        font-size: 12px;
        color: var(--dsh-text-secondary);
        margin-bottom: 4px;
      `;
      this.el.appendChild(this.labelEl);
    }

    this.el.appendChild(this.selectEl);
    this.renderOptions();
  }

  protected onMount(): void {
    this.on(this.selectEl, 'change', () => {
      if (this.onChangeCallback) {
        this.onChangeCallback(this.getSelectedValues());
      }
    });
  }

  private renderOptions(): void {
    // Clear existing options
    while (this.selectEl.firstChild) {
      this.selectEl.removeChild(this.selectEl.firstChild);
    }

    // Add placeholder
    if (this.config.placeholder && !this.config.multiple) {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = this.config.placeholder;
      placeholder.disabled = true;
      placeholder.selected = true;
      this.selectEl.appendChild(placeholder);
    }

    // Add items
    for (const item of this.items) {
      const option = document.createElement('option');
      option.value = item.value;
      option.textContent = item.label;
      if (item.description) {
        option.title = item.description;
      }
      this.selectEl.appendChild(option);
    }
  }
}
