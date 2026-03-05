/**
 * MutationObserver-based element waiter.
 * Waits for an element matching a CSS selector to appear in the DOM.
 * Zero Chrome dependencies.
 */

import { TIMING } from '../../shared/constants';

export interface WaitOptions {
  /** CSS selector to wait for */
  selector: string;
  /** Root element to observe (default: document.body) */
  root?: Element;
  /** Timeout in ms (default: TIMING.ELEMENT_TIMEOUT) */
  timeout?: number;
  /** If true, wait for the element to be visible (non-zero rect) */
  visible?: boolean;
}

/**
 * Wait for a single element matching the selector to appear.
 * Returns the element or throws on timeout.
 */
export function waitForElement<T extends Element = Element>(
  options: WaitOptions,
): Promise<T> {
  const { selector, root = document.body, timeout = TIMING.ELEMENT_TIMEOUT, visible = false } = options;

  return new Promise<T>((resolve, reject) => {
    // Check if already present
    const existing = root.querySelector<T>(selector);
    if (existing && (!visible || isVisible(existing))) {
      resolve(existing);
      return;
    }

    let observer: MutationObserver | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    // Set timeout
    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`waitForElement: timeout after ${timeout}ms waiting for "${selector}"`));
    }, timeout);

    // Observe mutations
    observer = new MutationObserver(() => {
      const el = root.querySelector<T>(selector);
      if (el && (!visible || isVisible(el))) {
        cleanup();
        resolve(el);
      }
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: visible, // only watch attributes if we need visibility check
    });
  });
}

/**
 * Wait for ALL elements matching the selector (at least `minCount`).
 * Useful for waiting for a list of items to populate.
 */
export function waitForElements<T extends Element = Element>(
  selector: string,
  options: {
    root?: Element;
    timeout?: number;
    minCount?: number;
  } = {},
): Promise<T[]> {
  const { root = document.body, timeout = TIMING.ELEMENT_TIMEOUT, minCount = 1 } = options;

  return new Promise<T[]>((resolve, reject) => {
    // Check if already present
    const existing = root.querySelectorAll<T>(selector);
    if (existing.length >= minCount) {
      resolve(Array.from(existing));
      return;
    }

    let observer: MutationObserver | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    timer = setTimeout(() => {
      cleanup();
      const found = root.querySelectorAll<T>(selector);
      if (found.length > 0) {
        // Partial result — return what we have
        resolve(Array.from(found));
      } else {
        reject(new Error(`waitForElements: timeout after ${timeout}ms waiting for ${minCount}x "${selector}"`));
      }
    }, timeout);

    observer = new MutationObserver(() => {
      const found = root.querySelectorAll<T>(selector);
      if (found.length >= minCount) {
        cleanup();
        resolve(Array.from(found));
      }
    });

    observer.observe(root, { childList: true, subtree: true });
  });
}

/**
 * Wait for an element to disappear from the DOM.
 * Useful for waiting for a modal to close.
 */
export function waitForElementRemoved(
  selector: string,
  options: { root?: Element; timeout?: number } = {},
): Promise<void> {
  const { root = document.body, timeout = TIMING.ELEMENT_TIMEOUT } = options;

  return new Promise<void>((resolve, reject) => {
    // Check if already gone
    if (!root.querySelector(selector)) {
      resolve();
      return;
    }

    let observer: MutationObserver | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`waitForElementRemoved: timeout after ${timeout}ms — "${selector}" still present`));
    }, timeout);

    observer = new MutationObserver(() => {
      if (!root.querySelector(selector)) {
        cleanup();
        resolve();
      }
    });

    observer.observe(root, { childList: true, subtree: true });
  });
}

// ── Helpers ──

function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}
