/**
 * Mapper interface — all mappers implement this contract.
 *
 * Mappers are runtime DOM scrapers that capture live page state
 * and translate it into typed data structures in the Store.
 */

import type { IEventBus } from '../events/event-bus';
import type { EventMap } from '../events/event-types';
import type { IStore } from '../state/store';
import type { ILogger } from '../logger/logger.interface';

// ── Mapper Types ──

export type MapperType =
  | 'page-state'      // Captures current page items, pagination, selection
  | 'mutation'        // Watches DOM changes in real-time
  | 'initial-load'    // First-time setup (galleries, tiers, presets)
  | 'refresh'         // User-triggered rescan with diff
  | 'cross-page'      // Walks all pagination pages
  | 'submit-page';    // Submit page form state

// ── Mapper Context ──

export interface MapperContext {
  store: IStore;
  eventBus: IEventBus<EventMap>;
  logger: ILogger;
}

// ── Mapper Interface ──

export interface IMapper {
  /** Unique identifier for this mapper instance */
  readonly id: string;

  /** Mapper type category */
  readonly type: MapperType;

  /**
   * Initialize the mapper.
   * Called once when the mapper is registered.
   * May start MutationObservers, attach event listeners, etc.
   */
  init(context: MapperContext): Promise<void>;

  /**
   * Perform a scan of the current page.
   * Extracts data from the DOM and updates the store/events.
   */
  scan(): Promise<void>;

  /**
   * Clean up — disconnect observers, remove listeners.
   * Called when the mapper is unregistered or page navigates away.
   */
  destroy(): void;
}
