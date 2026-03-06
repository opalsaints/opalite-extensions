/**
 * Extension-wide constants.
 * No Chrome API imports — pure values only.
 */

export const STORAGE_KEYS = {
  USER_CONFIG: 'dsh-user-config',
  FULL_INVENTORY: 'dsh-full-inventory',
  SETTINGS: 'dsh-settings',
  LOGS: 'dsh-logs',
  OPERATION_HISTORY: 'dsh-operation-history',
  THEME_OVERRIDE: 'dsh-theme-override',
  ONBOARDING_COMPLETE: 'dsh-onboarding-complete',
} as const;

export const DEFAULTS = {
  INTERVAL_MINUTES: 120,
  WINDOW_START: 9,
  WINDOW_END: 21,
  ITEMS_PER_PAGE: 50,
  /** Cache TTL for galleries/tiers config (24 hours) */
  CONFIG_CACHE_TTL_MS: 24 * 60 * 60 * 1000,
  /** Cache TTL for full inventory scan (5 minutes) */
  INVENTORY_CACHE_TTL_MS: 5 * 60 * 1000,
  /** Maximum folder recursion depth */
  MAX_FOLDER_DEPTH: 3,
} as const;

export const TIMING = {
  /** Delay between automation steps */
  STEP_DELAY: 500,
  /** Delay after click before checking result */
  CLICK_DELAY: 300,
  /** Max time to wait for an element to appear */
  ELEMENT_TIMEOUT: 15_000,
  /** Delay between processing items */
  ITEM_DELAY: 1500,
  /** Delay after navigation */
  NAV_DELAY: 3000,
  /** Delay after page content loads (SPA) */
  SPA_DELAY: 2000,
} as const;

export const EXTENSION_NAME = 'DA Stash Helper';
export const EXTENSION_VERSION = '2.0.0';
