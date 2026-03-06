/**
 * Form interaction helpers for DA's React-controlled forms.
 *
 * DA uses React which intercepts native DOM events. These helpers
 * dispatch the right events to ensure React picks up changes.
 */

import { TIMING } from '../../shared/constants';
import { waitForElement } from './wait-for-element';
import { findByText } from './find-by-text';
import { safeClick } from './click-helpers';

/**
 * Set the value of an input element in a React-compatible way.
 * React overrides the native value setter, so we need to call the
 * native setter directly and then dispatch events.
 */
export function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  // Use the native setter to bypass React's synthetic event system
  const nativeDescriptor = Object.getOwnPropertyDescriptor(
    input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    'value',
  );

  if (nativeDescriptor && nativeDescriptor.set) {
    nativeDescriptor.set.call(input, value);
  } else {
    // Fallback for environments where descriptor isn't available
    input.value = value;
  }

  // Dispatch events that React listens for
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Clear an input element and set a new value.
 */
export function clearAndSetInput(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  // Focus first
  input.focus();
  input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

  // Clear
  setInputValue(input, '');

  // Set new value
  setInputValue(input, value);

  // Blur to trigger validation
  input.blur();
  input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
}

/**
 * Select an option from a native <select> dropdown.
 * @param select - The select element
 * @param value - The option value or visible text to select
 */
export function selectOption(select: HTMLSelectElement, value: string): boolean {
  // Try matching by value first
  for (let i = 0; i < select.options.length; i++) {
    if (select.options[i].value === value || select.options[i].text.trim() === value) {
      select.selectedIndex = i;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
  }

  return false;
}

/**
 * Select from a DA combobox (custom React component, not native <select>).
 *
 * DA comboboxes work like this:
 *   1. Click the combobox trigger to open the listbox
 *   2. Options appear as [role="option"] inside a [role="listbox"]
 *   3. Click the desired option
 *
 * @param triggerSelector - CSS selector for the combobox trigger
 * @param optionText - Text of the option to select
 */
export async function selectComboboxOption(
  triggerSelector: string,
  optionText: string,
  options: { timeout?: number; root?: Element } = {},
): Promise<boolean> {
  const { timeout = TIMING.ELEMENT_TIMEOUT, root } = options;

  // 1. Click the combobox trigger
  const trigger = root
    ? root.querySelector(triggerSelector)
    : document.querySelector(triggerSelector);

  if (!trigger) return false;
  safeClick(trigger);

  // 2. Wait for the listbox to appear
  try {
    await waitForElement({ selector: '[role="listbox"]', timeout });
  } catch {
    return false;
  }

  // 3. Find and click the option
  const allOptions = document.querySelectorAll('[role="option"]');
  for (let i = 0; i < allOptions.length; i++) {
    const opt = allOptions[i] as HTMLElement;
    if (opt.textContent?.trim().includes(optionText)) {
      safeClick(opt);
      return true;
    }
  }

  return false;
}

/**
 * Fill a contenteditable (rich text) editor.
 *
 * DA uses ProseMirror/TipTap for rich text. We need to:
 *   1. Focus the editor
 *   2. Select all existing content
 *   3. Insert new content via execCommand or InputEvent
 */
export function fillRichEditor(editor: HTMLElement, text: string, mode: 'replace' | 'append' | 'prepend' = 'replace'): void {
  editor.focus();

  if (mode === 'replace') {
    // Select all and replace
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  } else if (mode === 'append') {
    // Move cursor to end
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false); // collapse to end
      selection.removeAllRanges();
      selection.addRange(range);
    }
  } else if (mode === 'prepend') {
    // Move cursor to start
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(true); // collapse to start
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  // Use InputEvent for ProseMirror compatibility
  document.execCommand('insertText', false, text);

  // Also dispatch input event for React
  editor.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    inputType: mode === 'replace' ? 'insertReplacementText' : 'insertText',
    data: text,
  }));
}

/**
 * Wait for a select-style dropdown trigger (by label text) and select an option.
 * Handles DA's custom select components (not native <select>).
 */
export async function selectFromCustomDropdown(
  labelText: string,
  optionText: string,
  root?: Element,
): Promise<boolean> {
  // Find the trigger element by associated label text
  const label = findByText(labelText, { root, tag: 'label' });
  if (!label) return false;

  // The trigger is usually a sibling or descendant with role="combobox" or a button
  const trigger = label.parentElement?.querySelector('[role="combobox"], button, select');
  if (!trigger) return false;

  // If it's a native select
  if (trigger instanceof HTMLSelectElement) {
    return selectOption(trigger, optionText);
  }

  // Custom combobox — click to open, then select
  safeClick(trigger);

  // Wait for dropdown to appear
  await sleep(TIMING.CLICK_DELAY);

  // Find and click the option
  const allOptions = document.querySelectorAll('[role="option"], [role="menuitem"]');
  for (let i = 0; i < allOptions.length; i++) {
    const opt = allOptions[i] as HTMLElement;
    if (opt.textContent?.trim().includes(optionText)) {
      safeClick(opt);
      return true;
    }
  }

  return false;
}

// ── Internal ──

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
