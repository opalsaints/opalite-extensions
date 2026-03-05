/**
 * Service worker entrypoint — runs in the background.
 *
 * Responsibilities:
 *   1. Create DI container (real Chrome, no DOM)
 *   2. Handle tab lifecycle (navigation, removal)
 *   3. Respond to messages from content scripts
 *   4. Manage background tabs for schedule automation
 *      (open stash item → extract deviationId → navigate to submit → run schedule)
 *
 * This file is intentionally thin — all logic lives in core/.
 */

import { createServiceWorkerContainer } from '../platform/container';
import type { ExtensionMessage, FolderNode } from '../shared/types';
import { STORAGE_KEYS, TIMING, DEFAULTS } from '../shared/constants';

// ── Boot ──

const container = createServiceWorkerContainer();
const { logger, messaging, tabs } = container;

logger.info('Service worker started', 'entrypoint');

// ── Cancellation and pause flags for bulk page-walk operations ──
let bulkCancelled = false;
let bulkPaused = false;

async function waitIfBulkPaused(): Promise<void> {
  while (bulkPaused && !bulkCancelled) {
    await sleep(500);
  }
}

// ── Message Router ──
// Route messages from content scripts.

const unsubMessage = messaging.onMessage((message: ExtensionMessage, respond, senderTabId) => {
  switch (message.type) {
    case 'CONTENT_SCRIPT_READY':
      logger.info(`Content script ready: ${message.url}`, 'entrypoint');
      respond({ type: 'PONG' });
      break;

    case 'GET_TAB_ID':
      logger.debug(`Tab ID requested — sender tab: ${senderTabId}`, 'entrypoint');
      respond({ type: 'TAB_ID_RESULT', tabId: senderTabId ?? -1 });
      break;

    case 'NAVIGATE_TO':
      logger.info(`Navigation requested: ${message.url}`, 'entrypoint');
      respond({ ok: true });
      break;

    case 'SCHEDULE_ITEM':
      // Full schedule flow: open tab → extract deviationId → submit page → fill form
      handleScheduleItem(
        message.stashUrl,
        message.targetDate,
        message.hour,
        message.setTier,
        message.tierIds,
        message.isAlreadyScheduled,
      )
        .then((result) => respond(result))
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          respond({ success: false, error: msg });
        });
      break;

    case 'DISCOVER_TIERS':
      // Open background tab to galleries page, extract tiers, return them
      handleDiscoverTiers()
        .then((result) => respond(result))
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          respond({ success: false, tiers: [], error: msg });
        });
      break;

    case 'DISCOVER_CONFIG':
      // Open background tab to galleries page, extract galleries + tiers, return both
      handleDiscoverConfig()
        .then((result) => respond(result))
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          respond({ success: false, galleries: [], tiers: [], error: msg });
        });
      break;

    case 'SCAN_ALL_PAGES':
      // Open background tab, walk all stash pages, collect all items (always includes folders)
      handleScanAllPages(message.stashUrl, message.forceRefresh, message.maxDepth)
        .then((result) => respond(result))
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          respond({ success: false, items: [], error: msg });
        });
      break;

    case 'BULK_TIER_ALL_PAGES':
      // Page-walk: select all + apply tier on every page
      bulkCancelled = false;
      bulkPaused = false;
      handleBulkTierAllPages(message.tierNames, message.tierMode, message.liveTabId, message.scope, message.stashUrl, message.maxDepth)
        .then((result) => respond(result))
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          respond({ success: false, processed: 0, failed: 0, errors: [{ item: '', error: msg }] });
        });
      break;

    case 'BULK_EDIT_ALL_PAGES':
      // Page-walk: select all + apply edit on every page
      bulkCancelled = false;
      bulkPaused = false;
      handleBulkEditAllPages(
        message.field,
        message.template,
        message.editMode,
        message.itemCount,
        message.liveTabId,
        message.scope,
        message.stashUrl,
        message.maxDepth,
      )
        .then((result) => respond(result))
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          respond({ success: false, processed: 0, failed: 0, errors: [{ item: '', error: msg }] });
        });
      break;

    case 'CANCEL_BULK':
      bulkCancelled = true;
      bulkPaused = false;
      logger.info('Bulk operation cancelled by user', 'SW');
      respond({ ok: true });
      break;

    case 'PAUSE_BULK':
      bulkPaused = true;
      logger.info('Bulk operation paused', 'SW');
      respond({ ok: true });
      break;

    case 'RESUME_BULK':
      bulkPaused = false;
      logger.info('Bulk operation resumed', 'SW');
      respond({ ok: true });
      break;

    case 'SET_BADGE':
      chrome.action.setBadgeText({ text: message.text });
      chrome.action.setBadgeBackgroundColor({ color: message.color });
      respond({ ok: true });
      break;

    case 'CLEAR_BADGE':
      chrome.action.setBadgeText({ text: '' });
      respond({ ok: true });
      break;

    default:
      break;
  }
});

// ── Tab Lifecycle ──

const unsubTabUpdated = tabs.onUpdated((tabId, changeInfo) => {
  if (changeInfo.url && changeInfo.url.includes('deviantart.com/stash')) {
    logger.debug(`Stash tab updated: ${tabId} → ${changeInfo.url}`, 'entrypoint');
  }
});

const unsubTabRemoved = tabs.onRemoved((tabId) => {
  logger.debug(`Tab removed: ${tabId}`, 'entrypoint');
});

// ── Schedule Item Flow ──
// Opens a background tab, extracts the deviationId, navigates to the
// submit page, then tells the content script to fill the schedule form.

async function handleScheduleItem(
  stashUrl: string,
  targetDate: string,
  hour: number,
  setTier: boolean,
  tierIds: string[],
  isAlreadyScheduled: boolean,
): Promise<{ success: boolean; error?: string; dateReadback?: string; timeSelected?: string }> {
  logger.info(`Schedule item: ${stashUrl} → ${targetDate} ${hour}:00 (${isAlreadyScheduled ? 'reschedule' : 'fresh'})`, 'SW');

  // Build the full sta.sh URL if we only have a path
  const fullUrl = stashUrl.startsWith('http')
    ? stashUrl
    : `https://sta.sh/${stashUrl.replace(/^\/stash\//, '')}`;

  // Step 1: Open background tab to the stash item page
  const { id: tabId } = await tabs.create({ url: fullUrl, active: false });
  logger.debug(`Opened background tab ${tabId}: ${fullUrl}`, 'SW');

  try {
    // Step 2: Wait for page to load
    await waitForTabComplete(tabId, 15000);

    // Step 3: Wait for content script to be ready
    await waitForContentScript(tabId, 10000);

    // Step 4: Extract deviationId from the stash item page
    const extractResult = await messaging.sendToTab(tabId, { type: 'EXTRACT_DEVIATION_ID' }) as {
      deviationId: string | null;
    };

    const deviationId = extractResult?.deviationId;
    if (!deviationId) {
      throw new Error('Could not extract deviationId from stash page');
    }
    logger.info(`Extracted deviationId: ${deviationId}`, 'SW');

    // Step 5: Navigate the tab to the submit page
    const submitUrl = `https://www.deviantart.com/_deviation_submit/?deviationid=${deviationId}`;
    await tabs.update(tabId, { url: submitUrl });

    // Step 6: Wait for submit page to load and verify URL
    await waitForTabComplete(tabId, 15000);

    // Verify we actually landed on the submit page
    const tab = await tabs.get(tabId);
    if (!tab.url?.includes('_deviation_submit') || !tab.url?.includes(deviationId)) {
      throw new Error(
        `Submit page URL mismatch: expected deviationid=${deviationId}, got ${tab.url}`,
      );
    }
    logger.debug(`Submit page loaded: ${tab.url}`, 'SW');

    await waitForContentScript(tabId, 10000);

    // Step 7: Tell the content script on the submit page to fill the schedule form
    const scheduleResult = await messaging.sendToTab(tabId, {
      type: 'RUN_SCHEDULE',
      targetDate,
      hour,
      setTier,
      tierIds,
      isAlreadyScheduled,
    }) as { success: boolean; error?: string; dateReadback?: string; timeSelected?: string };

    if (!scheduleResult?.success) {
      throw new Error(scheduleResult?.error || 'Schedule form automation failed');
    }

    logger.info(
      `Schedule confirmed for ${deviationId}: date="${scheduleResult.dateReadback}", time="${scheduleResult.timeSelected}"`,
      'SW',
    );

    // Step 8: Wait before closing — let DA process the schedule server-side
    await sleep(2000);

    // Step 9: Clean up — close the background tab
    try { await tabs.remove(tabId); } catch { /* tab might already be closed */ }

    return {
      success: true,
      dateReadback: scheduleResult.dateReadback,
      timeSelected: scheduleResult.timeSelected,
    };
  } catch (err) {
    // Clean up tab on failure
    try { await tabs.remove(tabId); } catch { /* ignore */ }

    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Schedule item failed: ${msg}`, 'SW');
    return { success: false, error: msg };
  }
}

// ── Discover Tiers Flow ──
// Opens a background tab to the galleries page, extracts tiers from the DOM,
// saves them to storage, and returns them.

interface TierData {
  id: string;
  name: string;
  deviationCount: number;
  url: string;
}

async function handleDiscoverTiers(): Promise<{ success: boolean; tiers: TierData[]; error?: string }> {
  logger.info('Discovering tiers via background tab', 'SW');

  const galleriesUrl = 'https://www.deviantart.com/studio/published/galleries';
  const { id: tabId } = await tabs.create({ url: galleriesUrl, active: false });

  try {
    await waitForTabComplete(tabId, 15000);
    await waitForContentScript(tabId, 10000);

    const result = await messaging.sendToTab(tabId, { type: 'EXTRACT_TIERS' }) as {
      tiers: TierData[];
    };

    const tiers = result?.tiers ?? [];
    logger.info(`Discovered ${tiers.length} tiers`, 'SW');

    // Persist to storage so they're available immediately next time
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEYS.USER_CONFIG);
      const config = stored[STORAGE_KEYS.USER_CONFIG] ?? {};
      config.tiers = tiers;
      config.timestamp = Date.now();
      await chrome.storage.local.set({ [STORAGE_KEYS.USER_CONFIG]: config });
    } catch (err) {
      logger.error(`Failed to save tiers to storage: ${err}`, 'SW');
    }

    // Clean up
    try { await tabs.remove(tabId); } catch { /* ignore */ }

    return { success: true, tiers };
  } catch (err) {
    try { await tabs.remove(tabId); } catch { /* ignore */ }
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Tier discovery failed: ${msg}`, 'SW');
    return { success: false, tiers: [], error: msg };
  }
}

// ── Discover Config Flow (galleries + tiers in one trip) ──

interface GalleryData {
  id: string;
  name: string;
  deviationCount: number;
  isPremium: boolean;
  isDefault: boolean;
  url: string;
}

async function handleDiscoverConfig(): Promise<{
  success: boolean;
  galleries: GalleryData[];
  tiers: TierData[];
  error?: string;
}> {
  logger.info('Discovering galleries + tiers via background tab', 'SW');

  const galleriesUrl = 'https://www.deviantart.com/studio/published/galleries';
  const { id: tabId } = await tabs.create({ url: galleriesUrl, active: false });

  try {
    await waitForTabComplete(tabId, 15000);
    await waitForContentScript(tabId, 10000);

    const result = await messaging.sendToTab(tabId, { type: 'EXTRACT_CONFIG' }) as {
      galleries: GalleryData[];
      tiers: TierData[];
    };

    const galleries = result?.galleries ?? [];
    const tiers = result?.tiers ?? [];
    logger.info(`Discovered ${galleries.length} galleries, ${tiers.length} tiers`, 'SW');

    // Persist both to storage
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEYS.USER_CONFIG);
      const config = stored[STORAGE_KEYS.USER_CONFIG] ?? {};
      config.galleries = galleries;
      config.tiers = tiers;
      config.timestamp = Date.now();
      await chrome.storage.local.set({ [STORAGE_KEYS.USER_CONFIG]: config });
    } catch (err) {
      logger.error(`Failed to save config to storage: ${err}`, 'SW');
    }

    // Clean up
    try { await tabs.remove(tabId); } catch { /* ignore */ }

    return { success: true, galleries, tiers };
  } catch (err) {
    try { await tabs.remove(tabId); } catch { /* ignore */ }
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Config discovery failed: ${msg}`, 'SW');
    return { success: false, galleries: [], tiers: [], error: msg };
  }
}

// ── Scan All Pages Flow ──
// Opens a background tab to the stash URL, walks all pagination pages,
// extracts items from each, and returns the complete inventory.

interface StashItemData {
  id: string;
  title: string;
  thumbnailUrl?: string;
  stashUrl: string;
  type: 'file' | 'folder';
}

interface FolderCardData {
  id: string;
  name: string;
  url: string;
  itemCount: number;
}

/**
 * Scan one folder/root level: walk all pagination pages to collect items.
 * Reuses the SAME tab — caller must have already navigated to startUrl.
 */
async function scanPagesAtLevel(
  tabId: number,
  levelName: string,
): Promise<StashItemData[]> {
  const items: StashItemData[] = [];
  let pageNum = 1;

  while (true) {
    const result = await messaging.sendToTab(tabId, { type: 'EXTRACT_STASH_PAGE' }) as {
      items: StashItemData[];
      pagination: { currentPage: number; totalPages: number; totalItems: number };
    };

    const pageItems = result?.items ?? [];
    const pagination = result?.pagination ?? { currentPage: 1, totalPages: 1, totalItems: 0 };

    for (const item of pageItems) {
      if (!items.some((e) => e.id === item.id)) {
        items.push(item);
      }
    }

    logger.info(`${levelName} page ${pageNum}/${pagination.totalPages}: ${pageItems.length} items (${items.length} total)`, 'SW');

    if (pageNum >= pagination.totalPages) break;

    const clickResult = await messaging.sendToTab(tabId, { type: 'CLICK_NEXT_PAGE' }) as { clicked: boolean };
    if (!clickResult?.clicked) break;

    await sleep(2000);
    pageNum++;
    if (pageNum > 100) break;
  }

  return items;
}

/**
 * Extract folder cards from the current page via content script.
 */
async function extractFolderCardsFromTab(tabId: number): Promise<FolderCardData[]> {
  const result = await messaging.sendToTab(tabId, { type: 'EXTRACT_FOLDER_CARDS' }) as {
    folders: FolderCardData[];
  };
  return result?.folders ?? [];
}

/**
 * Recursively scan folder tree, collecting all file items from all levels.
 */
async function buildFolderTree(
  tabId: number,
  folderCards: FolderCardData[],
  depth: number,
  maxDepth: number,
  parentPath: string,
): Promise<{
  allItems: StashItemData[];
  tree: FolderNode[];
}> {
  if (depth > maxDepth || folderCards.length === 0) {
    return { allItems: [], tree: [] };
  }

  const allItems: StashItemData[] = [];
  const tree: FolderNode[] = [];

  for (const folder of folderCards) {
    if (bulkCancelled) break;

    const folderPath = parentPath ? `${parentPath} > ${folder.name}` : folder.name;
    logger.info(`Scanning folder: ${folderPath} (depth ${depth})`, 'SW');

    // Navigate to folder
    await chrome.tabs.update(tabId, { url: folder.url });
    await waitForTabComplete(tabId, 15000);
    await waitForContentScript(tabId, 10000);

    // Walk all pages in this folder
    const items = await scanPagesAtLevel(tabId, folderPath);

    // Collect file items only
    for (const item of items) {
      if (item.type === 'file' && !allItems.some((e) => e.id === item.id)) {
        allItems.push(item);
      }
    }

    // Navigate back to folder root to extract sub-folder cards
    await chrome.tabs.update(tabId, { url: folder.url });
    await waitForTabComplete(tabId, 15000);
    await waitForContentScript(tabId, 10000);

    const subFolders = await extractFolderCardsFromTab(tabId);

    // Recurse into sub-folders
    const childResult = await buildFolderTree(tabId, subFolders, depth + 1, maxDepth, folderPath);
    allItems.push(...childResult.allItems);

    tree.push({
      id: folder.id,
      name: folder.name,
      url: folder.url,
      itemCount: folder.itemCount,
      children: childResult.tree,
    });
  }

  return { allItems, tree };
}

async function handleScanAllPages(
  stashUrl: string,
  forceRefresh?: boolean,
  maxDepth?: number,
): Promise<{
  success: boolean;
  items: StashItemData[];
  folderTree?: FolderNode[];
  totalWithFolders?: number;
  error?: string;
}> {
  // Check inventory cache first (unless forced refresh)
  if (!forceRefresh) {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEYS.FULL_INVENTORY);
      const cached = stored[STORAGE_KEYS.FULL_INVENTORY];
      if (cached && cached.items && cached.lastScan) {
        const age = Date.now() - cached.lastScan;
        if (age < DEFAULTS.INVENTORY_CACHE_TTL_MS) {
          logger.info(`Returning cached inventory: ${cached.items.length} items (${Math.round(age / 1000)}s old)`, 'SW');
          return {
            success: true,
            items: cached.items,
            folderTree: cached.folderTree,
            totalWithFolders: cached.totalWithFolders,
          };
        }
        logger.info(`Inventory cache expired (${Math.round(age / 1000)}s old) — rescanning`, 'SW');
      }
    } catch {
      // Storage unavailable — proceed with scan
    }
  }

  const url = stashUrl || 'https://www.deviantart.com/stash';
  logger.info(`Scanning all stash pages via background tab: ${url}`, 'SW');

  const { id: tabId } = await tabs.create({ url, active: false });

  try {
    await waitForTabComplete(tabId, 15000);
    await waitForContentScript(tabId, 10000);

    // Walk all root-level pages
    const allItems = await scanPagesAtLevel(tabId, 'Root');
    const rootFileCount = allItems.filter((i) => i.type === 'file').length;

    // Always scan folders for complete inventory
    const effectiveMaxDepth = maxDepth ?? DEFAULTS.MAX_FOLDER_DEPTH;
    logger.info(`Scanning folders (max depth ${effectiveMaxDepth})...`, 'SW');

    // Navigate back to root to extract folder cards
    await chrome.tabs.update(tabId, { url });
    await waitForTabComplete(tabId, 15000);
    await waitForContentScript(tabId, 10000);

    const rootFolders = await extractFolderCardsFromTab(tabId);
    logger.info(`Found ${rootFolders.length} root folders`, 'SW');

    let folderTree: FolderNode[] | undefined;
    let totalWithFolders: number | undefined;

    if (rootFolders.length > 0) {
      const folderResult = await buildFolderTree(tabId, rootFolders, 1, effectiveMaxDepth, '');

      // Merge folder items (deduped)
      for (const item of folderResult.allItems) {
        if (!allItems.some((e) => e.id === item.id)) {
          allItems.push(item);
        }
      }

      // Build tree with root node wrapping everything
      folderTree = [{
        id: 'root',
        name: 'Sta.sh',
        url,
        itemCount: rootFileCount,
        children: folderResult.tree,
      }];
      totalWithFolders = allItems.length;
      logger.info(`Folder scan complete: ${folderResult.allItems.length} additional items from folders`, 'SW');
    } else {
      totalWithFolders = allItems.length;
    }

    // Clean up
    try { await tabs.remove(tabId); } catch { /* ignore */ }

    logger.info(`Scan complete: ${allItems.length} items total`, 'SW');

    // Persist to cache
    try {
      await chrome.storage.local.set({
        [STORAGE_KEYS.FULL_INVENTORY]: {
          items: allItems,
          count: allItems.length,
          lastScan: Date.now(),
          folderTree,
          totalWithFolders,
        },
      });
      logger.debug(`Inventory cached: ${allItems.length} items`, 'SW');
    } catch {
      // Storage unavailable — skip caching
    }

    return { success: true, items: allItems, folderTree, totalWithFolders };
  } catch (err) {
    try { await tabs.remove(tabId); } catch { /* ignore */ }
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Scan all pages failed: ${msg}`, 'SW');
    return { success: false, items: [], error: msg };
  }
}

// ── Bulk Page-Walk Shared Infrastructure ──

interface BulkResult {
  success: boolean;
  processed: number;
  failed: number;
  errors: Array<{ item: string; error: string }>;
}

interface BulkProgressState {
  processed: number;
  failed: number;
  totalItems: number;
  totalPages: number;
  pageTimings: number[];
  pagesCompleted: number;
  currentFolder: string | undefined;
  errors: Array<{ item: string; error: string }>;
}

/**
 * Walk all pages at the current tab URL, running select-all + operation on each page.
 * Tab must already be navigated to the target URL.
 */
async function walkAndProcess(
  tabId: number,
  operationFn: (tid: number) => Promise<{ success: boolean; error?: string }>,
  liveTabId: number,
  state: BulkProgressState,
): Promise<void> {
  // Get pagination for this level
  const firstPage = await messaging.sendToTab(tabId, { type: 'EXTRACT_STASH_PAGE' }) as {
    items: StashItemData[];
    pagination: { currentPage: number; totalPages: number; totalItems: number };
  };
  const levelTotalPages = firstPage?.pagination?.totalPages ?? 1;
  let pageNum = 1;

  while (true) {
    if (bulkCancelled) break;
    await waitIfBulkPaused();

    const pageStart = Date.now();

    const pageResult = await messaging.sendToTab(tabId, { type: 'EXTRACT_STASH_PAGE' }) as {
      items: StashItemData[];
      pagination: { currentPage: number; totalPages: number; totalItems: number };
    };
    const pageItemCount = pageResult?.items?.filter((i) => i.type === 'file').length ?? 0;

    const label = state.currentFolder
      ? `${state.currentFolder} page ${pageNum}/${levelTotalPages}`
      : `Page ${pageNum}/${levelTotalPages}`;

    logger.info(`${label}: ${pageItemCount} items`, 'SW');

    if (pageItemCount > 0) {
      await flashActivate(tabId, async () => {
        const selectResult = await messaging.sendToTab(tabId, { type: 'SELECT_ALL_ON_PAGE' }) as { selected: number };
        logger.debug(`Selected ${selectResult?.selected ?? 0} items (${label})`, 'SW');

        const opResult = await operationFn(tabId);
        if (opResult?.success) {
          state.processed += pageItemCount;
          logger.info(`${label}: operation applied to ${pageItemCount} items`, 'SW');
        } else {
          state.failed += pageItemCount;
          const errMsg = opResult?.error || 'Operation failed';
          state.errors.push({ item: label, error: errMsg });
          logger.error(`${label}: operation failed — ${errMsg}`, 'SW');
        }
      });
      await sleep(TIMING.NAV_DELAY);
    }

    state.pagesCompleted++;
    state.pageTimings.push(Date.now() - pageStart);

    // Send progress
    const avgPageMs = state.pageTimings.reduce((a, b) => a + b, 0) / state.pageTimings.length;
    const remainingPages = Math.max(0, state.totalPages - state.pagesCompleted);
    const etaMs = Math.round(avgPageMs * remainingPages);

    try {
      await messaging.sendToTab(liveTabId, {
        type: 'BULK_PROGRESS',
        currentPage: state.pagesCompleted,
        totalPages: state.totalPages,
        processedItems: state.processed + state.failed,
        totalItems: state.totalItems,
        etaMs,
        currentFolder: state.currentFolder,
      });
    } catch { /* live tab may have closed */ }

    if (pageNum >= levelTotalPages) break;

    const clickResult = await messaging.sendToTab(tabId, { type: 'CLICK_NEXT_PAGE' }) as { clicked: boolean };
    if (!clickResult?.clicked) break;
    await sleep(TIMING.NAV_DELAY);
    pageNum++;
    if (pageNum > 100) break;
  }
}

/**
 * Recursively process folders: navigate to each folder, walk its pages,
 * then recurse into sub-folders.
 */
async function processFolders(
  tabId: number,
  folders: FolderCardData[],
  operationFn: (tid: number) => Promise<{ success: boolean; error?: string }>,
  liveTabId: number,
  state: BulkProgressState,
  depth: number,
  maxDepth: number,
  parentPath: string,
): Promise<void> {
  if (depth > maxDepth) return;

  for (const folder of folders) {
    if (bulkCancelled) break;
    await waitIfBulkPaused();

    const folderPath = parentPath ? `${parentPath} > ${folder.name}` : folder.name;
    state.currentFolder = folderPath;

    logger.info(`Processing folder: ${folderPath} (depth ${depth})`, 'SW');

    // Navigate to folder
    await chrome.tabs.update(tabId, { url: folder.url });
    await waitForTabComplete(tabId, 15000);
    await waitForContentScript(tabId, 10000);

    // Walk all pages in this folder
    await walkAndProcess(tabId, operationFn, liveTabId, state);

    if (bulkCancelled) break;

    // Get sub-folders for recursion
    await chrome.tabs.update(tabId, { url: folder.url });
    await waitForTabComplete(tabId, 15000);
    await waitForContentScript(tabId, 10000);

    const subFolders = await extractFolderCardsFromTab(tabId);

    if (subFolders.length > 0) {
      // Update estimates with sub-folder counts
      const subItemEstimate = subFolders.reduce((s, f) => s + f.itemCount, 0);
      state.totalPages += Math.ceil(subItemEstimate / DEFAULTS.ITEMS_PER_PAGE);
      state.totalItems += subItemEstimate;

      await processFolders(tabId, subFolders, operationFn, liveTabId, state, depth + 1, maxDepth, folderPath);
    }
  }

  // Reset folder context when leaving this level
  state.currentFolder = parentPath || undefined;
}

// ── Bulk Tier All Pages Flow ──

async function handleBulkTierAllPages(
  tierNames: string[],
  tierMode: 'add' | 'replace',
  liveTabId: number,
  scope: string,
  stashUrl: string,
  maxDepth?: number,
): Promise<BulkResult> {
  // Derive start URL and folder behavior from scope
  const startUrl = scope === 'all-stash'
    ? 'https://www.deviantart.com/stash'
    : (stashUrl || 'https://www.deviantart.com/stash');
  const includeFolders = scope === 'all-stash' || scope === 'current-recursive';

  logger.info(`Bulk tier (scope=${scope}): ${tierNames.join(', ')} (${tierMode}) at ${startUrl}${includeFolders ? ' [+folders]' : ''}`, 'SW');

  const { id: tabId } = await tabs.create({ url: startUrl, active: false });

  const state: BulkProgressState = {
    processed: 0, failed: 0, totalItems: 0, totalPages: 0,
    pageTimings: [], pagesCompleted: 0,
    currentFolder: undefined,
    errors: [],
  };

  const tierOp = (tid: number) => messaging.sendToTab(tid, {
    type: 'RUN_TIER_ON_PAGE', tierNames, mode: tierMode,
  }) as Promise<{ success: boolean; error?: string }>;

  try {
    await waitForTabComplete(tabId, 15000);
    await waitForContentScript(tabId, 10000);

    // Get root pagination for total count estimation
    const firstPage = await messaging.sendToTab(tabId, { type: 'EXTRACT_STASH_PAGE' }) as {
      items: StashItemData[]; pagination: { totalPages: number; totalItems: number };
    };
    state.totalPages = firstPage?.pagination?.totalPages ?? 1;
    state.totalItems = firstPage?.pagination?.totalItems ?? 0;

    // If including folders, estimate additional pages from folder card counts
    let rootFolders: FolderCardData[] = [];
    if (includeFolders) {
      rootFolders = await extractFolderCardsFromTab(tabId);
      const folderItemEstimate = rootFolders.reduce((s, f) => s + f.itemCount, 0);
      state.totalPages += Math.ceil(folderItemEstimate / DEFAULTS.ITEMS_PER_PAGE);
      state.totalItems += folderItemEstimate;
    }

    // Process pages at start level
    await walkAndProcess(tabId, tierOp, liveTabId, state);

    // Process folders recursively (if scope includes folders)
    if (includeFolders && !bulkCancelled && rootFolders.length > 0) {
      await processFolders(tabId, rootFolders, tierOp, liveTabId, state,
        1, maxDepth ?? DEFAULTS.MAX_FOLDER_DEPTH, '');
    }

    try { await tabs.remove(tabId); } catch { /* ignore */ }
    logger.info(`Bulk tier complete: ${state.processed} processed, ${state.failed} failed`, 'SW');
    return { success: state.failed === 0 && !bulkCancelled, processed: state.processed, failed: state.failed, errors: state.errors };
  } catch (err) {
    try { await tabs.remove(tabId); } catch { /* ignore */ }
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Bulk tier all pages failed: ${msg}`, 'SW');
    return { success: false, processed: state.processed, failed: state.failed, errors: [...state.errors, { item: '', error: msg }] };
  }
}

// ── Bulk Edit All Pages Flow ──

async function handleBulkEditAllPages(
  field: 'title' | 'description',
  template: string,
  editMode: 'prepend' | 'append' | 'replace',
  itemCount: number,
  liveTabId: number,
  scope: string,
  stashUrl: string,
  maxDepth?: number,
): Promise<BulkResult> {
  // Derive start URL and folder behavior from scope
  const startUrl = scope === 'all-stash'
    ? 'https://www.deviantart.com/stash'
    : (stashUrl || 'https://www.deviantart.com/stash');
  const includeFolders = scope === 'all-stash' || scope === 'current-recursive';

  logger.info(`Bulk edit (scope=${scope}): ${field} (${editMode}) at ${startUrl}${includeFolders ? ' [+folders]' : ''}`, 'SW');

  const { id: tabId } = await tabs.create({ url: startUrl, active: false });

  const state: BulkProgressState = {
    processed: 0, failed: 0, totalItems: 0, totalPages: 0,
    pageTimings: [], pagesCompleted: 0,
    currentFolder: undefined,
    errors: [],
  };

  const editOp = (tid: number) => messaging.sendToTab(tid, {
    type: 'RUN_EDIT_ON_PAGE', field, template, mode: editMode, itemCount,
  }) as Promise<{ success: boolean; error?: string }>;

  try {
    await waitForTabComplete(tabId, 15000);
    await waitForContentScript(tabId, 10000);

    // Get pagination at start level
    const firstPage = await messaging.sendToTab(tabId, { type: 'EXTRACT_STASH_PAGE' }) as {
      items: StashItemData[]; pagination: { totalPages: number; totalItems: number };
    };
    state.totalPages = firstPage?.pagination?.totalPages ?? 1;
    state.totalItems = firstPage?.pagination?.totalItems ?? 0;

    // If including folders, estimate additional pages
    let rootFolders: FolderCardData[] = [];
    if (includeFolders) {
      rootFolders = await extractFolderCardsFromTab(tabId);
      const folderItemEstimate = rootFolders.reduce((s, f) => s + f.itemCount, 0);
      state.totalPages += Math.ceil(folderItemEstimate / DEFAULTS.ITEMS_PER_PAGE);
      state.totalItems += folderItemEstimate;
    }

    // Process pages at start level
    await walkAndProcess(tabId, editOp, liveTabId, state);

    // Process folders recursively (if scope includes folders)
    if (includeFolders && !bulkCancelled && rootFolders.length > 0) {
      await processFolders(tabId, rootFolders, editOp, liveTabId, state,
        1, maxDepth ?? DEFAULTS.MAX_FOLDER_DEPTH, '');
    }

    try { await tabs.remove(tabId); } catch { /* ignore */ }
    logger.info(`Bulk edit complete: ${state.processed} processed, ${state.failed} failed`, 'SW');
    return { success: state.failed === 0 && !bulkCancelled, processed: state.processed, failed: state.failed, errors: state.errors };
  } catch (err) {
    try { await tabs.remove(tabId); } catch { /* ignore */ }
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Bulk edit all pages failed: ${msg}`, 'SW');
    return { success: false, processed: state.processed, failed: state.failed, errors: [...state.errors, { item: '', error: msg }] };
  }
}

// ── Flash-Activate Helper ──
// Chrome throttles inactive tabs (setTimeout min 1000ms, DOM ops may be flaky).
// Briefly activate the tab, run the operation, then switch back.

async function flashActivate<T>(
  tabId: number,
  operation: () => Promise<T>,
): Promise<T> {
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const previousTabId = activeTab?.id;

  await chrome.tabs.update(tabId, { active: true });
  await sleep(150);

  try {
    return await operation();
  } finally {
    if (previousTabId) {
      try { await chrome.tabs.update(previousTabId, { active: true }); }
      catch { /* tab may have closed */ }
    }
  }
}

// ── Tab Helpers ──

async function waitForTabComplete(tabId: number, timeout = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const tab = await tabs.get(tabId);
      if (tab.status === 'complete') return;
    } catch {
      throw new Error(`Tab ${tabId} no longer exists`);
    }
    await sleep(500);
  }
  throw new Error(`Tab ${tabId} did not complete within ${timeout}ms`);
}

async function waitForContentScript(tabId: number, timeout = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await messaging.sendToTab(tabId, { type: 'PING' }) as { type?: string };
      if (response?.type === 'PONG') return;
    } catch {
      // Content script not ready yet — keep polling
    }
    await sleep(500);
  }
  throw new Error(`Content script on tab ${tabId} not ready within ${timeout}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

logger.info('Service worker initialized', 'entrypoint');

// Export for testing
export { container };
