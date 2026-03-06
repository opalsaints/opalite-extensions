/**
 * Text-based element finder.
 *
 * DA uses hashed class names, so we frequently need to find elements
 * by their visible text content rather than by selector.
 * This module provides robust text-matching helpers.
 */

export interface FindByTextOptions {
  /** Element tag to search (default: '*') */
  tag?: string;
  /** Root element to search within (default: document.body) */
  root?: Element;
  /** If true, match must be exact (trimmed). If false, uses includes(). */
  exact?: boolean;
  /** If true, only match elements whose direct text matches (ignoring children) */
  directText?: boolean;
  /** Filter to visible elements only */
  visible?: boolean;
}

/**
 * Find the first element whose text content matches.
 * @param text - Text to search for (case-sensitive unless regex used)
 */
export function findByText(
  text: string | RegExp,
  options: FindByTextOptions = {},
): Element | null {
  const matches = findAllByText(text, options);
  return matches[0] ?? null;
}

/**
 * Find all elements whose text content matches.
 */
export function findAllByText(
  text: string | RegExp,
  options: FindByTextOptions = {},
): Element[] {
  const { tag = '*', root = document.body, exact = false, directText = false, visible = false } = options;

  const candidates = root.querySelectorAll(tag);
  const results: Element[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const el = candidates[i];
    const content = directText ? getDirectTextContent(el) : (el.textContent ?? '');
    const trimmed = content.trim();

    let matched = false;

    if (text instanceof RegExp) {
      matched = text.test(trimmed);
    } else if (exact) {
      matched = trimmed === text;
    } else {
      matched = trimmed.includes(text);
    }

    if (matched && (!visible || isElementVisible(el))) {
      results.push(el);
    }
  }

  return results;
}

/**
 * Find a button (or element with role="button") by its text content.
 * Convenience wrapper for the most common use case.
 */
export function findButton(text: string, root?: Element): HTMLElement | null {
  // Try actual buttons first
  const btn = findByText(text, {
    tag: 'button',
    root,
    exact: false,
    directText: false,
    visible: true,
  });
  if (btn) return btn as HTMLElement;

  // Try role="button" elements
  const roleButtons = (root ?? document.body).querySelectorAll('[role="button"]');
  for (let i = 0; i < roleButtons.length; i++) {
    const el = roleButtons[i] as HTMLElement;
    if (el.textContent?.trim().includes(text) && isElementVisible(el)) {
      return el;
    }
  }

  return null;
}

/**
 * Find a menu item by text within a [role="menu"] container.
 * Handles DA's React portals — menus render on document.body.
 */
export function findMenuItem(text: string): HTMLElement | null {
  const menus = document.querySelectorAll('[role="menu"]');

  // Find the active (visible, reasonably sized) menu
  for (let i = menus.length - 1; i >= 0; i--) {
    const menu = menus[i] as HTMLElement;
    const rect = menu.getBoundingClientRect();

    // Skip the tiny header +Submit menu (≤10px)
    if (rect.width <= 10 || rect.height <= 10) continue;

    // Search menu items within this menu
    const items = menu.querySelectorAll('[role="menuitem"]');
    for (let j = 0; j < items.length; j++) {
      const item = items[j] as HTMLElement;
      if (item.textContent?.trim().includes(text)) {
        return item;
      }
    }
  }

  return null;
}

/**
 * Find an option within a [role="listbox"] (combobox dropdown).
 */
export function findListboxOption(text: string, root?: Element): HTMLElement | null {
  const searchRoot = root ?? document.body;
  const options = searchRoot.querySelectorAll('[role="option"]');

  for (let i = 0; i < options.length; i++) {
    const option = options[i] as HTMLElement;
    if (option.textContent?.trim().includes(text)) {
      return option;
    }
  }

  return null;
}

// ── Internal Helpers ──

/**
 * Get only the direct text content of an element, excluding child element text.
 * Useful for disambiguating parent elements from their children.
 */
function getDirectTextContent(el: Element): string {
  let text = '';
  for (let i = 0; i < el.childNodes.length; i++) {
    const node = el.childNodes[i];
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? '';
    }
  }
  return text;
}

function isElementVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;

  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}
