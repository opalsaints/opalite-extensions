/**
 * Scope Selector — shared builder for the 4-option scope radio list.
 *
 * Used by ScheduleTab, TierTab, and EditTab to render a consistent
 * scope selector UI.
 */

import type { BulkScope } from '../../shared/types';

export interface ScopeOption {
  value: BulkScope;
  label: string;
  desc: string;
  icon: string;
}

export const SCOPE_OPTIONS: ScopeOption[] = [
  { value: 'selected',          label: 'Selected',               desc: 'Only checked items',                    icon: '' },
  { value: 'all-stash',         label: 'Entire Stash',           desc: 'All items across all folders',          icon: '' },
  { value: 'current-level',     label: 'This Directory',         desc: 'All pages here, skip sub-folders',      icon: '' },
  { value: 'current-recursive', label: 'Directory + Subfolders', desc: 'This directory and all nested folders', icon: '' },
];

/**
 * Build a scope selector form group with 4 radio-style options.
 * Returns the container element and an array of option button elements.
 */
export function buildScopeSelector(
  activeScope: BulkScope,
): { group: HTMLElement; optionEls: HTMLElement[] } {
  const group = document.createElement('div');
  group.className = 'dsh-form-group';

  const label = document.createElement('label');
  label.textContent = 'Scope';
  label.style.cssText = 'display: block; font-size: 12px; color: var(--dsh-text-secondary); margin-bottom: 4px;';

  const list = document.createElement('div');
  list.className = 'dsh-scope-list';

  const optionEls: HTMLElement[] = [];

  for (const opt of SCOPE_OPTIONS) {
    const btn = document.createElement('button');
    btn.className = `dsh-scope-option${opt.value === activeScope ? ' active' : ''}`;
    btn.dataset.scope = opt.value;
    btn.type = 'button';

    // Radio dot
    const radio = document.createElement('span');
    radio.className = 'dsh-scope-radio';

    // Text column
    const textCol = document.createElement('div');
    textCol.className = 'dsh-scope-text';

    const title = document.createElement('div');
    title.className = 'dsh-scope-label';
    title.textContent = opt.label;

    const desc = document.createElement('div');
    desc.className = 'dsh-scope-desc';
    desc.textContent = opt.desc;

    textCol.appendChild(title);
    textCol.appendChild(desc);

    btn.appendChild(radio);
    btn.appendChild(textCol);
    list.appendChild(btn);

    optionEls.push(btn);
  }

  group.appendChild(label);
  group.appendChild(list);

  return { group, optionEls };
}
