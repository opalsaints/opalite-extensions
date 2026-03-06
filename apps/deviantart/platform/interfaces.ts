/**
 * Platform adapter interfaces.
 * All Chrome API access goes through these interfaces.
 * Implementations: chrome-*.adapter.ts (production), memory/mock (testing).
 */

import type { ExtensionMessage } from '../shared/types';

// ── Storage ──

export interface IStorageAdapter {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  onChanged(callback: StorageChangeCallback): () => void;
}

export type StorageChangeCallback = (
  key: string,
  newValue: unknown,
  oldValue: unknown,
) => void;

// ── Messaging ──

export interface IMessagingAdapter {
  /** Send a message to the service worker (from content script) or broadcast */
  send(message: ExtensionMessage): Promise<unknown>;

  /** Listen for incoming messages */
  onMessage(
    handler: (message: ExtensionMessage, respond: (data: unknown) => void, senderTabId?: number) => void,
  ): () => void;

  /** Send a message to a specific tab's content script */
  sendToTab(tabId: number, message: ExtensionMessage): Promise<unknown>;
}

// ── Tabs ──

export interface ITabsAdapter {
  create(options: { url: string; active?: boolean }): Promise<{ id: number }>;
  update(tabId: number, options: { url?: string; active?: boolean }): Promise<void>;
  remove(tabId: number): Promise<void>;
  get(tabId: number): Promise<TabInfo>;
  getCurrent(): Promise<TabInfo | null>;
  onUpdated(callback: (tabId: number, changeInfo: { url?: string; status?: string }) => void): () => void;
  onRemoved(callback: (tabId: number) => void): () => void;
}

export interface TabInfo {
  id: number;
  url?: string;
  title?: string;
  status?: string;
}
