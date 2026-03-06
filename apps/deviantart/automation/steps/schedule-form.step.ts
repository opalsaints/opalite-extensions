/**
 * Schedule form automation — runs on the DA submit page.
 *
 * Called by the content script when it receives a RUN_SCHEDULE message
 * from the service worker. This function automates the full schedule flow:
 *
 *   1. Click the dropdown arrow next to Submit → click "Schedule" menuitem
 *   2. Wait for "Schedule Draft" dialog
 *   3. Click date button → navigate calendar to target month → click day
 *   4. Verify date readback matches target
 *   5. Set time via native <select> element
 *   6. Click "Confirm Schedule"
 *   7. Verify dialog closed
 *
 * DA Schedule UI (verified live Mar 2026):
 *   - Submit page: /_deviation_submit/?deviationid={id}
 *   - Submit button has a sibling dropdown arrow: button[aria-haspopup="menu"]
 *   - Dropdown has one menuitem: "Schedule"
 *   - Dialog title: "Schedule Draft"
 *   - Date button: div[role="button"][aria-haspopup="dialog"], text "Select date"
 *   - After date pick, text changes to e.g. "March 10, 2026" (readback)
 *   - Calendar nav: button[aria-label="Go to the Next Month"] / "Go to the Previous Month"
 *   - Day buttons: button with aria-label like "Tuesday, March 10th, 2026"
 *   - Past days have disabled=true
 *   - Calendar auto-closes after clicking a day
 *   - Time: native <select> with options: "", "Select time", "12 AM".."11 PM"
 *   - Confirm: "Confirm Schedule" button
 */

import { findButton } from '../../core/dom/find-by-text';
import { safeClick } from '../../core/dom/click-helpers';
import { waitForElement, waitForElementRemoved } from '../../core/dom/wait-for-element';
import { TOOLBAR_SELECTORS } from '../../core/dom/selectors';
import { formatDisplayTime } from '../../shared/date-utils';
import { TIMING } from '../../shared/constants';

export interface ScheduleResult {
  success: boolean;
  /** The date text shown after selection (e.g. "March 10, 2026") */
  dateReadback?: string;
  /** The time option selected (e.g. "9 AM") */
  timeSelected?: string;
  /** The green banner text confirming schedule (e.g. "Scheduled to submit automatically on March 19, 2026 at 2:00 AM") */
  bannerText?: string;
  error?: string;
}

/**
 * Run the full schedule automation on the current submit page.
 *
 * @param targetDate - Date string (YYYY-MM-DD) for the calendar
 * @param hour - Hour (0-23) for the time select
 * @param setTier - Whether to set a subscription tier
 * @param tierIds - Tier IDs to select (if setTier is true)
 * @returns Detailed result with readback values for verification
 */
export async function runScheduleOnSubmitPage(
  targetDate: string,
  hour: number,
  setTier: boolean,
  tierIds: string[],
  isAlreadyScheduled: boolean = false,
): Promise<ScheduleResult> {
  log(`Starting schedule: date=${targetDate}, hour=${hour}, setTier=${setTier}, isAlreadyScheduled=${isAlreadyScheduled}`);

  // Dismiss any "Invalid Input" dialog that might appear on page load
  await sleep(1000);
  await dismissErrorDialog();

  // Step 1: Open the Schedule dialog.
  // We know upfront whether this is a reschedule (from stash page data).
  // - Fresh: Submit dropdown → "Schedule" menuitem → dialog
  // - Reschedule: Green banner "Edit" button → dialog
  const isReschedule = await openScheduleDialog(isAlreadyScheduled);
  log(`openScheduleDialog returned isReschedule=${isReschedule}`);

  // Step 2: Wait for the "Schedule Draft" dialog to appear
  await sleep(TIMING.STEP_DELAY);

  const dialog = await findScheduleDialog();
  if (!dialog) {
    // Dump visible dialogs for debugging
    const allDialogs = document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]');
    log(`findScheduleDialog failed — ${allDialogs.length} dialog(s) on page:`);
    allDialogs.forEach((d, i) => {
      const text = d.textContent?.slice(0, 120) ?? '';
      log(`  dialog[${i}]: visible=${d.offsetParent !== null}, text="${text}..."`);
    });
    return { success: false, error: '"Schedule Draft" dialog did not appear' };
  }
  log(`Schedule dialog found, textContent length: ${dialog.textContent?.length}`);

  // Step 3: Set the date via calendar
  const dateReadback = await setDateInCalendar(dialog, targetDate);

  // Step 4: Verify date readback
  const [targetYear, , targetDayStr] = targetDate.split('-');
  const targetDay = parseInt(targetDayStr, 10);

  if (dateReadback && !dateReadback.includes(String(targetDay))) {
    return {
      success: false,
      dateReadback,
      error: `Date mismatch: expected day ${targetDay} in "${dateReadback}"`,
    };
  }

  // Step 5: Set the time via <select>
  const timeSelected = await setTimeSelect(dialog, hour);

  // Step 6: Click "Confirm Schedule"
  await sleep(TIMING.CLICK_DELAY);
  const confirmBtn =
    findButton('Confirm Schedule', dialog) ??
    findButton('Confirm', dialog);

  if (!confirmBtn) {
    return { success: false, dateReadback, timeSelected, error: '"Confirm Schedule" button not found' };
  }
  safeClick(confirmBtn);

  // Step 7: Verify the schedule dialog closed
  try {
    await waitForScheduleDialogClosed(5000);
  } catch {
    return {
      success: false,
      dateReadback,
      timeSelected,
      error: 'Schedule dialog did not close after confirming — schedule may not have saved',
    };
  }

  await sleep(TIMING.STEP_DELAY);

  // Verify the green banner appeared
  const bannerText = findScheduleBanner();

  // Step 8: Finalize — click the "Schedule" button at the bottom to persist.
  // "Confirm Schedule" in the dialog only confirms the date/time selection;
  // the Schedule button at the bottom actually saves the deviation.
  // This applies to BOTH fresh and reschedule flows.
  log(`Step 8: Clicking Schedule button to finalize (${isReschedule ? 'reschedule' : 'fresh'})`);
  const scheduleBtn = findButton('Schedule');
  if (!scheduleBtn) {
    return {
      success: false,
      dateReadback,
      timeSelected,
      error: '"Schedule" button not found after dialog closed — cannot finalize',
    };
  }
  safeClick(scheduleBtn);
  await sleep(2000);

  log(`Schedule complete: dateReadback="${dateReadback}", timeSelected="${timeSelected}", banner="${bannerText}"`);
  return { success: true, dateReadback, timeSelected, bannerText: bannerText || undefined };
}

// Keep the old export name for backwards compatibility
export const fillScheduleForm = runScheduleOnSubmitPage;

// ── Open Schedule Dialog ──
// Two paths:
//   A) Fresh post: Submit dropdown → "Schedule" menuitem → Schedule Draft dialog
//   B) Already scheduled: Green banner has "Edit" link → click it → Schedule Draft dialog
//
// The caller tells us which path via isAlreadyScheduled (from stash page data).
// This avoids fragile DOM-sniffing on the submit page.
// Returns true if this is a reschedule (path B), false if fresh (path A).

async function openScheduleDialog(isAlreadyScheduled: boolean): Promise<boolean> {
  if (isAlreadyScheduled) {
    // Path B: Reschedule — find and click the "Edit" link on the green banner.
    log('openScheduleDialog: isAlreadyScheduled=true → looking for Edit on banner');
    const editLink = findEditOnBanner();
    if (editLink) {
      safeClick(editLink);
      await sleep(TIMING.STEP_DELAY);
      return true; // reschedule
    }
    // Banner not found — maybe the schedule was disabled between scan and now.
    // Fall through to Path A as a safety net.
    log('openScheduleDialog: Edit link not found on banner — falling back to fresh path');
  }

  // Path A: Fresh post — use the Submit dropdown.
  // The main button says "Submit" (or "Schedule" if previously set then disabled).
  const submitBtn = findButton('Submit') ?? findButton('Schedule');
  if (!submitBtn) {
    throw new Error('Neither "Submit" nor "Schedule" button found on page');
  }

  // The dropdown arrow is a sibling button within the same container.
  // Walk up to find the shared parent, then find the aria-haspopup="menu" button.
  let dropdownBtn: HTMLElement | null = null;
  let container = submitBtn.parentElement;

  for (let i = 0; i < 4 && container; i++) {
    dropdownBtn = container.querySelector<HTMLElement>('button[aria-haspopup="menu"]');
    if (dropdownBtn) break;
    container = container.parentElement;
  }

  if (!dropdownBtn) {
    // Fallback: find any aria-haspopup="menu" button near the bottom of the page
    const allMenuBtns = document.querySelectorAll<HTMLElement>('button[aria-haspopup="menu"]');
    for (const btn of allMenuBtns) {
      const rect = btn.getBoundingClientRect();
      if (rect.top > window.innerHeight - 150) {
        dropdownBtn = btn;
        break;
      }
    }
  }

  if (!dropdownBtn) {
    throw new Error('Submit dropdown arrow button not found');
  }

  safeClick(dropdownBtn);
  await sleep(TIMING.CLICK_DELAY);

  // Find "Schedule" in the menu that appeared
  const menuItems = document.querySelectorAll<HTMLElement>('[role="menuitem"]');
  let scheduleItem: HTMLElement | null = null;

  for (const item of menuItems) {
    const text = item.textContent?.trim();
    if (text === 'Schedule' && item.offsetParent !== null) {
      scheduleItem = item;
      break;
    }
  }

  if (!scheduleItem) {
    throw new Error('"Schedule" menuitem not found in Submit dropdown');
  }

  safeClick(scheduleItem);
  await sleep(TIMING.STEP_DELAY);
  return false; // fresh schedule
}

/**
 * Find the "Edit" link on an existing schedule banner.
 * DA shows a green banner: "Scheduled to submit automatically on March 6, 2026 at 3:00 PM"
 * with ✏ Edit and 🗑 Disable links.
 *
 * The "Edit" element text may include an icon prefix (e.g. "✏ Edit"),
 * so we use includes() and scope the search to the banner container.
 */
function findEditOnBanner(): HTMLElement | null {
  // Step 1: Find the VISIBLE text node containing "Scheduled to submit".
  // DA embeds the schedule text in both a <script> tag (SSR data) and a visible <span>.
  // We must skip the <script> copy — it's invisible and has no Edit button nearby.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let bannerTextNode: Node | null = null;

  while (walker.nextNode()) {
    if (walker.currentNode.textContent?.includes('Scheduled to submit')) {
      const parent = walker.currentNode.parentElement;
      // Skip text nodes inside <script>, <style>, or other non-visible containers
      if (parent && parent.tagName !== 'SCRIPT' && parent.tagName !== 'STYLE') {
        bannerTextNode = walker.currentNode;
        break;
      }
    }
  }
  if (!bannerTextNode) {
    log('findEditOnBanner: no visible "Scheduled to submit" text node found');
    return null;
  }
  log(`findEditOnBanner: found banner text node, parent tag: ${bannerTextNode.parentElement?.tagName}`);

  // Step 2: Walk up from the banner text node to find the container
  // that also holds the Edit/Disable links (typically 3-5 levels up)
  let container = bannerTextNode.parentElement;
  for (let depth = 0; depth < 6 && container; depth++) {
    const candidates = container.querySelectorAll<HTMLElement>('a, button, span, [role="button"]');
    log(`findEditOnBanner: depth=${depth}, tag=${container.tagName}, candidates=${candidates.length}`);
    for (const el of candidates) {
      const text = el.textContent?.trim() ?? '';
      if (text.endsWith('Edit') && !text.includes('Disable') && text.length <= 12) {
        // Skip Edit buttons inside the Schedule Draft dialog (if it happens to be open).
        // Do NOT skip based on generic [role="dialog"] — the submit page itself
        // is wrapped in role="dialog", so the banner's Edit button is always inside one.
        const closestDialog = el.closest('[role="dialog"]');
        if (closestDialog) {
          const dialogText = closestDialog.textContent || '';
          if (dialogText.includes('Schedule Draft') || dialogText.includes('Confirm Schedule')) {
            log(`findEditOnBanner: skipping Edit inside schedule dialog: "${text}"`);
            continue;
          }
        }
        log(`findEditOnBanner: found Edit element: tag=${el.tagName}, text="${text}"`);
        return el;
      }
    }
    container = container.parentElement;
  }

  log('findEditOnBanner: Edit link NOT found after walking 6 levels up');
  return null;
}

// ── Find Schedule Dialog ──

async function findScheduleDialog(): Promise<HTMLElement | null> {
  // Wait for any dialog to appear
  try {
    await waitForElement({ selector: TOOLBAR_SELECTORS.dialog, timeout: TIMING.ELEMENT_TIMEOUT });
  } catch {
    log('findScheduleDialog: no dialog element appeared within timeout');
    return null;
  }

  const dialogs = document.querySelectorAll<HTMLElement>(TOOLBAR_SELECTORS.dialog);
  log(`findScheduleDialog: found ${dialogs.length} dialog(s) on page`);

  // Find the dialog that contains schedule-related text
  for (const d of dialogs) {
    if (d.offsetParent === null) continue; // skip hidden dialogs
    const text = d.textContent ?? '';
    if (
      text.includes('Schedule Draft') ||
      text.includes('Confirm Schedule') ||
      text.includes('Schedule publication') ||
      text.includes('Select date')
    ) {
      log(`findScheduleDialog: matched dialog with text "${text.slice(0, 80)}..."`);
      return d;
    }
  }

  // Fallback: any visible dialog with BOTH a date picker AND a time select.
  // Must require both — the submit page wrapper dialog has <select> elements
  // (e.g. display options dropdown) that would falsely match a single-check.
  for (const d of dialogs) {
    if (d.offsetParent === null) continue;
    const hasDateBtn = d.querySelector('[role="button"][aria-haspopup="dialog"]');
    const hasTimeSelect = d.querySelector('select');
    if (hasDateBtn && hasTimeSelect) {
      log('findScheduleDialog: matched dialog via date+time controls fallback');
      return d;
    }
  }

  log('findScheduleDialog: no matching dialog found');
  return null;
}

// ── Wait for Schedule Dialog to Close ──

async function waitForScheduleDialogClosed(timeout: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const dialogs = document.querySelectorAll<HTMLElement>(TOOLBAR_SELECTORS.dialog);
    let scheduleDialogStillOpen = false;
    for (const d of dialogs) {
      if (
        d.offsetParent !== null &&
        (d.textContent?.includes('Schedule Draft') || d.textContent?.includes('Confirm Schedule'))
      ) {
        scheduleDialogStillOpen = true;
        break;
      }
    }
    if (!scheduleDialogStillOpen) return;
    await sleep(250);
  }
  throw new Error('Schedule dialog still open after timeout');
}

// ── Calendar Navigation ──

async function setDateInCalendar(dialog: HTMLElement, targetDate: string): Promise<string> {
  const [targetYear, targetMonthStr, targetDayStr] = targetDate.split('-');
  const targetMonth = parseInt(targetMonthStr, 10) - 1; // 0-indexed
  const targetDay = parseInt(targetDayStr, 10);

  // The date picker is a div[role="button"][aria-haspopup="dialog"] with text "Select date".
  // Clicking it opens an inline calendar below it.
  const dateBtn = dialog.querySelector<HTMLElement>('[role="button"][aria-haspopup="dialog"]');
  if (!dateBtn) {
    throw new Error('Date button [role="button"][aria-haspopup="dialog"] not found');
  }
  safeClick(dateBtn);
  await sleep(TIMING.STEP_DELAY);

  // Wait for calendar day buttons to appear
  // Day buttons have aria-label like "Tuesday, March 10th, 2026"
  try {
    await waitForElement({
      selector: 'button[aria-label*="2026"], button[aria-label*="2027"]',
      timeout: TIMING.ELEMENT_TIMEOUT,
    });
  } catch {
    throw new Error('Calendar did not open after clicking date button');
  }

  const monthNames = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ];

  // Navigate calendar to the correct month (supports both forward and backward)
  const maxAttempts = 24;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const currentMonth = getCurrentCalendarMonth();
    const targetMonthName = monthNames[targetMonth];

    log(`Calendar nav attempt ${attempt}: current=${currentMonth.month}/${currentMonth.year}, target=${targetMonthName}/${targetYear}`);

    if (
      currentMonth.month === targetMonthName &&
      currentMonth.year === targetYear
    ) {
      // We're on the right month — click the target day
      const clicked = clickDay(targetDay, targetYear);
      if (clicked) {
        await sleep(TIMING.CLICK_DELAY);
        // Calendar auto-closes after day click. Read back the date button text.
        await sleep(TIMING.CLICK_DELAY);
        const readback = dateBtn.textContent?.trim() || '';
        return readback;
      }
      throw new Error(`Day ${targetDay} button not found or disabled in calendar`);
    }

    // Determine direction: compare current vs target as month indices
    const currentMonthIdx = monthNames.indexOf(currentMonth.month);
    const currentYearNum = parseInt(currentMonth.year, 10);
    const targetYearNum = parseInt(targetYear, 10);

    const currentTotal = currentYearNum * 12 + currentMonthIdx;
    const targetTotal = targetYearNum * 12 + targetMonth;

    if (targetTotal > currentTotal) {
      // Navigate forward
      const nextBtn = document.querySelector<HTMLElement>('button[aria-label="Go to the Next Month"]');
      if (!nextBtn) {
        throw new Error('Calendar "Go to the Next Month" button not found');
      }
      safeClick(nextBtn);
    } else {
      // Navigate backward
      const prevBtn = document.querySelector<HTMLElement>('button[aria-label="Go to the Previous Month"]');
      if (!prevBtn) {
        throw new Error('Calendar "Go to the Previous Month" button not found');
      }
      safeClick(prevBtn);
    }
    await sleep(TIMING.CLICK_DELAY);
  }

  throw new Error(`Could not navigate calendar to ${targetDate} after ${maxAttempts} attempts`);
}

function getCurrentCalendarMonth(): { month: string; year: string } {
  // Day buttons have aria-label like "Tuesday, March 10th, 2026"
  // Read the first enabled day button to determine current month
  const dayBtns = document.querySelectorAll<HTMLButtonElement>(
    'button[aria-label*="2026"], button[aria-label*="2027"], button[aria-label*="2028"]',
  );
  for (const btn of dayBtns) {
    const label = btn.getAttribute('aria-label') || '';
    // Parse "Tuesday, March 10th, 2026"
    const match = label.match(/,\s*(\w+)\s+\d+/);
    const yearMatch = label.match(/(\d{4})/);
    if (match && yearMatch) {
      return { month: match[1].toLowerCase(), year: yearMatch[1] };
    }
  }
  return { month: '', year: '' };
}

function clickDay(day: number, year: string): boolean {
  // Day buttons have aria-label like "Tuesday, March 10th, 2026"
  // Find the button whose aria-label contains the target day and year
  const dayBtns = document.querySelectorAll<HTMLButtonElement>('button');

  for (const btn of dayBtns) {
    const label = btn.getAttribute('aria-label') || '';
    const text = btn.textContent?.trim();

    if (
      text === String(day) &&
      label.includes(year) &&
      !btn.disabled &&
      btn.offsetParent !== null
    ) {
      safeClick(btn);
      return true;
    }
  }
  return false;
}

// ── Time Selection ──

async function setTimeSelect(dialog: HTMLElement, hour: number): Promise<string> {
  const displayTime = formatDisplayTime(hour);

  // DA uses a native <select> with options: "", "Select time", "12 AM".."11 PM"
  const selects = dialog.querySelectorAll<HTMLSelectElement>('select');
  for (const select of selects) {
    let isTimeSelect = false;
    for (let i = 0; i < select.options.length; i++) {
      const optText = select.options[i].text.trim();
      if (optText.includes('AM') || optText.includes('PM') || optText === 'Select time') {
        isTimeSelect = true;
        break;
      }
    }

    if (isTimeSelect) {
      // Find the matching time option
      for (let j = 0; j < select.options.length; j++) {
        if (select.options[j].text.trim() === displayTime) {
          // Use React-compatible value setting
          const nativeSetter = Object.getOwnPropertyDescriptor(
            HTMLSelectElement.prototype,
            'value',
          )?.set;
          if (nativeSetter) {
            nativeSetter.call(select, select.options[j].value);
          } else {
            select.selectedIndex = j;
          }
          select.dispatchEvent(new Event('input', { bubbles: true }));
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return displayTime;
        }
      }
      // Partial match — try case-insensitive
      const displayLower = displayTime.toLowerCase();
      for (let j = 0; j < select.options.length; j++) {
        if (select.options[j].text.trim().toLowerCase() === displayLower) {
          select.selectedIndex = j;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return select.options[j].text.trim();
        }
      }
      throw new Error(`Time option "${displayTime}" not found in <select>`);
    }
  }

  throw new Error('Time <select> not found in schedule dialog');
}

// ── Error Dialog Dismissal ──

async function dismissErrorDialog(): Promise<void> {
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
  if (!dialog) return;

  const text = dialog.textContent?.toLowerCase() || '';
  if (text.includes('invalid') || text.includes('error')) {
    const dismissBtn =
      findButton('OK', dialog) ??
      findButton('Close', dialog);
    if (dismissBtn) {
      safeClick(dismissBtn);
      await sleep(TIMING.CLICK_DELAY);
    }
  }
}

// ── Schedule Banner ──

/**
 * Find the green schedule confirmation banner on the submit page.
 * After Confirm Schedule, DA shows something like:
 *   "Scheduled to submit automatically on March 19, 2026 at 2:00 AM"
 * Returns the banner text if found, or null.
 */
function findScheduleBanner(): string | null {
  // Walk all text nodes looking for "Scheduled to submit".
  // Skip <script>/<style> tags — DA embeds schedule text in SSR script data too.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent?.trim() || '';
    if (text.includes('Scheduled to submit')) {
      const parent = walker.currentNode.parentElement;
      if (parent && parent.tagName !== 'SCRIPT' && parent.tagName !== 'STYLE') {
        return parent?.textContent?.trim() || text;
      }
    }
  }
  return null;
}

// ── Helpers ──

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Simple console logger for schedule debugging. */
function log(msg: string): void {
  console.log(`[DSH:schedule] ${msg}`);
}
