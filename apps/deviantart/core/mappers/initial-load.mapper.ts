/**
 * InitialLoadMapper — captures user-specific configuration.
 *
 * Runs once on first install (or manual refresh) to populate:
 *   - Galleries (names, IDs, isPremium, isDefault)
 *   - Subscription tiers (names, IDs)
 *   - Preset templates
 *
 * Sources data from /studio/published/galleries page.
 * Results stored in chrome.storage.local for persistence.
 */

import type { IMapper, MapperContext } from './mapper.interface';
import type { Gallery, Tier } from '../state/store.types';
import { STORAGE_KEYS } from '../../shared/constants';
import { URL_PATTERNS, CONFIG_PAGE_SELECTORS, PATTERNS } from '../dom/selectors';
import { actions } from '../state/actions';

export class InitialLoadMapper implements IMapper {
  readonly id = 'initial-load';
  readonly type = 'initial-load' as const;

  private context!: MapperContext;

  async init(context: MapperContext): Promise<void> {
    this.context = context;
    context.logger.info('InitialLoadMapper initialized', 'InitialLoadMapper');
  }

  async scan(): Promise<void> {
    const { store, eventBus, logger } = this.context;

    // Only scan if we're on the galleries page
    if (!URL_PATTERNS.galleriesPage.test(window.location.href)) {
      logger.debug('Not on galleries page — loading from storage', 'InitialLoadMapper');
      await this.loadFromStorage();
      return;
    }

    try {
      logger.info('Scanning galleries and tiers from page', 'InitialLoadMapper');

      const galleries = this.extractGalleries();
      const tiers = this.extractTiers();

      // Update store
      store.dispatch(actions.setGalleries(galleries));
      store.dispatch(actions.setTiers(tiers));

      // Persist to storage
      await this.saveToStorage(galleries, tiers);

      // Emit event
      eventBus.emit('mapper:initial-load-complete', {
        galleries,
        tiers,
        presets: [],  // TODO: Presets require a separate flow (Edit → Preset template)
      });

      logger.success(
        `Captured: ${galleries.length} galleries, ${tiers.length} tiers`,
        'InitialLoadMapper',
      );
    } catch (err) {
      logger.error(`Initial load scan failed: ${err}`, 'InitialLoadMapper');
      // Fall back to stored data
      await this.loadFromStorage();
    }
  }

  destroy(): void {
    this.context?.logger.debug('InitialLoadMapper destroyed', 'InitialLoadMapper');
  }

  // ── Gallery Extraction ──

  private extractGalleries(): Gallery[] {
    const galleries: Gallery[] = [];
    const links = document.querySelectorAll(CONFIG_PAGE_SELECTORS.galleryLink);

    for (let i = 0; i < links.length; i++) {
      const link = links[i] as HTMLAnchorElement;

      // Skip tier links (they also contain /studio/published/ but then /tier/)
      if (link.href.includes('/tier/')) continue;

      // Skip navigation links (sidebar/header)
      if (!this.isGalleryCard(link)) continue;

      const gallery = this.parseGalleryCard(link);
      if (gallery) {
        galleries.push(gallery);
      }
    }

    return galleries;
  }

  private isGalleryCard(link: HTMLAnchorElement): boolean {
    // Gallery cards have child divs containing spans with name and deviation count.
    // Navigation links are typically just text.
    const spans = link.querySelectorAll('span');
    return spans.length >= 2;
  }

  private parseGalleryCard(link: HTMLAnchorElement): Gallery | null {
    // Extract gallery ID from URL: /studio/published/{galleryId}
    const urlMatch = link.href.match(URL_PATTERNS.galleryPage);
    if (!urlMatch) return null;

    const id = urlMatch[1];

    // Skip certain IDs that aren't real galleries
    if (id === 'galleries' || id === 'published') return null;

    // Extract name and deviation count from spans
    // Card structure: <a> > DIV(thumb) + DIV(optional 'Premium' badge) + DIV > <span>Name</span><span>N deviations</span>
    const spans = link.querySelectorAll('span');
    let name = '';
    let deviationCount = 0;

    for (let i = 0; i < spans.length; i++) {
      const spanText = spans[i].textContent?.trim() ?? '';

      // Check if this span is the deviation count
      const countMatch = spanText.match(PATTERNS.deviationCount);
      if (countMatch) {
        deviationCount = parseInt(countMatch[1], 10);
        continue;
      }

      // Skip "Premium" badge text
      if (spanText === 'Premium') continue;

      // The remaining span is the gallery name
      if (spanText && !name) {
        name = spanText;
      }
    }

    if (!name) return null;

    // Check if this is a premium gallery
    const isPremium = this.hasChildWithText(link, 'Premium');

    // "Featured" is the default gallery
    const isDefault = name === 'Featured';

    return {
      id,
      name,
      deviationCount,
      isPremium,
      isDefault,
      url: link.href,
    };
  }

  // ── Tier Extraction ──

  private extractTiers(): Tier[] {
    const tiers: Tier[] = [];
    const links = document.querySelectorAll(CONFIG_PAGE_SELECTORS.tierLink);

    for (let i = 0; i < links.length; i++) {
      const link = links[i] as HTMLAnchorElement;

      // Must match tier URL pattern
      const urlMatch = link.href.match(URL_PATTERNS.tierPage);
      if (!urlMatch) continue;

      // Must be a card (has span children), not just a nav link
      const spans = link.querySelectorAll('span');
      if (spans.length < 1) continue;

      const tier = this.parseTierCard(link, urlMatch[1]);
      if (tier) {
        tiers.push(tier);
      }
    }

    return tiers;
  }

  private parseTierCard(link: HTMLAnchorElement, tierId: string): Tier | null {
    const spans = link.querySelectorAll('span');
    let name = '';
    let deviationCount = 0;

    for (let i = 0; i < spans.length; i++) {
      const spanText = spans[i].textContent?.trim() ?? '';

      const countMatch = spanText.match(PATTERNS.deviationCount);
      if (countMatch) {
        deviationCount = parseInt(countMatch[1], 10);
        continue;
      }

      if (spanText && !name) {
        name = spanText;
      }
    }

    if (!name) return null;

    return {
      id: tierId,
      name,
      deviationCount,
      url: link.href,
    };
  }

  // ── Storage Helpers ──

  private async loadFromStorage(): Promise<void> {
    const { store, logger } = this.context;

    try {
      const stored = await this.getStoredConfig();

      if (stored) {
        if (stored.galleries) store.dispatch(actions.setGalleries(stored.galleries));
        if (stored.tiers) store.dispatch(actions.setTiers(stored.tiers));
        logger.info(
          `Loaded from storage: ${stored.galleries?.length ?? 0} galleries, ${stored.tiers?.length ?? 0} tiers`,
          'InitialLoadMapper',
        );
      } else {
        logger.debug('No stored config found', 'InitialLoadMapper');
      }
    } catch (err) {
      logger.error(`Failed to load from storage: ${err}`, 'InitialLoadMapper');
    }
  }

  private async saveToStorage(galleries: Gallery[], tiers: Tier[]): Promise<void> {
    try {
      // Use chrome.storage.local — accessible from content script, side panel, and service worker
      const config = { galleries, tiers, timestamp: Date.now() };
      await chrome.storage.local.set({ [STORAGE_KEYS.USER_CONFIG]: config });
    } catch (err) {
      this.context.logger.error(`Failed to save config: ${err}`, 'InitialLoadMapper');
    }
  }

  private async getStoredConfig(): Promise<{ galleries?: Gallery[]; tiers?: Tier[] } | null> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEYS.USER_CONFIG);
      return result[STORAGE_KEYS.USER_CONFIG] ?? null;
    } catch {
      // Ignore storage errors
    }
    return null;
  }

  // ── Utilities ──

  private hasChildWithText(el: Element, text: string): boolean {
    // Check direct children (not deep descendants) for text match
    for (let i = 0; i < el.children.length; i++) {
      if (el.children[i].textContent?.trim() === text) {
        return true;
      }
    }
    return false;
  }
}
