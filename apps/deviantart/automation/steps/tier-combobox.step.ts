/**
 * TierCombobox step — open the tier combobox and select tier(s).
 *
 * DA's tier combobox is a custom React component that appears
 * after clicking "Subscription tier" in the Edit menu.
 *
 * DA Tier Combobox DOM (verified live Mar 2026):
 *   - Trigger: div[role="combobox"] with text "Select a tier"
 *   - Dropdown: div[role="listbox"]
 *   - Options: <label> elements inside the listbox (NOT [role="option"])
 *     Each label contains:
 *       - <input type="checkbox"> for selection state
 *       - Nested divs/spans with the tier name text
 *   - Clicking a label toggles its checkbox
 *   - Multiple tiers can be checked at once
 */

import { waitForElement } from '../../core/dom/wait-for-element';
import { findByText } from '../../core/dom/find-by-text';
import { safeClick } from '../../core/dom/click-helpers';
import { TOOLBAR_SELECTORS } from '../../core/dom/selectors';
import { TIMING } from '../../shared/constants';

/**
 * Select tier(s) in the subscription tier combobox.
 *
 * Assumes the "Subscription tier" edit mode is already active
 * (toolbar is transformed with the tier combobox visible).
 *
 * @param tierNames - Names of tiers to select
 * @param mode - 'add' keeps existing selections, 'replace' deselects all first
 * @returns Number of tiers successfully selected
 */
export async function selectTiers(
  tierNames: string[],
  mode: 'add' | 'replace' = 'replace',
): Promise<number> {
  // Find and click the combobox trigger to open the dropdown
  const combobox = document.querySelector<HTMLElement>('[role="combobox"]')
    ?? findByText('Select a tier', { tag: '*', visible: true }) as HTMLElement | null;

  if (!combobox) return 0;

  safeClick(combobox);
  await sleep(TIMING.CLICK_DELAY);

  // Wait for listbox to appear
  try {
    await waitForElement({
      selector: TOOLBAR_SELECTORS.listbox,
      timeout: TIMING.ELEMENT_TIMEOUT,
    });
  } catch {
    return 0;
  }

  const listbox = document.querySelector(TOOLBAR_SELECTORS.listbox);
  if (!listbox) return 0;

  // DA uses <label> elements with checkboxes inside the listbox, not [role="option"]
  const labels = listbox.querySelectorAll<HTMLLabelElement>('label');
  if (labels.length === 0) return 0;

  // In replace mode, uncheck all currently-checked tiers first
  if (mode === 'replace') {
    for (const label of labels) {
      const checkbox = label.querySelector<HTMLInputElement>('input[type="checkbox"]');
      if (checkbox?.checked) {
        safeClick(label);
        await sleep(TIMING.CLICK_DELAY);
      }
    }
  }

  // Select each requested tier by name
  let selected = 0;

  for (const tierName of tierNames) {
    const tierNameLower = tierName.toLowerCase();

    for (const label of labels) {
      const labelText = label.textContent?.trim().toLowerCase() || '';
      if (labelText === tierNameLower || labelText.includes(tierNameLower)) {
        const checkbox = label.querySelector<HTMLInputElement>('input[type="checkbox"]');

        if (checkbox && !checkbox.checked) {
          safeClick(label);
          selected++;
          await sleep(TIMING.CLICK_DELAY);
        } else if (checkbox?.checked) {
          // Already checked — counts as success
          selected++;
        }
        break;
      }
    }
  }

  // Close the dropdown by clicking the combobox again (or clicking outside)
  safeClick(combobox);
  await sleep(TIMING.CLICK_DELAY);

  return selected;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
