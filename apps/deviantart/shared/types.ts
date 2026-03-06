/**
 * Shared type definitions used across all layers.
 * No imports from platform, core, or Chrome APIs.
 */

// ── Folder Tree ──

export interface FolderNode {
  id: string;           // e.g. "211kxuxr3yv8"
  name: string;         // e.g. "xopo"
  url: string;          // e.g. "https://www.deviantart.com/stash/211kxuxr3yv8"
  itemCount: number;    // from "49 Deviations" text
  children: FolderNode[];
}

// ── Extension Messaging ──

export type ExtensionMessage =
  | { type: 'PING' }
  | { type: 'PONG' }
  | { type: 'NAVIGATE_TO'; url: string }
  | { type: 'GET_TAB_ID' }
  | { type: 'TAB_ID_RESULT'; tabId: number }
  | { type: 'CONTENT_SCRIPT_READY'; url: string }
  // Service worker → content script on stash item page (sta.sh)
  | { type: 'EXTRACT_DEVIATION_ID' }
  // Service worker → content script on submit page
  | { type: 'RUN_SCHEDULE'; targetDate: string; hour: number; setTier: boolean; tierIds: string[]; isAlreadyScheduled: boolean }
  // Content script (stash page) → service worker: schedule one item end-to-end
  | { type: 'SCHEDULE_ITEM'; stashUrl: string; targetDate: string; hour: number; setTier: boolean; tierIds: string[]; isAlreadyScheduled: boolean }
  // Content script → service worker: discover galleries+tiers by opening galleries page in background
  | { type: 'DISCOVER_TIERS' }
  | { type: 'DISCOVER_CONFIG' }
  // Service worker → content script on galleries page: extract galleries+tiers from DOM
  | { type: 'EXTRACT_TIERS' }
  | { type: 'EXTRACT_CONFIG' }
  // Content script → service worker: scan all stash pages in a background tab
  | { type: 'SCAN_ALL_PAGES'; stashUrl: string; forceRefresh?: boolean; maxDepth?: number }
  // Service worker → content script on stash page: extract items + pagination info
  | { type: 'EXTRACT_STASH_PAGE' }
  // Service worker → content script on stash page: extract folder cards from "Folders" section
  | { type: 'EXTRACT_FOLDER_CARDS' }
  // Service worker → content script on stash page: click next page button
  | { type: 'CLICK_NEXT_PAGE' }
  // Content script → service worker: update extension badge
  | { type: 'SET_BADGE'; text: string; color: string }
  | { type: 'CLEAR_BADGE' }
  // ── Bulk All-Pages Operations ──
  // Content script → service worker: run tier/edit on all pages via page-walk
  | { type: 'BULK_TIER_ALL_PAGES'; tierNames: string[]; tierMode: 'add' | 'replace'; liveTabId: number; scope: BulkScope; stashUrl: string; maxDepth?: number }
  | { type: 'BULK_EDIT_ALL_PAGES'; field: 'title' | 'description'; template: string; editMode: 'prepend' | 'append' | 'replace'; itemCount: number; liveTabId: number; scope: BulkScope; stashUrl: string; maxDepth?: number }
  | { type: 'CANCEL_BULK' }
  | { type: 'PAUSE_BULK' }
  | { type: 'RESUME_BULK' }
  // Service worker → content script on page-walk tab: per-page operations
  | { type: 'SELECT_ALL_ON_PAGE' }
  | { type: 'RUN_TIER_ON_PAGE'; tierNames: string[]; mode: 'add' | 'replace' }
  | { type: 'RUN_EDIT_ON_PAGE'; field: 'title' | 'description'; template: string; mode: 'prepend' | 'append' | 'replace'; itemCount: number }
  // Service worker → content script on live tab: progress updates during page-walk
  | { type: 'BULK_PROGRESS'; currentPage: number; totalPages: number; processedItems: number; totalItems: number; etaMs?: number; currentFolder?: string };

// ── Log Levels ──

export type LogLevel = 'debug' | 'info' | 'success' | 'warning' | 'error';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  context?: string;
}

// ── Bulk Scope ──

/**
 * Controls which items an operation targets.
 *
 * - `selected`          — Only the currently checked items on the page.
 * - `all-stash`         — Every item across the entire stash (root + all folders recursively).
 * - `current-level`     — All paginated pages at the current URL level (no sub-folder descent).
 * - `current-recursive` — All pages at the current URL level, plus all sub-folders recursively.
 */
export type BulkScope = 'selected' | 'all-stash' | 'current-level' | 'current-recursive';

// ── Automation Configs ──

export interface ScheduleConfig {
  startDate: string;          // ISO date string
  startHour: number;          // 0-23
  intervalMinutes: number;    // minutes between each publish
  windowStart: number;        // earliest hour (e.g. 9)
  windowEnd: number;          // latest hour (e.g. 21)
  setTier: boolean;
  tierIds: string[];
  scope?: BulkScope;
}

export interface TierConfig {
  tierIds: string[];
  mode: 'add' | 'replace';
  scope?: BulkScope;
}

export interface EditConfig {
  field: 'title' | 'description';
  template: string;           // e.g. "{filename} - watercolor #{n}"
  mode: 'prepend' | 'append' | 'replace';
  scope?: BulkScope;
}

// ── Operation Status ──

export type OperationStatus = 'idle' | 'running' | 'paused' | 'cancelled' | 'completed' | 'error';

export interface OperationProgress {
  current: number;
  total: number;
  currentItem?: string;
  status: OperationStatus;
  etaMs?: number;
}

export interface AutomationResult {
  success: boolean;
  strategyId: string;
  processed: number;
  failed: number;
  skipped: number;
  errors: Array<{ item: string; error: string }>;
  durationMs: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
