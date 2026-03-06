/**
 * TemplateFill step — fill title/description fields with template variables.
 *
 * Uses the template engine to replace {filename}, {n}, etc.
 * Handles both native inputs and contenteditable rich editors.
 *
 * DA's bulk edit UI (after Edit > Title or Description):
 *   - Title: shows a mode <select> ("Insert at beginning" / "Insert at end" / "Replace entirely")
 *            plus a text <input>
 *   - Description: shows a mode selector plus a contenteditable rich editor
 *
 * We must select the correct mode in DA's UI first, THEN fill the text.
 */

import { clearAndSetInput, fillRichEditor, selectOption } from '../../core/dom/form-helpers';
import { applyTemplate, type TemplateContext } from '../../shared/template-engine';
import { safeClick } from '../../core/dom/click-helpers';
import { TIMING } from '../../shared/constants';

// DA's mode dropdown text → our internal mode name
const DA_MODE_MAP: Record<string, string> = {
  'prepend': 'Insert at the beginning',
  'append': 'Insert at the end',
  'replace': 'Replace entirely',
};

/**
 * Fill the title field with a templated value.
 *
 * @param template - Template string with variables
 * @param context - Variable values for replacement
 * @param mode - How to apply: prepend, append, or replace
 */
export async function fillTitle(
  template: string,
  context: TemplateContext,
  mode: 'prepend' | 'append' | 'replace',
): Promise<boolean> {
  const resolved = applyTemplate(template, context);

  // Step 1: Select the mode in DA's dropdown
  await selectEditMode(mode);
  await sleep(TIMING.CLICK_DELAY);

  // Step 2: Find and fill the title input
  const inputs = document.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type])');

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const placeholder = input.placeholder?.toLowerCase() ?? '';

    // DA's title input has placeholder like "New title", "Title", "Enter title"
    if (
      placeholder.includes('title') ||
      placeholder.includes('new title') ||
      placeholder.includes('enter title') ||
      placeholder.includes('enter a title')
    ) {
      // DA's mode dropdown tells the server how to apply it,
      // so we always set the input value directly
      clearAndSetInput(input, resolved);
      return true;
    }
  }

  // Fallback: try the last visible text input (likely the edit input)
  for (let i = inputs.length - 1; i >= 0; i--) {
    const input = inputs[i];
    if (input.offsetParent !== null && !input.disabled) {
      clearAndSetInput(input, resolved);
      return true;
    }
  }

  return false;
}

/**
 * Fill the description field with a templated value.
 * The description is a ProseMirror/TipTap rich editor (contenteditable).
 */
export async function fillDescription(
  template: string,
  context: TemplateContext,
  mode: 'prepend' | 'append' | 'replace',
): Promise<boolean> {
  const resolved = applyTemplate(template, context);

  // Step 1: Select the mode in DA's dropdown
  await selectEditMode(mode);
  await sleep(TIMING.CLICK_DELAY);

  // Step 2: Find the rich editor
  const editors = document.querySelectorAll<HTMLElement>('[contenteditable="true"][role="textbox"]');
  if (editors.length === 0) return false;

  // DA's mode dropdown handles how the value is applied on save,
  // so we just replace the editor content with our value
  const editor = editors[0];
  fillRichEditor(editor, resolved, 'replace');

  return true;
}

/**
 * Select the edit mode in DA's mode dropdown.
 * Handles both native <select> and custom combobox patterns.
 */
async function selectEditMode(mode: 'prepend' | 'append' | 'replace'): Promise<boolean> {
  const daLabel = DA_MODE_MAP[mode];
  if (!daLabel) return false;

  // Try native <select> first (most common for DA's edit mode)
  const selects = document.querySelectorAll<HTMLSelectElement>('select');
  for (let i = 0; i < selects.length; i++) {
    const select = selects[i];
    // Check if this select has edit mode options
    for (let j = 0; j < select.options.length; j++) {
      const optText = select.options[j].text.trim();
      if (
        optText.includes('beginning') ||
        optText.includes('end') ||
        optText.includes('Replace')
      ) {
        // This is the mode selector — find and select our target mode
        return selectOption(select, daLabel);
      }
    }
  }

  // Try custom combobox / dropdown
  const comboboxes = document.querySelectorAll<HTMLElement>('[role="combobox"]');
  for (let i = 0; i < comboboxes.length; i++) {
    const cb = comboboxes[i];
    const text = cb.textContent?.trim().toLowerCase() || '';
    if (
      text.includes('beginning') ||
      text.includes('end') ||
      text.includes('replace') ||
      text.includes('insert')
    ) {
      // Open the combobox
      safeClick(cb);
      await sleep(TIMING.CLICK_DELAY);

      // Find and click the matching option
      const options = document.querySelectorAll<HTMLElement>('[role="option"]');
      for (let j = 0; j < options.length; j++) {
        if (options[j].textContent?.trim().includes(daLabel)) {
          safeClick(options[j]);
          return true;
        }
      }

      // Partial match fallback
      for (let j = 0; j < options.length; j++) {
        const optText = options[j].textContent?.trim().toLowerCase() || '';
        if (
          (mode === 'prepend' && optText.includes('beginning')) ||
          (mode === 'append' && optText.includes('end')) ||
          (mode === 'replace' && optText.includes('replace'))
        ) {
          safeClick(options[j]);
          return true;
        }
      }
    }
  }

  // If no mode selector found, the edit might not need one
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
