/**
 * CrossPageMapper — walks all pagination pages to build a complete inventory.
 *
 * Triggered by user action ("Scan entire stash").
 * Delegates to the service worker which opens a background tab and
 * walks all pages there — the user's live tab is undisturbed.
 *
 * Supports cancellation via AbortController.
 */

import type { IMapper, MapperContext } from './mapper.interface';
import type { StashItem } from '../state/store.types';
import { actions } from '../state/actions';

export class CrossPageMapper implements IMapper {
  readonly id = 'cross-page';
  readonly type = 'cross-page' as const;

  private context!: MapperContext;
  private abortController: AbortController | null = null;

  async init(context: MapperContext): Promise<void> {
    this.context = context;
    context.logger.info('CrossPageMapper initialized', 'CrossPageMapper');
  }

  async scan(): Promise<void> {
    const { store, eventBus, logger } = this.context;

    logger.info('Cross-page scan started (background tab)', 'CrossPageMapper');
    this.abortController = new AbortController();

    // Send the scan request to the service worker
    // The service worker opens a background tab and walks all pages
    const stashUrl = window.location.href;

    try {
      eventBus.emit('mapper:cross-page-progress', {
        current: 0,
        total: 1,
        items: [],
      });

      const result = await chrome.runtime.sendMessage({
        type: 'SCAN_ALL_PAGES',
        stashUrl,
      }) as {
        success: boolean;
        items: Array<{
          id: string;
          title: string;
          thumbnailUrl?: string;
          stashUrl: string;
          type: 'file' | 'folder';
        }>;
        error?: string;
      };

      if (this.abortController?.signal.aborted) {
        logger.info('Cross-page scan cancelled', 'CrossPageMapper');
        return;
      }

      if (!result?.success) {
        logger.error(`Cross-page scan failed: ${result?.error}`, 'CrossPageMapper');
        return;
      }

      // Convert to StashItem format
      const allItems: StashItem[] = result.items.map((item) => ({
        id: item.id,
        title: item.title,
        thumbnailUrl: item.thumbnailUrl,
        stashUrl: item.stashUrl,
        type: item.type,
        selected: false,
      }));

      // Update store with all collected items
      store.dispatch(actions.mergeItems(allItems));

      // Emit completion
      eventBus.emit('mapper:cross-page-complete', { items: allItems });
      logger.info(`Cross-page scan complete: ${allItems.length} total items`, 'CrossPageMapper');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Cross-page scan error: ${msg}`, 'CrossPageMapper');
    }

    this.abortController = null;
  }

  /**
   * Cancel an in-progress cross-page scan.
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
      this.context.logger.info('Cross-page scan cancelled', 'CrossPageMapper');
    }
  }

  destroy(): void {
    this.cancel();
    this.context?.logger.debug('CrossPageMapper destroyed', 'CrossPageMapper');
  }
}
