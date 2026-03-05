/**
 * ClickMenuItem step — click a specific item in an open menu.
 */

import { findMenuItem } from '../../core/dom/find-by-text';
import { safeClick } from '../../core/dom/click-helpers';
import { TIMING } from '../../shared/constants';

/**
 * Click a menu item by its text.
 * The menu must already be open.
 *
 * @param text - Text of the menu item to click
 * @returns true if the item was found and clicked
 */
export async function clickMenuItemStep(text: string): Promise<boolean> {
  const item = findMenuItem(text);
  if (!item) return false;

  safeClick(item);
  await sleep(TIMING.CLICK_DELAY);

  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
