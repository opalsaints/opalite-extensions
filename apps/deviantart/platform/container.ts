/**
 * Dependency Injection container.
 * Assembles all adapters and injects them into all layers.
 * Each context (content script, service worker, test) gets its own factory.
 */

import type { IStorageAdapter, IMessagingAdapter, ITabsAdapter } from './interfaces';
import type { IEventBus } from '../core/events/event-bus';
import type { EventMap } from '../core/events/event-types';
import type { IStore } from '../core/state/store';
import type { ILogger } from '../core/logger/logger.interface';

import { ChromeStorageAdapter } from './chrome-storage.adapter';
import { ChromeMessagingAdapter } from './chrome-messaging.adapter';
import { ChromeTabsAdapter } from './chrome-tabs.adapter';
import { MemoryStorageAdapter } from './memory-storage.adapter';
import { MockMessagingAdapter } from './mock-messaging.adapter';
import { EventBus } from '../core/events/event-bus';
import { Store } from '../core/state/store';
import { createInitialState } from '../core/state/store.types';
import { Logger } from '../core/logger/logger';

// ── Container Interface ──

export interface Container {
  storage: IStorageAdapter;
  messaging: IMessagingAdapter;
  tabs: ITabsAdapter;
  eventBus: IEventBus<EventMap>;
  store: IStore;
  logger: ILogger;
}

// ── Content Script Container (real Chrome + real DOM) ──

export function createContentScriptContainer(): Container {
  const storage = new ChromeStorageAdapter();
  const messaging = new ChromeMessagingAdapter();
  const tabs = new ChromeTabsAdapter();
  const eventBus = new EventBus<EventMap>();
  const store = new Store(createInitialState());
  const logger = new Logger(storage, eventBus);

  return { storage, messaging, tabs, eventBus, store, logger };
}

// ── Service Worker Container (real Chrome, no DOM) ──

export function createServiceWorkerContainer(): Container {
  const storage = new ChromeStorageAdapter();
  const messaging = new ChromeMessagingAdapter();
  const tabs = new ChromeTabsAdapter();
  const eventBus = new EventBus<EventMap>();
  const store = new Store(createInitialState());
  const logger = new Logger(storage, eventBus);

  return { storage, messaging, tabs, eventBus, store, logger };
}

// ── Test Container (in-memory, no Chrome) ──

export function createTestContainer(overrides?: Partial<Container>): Container {
  const storage = new MemoryStorageAdapter();
  const messaging = new MockMessagingAdapter();
  const eventBus = new EventBus<EventMap>();
  const store = new Store(createInitialState());
  const logger = new Logger(storage, eventBus);

  const mockTabs: ITabsAdapter = {
    create: async () => ({ id: 1 }),
    update: async () => {},
    remove: async () => {},
    get: async (id) => ({ id, url: 'https://www.deviantart.com/stash/', title: 'Stash', status: 'complete' }),
    getCurrent: async () => ({ id: 1, url: 'https://www.deviantart.com/stash/', title: 'Stash', status: 'complete' }),
    onUpdated: () => () => {},
    onRemoved: () => () => {},
  };

  return {
    storage,
    messaging,
    tabs: mockTabs,
    eventBus,
    store,
    logger,
    ...overrides,
  };
}
