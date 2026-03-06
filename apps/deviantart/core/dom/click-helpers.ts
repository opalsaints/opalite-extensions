/**
 * Safe click helpers with retry and verification.
 *
 * These helpers handle DA's React-rendered UI where elements may
 * need time to become interactive, and clicks may need verification.
 */

import { TIMING } from '../../shared/constants';
import { waitForElement } from './wait-for-element';
import { findButton, findMenuItem } from './find-by-text';

/**
 * Click an element safely. Scrolls into view if needed.
 * @returns true if click was executed, false if element not found.
 */
export function safeClick(el: Element | null): boolean {
  if (!el) return false;

  // Scroll into view if off-screen
  el.scrollIntoView({ block: 'nearest', behavior: 'instant' });

  // Dispatch a real click event
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  return true;
}

/**
 * Click an element found by CSS selector.
 * Waits for the element to appear before clicking.
 */
export async function clickSelector(
  selector: string,
  options: { root?: Element; timeout?: number } = {},
): Promise<boolean> {
  try {
    const el = await waitForElement({ selector, ...options });
    return safeClick(el);
  } catch {
    return false;
  }
}

/**
 * Click a button found by its text content.
 * @param text - Button text to search for
 * @param root - Root element to search within
 */
export function clickButton(text: string, root?: Element): boolean {
  const btn = findButton(text, root);
  return safeClick(btn);
}

/**
 * Click a menu item by text.
 * Handles DA's React portal menus on document.body.
 */
export function clickMenuItem(text: string): boolean {
  const item = findMenuItem(text);
  return safeClick(item);
}

/**
 * Click a checkbox element (toggle its state).
 * Works with both native checkboxes and React-controlled ones.
 */
export function clickCheckbox(checkbox: HTMLInputElement): boolean {
  if (!checkbox) return false;

  // For React checkboxes, we need to dispatch change events
  const nativeDescriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'checked',
  );

  if (nativeDescriptor && nativeDescriptor.set) {
    nativeDescriptor.set.call(checkbox, !checkbox.checked);
  }

  checkbox.dispatchEvent(new Event('input', { bubbles: true }));
  checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  checkbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));

  return true;
}

/**
 * Click with retry — useful for elements that may need time to become interactive.
 * @param finder - Function that returns the element to click
 * @param retries - Number of retries (default: 3)
 * @param delay - Delay between retries in ms (default: TIMING.CLICK_DELAY)
 */
export async function clickWithRetry(
  finder: () => Element | null,
  options: { retries?: number; delay?: number } = {},
): Promise<boolean> {
  const { retries = 3, delay = TIMING.CLICK_DELAY } = options;

  for (let i = 0; i <= retries; i++) {
    const el = finder();
    if (el) {
      safeClick(el);
      return true;
    }
    if (i < retries) {
      await sleep(delay);
    }
  }

  return false;
}

/**
 * Click and wait — click an element, then wait for a condition.
 * Useful for "click Edit → wait for menu to appear" patterns.
 */
export async function clickAndWait(
  clickTarget: Element | null,
  waitSelector: string,
  options: { timeout?: number } = {},
): Promise<Element | null> {
  if (!safeClick(clickTarget)) return null;

  try {
    return await waitForElement({
      selector: waitSelector,
      timeout: options.timeout ?? TIMING.ELEMENT_TIMEOUT,
    });
  } catch {
    return null;
  }
}

/**
 * Hover over an element to trigger hover-state UI (like overlay buttons).
 */
export function hover(el: Element | null): boolean {
  if (!el) return false;

  el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  return true;
}

// ── Internal ──

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
