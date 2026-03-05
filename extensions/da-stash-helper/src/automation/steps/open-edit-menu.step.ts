/**
 * OpenEditMenu step — click the Edit dropdown trigger in the toolbar.
 */

import { findButton, findMenuItem } from '../../core/dom/find-by-text';
import { safeClick } from '../../core/dom/click-helpers';
import { waitForElement } from '../../core/dom/wait-for-element';
import { TOOLBAR_SELECTORS, TOOLBAR_BUTTONS } from '../../core/dom/selectors';
import { TIMING } from '../../shared/constants';

/**
 * Open the Edit dropdown menu in the toolbar.
 * Items must be selected before calling this.
 * @returns true if the menu opened successfully
 */
export async function openEditMenu(): Promise<boolean> {
  const editButton = findButton(TOOLBAR_BUTTONS.edit);
  if (!editButton) return false;

  safeClick(editButton);

  // Wait for the menu to appear
  try {
    await waitForElement({
      selector: TOOLBAR_SELECTORS.menu,
      timeout: TIMING.ELEMENT_TIMEOUT,
    });

    // Verify it's the right menu (not the tiny header menu)
    await sleep(TIMING.CLICK_DELAY);
    return hasVisibleMenu();
  } catch {
    return false;
  }
}

/**
 * Open a specific submenu within the toolbar (Label options, More actions).
 */
export async function openToolbarMenu(buttonText: string): Promise<boolean> {
  const button = findButton(buttonText);
  if (!button) return false;

  safeClick(button);

  try {
    await waitForElement({
      selector: TOOLBAR_SELECTORS.menu,
      timeout: TIMING.ELEMENT_TIMEOUT,
    });
    await sleep(TIMING.CLICK_DELAY);
    return hasVisibleMenu();
  } catch {
    return false;
  }
}

/**
 * Check if there's a visible menu (not the tiny header menu).
 */
function hasVisibleMenu(): boolean {
  const menus = document.querySelectorAll(TOOLBAR_SELECTORS.menu);
  for (let i = menus.length - 1; i >= 0; i--) {
    const rect = menus[i].getBoundingClientRect();
    if (rect.width > 10 && rect.height > 10) {
      return true;
    }
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
