/**
 * Content script entrypoint — runs on deviantart.com pages.
 *
 * Responsibilities:
 *   1. Create DI container (real Chrome adapters + real DOM)
 *   2. Detect page type (stash, submit, gallery, etc.)
 *   3. Initialize relevant mappers
 *   4. Inject Shadow DOM sidebar UI on stash pages
 *   5. Wire automation engine
 *   6. Listen for commands from service worker
 *
 * This file is intentionally thin — all logic lives in core/ and ui/.
 */

import { createContentScriptContainer } from '../platform/container';
import { detectPageType, observeUrlChanges, isStashPage } from '../core/dom/page-detector';
import { actions } from '../core/state/actions';
import { MapperRegistry } from '../core/mappers/mapper-registry';
import { PageStateMapper } from '../core/mappers/page-state.mapper';
import { MutationMapper } from '../core/mappers/mutation.mapper';
import { InitialLoadMapper } from '../core/mappers/initial-load.mapper';
import { RefreshMapper } from '../core/mappers/refresh.mapper';
import { CrossPageMapper } from '../core/mappers/cross-page.mapper';
import { SubmitPageMapper } from '../core/mappers/submit-page.mapper';
import { ShadowDomRenderer } from '../ui/renderers/shadow-dom.renderer';
import { AppShell } from '../ui/app-shell';
import { runScheduleOnSubmitPage } from '../automation/steps/schedule-form.step';
import { openEditMenu } from '../automation/steps/open-edit-menu.step';
import { clickMenuItemStep } from '../automation/steps/click-menu-item.step';
import { selectTiers } from '../automation/steps/tier-combobox.step';
import { saveChanges } from '../automation/steps/save-changes.step';
import { fillTitle, fillDescription } from '../automation/steps/template-fill.step';
import { detectDATheme, observeDAThemeChanges } from '../core/dom/theme-detector';
import type { ExtensionMessage } from '../shared/types';
import { TIMING } from '../shared/constants';

// ── Boot ──

const container = createContentScriptContainer();
const { logger, messaging, eventBus, store } = container;

logger.info('Content script loaded', 'entrypoint');

// ── Page Detection ──

let pageType = detectPageType(window.location.href);
logger.info(`Page type: ${pageType}`, 'entrypoint');

// Update store with initial page info
store.dispatch(actions.setPageInfo({
  ...store.getState().pageInfo,
  pageType,
  url: window.location.href,
}));

// ── Messaging Bridge ──
// Listen for messages from service worker.
// Different page types handle different message types:
//   - PING: all pages (health check)
//   - EXTRACT_DEVIATION_ID: stash item pages (sta.sh/0xxx) — find deviationId in the DOM
//   - RUN_SCHEDULE: submit pages — fill the schedule form and confirm

const unsubMessage = messaging.onMessage((message: ExtensionMessage, respond) => {
  switch (message.type) {
    case 'PING':
      respond({ type: 'PONG' });
      break;

    case 'EXTRACT_DEVIATION_ID': {
      // On sta.sh pages, find the submit link that contains the deviationId
      // Prefer the specific _deviation_submit link over any generic deviationid= link
      const submitLink = document.querySelector<HTMLAnchorElement>('a[href*="_deviation_submit"][href*="deviationid="]');
      const fallbackLink = document.querySelector<HTMLAnchorElement>('a[href*="deviationid="]');
      const link = submitLink || fallbackLink;
      const href = link?.href || '';
      const match = href.match(/deviationid=([a-zA-Z0-9-]+)/);
      const deviationId = match?.[1] || null;
      logger.info(`Extracted deviationId: ${deviationId}`, 'entrypoint');
      respond({ deviationId });
      break;
    }

    case 'RUN_SCHEDULE': {
      // On submit pages, run the schedule form automation
      logger.info(`Running schedule: ${message.targetDate} ${message.hour}:00 (${message.isAlreadyScheduled ? 'reschedule' : 'fresh'})`, 'entrypoint');
      runScheduleOnSubmitPage(
        message.targetDate,
        message.hour,
        message.setTier,
        message.tierIds,
        message.isAlreadyScheduled,
      )
        .then((result) => respond(result))
        .catch((err) => {
          const errMsg = err instanceof Error ? err.message : String(err);
          logger.error(`Schedule form failed: ${errMsg}`, 'entrypoint');
          respond({ success: false, error: errMsg });
        });
      break;
    }

    case 'EXTRACT_TIERS': {
      // On galleries page, extract tiers from DOM
      logger.info('Extracting tiers from galleries page', 'entrypoint');
      const tiers = extractTiersFromPage();
      logger.info(`Found ${tiers.length} tiers`, 'entrypoint');
      respond({ tiers });
      break;
    }

    case 'EXTRACT_CONFIG': {
      // On galleries page, extract both galleries and tiers in one pass
      logger.info('Extracting galleries + tiers from page', 'entrypoint');
      const configTiers = extractTiersFromPage();
      const configGalleries = extractGalleriesFromPage();
      logger.info(`Found ${configGalleries.length} galleries, ${configTiers.length} tiers`, 'entrypoint');
      respond({ galleries: configGalleries, tiers: configTiers });
      break;
    }

    case 'EXTRACT_STASH_PAGE': {
      // On a stash page, extract all items + pagination info
      const pageItems = extractStashPageItems();
      const pagination = extractPaginationInfo();
      respond({ items: pageItems, pagination });
      break;
    }

    case 'EXTRACT_FOLDER_CARDS': {
      // Extract folder cards from the "Folders" section (NOT checkbox folder items)
      const folderCards = extractFolderCards();
      respond({ folders: folderCards });
      break;
    }

    case 'CLICK_NEXT_PAGE': {
      // On a stash page, click the Next Page button
      const nextBtn = document.querySelector('button[aria-label="Next page"]') as HTMLButtonElement | null;
      if (nextBtn && !nextBtn.disabled) {
        nextBtn.click();
        respond({ clicked: true });
      } else {
        respond({ clicked: false });
      }
      break;
    }

    case 'SELECT_ALL_ON_PAGE': {
      // Check the "Select All" checkbox on the current stash page
      (async () => {
        const selectAllCb = document.querySelector(ITEM_SELECTORS.selectAll) as HTMLInputElement | null;
        if (selectAllCb && !selectAllCb.checked) {
          selectAllCb.click();
          // Wait for DA to process the selection
          await sleepMs(TIMING.STEP_DELAY);
        }
        const count = document.querySelectorAll('li input[type="checkbox"]:checked').length;
        logger.debug(`SELECT_ALL_ON_PAGE: ${count} items checked`, 'entrypoint');
        respond({ selected: count });
      })();
      break;
    }

    case 'RUN_TIER_ON_PAGE': {
      // Run the tier automation on currently-selected items
      logger.info(`RUN_TIER_ON_PAGE: ${message.tierNames.join(', ')} (${message.mode})`, 'entrypoint');
      (async () => {
        try {
          const menuOpened = await openEditMenu();
          if (!menuOpened) { respond({ success: false, error: 'Edit menu failed to open' }); return; }

          const clicked = await clickMenuItemStep(EDIT_MENU_ITEMS.subscriptionTier);
          if (!clicked) { respond({ success: false, error: 'Subscription tier menu item not found' }); return; }

          await sleepMs(TIMING.STEP_DELAY);

          const selected = await selectTiers(message.tierNames, message.mode);
          if (selected === 0) { respond({ success: false, error: 'No tiers could be selected' }); return; }

          const saved = await saveChanges();
          respond({ success: saved, error: saved ? undefined : 'Save changes failed' });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          logger.error(`RUN_TIER_ON_PAGE failed: ${errMsg}`, 'entrypoint');
          respond({ success: false, error: errMsg });
        }
      })();
      break;
    }

    case 'RUN_EDIT_ON_PAGE': {
      // Run the edit automation on currently-selected items
      logger.info(`RUN_EDIT_ON_PAGE: ${message.field} (${message.mode})`, 'entrypoint');
      (async () => {
        try {
          const menuOpened = await openEditMenu();
          if (!menuOpened) { respond({ success: false, error: 'Edit menu failed to open' }); return; }

          const menuItem = message.field === 'title' ? EDIT_MENU_ITEMS.title : EDIT_MENU_ITEMS.description;
          const clicked = await clickMenuItemStep(menuItem);
          if (!clicked) { respond({ success: false, error: `${message.field} menu item not found` }); return; }

          await sleepMs(TIMING.STEP_DELAY);

          const templateCtx = { n: 1, total: message.itemCount, filename: '', title: '' };
          const filled = message.field === 'title'
            ? await fillTitle(message.template, templateCtx, message.mode)
            : await fillDescription(message.template, templateCtx, message.mode);

          if (!filled) { respond({ success: false, error: `Failed to fill ${message.field}` }); return; }

          const saved = await saveChanges();
          respond({ success: saved, error: saved ? undefined : 'Save changes failed' });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          logger.error(`RUN_EDIT_ON_PAGE failed: ${errMsg}`, 'entrypoint');
          respond({ success: false, error: errMsg });
        }
      })();
      break;
    }

    case 'BULK_PROGRESS': {
      // Progress update from service worker during page-walk — dispatch to store
      store.dispatch(actions.setAutomationProgress({
        current: message.processedItems,
        total: message.totalItems,
        currentItem: message.currentFolder
          ? `${message.currentFolder} — Page ${message.currentPage}/${message.totalPages}`
          : `Page ${message.currentPage}/${message.totalPages}`,
        etaMs: message.etaMs,
      }));
      respond({ ok: true });
      break;
    }

    default:
      // Unknown message — respond immediately so channel closes cleanly
      respond({ type: 'UNKNOWN' });
      break;
  }
});

// Notify service worker that content script is ready
messaging.send({ type: 'CONTENT_SCRIPT_READY', url: window.location.href }).catch(() => {
  // Service worker may not be listening yet — that's fine
});

// ── Mapper Initialization ──

const mapperRegistry = new MapperRegistry({ store, eventBus, logger });

function registerMappers(): void {
  mapperRegistry.register(new PageStateMapper());
  mapperRegistry.register(new MutationMapper());
  mapperRegistry.register(new InitialLoadMapper());
  mapperRegistry.register(new RefreshMapper());
  mapperRegistry.register(new CrossPageMapper());
  mapperRegistry.register(new SubmitPageMapper());
}

registerMappers();

// ── Navigation Serialization ──
// Version counter prevents concurrent initMappersForPage() calls from
// corrupting mapper state during rapid SPA navigations.
let navigationVersion = 0;

// Initialize mappers appropriate for the current page
async function initMappersForPage(): Promise<void> {
  const myVersion = ++navigationVersion;

  mapperRegistry.destroyAll();
  registerMappers();

  if (isStashPage(window.location.href)) {
    await mapperRegistry.initMapper('page-state');
    if (myVersion !== navigationVersion) return; // newer nav superseded us

    await mapperRegistry.initMapper('mutation');
    if (myVersion !== navigationVersion) return;

    await mapperRegistry.initMapper('refresh');
    if (myVersion !== navigationVersion) return;

    await mapperRegistry.initMapper('cross-page');
    if (myVersion !== navigationVersion) return;

    logger.info('Stash page mappers active', 'entrypoint');
  }

  // Submit page mapper
  if (pageType === 'submit') {
    await mapperRegistry.initMapper('submit-page');
    if (myVersion !== navigationVersion) return;
    logger.info('Submit page mapper active', 'entrypoint');
  }

  // Always try to load cached galleries/tiers
  await mapperRegistry.initMapper('initial-load');
}

// ── Mapper → Store Bridge ──
// Mappers emit events; we bridge them to store dispatches here.

eventBus.on('mapper:selection-changed', ({ selectedIds }) => {
  store.dispatch(actions.setSelection(selectedIds));
});

eventBus.on('mapper:mutation-detected', (diff) => {
  if (diff.added.length > 0) {
    store.dispatch(actions.mergeItems(diff.added));
  }
  if (diff.removed.length > 0) {
    store.dispatch(actions.removeItems(diff.removed));
  }
});

eventBus.on('mapper:cross-page-complete', ({ items }) => {
  store.dispatch(actions.mergeItems(items));
});

// Listen for refresh commands from UI — uses RefreshMapper with diff
eventBus.on('command:refresh', () => {
  mapperRegistry.scan('refresh');
});

// Listen for scan-all-pages command — triggers CrossPageMapper
eventBus.on('command:scan-all-pages', () => {
  mapperRegistry.scan('cross-page');
});

// ── Notification Badge ──
// Show a badge on the extension icon when an automation completes.

let badgeClearTimer: ReturnType<typeof setTimeout> | null = null;

eventBus.on('automation:completed', (result) => {
  if (badgeClearTimer) {
    clearTimeout(badgeClearTimer);
    badgeClearTimer = null;
  }

  if (result.failed > 0) {
    // Show error count in red
    messaging.send({ type: 'SET_BADGE', text: String(result.failed), color: '#f53948' }).catch(() => {});
  } else {
    // Show green checkmark briefly
    messaging.send({ type: 'SET_BADGE', text: '\u2713', color: '#00e59b' }).catch(() => {});
  }

  // Auto-clear badge after 30 seconds
  badgeClearTimer = setTimeout(() => {
    messaging.send({ type: 'CLEAR_BADGE' }).catch(() => {});
    badgeClearTimer = null;
  }, 30_000);
});

// ── UI Injection (Shadow DOM Sidebar) ──

let appShell: AppShell | null = null;
let renderer: ShadowDomRenderer | null = null;

function injectSidebar(): void {
  if (appShell) return; // Already injected

  if (isStashPage(window.location.href)) {
    renderer = new ShadowDomRenderer();
    appShell = new AppShell(renderer, container);
    appShell.init();
    logger.info('Sidebar injected', 'entrypoint');
  }
}

function removeSidebar(): void {
  if (appShell) {
    appShell.destroy();
    appShell = null;
    renderer = null;
    logger.info('Sidebar removed', 'entrypoint');
  }
}

// ── Keyboard Shortcuts ──

/** Check if focus is inside a text input (including shadow DOM inputs). */
function isFocusedOnInput(): boolean {
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if ((active as HTMLElement).isContentEditable) return true;

  // Check shadow DOM — our host element uses open mode
  const host = document.querySelector('da-stash-helper');
  const shadowActive = host?.shadowRoot?.activeElement;
  if (shadowActive) {
    const sTag = shadowActive.tagName;
    if (sTag === 'INPUT' || sTag === 'TEXTAREA' || sTag === 'SELECT') return true;
    if ((shadowActive as HTMLElement).isContentEditable) return true;
  }
  return false;
}

document.addEventListener('keydown', (e: KeyboardEvent) => {
  // Ctrl+Shift+S — toggle sidebar visibility
  if (e.ctrlKey && e.shiftKey && e.key === 'S') {
    e.preventDefault();
    if (renderer) {
      renderer.toggle();
      logger.info('Sidebar toggled via Ctrl+Shift+S', 'entrypoint');
    }
    return;
  }

  // Escape — navigate back to dashboard
  if (e.key === 'Escape') {
    if (isFocusedOnInput()) return;

    const currentRoute = store.getState().currentRoute;
    if (currentRoute.page !== 'dashboard') {
      e.preventDefault();
      store.dispatch(actions.setRoute({ page: 'dashboard' }));
      logger.info('Navigated to dashboard via Escape', 'entrypoint');
    }
    return;
  }

  // Ctrl+A — select all stash items (only on stash pages, not in text inputs)
  if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'a') {
    if (!isStashPage(window.location.href)) return;
    if (isFocusedOnInput()) return;

    e.preventDefault();
    store.dispatch(actions.selectAll());
    logger.info('Selected all items via Ctrl+A', 'entrypoint');
    return;
  }
});

// ── Theme Detection ──

const initialTheme = detectDATheme();
store.dispatch(actions.setThemeMode(initialTheme));
logger.info(`Detected DA theme: ${initialTheme}`, 'entrypoint');

// Observe DA theme changes (user toggles DA's own dark/light mode)
const unsubTheme = observeDAThemeChanges((theme) => {
  store.dispatch(actions.setThemeMode(theme));
  logger.info(`DA theme changed to: ${theme}`, 'entrypoint');
});

// ── Boot Sequence ──
// Inject sidebar first, then init mappers.
// Store.subscribe() now delivers initial values (BehaviorSubject pattern),
// so late-joining subscribers always see current state.
injectSidebar();
initMappersForPage();

// ── SPA Navigation Detection ──
// DeviantArt is an SPA — content scripts stay alive across navigations.
// Observe URL changes to re-detect page type and re-init mappers.

const unsubUrlChanges = observeUrlChanges((url, newPageType) => {
  logger.info(`SPA navigation: ${pageType} → ${newPageType} (${url})`, 'entrypoint');
  pageType = newPageType;

  store.dispatch(actions.setPageInfo({
    ...store.getState().pageInfo,
    pageType: newPageType,
    url,
    currentPage: 1, // Reset pagination on navigation
  }));

  // Re-init mappers for the new page type (serialized by version counter)
  initMappersForPage();

  // Manage sidebar visibility based on page type
  if (isStashPage(url)) {
    injectSidebar();
  } else {
    removeSidebar();
  }
});

// ── Config Extraction (for EXTRACT_TIERS / EXTRACT_CONFIG messages) ──

import { URL_PATTERNS, CONFIG_PAGE_SELECTORS, PATTERNS, ITEM_SELECTORS, EDIT_MENU_ITEMS } from '../core/dom/selectors';

function extractGalleriesFromPage(): Array<{ id: string; name: string; deviationCount: number; isPremium: boolean; isDefault: boolean; url: string }> {
  const galleries: Array<{ id: string; name: string; deviationCount: number; isPremium: boolean; isDefault: boolean; url: string }> = [];
  const links = document.querySelectorAll<HTMLAnchorElement>(CONFIG_PAGE_SELECTORS.galleryLink);

  for (const link of links) {
    // Skip tier links (they also contain /studio/published/ in ancestor URLs)
    if (link.href.includes('/tier/')) continue;

    const urlMatch = link.href.match(URL_PATTERNS.galleryPage);
    if (!urlMatch) continue;

    const galleryId = urlMatch[1];
    if (galleryId === 'galleries' || galleryId === 'published') continue;

    // Must be a card (has span children), not a nav link
    const spans = link.querySelectorAll('span');
    if (spans.length < 2) continue;

    let name = '';
    let deviationCount = 0;

    for (const span of spans) {
      const spanText = span.textContent?.trim() ?? '';
      const countMatch = spanText.match(PATTERNS.deviationCount);
      if (countMatch) {
        deviationCount = parseInt(countMatch[1], 10);
        continue;
      }
      if (spanText === 'Premium') continue;
      if (spanText && !name) {
        name = spanText;
      }
    }

    if (name) {
      const isPremium = Array.from(link.children).some(
        (child) => child.textContent?.trim() === 'Premium',
      );
      galleries.push({
        id: galleryId,
        name,
        deviationCount,
        isPremium,
        isDefault: name === 'Featured',
        url: link.href,
      });
    }
  }

  return galleries;
}

function extractTiersFromPage(): Array<{ id: string; name: string; deviationCount: number; url: string }> {
  const tiers: Array<{ id: string; name: string; deviationCount: number; url: string }> = [];
  const links = document.querySelectorAll<HTMLAnchorElement>(CONFIG_PAGE_SELECTORS.tierLink);

  for (const link of links) {
    const urlMatch = link.href.match(URL_PATTERNS.tierPage);
    if (!urlMatch) continue;

    // Must be a card (has span children), not a nav link
    const spans = link.querySelectorAll('span');
    if (spans.length < 1) continue;

    const tierId = urlMatch[1];
    let name = '';
    let deviationCount = 0;

    for (const span of spans) {
      const spanText = span.textContent?.trim() ?? '';
      const countMatch = spanText.match(PATTERNS.deviationCount);
      if (countMatch) {
        deviationCount = parseInt(countMatch[1], 10);
        continue;
      }
      if (spanText && !name) {
        name = spanText;
      }
    }

    if (name) {
      tiers.push({ id: tierId, name, deviationCount, url: link.href });
    }
  }

  return tiers;
}

// ── Stash Page Extraction (for EXTRACT_STASH_PAGE / SCAN_ALL_PAGES) ──

function extractStashPageItems(): Array<{
  id: string;
  title: string;
  thumbnailUrl?: string;
  stashUrl: string;
  type: 'file' | 'folder';
}> {
  const items: Array<{
    id: string;
    title: string;
    thumbnailUrl?: string;
    stashUrl: string;
    type: 'file' | 'folder';
  }> = [];

  const checkboxes = document.querySelectorAll(ITEM_SELECTORS.checkbox);

  for (const checkbox of checkboxes) {
    const container = checkbox.closest('li') ?? (checkbox as HTMLElement).parentElement;
    if (!container) continue;

    const stashLink = container.querySelector(ITEM_SELECTORS.itemLink) as HTMLAnchorElement | null;
    if (stashLink) {
      const urlMatch = stashLink.href.match(/\/stash\/(0[a-z0-9]+)/i);
      if (urlMatch) {
        const img = container.querySelector('img') as HTMLImageElement | null;
        items.push({
          id: urlMatch[1],
          title: img?.alt || stashLink.textContent?.trim() || 'Untitled',
          thumbnailUrl: img?.src,
          stashUrl: stashLink.href,
          type: 'file',
        });
      }
      continue;
    }

    const folderLink = container.querySelector(ITEM_SELECTORS.folderLink) as HTMLAnchorElement | null;
    if (folderLink) {
      const urlMatch = folderLink.href.match(/\/stash\/(2[a-z0-9]+)/i);
      if (urlMatch) {
        items.push({
          id: urlMatch[1],
          title: folderLink.textContent?.trim() || 'Untitled Folder',
          stashUrl: folderLink.href,
          type: 'folder',
        });
      }
    }
  }

  return items;
}

/**
 * Extract folder CARDS from the "Folders" section.
 * These are the navigable folder links (NOT checkbox folder items in the item list).
 */
function extractFolderCards(): Array<{
  id: string;
  name: string;
  url: string;
  itemCount: number;
}> {
  const folders: Array<{ id: string; name: string; url: string; itemCount: number }> = [];

  // Detect current folder ID from URL so we can skip self-referencing links
  const currentFolderMatch = window.location.href.match(/\/stash\/(2[a-z0-9]+)/i);
  const currentFolderId = currentFolderMatch?.[1];

  // Find all folder card links — <a> tags linking to /stash/2xxx
  const allFolderLinks = document.querySelectorAll('a[href*="/stash/2"]');

  for (const link of allFolderLinks) {
    const anchor = link as HTMLAnchorElement;

    // Skip if inside a checkbox list item (those are checkbox folder items, not cards)
    if (anchor.closest('li')?.querySelector('input[type="checkbox"]')) continue;

    // Skip "Create" buttons (e.g. "Create New Folder", "Create Sub Folder")
    if (anchor.textContent?.includes('Create')) continue;

    // Skip breadcrumb links (they also link to /stash/2xxx)
    if (anchor.closest('nav')) continue;

    // Skip header title links (the current folder's own title in the page header)
    if (anchor.closest('header')) continue;

    const urlMatch = anchor.href.match(/\/stash\/(2[a-z0-9]+)/i);
    if (!urlMatch) continue;

    // Skip self-referencing links (current folder linking to itself)
    if (currentFolderId && urlMatch[1] === currentFolderId) continue;

    // Deduplicate — same folder can appear multiple times
    if (folders.some((f) => f.id === urlMatch[1])) continue;

    // Extract folder name from first span with text
    let name = 'Untitled Folder';
    let itemCount = 0;

    const allSpans = anchor.querySelectorAll('span');
    for (const span of allSpans) {
      const text = span.textContent?.trim() ?? '';

      // Check for count pattern: "49 Deviations" or "1 Deviation"
      const countMatch = text.match(/(\d+)\s+Deviation/i);
      if (countMatch) {
        itemCount = parseInt(countMatch[1], 10);
        continue;
      }

      // First non-empty, non-count span is the folder name
      if (text && name === 'Untitled Folder') {
        name = text;
      }
    }

    folders.push({
      id: urlMatch[1],
      name,
      url: anchor.href,
      itemCount,
    });
  }

  return folders;
}

function extractPaginationInfo(): { currentPage: number; totalPages: number; totalItems: number } {
  const bodyText = document.body.textContent ?? '';
  const match = bodyText.match(PATTERNS.paginationTotal);

  if (match) {
    const rangeEnd = parseInt(match[2], 10);
    const totalItems = parseInt(match[3], 10);
    const itemsPerPage = 50;
    const currentPage = Math.ceil(rangeEnd / itemsPerPage);
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    return { currentPage, totalPages, totalItems };
  }

  return { currentPage: 1, totalPages: 1, totalItems: 0 };
}

// ── Helpers ──

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Export for testing
export { container, pageType };
