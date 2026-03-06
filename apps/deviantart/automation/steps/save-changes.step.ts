/**
 * SaveChanges step — click Save Changes and confirm in the modal.
 *
 * Flow:
 *   1. Click "Save Changes" button in toolbar
 *   2. Wait for confirmation modal to appear
 *   3. Click "Update All" (or equivalent confirmation button)
 *   4. Wait for modal to close
 */

import { findButton } from '../../core/dom/find-by-text';
import { safeClick, clickCheckbox } from '../../core/dom/click-helpers';
import { waitForElement, waitForElementRemoved } from '../../core/dom/wait-for-element';
import { TOOLBAR_SELECTORS, TOOLBAR_BUTTONS, CONFIRMATION_BUTTONS } from '../../core/dom/selectors';
import { TIMING } from '../../shared/constants';

/**
 * Save changes and confirm the update.
 *
 * @returns true if save and confirmation completed successfully
 */
export async function saveChanges(): Promise<boolean> {
  // 1. Click "Save Changes"
  const saveButton = findButton(TOOLBAR_BUTTONS.saveChanges);
  if (!saveButton) return false;

  safeClick(saveButton);

  // 2. Wait for confirmation dialog
  //    DA has multiple [role="dialog"] elements on the page (empty shells, user menu, etc.).
  //    The actual confirmation modal uses aria-modal="true" and is a ReactModal.
  //    We must find the right one — the one containing buttons and the confirmation text.
  try {
    await waitForElement({
      selector: '[role="dialog"][aria-modal="true"]',
      timeout: TIMING.ELEMENT_TIMEOUT,
    });
  } catch {
    // No dialog appeared — might have saved directly
    return true;
  }

  await sleep(TIMING.CLICK_DELAY);

  // Find the actual confirmation dialog (the one with buttons inside)
  const dialog = findConfirmationDialog();
  if (!dialog) return false;

  // 3. Check the "I understand" confirmation checkbox if present
  //    DA shows: "I understand and want to move forward with the update."
  //    "Update All" may be disabled until this checkbox is checked.
  await checkConfirmationCheckbox(dialog);
  await sleep(TIMING.CLICK_DELAY);

  // 4. Find and click confirmation button ("Update All", "Delete All", "Confirm", etc.)
  const confirmButton = findConfirmButton(dialog);
  if (!confirmButton) return false;

  safeClick(confirmButton);

  // 5. Wait for dialog to close
  try {
    await waitForElementRemoved('[role="dialog"][aria-modal="true"]', {
      timeout: TIMING.ELEMENT_TIMEOUT,
    });
  } catch {
    // Dialog didn't close — button may have been disabled.
    // Try checking the checkbox again and re-clicking.
    const retryDialog = findConfirmationDialog();
    if (retryDialog) {
      await checkConfirmationCheckbox(retryDialog);
      await sleep(TIMING.CLICK_DELAY);
      const retryBtn = findConfirmButton(retryDialog);
      if (retryBtn) safeClick(retryBtn);
    }

    try {
      await waitForElementRemoved('[role="dialog"][aria-modal="true"]', { timeout: 5000 });
    } catch {
      return false;
    }
  }

  await sleep(TIMING.STEP_DELAY);
  return true;
}

/**
 * Cancel the current edit (click Cancel button).
 */
export async function cancelChanges(): Promise<boolean> {
  const cancelButton = findButton(TOOLBAR_BUTTONS.cancel);
  if (!cancelButton) return false;

  safeClick(cancelButton);
  await sleep(TIMING.CLICK_DELAY);
  return true;
}

/**
 * Find the actual confirmation dialog among multiple [role="dialog"] elements.
 * DA has empty dialog shells and a user menu dialog on the page.
 * The real confirmation modal has aria-modal="true" and contains buttons.
 */
function findConfirmationDialog(): Element | null {
  const allDialogs = document.querySelectorAll('[role="dialog"]');

  for (const dialog of allDialogs) {
    // The real modal has buttons inside (Update All, Cancel, etc.)
    const buttons = dialog.querySelectorAll('button');
    if (buttons.length === 0) continue;

    // Check if any button is a confirmation button
    for (const btn of buttons) {
      const text = btn.textContent?.trim() ?? '';
      if (
        CONFIRMATION_BUTTONS.updateAll.test(text) ||
        CONFIRMATION_BUTTONS.deleteAll.test(text) ||
        CONFIRMATION_BUTTONS.confirm.test(text) ||
        text === CONFIRMATION_BUTTONS.confirmSchedule
      ) {
        return dialog;
      }
    }
  }

  return null;
}

/**
 * Check the "I understand and want to move forward" checkbox in the dialog.
 * DA requires this checkbox to be checked before "Update All" is enabled.
 */
async function checkConfirmationCheckbox(dialog: Element): Promise<void> {
  // Look for an unchecked checkbox inside the dialog
  const checkboxes = dialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');

  for (const checkbox of checkboxes) {
    if (!checkbox.checked) {
      // Try clicking the label (parent or sibling) first — more reliable for React
      const label = checkbox.closest('label') || checkbox.parentElement?.querySelector('label');
      if (label) {
        safeClick(label);
      } else {
        clickCheckbox(checkbox);
      }
      await sleep(TIMING.CLICK_DELAY);
    }
  }
}

/**
 * Find the confirmation button in a dialog.
 * Tries multiple patterns: "Update All", "Delete All", "Confirm".
 */
function findConfirmButton(dialog: Element): HTMLElement | null {
  const buttons = dialog.querySelectorAll('button');

  for (let i = 0; i < buttons.length; i++) {
    const text = buttons[i].textContent?.trim() ?? '';

    if (CONFIRMATION_BUTTONS.updateAll.test(text)) return buttons[i];
    if (CONFIRMATION_BUTTONS.deleteAll.test(text)) return buttons[i];
    if (CONFIRMATION_BUTTONS.confirm.test(text)) return buttons[i];
    if (text === CONFIRMATION_BUTTONS.confirmSchedule) return buttons[i];
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
