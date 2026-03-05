import type { IStorageAdapter, StorageChangeCallback } from './interfaces';

/**
 * chrome.storage.local adapter.
 * Production implementation — wraps Chrome's storage API.
 */
export class ChromeStorageAdapter implements IStorageAdapter {
  async get<T>(key: string): Promise<T | undefined> {
    const result = await chrome.storage.local.get(key);
    return result[key] as T | undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  }

  async remove(key: string): Promise<void> {
    await chrome.storage.local.remove(key);
  }

  onChanged(callback: StorageChangeCallback): () => void {
    const handler = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName !== 'local') return;
      for (const [key, change] of Object.entries(changes)) {
        callback(key, change.newValue, change.oldValue);
      }
    };

    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }
}
