/**
 * SelectItems step — click checkboxes to select stash items.
 */

import { ITEM_SELECTORS } from '../../core/dom/selectors';
import { findButton } from '../../core/dom/find-by-text';
import { safeClick, clickCheckbox } from '../../core/dom/click-helpers';
import { TIMING } from '../../shared/constants';

/**
 * Select all items on the current page via the "Select All" checkbox.
 */
export async function selectAllOnPage(): Promise<number> {
  // The select-all checkbox is the first checkbox in the sticky toolbar
  const allCheckboxes = document.querySelectorAll(ITEM_SELECTORS.checkbox) as NodeListOf<HTMLInputElement>;
  if (allCheckboxes.length === 0) return 0;

  // First checkbox is typically the "Select All" in toolbar
  // But DA may not have a dedicated select-all — check if it's inside a sticky div
  const firstCheckbox = allCheckboxes[0];
  const isToolbarCheckbox = firstCheckbox.closest('[style*="sticky"]') !== null
    || firstCheckbox.closest('header') !== null;

  if (isToolbarCheckbox && !firstCheckbox.checked) {
    clickCheckbox(firstCheckbox);
    await sleep(TIMING.CLICK_DELAY);
  }

  // Count how many are now checked
  let selected = 0;
  for (let i = 0; i < allCheckboxes.length; i++) {
    if (allCheckboxes[i].checked) selected++;
  }

  return selected;
}

/**
 * Select specific items by their stash IDs.
 */
export async function selectItemsByIds(ids: string[]): Promise<number> {
  const idSet = new Set(ids);
  let selected = 0;

  const checkboxes = document.querySelectorAll(ITEM_SELECTORS.checkbox) as NodeListOf<HTMLInputElement>;

  for (let i = 0; i < checkboxes.length; i++) {
    const checkbox = checkboxes[i];
    const container = checkbox.closest('li') ?? checkbox.parentElement;
    if (!container) continue;

    const link = container.querySelector(ITEM_SELECTORS.itemLink) as HTMLAnchorElement | null
      ?? container.querySelector(ITEM_SELECTORS.folderLink) as HTMLAnchorElement | null;

    if (!link) continue;

    const match = link.href.match(/\/stash\/([0-9a-z]+)/i);
    if (!match) continue;

    const itemId = match[1];
    if (idSet.has(itemId) && !checkbox.checked) {
      clickCheckbox(checkbox);
      selected++;
      await sleep(100); // Small delay between clicks
    }
  }

  return selected;
}

/**
 * Deselect all items on the current page.
 */
export async function deselectAll(): Promise<void> {
  const checkboxes = document.querySelectorAll(ITEM_SELECTORS.checkbox) as NodeListOf<HTMLInputElement>;

  for (let i = 0; i < checkboxes.length; i++) {
    if (checkboxes[i].checked) {
      clickCheckbox(checkboxes[i]);
      await sleep(50);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
