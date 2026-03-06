/**
 * Centralized selector registry — derived from DA_STASH_STRUCTURE.json.
 *
 * CRITICAL: Never use CSS class selectors. DA uses hashed class names
 * that change on every deploy. Only use:
 *   - ARIA roles & labels
 *   - Text content (findByText)
 *   - Structural patterns (parent-child, :has())
 *   - data-* attributes
 *   - Tag + attribute combos (a[href*=...])
 */

// ── Stash Items ──

export const ITEM_SELECTORS = {
  /** Checkbox on each stash item — DA uses plain checkboxes without aria-label */
  checkbox: 'li input[type="checkbox"]',

  /** Select-all checkbox (NOT inside an <li>) */
  selectAll: ':not(li) > * > label > input[type="checkbox"]',

  /** Item link (stash file IDs start with '0') */
  itemLink: 'a[href*="/stash/0"]',

  /** Folder link (stash folder IDs start with '2') */
  folderLink: 'a[href*="/stash/2"]',

  /** List mode item container — an <li> containing a checkbox */
  listItem: 'li:has(input[type="checkbox"])',

  /** Grid mode uses divs instead of lis */
  gridItem: 'div:has(input[type="checkbox"])',

  /** Item thumbnail (inside item container) */
  thumbnail: 'img',

  /** Tag element */
  tag: '[data-tagname]',
} as const;

// ── Toolbar ──

export const TOOLBAR_SELECTORS = {
  /** Menu container (React portal on body) */
  menu: '[role="menu"]',

  /** Menu item inside a dropdown */
  menuItem: '[role="menuitem"]',

  /** Dialog container (React portal on body) */
  dialog: '[role="dialog"], [role="alertdialog"]',

  /** Combobox listbox (dropdown options) */
  listbox: '[role="listbox"]',

  /** Listbox option */
  option: '[role="option"]',

  /** Rich text editor */
  richEditor: '[contenteditable="true"][role="textbox"]',

  /** Tab list and tabs */
  tabList: '[role="tablist"]',
  tab: '[role="tab"]',
} as const;

// ── Pagination ──

export const PAGINATION_SELECTORS = {
  firstPage: 'button[aria-label="First page"]',
  previousPage: 'button[aria-label="Previous page"]',
  nextPage: 'button[aria-label="Next page"]',
  lastPage: 'button[aria-label="Last page"]',
} as const;

// ── Patterns ──

export const PATTERNS = {
  /** Pagination text: "1 - 50 of 527" */
  paginationTotal: /(\d+)\s*-\s*(\d+)\s*of\s*(\d+)/,

  /** Selection count: "5 Selected" */
  selectionCount: /(\d+)\s*Selected/,

  /** Submit button: "Submit N Deviation(s)" */
  submitButton: /Submit\s+(\d+)\s+Deviation/,

  /** Date in stash item: "Jan 15" or "Jan 15, 2026" */
  itemDate: /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d/,

  /** Scheduled date with time: "May 7, 09:00 AM" — the time component (HH:MM AM/PM) indicates this is a scheduled publish, not just an upload date */
  scheduledDateWithTime: /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{1,2}:\d{2}\s*(AM|PM)/i,

  /** View count on item */
  viewCount: /(\d+)\s*View/,

  /** Deviation count on gallery/tier card: "4 deviations" */
  deviationCount: /^(\d+)\s*deviations?$/i,

  /** Schedule time format (24hr options) */
  scheduleTime: /^\d{1,2}\s*(AM|PM)$/i,
} as const;

// ── URL Patterns ──

export const URL_PATTERNS = {
  /** Match stash root or folder */
  stash: /deviantart\.com\/stash(\/|$)/,

  /** Match stash item page */
  stashItem: /\/stash\/0[a-z0-9]+/i,

  /** Match stash folder page */
  stashFolder: /\/stash\/2[a-z0-9]+/i,

  /** Match submit/edit page */
  submitPage: /\/_deviation_submit\//,

  /** Match studio pages */
  studio: /deviantart\.com\/studio/,

  /** Match gallery page */
  galleryPage: /\/studio\/published\/([a-zA-Z0-9-]+)/,

  /** Match tier page */
  tierPage: /\/studio\/tier\/([a-zA-Z0-9-]+)\/deviations/,

  /** Match galleries management page */
  galleriesPage: /\/studio\/published\/galleries/,
} as const;

// ── Toolbar Button Names ──

export const TOOLBAR_BUTTONS = {
  edit: 'Edit',
  labelOptions: 'Label options',
  moreActions: 'More actions',
  cancel: 'Cancel',
  saveChanges: 'Save Changes',
  schedule: 'Schedule',
} as const;

// ── Edit Dropdown Menu Items ──

export const EDIT_MENU_ITEMS = {
  title: 'Title',
  tags: 'Tags',
  description: 'Description',
  gallery: 'Gallery',
  subscriptionTier: 'Subscription tier',
  displayOptions: 'Display options',
  license: 'License',
  commenting: 'Commenting',
  deviationDetails: 'Deviation details',
  presetTemplate: 'Preset template',
} as const;

// ── Label Options Menu Items ──

export const LABEL_OPTIONS = {
  addAiLabel: 'Add Created using AI label',
  removeAiLabel: 'Remove Created using AI label',
  addNoAi: 'Add NoAI label',
  removeNoAi: 'Remove NoAI label',
  addMature: 'Add Mature label',
  removeMature: 'Remove Mature label',
} as const;

// ── Confirmation Patterns ──

export const CONFIRMATION_BUTTONS = {
  /** Confirmation button text patterns */
  updateAll: /Update All/,
  deleteAll: /Delete All/,
  confirm: /Confirm/,
  confirmSchedule: 'Confirm Schedule',
} as const;

// ── Gallery/Tier Page ──

export const CONFIG_PAGE_SELECTORS = {
  /** Gallery link pattern */
  galleryLink: 'a[href*="/studio/published/"]',

  /** Tier link pattern */
  tierLink: 'a[href*="/studio/tier/"]',

  /** Create new gallery button */
  createGallery: 'Create New Gallery',

  /** Create new tier button */
  createTier: 'Create New Tier',
} as const;

// ── Schedule Dialog ──

export const SCHEDULE_SELECTORS = {
  /** Time select dropdown label */
  timeSelectLabel: 'Select time',

  /** Confirm schedule button */
  confirmButton: 'Confirm Schedule',

  /** Cancel button */
  cancelButton: 'Cancel',
} as const;
