/**
 * Page type detection for DeviantArt pages.
 *
 * DA is an SPA — the URL changes without full page reloads.
 * This module detects the current page type from the URL and
 * can observe URL changes for re-detection.
 */

import type { PageType } from '../state/store.types';
import { URL_PATTERNS } from './selectors';

/**
 * Detect the current page type from a URL.
 */
export function detectPageType(url: string): PageType {
  if (URL_PATTERNS.submitPage.test(url)) return 'submit';
  if (URL_PATTERNS.galleriesPage.test(url)) return 'galleries';
  if (URL_PATTERNS.tierPage.test(url)) return 'tier';
  if (URL_PATTERNS.galleryPage.test(url)) return 'gallery';
  // sta.sh/0xxx is a stash item page (different domain)
  if (/sta\.sh\/[a-z0-9]+/i.test(url)) return 'stash-item';
  if (URL_PATTERNS.stashFolder.test(url)) return 'stash-folder';
  if (URL_PATTERNS.stashItem.test(url)) return 'stash-item';
  if (URL_PATTERNS.stash.test(url)) return 'stash';
  if (URL_PATTERNS.studio.test(url)) return 'studio';
  return 'other';
}

/**
 * Extract gallery ID from a gallery page URL.
 */
export function extractGalleryId(url: string): string | null {
  const match = url.match(URL_PATTERNS.galleryPage);
  return match?.[1] ?? null;
}

/**
 * Extract tier ID from a tier page URL.
 */
export function extractTierId(url: string): string | null {
  const match = url.match(URL_PATTERNS.tierPage);
  return match?.[1] ?? null;
}

/**
 * Extract deviation ID from a submit page URL.
 * URL format: /_deviation_submit/?deviationid={id}
 */
export function extractDeviationId(url: string): string | null {
  try {
    const urlObj = new URL(url, 'https://www.deviantart.com');
    return urlObj.searchParams.get('deviationid');
  } catch {
    return null;
  }
}

/**
 * Check if the current URL is a stash page (root or folder).
 */
export function isStashPage(url: string): boolean {
  return URL_PATTERNS.stash.test(url);
}

/**
 * Check if the current URL is a DA page we care about.
 */
export function isRelevantPage(url: string): boolean {
  return url.includes('deviantart.com') || url.includes('sta.sh');
}

/**
 * Observe URL changes (SPA navigation detection).
 *
 * DA uses History API for navigation — we watch both popstate
 * and intercept pushState/replaceState.
 *
 * @param callback - Called with the new URL and detected page type
 * @returns Cleanup function to remove listeners
 */
export function observeUrlChanges(
  callback: (url: string, pageType: PageType) => void,
): () => void {
  let lastUrl = window.location.href;

  const check = () => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      callback(currentUrl, detectPageType(currentUrl));
    }
  };

  // Listen for popstate (back/forward navigation)
  window.addEventListener('popstate', check);

  // Intercept pushState and replaceState
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    originalPushState(...args);
    check();
  };

  history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
    originalReplaceState(...args);
    check();
  };

  // Cleanup
  return () => {
    window.removeEventListener('popstate', check);
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
  };
}
